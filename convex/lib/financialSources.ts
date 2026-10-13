import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { updateFinancialSourceAggregate } from "./reportAggregates";

export type FinancialAccount = Doc<"financialAccounts">;
type Ctx = MutationCtx | QueryCtx;

export function cents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Financial projection is inconsistent; request a Coach review.");
  return value;
}

export async function financialAccount(ctx: Ctx, studentId: Id<"students">) {
  return ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique();
}

export async function readyFinancialAccount(ctx: Ctx, studentId: Id<"students">) {
  const account = await financialAccount(ctx, studentId);
  if (!account || account.state !== "ready") throw new Error("Financial records are updating or require rebuilding. A Coach must finish the financial preparation before another transaction.");
  await requireNoFinancialJob(ctx, account);
  return account;
}

export async function requireNoFinancialJob(ctx: Ctx, account: FinancialAccount) {
  for (const jobId of [account.allocationJobId, account.operationJobId, account.fundraiserJobId]) {
    if (!jobId) continue;
    const job = await ctx.db.get(jobId);
    if (!job || job.state !== "complete") throw new Error("Finish or retry the existing financial job before rebuilding or recording another transaction.");
  }
}

export async function createFinancialAccount(ctx: MutationCtx, studentId: Id<"students">, state: "ready" | "rebuilding", generation = 1) {
  const student = await ctx.db.get(studentId);
  if (!student) throw new Error("Student not found.");
  return ctx.db.insert("financialAccounts", {
    studentId, seasonId: student.seasonId, state, generation, revision: 0, phase: "sources", cursor: null,
    processed: 0, updatedAt: Date.now(), chargedCents: 0, paidCents: 0, personalAvailableCents: 0,
    fundraisingAvailableCents: 0, travelShareCents: 0, transferredInCents: 0, knownRaisedCents: 0,
    unknownGrossSourceCount: 0, ledgerCount: 0, sourceCount: 0, chargeCount: 0, lastLedgerAt: null, lastFinancialChangeAt: null,
  });
}

/** One ledger source becomes one immutable origin and a mutable availability projection. */
export async function projectSource(ctx: MutationCtx, account: FinancialAccount, entry: Doc<"ledgerEntries">) {
  if (entry.studentId !== account.studentId || (entry.kind !== "payment" && entry.kind !== "fundraiser")) throw new Error("Financial source scope is inconsistent.");
  cents(entry.amountCents);
  if (entry.originEntryId) {
    const origin = await ctx.db.get(entry.originEntryId);
    if (entry.kind !== "fundraiser" || !origin || origin.kind !== "fundraiser" || origin.originEntryId || !Number.isSafeInteger(origin.amountCents) || origin.amountCents <= 0) throw new Error("Transferred credit lost its original fundraising source; Coach review is required.");
  }
  if (entry.fundraiserId || entry.fundraiserRevisionId) {
    const revision = entry.fundraiserRevisionId ? await ctx.db.get(entry.fundraiserRevisionId) : null;
    if (entry.kind !== "fundraiser" || entry.originEntryId || !revision || revision.fundraiserId !== entry.fundraiserId || revision.studentId !== entry.studentId || revision.seasonId !== account.seasonId || revision.awardSourceEntryId !== entry._id || revision.travelCreditCents - revision.previousTravelCreditCents !== entry.amountCents) throw new Error("Fundraiser source provenance is inconsistent; Coach review is required.");
  }
  const existing = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("sourceEntryId", entry._id)).unique();
  if (existing) throw new Error("Financial source was projected twice.");
  const sourceId = await ctx.db.insert("financialSources", {
    studentId: account.studentId, seasonId: account.seasonId, generation: account.generation,
    sourceEntryId: entry._id, kind: entry.kind, rootOriginEntryId: entry.originEntryId ?? entry._id,
    receivedCents: entry.amountCents, availableCents: entry.amountCents, revision: 0,
    status: entry.amountCents > 0 ? "available" : "exhausted", sourceCreatedAt: entry._creationTime, createdAt: Date.now(),
    fundraiserId: entry.fundraiserId, fundraiserRevisionId: entry.fundraiserRevisionId,
  });
  const projected = await ctx.db.get(sourceId);
  if (!projected) throw new Error("Financial source projection is unavailable.");
  await updateFinancialSourceAggregate(ctx, null, projected);
  account.sourceCount++;
  if (entry.kind === "payment") account.personalAvailableCents = cents(account.personalAvailableCents + entry.amountCents);
  else {
    account.fundraisingAvailableCents = cents(account.fundraisingAvailableCents + entry.amountCents);
    if (entry.originEntryId) account.transferredInCents = cents(account.transferredInCents + entry.amountCents);
    else {
      account.travelShareCents = cents(account.travelShareCents + entry.amountCents);
      if (!entry.fundraiserId) account.unknownGrossSourceCount++;
    }
  }
}

