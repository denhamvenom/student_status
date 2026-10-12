import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type PendingCorrection = { originalIntervalId?: Id<"timeclockIntervals">; targetCorrectionId?: Id<"timeclockCorrections">; kind: "add" | "replace" | "void"; inAt?: number; outAt?: number };

export async function effectiveIntervals(ctx: QueryCtx | MutationCtx, session: Doc<"timeclockSessions">, student: Id<"students">, asOf: number, pending?: PendingCorrection) {
  const original = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", student)).take(501);
  const corrections = await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", student)).take(501);
  if (original.length > 500 || corrections.length > 500) throw new Error("Attendance history exceeds the review limit.");
  const latest = new Map<string, Doc<"timeclockCorrections">>();
  const latestAdded = new Map<string, Doc<"timeclockCorrections">>();
  for (const correction of corrections) if (correction.originalIntervalId) latest.set(correction.originalIntervalId, correction);
  for (const correction of corrections) if (correction.targetCorrectionId) latestAdded.set(correction.targetCorrectionId, correction);
  const intervals: { inAt: number; outAt: number }[] = [];
  for (const row of original) {
    const correction = pending?.originalIntervalId === row._id ? pending : latest.get(row._id);
    if (correction?.kind === "void") continue;
    if (correction?.kind === "replace" && correction.inAt !== undefined && correction.outAt !== undefined) intervals.push({ inAt: correction.inAt, outAt: correction.outAt });
    else intervals.push({ inAt: row.inAt, outAt: row.outAt ?? (session.state === "open" ? Math.min(asOf, session.effectiveEnd) : session.closedAt ?? session.effectiveEnd) });
  }
  for (const correction of corrections) if (correction.kind === "add" && correction.inAt !== undefined && correction.outAt !== undefined) {
    const latestForAdd = pending?.targetCorrectionId === correction._id ? pending : latestAdded.get(correction._id);
    if (latestForAdd?.kind === "void") continue;
    if (latestForAdd?.kind === "replace" && latestForAdd.inAt !== undefined && latestForAdd.outAt !== undefined) intervals.push({ inAt: latestForAdd.inAt, outAt: latestForAdd.outAt });
    else intervals.push({ inAt: correction.inAt, outAt: correction.outAt });
  }
  if (pending?.kind === "add" && pending.inAt !== undefined && pending.outAt !== undefined) intervals.push({ inAt: pending.inAt, outAt: pending.outAt });
  return intervals;
}
