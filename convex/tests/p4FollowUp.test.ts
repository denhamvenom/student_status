/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { addDays, weekdayOf } from "../lib/seriesRecurrence";

/**
 * Follow-up hardening: one notice per series in the main Calendar sync and linked reconcile, the shared Student/Parent event
 * gate on shifts and questions, Coach-only editing rules, the Parent fail-closed rule on eventDetail, upcoming Mentor
 * invitations, roster group fields and series progress for staff.
 */
const modules = import.meta.glob("../**/*.ts");
const calendarId = "synthetic-calendar@example.invalid";
const environmentKeys = ["TIMECLOCK_CALENDAR_ID", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY"] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]])) as Record<(typeof environmentKeys)[number], string | undefined>;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of environmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key]; else process.env[key] = original;
  }
});

async function syntheticPrivateKey() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}
async function calendarHash() {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(calendarId)))).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function configureCalendar() {
  process.env.TIMECLOCK_CALENDAR_ID = calendarId;
  process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = "service@example.invalid";
  process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
}

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id };
    }
    const coach = await account("pf-coach", "coach", { financialEdit: true }), lead = await account("pf-lead", "mentor", { travelLead: true });
    const mentor = await account("pf-mentor", "mentor"), parent = await account("pf-parent", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const students: { id: Id<"students">; auth: Id<"users">; userId: Id<"appUsers"> }[] = [];
    for (const [name, subteam] of [["pf-build", "Build"], ["pf-code", "Programming"]] as const) {
      const user = await account(name, "student");
      students.push({ auth: user.auth, userId: user.id, id: await ctx.db.insert("students", { seasonId: season, userId: user.id, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam, active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }) });
    }
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: students[0].id, seasonId: season, active: true, createdBy: coach.id });
    return { coach, lead, mentor, parent, season, students };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  const drain = async () => { for (let i = 0; i < 60; i++) { vi.advanceTimersByTime(5_000); await t.finishInProgressScheduledFunctions(); } };
  const linksReady = () => t.run(ctx => ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 1, unresolved: 0, updatedAt: 0, generation: 1, startedBy: ids.coach.id }));
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor), parent: as(ids.parent), student: (i: number) => as(ids.students[i]), drain, linksReady };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const DAY = 86_400_000;
const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false };
const today = () => chicagoDate(Date.now());
function weeklyFrom(offsetDays: number) {
  const startDate = addDays(today(), offsetDays);
  return { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 };
}
function insertEvent(f: Fixture, name: string, extra: Partial<Doc<"events">> = {}) {
  return f.t.run(ctx => ctx.db.insert("events", { seasonId: f.ids.season, name, type: "Team", startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + 3_600_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...extra }));
}
const participate = (f: Fixture, eventId: Id<"events">, studentId: Id<"students">) => f.t.run(ctx => ctx.db.insert("participants", { eventId, studentId, status: "confirmed", createdAt: 1, updatedAt: 1 }));
const seriesRows = (f: Fixture, seriesId: Id<"eventSeries">) => f.t.run(async ctx => (await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId)).take(100)).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!)));
const changedNotices = async (f: Fixture, userId: Id<"appUsers">) => (await f.t.run(ctx => ctx.db.query("notifications").take(1000))).filter(row => row.userId === userId && row.dedupeKey?.includes(":changed:"));

/** A linked series (rows claim Google instance ids) for both students, plus one linked single event the first student is on. */
async function linkedSeries(f: Fixture) {
  vi.useFakeTimers();
  const listed = f.ids.students.map(student => student.id);
  const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "students", audienceStudentIds: listed, mandatory: true, rule: weeklyFrom(1) });
  await f.drain();
  vi.useRealTimers();
  const rows = (await seriesRows(f, seriesId)).slice(0, 4);
  const single = await insertEvent(f, "Competition", { calendarChoice: "link", calendarEventId: "singlecal1", calendarEtag: "e0", calendarSyncState: "synced", calendarRevision: 1, calendarActorId: f.ids.coach.id });
  await participate(f, single, f.ids.students[0].id);
  await f.t.run(async ctx => {
    await ctx.db.patch(seriesId, { calendarMasterId: "srpfmaster", calendarSyncState: "synced" });
    for (const row of rows) {
      await ctx.db.patch(row._id, { calendarChoice: "link", calendarEventId: `srpfmaster_${row.seriesOccurrenceKey!.replaceAll("-", "")}`, calendarEtag: "e0", calendarSyncState: "synced", calendarRevision: 1, calendarActorId: f.ids.coach.id, calendarRecurring: true });
      await ctx.db.insert("eventCalendarClaims", { calendarEventId: `srpfmaster_${row.seriesOccurrenceKey!.replaceAll("-", "")}`, eventId: row._id });
    }
    await ctx.db.insert("eventCalendarClaims", { calendarEventId: "singlecal1", eventId: single });
  });
  const googleItem = (id: string, summary: string, startsAt: number, endsAt: number, recurring: boolean) => ({ id, etag: "e1", status: "confirmed", summary, location: "New gym", start: { dateTime: new Date(startsAt).toISOString() }, end: { dateTime: new Date(endsAt).toISOString() }, updated: new Date(Date.now()).toISOString(), ...(recurring ? { recurringEventId: "srpfmaster" } : {}) });
  const items = [...rows.map(row => googleItem(`srpfmaster_${row.seriesOccurrenceKey!.replaceAll("-", "")}`, row.name, row.startsAt, row.endsAt, true)), googleItem("singlecal1", "Competition", Date.now() + 2 * DAY, Date.now() + 2 * DAY + 3_600_000, false)];
  return { seriesId, rows, single, items };
}