/** Resolve missing legacy pointers only when there was exactly one possible earlier source. */
export async function sourceForMovement(ctx: Ctx, account: FinancialAccount, entry: Doc<"ledgerEntries">) {
  let sourceEntryId = entry.sourceEntryId;
  if (!sourceEntryId) {
    const earlier = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceCreatedAt", q => q.eq("studentId", account.studentId).eq("generation", account.generation).lte("sourceCreatedAt", entry._creationTime)).take(2);
    if (earlier.length !== 1) throw new Error("Historical allocations have ambiguous funding sources; a financial review is required.");
    sourceEntryId = earlier[0].sourceEntryId;
  }
  const source = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("sourceEntryId", sourceEntryId!)).unique();
  if (!source || entry.studentId !== account.studentId || entry.sourceKind && source.kind !== entry.sourceKind || entry.kind === "payout" && source.kind !== "payment" || entry.kind === "transferOut" && source.kind !== "fundraiser") throw new Error("Financial source history is inconsistent.");
  return source;
}

export async function projectMovement(ctx: MutationCtx, account: FinancialAccount, entry: Doc<"ledgerEntries">) {
  if (!["allocation", "deallocation", "payout", "transferOut", "awardReversal"].includes(entry.kind)) return;
  if (cents(entry.amountCents) === 0) throw new Error("Financial movement must be positive.");
  const source = await sourceForMovement(ctx, account, entry);
  if (entry.kind === "awardReversal" && (source.kind !== "fundraiser" || source.rootOriginEntryId !== source.sourceEntryId || !source.fundraiserId || source.fundraiserId !== entry.fundraiserId)) throw new Error("Award reduction must use its original fundraiser credit.");
  if (entry.kind === "awardReversal") {
    const revision = entry.fundraiserRevisionId ? await ctx.db.get(entry.fundraiserRevisionId) : null;
    if (!revision || revision.fundraiserId !== source.fundraiserId || revision.studentId !== account.studentId || revision.seasonId !== account.seasonId || revision.previousTravelCreditCents - revision.travelCreditCents < entry.amountCents) throw new Error("Award reduction lacks its immutable reviewed amount revision.");
  }
  const delta = entry.kind === "deallocation" ? entry.amountCents : -entry.amountCents;
  const available = cents(source.availableCents + delta);
  if (available > source.receivedCents) throw new Error("Financial source returns exceed its original receipt.");
  await ctx.db.patch(source._id, { availableCents: available, status: available ? "available" : "exhausted", revision: source.revision + 1 });
  await updateFinancialSourceAggregate(ctx, source, { ...source, availableCents: available, status: available ? "available" : "exhausted", revision: source.revision + 1 });
  if (source.kind === "payment") account.personalAvailableCents = cents(account.personalAvailableCents + delta);
  else account.fundraisingAvailableCents = cents(account.fundraisingAvailableCents + delta);
  if (entry.kind === "awardReversal") account.travelShareCents = cents(account.travelShareCents - entry.amountCents);
  if (entry.kind !== "allocation" && entry.kind !== "deallocation") return;
  if (!entry.chargeId) throw new Error("Allocation has no charge.");
  const netDelta = -delta;
  const allocation = await ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_chargeId_and_sourceEntryId", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("chargeId", entry.chargeId!).eq("sourceEntryId", source.sourceEntryId)).unique();
  const appliedCents = cents((allocation?.appliedCents ?? 0) + netDelta);
  if (allocation) await ctx.db.patch(allocation._id, { appliedCents, status: appliedCents ? "applied" : "returned", revision: allocation.revision + 1 });
  else await ctx.db.insert("financialAllocations", { studentId: account.studentId, generation: account.generation, chargeId: entry.chargeId, sourceEntryId: source.sourceEntryId, sourceKind: source.kind, appliedCents, status: appliedCents ? "applied" : "returned", revision: 1 });
  const chargeNet = await ctx.db.query("financialChargeAllocations").withIndex("by_studentId_and_generation_and_chargeId", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("chargeId", entry.chargeId!)).unique();
  const total = cents((chargeNet?.appliedCents ?? 0) + netDelta);
  if (chargeNet) await ctx.db.patch(chargeNet._id, { appliedCents: total, verified: false });
  else await ctx.db.insert("financialChargeAllocations", { studentId: account.studentId, generation: account.generation, chargeId: entry.chargeId, appliedCents: total, verified: false });
}

