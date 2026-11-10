import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { canonicalSubteam } from "../src/lib/subteams";
import { activeSeason, audit, viewer, type AppUser } from "./lib/access";
import { createEventCore, prepareEventAudience } from "./lib/createEventCore";
import {
  MAX_MEETING_MENTORS, acceptMeeting, answersFor, audienceSummary, leaveMeetingRows, leaveSeries as leaveSeriesSignup, listMeetingMentors,
  mentorInviteRows, mentorKeepsCalendarLink, mentorMeetingCreatorId, mentorMeetingLimitError, mentorQuestions, mentorUpdateEvent, recordSeriesSkip, removeLostMentorSignups,
  plausibleAsOf, repeatLabel, requireAnswers, requireInvitableMeetingMentors, requireMeetingLength, requireMeetingMentor, requireMentorMeetingFields, selfSignupEligible, seriesOf,
  seriesSignupFor, seriesSignupView, signUpForSeries, signupChoice, upcomingSeriesMeetings,
} from "./lib/mentorMeetings";
import { todayKey } from "./lib/seriesGenerate";
import { queueMentorMeetingActivityDigest, queueMentorMeetingOpenDigestPage } from "./lib/notificationTriggers";

/**
 * Mentor meetings: every Mentor (a Mentor account, or a Parent with Mentor staff access: lib/mentorMeetings isMentorCapable)
 * can create, edit and cancel their own optional Team meetings, sign up for any current event open to them (every type,
 * except events for other subteams only; see selfSignupEligible), answer the travel/overnight questions, sign up for a
 * repeating series (every meeting, just one, or the next N), and read a minimized projection of a meeting. Identity comes
 * from the session; every rule is enforced here, not in the UI.
 */

const MAX_NAME = 250;
const MAX_PLACE = 500;
/** Confirmed students read for the roster of a meeting the Mentor created or joined. */
const MAX_ROSTER_STUDENTS = 300;

const audienceKind = v.union(v.literal("everyone"), v.literal("subteams"), v.literal("students"), v.literal("mentorsOnly"));
const inviteStatus = v.union(v.literal("invited"), v.literal("accepted"), v.literal("declined"));
const inviteSource = v.union(v.literal("individual"), v.literal("subteam"), v.literal("self"));
const eventType = v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team"), v.literal("Fundraiser"));
/** How much of a repeating series a sign-up covers: every meeting, just this one, or the next `count` meetings. */
export const seriesScopeValidator = v.union(v.literal("all"), v.literal("one"), v.literal("next"));

export const audienceSummaryValidator = v.object({ kind: audienceKind, subteams: v.array(v.string()), required: v.boolean(), text: v.string() });
export const questionsValidator = v.object({ askDrive: v.boolean(), askHotel: v.boolean() });
export const answersValidator = v.object({ canDriveStudents: v.union(v.boolean(), v.null()), needsHotelRoom: v.union(v.boolean(), v.null()) });
export const seriesSignupValidator = v.union(v.null(), v.object({ scope: seriesScopeValidator, count: v.union(v.number(), v.null()), coversThisMeeting: v.boolean(), skippedThisMeeting: v.boolean() }));

/** Sign-up arguments shared by signUp and mentorInvites.respond (accepting). */
export const signupArgs = {
  scope: v.optional(seriesScopeValidator), count: v.optional(v.number()),
  canDriveStudents: v.optional(v.boolean()), needsHotelRoom: v.optional(v.boolean()),
};

/** One event in a Mentor's list (Home). Title, time, place and the Mentor's own state only. */
export const mentorMeetingSummary = v.object({
  eventId: v.id("events"), title: v.string(), type: eventType, startsAt: v.number(), endsAt: v.number(), place: v.string(), virtual: v.boolean(), cancelled: v.boolean(),
  audience: audienceSummaryValidator, seriesId: v.union(v.id("eventSeries"), v.null()),
  /** How often a series meeting repeats ("Repeats weekly", "Repeats every 2 weeks"; lib/mentorMeetings repeatLabel); null when it doesn't. */
  repeatLabel: v.union(v.string(), v.null()), calendarRevision: v.number(),
  /** Whether the meeting is on Team Calendar (for the edit form's Required-day note). Never its sync state, which stays staff-only. */
  onTeamCalendar: v.boolean(),
  /** The Mentor's own invite row: status and how it started (individual/subteam invite, or self sign-up). Null when none. */
  myStatus: v.union(inviteStatus, v.null()), mySource: v.union(inviteSource, v.null()),
  /** Which sign-up questions this event asks, and the Mentor's OWN answers (never anyone else's). */
  questions: questionsValidator, myAnswers: answersValidator,
  /** The Mentor's sign-up for this meeting's series ("Every meeting" / "Next N meetings" / "Just this one"), or null. */
  seriesSignup: seriesSignupValidator,
  isCreator: v.boolean(), canSignUp: v.boolean(), canWithdraw: v.boolean(), canManage: v.boolean(),
});
export type MentorMeetingSummary = typeof mentorMeetingSummary.type;

