/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { internal } from "./_generated/api";
import schema from "./schema";
import { chicagoMidnight } from "./lib/calendarDates";

const modules = import.meta.glob("./**/*.ts");
const calendarId = "synthetic-calendar@example.invalid";
const keys = ["TIMECLOCK_CALENDAR_ID", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY", "STUDENT_STATUS_CALENDAR_WRITE_ENABLED", "CONVEX_CLOUD_URL"] as const;
const originals = Object.fromEntries(keys.map(key => [key, process.env[key]])) as Record<(typeof keys)[number], string | undefined>;
afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of keys) { if (originals[key] === undefined) delete process.env[key]; else process.env[key] = originals[key]; }
});
async function syntheticPrivateKey() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@synthetic.test", name: "Coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@synthetic.test", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Practice", type: "Team", startsAt: chicagoMidnight("2026-11-01"), endsAt: chicagoMidnight("2026-11-02"), destination: "Gym", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, calendarChoice: "create", calendarSyncState: "pending", calendarRevision: 1, calendarActorId: coach });
    return { coach, season, event };
  });
  return { t, ids };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

// Each of these used to return from `push` without recording anything, leaving the event "pending" with no later sweep.
const skipped: [string, (f: Fixture) => Promise<unknown>, RegExp][] = [
  ["the event is archived", f => f.t.run(ctx => ctx.db.patch(f.ids.event, { archived: true })), /has ended and moved to Past events/],
  ["the event belongs to an earlier season", f => f.t.run(async ctx => {
    const old = await ctx.db.insert("seasons", { name: "Older", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: f.ids.coach });
    await ctx.db.patch(f.ids.event, { seasonId: old });
  }), /belongs to a past season/],
  ["a season change is in progress", f => f.t.run(ctx => ctx.db.insert("seasonTransitionPlans", { sourceSeasonId: f.ids.season, targetName: "Next", targetCompetitionYear: 2027, targetStartDate: "2027-01-01", targetEndDate: "2027-12-31", state: "draining", open: true, revision: 0, createdBy: f.ids.coach, updatedBy: f.ids.coach, createdAt: 1, updatedAt: 1, idempotencyKey: "k", requestHash: "h" })), /season change is in progress, so this event's Team Calendar update didn't go through/],
];

describe("Calendar push never stays pending", () => {
  it.each(skipped)("records a plain-language failure when %s", async (_name, arrange, message) => {
    const f = await fixture();
    await arrange(f);
    await f.t.action(internal.eventCalendar.push, { eventId: f.ids.event, revision: 1 });
    const event = await f.t.run(ctx => ctx.db.get(f.ids.event));
    expect(event?.calendarSyncState).toBe("failed");
    expect(event?.calendarSyncError).toMatch(message);
  });

  it("leaves an event alone when a newer push owns it", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { calendarRevision: 2, archived: true }));
    await f.t.action(internal.eventCalendar.push, { eventId: f.ids.event, revision: 1 });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.event))).toMatchObject({ calendarSyncState: "pending", calendarRevision: 2 });
  });

  it("does not overwrite a state a newer push already settled", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { archived: true, calendarSyncState: "synced" }));
    await f.t.action(internal.eventCalendar.push, { eventId: f.ids.event, revision: 1 });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.event)))?.calendarSyncState).toBe("synced");
  });

  it("also settles when the event stops being pushable while its existing Calendar entry is being checked (409 branch)", async () => {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = "service@example.invalid";
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
    process.env.STUDENT_STATUS_CALENDAR_WRITE_ENABLED = "true";
    process.env.CONVEX_CLOUD_URL = "https://amicable-eel-413.convex.cloud";
    const f = await fixture();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(calendarId)))).map(value => value.toString(16).padStart(2, "0")).join("");
    await f.t.run(ctx => ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash: hash, timezone: "America/Chicago", generation: 1 }));
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
      if (init?.method === "POST") return new Response("{}", { status: 409 });
      if (init?.method === "PATCH") throw new Error("Must not write once the event is archived");
      // The entry already exists for this event; meanwhile the event is archived.
      await f.t.run(ctx => ctx.db.patch(f.ids.event, { archived: true }));
      return new Response(JSON.stringify({ id: "existing", etag: '"v1"', summary: "Practice", extendedProperties: { private: { studentStatusEventId: f.ids.event } } }), { status: 200 });
    });
    await f.t.action(internal.eventCalendar.push, { eventId: f.ids.event, revision: 1 });
    const event = await f.t.run(ctx => ctx.db.get(f.ids.event));
    expect(event?.calendarSyncState).toBe("failed");
    expect(event?.calendarSyncError).toMatch(/has ended and moved to Past events/);
  });
});
