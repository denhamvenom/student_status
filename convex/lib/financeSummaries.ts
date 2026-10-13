import { updateFinanceAggregate } from "./reportAggregates";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { financeFor } from "./readModels";
import { effectiveChargeCents, sourceBalances } from "./money";

export const FINANCE_SUMMARY_VERSION = 2 as const;

/** Source-authoritative recomputation; must run after all financial writes in the transaction. */
export type FinanceSnapshot = { entries: Doc<"ledgerEntries">[]; charges: Doc<"charges">[] };
export async function calculateStudentFinance(ctx: MutationCtx | QueryCtx, studentId: Id<"students">, snapshot?: FinanceSnapshot) {
  const student = await ctx.db.get(studentId);
  if (!student) throw new Error("Student not found.");
  let data;
  if (snapshot) {
    if (snapshot.entries.length > 500 || snapshot.charges.length > 500) throw new Error("Financial record limit reached; summary stopped safely.");
    if (snapshot.entries.some(e => e.studentId !== studentId) || snapshot.charges.some(c => c.studentId !== studentId)) throw new Error("Financial summary scope is inconsistent.");
    const balances = sourceBalances(snapshot.entries);
    const chargedCents = snapshot.charges.reduce((sum,c) => sum + effectiveChargeCents(c), 0);
    const paidCents = snapshot.charges.reduce((sum,c) => sum + c.appliedCents, 0);
    const personalAvailableCents = balances.filter(s => s.entry.kind === "payment").reduce((sum,s) => sum + s.available, 0);
    const fundraisingAvailableCents = balances.filter(s => s.entry.kind === "fundraiser").reduce((sum,s) => sum + s.available, 0);
    data = { entries: snapshot.entries, summary: { chargedCents, paidCents, dueCents: chargedCents-paidCents, personalAvailableCents, fundraisingAvailableCents, travelBalanceCents: personalAvailableCents+fundraisingAvailableCents } };
  } else data = await financeFor(ctx, studentId);
  const direct = data.entries.filter(e => e.kind === "fundraiser" && !e.originEntryId);
  const transferred = data.entries.filter(e => e.kind === "fundraiser" && !!e.originEntryId);
  const projection = {
    studentId, seasonId: student.seasonId, ...data.summary,
    travelShareCents: direct.reduce((sum, e) => sum + e.amountCents, 0),
    transferredInCents: transferred.reduce((sum, e) => sum + e.amountCents, 0),
    updatedAt: data.entries.length ? Math.max(...data.entries.map(e => e.recordedAt)) : null,
    version: FINANCE_SUMMARY_VERSION,
  };
  for (const cents of [projection.chargedCents, projection.paidCents, projection.dueCents, projection.travelBalanceCents, projection.personalAvailableCents, projection.fundraisingAvailableCents, projection.travelShareCents, projection.transferredInCents]) {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Financial summary is inconsistent.");
  }
  return projection;
}

export async function refreshStudentFinance(ctx: MutationCtx, studentId: Id<"students">, snapshot?: FinanceSnapshot) {
  const projection = await calculateStudentFinance(ctx, studentId, snapshot);
  const previous = await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique();
  if (previous) await ctx.db.patch(previous._id, projection);
  else await ctx.db.insert("studentFinanceSummaries", projection);
  await updateFinanceAggregate(ctx, previous, projection);
  return projection;
}
