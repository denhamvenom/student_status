import { ConvexError } from 'convex/values';
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function markRoomCategoryReview(ctx: MutationCtx, studentId: Id<"students">, seasonId: Id<"seasons">) {
  const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", seasonId)).take(201);
  if (events.length > 200) throw new ConvexError("This season has too many events to update room assignments for a Room type change. Nothing was saved. Contact the Student Status administrator.");
  for (const event of events) {
    const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).unique();
    if (membership) await ctx.db.patch(membership.groupId, { needsReview: true });
  }
}