/**
 * Pure: builds a list row. `creatorId` is the Mentor-meeting creator (mentorMeetingCreatorId: null unless the event is still a
 * Mentor meeting), who listMeetingMentors already counts as going, so without an invite row they can't also sign up. The
 * creator of any other event (a Travel Lead's Competition) signs up like anyone else.
 */
export function meetingSummary(event: Doc<"events">, user: AppUser, invite: Doc<"eventMentorInvites"> | null, creatorId: Id<"appUsers"> | null, now: number, signup: Doc<"mentorSeriesSignups"> | null = null, series: Doc<"eventSeries"> | null = null): MentorMeetingSummary {
  const current = !event.archived && !event.cancelled && event.endsAt > now;
  const isCreator = creatorId === user._id;
  // A Team Calendar entry the Mentor added at creation keeps it theirs to manage; one a Coach connected or added later doesn't.
  const canManage = isCreator && current && mentorMeetingLimitError(event) === null && mentorKeepsCalendarLink(event) && event.assignmentScope === undefined;
  return {
    eventId: event._id, title: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, place: event.destination, virtual: event.locationType === "virtual", cancelled: event.cancelled ?? false,
    audience: audienceSummary(event), seriesId: event.seriesId ?? null, repeatLabel: repeatLabel(event, series), calendarRevision: event.calendarRevision ?? 0, onTeamCalendar: event.calendarChoice !== undefined,
    myStatus: invite?.status ?? null, mySource: invite?.source ?? null,
    questions: mentorQuestions(event), myAnswers: { canDriveStudents: invite?.canDriveStudents ?? null, needsHotelRoom: invite?.needsHotelRoom ?? null },
    seriesSignup: seriesSignupView(signup, event), isCreator,
    canSignUp: current && invite?.status !== "accepted" && (invite !== null || (!isCreator && selfSignupEligible(user, event, now))),
    canWithdraw: current && invite?.status === "accepted", canManage,
  };
}

/** The signed-in Mentor (a Mentor account, or a Parent with Mentor staff access acting as a plain Mentor). */
export async function requireMentor(ctx: Parameters<typeof viewer>[0]) {
  return await requireMeetingMentor(ctx, await viewer(ctx));
}

/** The name shown for a Mentor on a meeting: their account name, else "A Mentor" (an account with a blank name), else a note that the account is gone. */
export function mentorDisplayName(account: Pick<Doc<"appUsers">, "name"> | null): string {
  if (!account) return "Mentor account unavailable";
  return account.name.trim() || "A Mentor";
}

const UNAVAILABLE = "This meeting is no longer available. Reload to see current meetings.";
const NOT_CURRENT = "This event is canceled, over or no longer available. Reload to see current events.";

/**
 * A Mentor's Team Calendar choice for a new one-time meeting: its own new entry, or none. Connecting to an existing entry
 * (and the candidate lookup behind it) stays with Coaches and Travel Leads, so "link" is not accepted here.
 */
const mentorCalendarChoice = v.union(v.object({ kind: v.literal("create") }), v.object({ kind: v.literal("none") }));

/**
 * Create a one-time Team meeting. Optional for students; audience is Everyone, Subteams, specific students or Mentors only.
 * calendarChoice { kind: "create" } also gives it its own Team Calendar entry (pushed by eventCalendar.push under the
 * usual write gates) and sets calendarCreatedByMentor, so the meeting stays the Mentor's to manage; omitted or "none" keeps it
 * off Team Calendar. Repeating meetings are created through eventSeries.create,
 * which refuses Team Calendar for Mentors.
 */
