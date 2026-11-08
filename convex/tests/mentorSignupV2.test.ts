/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { DRIVE_ANSWER_MESSAGE, HOTEL_ANSWER_MESSAGE, listMeetingMentors } from "../lib/mentorMeetings";
import { queueMentorMeetingOpenDigest } from "../lib/notificationTriggers";
import { addDays, weekdayOf } from "../lib/seriesRecurrence";

/**
 * Synthetic data only. Mentor sign-up v2 (owner decisions, Nov 6 2026): sign-up answers (B), series sign-ups with
 * every / one / next N (C), Parents with Mentor staff access counting as Mentors (D), and the Mentor-only
 * "Meetings and events" notification category (E). Who may sign up (A) and M4 for every event type (F) are also covered in
 * mentorMeetings.test.ts, mentorHome.test.ts and notificationDigest.test.ts.
 */
const modules = import.meta.glob("../**/*.ts");
const HOUR = 3_600_000, DAY = 24 * HOUR;

afterEach(() => { vi.useRealTimers(); });

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id };
    }
    const coach = await account("v2-coach", "coach");
    const mentorA = await account("v2-mentor-a", "mentor", { subteams: ["Build"] });
    const mentorB = await account("v2-mentor-b", "mentor", { subteams: ["Electrical"] });
    const lead = await account("v2-lead", "mentor", { travelLead: true, subteams: ["Build"] });
    const parentMentor = await account("v2-parent-mentor", "parent", { parentStaffAccess: "mentor", subteams: ["Build"] });
    const parentLead = await account("v2-parent-lead", "parent", { parentStaffAccess: "travelLead" });
    const parentLeadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + 30 * DAY });
    await ctx.db.insert("operatingRoles", { sessionId: parentLeadSession, userId: parentLead.id, role: "travelLead", accessRevision: 0 });
    const plainParent = await account("v2-parent", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { coach, mentorA, mentorB, lead, parentMentor, parentLead: { ...parentLead, session: parentLeadSession as string }, plainParent, season };
  });
  const as = (who: { auth: Id<"users">; session?: string }) => t.withIdentity({ subject: `${who.auth}|${who.session ?? "session"}` });
  const seedEvent = (extra: Partial<Doc<"events">> = {}) => t.run(ctx => ctx.db.insert("events", {
    seasonId: ids.season, name: "Synthetic Regional", type: "Competition", startsAt: Date.now() + 5 * DAY, endsAt: Date.now() + 6 * DAY, destination: "Test City", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
    signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false, ...extra,
  }));
  const rowsOn = (eventId: Id<"events">) => t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(50));
  const drain = async () => { for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(5_000); await t.finishInProgressScheduledFunctions(); } };
  const meetings = async (seriesId: Id<"eventSeries">) => (await t.run(ctx => ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId)).take(100))).filter(row => !row.cancelled);
  /** The Mentor's accepted rows on a series' meetings, by occurrence key. */
  const goingKeys = async (seriesId: Id<"eventSeries">, mentorId: Id<"appUsers">) => {
    const out: string[] = [];
    for (const meeting of await meetings(seriesId)) if ((await rowsOn(meeting._id)).some(row => row.mentorUserId === mentorId && row.status === "accepted")) out.push(meeting.seriesOccurrenceKey!);
    return out;
  };
  const signupOf = (seriesId: Id<"eventSeries">, mentorId: Id<"appUsers">) => t.run(ctx => ctx.db.query("mentorSeriesSignups").withIndex("by_seriesId_and_mentorUserId", q => q.eq("seriesId", seriesId).eq("mentorUserId", mentorId)).first());
  const m5Items = (userId: Id<"appUsers">) => t.run(async ctx => (await ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", userId)).take(100)).filter(row => row.dedupeKey?.includes(":m5:")));
  return { t, ids, as, seedEvent, rowsOn, drain, meetings, goingKeys, signupOf, m5Items };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const today = () => chicagoDate(Date.now());
function seriesArgs(extra: Record<string, unknown> = {}) {
  const startDate = addDays(today(), 1);
  return {
    name: "Weekly build", type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
    audienceKind: "everyone" as const, rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 60 }, ...extra,
  };
}

/** A weekly Mentor series (8 meetings in the window), created by `creator`. */
async function mentorSeries(f: Fixture, creator: { auth: Id<"users">; session?: string } = f.ids.mentorB, extra: Record<string, unknown> = {}) {
  const { seriesId } = await f.as(creator).mutation(api.eventSeries.create, seriesArgs(extra));
  await f.drain();
  const meetings = await f.meetings(seriesId);
  expect(meetings).toHaveLength(8);
  return { seriesId, meetings };
}

/** Generates three more weekly meetings past the 8-week window, as the daily job would. */
async function generateMore(f: Fixture, seriesId: Id<"eventSeries">) {
  await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 56 + 21) });
  await f.drain();
}

