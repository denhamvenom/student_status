import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { chicagoDateKey } from "./timeclock";

/** Prevent new attendance/calendar writes while a season is being closed. */
export async function timeclockTransitionLocked(ctx: QueryCtx | MutationCtx, seasonId: Id<"seasons">) {
  const plan = await ctx.db.query("seasonTransitionPlans")
    .withIndex("by_sourceSeasonId_and_open", q => q.eq("sourceSeasonId", seasonId).eq("open", true)).unique();
  return !!plan && ["draining", "applying", "verifying", "failed"].includes(plan.state);
}

export async function requireTimeclockSeasonWritable(ctx: QueryCtx | MutationCtx, seasonId: Id<"seasons">) {
  if (await timeclockTransitionLocked(ctx, seasonId)) throw new Error("Season transition is in progress. New attendance and calendar changes are paused; clock-out remains available.");
}

/** Move prefetched future occurrences, never an occurrence with attendance history. */
export async function advanceTimeclockSeasonBoundary(ctx: MutationCtx, sourceSeasonId: Id<"seasons">, targetSeasonId: Id<"seasons">, cursor: string | null, boundaryAt: number) {
  if (!Number.isFinite(boundaryAt) || sourceSeasonId === targetSeasonId) throw new Error("Invalid Timeclock season boundary.");
  const page = await ctx.db.query("timeclockOccurrences")
    .withIndex("by_seasonId_and_scheduledStart", q => q.eq("seasonId", sourceSeasonId))
    .paginate({ cursor, numItems: 25 });
  const boundaryDate = chicagoDateKey(boundaryAt);
  for (const occurrence of page.page) {
    const future = occurrence.allDay ? !!occurrence.allDayStartDate && occurrence.allDayStartDate > boundaryDate : occurrence.scheduledStart !== undefined && occurrence.scheduledStart >= boundaryAt;
    if (!future || occurrence.cancelled) continue;
    const session = await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).unique();
    if (!session) await ctx.db.patch(occurrence._id, { seasonId: targetSeasonId });
  }
  return { continueCursor: page.continueCursor, isDone: page.isDone };
}

/** Call in the same transaction as the final active-season switch. */
export async function finalizeTimeclockSeasonBoundary(ctx: MutationCtx, sourceSeasonId: Id<"seasons">) {
  const open = await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state", q => q.eq("seasonId", sourceSeasonId).eq("state", "open")).first();
  if (open) throw new Error("Close all source-season Timeclock sessions before activation.");
  const sync = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (sync) await ctx.db.patch(sync._id, { generation: sync.generation + 1, syncToken: undefined, lastAttemptAt: undefined, lastSuccessAt: undefined, lastError: undefined });
}
