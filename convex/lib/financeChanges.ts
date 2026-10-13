import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type Change = Omit<Doc<"financeChangeEvents">, "_id" | "_creationTime">;
export async function recordFinanceChange(ctx: MutationCtx, change: Change) {
  for (const value of [change.beforeCents, change.afterCents, change.deltaCents]) if (value !== null && !Number.isSafeInteger(value)) throw new Error("Finance change evidence exceeds the exact supported range.");
  const existing = await ctx.db.query("financeChangeEvents").withIndex("by_sourceKey", q => q.eq("sourceKey", change.sourceKey)).unique();
  if (existing) {
    if (existing.seasonId !== change.seasonId || existing.sourceId !== change.sourceId || existing.studentId !== change.studentId || existing.kind !== change.kind) throw new Error("Finance change evidence conflicts with its original source.");
    return existing._id;
  }
  return ctx.db.insert("financeChangeEvents", change);
}

/** A ledger fact is a single committed movement, never the planned total of a pending job. */
export async function recordLedgerChange(ctx: MutationCtx, entry: Doc<"ledgerEntries">, seasonId: Id<"seasons">, historical = false) {
  const kinds: Record<string, string> = { charge: "charge", payment: "payment", fundraiser: "fundraisingCredit", allocation: "allocation", deallocation: "release", adjustment: "chargeAdjustment", cancellation: "chargeCancellation", payout: "payout", transferOut: "transferOut", awardReversal: "awardReversal" };
  const kind = kinds[entry.kind]; if (!kind || ["adjustment", "cancellation"].includes(entry.kind) && entry.idempotencyKey?.startsWith("correction:")) return;
  const sourceKind = entry.kind === "payment" ? "payment" : entry.kind === "fundraiser" ? "fundraiser" : entry.sourceKind;
  const meaning = entry.kind === "allocation" || entry.kind === "deallocation" ? "applied" as const
    : ["charge", "adjustment", "cancellation"].includes(entry.kind) ? "obligation" as const
    : ["payment", "fundraiser"].includes(entry.kind) ? "receipt" as const
    : sourceKind === "payment" ? "personalAvailable" as const : "fundraisingAvailable" as const;
  // Legacy records may lack before/after evidence. Do not invent an account or charge balance.
  const receipt = entry.kind === "payment" || entry.kind === "fundraiser";
  const unknownAvailability = historical && ["personalAvailable", "fundraisingAvailable"].includes(meaning);
  const before = receipt || unknownAvailability ? null : entry.previousCents ?? (entry.kind === "charge" ? 0 : null);
  const after = receipt ? entry.amountCents : unknownAvailability ? null : entry.newCents ?? (entry.kind === "charge" ? entry.amountCents : null);
  const delta = before !== null && after !== null ? BigInt(after) - BigInt(before) : null;
  await recordFinanceChange(ctx, { seasonId, studentId: entry.studentId, chargeId: entry.chargeId, actorId: entry.recordedBy, sourceKind, occurredAt: entry.recordedAt, kind,
    state: ["deallocation", "payout", "transferOut", "awardReversal"].includes(entry.kind) ? "progress" : "committed", meaning,
    beforeCents: before, afterCents: after, deltaCents: delta === null ? null : Number(delta), reason: entry.reason ?? "Recorded financial movement",
    sourceType: "ledger", sourceId: entry._id, sourceKey: `ledger:${entry._id}`, historical });
}

export async function recordFundraiserChange(ctx: MutationCtx, revision: Doc<"fundraiserAmountRevisions">, historical = false) {
  await recordFinanceChange(ctx, { seasonId: revision.seasonId, studentId: revision.studentId, actorId: revision.recordedBy, sourceKind: "fundraiser", occurredAt: revision.recordedAt,
    kind: "fundraiserGross", state: "committed", meaning: "grossRaised", beforeCents: revision.previousGrossCents, afterCents: revision.grossCents,
    deltaCents: Number(BigInt(revision.grossCents) - BigInt(revision.previousGrossCents)), reason: revision.reason, sourceType: "fundraiserRevision", sourceId: revision._id, sourceKey: `fundraiserRevision:${revision._id}`, historical });
}

export async function recordChargeRevisionChange(ctx: MutationCtx, revision: Doc<"chargeRevisions">, historical = false) {
  const priority = revision.kind === "priority";
  const before = priority ? revision.beforePriority : revision.beforeEffectiveCents;
  const after = priority ? revision.afterPriority : revision.afterEffectiveCents;
  await recordFinanceChange(ctx, { seasonId: revision.seasonId, studentId: revision.studentId, chargeId: revision.chargeId, actorId: revision.processedBy, occurredAt: revision.recordedAt,
    kind: priority ? "feePriority" : revision.kind === "cancellation" ? "chargeCancellation" : "chargeAdjustment", state: "committed", meaning: priority ? "priority" : "obligation",
    beforeCents: before, afterCents: after, deltaCents: Number(BigInt(after) - BigInt(before)), reason: revision.reason, sourceType: "chargeRevision", sourceId: revision._id, sourceKey: `chargeRevision:${revision._id}`, historical });
}
export async function recordOperationChange(ctx: MutationCtx, operation: Doc<"financeOperations">, seasonId: Id<"seasons">, historical = false) {
  if (operation.state !== undefined && operation.state !== "complete") return;
  const committed = operation.committedCents ?? (operation.state === undefined ? operation.amountCents : undefined);
  if (committed === undefined || committed !== operation.amountCents) throw new Error("Completed financial receipt is inconsistent.");
  await recordFinanceChange(ctx, { seasonId, studentId: operation.studentId, actorId: operation.recordedBy, sourceKind: operation.kind === "payout" ? "payment" : "fundraiser", occurredAt: operation.recordedAt, kind: operation.kind === "payout" ? "payout" : "transferOut", state: "committed", meaning: "receipt", beforeCents: null, afterCents: committed, deltaCents: null, reason: operation.reason, sourceType: "financeOperation", sourceId: operation._id, sourceKey: `financeOperation:${operation._id}`, historical });
}
export async function recordPriorityJobChange(ctx: MutationCtx, job: Doc<"feePriorityJobs">, historical = false) {
  if (job.state !== "complete") return;
  for (const [key, feeDefinitionId, before, after] of [["first", job.firstFeeId, job.firstPriority, job.secondPriority], ["second", job.secondFeeId, job.secondPriority, job.firstPriority]] as const) await recordFinanceChange(ctx, {
    feeDefinitionId, seasonId: job.seasonId, actorId: job.actorId, occurredAt: job.updatedAt, kind: "feePriority", state: "committed", meaning: "priority", beforeCents: before, afterCents: after, deltaCents: Number(BigInt(after) - BigInt(before)), reason: job.reason,
    sourceType: "feePriorityJob", sourceId: job._id, sourceKey: `feePriorityJob:${job._id}:${key}`, historical,
  });
}
