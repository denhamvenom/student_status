/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { googleInstanceId } from "../lib/rrule";
import { addDays, occurrencesBetween, weekdayOf, zonedWallTimeToUtc } from "../lib/seriesRecurrence";
import { validCalendarEventId } from "../eventCalendar";

const modules = import.meta.glob("../**/*.ts");
const calendarId = "synthetic-calendar@example.invalid";
const environmentKeys = ["TIMECLOCK_CALENDAR_ID", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY", "STUDENT_STATUS_CALENDAR_WRITE_ENABLED", "CONVEX_CLOUD_URL"] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]])) as Record<(typeof environmentKeys)[number], string | undefined>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of environmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key]; else process.env[key] = original;
  }
});

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("rf-coach", "coach"), lead = await account("rf-lead", "mentor", true), mentor = await account("rf-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const students: { id: Id<"students">; auth: Id<"users"> }[] = [];
    for (const [name, subteam] of [["rf-build", "Build"], ["rf-code", "Programming"], ["rf-new", ""]] as const) {
      const user = await account(name, "student");
      students.push({ auth: user.auth, id: await ctx.db.insert("students", { seasonId: season, userId: user.id, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam, active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }) });
    }
    return { coach, lead, mentor, season, students };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  const drain = async () => { for (let i = 0; i < 60; i++) { vi.advanceTimersByTime(5_000); await t.finishInProgressScheduledFunctions(); } };
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), student: (i: number) => as(ids.students[i]), drain };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const today = () => chicagoDate(Date.now());
const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false };
function weeklyFrom(offsetDays: number) {
  const startDate = addDays(today(), offsetDays);
  return { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 };
}
const DAY = 86_400_000;
type EventExtra = Partial<Doc<"events">>;
function insertEvent(f: Fixture, name: string, dayOffset: number, extra: EventExtra) {
  return f.t.run(ctx => ctx.db.insert("events", { seasonId: f.ids.season, name, type: "Team", startsAt: Date.now() + dayOffset * DAY, endsAt: Date.now() + dayOffset * DAY + 3_600_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...extra }));
}
const mandatoryCad = { signupMode: "assigned" as const, assignmentScope: "selected" as const, audienceKind: "subteams" as const, audienceSubteams: ["CAD"], mandatory: true };
const seriesRows = (f: Fixture, seriesId: Id<"eventSeries">) => f.t.run(async ctx => (await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId)).take(100)));
const studentRows = (f: Fixture, studentId: Id<"students">) => f.t.run(ctx => ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", studentId)).take(500));

describe("subteam membership sync", () => {
  it("joining CAD sends one assignment notice per series and one per standalone event", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "CAD night", ...template, audienceKind: "subteams", audienceSubteams: ["CAD"], mandatory: true, rule: weeklyFrom(1) });
    const standalone = await insertEvent(f, "CAD review", 3, mandatoryCad);
    await f.drain();
    const meetings = await seriesRows(f, seriesId);
    expect(meetings).toHaveLength(8);
    const student = f.ids.students[0];
    const userId = (await f.t.run(ctx => ctx.db.get(student.id)))!.userId!;

    await f.lead.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, { studentId: student.id, secondarySubteam: "CAD", leadership: false, expectedRevision: 0 });
    await f.drain();
    expect((await studentRows(f, student.id)).map(row => row.eventId).sort()).toEqual([...meetings.map(row => row._id), standalone].sort());
    const notices = (await f.t.run(ctx => ctx.db.query("notifications").take(500))).filter(row => row.userId === userId && row.dedupeKey?.includes(":assigned:"));
    const first = meetings.sort((a, b) => a.startsAt - b.startsAt)[0];
    expect(notices.map(row => row.dedupeKey).sort()).toEqual([`${userId}:assigned:${first._id}`, `${userId}:assigned:${standalone}`].sort());
  });

  it("ignores optional subteam events and continues past one page in the background instead of failing", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    for (let i = 0; i < 120; i++) await insertEvent(f, `Optional CAD ${i}`, 1 + i / 10, { audienceKind: "subteams", audienceSubteams: ["CAD"], mandatory: false });
    const required: Id<"events">[] = [];
    for (let i = 0; i < 70; i++) required.push(await insertEvent(f, `Required CAD ${i}`, 2 + i / 10, mandatoryCad));
    // Before: more than 100 future subteam events (optional ones included) made the roster change throw.
    await f.lead.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, { studentId: f.ids.students[0].id, secondarySubteam: "CAD", leadership: true, expectedRevision: 0 });
    expect(await studentRows(f, f.ids.students[0].id)).toHaveLength(50);
    await f.drain();
    expect((await studentRows(f, f.ids.students[0].id)).map(row => row.eventId).sort()).toEqual([...required].sort());
  });

  it("setup wizard: a newly chosen primary subteam joins that subteam's required events", async () => {
    const f = await fixture();
    const required = await insertEvent(f, "Programming sprint", 2, { ...mandatoryCad, audienceSubteams: ["Programming"] });
    await f.student(2).mutation(api.setupWizard.saveStudentTeam, { studentId: f.ids.students[2].id, expectedRevision: 0, shirtSize: "M", roomCategory: "Boys", subteam: "Programming" });
    expect((await studentRows(f, f.ids.students[2].id)).map(row => row.eventId)).toEqual([required]);
  });
});

