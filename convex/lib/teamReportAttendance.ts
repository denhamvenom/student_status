import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { attendanceNamespace, reportAggregate, studentAttendanceNamespace } from "./reportAggregates";
import { kickoffBoundaryForCompetitionYear } from "./seasonCalendar";

export async function teamReportAttendanceGate(ctx: QueryCtx, seasonId: Id<"seasons">, year: number) {
  const [backfill, unclassifiedOutreach, unclassifiedBuild, pending, failed] = await Promise.all([
    ctx.db.query("attendanceReportBackfills").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).unique(),
    ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_outreach", q => q.eq("seasonId", seasonId).eq("outreach", undefined)).first(),
    ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_buildDay", q => q.eq("seasonId", seasonId).eq("buildDay", undefined)).first(),
    reportAggregate.count(ctx, { namespace: attendanceNamespace(seasonId, "pending") }),
    reportAggregate.count(ctx, { namespace: attendanceNamespace(seasonId, "failed") }),
  ]);
  const kickoff = kickoffBoundaryForCompetitionYear(year);
  const state = failed > 0 || backfill?.state === "failed" ? "failed" as const : backfill?.state !== "complete" || pending > 0 || unclassifiedOutreach || unclassifiedBuild ? "updating" as const : kickoff.state === "unavailable" ? "unknownKickoff" as const : "ready" as const;
  return { state, kickoff: kickoff.state === "verified" ? { date: kickoff.kickoffDate, at: kickoff.kickoffAt } : null, updatedAt: backfill?.updatedAt ?? null };
}

export async function teamReportAttendanceRow(ctx: QueryCtx, seasonId: Id<"seasons">, studentId: Id<"students">, kickoffAt: number) {
  const offseason = { upper: { key: kickoffAt, inclusive: false } };
  const buildSeason = { lower: { key: kickoffAt, inclusive: true } };
  const [offTuesday,offThursday,offOutreach,buildWeekday,buildSaturday,buildSunday,buildOutreach] = await Promise.all([
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"Tuesday"),bounds:offseason}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"Thursday"),bounds:offseason}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"Outreach"),bounds:offseason}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"BuildWeekday"),bounds:buildSeason}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"BuildSaturday"),bounds:buildSeason}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"BuildSunday"),bounds:buildSeason}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"Outreach"),bounds:buildSeason}),
  ]);
  return { offTuesday, offThursday, offOutreach, buildWeekday, buildSaturday, buildSunday, buildOutreach };
}
