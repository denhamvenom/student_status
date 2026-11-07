import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { MAX_MENTOR_INVITES } from "./lib/createEventCore";
import {
  acceptMeeting, isMentorCapable, mentorInviteRows, mentorQuestions, recordSeriesSkip, requireAnswers, requireInvitableMeetingMentors, signUpForSeries, signupChoice,
} from "./lib/mentorMeetings";
import { notifyStaffInvited, queueMentorMeetingActivityDigest } from "./lib/notificationTriggers";
import { questionsValidator, requireMentor, seriesScopeValidator, signupArgs } from "./mentorMeetings";

/** Current events scanned for a Mentor's invitations (the same order of size as app.listEvents' 200). */
const MAX_CURRENT_EVENTS = 300;

const myInvite = v.object({
  eventId: v.id("events"), title: v.string(), startsAt: v.number(), endsAt: v.number(), location: v.string(), virtual: v.boolean(),
  locationType: v.union(v.literal("inPerson"), v.literal("virtual")),
  cancelled: v.boolean(), status: v.union(v.literal("invited"), v.literal("accepted"), v.literal("declined")),
});

/** The signed-in Mentor's own invitations: title, time, place and status only (no rosters, fees or health data). */
export const myInvitedEvents = query({
  args: {}, returns: v.array(myInvite),
  handler: async ctx => {
    const user = await viewer(ctx);
    const stored = await ctx.db.get(user._id);
    if (!isMentorCapable(stored)) throw new ConvexError("Only a Mentor has event invitations.");
    const season = await activeSeason(ctx);
    const out: (typeof myInvite.type)[] = [];
    // Read from the season's current (not yet archived) events, soonest end first, with a point lookup of this Mentor's
    // invite on each. Invite rows have no event time, so reading them oldest-first could miss upcoming invitations behind
    // many old accepted ones (past events are archived and drop out here). Bounded like the event list.
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false)).take(MAX_CURRENT_EVENTS);
    for (const event of events) {
      // .first(), not .unique(): a duplicate invite row must not break the whole invitations page.
      const invite = await ctx.db.query("eventMentorInvites").withIndex("by_eventId_and_mentorUserId", q => q.eq("eventId", event._id).eq("mentorUserId", user._id)).first();
      // Declined invitations for current events are returned too, so /invited can offer "I'll be there after all" (respond
      // accepts again).
      if (!invite) continue;
      out.push({ eventId: event._id, title: event.name, startsAt: event.startsAt, endsAt: event.endsAt, location: event.destination, virtual: event.locationType === "virtual", locationType: event.locationType ?? "inPerson", cancelled: event.cancelled ?? false, status: invite.status });
    }
    return out.sort((a, b) => a.startsAt - b.startsAt);
  },
});

/**
 * A Mentor answers only their own invitation, for a current event (active season, not archived, canceled or over).
 * Accepting takes the same answers and series choice as mentorMeetings.signUp (canDriveStudents for travel, needsHotelRoom
 * for overnight; for a series meeting `scope` all / one (default) / next with `count`). Declining a self sign-up removes it,
 * the same as mentorMeetings.withdraw (a self row is never kept as "declined"); declining a meeting of a series the Mentor
 * signed up for records it as skipped.
 */