describe("A: which events a Mentor may sign up for", () => {
  it("shows a travel Competition, hides an event for other subteams only and refuses sign-up there", async () => {
    const f = await fixture();
    const competition = await f.seedEvent({ travel: "Charter Bus" });
    const elecOnly = await f.seedEvent({ type: "Team", audienceKind: "subteams", audienceSubteams: ["Electrical"] });
    const mentor = f.as(f.ids.mentorA);
    const home = await mentor.query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.signUpAvailable.map(row => row.eventId)).toEqual([competition]);
    expect(home.signUpAvailable[0]).toMatchObject({ type: "Competition", questions: { askDrive: true, askHotel: false }, myAnswers: { canDriveStudents: null, needsHotelRoom: null }, seriesSignup: null, repeatLabel: null });
    await expect(mentor.query(api.mentorMeetings.view, { eventId: elecOnly, asOf: Date.now() })).rejects.toThrow("isn't available to you");
    await expect(mentor.mutation(api.mentorMeetings.signUp, { eventId: elecOnly })).rejects.toThrow("isn't open to you");
    expect(await f.rowsOn(elecOnly)).toEqual([]);
    // An Electrical Mentor may.
    await f.as(f.ids.mentorB).mutation(api.mentorMeetings.signUp, { eventId: elecOnly });
  });
});

