/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { MAX_GROUP_SIZE } from "./lib/timeclock";

const modules = import.meta.glob("./**/*.ts");
const MIN = 60_000;


// A session past its effective end holding more than MAX_GROUP_SIZE open intervals (all synthetic).
async function largeFixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const now = Date.now();
  const end = now - 1000;
  const start = end - 2 * 60 * MIN;
  const count = MAX_GROUP_SIZE + 25;
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "synthetic-coach@example.org", name: "Coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "synthetic-coach@example.org", name: "Coach", role: "coach", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    const students: Id<"students">[] = [];
    for (let i = 0; i < count; i++) students.push(await ctx.db.insert("students", { seasonId: season, legalName: `Student ${i}`, preferredName: `S${i}`, firstName: "Synthetic", lastName: `Student${i}`, structuredNameReviewed: true, email: `s${i}@example.org`, subteam: "Test", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }));
    const session = async (key: string) => {
      const occurrence = await ctx.db.insert("timeclockOccurrences", { seasonId: season, source: "manual", sourceKey: key, title: key, allDay: false, scheduledStart: start, scheduledEnd: end, cancelled: false, observedAt: start, revision: 1, needsReview: false });
      return await ctx.db.insert("timeclockSessions", { occurrenceId: occurrence, seasonId: season, state: "open", scheduledStart: start, scheduledEnd: end, effectiveEnd: end, extensionMs: 0, revision: 1, openedAt: start, openedBy: coach, needsReview: false });
    };
    const large = await session("large"); const control = await session("control");
    const inAt = (i: number) => start + (5 + (i % 40)) * MIN;
    for (let i = 0; i < count; i++) {
      const interval = await ctx.db.insert("timeclockIntervals", { sessionId: large, studentId: students[i], inAt: inAt(i), openedBy: coach, openCommandKey: `seed-${i}`, scheduleRevision: 1 });
      await ctx.db.insert("timeclockStudentLocks", { studentId: students[i], sessionId: large, intervalId: interval });
    }
    // Control: the same intervals for a few students in a small session, closed in one go.
    for (let i = 0; i < 5; i++) await ctx.db.insert("timeclockIntervals", { sessionId: control, studentId: students[i], inAt: inAt(i), openedBy: coach, openCommandKey: `control-${i}`, scheduleRevision: 1 });
    return { authCoach, students, large, control };
  });
  return { t, ids, end, count, coach: t.withIdentity({ subject: `${ids.authCoach}|test` }) };
}

// Runs the continuation(s) that closeSession scheduled, the way the scheduler would (one pending batch at a time).
async function runContinuations(f: Awaited<ReturnType<typeof largeFixture>>, id: Id<"timeclockSessions">) {
  let ran = 0;
  for (; ran < 10; ran++) {
    const session = await f.t.run(ctx => ctx.db.get(id));
    if (session?.state !== "open") break;
    const pending = await f.t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").collect()).filter(job => job.name.endsWith("continueClose") && job.state.kind === "pending"));
    expect(pending.length).toBeGreaterThan(0);
    await f.t.mutation(internal.timeclock.continueClose, pending[0].args[0]);
  }
  return ran;
}

const openCount = (t: Awaited<ReturnType<typeof largeFixture>>["t"], id: Id<"timeclockSessions">) => t.run(async ctx => (await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_outAt", q => q.eq("sessionId", id).eq("outAt", undefined)).take(1000)).length);

describe("closing a session with more than MAX_GROUP_SIZE open intervals", () => {
  it("closes every interval at the effective end, then marks the session closed", async () => {
    const f = await largeFixture();
    await f.t.mutation(internal.timeclock.scheduledClose, { sessionId: f.ids.large, expectedRevision: 1, expectedEnd: f.end });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.large)))?.state).toBe("open");
    expect(await runContinuations(f, f.ids.large)).toBeGreaterThan(0);

    const session = await f.t.run(ctx => ctx.db.get(f.ids.large));
    expect(session).toMatchObject({ state: "closed", closedAt: f.end, closeReason: "effective_end" });
    expect(await openCount(f.t, f.ids.large)).toBe(0);
    const closed = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_outAt", q => q.eq("sessionId", f.ids.large)).take(1000));
    expect(closed).toHaveLength(f.count);
    for (const interval of closed) expect(interval).toMatchObject({ outAt: f.end, closeReason: "effective_end" });
    const locks = await f.t.run(ctx => ctx.db.query("timeclockStudentLocks").take(1000));
    expect(locks.filter(lock => lock.sessionId !== undefined)).toHaveLength(0);
  });

  it("rejects a new clock-in after the end while batches remain, and totals match a one-shot close", async () => {
    const f = await largeFixture();
    // One lazy-close attempt: closes a first batch only. A clock-in after the effective end is refused (EXPIRED).
    const lazy = await f.coach.mutation(api.timeclock.clockOutAll, { sessionId: f.ids.large, expectedRevision: 1, key: "close-large-lazy-1" });
    expect(lazy).toMatchObject({ ok: false, code: "EXPIRED" });
    const stillOpen = await f.t.run(ctx => ctx.db.get(f.ids.large));
    if (stillOpen?.state === "open") {
      expect(await openCount(f.t, f.ids.large)).toBeGreaterThan(0);
      const lateIn = await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.large, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.students[0], intervalId: null }], key: "close-large-late-in" });
      expect(lateIn.ok).toBe(false);
    }

    await runContinuations(f, f.ids.large);
    await f.t.mutation(internal.timeclock.scheduledClose, { sessionId: f.ids.control, expectedRevision: 1, expectedEnd: f.end });

    expect((await f.t.run(ctx => ctx.db.get(f.ids.large)))?.state).toBe("closed");
    expect(await openCount(f.t, f.ids.large)).toBe(0);
    for (let i = 0; i < 5; i++) {
      const batched = await f.coach.query(api.timeclock.summary, { sessionId: f.ids.large, studentId: f.ids.students[i], asOf: Date.now() });
      const oneShot = await f.coach.query(api.timeclock.summary, { sessionId: f.ids.control, studentId: f.ids.students[i], asOf: Date.now() });
      expect(batched).not.toBeNull();
      expect({ ...batched, sessionId: null }).toEqual({ ...oneShot, sessionId: null });
    }
  });
});
