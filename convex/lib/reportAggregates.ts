import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const reportAggregate = new DirectAggregate<{ Namespace: string; Key: number; Id: string }>(components.reportAggregates);
export const financeMetrics = ["chargedCents", "paidCents", "dueCents", "travelBalanceCents", "personalAvailableCents", "fundraisingAvailableCents", "travelShareCents", "transferredInCents"] as const;
export type FinanceMetric = typeof financeMetrics[number];
type FinanceSummary = Pick<Doc<"studentFinanceSummaries">, "studentId" | "seasonId" | FinanceMetric>;
export const financeNamespace = (seasonId: Id<"seasons">, metric: FinanceMetric) => `finance:${seasonId}:${metric}`;

export async function updateFinanceAggregate(ctx: MutationCtx, previous: FinanceSummary | null, next: FinanceSummary) {
  for (const metric of financeMetrics) {
    if (previous && previous.seasonId !== next.seasonId) await reportAggregate.deleteIfExists(ctx, { namespace: financeNamespace(previous.seasonId,metric), key: 0, id: previous.studentId });
    await reportAggregate.replaceOrInsert(ctx, { namespace: financeNamespace(next.seasonId,metric), key: 0, id: next.studentId }, { namespace: financeNamespace(next.seasonId,metric), key: 0, sumValue: next[metric] });
  }
}
export async function readFinanceAggregates(ctx: QueryCtx, seasonId: Id<"seasons">) {
  const values = await Promise.all(financeMetrics.map(metric => reportAggregate.sum(ctx,{namespace:financeNamespace(seasonId,metric)})));
  return Object.fromEntries(financeMetrics.map((metric,index)=>[metric,values[index]])) as Record<FinanceMetric,number>;
}

export type AttendanceWeekday = "Tuesday" | "Thursday" | "other";
export const attendanceNamespace = (season: Id<"seasons">, metric: "held" | "pending" | "failed", weekday: AttendanceWeekday | "all" = "all") => `attendance:${season}:${metric}:${weekday}`;
export const studentAttendanceNamespace = (season: Id<"seasons">, student: Id<"students">, weekday: AttendanceWeekday | "all" = "all") => `attendance:${season}:${student}:qualified:${weekday}`;

/** State rows account for session coverage, including sessions with no student evidence. */
export async function updateSessionAggregate(ctx: MutationCtx, previous: Doc<"timeclockSessionReportStates"> | null, next: Doc<"timeclockSessionReportStates">) {
  const remove = async (row: Doc<"timeclockSessionReportStates">) => {
    if(row.sessionState==="open"||row.state==="ready"&&(row.sessionState!=="closed"||row.needsReview))return;
    const metric=row.state==="ready"?"held":row.state==="failed"?"failed":"pending";
    for (const day of ["all",row.weekday] as const) await reportAggregate.deleteIfExists(ctx,{namespace:attendanceNamespace(row.seasonId,metric,day),key:row.scheduledStart,id:row.sessionId});
  };
  if (previous) await remove(previous);
  if (next.sessionState === "open" || next.state === "ready" && (next.sessionState !== "closed" || next.needsReview)) return;
  const metric = next.state === "ready" ? "held" : next.state === "failed" ? "failed" : "pending";
  for (const day of ["all",next.weekday] as const) await reportAggregate.insertIfDoesNotExist(ctx,{namespace:attendanceNamespace(next.seasonId,metric,day),key:next.scheduledStart,id:next.sessionId,sumValue:1});
}

/** Contributions can update during rebuilding; readers gate on any pending/failed session. */
export async function updateStudentAttendanceAggregate(ctx: MutationCtx, previous: Doc<"timeclockAttendanceSummaries"> | null, next: Doc<"timeclockAttendanceSummaries">) {
  if (previous) for (const day of ["all",previous.weekday] as const) await reportAggregate.deleteIfExists(ctx,{namespace:studentAttendanceNamespace(previous.seasonId,previous.studentId,day),key:previous.scheduledStart,id:previous.sessionId});
  if (next.sessionState !== "closed" || next.needsReview || !next.qualifies) return;
  for (const day of ["all",next.weekday] as const) await reportAggregate.insertIfDoesNotExist(ctx,{namespace:studentAttendanceNamespace(next.seasonId,next.studentId,day),key:next.scheduledStart,id:next.sessionId,sumValue:1});
}