export async function saveFinancialAccount(ctx: MutationCtx, account: FinancialAccount) {
  const { _id, _creationTime: ignored, ...fields } = account;
  void ignored;
  await ctx.db.patch(_id, { ...fields, updatedAt: Date.now() });
}

/** Empty new students need no historical rebuild. Existing history is never silently scanned. */
export async function ensureFinancialAccount(ctx: MutationCtx, studentId: Id<"students">) {
  const current = await financialAccount(ctx, studentId);
  if (current) return readyFinancialAccount(ctx, studentId);
  const entry = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", studentId)).first();
  const charge = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).first();
  if (entry || charge) throw new Error("Historical financial records need a Coach rebuild before another transaction.");
  const accountId = await createFinancialAccount(ctx, studentId, "ready");
  const account = await ctx.db.get(accountId);
  if (!account) throw new Error("Financial account could not be prepared.");
  return account;
}

export async function recordProjectedEntry(ctx: MutationCtx, entryId: Id<"ledgerEntries">, account: FinancialAccount) {
  const entry = await ctx.db.get(entryId);
  if (!entry || entry.studentId !== account.studentId) throw new Error("Financial entry scope is inconsistent.");
  if (entry.kind === "payment" || entry.kind === "fundraiser") await projectSource(ctx, account, entry);
  else await projectMovement(ctx, account, entry);
  account.ledgerCount++;
  account.lastLedgerAt = Math.max(account.lastLedgerAt ?? 0, entry.recordedAt);
  account.revision++;
  account.lastFinancialChangeAt = Date.now();
  await saveFinancialAccount(ctx, account);
}

/** Called after authoritative charge writes; account deltas never read unrelated history. */
export async function recordChargeChange(ctx: MutationCtx, account: FinancialAccount, charge: Doc<"charges">, previousEffective: number, previousApplied: number, newlyCreated = false) {
  const effective = cents(charge.amountCents - (charge.cancelledCents ?? 0));
  if (charge.studentId !== account.studentId || charge.appliedCents > effective) throw new Error("Charge projection is inconsistent.");
  const net = await ctx.db.query("financialChargeAllocations").withIndex("by_studentId_and_generation_and_chargeId", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("chargeId", charge._id)).unique();
  if ((net?.appliedCents ?? 0) !== charge.appliedCents) throw new Error("Charge allocation projection differs from its balance.");
  if (net) await ctx.db.patch(net._id, { verified: true });
  await ctx.db.patch(charge._id, { outstanding: effective > charge.appliedCents });
  account.chargedCents = cents(account.chargedCents + effective - previousEffective);
  account.paidCents = cents(account.paidCents + charge.appliedCents - previousApplied);
  if (newlyCreated) account.chargeCount++;
  account.revision++;
  account.lastFinancialChangeAt = Date.now();
  await saveFinancialAccount(ctx, account);
}