describe("B: sign-up answers", () => {
  it.each<[string, Partial<Doc<"events">>, { askDrive: boolean; askHotel: boolean }]>([
    ["travel", { travel: "Charter Bus" }, { askDrive: true, askHotel: false }],
    ["overnight", { overnight: true }, { askDrive: false, askHotel: true }],
    ["overnight travel", { travel: "Charter Bus", overnight: true }, { askDrive: true, askHotel: true }],
    ["virtual (no travel)", { travel: "Bus", locationType: "virtual" }, { askDrive: false, askHotel: false }],
    ["on site (no travel)", { travel: "DSHS STEM Center (on site)", onsite: true }, { askDrive: false, askHotel: false }],
    ["no travel", {}, { askDrive: false, askHotel: false }],
  ])("%s: asks only what applies and refuses a missing required answer", async (_label, extra, questions) => {
    const f = await fixture();
    const eventId = await f.seedEvent(extra);
    const mentor = f.as(f.ids.mentorA);
    expect((await mentor.query(api.mentorMeetings.view, { eventId, asOf: Date.now() })).meeting.questions).toEqual(questions);
    if (questions.askDrive) await expect(mentor.mutation(api.mentorMeetings.signUp, { eventId, needsHotelRoom: true })).rejects.toThrow(DRIVE_ANSWER_MESSAGE);
    if (questions.askHotel) await expect(mentor.mutation(api.mentorMeetings.signUp, { eventId, canDriveStudents: true })).rejects.toThrow(HOTEL_ANSWER_MESSAGE);
    expect(await f.rowsOn(eventId)).toEqual([]);
    await mentor.mutation(api.mentorMeetings.signUp, { eventId, canDriveStudents: true, needsHotelRoom: false });
    const [row] = await f.rowsOn(eventId);
    // Answers to questions the event doesn't ask are not stored.
    expect(row.canDriveStudents).toBe(questions.askDrive ? true : undefined);
    expect(row.needsHotelRoom).toBe(questions.askHotel ? false : undefined);
  });

  it("shows answers and counts to a Coach and any Travel Lead (a Parent acting as one too), and each Mentor only their own", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ travel: "Charter Bus", overnight: true });
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId, canDriveStudents: true, needsHotelRoom: true });
    await f.as(f.ids.mentorB).mutation(api.mentorMeetings.signUp, { eventId, canDriveStudents: false, needsHotelRoom: true });
    const summary = await f.as(f.ids.coach).query(api.mentorInvites.forEventSummary, { eventId });
    expect(summary.questions).toEqual({ askDrive: true, askHotel: true });
    expect(summary.counts).toEqual({ accepted: 2, invited: 0, declined: 0, drivers: 1, hotelRooms: 2, unansweredDrive: 0, unansweredHotel: 0 });
    expect(summary.mentors.find(row => row.mentorUserId === f.ids.mentorA.id)).toMatchObject({ status: "accepted", source: "self", canDriveStudents: true, needsHotelRoom: true });
    expect((await f.as(f.ids.lead).query(api.mentorInvites.forEventSummary, { eventId })).mentors).toHaveLength(2);
    // Mentors first: a Parent with a Travel Lead grant acting as Travel Lead gets the same list and answers; in Parent mode, nothing.
    expect(await f.as(f.ids.parentLead).query(api.mentorInvites.forEventSummary, { eventId })).toEqual(summary);
    await expect(f.as({ auth: f.ids.parentLead.auth }).query(api.mentorInvites.forEventSummary, { eventId })).rejects.toThrow("Only a Coach or Travel Lead");
    await expect(f.as(f.ids.mentorB).query(api.mentorInvites.forEventSummary, { eventId })).rejects.toThrow("Only a Coach or Travel Lead");
    // Mentor B sees their own answers, and only names (no answers) for other Mentors.
    const view = await f.as(f.ids.mentorB).query(api.mentorMeetings.view, { eventId, asOf: Date.now() });
    expect(view.meeting.myAnswers).toEqual({ canDriveStudents: false, needsHotelRoom: true });
    for (const mentor of view.mentors) expect(Object.keys(mentor).sort()).toEqual(["isCreator", "name", "userId"]);
    // Answers can change while the event is upcoming (same required answers).
    await expect(f.as(f.ids.mentorB).mutation(api.mentorMeetings.updateAnswers, { eventId, canDriveStudents: true })).rejects.toThrow(HOTEL_ANSWER_MESSAGE);
    await f.as(f.ids.mentorB).mutation(api.mentorMeetings.updateAnswers, { eventId, canDriveStudents: true, needsHotelRoom: false });
    expect((await f.as(f.ids.coach).query(api.mentorInvites.forEventSummary, { eventId })).counts).toMatchObject({ drivers: 2, hotelRooms: 1 });
    await expect(f.as(f.ids.lead).mutation(api.mentorMeetings.updateAnswers, { eventId, canDriveStudents: true, needsHotelRoom: true })).rejects.toThrow("Sign up for this event");
  });

  it("asks an invited Mentor the same questions when they accept", async () => {
    const f = await fixture();
    const eventId = await f.seedEvent({ travel: "Charter Bus" });
    await f.as(f.ids.coach).mutation(api.mentorInvites.addMentorInvites, { eventId, mentorUserIds: [f.ids.mentorA.id] });
    await expect(f.as(f.ids.mentorA).mutation(api.mentorInvites.respond, { eventId, status: "accepted" })).rejects.toThrow(DRIVE_ANSWER_MESSAGE);
    await f.as(f.ids.mentorA).mutation(api.mentorInvites.respond, { eventId, status: "accepted", canDriveStudents: false });
    expect((await f.rowsOn(eventId))[0]).toMatchObject({ source: "individual", status: "accepted", canDriveStudents: false });
  });
});

