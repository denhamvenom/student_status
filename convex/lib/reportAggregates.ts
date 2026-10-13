import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const reportAggregate = new DirectAggregate<{ Namespace: string; Key: number; Id: string }>(components.reportAggregates);
export const financeMetrics = ["chargedCents", "paidCents", "dueCents", "travelBalanceCents", "personalAvailableCents", "fundraisingAvailableCents", "travelShareCents", "transferredInCents", "knownRaisedCents", "unknownRaisedAccounts"] as const;
export type FinanceMetric = typeof financeMetrics[number];
type FinanceSummary = Pick<Doc<"studentFinanceSummaries">, "studentId" | "seasonId" | Exclude<FinanceMetric, "unknownRaisedAccounts"> | "raisedComplete">;
function metricValue(summary: FinanceSummary, metric: FinanceMetric): number {
  if (metric === "unknownRaisedAccounts") return summary.raisedComplete === true ? 0 : 1;
  return summary[metric] ?? 0;
}
export const financeNamespace = (seasonId: Id<"seasons">, metric: FinanceMetric) => `finance:${seasonId}:${metric}`;

export async function updateFinanceAggregate(ctx: MutationCtx, previous: FinanceSummary | null, next: FinanceSummary) {
  for (const metric of financeMetrics) {
    if (previous && previous.seasonId !== next.seasonId) await reportAggregate.deleteIfExists(ctx, { namespace: financeNamespace(previous.seasonId,metric), key: 0, id: previous.studentId });
    await reportAggregate.replaceOrInsert(ctx, { namespace: financeNamespace(next.seasonId,metric), key: 0, id: next.studentId }, { namespace: financeNamespace(next.seasonId,metric), key: 0, sumValue: metricValue(next, metric) });
  }
}
export async function readFinanceAggregates(ctx: QueryCtx, seasonId: Id<"seasons">) {
  const values = await Promise.all(financeMetrics.map(metric => reportAggregate.sum(ctx,{namespace:financeNamespace(seasonId,metric)})));
  return Object.fromEntries(financeMetrics.map((metric,index)=>[metric,values[index]])) as Record<FinanceMetric,number>;
}

const fundraiserMetrics = ["grossCents", "teamCents", "travelCreditCents"] as const;
const sourceNamespace = (studentId: Id<"students">, generation: number, fundraiserId: Id<"fundraisers">) => `source:${studentId}:${generation}:fundraiser:${fundraiserId}`;
export async function updateFinancialSourceAggregate(ctx: MutationCtx, previous: Doc<"financialSources"> | null, next: Doc<"financialSources">) {
  if (previous?.kind === "fundraiser" && previous.fundraiserId && previous.rootOriginEntryId === previous.sourceEntryId) {
    await reportAggregate.deleteIfExists(ctx, { namespace: sourceNamespace(previous.studentId, previous.generation, previous.fundraiserId), key: 0, id: previous.sourceEntryId });
  }
  if (next.kind === "fundraiser" && next.fundraiserId && next.rootOriginEntryId === next.sourceEntryId) {
    const namespace = sourceNamespace(next.studentId, next.generation, next.fundraiserId);
    await reportAggregate.replaceOrInsert(ctx, { namespace, key: 0, id: next.sourceEntryId }, { namespace, key: 0, sumValue: next.availableCents });
  }
}
export async function availableOriginalFundraiserCredit(ctx: QueryCtx | MutationCtx, studentId: Id<"students">, generation: number, fundraiserId: Id<"fundraisers">) {
  return reportAggregate.sum(ctx, { namespace: sourceNamespace(studentId, generation, fundraiserId) });
}
const fundraiserNamespace = (id: Id<"fundraisers">, metric: typeof fundraiserMetrics[number]) => `fundraiser:${id}:${metric}`;
export async function updateFundraiserAggregate(ctx: MutationCtx, previous: Doc<"fundraiserStudentTotals"> | null, row: Doc<"fundraiserStudentTotals">) {
  for (const metric of fundraiserMetrics) {
    if (previous && (previous.fundraiserId !== row.fundraiserId || previous.studentId !== row.studentId)) await reportAggregate.deleteIfExists(ctx, { namespace: fundraiserNamespace(previous.fundraiserId, metric), key: 0, id: previous.studentId });
    const namespace = fundraiserNamespace(row.fundraiserId, metric);
    await reportAggregate.replaceOrInsert(ctx, { namespace, key: 0, id: row.studentId }, { namespace, key: 0, sumValue: row[metric] });
  }
}
export async function readFundraiserAggregates(ctx: QueryCtx | MutationCtx, fundraiserId: Id<"fundraisers">) {
  const [grossCents, teamCents, travelCreditCents, memberCount] = await Promise.all([
    ...fundraiserMetrics.map(metric => reportAggregate.sum(ctx, { namespace: fundraiserNamespace(fundraiserId, metric) })),
    reportAggregate.count(ctx, { namespace: fundraiserNamespace(fundraiserId, "grossCents") }),
  ]);
  return { grossCents, teamCents, travelCreditCents, memberCount };
}

