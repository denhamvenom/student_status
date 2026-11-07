import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { eventCreatorId, isMentorCapable, isMentorMeetingNow, type SeriesCache } from "./mentorMeetings";

/**
 * Who created an event, for Coach and Travel Lead screens only (Events list and event page; owner decision, Nov 7 2026):
 * the creator's display name and a role label, nothing else. `mentorMeeting` is true when a Mentor (not a Coach or Travel
 * Lead) created it and it is still a Mentor meeting (isMentorMeetingNow), for the "Mentor meeting" tag.
 */
export const eventCreatorValidator = v.union(v.null(), v.object({
  name: v.string(),
  roleLabel: v.union(v.literal("Coach"), v.literal("Travel Lead"), v.literal("Mentor")),
  mentorMeeting: v.boolean(),
}));

export type EventCreator = Infer<typeof eventCreatorValidator>;
export type CreatorCaches = { series: SeriesCache; users: Map<Id<"appUsers">, Doc<"appUsers"> | null> };

export const creatorCaches = (): CreatorCaches => ({ series: new Map(), users: new Map() });

// The label reflects the creator's role and grant now, not when they created the event (a role change relabels past events).
/** The creator's role as a Coach or Travel Lead reads it; a Parent with staff access is labeled by their grant. Null for any other account. */
export function creatorRoleLabel(user: Pick<Doc<"appUsers">, "role" | "travelLead" | "parentStaffAccess">): "Coach" | "Travel Lead" | "Mentor" | null {
  if (user.role === "coach") return "Coach";
  if (user.role === "mentor") return user.travelLead ? "Travel Lead" : "Mentor";
  if (user.role === "parent" && user.parentStaffAccess === "travelLead") return "Travel Lead";
  if (user.role === "parent" && user.parentStaffAccess === "mentor") return "Mentor";
  return null;
}

/** The event's creator (its own `createdBy`, else its series' creator), or null when unknown. Callers must already be Coach or Travel Lead. */
export async function eventCreatorFor(ctx: QueryCtx, event: Doc<"events">, caches: CreatorCaches = creatorCaches()): Promise<EventCreator> {
  const creatorId = await eventCreatorId(ctx, event, caches.series);
  if (!creatorId) return null;
  let creator = caches.users.get(creatorId);
  if (creator === undefined) { creator = await ctx.db.get(creatorId); caches.users.set(creatorId, creator); }
  if (!creator) return null;
  const roleLabel = creatorRoleLabel(creator);
  if (!roleLabel) return null;
  const mentorMeeting = roleLabel === "Mentor" && isMentorCapable(creator) && await isMentorMeetingNow(ctx, event, caches.series);
  return { name: creator.name, roleLabel, mentorMeeting };
}
