import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { MAX_MENTOR_INVITES, requireInvitableMentors } from "./lib/createEventCore";
import { notifyStaffInvited } from "./lib/notificationTriggers";

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
    if (user.role !== "mentor") throw new ConvexError("Only a Mentor has event invitations.");
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
      // accepts again). Mentor Home's next invitations leave them out (src/features/mentor-invites/next-invites.ts).
      if (!invite) continue;
      out.push({ eventId: event._id, title: event.name, startsAt: event.startsAt, endsAt: event.endsAt, location: event.destination, virtual: event.locationType === "virtual", locationType: event.locationType ?? "inPerson", cancelled: event.cancelled ?? false, status: invite.status });
    }
    return out.sort((a, b) => a.startsAt - b.startsAt);
  },
});

/** A Mentor answers only their own invitation. */
export const respond = mutation({
  args: { eventId: v.id("events"), status: v.union(v.literal("accepted"), v.literal("declined")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "mentor") throw new ConvexError("Only a Mentor can answer an invitation.");
    const rows = await mentorInviteRows(ctx, args.eventId, user._id);
    const invite = rows[0];
    const event = invite && await ctx.db.get(invite.eventId);
    if (!invite || !event || event.archived || event.cancelled) throw new ConvexError("This invitation is no longer available. Reload to see current invitations.");
    // Any duplicate row gets the same answer, so the Mentor's status reads the same everywhere.
    const respondedAt = Date.now();
    for (const row of rows) await ctx.db.patch(row._id, { status: args.status, respondedAt });
    await audit(ctx, user, "eventMentorInvites", invite._id, "respond", invite.status, args.status);
    return null;
  },
});

/** One Mentor's invite rows on an event: normally one, but duplicates are tolerated (and cleaned up by the callers). */
function mentorInviteRows(ctx: MutationCtx, eventId: Id<"events">, mentorUserId: Id<"appUsers">) {
  return ctx.db.query("eventMentorInvites").withIndex("by_eventId_and_mentorUserId", q => q.eq("eventId", eventId).eq("mentorUserId", mentorUserId)).take(10);
}

async function requireInviter(ctx: MutationCtx | QueryCtx) {
  const user = await viewer(ctx);
  // Same rule as the rest of the app: a Coach, or a Mentor with Travel Lead (viewer() resolves a Parent's selected
  // Travel Lead staff role to that shape). A Travel Lead flag on any other role grants nothing.
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can manage Mentor invitations.");
  return user;
}

const eventInvite = v.object({
  mentorUserId: v.id("appUsers"), name: v.string(),
  status: v.union(v.literal("invited"), v.literal("accepted"), v.literal("declined")),
  source: v.union(v.literal("individual"), v.literal("subteam")),
});

/** Coach / Travel Lead: an event's invited Mentors and their answers (bounded to the per-event invite cap). */
export const forEvent = query({
  args: { eventId: v.id("events") }, returns: v.array(eventInvite),
  handler: async (ctx, args) => {
    await requireInviter(ctx);
    const season = await activeSeason(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== season._id) throw new ConvexError("This event is no longer available. Reload to see current events.");
    const rows = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_MENTOR_INVITES);
    const out: (typeof eventInvite.type)[] = [];
    const seen = new Set<Id<"appUsers">>();
    for (const row of rows) {
      if (seen.has(row.mentorUserId)) continue; // a duplicate invite row is listed once
      seen.add(row.mentorUserId);
      const mentor = await ctx.db.get(row.mentorUserId);
      out.push({ mentorUserId: row.mentorUserId, name: mentor?.name ?? "Mentor account unavailable", status: row.status, source: row.source });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Adds Mentors to an existing event. Mentors already invited are left alone; only newly added ones are notified. */
export const addMentorInvites = mutation({
  args: { eventId: v.id("events"), mentorUserIds: v.array(v.id("appUsers")) }, returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireInviter(ctx);
    const season = await activeSeason(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== season._id || event.archived || event.cancelled) throw new ConvexError("This event is no longer available. Reload to see current events.");
    const mentors = await requireInvitableMentors(ctx, args.mentorUserIds);
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