describe("series authorization and generation", () => {
  it("eventCalendar.update applies the series editor rules to meetings", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId: required } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", mandatory: true, rule: weeklyFrom(1) });
    const { seriesId: optional } = await f.lead.mutation(api.eventSeries.create, { name: "Open lab", ...template, audienceKind: "everyone", rule: weeklyFrom(2) });
    await f.drain();
    const [requiredRow] = await seriesRows(f, required), [optionalRow] = await seriesRows(f, optional);
    await expect(f.lead.mutation(api.eventCalendar.update, { eventId: requiredRow._id, name: "Renamed" })).rejects.toThrow("Only a Coach");
    await expect(f.lead.mutation(api.eventCalendar.update, { eventId: requiredRow._id, cancelled: true })).rejects.toThrow("Only a Coach");
    await f.lead.mutation(api.eventCalendar.update, { eventId: optionalRow._id, name: "Open lab (moved)" });
    await f.coach.mutation(api.eventCalendar.update, { eventId: requiredRow._id, name: "Team meeting (moved)" });
    expect((await f.t.run(ctx => ctx.db.get(requiredRow._id)))?.name).toBe("Team meeting (moved)");
  });

  it("stops generating when the creator can no longer manage the series and drops inactive invited Mentors", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.lead.mutation(api.eventSeries.create, { name: "Open lab", ...template, audienceKind: "everyone", mentorInviteUserIds: [f.ids.mentor.id], rule: weeklyFrom(1) });
    await f.drain();
    expect(await seriesRows(f, seriesId)).toHaveLength(8);
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor.id, { active: false }));
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 64) });
    const extended = (await seriesRows(f, seriesId)).sort((a, b) => a.startsAt - b.startsAt);
    expect(extended).toHaveLength(9);
    const invites = await f.t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", extended[8]._id)).take(10));
    expect(invites).toHaveLength(0);
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.mentorInviteIds).toEqual([]);

    // Losing Travel Lead alone is not enough: an optional Team series for Everyone is within the plain-Mentor limits, so it keeps going.
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.id, { travelLead: false }));
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 78) });
    expect(await seriesRows(f, seriesId)).toHaveLength(11);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: "active" });
    // A deactivated creator can no longer manage anything: generation stops and the series goes to review.
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.id, { active: false }));
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 92) });
    expect(await seriesRows(f, seriesId)).toHaveLength(11);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: "needsReview", calendarError: expect.stringContaining("can no longer manage") });
  });
});

