import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AppUser } from "./access";
import { audit } from "./access";

export async function addCharge(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, label: string, amountCents: number, priority: number, idempotencyKey: string, eventId?: Id<"events">) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("Charge must be a nonnegative number of cents.");
  const duplicate = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (duplicate) {
    const charge = duplicate.chargeId ? await ctx.db.get(duplicate.chargeId) : null;
    if (!charge || charge.studentId !== studentId || charge.eventId !== eventId || charge.amountCents !== amountCents || charge.label !== label) throw new Error("Transaction key is already used for a different charge.");
    return charge._id;
  }
  const existingEntries = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", studentId)).take(501);
  if (existingEntries.length >= 500) throw new Error("Financial record limit reached; charge was not recorded.");
  const now = Date.now();
  const chargeId = await ctx.db.insert("charges", { studentId, eventId, label, amountCents, appliedCents: 0, priority, createdBy: actor._id, createdAt: now });
  await ctx.db.insert("ledgerEntries", { studentId, chargeId, eventId, kind: "charge", amountCents, previousCents: 0, newCents: amountCents, recordedBy: actor._id, recordedAt: now, idempotencyKey });
  await audit(ctx, actor, "charges", chargeId, "create", null, { label, amountCents, eventId });
  await allocateUnapplied(ctx, actor, studentId, `auto:${idempotencyKey}`);
  return chargeId;
}

export async function allocateUnapplied(ctx: MutationCtx, actor: AppUser, studentId: Id<"students">, idempotencyPrefix: string) {
  const entries = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", studentId)).take(501);
  if (entries.length > 500) throw new Error("Financial record limit reached; allocation stopped safely.");
  const funds = entries.filter(x => x.kind === "payment" || x.kind === "fundraiser").reduce((n, x) => n + x.amountCents, 0);
  const allocated = entries.filter(x => x.kind === "allocation").reduce((n, x) => n + x.amountCents, 0);
  let available = Math.max(0, funds - allocated);
  const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).take(501);
  if (charges.length > 500) throw new Error("Charge limit reached; allocation stopped safely.");
  const plan: { charge: (typeof charges)[number]; amount: number }[] = [];
  for (const charge of charges) {
    const amount = Math.min(available, charge.amountCents - charge.appliedCents);
    if (amount <= 0) continue;
    plan.push({ charge, amount });
    available -= amount;
  }
  if (entries.length + plan.length > 500) throw new Error("Financial record limit reached; allocation stopped safely.");
  for (const { charge, amount } of plan) {
    const next = charge.appliedCents + amount;
    await ctx.db.patch(charge._id, { appliedCents: next });
    await ctx.db.insert("ledgerEntries", { studentId, chargeId: charge._id, eventId: charge.eventId, kind: "allocation", amountCents: amount, previousCents: charge.appliedCents, newCents: next, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `${idempotencyPrefix}:${charge._id}` });
    await audit(ctx, actor, "charges", charge._id, "allocate", { appliedCents: charge.appliedCents }, { appliedCents: next });
  }
}
