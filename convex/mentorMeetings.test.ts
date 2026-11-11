/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { MAX_DIGEST_USERS } from "./lib/digest";
import { mentorDisplayName } from "./mentorMeetings";
import { listMeetingMentors } from "./lib/mentorMeetings";
import { MAX_INLINE_PARENT_MENTORS, OPEN_DIGEST_PAGE_SIZE, openDigestPageSize, queueMentorMeetingOpenDigestPage } from "./lib/notificationTriggers";
import { MAX_SUBTEAM_MENTOR_LIST, mentorsForSubteams, TOO_MANY_SUBTEAM_MENTORS_MESSAGE } from "./lib/createEventCore";
import { MAX_MENTOR_LIST, MENTOR_LIST_TOO_LONG_MESSAGE } from "./studentSubteams";
import { seriesMentorInvites } from "./lib/seriesGenerate";
import { chicagoDate } from "./lib/calendarDates";
import { addDays, weekdayOf } from "./lib/seriesRecurrence";

/** Synthetic data only. Mentor meetings: create/edit/cancel limits, self sign-up, and the minimized projection. */
const modules = import.meta.glob("./**/*.ts");
const HOUR = 3_600_000, DAY = 24 * HOUR;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id };
    }
    const coach = await account("mm-coach", "coach");
    const mentorA = await account("mm-mentor-a", "mentor", { subteams: ["Build"] });
    const mentorB = await account("mm-mentor-b", "mentor", { subteams: ["Electrical"] });
    const lead = await account("mm-lead", "mentor", { travelLead: true });
    const studentUser = await account("mm-student", "student");
    const parent = await account("mm-parent", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.id, legalName: "Legal Student Name", preferredName: "Sam", email: "mm-student@example.invalid", emergencyPhone: "555-0100", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "reported", text: "peanuts" }, medications: { state: "none" } });
    return { coach, mentorA, mentorB, lead, studentUser, parent, season, student };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  const seedEvent = (extra: Partial<Doc<"events">> = {}) => t.run(ctx => ctx.db.insert("events", {
    seasonId: ids.season, name: "Open lab", type: "Team", startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
    signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false, ...extra,
  }));
  const invites = (eventId: Id<"events">) => t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(20));
  const event = (eventId: Id<"events">) => t.run(ctx => ctx.db.get(eventId));
  return { t, ids, as, seedEvent, invites, event };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const meeting = (extra: Record<string, unknown> = {}) => ({ name: "Pit prep", startsAt: Date.now() + DAY, endsAt: Date.now() + DAY + HOUR, destination: "Lab", audienceKind: "everyone" as const, ...extra });

function seriesArgs(extra: Record<string, unknown> = {}) {
  const startDate = addDays(chicagoDate(Date.now()), 1);
  return {
    name: "Weekly build", type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
    audienceKind: "everyone" as const, rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 }, ...extra,
  };
}

/** A series and one future meeting in it, as if generated. */
async function seedSeries(f: Fixture, createdBy: Id<"appUsers">) {
  return await f.t.run(async ctx => {
    const startDate = addDays(chicagoDate(Date.now()), 3);
    const seriesId = await ctx.db.insert("eventSeries", {
      seasonId: f.ids.season, createdBy, createdAt: 1, name: "Weekly build", status: "active", origin: "created",
      template: { type: "Team", destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: "everyone", mandatory: false },
      localStartTime: "18:00", durationMinutes: 120, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, startDate, timeZone: "America/Chicago", templateRevision: 1,
    });
    const eventId = await ctx.db.insert("events", {
      seasonId: f.ids.season, name: "Weekly build", type: "Team", startsAt: Date.now() + 3 * DAY, endsAt: Date.now() + 3 * DAY + 2 * HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
      signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false, seriesId, seriesOccurrenceKey: startDate,
    });
    return { seriesId, eventId, startDate };
  });
}

describe("Mentor create", () => {
  it.each([
    ["Everyone", {}, "open"],
    ["Subteams", { audienceKind: "subteams" as const, audienceSubteams: ["Build"] }, "open"],
    ["specific students", { audienceKind: "students" as const, audienceStudentIds: "student" }, "open"],
    ["Mentors only", { audienceKind: "mentorsOnly" as const, mentorInviteUserIds: "mentorB" }, "assigned"],
  ])("lets a Mentor create an optional %s meeting and records the creator", async (_label, extra, signupMode) => {
    const f = await fixture();
    const args = meeting({ ...extra, ...(extra && "audienceStudentIds" in extra ? { audienceStudentIds: [f.ids.student] } : {}), ...(extra && "mentorInviteUserIds" in extra ? { mentorInviteUserIds: [f.ids.mentorB.id] } : {}) });
    const eventId = await f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, args);
    const row = (await f.event(eventId))!;
    expect(row).toMatchObject({ type: "Team", feeCents: 0, signupMode, mandatory: false, overnight: false, roomingEnabled: false, permissionRequired: false, travel: "None", createdBy: f.ids.mentorA.id });
    expect(row.assignmentScope).toBeUndefined();
  });

  it("invites other Mentors but not the creator themselves", async () => {
    const f = await fixture();
    const eventId = await f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, meeting({ mentorInviteUserIds: [f.ids.mentorB.id, f.ids.mentorA.id] }));
    expect((await f.invites(eventId)).map(row => row.mentorUserId)).toEqual([f.ids.mentorB.id]);
  });

  it("refuses a Mentor on the Coach event path and on restricted series settings", async () => {
    const f = await fixture();
    const mentor = f.as(f.ids.mentorA);
    await expect(mentor.mutation(api.admin.createEvent, { name: "x", type: "Team", startsAt: Date.now() + DAY, endsAt: Date.now() + DAY + HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] })).rejects.toThrow("Only a Coach or Travel Lead can create events.");
    const refused: [string, Record<string, unknown>, string][] = [
      ["required Everyone", { mandatory: true }, "required"],
      ["required subteam", { audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true }, "required"],
      ["required students", { audienceKind: "students", audienceStudentIds: [f.ids.student], mandatory: true }, "required"],
      ["a fee", { feeCents: 500 }, "fees"],
      ["travel", { travel: "Bus" }, "travel"],
      ["overnight", { overnight: true }, "overnight"],
      ["rooming", { roomingEnabled: true }, "rooming"],
      ["a permission form", { permissionRequired: true }, "permission form"],
      ["a Competition", { type: "Competition" }, "Team meetings only"],
      ["an Outreach event", { type: "Outreach" }, "Team meetings only"],
      ["approval signup", { signupMode: "approval" }, "approval"],
      ["Team Calendar", { addToCalendar: true }, "Team Calendar"],
      ["withdrawal turned off", { allowWithdrawal: false }, "withdrawal"],
      ["media support", { mediaSupportRequested: true }, "media support"],
      ["an on-site meeting", { onsite: true }, "on site"],
      ["a capacity", { capacity: 10 }, "capacity"],
    ];
    for (const [label, extra, message] of refused) await expect(mentor.mutation(api.eventSeries.create, seriesArgs(extra)), label).rejects.toThrow(message);
    expect(await f.t.run(ctx => ctx.db.query("eventSeries").take(5))).toHaveLength(0);
  });

  it("rejects restricted arguments on createMeeting (the Mentor API has no fee, travel or required fields)", async () => {
    const f = await fixture();
    const mentor = f.as(f.ids.mentorA);
    await expect(mentor.mutation(api.mentorMeetings.createMeeting, { ...meeting(), feeCents: 500 } as never)).rejects.toThrow();
    await expect(mentor.mutation(api.mentorMeetings.createMeeting, { ...meeting(), mandatory: true } as never)).rejects.toThrow();
    await expect(mentor.mutation(api.mentorMeetings.createMeeting, { ...meeting(), type: "Competition" } as never)).rejects.toThrow();
  });

  it("lets a Mentor create a repeating Team meeting recorded as theirs, and keeps Coach and Travel Lead unchanged", async () => {
    const f = await fixture();
    const mine = await f.as(f.ids.mentorA).mutation(api.eventSeries.create, seriesArgs());
    expect((await f.t.run(ctx => ctx.db.get(mine.seriesId)))?.createdBy).toBe(f.ids.mentorA.id);
    // Coach and Travel Lead keep every existing power (required Everyone for the Coach only).
    await f.as(f.ids.coach).mutation(api.eventSeries.create, seriesArgs({ name: "Required", mandatory: true }));
    await expect(f.as(f.ids.lead).mutation(api.eventSeries.create, seriesArgs({ name: "Required 2", mandatory: true }))).rejects.toThrow();
    await f.as(f.ids.lead).mutation(api.eventSeries.create, seriesArgs({ name: "Fee", feeCents: 500 }));
    const eventId = await f.as(f.ids.lead).mutation(api.admin.createEvent, { name: "Lead event", type: "Team", startsAt: Date.now() + DAY, endsAt: Date.now() + DAY + HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] });
    expect((await f.event(eventId))?.createdBy).toBe(f.ids.lead.id);
  });

  it("refuses Coach, Student and Parent on the Mentor functions", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent();
    for (const who of [f.ids.coach, f.ids.studentUser, f.ids.parent]) {
      const caller = f.as(who);
      await expect(caller.mutation(api.mentorMeetings.createMeeting, meeting())).rejects.toThrow("Only a Mentor");
      await expect(caller.mutation(api.mentorMeetings.signUp, { eventId })).rejects.toThrow("Only a Mentor");
      await expect(caller.mutation(api.mentorMeetings.withdraw, { eventId })).rejects.toThrow("Only a Mentor");
      await expect(caller.mutation(api.mentorMeetings.editMeeting, { eventId, name: "x" })).rejects.toThrow("Only a Mentor");
      await expect(caller.mutation(api.mentorMeetings.cancelMeeting, { eventId })).rejects.toThrow("Only a Mentor");
      await expect(caller.query(api.mentorMeetings.view, { eventId, asOf: Date.now() })).rejects.toThrow("Only a Mentor");
      await expect(caller.query(api.mentorHome.mentorHome, { asOf: Date.now() })).rejects.toThrow("Only a Mentor");
    }
    await expect(f.t.mutation(api.mentorMeetings.signUp, { eventId })).rejects.toThrow();
  });
});

