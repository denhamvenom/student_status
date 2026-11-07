import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Withdrawal rows kept per event and student; more than this fails closed everywhere (never a truncated read). */
export const WITHDRAWAL_HISTORY_LIMIT = 100;
/** Owner decision 2026-11-06 follow-up: a student may undo their own automatic withdrawal at most this many times per event. */
export const STUDENT_UNDO_LIMIT = 3;

/** Every withdrawal row for one event and student. Throws rather than deciding from a partial history. */
export async function withdrawalHistory(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, studentId: Id<"students">) {
  const rows = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(WITHDRAWAL_HISTORY_LIMIT + 1);
  if (rows.length > WITHDRAWAL_HISTORY_LIMIT) throw new ConvexError("This event has too many withdrawal records to update here. Ask a Coach for help.");
  return rows;
}

/**
 * The newest withdrawal rows for one event and student, newest first, for display only (never for a decision). An open
 * request or the approved withdrawal that still blocks re-enrollment is always among the newest rows: a new request can't
 * start while either exists. Decisions use withdrawalHistory.
 */
export async function recentWithdrawals(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, studentId: Id<"students">, count = 3) {
  return await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).order("desc").take(count);
}

/**
 * The approved withdrawal that still blocks re-enrollment, if any. A row a Coach put back (putBackOnEvent) or a student
 * undid (undoWithdrawal) carries reinstatedAt and no longer blocks anything; its history stays.
 */
export function activeApprovedWithdrawal(rows: Doc<"withdrawalRequests">[]) {
  return rows.find(row => row.status === "approved" && row.reinstatedAt === undefined) ?? null;
}

/** How many times the student undid their own withdrawal from this event. */
export function studentUndoCount(rows: Doc<"withdrawalRequests">[]) {
  return rows.filter(row => row.reinstatedByStudent === true).length;
}
