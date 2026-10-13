/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { createTest as convexTest } from "../testUtils";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { chicagoDayBounds } from "./lib/timeclock";
import { advanceTimeclockSeasonBoundary, finalizeTimeclockSeasonBoundary } from "./lib/timeclockTransition";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "synthetic-coach@example.org", name: "Coach" });
    const authMentor = await ctx.db.insert("users", { email: "synthetic-mentor@example.org", name: "Mentor" });
    const authStudent = await ctx.db.insert("users", { email: "synthetic-student@example.org", name: "Student" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "synthetic-coach@example.org", name: "Coach", role: "coach", travelLead: false, financialEdit: false, active: true });
    await ctx.db.insert("appUsers", { authUserId: authMentor, email: "synthetic-mentor@example.org", name: "Mentor", role: "mentor", travelLead: false, financialEdit: false, active: true });
    await ctx.db.insert("appUsers", { authUserId: authStudent, email: "synthetic-student@example.org", name: "Student", role: "student", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Example Student", preferredName: "Example", firstName: "Example", lastName: "Student", structuredNameReviewed: true, email: "example@example.org", subteam: "Test", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    const student2 = await ctx.db.insert("students", { seasonId: season, legalName: "Second Student", preferredName: "Second", firstName: "Second", lastName: "Student", structuredNameReviewed: true, email: "second@example.org", subteam: "Test", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    const start = Date.now() - 10 * 60_000;
    const a = await ctx.db.insert("timeclockOccurrences", { seasonId: season, source: "manual", sourceKey: "synthetic-a", title: "A", allDay: false, scheduledStart: start, scheduledEnd: start + 2 * 60 * 60_000, cancelled: false, observedAt: start, revision: 1, needsReview: false });
    const b = await ctx.db.insert("timeclockOccurrences", { seasonId: season, source: "manual", sourceKey: "synthetic-b", title: "B", allDay: false, scheduledStart: start, scheduledEnd: start + 2 * 60 * 60_000, cancelled: false, observedAt: start, revision: 1, needsReview: false });
    const base = { seasonId: season, state: "open" as const, scheduledStart: start, scheduledEnd: start + 2 * 60 * 60_000, effectiveEnd: start + 2 * 60 * 60_000, extensionMs: 0, revision: 1, openedAt: start, openedBy: coach, needsReview: false };
    const sessionA = await ctx.db.insert("timeclockSessions", { ...base, occurrenceId: a });
    const sessionB = await ctx.db.insert("timeclockSessions", { ...base, occurrenceId: b });
    return { authCoach, authMentor, authStudent, season, student, student2, sessionA, sessionB };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.authCoach}|test` }), mentor: t.withIdentity({ subject: `${ids.authMentor}|test` }), student: t.withIdentity({ subject: `${ids.authStudent}|test` }) };
}

describe("timeclock transactions", () => {
  it("denies students and allows mentors to clock reviewed students without duplicate intervals", async () => {
    const f = await fixture();
    const args = { sessionId: f.ids.sessionA, mode: "in" as const, expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "test-clock-in-0001" };
    await expect(f.student.mutation(api.timeclock.clockGroup, args)).rejects.toThrow("permission");
    const first = await f.mentor.mutation(api.timeclock.clockGroup, args);
    expect(first.ok).toBe(true);
    expect(await f.mentor.mutation(api.timeclock.clockGroup, args)).toEqual(first);
    const rows = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionA).eq("studentId", f.ids.student)).take(2));
    expect(rows).toHaveLength(1);
    const conflict = await f.coach.mutation(api.timeclock.clockGroup, { ...args, sessionId: f.ids.sessionB, key: "test-clock-in-0002" });
    expect(conflict).toMatchObject({ ok: false, code: "STALE_STUDENT" });
  });

  it("settles expired sessions at the effective end and rejects stale scheduled jobs", async () => {
    const f = await fixture();
    const inArgs = { sessionId: f.ids.sessionA, mode: "in" as const, expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "test-expire-in-01" };
    expect((await f.coach.mutation(api.timeclock.clockGroup, inArgs)).ok).toBe(true);
    const oldEnd = Date.now() - 1000;
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.sessionA, { effectiveEnd: oldEnd, revision: 2 });
      const interval = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionA).eq("studentId", f.ids.student)).unique();
      await ctx.db.patch(interval!._id, { inAt: oldEnd - 5000 });
    });
    await f.t.mutation(internal.timeclock.scheduledClose, { sessionId: f.ids.sessionA, expectedRevision: 1, expectedEnd: oldEnd });
    const stillOpen = await f.t.run(ctx => ctx.db.get(f.ids.sessionA));
    expect(stillOpen?.state).toBe("open");
    const result = await f.coach.mutation(api.timeclock.clockOutAll, { sessionId: f.ids.sessionA, expectedRevision: 2, key: "test-expire-out-01" });
    expect(result).toMatchObject({ ok: false, code: "EXPIRED" });
    const interval = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionA).eq("studentId", f.ids.student)).unique());
    expect(interval?.outAt).toBe(oldEnd);
  });

  it("requires a Coach reason for append-only correction and keeps the one-hour rule", async () => {
    const f = await fixture();
    const start = Date.now() - 2 * 60 * 60_000;
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.sessionA, { state: "closed", closedAt: start + 2 * 60 * 60_000, scheduledStart: start, scheduledEnd: start + 2 * 60 * 60_000, effectiveEnd: start + 2 * 60 * 60_000 });
      await ctx.db.insert("timeclockIntervals", { sessionId: f.ids.sessionA, studentId: f.ids.student, inAt: start, outAt: start + 30 * 60_000, openedBy: (await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.authCoach)).unique())!._id, openCommandKey: "seed", scheduleRevision: 1 });
    });
    await expect(f.mentor.mutation(api.timeclock.correctInterval, { sessionId: f.ids.sessionA, studentId: f.ids.student, kind: "add", inAt: start + 60 * 60_000, outAt: start + 90 * 60_000, reason: "Missed paper sign-in", key: "test-correct-0001" })).rejects.toThrow("permission");
    const result = await f.coach.mutation(api.timeclock.correctInterval, { sessionId: f.ids.sessionA, studentId: f.ids.student, kind: "add", inAt: start + 60 * 60_000, outAt: start + 90 * 60_000, reason: "Missed paper sign-in", key: "test-correct-0001" });
    expect(result.ok).toBe(true);
    const summary = await f.coach.query(api.timeclock.summary, { sessionId: f.ids.sessionA, studentId: f.ids.student, asOf: Date.now() });
    if (!summary) throw new Error("Expected summary");
    expect(summary.scheduledMs).toBe(60 * 60_000);
    expect(summary.qualifies).toBe(false);
  });

  it("refuses corrections and success-key replays after the session season is archived", async () => {
    const f = await fixture();
    const now = Date.now();
    await f.t.run(ctx => ctx.db.patch(f.ids.sessionA, { state: "closed", closedAt: now }));
    const args = { sessionId: f.ids.sessionA, studentId: f.ids.student, kind: "add" as const, inAt: now - 5 * 60_000, outAt: now - 4 * 60_000, reason: "Rehearsal correction", key: "archived-correction-01" };
    expect((await f.coach.mutation(api.timeclock.correctInterval, args)).ok).toBe(true);
    const oldClockCommand = { sessionId: f.ids.sessionB, expectedRevision: 1, key: "archived-clock-command" };
    expect((await f.coach.mutation(api.timeclock.clockOutAll, oldClockCommand)).ok).toBe(true);
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.season, { status: "archived", endsAt: now });
      const coach = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.authCoach)).unique();
      await ctx.db.insert("seasons", { name: "Next Synthetic Season", year: 2027, status: "active", startsAt: now + 1, permissionVersion: "test", createdBy: coach!._id });
    });
    expect(await f.coach.mutation(api.timeclock.correctInterval, args)).toMatchObject({ ok: false, code: "INVALID_SESSION" });
    expect(await f.coach.mutation(api.timeclock.clockOutAll, oldClockCommand)).toMatchObject({ ok: false, code: "FINISHED" });
    expect(await f.coach.mutation(api.timeclock.correctInterval, { ...args, key: "archived-correction-02" })).toMatchObject({ ok: false, code: "INVALID_SESSION" });
    const rows = await f.t.run(ctx => ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionA).eq("studentId", f.ids.student)).take(10));
    expect(rows).toHaveLength(1);
  });

  it("rejects an entire group when one expected state is stale", async () => {
    const f = await fixture();
    expect((await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionA, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "group-seed-000001" })).ok).toBe(true);
    const before = await f.coach.query(api.timeclock.previewGroup, { sessionId: f.ids.sessionB, studentIds: [f.ids.student, f.ids.student2] });
    expect(before.conflicts).toHaveLength(1);
    const command = await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionB, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }, { studentId: f.ids.student2, intervalId: null }], key: "group-stale-00001" });
    expect(command).toMatchObject({ ok: false, code: "STALE_STUDENT" });
    const second = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionB).eq("studentId", f.ids.student2)).take(1));
    expect(second).toHaveLength(0);
  });

  it("serializes concurrent clock-ins for the same student across events", async () => {
    const f = await fixture();
    const expected = [{ studentId: f.ids.student, intervalId: null }];
    const [a, b] = await Promise.all([
      f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionA, mode: "in", expectedRevision: 1, expected, key: "parallel-event-a-01" }),
      f.mentor.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionB, mode: "in", expectedRevision: 1, expected, key: "parallel-event-b-01" }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const active = await f.t.run(ctx => ctx.db.query("timeclockStudentLocks").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique());
    expect(active?.intervalId).toBeDefined();
    const rows = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_studentId_and_inAt", q => q.eq("studentId", f.ids.student)).take(3));
    expect(rows.filter(x => x.outAt === undefined)).toHaveLength(1);
  });

  it("transfers at one timestamp with a PIN and blocks replay with changed arguments", async () => {
    const f = await fixture();
    const oldPin = process.env.TIMECLOCK_OPERATOR_PIN;
    process.env.TIMECLOCK_OPERATOR_PIN = "synthetic-test-pin-3190";
    try {
      await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionA, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "transfer-seed-0001" });
      const preview = await f.coach.query(api.timeclock.previewGroup, { sessionId: f.ids.sessionB, studentIds: [f.ids.student] });
      if (!preview.ok) throw new Error("Expected preview");
      const expected = [{ studentId: f.ids.student, intervalId: preview.expected[0].intervalId }];
      const args = { sessionId: f.ids.sessionB, mode: "transfer" as const, expectedRevision: 1, expected, pin: "synthetic-test-pin-3190", key: "transfer-commit-01" };
      const result = await f.coach.mutation(api.timeclock.clockGroup, args);
      expect(result.ok).toBe(true);
      expect(await f.coach.mutation(api.timeclock.clockGroup, args)).toEqual(result);
      const old = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionA).eq("studentId", f.ids.student)).unique());
      const next = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionB).eq("studentId", f.ids.student)).unique());
      expect(old?.outAt).toBe(next?.inAt);
      expect(await f.coach.mutation(api.timeclock.clockGroup, { ...args, mode: "in" })).toMatchObject({ ok: false, code: "KEY_REUSED" });
    } finally { if (oldPin === undefined) delete process.env.TIMECLOCK_OPERATOR_PIN; else process.env.TIMECLOCK_OPERATOR_PIN = oldPin; }
  });

  it("confirms a mixed group by transferring the conflict and opening the free student atomically", async () => {
    const f = await fixture();
    const oldPin = process.env.TIMECLOCK_OPERATOR_PIN;
    process.env.TIMECLOCK_OPERATOR_PIN = "synthetic-test-pin-3190";
    try {
      await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionA, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "mixed-seed-000001" });
      const preview = await f.coach.query(api.timeclock.previewGroup, { sessionId: f.ids.sessionB, studentIds: [f.ids.student, f.ids.student2] });
      if (!preview.ok) throw new Error("Expected preview");
      expect(preview.conflicts).toHaveLength(1);
      const result = await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionB, mode: "transfer", expectedRevision: preview.sessionRevision, expected: preview.expected, pin: "synthetic-test-pin-3190", key: "mixed-transfer-001" });
      expect(result.ok).toBe(true);
      const rows = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_outAt", q => q.eq("sessionId", f.ids.sessionB).eq("outAt", undefined)).take(3));
      expect(rows).toHaveLength(2);
    } finally { if (oldPin === undefined) delete process.env.TIMECLOCK_OPERATOR_PIN; else process.env.TIMECLOCK_OPERATOR_PIN = oldPin; }
  });

  it("preserves extension duration and ignores the stale close job", async () => {
    const f = await fixture();
    const oldPin = process.env.TIMECLOCK_OPERATOR_PIN;
    process.env.TIMECLOCK_OPERATOR_PIN = "synthetic-test-pin-3190";
    try {
      const original = await f.t.run(ctx => ctx.db.get(f.ids.sessionA));
      const extended = await f.coach.mutation(api.timeclock.extend, { sessionId: f.ids.sessionA, halfHours: 2, expectedRevision: 1, pin: "synthetic-test-pin-3190", key: "extension-one-001" });
      expect(extended).toMatchObject({ ok: true, extensionMs: 60 * 60_000 });
      await f.t.mutation(internal.timeclock.scheduledClose, { sessionId: f.ids.sessionA, expectedRevision: 1, expectedEnd: original!.effectiveEnd });
      expect((await f.t.run(ctx => ctx.db.get(f.ids.sessionA)))?.state).toBe("open");
      const revised = await f.coach.mutation(api.timeclock.extend, { sessionId: f.ids.sessionA, halfHours: 7, expectedRevision: 2, pin: "synthetic-test-pin-3190", key: "extension-limit-01" });
      expect(revised).toMatchObject({ ok: false, code: "EXTENSION_LIMIT" });
    } finally { if (oldPin === undefined) delete process.env.TIMECLOCK_OPERATOR_PIN; else process.env.TIMECLOCK_OPERATOR_PIN = oldPin; }
  });

  it("cancels a live calendar session at detection and rejects stale generation updates", async () => {
    const f = await fixture();
    const now = Date.now();
    await f.t.run(async ctx => {
      await ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash: "synthetic-hash", timezone: "America/Chicago", generation: 2 });
      const session = await ctx.db.get(f.ids.sessionA);
      await ctx.db.patch(session!.occurrenceId, { source: "calendar", sourceKey: "synthetic-calendar-cancel" });
    });
    await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionA, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "cancel-seed-00001" });
    await expect(f.t.mutation(internal.timeclock.applyCalendarOccurrence, { sourceKey: "synthetic-calendar-cancel", title: "A", allDay: false, cancelled: true, observedAt: now, generation: 1 })).rejects.toThrow("superseded");
    const before = Date.now();
    await f.t.mutation(internal.timeclock.applyCalendarOccurrence, { sourceKey: "synthetic-calendar-cancel", title: "Untitled event", allDay: false, cancelled: true, observedAt: now, generation: 2 });
    const after = Date.now();
    const session = await f.t.run(ctx => ctx.db.get(f.ids.sessionA));
    expect(session?.state).toBe("cancelled");
    expect(session?.closedAt).toBeGreaterThanOrEqual(before);
    expect(session?.closedAt).toBeLessThanOrEqual(after);
    const interval = await f.t.run(ctx => ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionA).eq("studentId", f.ids.student)).unique());
    expect(interval?.outAt).toBe(session?.closedAt);
  });

  it("shares one all-day opening across concurrent devices", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-12T15:00:00Z"));
    try {
    const f = await fixture();
    const occurrence = await f.t.run(async ctx => {
      const session = await ctx.db.get(f.ids.sessionA);
      return await ctx.db.insert("timeclockOccurrences", { seasonId: session!.seasonId, source: "calendar", sourceKey: "synthetic-all-day", title: "All day", allDay: true, allDayStartDate: "2026-10-12", allDayEndDate: "2026-10-13", cancelled: false, observedAt: Date.now(), revision: 1, needsReview: false });
    });
    const end = Date.now() + 3 * 60 * 60_000;
    const [a, b] = await Promise.all([
      f.coach.mutation(api.timeclock.openOccurrence, { occurrenceId: occurrence, allDayEnd: end, key: "all-day-device-001" }),
      f.mentor.mutation(api.timeclock.openOccurrence, { occurrenceId: occurrence, allDayEnd: end + 60_000, key: "all-day-device-002" }),
    ]);
    const typedResult: FunctionReturnType<typeof api.timeclock.openOccurrence> = a;
    const typedSessionId: Id<"timeclockSessions"> | undefined = typedResult.sessionId;
    expect(typedSessionId).toBe(a.sessionId);
    expect(a.ok && b.ok).toBe(true);
    expect(a.sessionId).toBe(b.sessionId);
    const rows = await f.t.run(ctx => ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence)).take(2));
    expect(rows).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });

  it("selects timed events by Chicago-day overlap, including unopened multi-day events", async () => {
    const f = await fixture();
    const now = Date.now();
    const day = chicagoDayBounds(now);
    const ids = await f.t.run(async ctx => {
      const session = await ctx.db.get(f.ids.sessionA);
      const base = { seasonId: session!.seasonId, source: "manual" as const, allDay: false, cancelled: false, observedAt: now, revision: 1, needsReview: false };
      const long = await ctx.db.insert("timeclockOccurrences", { ...base, sourceKey: "long", title: "Long", scheduledStart: day.start - 2 * 86_400_000, scheduledEnd: day.end + 86_400_000 });
      const old = await ctx.db.insert("timeclockOccurrences", { ...base, sourceKey: "old", title: "Old", scheduledStart: day.start - 3 * 86_400_000, scheduledEnd: day.start - 1 });
      const future = await ctx.db.insert("timeclockOccurrences", { ...base, sourceKey: "future", title: "Future", scheduledStart: day.end + 1, scheduledEnd: day.end + 86_400_000 });
      return { long, old, future };
    });
    const events = await f.coach.query(api.timeclock.todayEvents, { asOf: now });
    expect(events.some(x => x.occurrenceId === ids.long)).toBe(true);
    expect(events.some(x => x.occurrenceId === ids.old)).toBe(false);
    expect(events.some(x => x.occurrenceId === ids.future)).toBe(false);
  });

  it("closes a moved calendar end at detection and keeps closed schedule frozen", async () => {
    const f = await fixture();
    const now = Date.now();
    await f.t.run(async ctx => {
      await ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash: "synthetic-hash", timezone: "America/Chicago", generation: 1 });
      const session = await ctx.db.get(f.ids.sessionA);
      await ctx.db.patch(session!.occurrenceId, { source: "calendar", sourceKey: "synthetic-calendar-a" });
      await ctx.db.patch(f.ids.sessionA, { extensionMs: 30 * 60_000, effectiveEnd: now + 3 * 60 * 60_000 });
    });
    await f.coach.mutation(api.timeclock.clockGroup, { sessionId: f.ids.sessionA, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "calendar-clock-001" });
    const before = Date.now();
    await f.t.mutation(internal.timeclock.applyCalendarOccurrence, { sourceKey: "synthetic-calendar-a", title: "A", allDay: false, scheduledStart: now - 10 * 60_000, scheduledEnd: now - 60_000, cancelled: false, observedAt: now, generation: 1, providerUpdatedAt: now + 1 });
    const after = Date.now();
    const session = await f.t.run(ctx => ctx.db.get(f.ids.sessionA));
    expect(session?.state).toBe("closed");
    expect(session?.closedAt).toBeGreaterThanOrEqual(before);
    expect(session?.closedAt).toBeLessThanOrEqual(after);
    expect(session?.needsReview).toBe(true);
    expect(session?.scheduledEnd).toBeGreaterThan(now);
  });

  it("preserves added extension across a future calendar end revision and ignores older provider versions", async () => {
    const f = await fixture();
    const now = Date.now();
    const original = await f.t.run(async ctx => {
      await ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash: "synthetic-hash", timezone: "America/Chicago", generation: 3 });
      const session = await ctx.db.get(f.ids.sessionA);
      await ctx.db.patch(session!.occurrenceId, { source: "calendar", sourceKey: "synthetic-future-revision", providerUpdatedAt: now });
      await ctx.db.patch(f.ids.sessionA, { extensionMs: 30 * 60_000, effectiveEnd: session!.scheduledEnd + 30 * 60_000 });
      return session!;
    });
    const nextEnd = original.scheduledEnd + 20 * 60_000;
    await f.t.mutation(internal.timeclock.applyCalendarOccurrence, { sourceKey: "synthetic-future-revision", title: "A", allDay: false, scheduledStart: original.scheduledStart, scheduledEnd: nextEnd, cancelled: false, observedAt: now, generation: 3, providerUpdatedAt: now + 10 });
    const revised = await f.t.run(ctx => ctx.db.get(f.ids.sessionA));
    expect(revised?.scheduledEnd).toBe(nextEnd);
    expect(revised?.effectiveEnd).toBe(nextEnd + 30 * 60_000);
    await f.t.mutation(internal.timeclock.applyCalendarOccurrence, { sourceKey: "synthetic-future-revision", title: "Old", allDay: false, scheduledStart: original.scheduledStart, scheduledEnd: original.scheduledEnd, cancelled: false, observedAt: now, generation: 3, providerUpdatedAt: now + 5 });
    const afterStale = await f.t.run(ctx => ctx.db.get(f.ids.sessionA));
    expect(afterStale?.scheduledEnd).toBe(nextEnd);
  });

  it("voids and replaces added correction evidence without erasing audit rows", async () => {
    const f = await fixture();
    const end = Date.now();
    const start = end - 2 * 60 * 60_000;
    await f.t.run(ctx => ctx.db.patch(f.ids.sessionA, { state: "closed", closedAt: end, scheduledStart: start, scheduledEnd: end, effectiveEnd: end }));
    const added = await f.coach.mutation(api.timeclock.correctInterval, { sessionId: f.ids.sessionA, studentId: f.ids.student, kind: "add", inAt: start, outAt: start + 45 * 60_000, reason: "Paper record reviewed", key: "correction-add-001" });
    expect(added.ok).toBe(true);
    const correctionId: Id<"timeclockCorrections"> | undefined = added.correctionId;
    if (!correctionId) throw new Error("Expected correction ID");
    const replaced = await f.coach.mutation(api.timeclock.correctInterval, { sessionId: f.ids.sessionA, studentId: f.ids.student, targetCorrectionId: correctionId, kind: "replace", inAt: start, outAt: start + 60 * 60_000, reason: "Corrected paper time", key: "correction-repl-01" });
    expect(replaced.ok).toBe(true);
    expect((await f.coach.query(api.timeclock.summary, { sessionId: f.ids.sessionA, studentId: f.ids.student, asOf: end }))?.qualifies).toBe(true);
    const voided = await f.coach.mutation(api.timeclock.correctInterval, { sessionId: f.ids.sessionA, studentId: f.ids.student, targetCorrectionId: correctionId, kind: "void", reason: "Record belonged elsewhere", key: "correction-void-01" });
    expect(voided.ok).toBe(true);
    expect((await f.coach.query(api.timeclock.summary, { sessionId: f.ids.sessionA, studentId: f.ids.student, asOf: end }))?.qualifies).toBe(false);
    const audit = await f.t.run(ctx => ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.sessionA).eq("studentId", f.ids.student)).take(10));
    expect(audit).toHaveLength(3);
    await expect(f.mentor.query(api.timeclock.correctionEvidence, { sessionId: f.ids.sessionA, studentId: f.ids.student })).rejects.toThrow("permission");
    const evidence = await f.coach.query(api.timeclock.correctionEvidence, { sessionId: f.ids.sessionA, studentId: f.ids.student });
    expect(evidence.corrections).toHaveLength(3);
    expect(evidence.corrections[0].correctionId).toBe(correctionId);
  });
  it("pauses new attendance and calendar work during transition while allowing clock-out", async () => {
    const f = await fixture();
    const input = { sessionId: f.ids.sessionA, mode: "in" as const, expectedRevision: 1, expected: [{ studentId: f.ids.student, intervalId: null }], key: "transition-clock-in-01" };
    expect((await f.coach.mutation(api.timeclock.clockGroup, input)).ok).toBe(true);
    await f.t.run(async ctx => {
      const session = await ctx.db.get(f.ids.sessionA); if (!session) throw new Error("Missing session");
      await ctx.db.insert("seasonTransitionPlans", { sourceSeasonId: session.seasonId, targetName: "Next", targetCompetitionYear: 2027, targetStartDate: "2026-08-01", targetEndDate: "2027-07-31", state: "draining", open: true, revision: 1, createdBy: session.openedBy, updatedBy: session.openedBy, createdAt: 0, updatedAt: 0, idempotencyKey: "transition-test", requestHash: "test" });
    });
    expect(await f.coach.mutation(api.timeclock.clockGroup, input)).toMatchObject({ ok: false, code: "SEASON_TRANSITION" });
    expect(await f.coach.mutation(api.timeclock.createUnscheduled, { title: "Paused", durationMs: 60000, key: "transition-new-session" })).toMatchObject({ ok: false, code: "SEASON_TRANSITION" });
    expect(await f.t.mutation(internal.calendarState.begin, { calendarIdHash: "synthetic", now: Date.now() })).toBeNull();
    expect(await f.coach.mutation(api.timeclock.clockOutAll, { sessionId: f.ids.sessionA, expectedRevision: 1, key: "transition-out-all" })).toMatchObject({ ok: true, count: 1 });
  });
  it("moves future sessionless occurrences once and invalidates old calendar refreshes at cutover", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const session = await ctx.db.get(f.ids.sessionA); if (!session) throw new Error("Missing session");
      const target = await ctx.db.insert("seasons", { name: "Next", year: 2027, status: "draft", startsAt: Date.now(), permissionVersion: "test", createdBy: session.openedBy });
      const future = await ctx.db.insert("timeclockOccurrences", { seasonId: session.seasonId, source: "calendar", sourceKey: "future-one", title: "Future", allDay: false, scheduledStart: Date.now()+86400000, scheduledEnd: Date.now()+90000000, cancelled:false, observedAt:Date.now(), revision:1, needsReview:false });
      const sync = await ctx.db.insert("timeclockCalendarSync", {key:"team",calendarIdHash:"test",timezone:"America/Chicago",generation:3,syncToken:"old"});
      await advanceTimeclockSeasonBoundary(ctx, session.seasonId, target, null, Date.now());
      expect((await ctx.db.get(future))?.seasonId).toBe(target);
      expect((await ctx.db.get(session.occurrenceId))?.seasonId).toBe(session.seasonId);
      await expect(finalizeTimeclockSeasonBoundary(ctx,session.seasonId)).rejects.toThrow("Close all");
      await ctx.db.patch(f.ids.sessionA,{state:"closed"});await ctx.db.patch(f.ids.sessionB,{state:"closed"});
      await finalizeTimeclockSeasonBoundary(ctx,session.seasonId);
      expect(await ctx.db.get(sync)).toMatchObject({generation:4});expect((await ctx.db.get(sync))?.syncToken).toBeUndefined();
    });
  });
});
