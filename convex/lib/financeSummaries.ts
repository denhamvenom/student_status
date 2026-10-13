import { updateFinanceAggregate } from "./reportAggregates";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { cents, ensureFinancialAccount, financialAccount } from "./financialSources";

export const FINANCE_SUMMARY_VERSION = 3 as const;
export type FinanceSnapshot = { entries: Doc<"ledgerEntries">[]; charges: Doc<"charges">[] };

/** Committed projection totals are constant-time, independent of lifetime ledger length. */
export async function calculateStudentFinance(ctx: MutationCtx | QueryCtx, studentId: Id<"students">, _snapshot?: FinanceSnapshot) {
  void _snapshot;
  const account = await financialAccount(ctx, studentId);
  if (!account || account.state === "rebuilding" || account.state === "uninitialized" || account.state === "failed" && !account.allocationJobId && !account.operationJobId && !account.fundraiserJobId) throw new Error("Financial records require preparation before totals are available.");
  const projection = {
    studentId, seasonId: account.seasonId, chargedCents: account.chargedCents, paidCents: account.paidCents,
    dueCents: cents(account.chargedCents - account.paidCents), personalAvailableCents: account.personalAvailableCents,
    fundraisingAvailableCents: account.fundraisingAvailableCents,
    travelBalanceCents: cents(account.personalAvailableCents + account.fundraisingAvailableCents),
    travelShareCents: account.travelShareCents, transferredInCents: account.transferredInCents,
    knownRaisedCents: account.knownRaisedCents, raisedComplete: account.unknownGrossSourceCount === 0,
    updatedAt: account.lastFinancialChangeAt ?? account.lastLedgerAt, version: FINANCE_SUMMARY_VERSION,
  };
  for (const value of [projection.chargedCents, projection.paidCents, projection.personalAvailableCents, projection.fundraisingAvailableCents, projection.travelShareCents, projection.transferredInCents, projection.knownRaisedCents]) cents(value);
  return projection;
}

export async function refreshStudentFinance(ctx: MutationCtx, studentId: Id<"students">, snapshot?: FinanceSnapshot) {
  if (!await financialAccount(ctx, studentId)) await ensureFinancialAccount(ctx, studentId);
  const projection = await calculateStudentFinance(ctx, studentId, snapshot);
  const previous = await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique();
  if (previous) await ctx.db.patch(previous._id, projection);
  else await ctx.db.insert("studentFinanceSummaries", projection);
  await updateFinanceAggregate(ctx, previous, projection);
  return projection;
}
