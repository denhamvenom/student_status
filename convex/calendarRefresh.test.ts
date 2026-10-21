/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const calendarId = "synthetic-calendar@example.invalid";
const accountEmail = "service@example.invalid";
const priorEnv = {
  id: process.env.TIMECLOCK_CALENDAR_ID,
  email: process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL,
  key: process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (priorEnv.id === undefined) delete process.env.TIMECLOCK_CALENDAR_ID; else process.env.TIMECLOCK_CALENDAR_ID = priorEnv.id;
  if (priorEnv.email === undefined) delete process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL; else process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = priorEnv.email;
  if (priorEnv.key === undefined) delete process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY; else process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = priorEnv.key;
});

async function syntheticPrivateKey() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const base64 = btoa(String.fromCharCode(...bytes));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Synthetic Coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const seasonId = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "synthetic", createdBy: coach });
    return { coach, auth, seasonId };
  });
  return { t, ids };
}

describe("Calendar refresh", () => {
  it("retries a 410 with full sync, reconciles missing occurrences, and stores the new token", async () => {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = accountEmail;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
    const f = await fixture();
    const now = Date.now();
    const ids = await f.t.run(async ctx => {
      const staleId = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.seasonId, source: "calendar", sourceKey: "removed-instance", title: "Removed", allDay: false, scheduledStart: now - 1000, scheduledEnd: now + 3_600_000, cancelled: false, observedAt: now - 60_000, revision: 1, needsReview: false, lastSeenGeneration: 1 });
      const staleSessionId = await ctx.db.insert("timeclockSessions", { occurrenceId: staleId, seasonId: f.ids.seasonId, state: "open", scheduledStart: now - 1000, scheduledEnd: now + 3_600_000, effectiveEnd: now + 3_600_000, extensionMs: 0, revision: 1, openedAt: now - 1000, openedBy: f.ids.coach, needsReview: false });
      return { staleId, staleSessionId };
    });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(calendarId)))).map(x => x.toString(16).padStart(2, "0")).join("");
    await f.t.mutation(internal.calendarState.begin, { calendarIdHash: hash, now: now - 120_000 });
    await f.t.run(async ctx => {
      const row = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
      await ctx.db.patch(row!._id, { syncToken: "expired-token" });
    });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
      calls.push(url.toString());
      if (url.searchParams.get("syncToken") === "expired-token") return new Response("{}", { status: 410 });
      return new Response(JSON.stringify({ items: [{ id: "new-instance", summary: "New event", status: "confirmed", start: { dateTime: new Date(now + 3_600_000).toISOString() }, end: { dateTime: new Date(now + 7_200_000).toISOString() }, updated: new Date(now).toISOString() }], nextSyncToken: "fresh-token" }), { status: 200 });
    });
    await f.t.action(internal.calendar.refresh, {});
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0]).searchParams.get("syncToken")).toBe("expired-token");
    expect(new URL(calls[1]).searchParams.has("syncToken")).toBe(false);
    const result = await f.t.run(async ctx => ({
      sync: await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique(),
      stale: await ctx.db.get(ids.staleId), session: await ctx.db.get(ids.staleSessionId),
      fresh: await ctx.db.query("timeclockOccurrences").withIndex("by_source_and_sourceKey", q => q.eq("source", "calendar").eq("sourceKey", "new-instance")).unique(),
    }));
    expect(result.sync?.syncToken).toBe("fresh-token");
    expect(result.sync?.lastError).toBeUndefined();
    expect(result.stale?.cancelled).toBe(true);
    expect(result.session?.state).toBe("cancelled");
    expect(result.fresh?.cancelled).toBe(false);
  });

  it("fences stale generations from ingestion and reconciliation", async () => {
    const f = await fixture();
    const first = await f.t.mutation(internal.calendarState.begin, { calendarIdHash: "synthetic-hash", now: 100_000 });
    const second = await f.t.mutation(internal.calendarState.begin, { calendarIdHash: "synthetic-hash", now: 160_001 });
    expect(first?.generation).toBe(1);
    expect(second?.generation).toBe(2);
    const event = { sourceKey: "instance", title: "Synthetic", allDay: false, scheduledStart: Date.now() + 3_600_000, scheduledEnd: Date.now() + 7_200_000, cancelled: false, observedAt: Date.now() };
    await expect(f.t.mutation(internal.timeclock.applyCalendarOccurrence, { ...event, generation: 1 })).rejects.toThrow("superseded");
    await expect(f.t.mutation(internal.timeclock.reconcileCalendarGeneration, { generation: 1, cursor: null, windowStart: 0 })).rejects.toThrow("superseded");
    await f.t.mutation(internal.timeclock.applyCalendarOccurrence, { ...event, generation: 2 });
    const row = await f.t.run(ctx => ctx.db.query("timeclockOccurrences").withIndex("by_source_and_sourceKey", q => q.eq("source", "calendar").eq("sourceKey", "instance")).unique());
    expect(row?.lastSeenGeneration).toBe(2);
  });
  it("allows only active Coach/Mentor manual refreshes and reports a missing configuration", async () => {
    const f = await fixture();
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    delete process.env.TIMECLOCK_CALENDAR_ID;
    const coach = f.t.withIdentity({ subject: `${f.ids.auth}|test` });
    await expect(f.t.action(api.calendar.refreshNow, {})).rejects.toThrow();
    expect(await coach.action(api.calendar.refreshNow, {})).toEqual({ status: "failed" });
    for (const role of ["student", "parent"] as const) {
      await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role }));
      await expect(coach.action(api.calendar.refreshNow, {})).rejects.toThrow("Access denied");
    }
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role: "mentor", active: false }));
    await expect(coach.action(api.calendar.refreshNow, {})).rejects.toThrow();
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: true }));
    expect(await coach.action(api.calendar.refreshNow, {})).toEqual({ status: "failed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports manual success, throttles duplicate calls, and reports failure without diagnostics", async () => {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = accountEmail;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
    const f = await fixture();
    const coach = f.t.withIdentity({ subject: `${f.ids.auth}|test` });
    let fail = false;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      if (fail) throw new Error("private internal failure detail");
      if (new URL(String(input)).origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }));
      return new Response(JSON.stringify({ items: [], nextSyncToken: "synthetic-next" }));
    });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await coach.action(api.calendar.refreshNow, {})).toEqual({ status: "refreshed" });
    const calls = fetchSpy.mock.calls.length;
    expect(await coach.action(api.calendar.refreshNow, {})).toEqual({ status: "skipped" });
    expect(fetchSpy).toHaveBeenCalledTimes(calls);
    await f.t.run(async ctx => {
      const state = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
      await ctx.db.patch(state!._id, { lastAttemptAt: Date.now() - 50_001 });
    });
    fail = true;
    expect(await coach.action(api.calendar.refreshNow, {})).toEqual({ status: "failed" });
    const status = await coach.query(api.calendarState.status, { now: Date.now() });
    expect(status.stale).toBe(true);
    expect(JSON.stringify(status)).not.toContain("private internal");
  });

  it("does no database or network work outside scheduled Chicago slots", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-08T12:00:00Z"));
    const t = convexTest(schema, modules); // No season: reaching begin would throw.
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = accountEmail;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = "synthetic-unused";
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    expect(await t.action(internal.calendar.scheduledRefresh, {})).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query("timeclockCalendarSync").take(1))).toEqual([]);
  });

});
