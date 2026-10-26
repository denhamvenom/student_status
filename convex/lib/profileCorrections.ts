import { ConvexError } from 'convex/values';
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminContactError } from "./adminContact";

const TOO_MANY_EVENTS = "This season has too many events to update room assignments for a Room type change. Nothing was saved.";

/** `byCoach` is true only when a Coach made the change; Students and Parents are sent to a Coach instead. */
export async function markRoomCategoryReview(ctx: MutationCtx, studentId: Id<"students">, seasonId: Id<"seasons">, byCoach: boolean) {
  const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", seasonId)).take(201);
  if (events.length > 200) throw byCoach ? adminContactError("tooManyEvents", TOO_MANY_EVENTS) : new ConvexError(`${TOO_MANY_EVENTS} Ask a Coach for help.`);
  for (const event of events) {
    const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).unique();
    if (membership) await ctx.db.patch(membership.groupId, { needsReview: true });
  }
}