describe("student event visibility and signups", () => {
  it("hides events outside the student's audience unless they are on it; legacy events stay", async () => {
    const f = await fixture();
    const programming = await insertEvent(f, "Programming open lab", 2, { audienceKind: "subteams", audienceSubteams: ["Programming"], mandatory: false });
    const legacy = await insertEvent(f, "Legacy open event", 3, {});
    const added = await insertEvent(f, "Programming review", 4, { audienceKind: "subteams", audienceSubteams: ["Programming"], mandatory: false });
    const everyone = await insertEvent(f, "Team social", 5, { audienceKind: "everyone", mandatory: false });
    await f.t.run(ctx => ctx.db.insert("participants", { eventId: added, studentId: f.ids.students[0].id, status: "confirmed", createdAt: 1, updatedAt: 1 }));
    const visible = (rows: { event: { _id: Id<"events"> } }[]) => rows.map(row => row.event._id).sort();
    expect(visible(await f.student(0).query(api.app.listEvents, {}))).toEqual([legacy, added, everyone].sort());
    expect(visible(await f.student(1).query(api.app.listEvents, {}))).toEqual([programming, legacy, added, everyone].sort());
    const home = await f.student(0).query(api.studentHome.summary, { asOfDay: today() });
    expect(home.openSignups.map(row => row.eventId).sort()).toEqual([legacy, everyone].sort());
    // A direct link to a targeted event outside the student's audience is unavailable, and signup is refused.
    await expect(f.student(0).query(api.app.eventDetail, { eventId: programming })).rejects.toThrow("no longer available");
    await expect(f.student(0).query(api.participation.signupAvailability, { eventId: programming })).rejects.toThrow("no longer available");
    // Coaches still see every event.
    expect(visible(await f.coach.query(api.app.listEvents, {}))).toEqual([programming, legacy, added, everyone].sort());
  });

  it("refuses adding students to a Mentor-only event", async () => {
    const f = await fixture();
    const mentorsOnly = await insertEvent(f, "Mentor planning", 2, { signupMode: "assigned", audienceKind: "mentorsOnly", mandatory: false });
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: mentorsOnly, studentId: f.ids.students[0].id, status: "confirmed" })).rejects.toThrow("Mentors only");
    expect(await studentRows(f, f.ids.students[0].id)).toHaveLength(0);
  });
});

describe("Google Calendar ids", () => {
  it.each([
    ["sr0123456789abcdef", true], ["master01_20261103T000000Z", true], ["a".repeat(1024), true],
    ["", false], ["a".repeat(1025), false], ["bad/../id", false], ["id?x=1", false], ["with-hyphen", false], ["dot.id", false],
  ])("%s valid: %s", (id, valid) => { expect(validCalendarEventId(id)).toBe(valid); });

  it("refuses to link a malformed Calendar id", async () => {
    const f = await fixture();
    const event = await insertEvent(f, "Practice", 2, {});
    await expect(f.coach.mutation(api.eventCalendar.connect, { eventId: event, calendarChoice: { kind: "link", eventId: "x/../../other" } })).rejects.toThrow("Choose a Team Calendar event");
  });
});