export const createMeeting = mutation({
  args: {
    name: v.string(), startsAt: v.number(), endsAt: v.number(), destination: v.string(), locationType: v.optional(v.union(v.literal("inPerson"), v.literal("virtual"))),
    audienceKind, audienceSubteams: v.optional(v.array(v.string())), audienceStudentIds: v.optional(v.array(v.id("students"))),
    mentorInviteUserIds: v.optional(v.array(v.id("appUsers"))), inviteSubteamMentors: v.optional(v.boolean()),
    calendarChoice: v.optional(mentorCalendarChoice),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const user = await requireMentor(ctx);
    const season = await activeSeason(ctx);
    const name = args.name.trim(), virtual = args.locationType === "virtual";
    const destination = args.destination.trim() || (virtual ? "Virtual (Discord)" : "");
    if (!name || name.length > MAX_NAME || !destination || destination.length > MAX_PLACE || !Number.isFinite(args.startsAt) || !Number.isFinite(args.endsAt) || args.endsAt <= args.startsAt) throw new ConvexError("Enter a title up to 250 characters, a place up to 500, and an end time after the start.");
    requireMeetingLength(args.startsAt, args.endsAt);
    if (args.endsAt <= Date.now()) throw new ConvexError("Choose a meeting time that hasn't ended yet.");
    if ((args.mentorInviteUserIds?.length ?? 0) > MAX_MEETING_MENTORS || (args.audienceStudentIds?.length ?? 0) > 200) throw new ConvexError("Choose up to 200 Mentors and up to 200 students.");
    // Invitees may be Mentors or Parents with Mentor / Travel Lead staff access (isMentorCapable, checked again by the shared core).
    const invitees = await requireInvitableMeetingMentors(ctx, (args.mentorInviteUserIds ?? []).filter(id => id !== user._id));
    const raw = {
      type: "Team" as const, startsAt: args.startsAt, endsAt: args.endsAt, destination, travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const,
      allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: args.audienceKind, audienceSubteams: args.audienceSubteams, mandatory: false,
      audienceStudentIds: args.audienceStudentIds, inviteSubteamMentors: args.inviteSubteamMentors, locationType: args.locationType,
      mentorInviteUserIds: invitees.map(mentor => mentor._id),
    };
    requireMentorMeetingFields(raw);
    const prepared = await prepareEventAudience(ctx, user, season, raw);
    const a = prepared.args;
    requireMentorMeetingFields(a); // the stored (mapped) fields must still be Mentor-safe
    const eventFields = {
      name, type: "Team" as const, startsAt: a.startsAt, endsAt: a.endsAt, destination: a.destination, travel: a.travel, overnight: a.overnight, roomingEnabled: a.roomingEnabled, feeCents: 0,
      signupMode: a.signupMode, assignmentScope: (a as { assignmentScope?: "selected" | "travelTeam" | "wholeTeam" }).assignmentScope, allowWithdrawal: true, permissionRequired: a.permissionRequired, firstRequired: false,
      audienceKind: a.audienceKind, audienceSubteams: a.audienceSubteams, mandatory: a.mandatory, locationType: a.locationType, createdBy: user._id,
    };
    const calendarChoice = args.calendarChoice?.kind === "create" ? { kind: "create" as const } : undefined;
    // calendarCreatedByMentor marks the entry as the Mentor's own, so the meeting stays theirs to manage (mentorKeepsCalendarLink).
    return await createEventCore(ctx, user, season, { eventFields: { ...eventFields, ...(calendarChoice ? { calendarCreatedByMentor: true } : {}) }, requirements: [], shifts: [], questions: [], assigned: [], calendarChoice, audienceStudentIds: prepared.audienceStudentIds, mentorInvites: prepared.mentorInvites.filter(invite => invite.mentorUserId !== user._id) });
  },
});

