import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { attendanceNamespace, reportAggregate, studentAttendanceNamespace, studentBuildMinutesNamespace, studentWeekendBuildMinutesNamespace } from "./reportAggregates";
import { kickoffBoundaryForCompetitionYear } from "./seasonCalendar";

export async function teamReportAttendanceGate(ctx: QueryCtx, seasonId: Id<"seasons">, year: number) {
  const [backfill, unclassifiedOutreach, unclassifiedBuild, unclassifiedRequired, unclassifiedBuildFlag, pending, failed] = await Promise.all([
    ctx.db.query("attendanceReportBackfills").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).unique(),
    ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_outreach", q => q.eq("seasonId", seasonId).eq("outreach", undefined)).first(),
    ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_buildDay", q => q.eq("seasonId", seasonId).eq("buildDay", undefined)).first(),
    ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_required", q => q.eq("seasonId", seasonId).eq("required", undefined)).first(),
    ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_build", q => q.eq("seasonId", seasonId).eq("build", undefined)).first(),
    reportAggregate.count(ctx, { namespace: attendanceNamespace(seasonId, "pending") }),
    reportAggregate.count(ctx, { namespace: attendanceNamespace(seasonId, "failed") }),
  ]);
  const kickoff = kickoffBoundaryForCompetitionYear(year);
  const state = failed > 0 || backfill?.state === "failed" ? "failed" as const : backfill?.state !== "complete" || pending > 0 || unclassifiedOutreach || unclassifiedBuild || unclassifiedRequired || unclassifiedBuildFlag ? "updating" as const : kickoff.state === "unavailable" ? "unknownKickoff" as const : "ready" as const;
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
  const build = await buildDayTypeCounts(ctx, seasonId, studentId, kickoffAt);
  return { offTuesday, offThursday, offOutreach, buildWeekday, buildSaturday, buildSunday, buildOutreach, buildWeekdayHeld: build.weekday.held, buildWeekendAttended: build.weekend.attended, buildWeekendHeld: build.weekend.held, buildMinutes: build.totalMinutes, buildWeekdayMinutes: build.weekday.minutes, buildWeekendMinutes: build.weekend.minutes };
}

/** Build-season days attended of held and clocked minutes by day type: Weekend is Saturday + Sunday, Weekday every other Build day. Minutes sum to the student's Build hours. */
export async function buildDayTypeCounts(ctx: QueryCtx, seasonId: Id<"seasons">, studentId: Id<"students">, kickoffAt: number) {
  const bounds = { lower: { key: kickoffAt, inclusive: true } };
  const count = (namespace: string) => reportAggregate.count(ctx, { namespace, bounds });
  const [weekdayHeld, weekdayAttended, satHeld, satAttended, sunHeld, sunAttended, totalMinutes, weekendMinutes] = await Promise.all([
    count(attendanceNamespace(seasonId, "held", "BuildWeekday")), count(studentAttendanceNamespace(seasonId, studentId, "BuildWeekday")),
    count(attendanceNamespace(seasonId, "held", "BuildSaturday")), count(studentAttendanceNamespace(seasonId, studentId, "BuildSaturday")),
    count(attendanceNamespace(seasonId, "held", "BuildSunday")), count(studentAttendanceNamespace(seasonId, studentId, "BuildSunday")),
    reportAggregate.sum(ctx, { namespace: studentBuildMinutesNamespace(seasonId, studentId), bounds }),
    reportAggregate.sum(ctx, { namespace: studentWeekendBuildMinutesNamespace(seasonId, studentId), bounds }),
  ]);
  return {
    weekday: { attended: weekdayAttended, held: weekdayHeld, minutes: totalMinutes - weekendMinutes },
    weekend: { attended: satAttended + sunAttended, held: satHeld + sunHeld, minutes: weekendMinutes },
    totalMinutes,
  };
}