export const respond = mutation({
  args: { eventId: v.id("events"), status: v.union(v.literal("accepted"), v.literal("declined")), ...signupArgs }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireMentor(ctx);
    const season = await activeSeason(ctx);
    const rows = await mentorInviteRows(ctx, args.eventId, user._id);
    const invite = rows[0];
    const event = invite && await ctx.db.get(invite.eventId);
    const now = Date.now();
    if (!invite || !event || event.seasonId !== season._id || event.archived || event.cancelled || event.endsAt <= now) throw new ConvexError("This invitation is no longer available. Reload to see current invitations.");
    if (args.status === "declined") {
      if (invite.source === "self") for (const row of rows) await ctx.db.delete(row._id);
      else for (const row of rows) await ctx.db.patch(row._id, { status: "declined", respondedAt: now });
      await recordSeriesSkip(ctx, user._id, event, now);
      await audit(ctx, user, "eventMentorInvites", invite._id, "respond", invite.status, invite.source === "self" ? null : "declined");
      if (invite.status === "accepted") await queueMentorMeetingActivityDigest(ctx, { eventId: event._id, activity: "mentorLeft" });
      return null;
    }
    const choice = signupChoice(event, args.scope, args.count);
    const answers = requireAnswers(event, args);
    const joined = event.seriesId && event.seriesOccurrenceKey
      ? await signUpForSeries(ctx, user, event, choice, answers, now)
      : (await acceptMeeting(ctx, user, event, answers, now)) === "joined" ? 1 : 0;
    await audit(ctx, user, "eventMentorInvites", invite._id, "respond", invite.status, { status: "accepted", scope: choice.scope, count: choice.count ?? null, joined });
    // M5 for a Mentor-created meeting, only when the answer actually changes whether this Mentor is coming (once per sign-up).
    if (joined > 0) await queueMentorMeetingActivityDigest(ctx, { eventId: event._id, activity: "mentorJoined" });
    return null;
  },
});

/**
 * A Coach, or a Travel Lead: a Mentor with Travel Lead, or a Parent with a current Travel Lead staff-access grant acting as
 * Travel Lead (viewer() resolves that selected role to the Travel Lead shape and re-checks the grant on every request; Parents
 * with staff access are Mentors first). A Travel Lead flag on any other role grants nothing. The same people manage
 * invitations and read Mentors' sign-up answers.
 */
async function requireInviter(ctx: MutationCtx | QueryCtx) {
  const user = await viewer(ctx);
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can manage Mentor invitations.");
  return user;
}

const eventInvite = v.object({
  mentorUserId: v.id("appUsers"), name: v.string(),
  status: v.union(v.literal("invited"), v.literal("accepted"), v.literal("declined")),
  source: v.union(v.literal("individual"), v.literal("subteam"), v.literal("self")),
  /** The Mentor's answers (null when not asked or not answered yet). */
  canDriveStudents: v.union(v.boolean(), v.null()), needsHotelRoom: v.union(v.boolean(), v.null()),
  /** How the Mentor signed up for this meeting's series, or null (not a series meeting, or no series sign-up). */
  seriesScope: v.union(seriesScopeValidator, v.null()), seriesCount: v.union(v.number(), v.null()),
});
type EventInvite = typeof eventInvite.type;