function expectOneSeriesNoticeEach(f: Fixture, notices: Doc<"notifications">[][], rows: Doc<"events">[], single: Id<"events">) {
  for (const [index, list] of notices.entries()) {
    const series = list.filter(row => rows.some(meeting => row.dedupeKey!.includes(meeting._id)));
    expect(series).toHaveLength(1);
    expect(series[0].dedupeKey).toContain(rows[0]._id);
    // The single linked event still notifies on its own (only the first student is on it).
    expect(list.filter(row => row.dedupeKey!.includes(single))).toHaveLength(index === 0 ? 1 : 0);
  }
}

describe("main Calendar sync: one notice per series", () => {
  it("calendar.refresh applies an all-events location edit to every meeting but notifies once per series", async () => {
    await configureCalendar();
    const f = await fixture();
    const { seriesId, rows, single, items } = await linkedSeries(f);
    await f.t.mutation(internal.calendarState.begin, { calendarIdHash: await calendarHash(), now: Date.now() - 120_000 });
    await f.t.run(async ctx => { const row = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique(); await ctx.db.patch(row!._id, { syncToken: "valid-token" }); });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
      return new Response(JSON.stringify({ items, nextSyncToken: "fresh-token" }), { status: 200 });
    });
    await f.t.action(internal.calendar.refresh, {});
    const saved = await seriesRows(f, seriesId);
    expect(saved.filter(row => rows.some(meeting => meeting._id === row._id)).every(row => row.destination === "New gym")).toBe(true);
    expectOneSeriesNoticeEach(f, await Promise.all(f.ids.students.map(student => changedNotices(f, student.userId))), rows, single);
  });

  it("reconcileLinked (full-token reset) also sends one notice per series", async () => {
    await configureCalendar();
    const f = await fixture();
    const { rows, single, items } = await linkedSeries(f);
    await f.t.run(async ctx => ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash: await calendarHash(), timezone: "America/Chicago", generation: 1 }));
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
      const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
      const item = items.find(entry => entry.id === id);
      return item ? new Response(JSON.stringify(item), { status: 200 }) : new Response("{}", { status: 404 });
    });
    await f.t.action(internal.eventCalendar.reconcileLinked, {});
    expectOneSeriesNoticeEach(f, await Promise.all(f.ids.students.map(student => changedNotices(f, student.userId))), rows, single);
  });
});

