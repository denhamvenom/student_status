/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
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

  it("validates the in-app sign-out control without revoking auth itself", async () => {
    process.env.TIMECLOCK_OPERATOR_PIN = syntheticPin;
    const f = await fixture();
    expect(await f.coach.mutation(api.timeclockPinControl.authorizeSignOutControl, { pin: "000000" })).toEqual({ ok: false, code: "PIN_INVALID" });
    expect(await f.coach.mutation(api.timeclockPinControl.authorizeSignOutControl, { pin: syntheticPin })).toEqual({ ok: true });
  });
});
