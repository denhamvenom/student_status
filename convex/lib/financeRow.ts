import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { verifyAppliedSources } from "./financialSources";

/** The same materialized-account validation used by the Coach finance roster. */
export async function financeRow(ctx: QueryCtx, studentId: Doc<"students">["_id"]) {
  const [account, summary] = await Promise.all([
    ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique(),
    ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique(),
  ]);
  let state: "ready" | "updating" | "failed" | "uninitialized" = !account || account.state === "uninitialized" ? "uninitialized" : account.state === "failed" ? "failed" : "updating";
  if (account?.state === "ready" && !account.operationJobId && !account.allocationJobId && !account.fundraiserJobId && summary?.version === 4 && summary.financialGeneration === account.generation && summary.financialRevision === account.revision) {
    try {
      verifyAppliedSources(account);
      const fields = [summary.chargedCents, summary.paidCents, summary.personalAppliedCents, summary.fundraisingAppliedCents, summary.dueCents, summary.fundraisingAvailableCents, summary.personalAvailableCents];
      if (fields.some(value => value === undefined || !Number.isSafeInteger(value) || value < 0) || BigInt(summary.personalAppliedCents!) + BigInt(summary.fundraisingAppliedCents!) !== BigInt(summary.paidCents) || BigInt(summary.chargedCents) - BigInt(summary.paidCents) !== BigInt(summary.dueCents) || summary.paidCents !== account.paidCents || summary.chargedCents !== account.chargedCents || summary.personalAppliedCents !== account.personalAppliedCents || summary.fundraisingAppliedCents !== account.fundraisingAppliedCents || summary.personalAvailableCents !== account.personalAvailableCents || summary.fundraisingAvailableCents !== account.fundraisingAvailableCents) throw new Error("Projection needs review.");
      state = "ready";
    } catch { state = "failed"; }
  }
  const ready = state === "ready";
  return { state, chargedCents: ready ? summary!.chargedCents : null, personalAppliedCents: ready ? summary!.personalAppliedCents! : null, fundraisingAppliedCents: ready ? summary!.fundraisingAppliedCents! : null, dueCents: ready ? summary!.dueCents : null, fundraisingAvailableCents: ready ? summary!.fundraisingAvailableCents : null, personalAvailableCents: ready ? summary!.personalAvailableCents : null, generation: account?.generation ?? null, financialRevision: account?.revision ?? null, updatedAt: ready ? summary!.updatedAt : null, account };
}