describe("C: series sign-ups", () => {
  it("all: every current meeting and every newly generated one, with one M5 notice for the creator", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f);
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "all" });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toEqual(meetings.map(row => row.seriesOccurrenceKey));
    expect(await f.signupOf(seriesId, f.ids.mentorA.id)).toMatchObject({ status: "active", scope: "all" });
    expect(await f.m5Items(f.ids.mentorB.id)).toHaveLength(1);
    await generateMore(f, seriesId);
    const all = await f.meetings(seriesId);
    expect(all).toHaveLength(11);
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toEqual(all.map(row => row.seriesOccurrenceKey));
    const home = await f.as(f.ids.mentorA).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.scheduled.filter(row => row.seriesId === seriesId).every(row => row.seriesSignup?.scope === "all" && row.seriesSignup.coversThisMeeting)).toBe(true);
    expect(home.scheduled.filter(row => row.seriesId === seriesId)).toHaveLength(11);
    expect(new Set(home.scheduled.filter(row => row.seriesId === seriesId).map(row => row.repeatLabel))).toEqual(new Set(["Repeats weekly"]));
  });

  it("labels how often a series meeting repeats", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const startDate = addDays(today(), 1);
    const { seriesId } = await f.as(f.ids.mentorB).mutation(api.eventSeries.create, seriesArgs({ rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 2, localStartTime: "18:00", durationMinutes: 60 } }));
    await f.drain();
    const [first] = await f.meetings(seriesId);
    expect((await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId: first._id, asOf: Date.now() })).meeting.repeatLabel).toBe("Repeats every 2 weeks");
  });

  it("one: just this meeting; next N: N meetings, generated ones included, then stops", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f);
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId: meetings[2]._id, scope: "one" });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toEqual([meetings[2].seriesOccurrenceKey]);
    expect((await f.as(f.ids.mentorA).query(api.mentorMeetings.view, { eventId: meetings[2]._id, asOf: Date.now() })).meeting.seriesSignup).toEqual({ scope: "one", count: null, coversThisMeeting: true, skippedThisMeeting: false });
    await expect(f.as(f.ids.lead).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "next", count: 0 })).rejects.toThrow("1 to 52");
    await expect(f.as(f.ids.lead).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "next", count: 53 })).rejects.toThrow("1 to 52");
    await expect(f.as(f.ids.lead).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "next" })).rejects.toThrow("1 to 52");
    await f.as(f.ids.lead).mutation(api.mentorMeetings.signUp, { eventId: meetings[1]._id, scope: "next", count: 9 });
    expect(await f.goingKeys(seriesId, f.ids.lead.id)).toEqual(meetings.slice(1).map(row => row.seriesOccurrenceKey)); // 7 of 9 exist so far
    await generateMore(f, seriesId);
    const all = await f.meetings(seriesId);
    expect(all).toHaveLength(11);
    // Two more were added (9 in total); the eleventh meeting is not.
    expect(await f.goingKeys(seriesId, f.ids.lead.id)).toEqual(all.slice(1, 10).map(row => row.seriesOccurrenceKey));
    expect((await f.signupOf(seriesId, f.ids.lead.id))?.coveredKeys).toHaveLength(9);
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toEqual([meetings[2].seriesOccurrenceKey]);
    // A non-series event takes only "one".
    const single = await f.seedEvent();
    await expect(f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId: single, scope: "all" })).rejects.toThrow("doesn't repeat");
  });

  it("skip keeps the series sign-up and the date stays skipped; leave all removes every upcoming row", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f);
    const mentor = f.as(f.ids.mentorA);
    await mentor.mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "all" });
    await mentor.mutation(api.mentorMeetings.skipMeeting, { eventId: meetings[3]._id });
    const skippedKey = meetings[3].seriesOccurrenceKey!;
    expect(await f.signupOf(seriesId, f.ids.mentorA.id)).toMatchObject({ status: "active", scope: "all", skippedKeys: [skippedKey] });
    const view = await mentor.query(api.mentorMeetings.view, { eventId: meetings[3]._id, asOf: Date.now() });
    expect(view.meeting).toMatchObject({ myStatus: null, canSignUp: true, seriesSignup: { scope: "all", count: null, coversThisMeeting: false, skippedThisMeeting: true } });
    // Choosing "every meeting" again (from another meeting) and generating more never re-adds the skipped date.
    await mentor.mutation(api.mentorMeetings.signUp, { eventId: meetings[1]._id, scope: "all" });
    await generateMore(f, seriesId);
    const going = await f.goingKeys(seriesId, f.ids.mentorA.id);
    expect(going).not.toContain(skippedKey);
    expect(going).toHaveLength(10);
    // Signing up for that one meeting again takes it off the skip list.
    await mentor.mutation(api.mentorMeetings.signUp, { eventId: meetings[3]._id });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toContain(skippedKey);
    // Leave all.
    expect(await mentor.mutation(api.mentorMeetings.leaveSeries, { seriesId })).toEqual({ left: 11 });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toEqual([]);
    expect(await f.signupOf(seriesId, f.ids.mentorA.id)).toMatchObject({ status: "left" });
    await generateMore(f, seriesId);
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 56 + 35) });
    await f.drain();
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toEqual([]);
    await expect(mentor.mutation(api.mentorMeetings.leaveSeries, { seriesId })).rejects.toThrow("aren't signed up");
  });

  it("next N never re-adds a skipped meeting: it covers N meetings the Mentor hasn't skipped", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f);
    const mentor = f.as(f.ids.mentorA);
    const key = (i: number) => meetings[i].seriesOccurrenceKey!;
    await mentor.mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "next", count: 3 });
    await mentor.mutation(api.mentorMeetings.skipMeeting, { eventId: meetings[2]._id }); // meeting 3
    // Change to the next 4 from meeting 1: meetings 1, 2, 4 and 5; meeting 3 stays skipped.
    await mentor.mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "next", count: 4 });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toEqual([key(0), key(1), key(3), key(4)]);
    expect(await f.signupOf(seriesId, f.ids.mentorA.id)).toMatchObject({ scope: "next", count: 4, coveredKeys: [key(0), key(1), key(3), key(4)], skippedKeys: [key(2)] });
    expect((await mentor.query(api.mentorMeetings.view, { eventId: meetings[2]._id, asOf: Date.now() })).meeting.seriesSignup).toMatchObject({ coversThisMeeting: false, skippedThisMeeting: true });
    // "Every meeting" from another meeting doesn't bring it back either; signing up for that meeting itself does.
    await mentor.mutation(api.mentorMeetings.signUp, { eventId: meetings[1]._id, scope: "all" });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).not.toContain(key(2));
    await mentor.mutation(api.mentorMeetings.signUp, { eventId: meetings[2]._id });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toContain(key(2));
    expect((await f.signupOf(seriesId, f.ids.mentorA.id))?.skippedKeys).toEqual([]);
  });

  it("accepting an invitation to a series meeting takes the same choice and keeps the invitation source", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f, f.ids.mentorB, { mentorInviteUserIds: [f.ids.mentorA.id] });
    expect((await f.rowsOn(meetings[5]._id))[0]).toMatchObject({ mentorUserId: f.ids.mentorA.id, status: "invited" });
    await f.as(f.ids.mentorA).mutation(api.mentorInvites.respond, { eventId: meetings[0]._id, status: "accepted", scope: "all" });
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toHaveLength(8);
    expect((await f.rowsOn(meetings[5]._id))[0]).toMatchObject({ source: "individual", status: "accepted" });
    await generateMore(f, seriesId);
    expect(await f.goingKeys(seriesId, f.ids.mentorA.id)).toHaveLength(11);
  });

  it("a this-and-following split carries sign-ups to the new series", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f);
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "all" });
    await f.as(f.ids.lead).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "next", count: 6 });
    const fromKey = meetings[4].seriesOccurrenceKey!;
    const split = await f.as(f.ids.coach).mutation(api.eventSeries.editFuture, { seriesId, fromKey, name: "Renamed build" });
    await f.drain();
    expect(await f.signupOf(split.seriesId, f.ids.mentorA.id)).toMatchObject({ status: "active", scope: "all" });
    // "Next 6" had 4 before the split: 2 continue on the new series.
    expect(await f.signupOf(split.seriesId, f.ids.lead.id)).toMatchObject({ status: "active", scope: "next", count: 2, coveredKeys: [meetings[4].seriesOccurrenceKey, meetings[5].seriesOccurrenceKey] });
    expect(await f.signupOf(seriesId, f.ids.lead.id)).toMatchObject({ scope: "next", count: 4 });
    const newSignup = (await f.signupOf(split.seriesId, f.ids.mentorA.id))!;
    expect((await f.rowsOn(meetings[6]._id)).find(row => row.mentorUserId === f.ids.mentorA.id)?.seriesSignupId).toBe(newSignup._id);
    await generateMore(f, split.seriesId);
    const after = await f.meetings(split.seriesId);
    expect(after.length).toBeGreaterThan(4);
    expect(await f.goingKeys(split.seriesId, f.ids.mentorA.id)).toEqual(after.map(row => row.seriesOccurrenceKey));
    expect(await f.goingKeys(split.seriesId, f.ids.lead.id)).toEqual([meetings[4].seriesOccurrenceKey, meetings[5].seriesOccurrenceKey]);
  });
});

