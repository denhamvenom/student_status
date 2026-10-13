import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { AppUser } from "./access";
import { audit } from "./access";
import { refreshStudentFinance } from "./financeSummaries";

type Entry = Doc<"ledgerEntries">;
type Source = Extract<Entry["kind"], "payment" | "fundraiser">;

export function allocationSourceId(entry: Entry, sources: (Entry & { kind: Source })[]) {
  if (entry.sourceEntryId) return entry.sourceEntryId;
  const earlier = sources.filter(s => s._creationTime <= entry._creationTime);
  if (earlier.length === 1) return earlier[0]._id;
  throw new Error("Historical allocations have ambiguous funding sources; a financial review is required.");
}

export function effectiveChargeCents(charge: Doc<"charges">) {
  const cancelled = charge.cancelledCents ?? 0;
  if (!Number.isSafeInteger(cancelled) || cancelled < 0 || cancelled > charge.amountCents || charge.appliedCents > charge.amountCents - cancelled) throw new Error("Charge balance is inconsistent.");
  return charge.amountCents - cancelled;
}

export async function financialEntries(ctx: MutationCtx, studentId: Id<"students">) {
  const entries = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", studentId)).take(501);
  if (entries.length > 500) throw new Error("Financial record limit reached; transaction stopped safely.");
  return entries;
}

/** Resolve each allocation to its actual payment or fundraising entry. Older ambiguous records fail closed. */
export function sourceBalances(entries: Entry[]) {
  const sources = entries.filter((e): e is Entry & { kind: Source } => e.kind === "payment" || e.kind === "fundraiser");
  const byId = new Map(sources.map(s => [s._id, { entry: s, available: s.amountCents }]));
  for (const entry of entries) {
    if (entry.kind !== "allocation" && entry.kind !== "deallocation" && entry.kind !== "payout" && entry.kind !== "transferOut") continue;
    const sourceId = allocationSourceId(entry, sources);
    const source = byId.get(sourceId);
    if (!source || entry.sourceKind && entry.sourceKind !== source.entry.kind || entry.amountCents <= 0) throw new Error("Financial source history is inconsistent.");
    if (entry.studentId !== source.entry.studentId || entry.kind === "payout" && source.entry.kind !== "payment" || entry.kind === "transferOut" && source.entry.kind !== "fundraiser") throw new Error("Financial source history is inconsistent.");
    source.available += entry.kind === "deallocation" ? entry.amountCents : -entry.amountCents;
  }
  for (const source of byId.values()) if (source.available < 0 || source.available > source.entry.amountCents) throw new Error("Financial source balance is inconsistent.");
  return [...byId.values()];
}

export async function addCharge(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, label: string, amountCents: number, priority: number, idempotencyKey: string, eventId?: Id<"events">, category?: "main" | "extra") {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("Charge must be a nonnegative number of cents.");
  const duplicate = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (duplicate) {
    const charge = duplicate.chargeId ? await ctx.db.get(duplicate.chargeId) : null;
    if (!charge || charge.studentId !== studentId || charge.eventId !== eventId || charge.amountCents !== amountCents || charge.label !== label || (charge.category ?? "main") !== (category ?? "main")) throw new Error("Transaction key is already used for a different charge.");
    return charge._id;
  }
  const entries = await financialEntries(ctx, studentId);
  if (entries.length >= 500) throw new Error("Financial record limit reached; charge was not recorded.");
  const now = Date.now();
  const chargeId = await ctx.db.insert("charges", { studentId, eventId, label, amountCents, appliedCents: 0, cancelledCents: 0, category: category ?? "main", priority, createdBy: actor._id, createdAt: now });
  await ctx.db.insert("ledgerEntries", { studentId, chargeId, eventId, kind: "charge", amountCents, previousCents: 0, newCents: amountCents, recordedBy: actor._id, recordedAt: now, idempotencyKey });
  await audit(ctx, actor, "charges", chargeId, "create", null, { label, amountCents, eventId, category: category ?? "main" });
  await allocateUnapplied(ctx, actor, studentId, `auto:${idempotencyKey}`);
  return chargeId;
}

export type ChargeDraft = { label: string; amountCents: number; priority: number; idempotencyKey: string; eventId?: Id<"events">; category?: "main" | "extra" };