describe("Mentor edit and cancel", () => {
  it("lets only the creator edit or cancel a meeting", async () => {
    const f = await fixture();
    const eventId = await f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, meeting());
    const other = f.as(f.ids.mentorB);
    await expect(other.mutation(api.mentorMeetings.editMeeting, { eventId, name: "Hijacked" })).rejects.toThrow("only Team meetings you created");
    await expect(other.mutation(api.mentorMeetings.cancelMeeting, { eventId })).rejects.toThrow("only Team meetings you created");
    expect(await f.event(eventId)).toMatchObject({ name: "Pit prep" });
    const mine = f.as(f.ids.mentorA);
    await mine.mutation(api.mentorMeetings.editMeeting, { eventId, name: "Pit prep 2", destination: "Shop" });
    expect(await f.event(eventId)).toMatchObject({ name: "Pit prep 2", destination: "Shop" });
    await mine.mutation(api.mentorMeetings.cancelMeeting, { eventId });
    expect((await f.event(eventId))?.cancelled).toBe(true);
  });

  it("does not let a Mentor change a Coach's meeting, even one with no restricted settings", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ createdBy: f.ids.coach.id });
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.cancelMeeting, { eventId })).rejects.toThrow("only Team meetings you created");
    const legacy = await f.seedEvent();
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.editMeeting, { eventId: legacy, name: "x" })).rejects.toThrow("only Team meetings you created");
  });

  it("checks the stored settings: a creator can't manage a meeting a Coach later made required or paid", async () => {
    const f = await fixture();
    const eventId = await f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, meeting());
    await f.t.run(ctx => ctx.db.patch(eventId, { feeCents: 1000 }));
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.cancelMeeting, { eventId })).rejects.toThrow("only Team meetings you created");
  });

  it("applies the same ownership to a repeating meeting: this-only, this-and-following and end date", async () => {
    const f = await fixture();
    const owned = await seedSeries(f, f.ids.mentorA.id);
    const other = f.as(f.ids.mentorB);
    await expect(other.mutation(api.eventSeries.editOccurrence, { eventId: owned.eventId, name: "x" })).rejects.toThrow("only repeating meetings they created");
    await expect(other.mutation(api.eventSeries.cancelOccurrence, { eventId: owned.eventId })).rejects.toThrow("only repeating meetings they created");
    await expect(other.mutation(api.eventSeries.editFuture, { seriesId: owned.seriesId, fromKey: owned.startDate, name: "x" })).rejects.toThrow("only repeating meetings they created");
    await expect(other.mutation(api.eventSeries.cancelFuture, { seriesId: owned.seriesId, fromKey: owned.startDate })).rejects.toThrow("only repeating meetings they created");
    await expect(other.mutation(api.eventSeries.setEndDate, { seriesId: owned.seriesId, endDate: addDays(owned.startDate, 14) })).rejects.toThrow("only repeating meetings they created");
    expect(await other.query(api.eventSeries.endDateDetails, { seriesId: owned.seriesId })).toBeNull();
    const mine = f.as(f.ids.mentorA);
    await mine.mutation(api.eventSeries.editOccurrence, { eventId: owned.eventId, name: "Renamed once" });
    expect(await f.event(owned.eventId)).toMatchObject({ name: "Renamed once", seriesDetached: true });
    await mine.mutation(api.eventSeries.cancelOccurrence, { eventId: owned.eventId });
    expect((await f.event(owned.eventId))?.cancelled).toBe(true);
  });

  it("does not let a Mentor change a Coach's series", async () => {
    const f = await fixture();
    const coachSeries = await seedSeries(f, f.ids.coach.id);
    await expect(f.as(f.ids.mentorA).mutation(api.eventSeries.cancelOccurrence, { eventId: coachSeries.eventId })).rejects.toThrow("only repeating meetings they created");
    await f.as(f.ids.lead).mutation(api.eventSeries.cancelOccurrence, { eventId: coachSeries.eventId });
  });
});