describe("Student and Parent event gate", () => {
  it("shifts and signup questions refuse Mentors-only and out-of-audience targeted events", async () => {
    const f = await fixture();
    await f.linksReady();
    const mentorsOnly = await insertEvent(f, "Mentor planning", { audienceKind: "mentorsOnly" });
    const programming = await insertEvent(f, "Programming lab", { audienceKind: "subteams", audienceSubteams: ["Programming"] });
    const build = await insertEvent(f, "Build lab", { audienceKind: "subteams", audienceSubteams: ["Build"] });
    const child = f.ids.students[0].id;
    for (const eventId of [mentorsOnly, programming]) {
      await expect(f.student(0).query(api.eventShifts.forEvent, { eventId })).rejects.toThrow("no longer available");
      await expect(f.parent.query(api.eventShifts.forEvent, { eventId, studentId: child })).rejects.toThrow("no longer available");
      await expect(f.student(0).query(api.eventQuestions.forSignup, { eventId })).rejects.toThrow("no longer available");
    }
    expect((await f.student(0).query(api.eventShifts.forEvent, { eventId: build })).studentId).toBe(child);
    expect((await f.parent.query(api.eventShifts.forEvent, { eventId: build, studentId: child })).studentId).toBe(child);
    expect((await f.student(0).query(api.eventQuestions.forSignup, { eventId: build })).questions).toEqual([]);
    expect((await f.student(1).query(api.eventQuestions.forSignup, { eventId: programming })).questions).toEqual([]);
    expect((await f.coach.query(api.eventShifts.forEvent, { eventId: mentorsOnly })).studentId).toBeNull();
  });

  it("Parent eventDetail matches the event list's fail-closed rule while Family links are being prepared", async () => {
    const f = await fixture();
    const child = f.ids.students[0].id;
    const legacy = await insertEvent(f, "Legacy");
    const build = await insertEvent(f, "Build lab", { audienceKind: "subteams", audienceSubteams: ["Build"] });
    const everyone = await insertEvent(f, "Team social", { audienceKind: "everyone" });
    const mentorsOnly = await insertEvent(f, "Mentor planning", { audienceKind: "mentorsOnly" });
    const onIt = await insertEvent(f, "On it", { audienceKind: "students" });
    await participate(f, onIt, child);
    const listed = async () => (await f.parent.query(api.app.listEvents, {})).map((row: { event: { _id: Id<"events"> } }) => row.event._id).sort();
    const detail = (eventId: Id<"events">, studentId?: Id<"students">) => f.parent.query(api.app.eventDetail, { eventId, ...(studentId ? { studentId } : {}) });
    // Backfill incomplete: the list and direct reads agree.
    expect(await listed()).toEqual([legacy, onIt].sort());
    for (const eventId of [build, everyone, mentorsOnly]) {
      await expect(detail(eventId)).rejects.toThrow("no longer available");
      await expect(detail(eventId, child)).rejects.toThrow("no longer available");
    }
    for (const eventId of [legacy, onIt]) expect((await detail(eventId, child)).event._id).toBe(eventId);
    // Links ready: the audience applies again; Mentors-only stays hidden.
    await f.linksReady();
    expect(await listed()).toEqual([legacy, build, everyone, onIt].sort());
    for (const eventId of [build, everyone]) expect((await detail(eventId)).event._id).toBe(eventId);
    await expect(detail(mentorsOnly, child)).rejects.toThrow("no longer available");
  });
});

describe("event editing rules", () => {
  it("connect and update follow the Coach-only rules; events not on Team Calendar can be edited here", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId: required } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", mandatory: true, rule: weeklyFrom(1) });
    await f.drain();
    const [meeting] = await seriesRows(f, required);
    await expect(f.lead.mutation(api.eventCalendar.connect, { eventId: meeting._id, calendarChoice: { kind: "link", eventId: "cal_pf_meeting" } })).rejects.toThrow("Only a Coach");
    await f.coach.mutation(api.eventCalendar.connect, { eventId: meeting._id, calendarChoice: { kind: "link", eventId: "cal_pf_meeting" } });

    const wholeTeam = await insertEvent(f, "Whole team build day", { signupMode: "assigned", assignmentScope: "wholeTeam" });
    const subteamRequired = await insertEvent(f, "Build required", { signupMode: "assigned", audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true });
    for (const eventId of [wholeTeam, subteamRequired]) {
      await expect(f.lead.mutation(api.eventCalendar.update, { eventId, name: "Renamed" })).rejects.toThrow("Only a Coach");
      await expect(f.lead.mutation(api.eventCalendar.connect, { eventId, calendarChoice: { kind: "create" } })).rejects.toThrow("Only a Coach");
    }
    await f.coach.mutation(api.eventCalendar.update, { eventId: wholeTeam, name: "Coach renamed" });

    // A Travel Lead edits an ordinary event that is not on Team Calendar: saved, and no Calendar push.
    const plain = await insertEvent(f, "Open lab");
    const startsAt = Date.now() + 5 * DAY;
    await f.lead.mutation(api.eventCalendar.update, { eventId: plain, name: "Open lab (moved)", destination: "Room 12", startsAt, endsAt: startsAt + 3_600_000 });
    expect((await f.t.run(ctx => ctx.db.get(plain)))!).toMatchObject({ name: "Open lab (moved)", destination: "Room 12", startsAt });
    expect((await f.t.run(ctx => ctx.db.get(plain)))!.calendarChoice).toBeUndefined();
    const pushes = (await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").take(500))).filter(job => job.name.includes("eventCalendar") && job.name.includes("push") && (job.args[0] as { eventId?: string }).eventId === plain);
    expect(pushes).toHaveLength(0);
  });
});