/** Adds one student's charges atomically, loading each financial history once. */
export async function addCharges(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, drafts: ChargeDraft[], idempotencyPrefix: string) {
  if (drafts.length > 100 || new Set(drafts.map(draft => draft.idempotencyKey)).size !== drafts.length) throw new Error("Invalid charge batch.");
  if (!drafts.length) return [];
  const entries = await financialEntries(ctx, studentId);
  const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).take(501);
  if (charges.length > 500) throw new Error("Charge limit reached; transaction stopped safely.");
  const ids: Id<"charges">[] = [];
  let added = false;
  for (const draft of drafts) {
    if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents < 0) throw new Error("Charge must be a nonnegative number of cents.");
    const duplicate = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", draft.idempotencyKey)).unique();
    if (duplicate) {
      const charge = charges.find(charge => charge._id === duplicate.chargeId);
      if (!charge || charge.studentId !== studentId || charge.eventId !== draft.eventId || charge.amountCents !== draft.amountCents || charge.label !== draft.label || (charge.category ?? "main") !== (draft.category ?? "main")) throw new Error("Transaction key is already used for a different charge.");
      ids.push(charge._id);
      continue;
    }
    if (entries.length >= 500 || charges.length >= 500) throw new Error("Financial record limit reached; charge batch stopped safely.");
    const now = Date.now();
    const chargeId = await ctx.db.insert("charges", { studentId, eventId: draft.eventId, label: draft.label, amountCents: draft.amountCents, appliedCents: 0, cancelledCents: 0, category: draft.category ?? "main", priority: draft.priority, createdBy: actor._id, createdAt: now });
    const entryId = await ctx.db.insert("ledgerEntries", { studentId, chargeId, eventId: draft.eventId, kind: "charge", amountCents: draft.amountCents, previousCents: 0, newCents: draft.amountCents, recordedBy: actor._id, recordedAt: now, idempotencyKey: draft.idempotencyKey });
    const charge = await ctx.db.get(chargeId); const entry = await ctx.db.get(entryId);
    if (!charge || !entry) throw new Error("New financial records are unavailable.");
    charges.push(charge); entries.push(entry); ids.push(chargeId); added = true;
    await audit(ctx, actor, "charges", chargeId, "create", null, { label: draft.label, amountCents: draft.amountCents, eventId: draft.eventId, category: draft.category ?? "main" });
  }
  charges.sort((a, b) => a.priority - b.priority || a._creationTime - b._creationTime);
  if (added) {
    await allocateEntries(ctx, actor, studentId, idempotencyPrefix, entries, charges);
    await refreshStudentFinance(ctx, studentId, { entries, charges });
  }
  return ids;
}

export async function allocateUnapplied(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, idempotencyPrefix: string, excludedEventId?: Id<"events">) {
  const entries = await financialEntries(ctx, studentId);
  const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).take(501);
  if (charges.length > 500) throw new Error("Charge limit reached; allocation stopped safely.");
  await allocateEntries(ctx, actor, studentId, idempotencyPrefix, entries, charges, excludedEventId);
  await refreshStudentFinance(ctx, studentId, { entries, charges });
}

async function allocateEntries(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, idempotencyPrefix: string, entries: Entry[], charges: Doc<"charges">[], excludedEventId?: Id<"events">) {
  const sources = sourceBalances(entries);
  const plan: { charge: Doc<"charges">; source: (typeof sources)[number]; amount: number }[] = [];
  for (const charge of charges) {
    if (excludedEventId && charge.eventId === excludedEventId) continue;
    let due = effectiveChargeCents(charge) - charge.appliedCents;
    for (const source of sources) {
      if (due <= 0) break;
      const amount = Math.min(due, source.available);
      if (amount <= 0) continue;
      plan.push({ charge, source, amount });
      source.available -= amount;
      due -= amount;
    }
  }
  if (entries.length + plan.length > 500) throw new Error("Financial record limit reached; allocation stopped safely.");
  const applied = new Map<Id<"charges">, number>();
  for (const { charge, source, amount } of plan) {
    const previous = applied.get(charge._id) ?? charge.appliedCents;
    const next = previous + amount;
    await ctx.db.patch(charge._id, { appliedCents: next });
    const allocationId = await ctx.db.insert("ledgerEntries", { studentId, chargeId: charge._id, eventId: charge.eventId, kind: "allocation", amountCents: amount, previousCents: previous, newCents: next, sourceEntryId: source.entry._id, sourceKind: source.entry.kind, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `${idempotencyPrefix}:${charge._id}:${source.entry._id}` });
    await audit(ctx, actor, "charges", charge._id, "allocate", { appliedCents: previous }, { appliedCents: next, sourceKind: source.entry.kind });
    charge.appliedCents = next;
    const allocation = await ctx.db.get(allocationId);
    if (!allocation) throw new Error("Allocation record is unavailable.");
    entries.push(allocation);
    applied.set(charge._id, next);
  }
}
