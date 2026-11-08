/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const syntheticPin = "246810";
const priorPin = process.env.TIMECLOCK_OPERATOR_PIN;
afterEach(() => { if (priorPin === undefined) delete process.env.TIMECLOCK_OPERATOR_PIN; else process.env.TIMECLOCK_OPERATOR_PIN = priorPin; });

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const authUserId = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Synthetic Coach" });
    const actorId = await ctx.db.insert("appUsers", { authUserId, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const seasonId = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "synthetic", createdBy: actorId });
    const now = Date.now();
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId, source: "manual", sourceKey: "synthetic", title: "Synthetic Event", allDay: false, scheduledStart: now - 1000, scheduledEnd: now + 3_600_000, cancelled: false, observedAt: now, revision: 1, needsReview: false });
    const sessionId = await ctx.db.insert("timeclockSessions", { occurrenceId, seasonId, state: "open", scheduledStart: now - 1000, scheduledEnd: now + 3_600_000, effectiveEnd: now + 3_600_000, extensionMs: 0, revision: 1, openedAt: now - 1000, openedBy: actorId, needsReview: false });
    return { authUserId, sessionId };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.authUserId}|synthetic` }) };
}

describe("operator PIN", () => {
  it("rejects absent configuration without extending", async () => {
    delete process.env.TIMECLOCK_OPERATOR_PIN;
    const f = await fixture();
    const result = await f.coach.mutation(api.timeclock.extend, { sessionId: f.ids.sessionId, halfHours: 1, expectedRevision: 1, pin: syntheticPin, key: "pin-missing-1" });
    expect(result).toMatchObject({ ok: false, code: "PIN_UNCONFIGURED" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.sessionId)))?.extensionMs).toBe(0);
  });

  it("persists failed attempts and throttles the operator", async () => {
    process.env.TIMECLOCK_OPERATOR_PIN = syntheticPin;
    const f = await fixture();
    for (let i = 0; i < 5; i++) {
      const result = await f.coach.mutation(api.timeclock.extend, { sessionId: f.ids.sessionId, halfHours: 1, expectedRevision: 1, pin: "000000", key: `pin-failure-${i}-synthetic` });
      expect(result).toMatchObject({ ok: false, code: "PIN_INVALID" });
    }
    const blocked = await f.coach.mutation(api.timeclock.extend, { sessionId: f.ids.sessionId, halfHours: 1, expectedRevision: 1, pin: syntheticPin, key: "pin-correct-but-blocked" });
    expect(blocked).toMatchObject({ ok: false, code: "PIN_RATE_LIMITED" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.sessionId)))?.extensionMs).toBe(0);
  });

  it("limits wrong PINs team-wide across operator accounts on every PIN path", async () => {
    process.env.TIMECLOCK_OPERATOR_PIN = syntheticPin;
    const f = await fixture();
    const operator = async (n: number) => {
      const authUserId = await f.t.run(async ctx => {
        const email = `operator-${n}@example.invalid`;
        const id = await ctx.db.insert("users", { email, name: `Synthetic Operator ${n}` });
        await ctx.db.insert("appUsers", { authUserId: id, email, name: `Synthetic Operator ${n}`, role: "mentor", active: true, travelLead: false, financialEdit: false });
        return id;
      });
      return f.t.withIdentity({ subject: `${authUserId}|synthetic` });
    };
    // Six accounts each stay within the per-account limit (5) and together reach the team limit (30).
    for (let n = 0; n < 6; n++) {
      const client = await operator(n);
      for (let i = 0; i < 5; i++) expect(await client.mutation(api.timeclockPinControl.authorizeSignOutControl, { pin: "000000" })).toEqual({ ok: false, code: "PIN_INVALID" });
    }
    const fresh = await operator(99);
    const profileId = "synthetic-team-limit-profile";
    expect((await fresh.mutation(api.timeclock.selectConsole, { profileId, expectedRevision: 0, selectedSessionId: f.ids.sessionId })).ok).toBe(true);
    const paths = [
      ["sign-out control", () => fresh.mutation(api.timeclockPinControl.authorizeSignOutControl, { pin: syntheticPin })],
      ["extension", () => fresh.mutation(api.timeclock.extend, { sessionId: f.ids.sessionId, halfHours: 1, expectedRevision: 1, pin: syntheticPin, key: "team-limit-extend" })],
      ["group unlock", () => fresh.mutation(api.timeclock.unlockGroupClock, { profileId, sessionId: f.ids.sessionId, pin: syntheticPin })],
      ["event switch", () => fresh.mutation(api.timeclock.selectConsole, { profileId, expectedRevision: 1, pin: syntheticPin })],
    ] as const;
    for (const [label, call] of paths) expect(await call(), label).toMatchObject({ ok: false, code: "PIN_RATE_LIMITED" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.sessionId)))?.extensionMs).toBe(0);
  });

  it("validates the in-app sign-out control without revoking auth itself", async () => {
    process.env.TIMECLOCK_OPERATOR_PIN = syntheticPin;
    const f = await fixture();
    expect(await f.coach.mutation(api.timeclockPinControl.authorizeSignOutControl, { pin: "000000" })).toEqual({ ok: false, code: "PIN_INVALID" });
    expect(await f.coach.mutation(api.timeclockPinControl.authorizeSignOutControl, { pin: syntheticPin })).toEqual({ ok: true });
  });
});