describe("Mentor self sign-up", () => {
  const day = (n: number) => ({ startsAt: Date.now() + n * DAY, endsAt: Date.now() + n * DAY + HOUR });
  it.each<[string, (f: Fixture) => Promise<Id<"events">>, boolean]>([
    ["Everyone", f => f.seedEvent(), true],
    ["a Subteams audience that includes the Mentor's subteam", f => f.seedEvent({ audienceKind: "subteams", audienceSubteams: ["Programming", "Build"] }), true],
    ["a legacy open event", f => f.seedEvent({ audienceKind: undefined, mandatory: undefined }), true],
    ["a required Everyone meeting (Mentors may still join)", f => f.seedEvent({ mandatory: true, signupMode: "assigned", assignmentScope: "wholeTeam" }), true],
    ["a Subteams audience for other subteams", f => f.seedEvent({ audienceKind: "subteams", audienceSubteams: ["Electrical"] }), false],
    // Owner decision (Nov 6 2026): every event is open to Mentors except one for other subteams only.
    ["specific students", f => f.seedEvent({ audienceKind: "students" }), true],
    ["Mentors only without an invitation", f => f.seedEvent({ audienceKind: "mentorsOnly", signupMode: "assigned" }), true],
    ["a canceled meeting", f => f.seedEvent({ cancelled: true }), false],
    ["an archived meeting", f => f.seedEvent({ archived: true }), false],
    ["a meeting that already ended", f => f.seedEvent({ startsAt: Date.now() - 2 * DAY, endsAt: Date.now() - 2 * DAY + HOUR }), false],
    ["a non-Team event", f => f.seedEvent({ type: "Competition" }), true],
  ])("%s", async (_label, make, allowed) => {
    const f = await fixture();
    const eventId = await make(f);
    const call = f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId });
    if (!allowed) { await expect(call).rejects.toThrow(); expect(await f.invites(eventId)).toHaveLength(0); return; }
    await call;
    const rows = await f.invites(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mentorUserId: f.ids.mentorA.id, source: "self", status: "accepted" });
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId }); // one more tap changes nothing
    expect(await f.invites(eventId)).toHaveLength(1);
  });

  it("matches subteams for the Mentor's own subteams only", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ audienceKind: "subteams", audienceSubteams: ["Build"] });
    await expect(f.as(f.ids.mentorB).mutation(api.mentorMeetings.signUp, { eventId })).rejects.toThrow("isn't open to you");
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId });
  });

  it("lets an invited Mentor sign up for a Mentors-only meeting and keeps how they were invited", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ audienceKind: "mentorsOnly", signupMode: "assigned", ...day(2) });
    await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.mentorB.id, source: "individual", status: "invited", invitedBy: f.ids.coach.id, createdAt: 1 }));
    const mentor = f.as(f.ids.mentorB);
    await mentor.mutation(api.mentorMeetings.signUp, { eventId });
    expect((await f.invites(eventId))[0]).toMatchObject({ source: "individual", status: "accepted" });
    await mentor.mutation(api.mentorMeetings.withdraw, { eventId });
    expect((await f.invites(eventId))[0]).toMatchObject({ source: "individual", status: "declined" });
  });

  it("withdraws a self sign-up by removing it, and refuses when not signed up or after cancellation", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent();
    const mentor = f.as(f.ids.mentorA);
    await expect(mentor.mutation(api.mentorMeetings.withdraw, { eventId })).rejects.toThrow("aren't signed up");
    await mentor.mutation(api.mentorMeetings.signUp, { eventId });
    await mentor.mutation(api.mentorMeetings.withdraw, { eventId });
    expect(await f.invites(eventId)).toHaveLength(0);
    await mentor.mutation(api.mentorMeetings.signUp, { eventId });
    await f.t.run(ctx => ctx.db.patch(eventId, { cancelled: true }));
    await expect(mentor.mutation(api.mentorMeetings.withdraw, { eventId })).rejects.toThrow("no longer available");
  });
});

describe("Mentor meeting projection", () => {
  const RESTRICTED = /fee|balance|charge|health|allerg|medic|permission|email|phone|parent|emergency|legalName|payment|ledger/i;
  const keysOf = (value: unknown): string[] => value && typeof value === "object" ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]) : [];

  async function withRoster(f: Fixture, extra: Partial<Doc<"events">> = {}) {
    const eventId = await f.seedEvent(extra);
    await f.t.run(ctx => ctx.db.insert("participants", { eventId, studentId: f.ids.student, status: "confirmed", createdAt: 1, updatedAt: 1 }));
    return eventId;
  }

  it("names a Mentor with a blank account name 'A Mentor' on the going list", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ createdBy: f.ids.mentorB.id });
    await f.t.run(ctx => ctx.db.patch(f.ids.mentorB.id, { name: "  " }));
    const view = await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(view.mentors.map(mentor => mentor.name)).toEqual(["A Mentor"]);
    expect(mentorDisplayName({ name: " Sam " })).toBe("Sam");
    expect(mentorDisplayName(null)).toBe("Mentor account unavailable");
  });

  it("shows minimized fields, students only to the creator or an accepted Mentor, and never restricted data", async () => {
    const f = await fixture();
    const eventId = await withRoster(f, { createdBy: f.ids.mentorB.id, feeCents: 0 });
    await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.lead.id, source: "individual", status: "accepted", invitedBy: f.ids.coach.id, createdAt: 1 }));
    // A Mentor who can only sign up (no invite yet) sees the meeting and who is going, but no students.
    const eligible = await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(eligible.students).toBeNull();
    expect(eligible.meeting).toMatchObject({ title: "Open lab", place: "Lab", virtual: false, cancelled: false, canSignUp: true, canWithdraw: false, isCreator: false, canManage: false });
    expect(eligible.mentors.map(mentor => mentor.name).sort()).toEqual(["mm-lead", "mm-mentor-b"]);
    // After signing up, the roster appears: display name and subteam only.
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId });
    const joined = await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(joined.students).toEqual([{ displayName: "Sam", subteam: "Build" }]);
    const creator = await f.as(f.ids.mentorB).query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(creator.students).toEqual([{ displayName: "Sam", subteam: "Build" }]);
    expect(creator.meeting.canManage).toBe(true);
    for (const result of [eligible, joined, creator]) {
      expect(keysOf(result).filter(key => RESTRICTED.test(key))).toEqual([]);
      const text = JSON.stringify(result);
      for (const secret of ["example.invalid", "peanuts", "555-0100", "Legal Student Name"]) expect(text).not.toContain(secret);
    }
  });

  it("refuses a meeting that is not the Mentor's to see", async () => {
    const f = await fixture();
    const other = await f.seedEvent({ audienceKind: "subteams", audienceSubteams: ["Electrical"] });
    await expect(f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId: other, asOf: Date.now() })).rejects.toThrow("isn't available to you");
    // A Mentors-only meeting is open to every Mentor (owner decision, Nov 6 2026).
    const mentorsOnly = await f.seedEvent({ audienceKind: "mentorsOnly", signupMode: "assigned" });
    expect((await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId: mentorsOnly, asOf: Date.now() })).meeting.canSignUp).toBe(true);
  });
});

describe("listMeetingMentors", () => {
  it("lists invited, accepted, self and creator Mentors once each with their status", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ createdBy: f.ids.mentorA.id });
    await f.t.run(async ctx => {
      await ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.mentorB.id, source: "individual", status: "invited", invitedBy: f.ids.mentorA.id, createdAt: 1 });
      await ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.lead.id, source: "self", status: "accepted", invitedBy: f.ids.lead.id, createdAt: 1 });
    });
    const list = await f.t.run(ctx => listMeetingMentors(ctx, eventId));
    expect(list).toHaveLength(3);
    expect(list.find(row => row.userId === f.ids.mentorA.id)).toMatchObject({ status: "accepted", source: "creator", isCreator: true });
    expect(list.find(row => row.userId === f.ids.mentorB.id)).toMatchObject({ status: "invited", source: "individual", isCreator: false });
    expect(list.find(row => row.userId === f.ids.lead.id)).toMatchObject({ status: "accepted", source: "self" });
  });
});