describe("D: a Parent with Mentor staff access", () => {
  it("counts as a Mentor in Parent mode, and loses it all when the grant is removed", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const parent = f.as(f.ids.parentMentor); // no operating role selected: Parent mode
    expect((await parent.query(api.mentorHome.mentorHome, { asOf: Date.now() })).canCreateMeeting).toBe(true);
    const { seriesId, meetings } = await mentorSeries(f, f.ids.parentMentor);
    const event = await f.seedEvent({ type: "Team", audienceKind: "subteams", audienceSubteams: ["Build"] });
    await parent.mutation(api.mentorMeetings.signUp, { eventId: event });
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "all" });
    expect(await f.m5Items(f.ids.parentMentor.id)).toHaveLength(1); // creator notice (M5)
    // Invitable like any Mentor.
    expect(await f.as(f.ids.coach).mutation(api.mentorInvites.addMentorInvites, { eventId: meetings[1]._id, mentorUserIds: [f.ids.mentorB.id] })).toBe(1);
    await f.as(f.ids.mentorB).mutation(api.mentorMeetings.signUp, { eventId: meetings[2]._id, scope: "all" });
    expect((await parent.query(api.mentorMeetings.view, { eventId: meetings[2]._id, asOf: Date.now() })).meeting.isCreator).toBe(true);
    expect(await f.m5Items(f.ids.parentMentor.id)).toHaveLength(2); // Mentor A and Mentor B signed up

    await f.as(f.ids.coach).mutation(api.accounts.updateParentStaffAccess, { userId: f.ids.parentMentor.id, expectedRevision: 0, staffAccess: null, reason: "Mentor role ended" });
    await expect(parent.query(api.mentorHome.mentorHome, { asOf: Date.now() })).rejects.toThrow("Only a Mentor");
    await expect(parent.mutation(api.mentorMeetings.signUp, { eventId: meetings[3]._id })).rejects.toThrow("Only a Mentor");
    await expect(parent.mutation(api.mentorMeetings.editMeeting, { eventId: meetings[3]._id, name: "x" })).rejects.toThrow("Only a Mentor");
    // No longer on the event they joined; no creator rights (roster, M5) on what they created.
    expect((await f.t.run(ctx => listMeetingMentors(ctx, event))).map(row => row.userId)).not.toContain(f.ids.parentMentor.id);
    expect((await f.t.run(ctx => listMeetingMentors(ctx, meetings[3]._id))).map(row => row.userId)).not.toContain(f.ids.parentMentor.id);
    await f.as(f.ids.mentorA).mutation(api.mentorMeetings.leaveSeries, { seriesId });
    expect(await f.m5Items(f.ids.parentMentor.id)).toHaveLength(2); // no new M5 after the grant was removed
    expect((await f.as(f.ids.mentorB).query(api.mentorMeetings.view, { eventId: meetings[2]._id, asOf: Date.now() })).meeting.isCreator).toBe(false);
    // Generation of their series stops for review.
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 56 + 21) });
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.status).toBe("needsReview");
    // Removing the grant already removed their rows on upcoming events, so the internal cleanup has nothing left to do.
    expect((await f.rowsOn(event)).map(row => row.mentorUserId)).not.toContain(f.ids.parentMentor.id);
    expect(await f.t.mutation(internal.mentorMeetings.removeLostMentorAccess, { userId: f.ids.parentMentor.id })).toBe(0);
    // Still a Mentor: cleanup does nothing.
    expect(await f.t.mutation(internal.mentorMeetings.removeLostMentorAccess, { userId: f.ids.mentorA.id })).toBe(0);
  });
});

