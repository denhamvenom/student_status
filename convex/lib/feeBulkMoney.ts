import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AppUser } from "./access";
import { correctionSnapshot } from "./chargeCorrection";
import { tokenHash } from "./invitationIdentity";
import { saveFinancialAccount, verifyAppliedSources, type FinancialAccount } from "./financialSources";
import { requireEnrollmentComplete } from "./eventEnrollmentState";
import { seasonFinanceControl } from "./seasonFinance";

export function bulkTargetHold(account: FinancialAccount, charge: Doc<"charges"> | null, target: number, kind: Doc<"feeBulkJobs">["kind"]) {
  const cancelled = charge?.cancelledCents ?? 0;
  if (kind !== "cancel" && BigInt(target) + BigInt(cancelled) > BigInt(Number.MAX_SAFE_INTEGER)) return "Target plus previous cancellations exceeds the supported exact-cent range. Review or fully cancel the original operation.";
  const effective = charge ? correctionSnapshot(charge).effectiveCents : 0;
  const total = BigInt(account.chargedCents) + BigInt(target) - BigInt(effective);
  if (total < 0n || total > BigInt(Number.MAX_SAFE_INTEGER)) return "This target cannot be represented in the current total obligation. Correct the financial evidence or fully cancel the original operation.";
  return null;
}

/** Amount and scope come exclusively from the immutable prepared parent row. */
export async function startBulkChargeCorrection(ctx: MutationCtx, actor: AppUser, parent: Doc<"feeBulkJobs">, row: Doc<"feeBulkRows">, account: FinancialAccount) {
  const control = await seasonFinanceControl(ctx, parent.seasonId);
  if (control?.bulkJobId !== parent._id || control.state !== "applying" || parent.state !== "applying" || row.jobId !== parent._id || row.targetAmountCents !== parent.targetAmountCents || !row.chargeId || actor.role !== "coach") throw new Error("Bulk correction has no active prepared authority.");
  if (parent.requiredFinancialProjectionVersion === 4 || account.allocationSourceVersion === 1) verifyAppliedSources(account);
  const charge = await ctx.db.get(row.chargeId);
  if (!charge || charge.studentId !== row.studentId || charge.feeDefinitionId !== parent.feeDefinitionId || (charge.revision ?? 0) !== row.expectedChargeRevision) throw new Error("Prepared fee charge changed.");
  if (charge.eventId) {
    const event = await ctx.db.get(charge.eventId);
    if (!event || event.archived || event.seasonId !== parent.seasonId) throw new Error("Prepared event fee is archived or unavailable.");
    requireEnrollmentComplete(event);
  }
  const before = correctionSnapshot(charge); const target = row.targetAmountCents;
  if (!Number.isSafeInteger(target + before.cancelledCents)) throw new Error("Target plus previous cancellations exceeds the exact-cent range.");
  const release = Math.max(0, before.appliedCents - target);
  const key = `fee-bulk:${parent._id}:${row._id}`;
  const hash = await tokenHash(JSON.stringify([parent.operationHash, row._id, before, target]));
  const existing = await ctx.db.query("financialOperationJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", parent.originalActorId).eq("idempotencyKey", key)).unique();
  if (existing) { if (existing.operationHash !== hash || existing.feeBulkJobId !== parent._id) throw new Error("Bulk row replay evidence changed."); return existing._id; }
  const id = await ctx.db.insert("financialOperationJobs", { requiredFinancialProjectionVersion: parent.requiredFinancialProjectionVersion, kind: "chargeCorrection", studentId: row.studentId, actorId: actor._id, originalActorId: parent.originalActorId, generation: account.generation, state: "running", step: 0, amountCents: release, committedCents: 0, idempotencyKey: key, operationHash: hash, eventId: charge.eventId, feeBulkJobId: parent._id, chargeId: charge._id, correctionKind: parent.kind === "cancel" ? "cancellation" : "adjustment", targetEffectiveCents: target, originalEffectiveCents: before.effectiveCents, originalAppliedCents: before.appliedCents, releaseRequiredCents: release, chargeBeforeJson: JSON.stringify(before), chargeCursor: null, reason: parent.reason, updatedAt: Date.now() });
  account.state = "posting"; account.operationJobId = id; await saveFinancialAccount(ctx, account);
  return id;
}
