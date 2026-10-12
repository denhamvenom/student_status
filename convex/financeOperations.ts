import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeSeason, audit, viewer } from "./lib/access";
import { allocateUnapplied, financialEntries, sourceBalances } from "./lib/money";

const method = v.union(v.literal("cash"), v.literal("check"), v.literal("other"));
type Method = "cash" | "check" | "other";

function financialEditor(user: Doc<"appUsers">) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead && user.financialEdit)) throw new Error("Financial editing is not enabled for this account.");
}

function requiredText(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return trimmed;
}

function validAmount(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Enter a positive amount in cents.");
}

function sourcePlan(sources: ReturnType<typeof sourceBalances>, kind: "payment" | "fundraiser", amountCents: number) {
  let remaining = amountCents;
  const plan: { source: (typeof sources)[number]; cents: number }[] = [];
  for (const source of sources) {
    if (source.entry.kind !== kind || source.available <= 0) continue;
    const cents = Math.min(remaining, source.available);
    if (cents > 0) plan.push({ source, cents });
    remaining -= cents;
    if (remaining === 0) break;
  }
  if (remaining > 0) throw new Error(kind === "payment" ? "Amount exceeds unallocated personal payments." : "Amount exceeds available fundraising credits.");
  return plan;
}

async function activeStudent(ctx: Parameters<typeof activeSeason>[0], studentId: Id<"students">) {
  const season = await activeSeason(ctx);
  const student = await ctx.db.get(studentId);
  if (!student || !student.active || student.seasonId !== season._id) throw new Error("Choose an active student in the current season.");
  return student;
}

export const operationOptions = query({
  args: { studentId: v.id("students") },
  returns: v.object({ personalAvailableCents: v.number(), fundraisingAvailableCents: v.number(), recipients: v.array(v.object({ _id: v.id("students"), name: v.string() })) }),
  handler: async (ctx, args) => {
    financialEditor(await viewer(ctx));
    const student = await activeStudent(ctx, args.studentId);
    const entries = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", student._id)).take(501);
    if (entries.length > 500) throw new Error("Financial record limit reached; contact an administrator.");
    const sources = sourceBalances(entries);
    const recipients = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", student.seasonId)).take(501);
    if (recipients.length > 500) throw new Error("Student selection limit reached; contact an administrator.");
    return {
      personalAvailableCents: sources.filter(x => x.entry.kind === "payment").reduce((n, x) => n + x.available, 0),
      fundraisingAvailableCents: sources.filter(x => x.entry.kind === "fundraiser").reduce((n, x) => n + x.available, 0),
      recipients: recipients.filter(x => x.active && x._id !== student._id).map(x => ({ _id: x._id, name: x.preferredName || x.legalName })),
    };
  },
});

export const recordPayout = mutation({
  args: { studentId: v.id("students"), amountCents: v.number(), method, reference: v.string(), occurredAt: v.number(), reason: v.string(), idempotencyKey: v.string() },
  returns: v.id("financeOperations"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); financialEditor(actor);
    await activeStudent(ctx, args.studentId);
    validAmount(args.amountCents);
    const reason = requiredText(args.reason, "Reason", 500);
    const reference = requiredText(args.reference, "Method reference", 150);
    const key = requiredText(args.idempotencyKey, "Transaction key", 150);
    if (key.length < 8 || !Number.isSafeInteger(args.occurredAt) || args.occurredAt < 0 || args.occurredAt > Date.now()) throw new Error("Provide a valid transaction key and payout date.");
    const existing = await ctx.db.query("financeOperations").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", key)).unique();
    if (existing) {
      if (existing.kind !== "payout" || existing.studentId !== args.studentId || existing.amountCents !== args.amountCents || existing.method !== args.method || existing.reference !== reference || existing.occurredAt !== args.occurredAt || existing.reason !== reason) throw new Error("Transaction key is already used for a different operation.");
      return existing._id;
    }
    const entries = await financialEntries(ctx, args.studentId);
    const balances = sourceBalances(entries);
    const beforePersonal = balances.filter(x => x.entry.kind === "payment").reduce((n, x) => n + x.available, 0);
    const plan = sourcePlan(balances, "payment", args.amountCents);
    if (entries.length + plan.length > 500) throw new Error("Financial record limit reached; payout was not recorded.");
    const recordedAt = Date.now();
    const operationId = await ctx.db.insert("financeOperations", { kind: "payout", studentId: args.studentId, amountCents: args.amountCents, reason, method: args.method as Method, reference, occurredAt: args.occurredAt, recordedBy: actor._id, recordedAt, idempotencyKey: key });
    for (const [index, { source, cents }] of plan.entries()) {
      await ctx.db.insert("ledgerEntries", { studentId: args.studentId, kind: "payout", sourceEntryId: source.entry._id, sourceKind: "payment", amountCents: cents, previousCents: source.available, newCents: source.available - cents, reason, method: args.method, reference, occurredAt: args.occurredAt, operationId, recordedBy: actor._id, recordedAt, idempotencyKey: `${key}:payout:${index}` });
    }
    await audit(ctx, actor, "financeOperations", operationId, "recordPayout", { personalAvailableCents: beforePersonal }, { personalAvailableCents: beforePersonal - args.amountCents, amountCents: args.amountCents, method: args.method, reference, occurredAt: args.occurredAt }, reason);
    return operationId;
  },
});