describe("D: losing Mentor access cleans up when the account changes", () => {
  type Who = "parentMentor" | "parentLead" | "mentorA";
  it.each<[string, Who, (f: Fixture) => Promise<unknown>, boolean]>([
    ["a Parent's Mentor grant removed", "parentMentor", f => f.as(f.ids.coach).mutation(api.accounts.updateParentStaffAccess, { userId: f.ids.parentMentor.id, expectedRevision: 0, staffAccess: null, reason: "Mentor role ended" }), true],
    ["a Parent's Travel Lead grant removed", "parentLead", f => f.as(f.ids.coach).mutation(api.accounts.updateParentStaffAccess, { userId: f.ids.parentLead.id, expectedRevision: 0, staffAccess: null, reason: "Season over" }), true],
    ["a Parent's Travel Lead grant changed to Mentor (still a Mentor)", "parentLead", f => f.as(f.ids.coach).mutation(api.accounts.updateParentStaffAccess, { userId: f.ids.parentLead.id, expectedRevision: 0, staffAccess: "mentor", reason: "No longer leading travel" }), false],
    ["a Mentor deactivated", "mentorA", f => f.as(f.ids.coach).mutation(api.accounts.updateAdult, { userId: f.ids.mentorA.id, expectedRevision: 0, role: "mentor", travelLead: false, financialEdit: false, healthExport: false, active: false, reason: "Left the team" }), true],
  ])("%s", async (_label, who, change, removed) => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f);
    const event = await f.seedEvent({ travel: "Charter Bus" });
    const subject = f.ids[who];
    await f.as(subject).mutation(api.mentorMeetings.signUp, { eventId: meetings[0]._id, scope: "all" });
    await f.as(subject).mutation(api.mentorMeetings.signUp, { eventId: event, canDriveStudents: true });
    expect(await f.goingKeys(seriesId, subject.id)).toHaveLength(8);
    await change(f);
    expect(await f.goingKeys(seriesId, subject.id)).toHaveLength(removed ? 0 : 8);
    expect((await f.rowsOn(event)).some(row => row.mentorUserId === subject.id)).toBe(!removed);
    expect(await f.signupOf(seriesId, subject.id)).toMatchObject({ status: removed ? "left" : "active" });
    // Newly generated meetings never bring a removed Mentor back.
    await generateMore(f, seriesId);
    expect(await f.goingKeys(seriesId, subject.id)).toHaveLength(removed ? 0 : 11);
  });
});

