import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { AppUser } from "./access";
import { effectiveChargeCents } from "./money";
import { recordChargeChange, recordProjectedEntry, type FinancialAccount } from "./financialSources";

export async function withdrawalStep(ctx: MutationCtx, actor: AppUser, account: FinancialAccount, job: Doc<"financialOperationJobs">) {
  const page = await ctx.db.query("financialWithdrawalCharges").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ cursor: job.chargeCursor, numItems: 1, maximumRowsRead: 2 });
  if (page.page.length > 1) throw new Error("Withdrawal page exceeded its read budget.");
  const plan = page.page[0];
  if (!plan) return { done: page.isDone, cursor: page.continueCursor, committed: job.committedCents };
  if (plan.state === "complete") return { done: page.isDone, cursor: page.continueCursor, committed: job.committedCents };
  const charge = await ctx.db.get(plan.chargeId);
  if (!charge || charge.studentId !== account.studentId || charge.eventId !== job.eventId) throw new Error("Withdrawal charge scope changed.");
  const effective = effectiveChargeCents(charge); const previousApplied = charge.appliedCents;
  const allocations = await ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_chargeId_and_status", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("chargeId", charge._id).eq("status", "applied")).take(20);
  let remaining = plan.refundCents - plan.returnedCents;
  let returned = plan.returnedCents;
  for (const allocation of allocations) {
    const reverse = Math.min(remaining, allocation.appliedCents);
    if (!reverse) continue;
    const next = charge.appliedCents - reverse;
    const entryId = await ctx.db.insert("ledgerEntries", { studentId: account.studentId, chargeId: charge._id, eventId: job.eventId, kind: "deallocation", amountCents: reverse, previousCents: charge.appliedCents, newCents: next, sourceEntryId: allocation.sourceEntryId, sourceKind: allocation.sourceKind, reason: job.reason, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `${job.idempotencyKey}:return:${job.step}:${charge._id}:${allocation.sourceEntryId}` });
    await recordProjectedEntry(ctx, entryId, account);
    charge.appliedCents = next; remaining -= reverse; returned += reverse;
    if (!remaining) break;
  }
  if (remaining && !allocations.length) throw new Error("Withdrawal source history does not cover its approved return.");
  const done = remaining === 0;
  const cancelled = returned - plan.returnedCents + (done ? plan.cancelUnpaidCents : 0);
  if (cancelled) {
    charge.cancelledCents = (charge.cancelledCents ?? 0) + cancelled;
    const cancellationId = await ctx.db.insert("ledgerEntries", { studentId: account.studentId, chargeId: charge._id, eventId: job.eventId, kind: "cancellation", amountCents: cancelled, previousCents: effective, newCents: effective - cancelled, reason: job.reason, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `${job.idempotencyKey}:cancel:${job.step}:${charge._id}` });
    await recordProjectedEntry(ctx, cancellationId, account);
  }
  await ctx.db.patch(charge._id, { appliedCents: charge.appliedCents, cancelledCents: charge.cancelledCents });
  await recordChargeChange(ctx, account, charge, effective, previousApplied);
  await ctx.db.patch(plan._id, { returnedCents: returned, state: done ? "complete" : "pending" });
  return { done: done && page.isDone, cursor: done ? page.continueCursor : job.chargeCursor, committed: job.committedCents + returned - plan.returnedCents };
}
