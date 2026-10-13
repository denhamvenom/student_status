import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AppUser } from "./access";
import { audit } from "./access";
import { effectiveChargeCents } from "./chargeObligation";
import { recordChargeChange, recordProjectedEntry, type FinancialAccount } from "./financialSources";

export function correctionSnapshot(charge: Doc<"charges">) {
  return { amountCents: charge.amountCents, adjustedCents: charge.adjustedCents ?? 0, cancelledCents: charge.cancelledCents ?? 0, effectiveCents: effectiveChargeCents(charge), appliedCents: charge.appliedCents, priority: charge.priority, revision: charge.revision ?? 0 };
}

function readSnapshot(json: string) {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Correction command is inconsistent.");
  const record = value as Record<string, unknown>;
  const number = (key: string) => {
    const field = record[key];
    if (typeof field !== "number" || !Number.isSafeInteger(field)) throw new Error("Correction command is inconsistent.");
    return field;
  };
  const snapshot = { amountCents: number("amountCents"), adjustedCents: number("adjustedCents"), cancelledCents: number("cancelledCents"), effectiveCents: number("effectiveCents"), appliedCents: number("appliedCents"), priority: number("priority"), revision: number("revision") };
  if (effectiveChargeCents(snapshot) !== snapshot.effectiveCents || snapshot.revision < 0) throw new Error("Correction command is inconsistent.");
  return snapshot;
}

/** Old obligation remains authoritative through every source-release page, until final target commit. */
export async function chargeCorrectionStep(ctx: MutationCtx, actor: AppUser, account: FinancialAccount, job: Doc<"financialOperationJobs">) {
  if (!job.chargeId || !job.chargeBeforeJson || !job.correctionKind || job.targetEffectiveCents === undefined || job.releaseRequiredCents === undefined || !job.originalActorId || !job.operationHash) throw new Error("Correction job is missing its immutable command.");
  const before = readSnapshot(job.chargeBeforeJson);
  if (!Number.isSafeInteger(job.targetEffectiveCents) || job.targetEffectiveCents < 0 || job.releaseRequiredCents !== Math.max(0, before.appliedCents - job.targetEffectiveCents) || !Number.isSafeInteger(job.committedCents) || job.committedCents < 0 || job.committedCents > job.releaseRequiredCents || job.correctionKind === "cancellation" && job.targetEffectiveCents > before.effectiveCents) throw new Error("Correction amounts are inconsistent.");
  const charge = await ctx.db.get(job.chargeId);
  if (!charge || charge.studentId !== account.studentId || charge.eventId !== job.eventId || effectiveChargeCents(charge) !== before.effectiveCents || charge.amountCents !== before.amountCents || (charge.adjustedCents ?? 0) !== before.adjustedCents || (charge.cancelledCents ?? 0) !== before.cancelledCents || charge.priority !== before.priority || charge.appliedCents !== before.appliedCents - job.committedCents) throw new Error("Locked correction charge changed; Coach review is required.");
  const previousApplied = charge.appliedCents;
  const sources = await ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_chargeId_and_status", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("chargeId", charge._id).eq("status", "applied")).take(20);
  let remaining = job.releaseRequiredCents - job.committedCents;
  let committed = job.committedCents;
  for (const source of sources) {
    const release = Math.min(remaining, source.appliedCents);
    if (release <= 0) continue;
    const next = charge.appliedCents - release;
    const entryId = await ctx.db.insert("ledgerEntries", { studentId: account.studentId, chargeId: charge._id, eventId: charge.eventId, kind: "deallocation", amountCents: release, previousCents: charge.appliedCents, newCents: next, sourceEntryId: source.sourceEntryId, sourceKind: source.sourceKind, reason: job.reason, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `correction:${job._id}:release:${job.step}:${source.sourceEntryId}` });
    await recordProjectedEntry(ctx, entryId, account);
    charge.appliedCents = next; committed += release; remaining -= release;
    if (!remaining) break;
  }
  if (remaining > 0 && !sources.length) throw new Error("Charge funding evidence does not cover the approved excess release.");
  const done = remaining === 0;
  if (done) {
    if (job.correctionKind === "adjustment") charge.adjustedCents = job.targetEffectiveCents + before.cancelledCents - before.amountCents;
    else charge.cancelledCents = before.cancelledCents + before.effectiveCents - job.targetEffectiveCents;
    if (effectiveChargeCents(charge) !== job.targetEffectiveCents) throw new Error("Correction target is inconsistent.");
    const entryId = await ctx.db.insert("ledgerEntries", { studentId: account.studentId, chargeId: charge._id, eventId: charge.eventId, kind: job.correctionKind === "adjustment" ? "adjustment" : "cancellation", amountCents: job.correctionKind === "adjustment" ? job.targetEffectiveCents - before.effectiveCents : before.effectiveCents - job.targetEffectiveCents, previousCents: before.effectiveCents, newCents: job.targetEffectiveCents, reason: job.reason, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `correction:${job._id}:obligation` });
    await recordProjectedEntry(ctx, entryId, account);
  }
  await ctx.db.patch(charge._id, { adjustedCents: charge.adjustedCents, cancelledCents: charge.cancelledCents, appliedCents: charge.appliedCents });
  await recordChargeChange(ctx, account, charge, before.effectiveCents, previousApplied);
  if (done) {
    const revisionId = await ctx.db.insert("chargeRevisions", { chargeId: charge._id, studentId: account.studentId, seasonId: account.seasonId, kind: job.correctionKind, beforeAdjustedCents: before.adjustedCents, afterAdjustedCents: charge.adjustedCents ?? 0, beforeCancelledCents: before.cancelledCents, afterCancelledCents: charge.cancelledCents ?? 0, beforeEffectiveCents: before.effectiveCents, afterEffectiveCents: job.targetEffectiveCents, beforeAppliedCents: before.appliedCents, afterAppliedCents: charge.appliedCents, beforePriority: before.priority, afterPriority: charge.priority, requestedTargetCents: job.targetEffectiveCents, releasedCents: committed, createdBy: job.originalActorId, processedBy: actor._id, recordedAt: Date.now(), reason: job.reason, idempotencyKey: job.idempotencyKey, operationHash: job.operationHash, jobId: job._id });
    await ctx.db.patch(job._id, { chargeRevisionId: revisionId });
    await audit(ctx, actor, "charges", charge._id, "completeCorrection", before, { ...correctionSnapshot(charge), releasedCents: committed, revisionId }, job.reason);
  } else await audit(ctx, actor, "charges", charge._id, "releaseCorrectionSources", { appliedCents: previousApplied }, { appliedCents: charge.appliedCents, releasedCents: committed, targetPending: job.targetEffectiveCents }, job.reason);
  return { done, committed };
}