describe("D: Coach-created events invite Parents with Mentor access like Mentors", () => {
  const base = (startsAt: number) => ({ name: "Synthetic Mentor sync", type: "Team" as const, startsAt, endsAt: startsAt + 2 * HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] });

  it("a Mentors-only event may invite only Parents with Mentor or Travel Lead access; a plain Parent is refused", async () => {
    const f = await fixture();
    const coach = f.as(f.ids.coach);
    const startsAt = Date.now() + 5 * DAY;
    const eventId = await coach.mutation(api.admin.createEvent, { ...base(startsAt), audienceKind: "mentorsOnly", mentorInviteUserIds: [f.ids.parentMentor.id, f.ids.parentLead.id] });
    const rows = await f.rowsOn(eventId);
    expect(rows.map(row => row.mentorUserId).sort()).toEqual([f.ids.parentMentor.id, f.ids.parentLead.id].sort());
    expect(rows.every(row => row.source === "individual" && row.status === "invited")).toBe(true);
    await expect(coach.mutation(api.admin.createEvent, { ...base(startsAt), audienceKind: "mentorsOnly", mentorInviteUserIds: [f.ids.plainParent.id] })).rejects.toThrow("Choose Mentors from the list");
    // A Mentor's own Mentors-only meeting may also invite just a Parent with Mentor access.
    const meetingId = await f.as(f.ids.mentorB).mutation(api.mentorMeetings.createMeeting, { name: "Mentor sync", startsAt, endsAt: startsAt + HOUR, destination: "Lab", audienceKind: "mentorsOnly", mentorInviteUserIds: [f.ids.parentMentor.id] });
    expect((await f.rowsOn(meetingId)).map(row => row.mentorUserId)).toEqual([f.ids.parentMentor.id]);
  });

  it("a Mentors-only series may invite only a Parent with Mentor access, and every generated meeting invites them; a plain Parent is refused", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, meetings } = await mentorSeries(f, f.ids.mentorB, { audienceKind: "mentorsOnly", mentorInviteUserIds: [f.ids.parentMentor.id] });
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.mentorInviteIds).toEqual([f.ids.parentMentor.id]);
    for (const meeting of meetings) expect((await f.rowsOn(meeting._id)).map(row => ({ mentorUserId: row.mentorUserId, source: row.source, status: row.status }))).toEqual([{ mentorUserId: f.ids.parentMentor.id, source: "individual", status: "invited" }]);
    await generateMore(f, seriesId);
    const all = await f.meetings(seriesId);
    expect(all).toHaveLength(11);
    for (const meeting of all) expect((await f.rowsOn(meeting._id)).map(row => row.mentorUserId)).toEqual([f.ids.parentMentor.id]);
    await expect(f.as(f.ids.mentorB).mutation(api.eventSeries.create, seriesArgs({ audienceKind: "mentorsOnly", mentorInviteUserIds: [f.ids.plainParent.id] }))).rejects.toThrow("Choose Mentors from the list");
  });

  it("inviting a subteam's Mentors includes Parents with Mentor access on that subteam", async () => {
    const f = await fixture();
    const eventId = await f.as(f.ids.coach).mutation(api.admin.createEvent, { ...base(Date.now() + 5 * DAY), audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: false, inviteSubteamMentors: true });
    const rows = await f.rowsOn(eventId);
    expect(rows.map(row => row.mentorUserId).sort()).toEqual([f.ids.mentorA.id, f.ids.lead.id, f.ids.parentMentor.id].sort());
    expect(rows.every(row => row.source === "subteam")).toBe(true);
  });
});