describe("recurring series on Team Calendar", () => {
  async function syntheticPrivateKey() {
    const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  }
  async function calendarFixture() {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = "service@example.invalid";
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
    process.env.STUDENT_STATUS_CALENDAR_WRITE_ENABLED = "true";
    process.env.CONVEX_CLOUD_URL = "https://amicable-eel-413.convex.cloud";
    const f = await fixture();
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(calendarId));
    const calendarIdHash = Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, "0")).join("");
    await f.t.run(ctx => ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash, timezone: "America/Chicago", generation: 1 }));
    return f;
  }

  type Call = { method: string; path: string; ifMatch: string | null };
  /** Fake Google Calendar: one weekly master; `edits` overrides listed instances by id (a Google-side exception). */
  function fakeGoogle(state: { master?: Record<string, unknown>; local?: { date: string; time: string }; edits: Map<string, Record<string, unknown>>; masterEtag: boolean }, calls: Call[]) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url.pathname, ifMatch: new Headers(init?.headers).get("if-match") });
      const parts = decodeURIComponent(url.pathname).split("/events")[1]?.split("/").filter(Boolean) ?? [];
      const masterJson = () => {
        const { date, time } = state.local!;
        const start = zonedWallTimeToUtc(date, time);
        return { ...state.master, ...(state.masterEtag ? { etag: '"m1"' } : { etag: undefined }), start: { dateTime: new Date(start).toISOString(), timeZone: "America/Chicago" }, end: { dateTime: new Date(start + 7_200_000).toISOString(), timeZone: "America/Chicago" } };
      };
      if (method === "POST" && parts.length === 0) {
        state.master = { ...body, status: "confirmed", updated: "2026-11-01T12:00:00Z" };
        state.local = { date: body.start.dateTime.slice(0, 10), time: body.start.dateTime.slice(11, 16) };
        return new Response(JSON.stringify(masterJson()), { status: 200 });
      }
      if (!state.master || parts[0] !== state.master.id) return new Response("{}", { status: 404 });
      if (parts[1] === "instances") {
        const byday = /BYDAY=([A-Z,]+)/.exec((state.master.recurrence as string[])[0])![1].split(",").map(code => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(code));
        const timeMin = Date.parse(url.searchParams.get("timeMin")!), timeMax = Date.parse(url.searchParams.get("timeMax")!);
        const items = occurrencesBetween({ anchorDate: state.local!.date, weekdays: byday, intervalWeeks: 1, startLocalTime: state.local!.time, durationMinutes: 120 }, chicagoDate(timeMin), chicagoDate(timeMax), 200)
          .filter(occurrence => occurrence.startsAt >= timeMin && occurrence.startsAt < timeMax)
          .map(occurrence => {
            const id = googleInstanceId(parts[0], occurrence.startsAt);
            const base = { id, etag: `"i-${occurrence.occurrenceKey}"`, status: "confirmed", summary: state.master!.summary, location: state.master!.location, description: "", recurringEventId: parts[0], start: { dateTime: new Date(occurrence.startsAt).toISOString() }, end: { dateTime: new Date(occurrence.endsAt).toISOString() }, originalStartTime: { dateTime: new Date(occurrence.startsAt).toISOString() }, updated: "2026-11-01T12:00:00Z" };
            const edit = state.edits.get(id);
            // A canceled instance is returned (showDeleted) with only its id, status and original start.
            if (edit?.status === "cancelled") return { id, etag: edit.etag, status: "cancelled", recurringEventId: parts[0], originalStartTime: base.originalStartTime, updated: edit.updated };
            return { ...base, ...edit };
          });
        return new Response(JSON.stringify({ items }), { status: 200 });
      }
      return new Response(JSON.stringify(masterJson()), { status: 200 });
    });
  }

  it("reconciles later Google-side edits and cancellations of meetings it already links", async () => {
    vi.useFakeTimers();
    const f = await calendarFixture();
    const state = { edits: new Map<string, Record<string, unknown>>(), masterEtag: true };
    const calls: Call[] = [];
    fakeGoogle(state, calls);
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", rule: weeklyFrom(1), addToCalendar: true });
    await f.drain();
    const linked = (await seriesRows(f, seriesId)).sort((a, b) => a.startsAt - b.startsAt);
    expect(linked.every(row => row.calendarSyncState === "synced" && row.calendarEventId)).toBe(true);

    state.edits.set(linked[2].calendarEventId!, { location: "Gym", etag: '"i-edited"', updated: "2026-11-01T13:00:00Z" });
    state.edits.set(linked[3].calendarEventId!, { status: "cancelled", etag: '"i-cancelled"', updated: "2026-11-01T13:00:00Z" });
    await f.t.action(internal.eventSeriesCalendar.extendAndReconcile, { seriesId });
    await f.drain();
    expect(await f.t.run(ctx => ctx.db.get(linked[2]._id))).toMatchObject({ destination: "Gym", seriesDetached: true, calendarEtag: '"i-edited"', cancelled: false });
    expect(await f.t.run(ctx => ctx.db.get(linked[3]._id))).toMatchObject({ cancelled: true, name: "Team meeting", calendarEtag: '"i-cancelled"' });
    const untouched = await f.t.run(ctx => ctx.db.get(linked[4]._id));
    expect(untouched).toMatchObject({ destination: "Lab" });
    expect(untouched?.cancelled ?? false).toBe(false);
    expect(untouched?.seriesDetached).toBeUndefined();
    expect(calls.some(call => call.method !== "GET" && call.method !== "POST")).toBe(false);

    // A second pass sees the same observations and changes nothing more.
    const before = await f.t.run(ctx => Promise.all([ctx.db.get(linked[2]._id), ctx.db.get(linked[3]._id)]));
    await f.t.action(internal.eventSeriesCalendar.extendAndReconcile, { seriesId });
    expect(await f.t.run(ctx => Promise.all([ctx.db.get(linked[2]._id), ctx.db.get(linked[3]._id)]))).toEqual(before);
  });

  it("never writes to a master without its etag", async () => {
    vi.useFakeTimers();
    const f = await calendarFixture();
    const state = { edits: new Map<string, Record<string, unknown>>(), masterEtag: true };
    const calls: Call[] = [];
    fakeGoogle(state, calls);
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", rule: weeklyFrom(1), addToCalendar: true });
    await f.drain();
    const rows = (await seriesRows(f, seriesId)).sort((a, b) => a.startsAt - b.startsAt);
    state.masterEtag = false;
    await f.coach.mutation(api.eventSeries.cancelFuture, { seriesId, fromKey: rows[5].seriesOccurrenceKey! });
    await f.drain();
    expect(calls.filter(call => call.method === "PATCH" || call.method === "DELETE")).toEqual([]);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ calendarSyncState: "failed", calendarError: expect.stringContaining("latest copy") });
  });
});