export const transferFundraising = mutation({
  args: { studentId: v.id("students"), recipientStudentId: v.id("students"), amountCents: v.number(), reason: v.string(), idempotencyKey: v.string() },
  returns: v.id("financeOperations"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); financialEditor(actor);
    const sender = await activeStudent(ctx, args.studentId);
    const recipient = await activeStudent(ctx, args.recipientStudentId);
    if (sender._id === recipient._id || sender.seasonId !== recipient.seasonId) throw new Error("Choose another active student in the same season.");
    validAmount(args.amountCents);
    const reason = requiredText(args.reason, "Reason", 500);
    const key = requiredText(args.idempotencyKey, "Transaction key", 150);
    if (key.length < 8) throw new Error("Provide a unique transaction key.");
    const existing = await ctx.db.query("financeOperations").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", key)).unique();
    if (existing) {
      if (existing.kind !== "transfer" || existing.studentId !== args.studentId || existing.recipientStudentId !== args.recipientStudentId || existing.amountCents !== args.amountCents || existing.reason !== reason) throw new Error("Transaction key is already used for a different operation.");
      return existing._id;
    }
    const senderEntries = await financialEntries(ctx, sender._id);
    const recipientEntries = await financialEntries(ctx, recipient._id);
    const senderBalances = sourceBalances(senderEntries);
    const recipientBalances = sourceBalances(recipientEntries);
    const senderBefore = senderBalances.filter(x => x.entry.kind === "fundraiser").reduce((n, x) => n + x.available, 0);
    const recipientBefore = recipientBalances.filter(x => x.entry.kind === "fundraiser").reduce((n, x) => n + x.available, 0);
    const plan = sourcePlan(senderBalances, "fundraiser", args.amountCents);
    if (senderEntries.length + plan.length > 500 || recipientEntries.length + plan.length > 500) throw new Error("Financial record limit reached; transfer was not recorded.");
    const recordedAt = Date.now();
    const operationId = await ctx.db.insert("financeOperations", { kind: "transfer", studentId: sender._id, recipientStudentId: recipient._id, amountCents: args.amountCents, reason, recordedBy: actor._id, recordedAt, idempotencyKey: key });
    for (const [index, { source, cents }] of plan.entries()) {
      await ctx.db.insert("ledgerEntries", { studentId: sender._id, kind: "transferOut", sourceEntryId: source.entry._id, sourceKind: "fundraiser", counterpartyStudentId: recipient._id, amountCents: cents, previousCents: source.available, newCents: source.available - cents, reason, operationId, recordedBy: actor._id, recordedAt, idempotencyKey: `${key}:out:${index}` });
      await ctx.db.insert("ledgerEntries", { studentId: recipient._id, kind: "fundraiser", originEntryId: source.entry.originEntryId ?? source.entry._id, sourceKind: "fundraiser", counterpartyStudentId: sender._id, amountCents: cents, previousCents: 0, newCents: cents, reason, operationId, recordedBy: actor._id, recordedAt, idempotencyKey: `${key}:in:${index}` });
    }
    await allocateUnapplied(ctx, actor, recipient._id, `auto:transfer:${key}`);
    const recipientAfterEntries = await financialEntries(ctx, recipient._id);
    const recipientAfter = sourceBalances(recipientAfterEntries).filter(x => x.entry.kind === "fundraiser").reduce((n, x) => n + x.available, 0);
    await audit(ctx, actor, "financeOperations", operationId, "transferFundraising", { from: sender._id, fundraisingAvailableCents: senderBefore, to: recipient._id, recipientFundraisingAvailableCents: recipientBefore }, { from: sender._id, fundraisingAvailableCents: senderBefore - args.amountCents, to: recipient._id, recipientFundraisingAvailableCents: recipientAfter, amountCents: args.amountCents }, reason);
    return operationId;
  },
});
