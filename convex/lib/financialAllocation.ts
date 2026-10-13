import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { AppUser } from "./access";
import { audit } from "./access";
import { recordChargeChange, recordProjectedEntry, type FinancialAccount } from "./financialSources";
import { effectiveChargeCents } from "./money";

/** A stable scan cursor advances only after a charge is finished or deliberately excluded. */
export async function allocationStep(ctx: MutationCtx, actor: AppUser, account: FinancialAccount, job: Doc<"financialAllocationJobs">) {
  const page = await ctx.db.query("charges").withIndex("by_studentId_and_outstanding_and_priority", q => q.eq("studentId", account.studentId).eq("outstanding", true)).paginate({ cursor: job.chargeCursor, numItems: 1, maximumRowsRead: 2 });
  if (page.page.length > 1) throw new Error("Allocation page exceeded its read budget.");
  const charge = page.page[0];
  if (!charge) return { done: page.isDone, cursor: page.continueCursor, processed: 0 };
  if (charge.eventId === job.excludedEventId && job.excludedEventId) return { done: page.isDone, cursor: page.continueCursor, processed: 1 };
  const sources = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_status_and_sourceCreatedAt", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("status", "available")).take(20);
  if (!sources.length) return { done: true, cursor: job.chargeCursor, processed: 0 };
  const previousApplied = charge.appliedCents;
  const effective = effectiveChargeCents(charge);
  let due = effective - previousApplied;
  for (const source of sources) {
    const amount = Math.min(due, source.availableCents);
    if (amount <= 0) continue;
    const before = charge.appliedCents;
    charge.appliedCents += amount; due -= amount;
    await ctx.db.patch(charge._id, { appliedCents: charge.appliedCents });
    const entryId = await ctx.db.insert("ledgerEntries", {
      studentId: account.studentId, chargeId: charge._id, eventId: charge.eventId, kind: "allocation", amountCents: amount,
      previousCents: before, newCents: charge.appliedCents, sourceEntryId: source.sourceEntryId, sourceKind: source.kind,
      recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `${job.idempotencyPrefix}:${job.step}:${charge._id}:${source.sourceEntryId}`,
    });
    await recordProjectedEntry(ctx, entryId, account);
    await audit(ctx, actor, "charges", charge._id, "allocate", { appliedCents: before }, { appliedCents: charge.appliedCents, sourceKind: source.kind });
    if (due === 0) break;
  }
  await recordChargeChange(ctx, account, charge, effective, previousApplied);
  const fundsRemain = account.personalAvailableCents + account.fundraisingAvailableCents > 0;
  return { done: !fundsRemain || due === 0 && page.isDone, cursor: due > 0 ? job.chargeCursor : page.continueCursor, processed: due === 0 ? 1 : 0 };
}
