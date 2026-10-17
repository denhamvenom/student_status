import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { AppUser } from "./access";
import { audit } from "./access";
import { refreshStudentFinance } from "./financeSummaries";
import { ensureFinancialAccount, recordChargeChange, recordProjectedEntry, saveFinancialAccount } from "./financialSources";
import { makeFunctionReference } from "convex/server";
import { chargeFeeDefinition } from "./feeDefinitions";
import { requireSeasonFinanceReady, requireSeasonFinancialContinuation, type FinancialContinuationId } from "./seasonFinance";

type Entry = Doc<"ledgerEntries">;
type Source = Extract<Entry["kind"], "payment" | "fundraiser">;

export function allocationSourceId(entry: Entry, sources: (Entry & { kind: Source })[]) {
  if (entry.sourceEntryId) return entry.sourceEntryId;
  const earlier = sources.filter(s => s._creationTime <= entry._creationTime);
  if (earlier.length === 1) return earlier[0]._id;
  throw new Error("Historical allocations have ambiguous funding sources; a financial review is required.");
}

export { effectiveChargeCents } from "./chargeObligation";

/** Resolve each allocation to its actual payment or fundraising entry. Older ambiguous records fail closed. */
export function sourceBalances(entries: Entry[]) {
  const sources = entries.filter((e): e is Entry & { kind: Source } => e.kind === "payment" || e.kind === "fundraiser");
  const byId = new Map(sources.map(s => [s._id, { entry: s, available: s.amountCents }]));
  const receivedById = new Map(sources.map(source => [source._id, source.amountCents]));
  for (const entry of entries) {
    if (entry.kind === "paymentCorrection") {
      const source = entry.sourceEntryId ? byId.get(entry.sourceEntryId) : undefined;
      if (!source || source.entry.kind !== "payment" || source.entry.originEntryId || receivedById.get(source.entry._id) !== entry.previousCents || !Number.isSafeInteger(entry.newCents) || entry.newCents < 0 || Math.abs(entry.newCents - entry.previousCents) !== entry.amountCents) throw new Error("Payment correction source is inconsistent.");
      source.available += entry.newCents - entry.previousCents;
      receivedById.set(source.entry._id, entry.newCents);
      continue;
    }
    if (entry.kind !== "allocation" && entry.kind !== "deallocation" && entry.kind !== "payout" && entry.kind !== "transferOut" && entry.kind !== "awardReversal") continue;
    const sourceId = allocationSourceId(entry, sources);
    const source = byId.get(sourceId);
    if (!source || entry.sourceKind && entry.sourceKind !== source.entry.kind || entry.amountCents <= 0) throw new Error("Financial source history is inconsistent.");
    if (entry.studentId !== source.entry.studentId || entry.kind === "payout" && source.entry.kind !== "payment" || entry.kind === "transferOut" && source.entry.kind !== "fundraiser" && !entry.seasonTransitionPlanId) throw new Error("Financial source history is inconsistent.");
    source.available += entry.kind === "deallocation" ? entry.amountCents : -entry.amountCents;
  }
  for (const source of byId.values()) {
    if (!Number.isSafeInteger(source.available) || source.available < 0 || source.available > receivedById.get(source.entry._id)!) throw new Error("Financial source balance is inconsistent.");
  }
  return [...byId.values()];
}

export type ChargeDraft = { label: string; amountCents: number; priority: number; idempotencyKey: string; eventId?: Id<"events">; category?: "main" | "extra"; feeDefinitionId?: Id<"feeDefinitions"> };

export async function addCharge(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, label: string, amountCents: number, priority: number, idempotencyKey: string, eventId?: Id<"events">, category?: "main" | "extra", originId?: FinancialContinuationId) {
  return (await addCharges(ctx, actor, studentId, [{ label, amountCents, priority, idempotencyKey, eventId, category }], `auto:${idempotencyKey}`, originId))[0];
}