export type AttendanceWeekday = "Tuesday" | "Thursday" | "other";
export const attendanceNamespace = (season: Id<"seasons">, metric: "held" | "pending" | "failed", weekday: AttendanceWeekday | "Outreach" | "all" = "all") => `attendance:${season}:${metric}:${weekday}`;
export const studentAttendanceNamespace = (season: Id<"seasons">, student: Id<"students">, weekday: AttendanceWeekday | "Outreach" | "all" = "all") => `attendance:${season}:${student}:qualified:${weekday}`;

/** State rows account for session coverage, including sessions with no student evidence. */
export async function updateSessionAggregate(ctx: MutationCtx, previous: Doc<"timeclockSessionReportStates"> | null, next: Doc<"timeclockSessionReportStates">) {
  const remove = async (row: Doc<"timeclockSessionReportStates">) => {
    if(row.sessionState==="open"||row.state==="ready"&&(row.sessionState!=="closed"||row.needsReview))return;
    const metric=row.state==="ready"?"held":row.state==="failed"?"failed":"pending";
    for (const day of ["all",row.weekday,...(row.outreach?["Outreach" as const]:[])] as const) await reportAggregate.deleteIfExists(ctx,{namespace:attendanceNamespace(row.seasonId,metric,day),key:row.scheduledStart,id:row.sessionId});
  };
  if (previous) await remove(previous);
  if (next.sessionState === "open" || next.state === "ready" && (next.sessionState !== "closed" || next.needsReview)) return;
  const metric = next.state === "ready" ? "held" : next.state === "failed" ? "failed" : "pending";
  for (const day of ["all",next.weekday,...(next.outreach?["Outreach" as const]:[])] as const) await reportAggregate.insertIfDoesNotExist(ctx,{namespace:attendanceNamespace(next.seasonId,metric,day),key:next.scheduledStart,id:next.sessionId,sumValue:1});
}

/** Contributions can update during rebuilding; readers gate on any pending/failed session. */
export async function updateStudentAttendanceAggregate(ctx: MutationCtx, previous: Doc<"timeclockAttendanceSummaries"> | null, next: Doc<"timeclockAttendanceSummaries">) {
  if (previous) for (const day of ["all",previous.weekday,...(previous.outreach?["Outreach" as const]:[])] as const) await reportAggregate.deleteIfExists(ctx,{namespace:studentAttendanceNamespace(previous.seasonId,previous.studentId,day),key:previous.scheduledStart,id:previous.sessionId});
  if (next.sessionState !== "closed" || next.needsReview || !next.qualifies) return;
  for (const day of ["all",next.weekday,...(next.outreach?["Outreach" as const]:[])] as const) await reportAggregate.insertIfDoesNotExist(ctx,{namespace:studentAttendanceNamespace(next.seasonId,next.studentId,day),key:next.scheduledStart,id:next.sessionId,sumValue:1});
}
