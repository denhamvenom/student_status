import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function markRoomCategoryReview(ctx: MutationCtx, studentId: Id<"students">, seasonId: Id<"seasons">) {
  const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", seasonId)).take(201);
  if (events.length > 200) throw new Error("Event limit reached; room-category correction requires a reviewed continuation.");
  for (const event of events) {
    const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).unique();
    if (membership) await ctx.db.patch(membership.groupId, { needsReview: true });
  }
}