describe("Mentor security limits (review fixes)", () => {
  it("keeps the creator on a split only while the series is still Mentor-safe", async () => {
    const f = await fixture();
    const safe = await seedSeries(f, f.ids.mentorA.id);
    const split = await f.as(f.ids.coach).mutation(api.eventSeries.editFuture, { seriesId: safe.seriesId, fromKey: safe.startDate, name: "Renamed" });
    expect((await f.t.run(ctx => ctx.db.get(split.seriesId)))?.createdBy).toBe(f.ids.mentorA.id);
    // A former Travel Lead's series with a fee: the editing Coach owns the new series.
    const paid = await seedSeries(f, f.ids.mentorA.id);
    await f.t.run(async ctx => { const row = await ctx.db.get(paid.seriesId); await ctx.db.patch(paid.seriesId, { template: { ...row!.template, feeCents: 500 } }); });
    const paidSplit = await f.as(f.ids.coach).mutation(api.eventSeries.editFuture, { seriesId: paid.seriesId, fromKey: paid.startDate, name: "Renamed" });
    expect((await f.t.run(ctx => ctx.db.get(paidSplit.seriesId)))?.createdBy).toBe(f.ids.coach.id);
  });

  it("stops a Mentor from managing a meeting whose stored settings were turned restricted", async () => {
    const f = await fixture();
    const eventId = await f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, meeting());
    await f.t.run(ctx => ctx.db.patch(eventId, { mediaSupportRequested: true }));
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.cancelMeeting, { eventId })).rejects.toThrow("only Team meetings you created");
  });

  it("lets a Parent with Mentor staff access use every Mentor meeting function (Mentor first; owner decision Nov 6 2026)", async () => {
    const f = await fixture();
    const { parentMentor } = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "mm-parent-mentor@example.invalid" });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name: "mm-parent-mentor", email: "mm-parent-mentor@example.invalid", role: "parent", parentStaffAccess: "mentor", travelLead: false, financialEdit: false, active: true });
      const session = await ctx.db.insert("authSessions", { userId: auth, expirationTime: Date.now() + DAY });
      await ctx.db.insert("operatingRoles", { sessionId: session, userId: id, role: "mentor", accessRevision: 0 });
      return { parentMentor: { auth, id, session } };
    });
    const caller = f.t.withIdentity({ subject: `${parentMentor.auth}|${parentMentor.session}` });
    const eventId = await f.seedEvent();
    const created = await caller.mutation(api.mentorMeetings.createMeeting, meeting());
    expect((await f.event(created))?.createdBy).toBe(parentMentor.id);
    const { seriesId } = await caller.mutation(api.eventSeries.create, seriesArgs());
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.createdBy).toBe(parentMentor.id);
    await caller.mutation(api.mentorMeetings.signUp, { eventId });
    expect(await f.invites(eventId)).toEqual([expect.objectContaining({ mentorUserId: parentMentor.id, source: "self", status: "accepted" })]);
    expect((await caller.query(api.mentorMeetings.view, { eventId, asOf: Date.now() })).meeting.myStatus).toBe("accepted");
    expect((await caller.query(api.studentSubteams.listMentorsForInvite, {})).map(row => row.id)).toContain(parentMentor.id);
    // Their Parent data access does not widen: a student's full profile stays closed to them.
    await expect(caller.query(api.app.studentProfile, { studentId: f.ids.student })).rejects.toThrow("permission");
  });

  it("refuses to move a Mentor meeting into the past or change its time once attendance exists", async () => {
    const f = await fixture();
    const mine = f.as(f.ids.mentorA);
    const eventId = await mine.mutation(api.mentorMeetings.createMeeting, meeting());
    await expect(mine.mutation(api.mentorMeetings.editMeeting, { eventId, startsAt: Date.now() - HOUR, endsAt: Date.now() + HOUR })).rejects.toThrow("hasn't passed");
    await f.t.run(async ctx => {
      const row = (await ctx.db.get(eventId))!;
      const meetingId = await ctx.db.insert("attendanceMeetings", { seasonId: f.ids.season, kind: "Outreach", startsAt: row.startsAt, cancelled: false, eventId });
      await ctx.db.insert("attendanceRecords", { meetingId, studentId: f.ids.student, present: true, recordedBy: f.ids.coach.id });
    });
    await expect(mine.mutation(api.mentorMeetings.editMeeting, { eventId, startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + HOUR })).rejects.toThrow("Attendance has already been taken");
    await mine.mutation(api.mentorMeetings.editMeeting, { eventId, name: "Same time, new title" });
  });

  it("queues one digest item per meeting, actor, activity and day when a Mentor toggles sign-up", async () => {
    const f = await fixture();
    const eventId = await f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, meeting());
    const joiner = f.as(f.ids.mentorB);
    for (let i = 0; i < 3; i++) { await joiner.mutation(api.mentorMeetings.signUp, { eventId }); await joiner.mutation(api.mentorMeetings.withdraw, { eventId }); }
    const items = await f.t.run(ctx => ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", f.ids.mentorA.id)).take(20));
    expect(items.filter(item => item.dedupeKey?.includes(":m5:")).length).toBe(2); // one joined, one left
  });
});

describe("Mentor review fixes (round 2)", () => {
  it.each<[string, Partial<Doc<"events">>, boolean]>([
    ["a required whole-team meeting", { mandatory: true, signupMode: "assigned", assignmentScope: "wholeTeam" }, true],
    ["a required subteam meeting", { audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true }, true],
    ["an on-site meeting", { travel: "DSHS STEM Center (on site)", onsite: true }, true],
    // Owner decision (Nov 6 2026): fees, travel, overnight, rooming and permission forms no longer keep Mentors out.
    ["a fee", { feeCents: 500 }, true],
    ["travel", { travel: "Charter Bus" }, true],
    ["overnight", { overnight: true }, true],
    ["rooming", { roomingEnabled: true }, true],
    ["a permission form", { permissionRequired: true }, true],
    ["a Subteams audience for other subteams", { audienceKind: "subteams", audienceSubteams: ["Electrical"] }, false],
  ])("self sign-up, the joinable list and view: %s", async (_label, extra, allowed) => {
    const f = await fixture();
    const eventId = await f.seedEvent(extra);
    const mentor = f.as(f.ids.mentorA);
    const home = await mentor.query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.signUpAvailable.map(row => row.eventId).includes(eventId)).toBe(allowed);
    const call = mentor.mutation(api.mentorMeetings.signUp, { eventId, canDriveStudents: false, needsHotelRoom: false });
    if (allowed) await call;
    else {
      await expect(call).rejects.toThrow("isn't open to you");
      await expect(mentor.query(api.mentorMeetings.view, { eventId, asOf: Date.now() })).rejects.toThrow("isn't available");
    }
  });

  it("refuses to leave a meeting that is over", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ startsAt: Date.now() - 3 * HOUR, endsAt: Date.now() - HOUR });
    await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.mentorA.id, source: "self", status: "accepted", invitedBy: f.ids.mentorA.id, createdAt: 1 }));
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.withdraw, { eventId })).rejects.toThrow("no longer available");
    expect(await f.invites(eventId)).toHaveLength(1);
  });

  it("lets the creator change only the end time of a meeting in progress, but not move its start into the past", async () => {
    const f = await fixture();
    const startsAt = Date.now() - HOUR;
    const eventId = await f.seedEvent({ createdBy: f.ids.mentorA.id, startsAt, endsAt: Date.now() + HOUR });
    const mine = f.as(f.ids.mentorA);
    await mine.mutation(api.mentorMeetings.editMeeting, { eventId, endsAt: Date.now() + 3 * HOUR });
    expect((await f.event(eventId))?.startsAt).toBe(startsAt);
    await expect(mine.mutation(api.mentorMeetings.editMeeting, { eventId, startsAt: startsAt - HOUR })).rejects.toThrow("hasn't passed");
  });

  it("does not invite a Mentor's own series creator (creation and generation)", async () => {
    const f = await fixture();
    const startDate = addDays(chicagoDate(Date.now()), 1);
    const rule = { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 60 };
    const { seriesId } = await f.as(f.ids.mentorA).mutation(api.eventSeries.create, { ...seriesArgs(), audienceKind: "subteams", audienceSubteams: ["Build"], inviteSubteamMentors: true, mentorInviteUserIds: [f.ids.mentorB.id, f.ids.mentorA.id], rule });
    const series = (await f.t.run(ctx => ctx.db.get(seriesId)))!;
    expect([...(series.mentorInviteIds ?? []), ...(series.subteamMentorInviteIds ?? [])]).not.toContain(f.ids.mentorA.id);
    expect(series.mentorInviteIds).toContain(f.ids.mentorB.id);
    // Older series rows that still hold the creator are filtered when meetings are generated.
    expect(seriesMentorInvites({ ...series, mentorInviteIds: [f.ids.mentorA.id, f.ids.mentorB.id], subteamMentorInviteIds: [f.ids.mentorA.id] })).toEqual([{ mentorUserId: f.ids.mentorB.id, source: "individual" }]);
  });

  it("lets a Parent with Mentor staff access read and change their own series too", async () => {
    const f = await fixture();
    const parentMentor = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "mm-pm2@example.invalid" });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name: "mm-pm2", email: "mm-pm2@example.invalid", role: "parent", parentStaffAccess: "mentor", travelLead: false, financialEdit: false, active: true });
      const session = await ctx.db.insert("authSessions", { userId: auth, expirationTime: Date.now() + DAY });
      await ctx.db.insert("operatingRoles", { sessionId: session, userId: id, role: "mentor", accessRevision: 0 });
      return { auth, id, session };
    });
    const owned = await seedSeries(f, parentMentor.id); // even a series recorded under that account
    const caller = f.t.withIdentity({ subject: `${parentMentor.auth}|${parentMentor.session}` });
    expect(await caller.query(api.eventSeries.endDateDetails, { seriesId: owned.seriesId })).not.toBeNull();
    await caller.mutation(api.eventSeries.setEndDate, { seriesId: owned.seriesId, endDate: addDays(owned.startDate, 14) });
    // Not someone else's series.
    const others = await seedSeries(f, f.ids.mentorA.id);
    expect(await caller.query(api.eventSeries.endDateDetails, { seriesId: others.seriesId })).toBeNull();
  });

  it("M4 continues across pages: every eligible Mentor is covered, one page per transaction", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 5; i++) {
        const auth = await ctx.db.insert("users", { email: `mm-extra-${i}@example.invalid` });
        await ctx.db.insert("appUsers", { authUserId: auth, name: `mm-extra-${i}`, email: `mm-extra-${i}@example.invalid`, role: "mentor", travelLead: false, financialEdit: false, active: true });
      }
    });
    const eventId = await f.seedEvent({ createdBy: f.ids.mentorA.id, name: "Paged meeting" });
    const next = await f.t.run(ctx => queueMentorMeetingOpenDigestPage(ctx, { eventId, cursor: null, pageSize: 2 }));
    expect(next).not.toBeNull(); // more Mentors remain: a follow-up page was scheduled
    for (let i = 0; i < 5; i++) { await new Promise(resolve => setTimeout(resolve, 20)); await f.t.finishInProgressScheduledFunctions(); }
    const recipients = await f.t.run(async ctx => (await ctx.db.query("notifications").take(100)).filter(row => row.title === "New meeting: Paged meeting").map(row => row.userId));
    const mentors = await f.t.run(async ctx => (await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor")).take(100)).map(row => row._id));
    expect(new Set(recipients).size).toBe(recipients.length);
    expect([...recipients].sort()).toEqual(mentors.filter(id => id !== f.ids.mentorA.id).sort());
  });
});