export async function addCharges(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, drafts: ChargeDraft[], idempotencyPrefix: string, originId?: FinancialContinuationId) {
  if (drafts.length > 100 || new Set(drafts.map(d => d.idempotencyKey)).size !== drafts.length) throw new Error("Invalid charge batch.");
  if (!drafts.length) return [];
  const ids = new Map<string, Id<"charges">>();
  const missing: ChargeDraft[] = [];
  for (const draft of drafts) {
    if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents < 0) throw new Error("Charge must be a nonnegative number of cents.");
    const duplicate = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", draft.idempotencyKey)).unique();
    if (!duplicate) { missing.push(draft); continue; }
    const charge = duplicate.chargeId ? await ctx.db.get(duplicate.chargeId) : null;
    if (!charge || charge.studentId !== studentId || charge.eventId !== draft.eventId || charge.amountCents !== draft.amountCents || charge.label !== draft.label || (charge.category ?? "main") !== (draft.category ?? "main")) throw new Error("Transaction key is already used for a different charge.");
    ids.set(draft.idempotencyKey, charge._id);
  }
  if (!missing.length) return drafts.map(d => ids.get(d.idempotencyKey)!);
  const account = await ensureFinancialAccount(ctx, studentId, originId);
  const student = await ctx.db.get(studentId);
  if (!student) throw new Error("Student is unavailable for fee assignment.");
  if (originId) await requireSeasonFinancialContinuation(ctx, student.seasonId, originId);
  else await requireSeasonFinanceReady(ctx, student.seasonId);
  for (const draft of missing) {
    const now = Date.now();
    const definition = await chargeFeeDefinition(ctx, actor._id, student, draft);
    const chargeId = await ctx.db.insert("charges", { studentId, eventId: draft.eventId, label: draft.label, amountCents: draft.amountCents, appliedCents: 0, cancelledCents: 0, category: draft.category ?? "main", priority: definition.priority, feeDefinitionId: definition._id, createdBy: actor._id, createdAt: now, outstanding: draft.amountCents > 0 });
    const entryId = await ctx.db.insert("ledgerEntries", { studentId, chargeId, eventId: draft.eventId, kind: "charge", amountCents: draft.amountCents, previousCents: 0, newCents: draft.amountCents, recordedBy: actor._id, recordedAt: now, idempotencyKey: draft.idempotencyKey });
    const charge = await ctx.db.get(chargeId);
    if (!charge) throw new Error("New charge is unavailable.");
    await recordProjectedEntry(ctx, entryId, account);
    await recordChargeChange(ctx, account, charge, 0, 0, true);
    ids.set(draft.idempotencyKey, chargeId);
    await audit(ctx, actor, "charges", chargeId, "create", null, { label: draft.label, amountCents: draft.amountCents, eventId: draft.eventId, category: draft.category ?? "main" });
  }
  await allocateUnapplied(ctx, actor, studentId, idempotencyPrefix, undefined, originId);
  return drafts.map(d => ids.get(d.idempotencyKey)!);
}

/** Bounded synchronous work; remaining allocation is durable and locks competing writers. */
export async function allocateUnapplied(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, idempotencyPrefix: string, excludedEventId?: Id<"events">, originId?: FinancialContinuationId) {
  const account = await ensureFinancialAccount(ctx, studentId, originId);
  if (originId) await requireSeasonFinancialContinuation(ctx, account.seasonId, originId);
  else await requireSeasonFinanceReady(ctx, account.seasonId);
  if (account.personalAvailableCents + account.fundraisingAvailableCents === 0) { await refreshStudentFinance(ctx, studentId); return; }
  const origin = originId ? await ctx.db.get(originId) : null;
  const requiredFinancialProjectionVersion = originId && origin && !("targetSeasonId" in origin) ? ("requiredFinancialProjectionVersion" in origin ? origin.requiredFinancialProjectionVersion : undefined) : 4 as const;
  const jobId = await ctx.db.insert("financialAllocationJobs", { requiredFinancialProjectionVersion, studentId, actorId: actor._id, generation: account.generation, state: "running", chargeCursor: null, step: 0, processed: 0, idempotencyPrefix, excludedEventId, maintenanceOriginId: originId, updatedAt: Date.now() });
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("Allocation job could not be created.");
  account.state = "allocating"; account.allocationJobId = jobId;
  await saveFinancialAccount(ctx, account);
  // Nested mutations isolate each native pagination call and still roll back with this transaction.
  for (let count = 0; count < 5; count++) {
    const current = await ctx.db.get(jobId);
    if (!current || current.state !== "running") break;
    await ctx.runMutation(makeFunctionReference<"mutation">("financialAllocation:processPage"), { jobId, step: current.step });
  }
  await refreshStudentFinance(ctx, studentId);
}