async function eventMentorRows(ctx: QueryCtx, eventId: Id<"events">): Promise<{ event: Doc<"events">; mentors: EventInvite[] }> {
  const season = await activeSeason(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.seasonId !== season._id) throw new ConvexError("This event is no longer available. Reload to see current events.");
  const rows = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_MENTOR_INVITES);
  const out: EventInvite[] = [];
  const seen = new Set<Id<"appUsers">>();
  for (const row of rows) {
    if (seen.has(row.mentorUserId)) continue; // a duplicate invite row is listed once
    seen.add(row.mentorUserId);
    const mentor = await ctx.db.get(row.mentorUserId);
    if (!isMentorCapable(mentor)) continue; // lost Mentor access: no longer on the event
    const signup = row.seriesSignupId ? await ctx.db.get(row.seriesSignupId) : null;
    const scoped = signup?.status === "active" ? signup : null;
    out.push({
      mentorUserId: row.mentorUserId, name: mentor.name, status: row.status, source: row.source,
      canDriveStudents: row.canDriveStudents ?? null, needsHotelRoom: row.needsHotelRoom ?? null, seriesScope: scoped?.scope ?? null, seriesCount: scoped?.count ?? null,
    });
  }
  return { event, mentors: out.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Coach / Travel Lead (requireInviter): an event's Mentors with status, source, answers and series choice (bounded to the per-event cap). */
export const forEvent = query({
  args: { eventId: v.id("events") }, returns: v.array(eventInvite),
  handler: async (ctx, args) => {
    await requireInviter(ctx);
    return (await eventMentorRows(ctx, args.eventId)).mentors;
  },
});

/**
 * Coach / Travel Lead (requireInviter): forEvent plus the questions this event asks and counts of going Mentors: how many can drive
 * students, how many need a hotel room, and how many haven't answered a question that applies.
 */
export const forEventSummary = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    questions: questionsValidator, mentors: v.array(eventInvite),
    counts: v.object({ accepted: v.number(), invited: v.number(), declined: v.number(), drivers: v.number(), hotelRooms: v.number(), unansweredDrive: v.number(), unansweredHotel: v.number() }),
  }),
  handler: async (ctx, args) => {
    await requireInviter(ctx);
    const { event, mentors } = await eventMentorRows(ctx, args.eventId);
    const questions = mentorQuestions(event);
    const going = mentors.filter(mentor => mentor.status === "accepted");
    return {
      questions, mentors,
      counts: {
        accepted: going.length, invited: mentors.filter(mentor => mentor.status === "invited").length, declined: mentors.filter(mentor => mentor.status === "declined").length,
        drivers: questions.askDrive ? going.filter(mentor => mentor.canDriveStudents === true).length : 0,
        hotelRooms: questions.askHotel ? going.filter(mentor => mentor.needsHotelRoom === true).length : 0,
        unansweredDrive: questions.askDrive ? going.filter(mentor => mentor.canDriveStudents === null).length : 0,
        unansweredHotel: questions.askHotel ? going.filter(mentor => mentor.needsHotelRoom === null).length : 0,
      },
    };
  },
});

/** Adds Mentors (or Parents with Mentor staff access) to an existing event. Mentors already invited are left alone; only newly added ones are notified. */
export const addMentorInvites = mutation({
  args: { eventId: v.id("events"), mentorUserIds: v.array(v.id("appUsers")) }, returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireInviter(ctx);
    const season = await activeSeason(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== season._id || event.archived || event.cancelled) throw new ConvexError("This event is no longer available. Reload to see current events.");
    const mentors = (await requireInvitableMeetingMentors(ctx, args.mentorUserIds)).map(mentor => mentor._id);
    const existing = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_MENTOR_INVITES + 1);
    const have = new Set<Id<"appUsers">>(existing.map(row => row.mentorUserId));
    const fresh = mentors.filter(id => !have.has(id));
    if (existing.length + fresh.length > MAX_MENTOR_INVITES) throw new ConvexError("An event can have up to 200 invited Mentors.");
    const createdAt = Date.now();
    for (const mentorUserId of fresh) await ctx.db.insert("eventMentorInvites", { eventId: event._id, mentorUserId, source: "individual", status: "invited", invitedBy: user._id, createdAt });
    if (fresh.length) {
      await audit(ctx, user, "events", event._id, "addMentorInvites", null, { count: fresh.length });
      await notifyStaffInvited(ctx, { eventId: event._id, staffUserIds: fresh });
    }
    return fresh.length;
  },
});

export const removeMentorInvite = mutation({
  args: { eventId: v.id("events"), mentorUserId: v.id("appUsers") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInviter(ctx);
    // Same event guard as addMentorInvites: only a current event in the active season has invitations to manage.
    const season = await activeSeason(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== season._id || event.archived || event.cancelled) throw new ConvexError("This event is no longer available. Reload to see current events.");
    const rows = await mentorInviteRows(ctx, event._id, args.mentorUserId);
    const invite = rows[0];
    if (!invite) throw new ConvexError("This invitation no longer exists. Reload to see current invitations.");
    for (const row of rows) await ctx.db.delete(row._id);
    await audit(ctx, user, "eventMentorInvites", invite._id, "remove", invite.status, null);
    return null;
  },
});