describe("E: the Mentor-only Meetings and events notification setting", () => {
  it("M4/M5 follow Meetings and events, not Staff; only Mentors see or change it", async () => {
    const f = await fixture();
    const mentor = f.as(f.ids.mentorA);
    expect((await mentor.query(api.notifications.getMyPreferences, {})).find(row => row.category === "mentorEvents")).toMatchObject({ label: "Meetings and events", enabled: true });
    expect((await f.as(f.ids.parentMentor).query(api.notifications.getMyPreferences, {})).map(row => row.category)).toContain("mentorEvents");
    for (const who of [f.ids.coach, f.ids.plainParent]) {
      expect((await f.as(who).query(api.notifications.getMyPreferences, {})).map(row => row.category)).not.toContain("mentorEvents");
      await expect(f.as(who).mutation(api.notifications.setCategoryEnabled, { category: "mentorEvents", enabled: false })).rejects.toThrow("does not apply");
    }
    const m4 = async (name: string) => {
      const eventId = await f.seedEvent({ name });
      await f.t.run(ctx => queueMentorMeetingOpenDigest(ctx, { eventId }));
      return (await f.t.run(ctx => ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", f.ids.mentorA.id)).take(50))).filter(row => row.url === `/events/${eventId}`);
    };
    await mentor.mutation(api.notifications.setCategoryEnabled, { category: "staff", enabled: false });
    expect(await m4("Staff off")).toEqual([expect.objectContaining({ category: "mentorEvents", pushStatus: "digest", title: "New event: Staff off" })]);
    await mentor.mutation(api.notifications.setCategoryEnabled, { category: "mentorEvents", enabled: false });
    expect(await m4("Meetings off")).toEqual([expect.objectContaining({ category: "mentorEvents", pushStatus: "skipped" })]);
    expect(await f.t.run(async ctx => (await ctx.db.query("notificationDigestItems").withIndex("by_userId_and_flushedAt", q => q.eq("userId", f.ids.mentorA.id)).take(20)).map(row => row.category))).toEqual(["mentorEvents"]);
  });
});