describe("Mentor review fixes (round 3)", () => {
  it("gives a former Travel Lead no creator rights on a travel/fee Competition they created", async () => {
    const f = await fixture();
    // admin.ts stamps createdBy on every event, so the Travel Lead is recorded as this Competition's creator.
    const eventId = await f.seedEvent({ name: "State championship", type: "Competition", travel: "Charter Bus", feeCents: 2500, createdBy: f.ids.lead.id });
    await f.t.run(async ctx => {
      await ctx.db.insert("participants", { eventId, studentId: f.ids.student, status: "confirmed", createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(f.ids.lead.id, { travelLead: false }); // loses Travel Lead: now a plain Mentor
      await ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.mentorB.id, source: "individual", status: "invited", invitedBy: f.ids.coach.id, createdAt: 1 });
    });
    const former = f.as(f.ids.lead);
    // They may open it (every event is open to Mentors), but with no creator rights: no roster, no pending Mentors, no manage.
    const view = await former.query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(view.meeting).toMatchObject({ isCreator: false, canManage: false });
    expect(view.students).toBeNull();
    expect(view.pendingMentors).toEqual([]);
    const home = await former.query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.created.map(row => row.eventId)).not.toContain(eventId);
    await expect(former.mutation(api.mentorMeetings.editMeeting, { eventId, name: "Renamed" })).rejects.toThrow("only Team meetings you created");
    // M5: another Mentor accepting doesn't notify the former Travel Lead.
    await f.as(f.ids.mentorB).mutation(api.mentorInvites.respond, { eventId, status: "accepted", canDriveStudents: true });
    const items = await f.t.run(ctx => ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", f.ids.lead.id)).take(20));
    expect(items.filter(item => item.dedupeKey?.includes(":m5:"))).toHaveLength(0);
  });

  it("clamps the M4 page size and refuses a non-finite one", async () => {
    expect(openDigestPageSize(undefined)).toBe(OPEN_DIGEST_PAGE_SIZE);
    expect(openDigestPageSize(0)).toBe(1);
    expect(openDigestPageSize(-5)).toBe(1);
    expect(openDigestPageSize(2.7)).toBe(2);
    expect(openDigestPageSize(1e9)).toBe(MAX_DIGEST_USERS);
    expect(() => openDigestPageSize(Number.NaN)).toThrow("finite");
    expect(() => openDigestPageSize(Number.POSITIVE_INFINITY)).toThrow("finite");
    const f = await fixture();
    const eventId = await f.seedEvent({ createdBy: f.ids.mentorA.id });
    await expect(f.t.mutation(internal.mentorMeetings.continueOpenDigest, { eventId, cursor: null, pageSize: Number.NaN })).rejects.toThrow("finite");
  });

  it("cuts each Mentor Home list to 100, marks it truncated, and skips ended series", async () => {
    const f = await fixture();
    const mentor = f.as(f.ids.mentorB);
    expect((await mentor.query(api.mentorHome.mentorHome, { asOf: Date.now() })).truncated).toBe(false);
    await f.t.run(async ctx => {
      for (let i = 0; i < 105; i++) {
        const eventId = await ctx.db.insert("events", {
          seasonId: f.ids.season, name: `Lab ${i}`, type: "Team", startsAt: Date.now() + DAY + i * HOUR, endsAt: Date.now() + DAY + (i + 1) * HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
          signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false,
        });
        await ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.mentorB.id, source: "self", status: "accepted", invitedBy: f.ids.mentorB.id, createdAt: 1 });
      }
    });
    const home = await mentor.query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.scheduled).toHaveLength(100);
    expect(home.scheduled[0].title).toBe("Lab 0");
    expect(home.truncated).toBe(true);
    // An ended series' meetings aren't read for the created list.
    const ended = await seedSeries(f, f.ids.mentorA.id);
    await f.t.run(ctx => ctx.db.patch(ended.seriesId, { status: "ended" }));
    const creatorHome = await f.as(f.ids.mentorA).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(creatorHome.created.map(row => row.eventId)).not.toContain(ended.eventId);
    expect(creatorHome.createdSeries).toHaveLength(0);
  });

  it("refuses Mentor meetings longer than 12 hours (create, edit and repeating)", async () => {
    const f = await fixture();
    const mine = f.as(f.ids.mentorA);
    const startsAt = Date.now() + DAY;
    await expect(mine.mutation(api.mentorMeetings.createMeeting, meeting({ startsAt, endsAt: startsAt + 13 * HOUR }))).rejects.toThrow("up to 12 hours");
    const eventId = await mine.mutation(api.mentorMeetings.createMeeting, meeting({ startsAt, endsAt: startsAt + 12 * HOUR }));
    await expect(mine.mutation(api.mentorMeetings.editMeeting, { eventId, endsAt: startsAt + 12 * HOUR + 1 })).rejects.toThrow("up to 12 hours");
    await mine.mutation(api.mentorMeetings.editMeeting, { eventId, name: "Long build" }); // other edits still work
    const startDate = addDays(chicagoDate(Date.now()), 1);
    await expect(mine.mutation(api.eventSeries.create, seriesArgs({ rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "08:00", durationMinutes: 13 * 60 } }))).rejects.toThrow("12 hours");
  });

  it("removes a self sign-up declined through respond, and refuses answers for meetings that are over or in another season", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent();
    const mentor = f.as(f.ids.mentorA);
    await mentor.mutation(api.mentorMeetings.signUp, { eventId });
    await mentor.mutation(api.mentorInvites.respond, { eventId, status: "declined" });
    expect(await f.invites(eventId)).toHaveLength(0);
    const past = await f.seedEvent({ startsAt: Date.now() - 3 * HOUR, endsAt: Date.now() - HOUR });
    const otherSeason = await f.t.run(async ctx => {
      const season = await ctx.db.insert("seasons", { name: "Synthetic 2025–26", year: 2026, startsAt: Date.parse("2025-08-01T05:00:00Z"), status: "archived", permissionVersion: "DRAFT", createdBy: f.ids.coach.id });
      const { _id, _creationTime, ...copy } = (await ctx.db.get(eventId))!;
      return await ctx.db.insert("events", { ...copy, seasonId: season });
    });
    for (const id of [past, otherSeason]) {
      await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId: id, mentorUserId: f.ids.mentorA.id, source: "individual", status: "invited", invitedBy: f.ids.coach.id, createdAt: 1 }));
      await expect(mentor.mutation(api.mentorInvites.respond, { eventId: id, status: "accepted" })).rejects.toThrow("no longer available");
    }
  });

  it("doesn't let the creator also self-sign-up to their own meeting (they're already on it)", async () => {
    const f = await fixture();
    const mine = f.as(f.ids.mentorA);
    const eventId = await mine.mutation(api.mentorMeetings.createMeeting, meeting());
    expect((await mine.query(api.mentorMeetings.view, { eventId, asOf: Date.now() })).meeting.canSignUp).toBe(false);
    await expect(mine.mutation(api.mentorMeetings.signUp, { eventId })).rejects.toThrow("already on it");
    expect(await f.invites(eventId)).toHaveLength(0);
    expect(await f.t.run(ctx => listMeetingMentors(ctx, eventId))).toEqual([{ userId: f.ids.mentorA.id, status: "accepted", source: "creator", isCreator: true }]);
  });
});