/** Edit one meeting the Mentor created (title, place, time). For a repeating meeting this changes this meeting only. */
export const editMeeting = mutation({
  args: { eventId: v.id("events"), expectedRevision: v.optional(v.number()), name: v.optional(v.string()), destination: v.optional(v.string()), startsAt: v.optional(v.number()), endsAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => await mentorUpdateEvent(ctx, await requireMentor(ctx), args),
});

/** Cancel one meeting the Mentor created. */
export const cancelMeeting = mutation({
  args: { eventId: v.id("events"), expectedRevision: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => await mentorUpdateEvent(ctx, await requireMentor(ctx), { eventId: args.eventId, expectedRevision: args.expectedRevision, cancelled: true }),
});

async function currentEvent(ctx: Parameters<typeof viewer>[0], eventId: Id<"events">, now: number, message = NOT_CURRENT) {
  const season = await activeSeason(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.seasonId !== season._id || event.archived || event.cancelled || event.endsAt <= now) throw new ConvexError(message);
  return event;
}

/**
 * The signed-in Mentor signs up for a current event open to them (any type except events for other subteams only; or one
 * they are invited to). Answers: `canDriveStudents` is required when the event has travel, `needsHotelRoom` when it is
 * overnight (mentorQuestions); other answers are ignored. For a meeting of a repeating series, `scope` chooses every meeting
 * ("all"), just this one ("one", the default) or the next `count` meetings ("next", 1-52); see signUpForSeries.
 * One M5 notice for the creator however many meetings the sign-up covers.
 */
export const signUp = mutation({
  args: { eventId: v.id("events"), ...signupArgs }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireMentor(ctx);
    const now = Date.now();
    const event = await currentEvent(ctx, args.eventId, now);
    const choice = signupChoice(event, args.scope, args.count);
    const answers = requireAnswers(event, args);
    const rows = await mentorInviteRows(ctx, event._id, user._id);
    const invite = rows[0] ?? null;
    if (!invite && !selfSignupEligible(user, event, now)) throw new ConvexError("This event isn't open to you. It is for other subteams only.");
    // The creator of a Mentor meeting is already on it (listMeetingMentors adds them as accepted); a self row would only
    // duplicate that. The creator of any other event (a Travel Lead's Competition) signs up like anyone else.
    if (!invite && (await mentorMeetingCreatorId(ctx, event)) === user._id) throw new ConvexError("You created this meeting, so you're already on it.");
    if (!invite && (await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_MEETING_MENTORS)).length >= MAX_MEETING_MENTORS) throw new ConvexError("This event already has 200 Mentors. Ask a Coach.");
    const joined = event.seriesId && event.seriesOccurrenceKey
      ? await signUpForSeries(ctx, user, event, choice, answers, now)
      : (await acceptMeeting(ctx, user, event, answers, now)) === "joined" ? 1 : 0;
    await audit(ctx, user, "events", event._id, "mentorSignUp", invite ? invite.status : null, { scope: choice.scope, count: choice.count ?? null, joined });
    if (joined > 0) await queueMentorMeetingActivityDigest(ctx, { eventId: event._id, activity: "mentorJoined" }); // M5, once
    return null;
  },
});

/**
 * The signed-in Mentor leaves one event: self sign-ups are removed; invited Mentors go back to Declined. For a meeting of a
 * series they signed up for, the date is recorded as skipped: the series sign-up stays, and it never puts them back on it.
 */
async function leaveOneMeeting(ctx: MutationCtx, eventId: Id<"events">): Promise<null> {
  const user = await requireMentor(ctx);
  const now = Date.now();
  const event = await currentEvent(ctx, eventId, now, UNAVAILABLE);
  const rows = await mentorInviteRows(ctx, event._id, user._id);
  if (rows[0]?.status !== "accepted") throw new ConvexError("You aren't signed up for this meeting.");
  await leaveMeetingRows(ctx, rows, now);
  await recordSeriesSkip(ctx, user._id, event, now);
  await audit(ctx, user, "eventMentorInvites", rows[0]._id, "withdraw", "accepted", rows[0].source === "self" ? null : "declined");
  await queueMentorMeetingActivityDigest(ctx, { eventId: event._id, activity: "mentorLeft" }); // M5
  return null;
}

export const withdraw = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => await leaveOneMeeting(ctx, args.eventId),
});

/** "Skip this meeting": the same as withdraw (the series sign-up stays; this date is never re-added). */
export const skipMeeting = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => await leaveOneMeeting(ctx, args.eventId),
});

