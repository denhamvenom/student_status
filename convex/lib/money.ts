import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { AppUser } from "./access";
import { audit } from "./access";

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

export async function allocateUnapplied(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, idempotencyPrefix: string, excludedEventId?: Id<"events">) {
  const entries = await financialEntries(ctx, studentId);
  const sources = sourceBalances(entries);
  const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).take(501);
  if (charges.length > 500) throw new Error("Charge limit reached; allocation stopped safely.");
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
    await ctx.db.insert("ledgerEntries", { studentId, chargeId: charge._id, eventId: charge.eventId, kind: "allocation", amountCents: amount, previousCents: previous, newCents: next, sourceEntryId: source.entry._id, sourceKind: source.entry.kind, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `${idempotencyPrefix}:${charge._id}:${source.entry._id}` });
    await audit(ctx, actor, "charges", charge._id, "allocate", { appliedCents: previous }, { appliedCents: next, sourceKind: source.entry.kind });
    applied.set(charge._id, next);
  }
}