describe("Mentor review fixes (round 4)", () => {
  /** A Mentor series with three weekly future meetings (keys startDate, +7, +14), as if generated. */
  async function seedWeekly(f: Fixture, createdBy: Id<"appUsers">) {
    return await f.t.run(async ctx => {
      const startDate = addDays(chicagoDate(Date.now()), 3);
      const seriesId = await ctx.db.insert("eventSeries", {
        seasonId: f.ids.season, createdBy, createdAt: 1, name: "Weekly build", status: "active", origin: "created",
        template: { type: "Team", destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: "everyone", mandatory: false },
        localStartTime: "18:00", durationMinutes: 120, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, startDate, timeZone: "America/Chicago", templateRevision: 1,
      });
      const eventIds: Id<"events">[] = [];
      for (const week of [0, 1, 2]) eventIds.push(await ctx.db.insert("events", {
        seasonId: f.ids.season, name: "Weekly build", type: "Team", startsAt: Date.now() + (3 + 7 * week) * DAY, endsAt: Date.now() + (3 + 7 * week) * DAY + 2 * HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
        signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false, seriesId, seriesOccurrenceKey: addDays(startDate, 7 * week),
      }));
      return { seriesId, eventIds, startDate };
    });
  }

  it("refuses a Mentor's series-wide change that would touch a meeting a Coach changed, and allows the rest", async () => {
    const f = await fixture();
    const mentor = f.as(f.ids.mentorA);
    const touched = await seedWeekly(f, f.ids.mentorA.id);
    // A Coach marks the last meeting Outreach (eventOperations.updateSettings), which doesn't detach it.
    await f.t.run(ctx => ctx.db.patch(touched.eventIds[2], { isOutreach: true }));
    const message = "A Coach changed a meeting in this series. Ask a Coach to make this change.";
    const second = addDays(touched.startDate, 7);
    await expect(mentor.mutation(api.eventSeries.setEndDate, { seriesId: touched.seriesId, endDate: touched.startDate })).rejects.toThrow(message);
    await expect(mentor.mutation(api.eventSeries.editFuture, { seriesId: touched.seriesId, fromKey: second, name: "Renamed" })).rejects.toThrow(message);
    await expect(mentor.mutation(api.eventSeries.cancelFuture, { seriesId: touched.seriesId, fromKey: second })).rejects.toThrow(message);
    expect((await f.event(touched.eventIds[2]))?.cancelled).toBeUndefined();
    // Ending the series after the changed meeting doesn't touch it; a Coach can still make the change.
    await expect(mentor.mutation(api.eventSeries.setEndDate, { seriesId: touched.seriesId, endDate: addDays(touched.startDate, 14) })).resolves.toMatchObject({ cancelled: 0 });
    await expect(f.as(f.ids.coach).mutation(api.eventSeries.cancelFuture, { seriesId: touched.seriesId, fromKey: second })).resolves.toEqual({ cancelled: 2 });

    const clean = await seedWeekly(f, f.ids.mentorA.id);
    await expect(mentor.mutation(api.eventSeries.setEndDate, { seriesId: clean.seriesId, endDate: addDays(clean.startDate, 7) })).resolves.toMatchObject({ cancelled: 1 });
    const other = await seedWeekly(f, f.ids.mentorA.id);
    await mentor.mutation(api.eventSeries.editFuture, { seriesId: other.seriesId, fromKey: addDays(other.startDate, 7), name: "Renamed" });
    expect((await f.event(other.eventIds[1]))?.name).toBe("Renamed");
    await mentor.mutation(api.eventSeries.cancelFuture, { seriesId: clean.seriesId, fromKey: clean.startDate });
    expect((await f.event(clean.eventIds[0]))?.cancelled).toBe(true);
  });
});

