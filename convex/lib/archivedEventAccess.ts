import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function familyCanReadEvents(ctx: QueryCtx | MutationCtx, actor: Doc<"appUsers">, eventIds: Id<"events">[]) {
  if (actor.role !== "parent" && actor.role !== "student") return true;
  for (const eventId of eventIds) {
    const event = await ctx.db.get(eventId);
    if (!event || event.archived) return false;
  }
  return true;
}

export async function requireFamilyEventAccess(ctx: QueryCtx | MutationCtx, actor: Doc<"appUsers">, eventIds: Id<"events">[]) {
  if (!await familyCanReadEvents(ctx, actor, eventIds)) throw new ConvexError("This event has ended and moved to Past events, which students and parents can't open. Any balance due for it stays in Money.");
}

export async function familyVisibleSubmissions(ctx: QueryCtx | MutationCtx, actor: Doc<"appUsers">, submissions: Doc<"permissionSubmissions">[]) {
  const visible = await Promise.all(submissions.map(async submission => await familyCanReadEvents(ctx, actor, submission.eventIds) ? submission : null));
  return visible.filter((submission): submission is Doc<"permissionSubmissions"> => submission !== null);
}