/** "Leave all": ends the Mentor's sign-up for the series and takes them off every upcoming meeting of it. One M5 notice. */
export const leaveSeries = mutation({
  args: { seriesId: v.id("eventSeries") }, returns: v.object({ left: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireMentor(ctx);
    const season = await activeSeason(ctx);
    const series = await ctx.db.get(args.seriesId);
    if (!series || series.seasonId !== season._id) throw new ConvexError("This series is no longer available. Reload to see current meetings.");
    const now = Date.now();
    const result = await leaveSeriesSignup(ctx, user._id, series._id, now);
    if (!result.hadSignup && result.left === 0) throw new ConvexError("You aren't signed up for this series.");
    await audit(ctx, user, "eventSeries", series._id, "mentorLeaveSeries", { signedUp: result.hadSignup }, { left: result.left });
    if (result.firstEventId) await queueMentorMeetingActivityDigest(ctx, { eventId: result.firstEventId, activity: "mentorLeft" }); // M5, once
    return { left: result.left };
  },
});

/**
 * The signed-in Mentor changes their answers for an event they are going to, while it is upcoming. Same required answers as
 * signUp. With `allMeetingsInSeries`, the answers also become their series sign-up's answers and are copied to every
 * upcoming meeting of the series they are going to.
 */
export const updateAnswers = mutation({
  args: { eventId: v.id("events"), canDriveStudents: v.optional(v.boolean()), needsHotelRoom: v.optional(v.boolean()), allMeetingsInSeries: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireMentor(ctx);
    const now = Date.now();
    const event = await currentEvent(ctx, args.eventId, now);
    const rows = await mentorInviteRows(ctx, event._id, user._id);
    if (rows[0]?.status !== "accepted") throw new ConvexError("Sign up for this event before answering its questions.");
    const answers = requireAnswers(event, args);
    for (const row of rows) await ctx.db.patch(row._id, { ...answers, answeredAt: now });
    if (args.allMeetingsInSeries && event.seriesId) {
      const signup = await seriesSignupFor(ctx, event.seriesId, user._id);
      if (signup?.status === "active") await ctx.db.patch(signup._id, { canDriveStudents: answers.canDriveStudents, needsHotelRoom: answers.needsHotelRoom, updatedAt: now });
      for (const meeting of await upcomingSeriesMeetings(ctx, event.seriesId, todayKey(now), now)) {
        if (meeting._id === event._id) continue;
        for (const row of await mentorInviteRows(ctx, meeting._id, user._id)) if (row.status === "accepted") await ctx.db.patch(row._id, { ...answersFor(meeting, answers), answeredAt: now });
      }
    }
    await audit(ctx, user, "eventMentorInvites", rows[0]._id, "updateAnswers", { canDriveStudents: rows[0].canDriveStudents ?? null, needsHotelRoom: rows[0].needsHotelRoom ?? null }, { canDriveStudents: answers.canDriveStudents ?? null, needsHotelRoom: answers.needsHotelRoom ?? null, allMeetingsInSeries: args.allMeetingsInSeries ?? false });
    return null;
  },
});

const rosterMentor = v.object({ userId: v.id("appUsers"), name: v.string(), isCreator: v.boolean() });
const pendingMentor = v.object({ userId: v.id("appUsers"), name: v.string(), status: v.union(v.literal("invited"), v.literal("declined")) });
const rosterStudent = v.object({ displayName: v.string(), subteam: v.string() });

/**
 * Minimized read of one event for a Mentor who created it, is invited to / signed up for it, or could sign up for it.
 * Returns title, time, place, virtual flag, cancelled flag, audience summary, the sign-up questions with the Mentor's OWN
 * answers, their series sign-up, and signed-up Mentors' names (never other Mentors' answers). Signed-up students' display
 * names and subteams are included ONLY for events the Mentor created or accepted. No fees, balances, health, permission
 * forms, parent contacts, emails or phone numbers.
 */
export const view = query({
  args: { eventId: v.id("events"), asOf: v.number() },
  returns: v.object({
    meeting: mentorMeetingSummary,
    mentors: v.array(rosterMentor),
    /** Invited and declined Mentors: only for the Mentor who created the meeting (otherwise empty). */
    pendingMentors: v.array(pendingMentor),
    /** Confirmed students; null unless the Mentor created or accepted this meeting. */
    students: v.union(v.array(rosterStudent), v.null()),
    studentsTruncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireMentor(ctx);
    const season = await activeSeason(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== season._id) throw new ConvexError(UNAVAILABLE);
    // Client-supplied time (queries don't read the clock), clamped by plausibleAsOf: rounded to the minute and never earlier
    // than the event's creation. A past event is archived by the server at its end, so a Mentor who isn't on it can't open it
    // with an old asOf (selfSignupEligible refuses archived events). Mutations re-check with Date.now().
    const now = plausibleAsOf(args.asOf, [event._creationTime, user._creationTime]);
    if (now === null) throw new ConvexError(UNAVAILABLE);
    const invite = await ctx.db.query("eventMentorInvites").withIndex("by_eventId_and_mentorUserId", q => q.eq("eventId", event._id).eq("mentorUserId", user._id)).first();
    const seriesCache = new Map<Id<"eventSeries">, Doc<"eventSeries"> | null>();
    const creatorId = await mentorMeetingCreatorId(ctx, event, seriesCache);
    const isCreator = creatorId === user._id;
    // Past (or archived) events only for a Mentor who is on them: the Mentor-meeting creator or an invited/signed-up Mentor.
    if (!isCreator && !invite && !selfSignupEligible(user, event, now)) throw new ConvexError("This meeting isn't available to you.");
    const signup = event.seriesId ? await seriesSignupFor(ctx, event.seriesId, user._id) : null;
    const series = event.seriesId ? await seriesOf(ctx, event.seriesId, seriesCache) : null;
    const meeting = meetingSummary(event, user, invite, creatorId, now, signup, series);
    const participating = isCreator || invite?.status === "accepted";
    const list = await listMeetingMentors(ctx, event._id);
    const nameOf = async (id: Id<"appUsers">) => mentorDisplayName(await ctx.db.get(id));
    const mentors: { userId: Id<"appUsers">; name: string; isCreator: boolean }[] = [];
    const pendingMentors: { userId: Id<"appUsers">; name: string; status: "invited" | "declined" }[] = [];
    for (const entry of list) {
      if (entry.status === "accepted") mentors.push({ userId: entry.userId, name: await nameOf(entry.userId), isCreator: entry.isCreator });
      else if (isCreator) pendingMentors.push({ userId: entry.userId, name: await nameOf(entry.userId), status: entry.status });
    }
    let students: { displayName: string; subteam: string }[] | null = null;
    let studentsTruncated = false;
    if (participating) {
      const rows = await ctx.db.query("participants").withIndex("by_eventId_and_status", q => q.eq("eventId", event._id).eq("status", "confirmed")).take(MAX_ROSTER_STUDENTS + 1);
      studentsTruncated = rows.length > MAX_ROSTER_STUDENTS;
      students = [];
      for (const row of rows.slice(0, MAX_ROSTER_STUDENTS)) {
        const student = await ctx.db.get(row.studentId);
        if (!student || !student.active) continue;
        students.push({ displayName: student.preferredName.trim() || student.legalName, subteam: canonicalSubteam(student.subteam) });
      }
      students.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    mentors.sort((a, b) => a.name.localeCompare(b.name));
    return { meeting, mentors, pendingMentors, students, studentsTruncated };
  },
});

/** Scheduled follow-up page of the M4 "new event you can join" notice (see queueMentorMeetingOpenDigestPage). */
export const continueOpenDigest = internalMutation({
  args: {
    eventId: v.id("events"), cursor: v.union(v.string(), v.null()), actorId: v.optional(v.id("appUsers")), pageSize: v.optional(v.number()),
    /** Which accounts this page reads (default Mentor accounts); see OpenDigestPhase. */
    phase: v.optional(v.union(v.literal("mentor"), v.literal("parentMentor"), v.literal("parentTravelLead"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await queueMentorMeetingOpenDigestPage(ctx, args);
    return null;
  },
});

/**
 * Cleanup after an account loses Mentor access (a Parent's Mentor staff access removed, or the account deactivated): ends
 * their series sign-ups and removes their rows on upcoming events. Safe to call any time (does nothing while still a Mentor).
 * Read paths already ignore such accounts. Returns how many rows were removed.
 */
export const removeLostMentorAccess = internalMutation({
  args: { userId: v.id("appUsers") }, returns: v.number(),
  handler: async (ctx, args) => await removeLostMentorSignups(ctx, args.userId, Date.now()),
});