describe("Mentor sign-up v2 review fixes", () => {
  it("counts the creator as going only on a Mentor meeting; a Travel Lead's overnight Competition is joined like anyone else", async () => {
    const f = await fixture();
    const trip = await f.seedEvent({ name: "Overnight regional", type: "Competition", travel: "Charter Bus", overnight: true, createdBy: f.ids.lead.id });
    // Not on it just for creating it: no M1/M2 recipient row, nothing in the counts.
    expect(await f.t.run(ctx => listMeetingMentors(ctx, trip))).toEqual([]);
    const lead = f.as(f.ids.lead);
    expect((await lead.query(api.mentorMeetings.view, { eventId: trip, asOf: Date.now() })).meeting).toMatchObject({ isCreator: false, canSignUp: true, questions: { askDrive: true, askHotel: true } });
    // They sign up through the normal wizard, answering the drive/hotel questions.
    await expect(lead.mutation(api.mentorMeetings.signUp, { eventId: trip })).rejects.toThrow("drive students");
    await lead.mutation(api.mentorMeetings.signUp, { eventId: trip, canDriveStudents: true, needsHotelRoom: false });
    expect(await f.invites(trip)).toEqual([expect.objectContaining({ mentorUserId: f.ids.lead.id, source: "self", status: "accepted", canDriveStudents: true, needsHotelRoom: false })]);
    expect(await f.t.run(ctx => listMeetingMentors(ctx, trip))).toEqual([{ userId: f.ids.lead.id, status: "accepted", source: "self", isCreator: false }]);
    expect((await f.as(f.ids.coach).query(api.mentorInvites.forEventSummary, { eventId: trip })).counts).toMatchObject({ accepted: 1, drivers: 1, hotelRooms: 0 });
    // Withdrawing takes them off it again.
    await lead.mutation(api.mentorMeetings.withdraw, { eventId: trip });
    expect(await f.t.run(ctx => listMeetingMentors(ctx, trip))).toEqual([]);
  });

  it("a stale or zero asOf can't open a past event the Mentor wasn't part of", async () => {
    const f = await fixture();
    const archived = await f.seedEvent({ name: "Last week", startsAt: Date.now() - 8 * DAY, endsAt: Date.now() - 7 * DAY, archived: true });
    const notSwept = await f.seedEvent({ name: "Ended", startsAt: Date.now() - 3 * HOUR, endsAt: Date.now() - HOUR }); // created after it ended
    const mentor = f.as(f.ids.mentorA);
    for (const eventId of [archived, notSwept]) {
      for (const asOf of [0, Date.now() - 30 * DAY]) await expect(mentor.query(api.mentorMeetings.view, { eventId, asOf })).rejects.toThrow("isn't available to you");
    }
    await expect(mentor.query(api.mentorMeetings.view, { eventId: notSwept, asOf: Number.NaN })).rejects.toThrow("no longer available");
    // A Mentor who was on it can still open it.
    await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId: archived, mentorUserId: f.ids.mentorA.id, source: "individual", status: "accepted", invitedBy: f.ids.coach.id, createdAt: 1 }));
    expect((await mentor.query(api.mentorMeetings.view, { eventId: archived, asOf: 0 })).meeting).toMatchObject({ myStatus: "accepted", canSignUp: false, canWithdraw: false });
  });

  it("refuses to invite by subteam, or to list Mentors, when one account list is over its cap instead of silently cutting it", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i <= MAX_MENTOR_LIST; i++) {
        const auth = await ctx.db.insert("users", { email: `mm-pm-${i}@example.invalid` });
        await ctx.db.insert("appUsers", { authUserId: auth, name: `mm-pm-${i}`, email: `mm-pm-${i}@example.invalid`, role: "parent", parentStaffAccess: "mentor", subteams: ["Build"], travelLead: false, financialEdit: false, active: true });
      }
    });
    expect(MAX_SUBTEAM_MENTOR_LIST).toBe(MAX_MENTOR_LIST);
    await expect(f.t.run(ctx => mentorsForSubteams(ctx, ["Build"]))).rejects.toThrow(TOO_MANY_SUBTEAM_MENTORS_MESSAGE);
    await expect(f.as(f.ids.coach).query(api.studentSubteams.listMentorsForInvite, {})).rejects.toThrow(MENTOR_LIST_TOO_LONG_MESSAGE);
  });

  it("M4 covers every Parent with Mentor access even past the inline cap (paged, never cut short)", async () => {
    const f = await fixture();
    const parents = await f.t.run(async ctx => {
      const out: Id<"appUsers">[] = [];
      for (let i = 0; i <= MAX_INLINE_PARENT_MENTORS; i++) {
        const auth = await ctx.db.insert("users", { email: `mm-m4p-${i}@example.invalid` });
        out.push(await ctx.db.insert("appUsers", { authUserId: auth, name: `mm-m4p-${i}`, email: `mm-m4p-${i}@example.invalid`, role: "parent", parentStaffAccess: "mentor", travelLead: false, financialEdit: false, active: true }));
      }
      return out;
    });
    const eventId = await f.seedEvent({ createdBy: f.ids.coach.id, name: "Many parents" });
    expect(await f.t.run(ctx => queueMentorMeetingOpenDigestPage(ctx, { eventId, cursor: null }))).toBeNull(); // Mentor accounts fit in one page
    for (let i = 0; i < 5; i++) { await new Promise(resolve => setTimeout(resolve, 20)); await f.t.finishInProgressScheduledFunctions(); }
    const recipients = new Set(await f.t.run(async ctx => (await ctx.db.query("notifications").take(1000)).filter(row => row.title === "New meeting: Many parents").map(row => row.userId)));
    for (const id of [...parents, f.ids.mentorA.id, f.ids.mentorB.id, f.ids.lead.id]) expect(recipients.has(id)).toBe(true);
    expect(recipients.size).toBe(parents.length + 3);
  });
});

describe("Created by on Coach and Travel Lead screens (owner decision, Nov 7 2026)", () => {
  it("gives the Coach and Travel Lead list and event page the creator's name and role, tagging only Mentor meetings, and nobody else", async () => {
    const f = await fixture();
    const series = await seedSeries(f, f.ids.mentorA.id); // a series meeting has no createdBy of its own: the series creator counts
    const cases = [
      ["a Mentor's meeting", await f.seedEvent({ name: "Mentor lab", createdBy: f.ids.mentorA.id }), { name: "mm-mentor-a", roleLabel: "Mentor", mentorMeeting: true }],
      ["a Mentor's series meeting", series.eventId, { name: "mm-mentor-a", roleLabel: "Mentor", mentorMeeting: true }],
      ["a Mentor's meeting a Coach later made paid", await f.seedEvent({ name: "Paid lab", feeCents: 500, createdBy: f.ids.mentorA.id }), { name: "mm-mentor-a", roleLabel: "Mentor", mentorMeeting: false }],
      ["a Coach's event", await f.seedEvent({ name: "Coach lab", createdBy: f.ids.coach.id }), { name: "mm-coach", roleLabel: "Coach", mentorMeeting: false }],
      ["a Travel Lead's Team meeting", await f.seedEvent({ name: "Lead lab", createdBy: f.ids.lead.id }), { name: "mm-lead", roleLabel: "Travel Lead", mentorMeeting: false }],
      ["an event with no recorded creator", await f.seedEvent({ name: "Old lab" }), null],
    ] as const;
    for (const who of [f.ids.coach, f.ids.lead]) {
      const rows = await f.as(who).query(api.app.listEvents, {});
      for (const [label, eventId, createdBy] of cases) {
        const row = rows.find(row => row.event._id === eventId);
        expect(row && "createdBy" in row ? row.createdBy : "missing", label).toEqual(createdBy);
        const detail = await f.as(who).query(api.app.eventDetail, { eventId });
        expect("createdBy" in detail ? detail.createdBy : "missing", label).toEqual(createdBy);
      }
    }
    // Plain Mentors and Students get no creator details.
    for (const who of [f.ids.mentorB, f.ids.studentUser]) {
      const rows = await f.as(who).query(api.app.listEvents, {});
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(row => !("createdBy" in row))).toBe(true);
    }
    expect("createdBy" in await f.as(f.ids.mentorB).query(api.app.eventDetail, { eventId: cases[0][1] })).toBe(false);
  });

  it("gives creator details to a Parent acting as Travel Lead, but not to a plain Parent or a Parent acting as Mentor", async () => {
    const f = await fixture();
    // A legacy event (no audience saved) so a Parent without Family links can see it too.
    const eventId = await f.seedEvent({ name: "Legacy lab", createdBy: f.ids.coach.id });
    await f.t.run(ctx => ctx.db.patch(eventId, { audienceKind: undefined }));
    const callers = await f.t.run(async ctx => {
      async function parentActingAs(name: string, parentStaffAccess: "mentor" | "travelLead", role: "mentor" | "travelLead") {
        const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
        const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role: "parent", parentStaffAccess, travelLead: false, financialEdit: false, active: true });
        const session = await ctx.db.insert("authSessions", { userId: auth, expirationTime: Date.now() + DAY });
        await ctx.db.insert("operatingRoles", { sessionId: session, userId: id, role, accessRevision: 0 });
        return { auth, session };
      }
      return { travelLead: await parentActingAs("mm-parent-tl", "travelLead", "travelLead"), mentor: await parentActingAs("mm-parent-m", "mentor", "mentor") };
    });
    const session = (who: { auth: Id<"users">; session: Id<"authSessions"> }) => f.t.withIdentity({ subject: `${who.auth}|${who.session}` });
    const cases = [
      ["a Parent acting as Travel Lead", session(callers.travelLead), { name: "mm-coach", roleLabel: "Coach", mentorMeeting: false }],
      ["a Parent acting as Mentor", session(callers.mentor), "missing"],
      ["a plain Parent", f.as(f.ids.parent), "missing"],
    ] as const;
    for (const [label, caller, createdBy] of cases) {
      const row = (await caller.query(api.app.listEvents, {})).find(row => row.event._id === eventId);
      expect(row, label).toBeDefined();
      expect(row && "createdBy" in row ? row.createdBy : "missing", label).toEqual(createdBy);
      const detail = await caller.query(api.app.eventDetail, { eventId });
      expect("createdBy" in detail ? detail.createdBy : "missing", label).toEqual(createdBy);
    }
  });
});

