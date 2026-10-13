import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeSeason, audit, viewer } from "./lib/access";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { ensureFinancialAccount, financialAccount, saveFinancialAccount } from "./lib/financialSources";
import { makeFunctionReference } from "convex/server";

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

async function activeStudent(ctx: Parameters<typeof activeSeason>[0], studentId: Id<"students">) {
  const season = await activeSeason(ctx);
  const student = await ctx.db.get(studentId);
  if (!student || !student.active || student.seasonId !== season._id) throw new Error("Choose an active student in the current season.");
  return student;
}

export const operationOptions = query({
  args: { studentId: v.id("students") },
  returns: v.object({ personalAvailableCents: v.union(v.number(), v.null()), fundraisingAvailableCents: v.union(v.number(), v.null()), state: v.union(v.literal("ready"), v.literal("updating"), v.literal("failed"), v.literal("uninitialized")), sourceCount: v.union(v.number(), v.null()), chargeCount: v.union(v.number(), v.null()), recipients: v.array(v.object({ _id: v.id("students"), name: v.string() })) }),
  handler: async (ctx, args) => {
    financialEditor(await viewer(ctx));
    const student = await activeStudent(ctx, args.studentId);
    const account = await financialAccount(ctx, student._id);
    const uninitialized = !account || account.state === "uninitialized";
    const preparing = account?.state === "rebuilding" || account?.state === "failed" && !account.allocationJobId && !account.operationJobId && !account.fundraiserJobId;
    if (uninitialized || preparing) return {
      state: uninitialized ? "uninitialized" as const : account?.state === "failed" ? "failed" as const : "updating" as const,
      personalAvailableCents: null, fundraisingAvailableCents: null, sourceCount: null, chargeCount: null, recipients: [],
    };
    if (!account) throw new Error("Financial account is unavailable.");
    const recipients = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", student.seasonId)).take(501);
    if (recipients.length > 500) throw new Error("Student selection limit reached; contact an administrator.");
    return {
      state: account.state === "ready" ? "ready" as const : account.state === "failed" ? "failed" as const : "updating" as const, sourceCount: account.sourceCount, chargeCount: account.chargeCount,
      personalAvailableCents: account.personalAvailableCents,
      fundraisingAvailableCents: account.fundraisingAvailableCents,
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
    const account = await ensureFinancialAccount(ctx, args.studentId);
    const beforePersonal = account.personalAvailableCents;
    if (args.amountCents > beforePersonal) throw new Error("Amount exceeds unallocated personal payments.");
    const recordedAt = Date.now();
    const operationId = await ctx.db.insert("financeOperations", { kind: "payout", studentId: args.studentId, amountCents: args.amountCents, reason, method: args.method as Method, reference, occurredAt: args.occurredAt, recordedBy: actor._id, recordedAt, idempotencyKey: key, state: "running", committedCents: 0 });
    const jobId = await ctx.db.insert("financialOperationJobs", { kind: "payout", studentId: args.studentId, actorId: actor._id, generation: account.generation, state: "running", step: 0, amountCents: args.amountCents, committedCents: 0, idempotencyKey: key, operationId, chargeCursor: null, reason, method: args.method, reference, occurredAt: args.occurredAt, updatedAt: recordedAt });
    await ctx.db.patch(operationId, { jobId });
    account.state = "posting"; account.operationJobId = jobId; await saveFinancialAccount(ctx, account);
    await ctx.runMutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), { jobId, step: 0 });
    const observed = await ctx.db.get(operationId);
    const afterPersonal = (await financialAccount(ctx, args.studentId))!.personalAvailableCents;
    await audit(ctx, actor, "financeOperations", operationId, "recordPayout", { personalAvailableCents: beforePersonal }, { personalAvailableCents: afterPersonal, requestedCents: args.amountCents, committedCents: observed?.committedCents ?? 0, state: observed?.state, method: args.method, reference, occurredAt: args.occurredAt }, reason);
    await refreshStudentFinance(ctx, args.studentId);
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
    const senderAccount = await ensureFinancialAccount(ctx, sender._id);
    const recipientAccount = await ensureFinancialAccount(ctx, recipient._id);
    const senderBefore = senderAccount.fundraisingAvailableCents;
    const recipientBefore = recipientAccount.fundraisingAvailableCents;
    if (args.amountCents > senderBefore) throw new Error("Amount exceeds available fundraising credits.");
    const recordedAt = Date.now();
    const operationId = await ctx.db.insert("financeOperations", { kind: "transfer", studentId: sender._id, recipientStudentId: recipient._id, amountCents: args.amountCents, reason, recordedBy: actor._id, recordedAt, idempotencyKey: key, state: "running", committedCents: 0 });
    const jobId = await ctx.db.insert("financialOperationJobs", { kind: "transfer", studentId: sender._id, recipientStudentId: recipient._id, actorId: actor._id, generation: senderAccount.generation, recipientGeneration: recipientAccount.generation, state: "running", step: 0, amountCents: args.amountCents, committedCents: 0, idempotencyKey: key, operationId, chargeCursor: null, reason, updatedAt: recordedAt });
    await ctx.db.patch(operationId, { jobId });
    senderAccount.state = "posting"; senderAccount.operationJobId = jobId;
    recipientAccount.state = "posting"; recipientAccount.operationJobId = jobId;
    await saveFinancialAccount(ctx, senderAccount); await saveFinancialAccount(ctx, recipientAccount);
    await ctx.runMutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), { jobId, step: 0 });
    const recipientAfter = (await financialAccount(ctx, recipient._id))!.fundraisingAvailableCents;
    const observed = await ctx.db.get(operationId);
    const senderAfter = (await financialAccount(ctx, sender._id))!.fundraisingAvailableCents;
    await audit(ctx, actor, "financeOperations", operationId, "transferFundraising", { from: sender._id, fundraisingAvailableCents: senderBefore, to: recipient._id, recipientFundraisingAvailableCents: recipientBefore }, { from: sender._id, fundraisingAvailableCents: senderAfter, to: recipient._id, recipientFundraisingAvailableCents: recipientAfter, requestedCents: args.amountCents, committedCents: observed?.committedCents ?? 0, state: observed?.state }, reason);
    await refreshStudentFinance(ctx, args.studentId);
    return operationId;
  },
});
