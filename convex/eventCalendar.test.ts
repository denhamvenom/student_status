/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { withMediaMarker } from "./eventCalendar";
import { chicagoMidnight } from "./lib/calendarDates";

const modules = import.meta.glob("./**/*.ts");
const calendarId = "synthetic-calendar@example.invalid";
const accountEmail = "service@example.invalid";
const environmentKeys = ["TIMECLOCK_CALENDAR_ID", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY", "STUDENT_STATUS_CALENDAR_WRITE_ENABLED", "CONVEX_CLOUD_URL"] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]])) as Record<(typeof environmentKeys)[number], string | undefined>;

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of environmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key]; else process.env[key] = original;
  }
});

async function syntheticPrivateKey() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const base64 = btoa(String.fromCharCode(...bytes));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function bindSyntheticCalendar(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(calendarId));
  const calendarIdHash = Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, "0")).join("");
  await t.run(ctx => ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash, timezone: "America/Chicago", generation: 1 }));
}

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@synthetic.test", name: "Coach" });
    const authMentor = await ctx.db.insert("users", { email: "mentor@synthetic.test", name: "Mentor" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@synthetic.test", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    await ctx.db.insert("appUsers", { authUserId: authMentor, email: "mentor@synthetic.test", name: "Mentor", role: "mentor", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Practice", type: "Team", startsAt: chicagoMidnight("2026-11-01"), endsAt: chicagoMidnight("2026-11-02"), destination: "Gym", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { authCoach, authMentor, coach, season, event };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.authCoach}|one` }), mentor: t.withIdentity({ subject: `${ids.authMentor}|one` }) };
}

describe("Student Status Calendar link", () => {
  it("preserves unrelated description while changing only the managed media line", () => {
    expect(withMediaMarker("Bring gear\nContact coach", true)).toBe("Bring gear\nContact coach\nMedia Support Requested");
    expect(withMediaMarker("Bring gear\nMedia Support Requested\nContact coach", false)).toBe("Bring gear\nContact coach");
    expect(withMediaMarker("Bring gear\nMedia Support Requested", true)).toBe("Bring gear\nMedia Support Requested");
    expect(withMediaMarker("Bring gear\r\nKeep this line\r\n", true)).toBe("Bring gear\r\nKeep this line\r\nMedia Support Requested");
  });

  it("uses Chicago date boundaries across the fall daylight change", () => {
    expect(chicagoMidnight("2026-11-02") - chicagoMidnight("2026-11-01")).toBe(25 * 60 * 60 * 1000);
  });

  it("reserves links uniquely, protects stale edits, and imports only a linked occurrence", async () => {
    const f = await fixture();
    await expect(f.mentor.mutation(api.eventCalendar.connect, { eventId: f.ids.event, calendarChoice: { kind: "link", eventId: "cal-occurrence-1" } })).rejects.toThrow("Coach or Travel Lead");
    await f.coach.mutation(api.eventCalendar.connect, { eventId: f.ids.event, calendarChoice: { kind: "link", eventId: "cal-occurrence-1" } });
    const status = await f.coach.query(api.eventCalendar.status, { eventId: f.ids.event });
    expect(status).toMatchObject({ state: "disabled", calendarEventId: "cal-occurrence-1", revision: 1 });
    await expect(f.coach.mutation(api.eventCalendar.update, { eventId: f.ids.event, expectedRevision: 0, name: "Wrong" })).rejects.toThrow("changed since");
    await f.t.mutation(internal.eventCalendar.applyObserved, { eventId: "unlinked", title: "Ignore", location: "Elsewhere", start: 1, end: 2, allDay: false, recurring: false, cancelled: false, etag: "other", description: "" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.event)))?.name).toBe("Practice");
    const duplicate = await f.t.run(async ctx => ctx.db.insert("events", { seasonId: f.ids.season, name: "Second", type: "Team", startsAt: 100, endsAt: 200, destination: "Gym", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false }));
    await expect(f.coach.mutation(api.eventCalendar.connect, { eventId: duplicate, calendarChoice: { kind: "link", eventId: "cal-occurrence-1" } })).rejects.toThrow("already connected");
    await f.t.mutation(internal.eventCalendar.finishPush, { eventId: f.ids.event, revision: 1, error: "The selected Calendar event is no longer available.", replaceable: true });
    expect((await f.coach.query(api.eventCalendar.status, { eventId: f.ids.event })).canReselect).toBe(true);
    await f.coach.mutation(api.eventCalendar.connect, { eventId: f.ids.event, calendarChoice: { kind: "link", eventId: "cal-occurrence-4" } });
    const claims = await f.t.run(async ctx => ({ old: await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", "cal-occurrence-1")).unique(), next: await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", "cal-occurrence-4")).unique() }));
    expect(claims.old).toBeNull();
    expect(claims.next?.eventId).toBe(f.ids.event);
  });

  it("adopts linked all-day occurrence and cancellation without erasing its details", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { calendarChoice: "link", calendarEventId: "cal-occurrence-2", calendarSyncState: "synced", calendarEtag: "old", calendarRevision: 1, calendarActorId: f.ids.coach });
      await ctx.db.insert("eventCalendarClaims", { calendarEventId: "cal-occurrence-2", eventId: f.ids.event });
    });
    await f.t.mutation(internal.eventCalendar.applyObserved, { eventId: "cal-occurrence-2", title: "Tournament", location: "Arena", start: chicagoMidnight("2026-11-01"), end: chicagoMidnight("2026-11-02"), allDay: true, allDayStartDate: "2026-11-01", allDayEndDate: "2026-11-02", recurring: true, cancelled: false, etag: "new", providerUpdatedAt: 2000, description: "Bring gear\nMedia Support Requested" });
    expect(await f.coach.query(api.eventCalendar.status, { eventId: f.ids.event })).toMatchObject({ state: "disabled", allDay: true, recurring: true, mediaSupportRequested: true, revision: 2 });
    await f.t.mutation(internal.eventCalendar.applyObserved, { eventId: "cal-occurrence-2", title: "", location: "", allDay: false, recurring: false, cancelled: true, etag: "cancelled", providerUpdatedAt: 3000, description: "" });
    await f.t.mutation(internal.eventCalendar.applyObserved, { eventId: "cal-occurrence-2", title: "Stale", location: "Old", start: 100, end: 200, allDay: false, recurring: false, cancelled: false, etag: "stale", providerUpdatedAt: 2500, description: "" });
    const event = await f.t.run(ctx => ctx.db.get(f.ids.event));
    expect(event).toMatchObject({ name: "Tournament", destination: "Arena", cancelled: true, mediaSupportRequested: true, calendarRevision: 3 });
  });

  it("requires a new permission signature after a linked schedule change", async () => {
    const f = await fixture();
    const ids = await f.t.run(async ctx => {
      const student = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@synthetic.test", subteam: "Other", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
      const coverage = await ctx.db.insert("permissionCoverage", { seasonId: f.ids.season, studentId: student, eventId: f.ids.event, state: "accepted", revision: 3, updatedAt: 1, updatedBy: f.ids.coach });
      await ctx.db.patch(f.ids.event, { calendarChoice: "link", calendarEventId: "cal-occurrence-3", calendarSyncState: "synced", calendarEtag: "old", calendarRevision: 1, calendarActorId: f.ids.coach, signupClosesAt: chicagoMidnight("2026-11-03") });
      await ctx.db.insert("eventCalendarClaims", { calendarEventId: "cal-occurrence-3", eventId: f.ids.event });
      return { coverage };
    });
    await f.t.mutation(internal.eventCalendar.applyObserved, { eventId: "cal-occurrence-3", title: "New practice time", location: "Gym", start: chicagoMidnight("2026-11-02"), end: chicagoMidnight("2026-11-03"), allDay: false, recurring: false, cancelled: false, etag: "new", providerUpdatedAt: 1000, description: "" });
    const coverage = await f.t.run(ctx => ctx.db.get(ids.coverage));
    expect(coverage).toMatchObject({ state: "required", revision: 4 });
    expect(coverage?.signatureRequestedAt).toBeTypeOf("number");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.event)))?.signupClosesAt).toBe(chicagoMidnight("2026-11-02"));
  });

  it("blocks every external call on a development deployment even if the write flag is true", async () => {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = accountEmail;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = "synthetic-key-not-used";
    process.env.STUDENT_STATUS_CALENDAR_WRITE_ENABLED = "true";
    process.env.CONVEX_CLOUD_URL = "https://third-bandicoot-18.convex.cloud";
    const f = await fixture();
    const fetchSpy = vi.fn(async () => { throw new Error("External request must not occur in development"); });
    vi.stubGlobal("fetch", fetchSpy);
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { calendarChoice: "create", calendarSyncState: "pending", calendarRevision: 1, calendarActorId: f.ids.coach }));
    await f.t.action(internal.eventCalendar.push, { eventId: f.ids.event, revision: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await f.t.run(ctx => ctx.db.get(f.ids.event)))?.calendarSyncState).toBe("failed");
  });

  it("recovers an uncertain insert by reusing its deterministic ID and applying the latest edit", async () => {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = accountEmail;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
    process.env.STUDENT_STATUS_CALENDAR_WRITE_ENABLED = "true";
    process.env.CONVEX_CLOUD_URL = "https://amicable-eel-413.convex.cloud";
    const f = await fixture();
    await bindSyntheticCalendar(f.t);
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { calendarChoice: "create", calendarSyncState: "pending", calendarRevision: 1, calendarActorId: f.ids.coach }));

    let remoteId = "";
    const posts: Array<{ id: string; summary: string }> = [];
    const patches: Array<{ url: string; ifMatch: string | null; summary: string; location: string; start: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
      if (url.origin !== "https://www.googleapis.com") throw new Error(`Unexpected URL ${url.origin}`);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { id: string; summary: string };
        posts.push({ id: body.id, summary: body.summary });
        if (!remoteId) { remoteId = body.id; throw new Error("Synthetic response lost after insert"); }
        return new Response("{}", { status: 409 });
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { summary: string; location: string; start: { dateTime: string } };
        patches.push({ url: url.toString(), ifMatch: new Headers(init.headers).get("if-match"), summary: body.summary, location: body.location, start: body.start.dateTime });
        return new Response(JSON.stringify({ id: remoteId, etag: '"v2"', updated: "2026-11-01T12:00:00Z", summary: body.summary, location: body.location, start: body.start, end: { dateTime: new Date(chicagoMidnight("2026-11-03")).toISOString() } }), { status: 200 });
      }
      if (url.pathname.endsWith(`/${remoteId}`)) return new Response(JSON.stringify({ id: remoteId, etag: '"v1"', updated: "2026-11-01T11:00:00Z", summary: "Practice", location: "Gym", start: { dateTime: new Date(chicagoMidnight("2026-11-01")).toISOString() }, end: { dateTime: new Date(chicagoMidnight("2026-11-02")).toISOString() }, extendedProperties: { private: { studentStatusEventId: f.ids.event } } }), { status: 200 });
      throw new Error(`Unexpected Calendar request ${url}`);
    });

    await f.t.action(internal.eventCalendar.push, { eventId: f.ids.event, revision: 1 });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.event)))?.calendarSyncState).toBe("failed");
    const nextStart = chicagoMidnight("2026-11-02"), nextEnd = chicagoMidnight("2026-11-03");
    await f.coach.mutation(api.eventCalendar.update, { eventId: f.ids.event, expectedRevision: 1, name: "Updated practice", destination: "New arena", startsAt: nextStart, endsAt: nextEnd });
    await f.t.action(internal.eventCalendar.push, { eventId: f.ids.event, revision: 2 });
    expect(posts).toHaveLength(2);
    expect(posts[0].id).toBe(posts[1].id);
    expect(posts[0].id).toBe(remoteId);
    expect(patches).toEqual([{ url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${remoteId}`, ifMatch: '"v1"', summary: "Updated practice", location: "New arena", start: new Date(nextStart).toISOString() }]);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.event)))?.calendarSyncState).toBe("synced");
  });
});