describe("Mentor invitations", () => {
  it("lists upcoming invitations even behind more than 100 old accepted ones", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 120; i++) {
        const old = await ctx.db.insert("events", { seasonId: f.ids.season, name: `Old ${i}`, type: "Team", startsAt: 1, endsAt: 2, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: true });
        await ctx.db.insert("eventMentorInvites", { eventId: old, mentorUserId: f.ids.mentor.id, source: "individual", status: "accepted", invitedBy: f.ids.coach.id, createdAt: i });
      }
    });
    const upcomingAccepted = await insertEvent(f, "Upcoming accepted");
    const upcomingInvited = await insertEvent(f, "Upcoming invited", { startsAt: Date.now() + DAY, endsAt: Date.now() + DAY + 3_600_000 });
    const declined = await insertEvent(f, "Declined");
    await f.t.run(async ctx => {
      await ctx.db.insert("eventMentorInvites", { eventId: upcomingAccepted, mentorUserId: f.ids.mentor.id, source: "individual", status: "accepted", invitedBy: f.ids.coach.id, createdAt: 500 });
      await ctx.db.insert("eventMentorInvites", { eventId: upcomingInvited, mentorUserId: f.ids.mentor.id, source: "subteam", status: "invited", invitedBy: f.ids.coach.id, createdAt: 501 });
      await ctx.db.insert("eventMentorInvites", { eventId: declined, mentorUserId: f.ids.mentor.id, source: "individual", status: "declined", invitedBy: f.ids.coach.id, createdAt: 502 });
    });
    const invites = await f.mentor.query(api.mentorInvites.myInvitedEvents, {});
    // Declined invitations for current events stay listed (soonest first) so the Mentor can change their mind.
    expect(invites.map(row => [row.eventId, row.status])).toEqual([[upcomingInvited, "invited"], [upcomingAccepted, "accepted"], [declined, "declined"]]);
    await f.mentor.mutation(api.mentorInvites.respond, { eventId: declined, status: "accepted" });
    expect((await f.mentor.query(api.mentorInvites.myInvitedEvents, {})).find(row => row.eventId === declined)?.status).toBe("accepted");
  });
});

describe("Mentor Home profile", () => {
  it("adultProfile.own returns the signed-in user's own subteams, [] when none", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor.id, { subteams: ["CAD", "Build"] }));
    expect((await f.mentor.query(api.adultProfile.own, {})).subteams).toEqual(["CAD", "Build"]);
    expect((await f.coach.query(api.adultProfile.own, {})).subteams).toEqual([]);
  });
});

describe("Coach roster directory", () => {
  it("includes the CAD and Leadership group fields", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.students[0].id, { secondarySubteam: "CAD", leadership: true }));
    const page = await f.coach.query(api.coachRoster.directory, { paginationOpts: { numItems: 50, cursor: null } });
    const byId = new Map(page.page.map(row => [row.studentId, row]));
    expect(byId.get(f.ids.students[0].id)).toMatchObject({ secondarySubteam: "CAD", leadership: true });
    expect(byId.get(f.ids.students[1].id)).toMatchObject({ secondarySubteam: null, leadership: false });
  });
});

describe("series progress for staff", () => {
  it("reports the created window and the planned total so the UI can say more meetings are added automatically", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, firstEventId } = await f.coach.mutation(api.eventSeries.create, { name: "Ten meetings", ...template, audienceKind: "everyone", rule: { ...weeklyFrom(1), count: 10 } });
    await f.drain();
    const { series, occurrences } = await f.coach.query(api.eventSeries.get, { seriesId, fromKey: today() });
    expect(occurrences.length).toBe(8);
    expect(series).toMatchObject({ plannedMeetingCount: 10, moreMeetingsScheduled: true, windowDays: 56 });
    expect(series.generatedThroughDate).toBe(addDays(chicagoDate(series.generatedThrough!), -1));
    expect(occurrences.every(row => row.key <= series.generatedThroughDate!)).toBe(true);
    type WithSeries = { series?: unknown };
    const detail = await f.lead.query(api.app.eventDetail, { eventId: firstEventId! }) as WithSeries;
    expect(detail.series).toMatchObject({ seriesId, plannedMeetingCount: 10, moreMeetingsScheduled: true });
    expect((await f.student(0).query(api.app.eventDetail, { eventId: firstEventId! }) as WithSeries).series).toBeUndefined();
    // A series with no end has no planned total.
    const { seriesId: open } = await f.coach.mutation(api.eventSeries.create, { name: "Open lab", ...template, audienceKind: "everyone", rule: weeklyFrom(2) });
    await f.drain();
    expect((await f.coach.query(api.eventSeries.get, { seriesId: open, fromKey: today() })).series).toMatchObject({ plannedMeetingCount: null, moreMeetingsScheduled: true });
  });
});