describe("Mentor meetings on Team Calendar (owner decision, Nov 7 2026)", () => {
  /** eventCalendar.push runs scheduled here (convex-test doesn't run it): the revisions queued for one event. */
  const queuedPushes = (f: Fixture, eventId: Id<"events">) => f.t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").take(50))
    .filter(job => job.name.includes("eventCalendar") && job.name.includes("push") && (job.args[0] as { eventId?: string }).eventId === eventId)
    .map(job => (job.args[0] as { revision: number }).revision));

  it.each([
    ["Add to Team Calendar", { calendarChoice: { kind: "create" as const } }, true],
    ["left off Team Calendar", { calendarChoice: { kind: "none" as const } }, false],
    ["no choice sent", {}, false],
  ])("one-time meeting, %s", async (_, extra, onCalendar) => {
    const f = await fixture();
    const eventId = await f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, meeting(extra));
    const stored = await f.event(eventId);
    if (onCalendar) expect(stored).toMatchObject({ calendarChoice: "create", calendarCreatedByMentor: true, calendarSyncState: "pending", calendarRevision: 1, calendarActorId: f.ids.mentorA.id, createdBy: f.ids.mentorA.id });
    else expect([stored?.calendarChoice, stored?.calendarCreatedByMentor]).toEqual([undefined, undefined]);
    expect(await queuedPushes(f, eventId)).toEqual(onCalendar ? [1] : []);
    // Still the Mentor's own meeting: they count as going and may manage it.
    const view = await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(view.meeting).toMatchObject({ isCreator: true, canManage: true });
    expect(view.mentors.map(m => m.isCreator)).toEqual([true]);
  });

  it("refuses a Mentor's request to connect an existing Calendar entry", async () => {
    const f = await fixture();
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.createMeeting, meeting({ calendarChoice: { kind: "link", eventId: "existing1" } }) as never)).rejects.toThrow();
    expect(await f.t.run(ctx => ctx.db.query("eventCalendarClaims").take(5))).toEqual([]);
  });

  it("lets the creator edit and cancel it with the opened revision, pushing each change; nobody else may", async () => {
    const f = await fixture();
    const mine = f.as(f.ids.mentorA), other = f.as(f.ids.mentorB);
    const eventId = await mine.mutation(api.mentorMeetings.createMeeting, meeting({ calendarChoice: { kind: "create" } }));
    await expect(other.mutation(api.mentorMeetings.editMeeting, { eventId, expectedRevision: 1, name: "Hijacked" })).rejects.toThrow("only Team meetings you created");
    await expect(other.mutation(api.mentorMeetings.cancelMeeting, { eventId, expectedRevision: 1 })).rejects.toThrow("only Team meetings you created");
    // A Team Calendar meeting always needs the revision the Mentor opened, as on the Coach path.
    await expect(mine.mutation(api.mentorMeetings.editMeeting, { eventId, name: "No revision" })).rejects.toThrow("changed since you opened it");
    await f.t.run(ctx => ctx.db.patch(eventId, { calendarSyncState: "synced", calendarEtag: "etag-1", calendarEventId: "ssabc" }));
    await mine.mutation(api.mentorMeetings.editMeeting, { eventId, expectedRevision: 1, name: "Pit prep 2" });
    expect(await f.event(eventId)).toMatchObject({ name: "Pit prep 2", calendarRevision: 2, calendarSyncState: "pending", calendarActorId: f.ids.mentorA.id });
    await expect(mine.mutation(api.mentorMeetings.cancelMeeting, { eventId, expectedRevision: 1 })).rejects.toThrow("changed since you opened it");
    await mine.mutation(api.mentorMeetings.cancelMeeting, { eventId, expectedRevision: 2 });
    expect(await f.event(eventId)).toMatchObject({ cancelled: true, calendarRevision: 3, calendarSyncState: "pending" });
    expect(await queuedPushes(f, eventId)).toEqual([1, 2, 3]);
  });

  it("keeps a meeting a Coach later put on Team Calendar Coach-managed, even for its Mentor creator", async () => {
    const f = await fixture();
    const mine = f.as(f.ids.mentorA);
    const eventId = await mine.mutation(api.mentorMeetings.createMeeting, meeting({ calendarChoice: { kind: "none" } }));
    expect((await mine.query(api.mentorMeetings.view, { eventId, asOf: Date.now() })).meeting).toMatchObject({ isCreator: true, canManage: true });
    // A separate new entry, added by a Coach after creation: same calendarChoice "create" as the Mentor's own, but not the Mentor's.
    await f.as(f.ids.coach).mutation(api.eventCalendar.connect, { eventId, calendarChoice: { kind: "create" } });
    const connected = await f.event(eventId);
    expect([connected?.calendarChoice, connected?.calendarCreatedByMentor]).toEqual(["create", undefined]);
    expect((await mine.query(api.mentorMeetings.view, { eventId, asOf: Date.now() })).meeting).toMatchObject({ isCreator: false, canManage: false });
    await expect(mine.mutation(api.mentorMeetings.editMeeting, { eventId, expectedRevision: 1, name: "Changed" })).rejects.toThrow("only Team meetings you created");
    await expect(mine.mutation(api.mentorMeetings.cancelMeeting, { eventId, expectedRevision: 1 })).rejects.toThrow("only Team meetings you created");
  });

  it("keeps a meeting connected to an existing Calendar entry Coach-managed, even for its Mentor creator", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ createdBy: f.ids.mentorA.id, calendarChoice: "link", calendarEventId: "existing1", calendarSyncState: "synced", calendarEtag: "etag-1", calendarRevision: 1 });
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.editMeeting, { eventId, expectedRevision: 1, name: "Changed" })).rejects.toThrow("only Team meetings you created");
    const view = await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(view.meeting).toMatchObject({ isCreator: false, canManage: false });
  });
});

describe("New meeting notices (owner decision, Nov 9 2026)", () => {
  async function recipients(f: Fixture, name: string, extra: Partial<Doc<"events">>) {
    const eventId = await f.seedEvent({ createdBy: f.ids.coach.id, name, ...extra });
    await f.t.run(ctx => queueMentorMeetingOpenDigestPage(ctx, { eventId, cursor: null }));
    for (let i = 0; i < 3; i++) { await new Promise(resolve => setTimeout(resolve, 20)); await f.t.finishInProgressScheduledFunctions(); }
    return new Set(await f.t.run(async ctx => (await ctx.db.query("notifications").take(1000)).filter(row => row.title === `New meeting: ${name}`).map(row => row.userId)));
  }

  it("notifies Mentors only for their subteams or the whole team, never for specific students", async () => {
    const f = await fixture();
    const { mentorA, mentorB } = f.ids;
    const students = await recipients(f, "Chosen students", { audienceKind: "students" });
    expect(students.has(mentorA.id)).toBe(false);
    expect(students.has(mentorB.id)).toBe(false);
    const build = await recipients(f, "Build only", { audienceKind: "subteams", audienceSubteams: ["Build"] });
    expect(build.has(mentorA.id)).toBe(true);
    expect(build.has(mentorB.id)).toBe(false);
    const everyone = await recipients(f, "Whole team", {});
    expect(everyone.has(mentorA.id)).toBe(true);
    expect(everyone.has(mentorB.id)).toBe(true);
  });
});
