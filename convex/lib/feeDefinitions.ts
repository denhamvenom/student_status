import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { seasonFinanceControl } from "./seasonFinance";

export async function provenMainFee(ctx: MutationCtx, charge: Doc<"charges">) {
  if (!charge.eventId || (charge.category ?? "main") !== "main") return null;
  const student = await ctx.db.get(charge.studentId);
  const event = await ctx.db.get(charge.eventId);
  if (!student || !event || student.seasonId !== event.seasonId) return null;
  const key = `eventFee:${event._id}:${student._id}`;
  const evidence = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", key)).unique();
  if (!evidence || evidence.kind !== "charge" || evidence.chargeId !== charge._id || evidence.studentId !== student._id || evidence.eventId !== event._id || evidence.amountCents !== charge.amountCents) return null;
  return chargeFeeDefinition(ctx, charge.createdBy, student, { eventId: event._id, category: "main", idempotencyKey: key, label: charge.label, amountCents: charge.amountCents, priority: charge.priority });
}

/** Origin identity is explicit; display labels never establish a shared fee. */
export async function chargeFeeDefinition(ctx: MutationCtx, actorId: Id<"appUsers">, student: Doc<"students">, draft: { eventId?: Id<"events">; category?: "main" | "extra"; idempotencyKey: string; label: string; amountCents: number; priority: number; feeDefinitionId?: Id<"feeDefinitions"> }) {
  if (draft.feeDefinitionId) {
    const definition = await ctx.db.get(draft.feeDefinitionId);
    if (!definition || definition.seasonId !== student.seasonId || definition.state !== "active" || definition.eventId !== draft.eventId) throw new Error("Fee definition is unavailable for this charge.");
    return definition;
  }
  const main = !!draft.eventId && (draft.category ?? "main") === "main" && draft.idempotencyKey === `eventFee:${draft.eventId}:${student._id}`;
  const originKey = main ? `event:${draft.eventId}:main` : `manual:${actorId}:${draft.idempotencyKey}`;
  const existing = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_originKey", q => q.eq("seasonId", student.seasonId).eq("originKey", originKey)).unique();
  if (existing) {
    if (existing.state !== "active" || existing.eventId !== draft.eventId) throw new Error("Fee definition is canceled or belongs to another event.");
    return existing;
  }
  const control = await seasonFinanceControl(ctx, student.seasonId);
  const last = control?.orderReady ? await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", student.seasonId)).order("desc").first() : null;
  const now = Date.now();
  const id = await ctx.db.insert("feeDefinitions", { seasonId: student.seasonId, kind: main ? "eventMain" : draft.eventId ? "eventExtra" : "custom", eventId: draft.eventId, label: draft.label, defaultAmountCents: draft.amountCents, priority: control?.orderReady ? (last?.priority ?? 0) + 1 : draft.priority, revision: 0, state: "active", createdBy: actorId, createdAt: now, updatedAt: now, originKey, originProof: main ? "eventMain" : "manual" });
  const result = await ctx.db.get(id);
  if (!result) throw new Error("Fee definition could not be created.");
  return result;
}

/** R6 due dates: a positive epoch-millisecond instant, or blank. */
export function validDueAt(dueAt: number | undefined | null) {
  if (dueAt !== undefined && dueAt !== null && (!Number.isSafeInteger(dueAt) || dueAt <= 0)) throw new ConvexError("Choose a valid due date, or leave it blank.");
}

/** A charge's own due date wins; otherwise it inherits its fee definition's due date (read-time, so definition edits apply). */
export async function effectiveChargeDueAt(ctx: QueryCtx | MutationCtx, charge: Doc<"charges">): Promise<number | undefined> {
  if (charge.dueAt !== undefined) return charge.dueAt;
  if (!charge.feeDefinitionId) return undefined;
  return (await ctx.db.get(charge.feeDefinitionId))?.dueAt;
}
