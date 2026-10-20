import { normalizeEmail } from "../shared/contact-format";
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { activeSeason, audit, viewer } from "./lib/access";
import { tokenHash } from "./lib/invitationIdentity";
import { cents, ensureFinancialAccount, financialAccount, readyFinancialAccount, recordChargeChange, recordProjectedEntry, saveFinancialAccount } from "./lib/financialSources";
import { effectiveChargeCents, allocateUnapplied } from "./lib/money";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { requireSeasonFinanceReady, requireSeasonFinancialContinuation, requireSeasonFinancialRetry } from "./lib/seasonFinance";

type Ctx = MutationCtx | QueryCtx;
const runRef = makeFunctionReference<"mutation">("paymentAdministration:runCorrection");
const pageRef = makeFunctionReference<"mutation">("paymentAdministration:correctionPage");
const method = v.union(v.literal("cash"), v.literal("check"), v.literal("other"));
const row = v.object({ studentEmail: v.string(), amountCents: v.number(), method, reference: v.string(), occurredAt: v.number(), rowReference: v.string() });
function editor(actor: Doc<"appUsers">) { if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead && actor.financialEdit)) throw new Error("Financial editing is not enabled for this account."); }
function why(value: string) { const text = value.trim(); if (text.length < 8 || text.length > 1000) throw new Error("Provide a reason of 8 to 1000 characters."); return text; }
function text(value: string, label: string) { const result = value.trim(); if (!result || result.length > 150) throw new Error(`Provide ${label} of 1 to 150 characters.`); return result; }
function receiptFields(value: { amountCents: number; reference: string; occurredAt: number; rowReference: string }) { if (cents(value.amountCents) === 0 || !Number.isSafeInteger(value.occurredAt) || value.occurredAt < 0 || !Number.isFinite(new Date(value.occurredAt).getTime())) throw new Error("Provide a positive payment and valid receipt date."); text(value.reference, "receipt reference"); text(value.rowReference, "row reference"); }
async function payment(ctx: Ctx, id: Id<"ledgerEntries">) {
  const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may correct payment receipts.");
  const entry = await ctx.db.get(id); const season = await activeSeason(ctx);
  const student = entry ? await ctx.db.get(entry.studentId) : null;
  if (!entry || entry.kind !== "payment" || !student?.active || student.seasonId !== season._id) throw new Error("Original payment is unavailable in the active season.");
  const account = await financialAccount(ctx, student._id);
  const source = account ? await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("sourceEntryId", entry._id)).unique() : null;
  return { actor, entry, student, account, source };
}
const previewValidator = v.object({ state: v.union(v.literal("ready"), v.literal("hold"), v.literal("updating")), message: v.union(v.string(), v.null()), originalAmountCents: v.number(), currentAmountCents: v.union(v.number(), v.null()), targetAmountCents: v.number(), releaseRequiredCents: v.union(v.number(), v.null()), irreversibleSpentCents: v.union(v.number(), v.null()), expectedSourceRevision: v.union(v.number(), v.null()), expectedFinancialRevision: v.union(v.number(), v.null()) });
async function correctionPreview(ctx: Ctx, id: Id<"ledgerEntries">, target: number) {
  cents(target);
  const state = await payment(ctx, id); const { entry, account, source } = state;
  const prepared = account?.state === "ready" && account.allocationSourceVersion === 1 && source?.appliedCents !== undefined;
  const consumed = prepared ? cents(source.receivedCents - source.availableCents - source.appliedCents!) : null;
  const release = prepared ? Math.max(0, source.receivedCents - target - source.availableCents) : null;
  const message = !prepared ? "Financial sources need preparation or rebuilding before this receipt can be corrected." : entry.originEntryId ? "Carried payments must be resolved through their original season and linked carryover review." : target < consumed! ? "This amount already includes a payout or transfer. Resolve that linked movement before reducing the receipt." : target === source.receivedCents ? "Enter a changed receipt amount." : null;
  return { ...state, preview: { state: !prepared ? "updating" as const : message ? "hold" as const : "ready" as const, message, originalAmountCents: entry.amountCents, currentAmountCents: source?.receivedCents ?? null, targetAmountCents: target, releaseRequiredCents: release, irreversibleSpentCents: consumed, expectedSourceRevision: source?.revision ?? null, expectedFinancialRevision: account?.revision ?? null } };
}
export const receipts = query({
  args: { studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ sourceEntryId: v.id("ledgerEntries"), originalAmountCents: v.number(), currentAmountCents: v.number(), availableCents: v.number(), reference: v.string(), method: v.union(method, v.null()), occurredAt: v.number(), carried: v.boolean() })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may review payment corrections.");
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id || !Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 25) throw new Error("Payment review is unavailable.");
    const account = await financialAccount(ctx, student._id);
    if (!account || account.allocationSourceVersion !== 1) throw new Error("Prepare financial records before reviewing payment receipts.");
    const page = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_kind_and_status", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("kind", "payment")).paginate({ ...args.paginationOpts, maximumRowsRead: 26 });
    if (page.page.length > 25) throw new Error("Receipt page exceeded its limit.");
    const entries = await Promise.all(page.page.map(async source => { const original = await ctx.db.get(source.sourceEntryId); if (!original) throw new Error("Receipt provenance is unavailable."); return { sourceEntryId: source.sourceEntryId, originalAmountCents: original.amountCents, currentAmountCents: source.receivedCents, availableCents: source.availableCents, reference: original.reference ?? original.reason ?? "Original payment", method: original.method ?? null, occurredAt: original.occurredAt ?? original.recordedAt, carried: !!original.originEntryId }; }));
    return { ...page, page: entries };
  },
});
export const previewCorrection = query({ args: { sourceEntryId: v.id("ledgerEntries"), targetAmountCents: v.number() }, returns: previewValidator, handler: async (ctx, args) => (await correctionPreview(ctx, args.sourceEntryId, args.targetAmountCents)).preview });
export const correct = mutation({
  args: { sourceEntryId: v.id("ledgerEntries"), targetAmountCents: v.number(), expectedSourceRevision: v.number(), expectedFinancialRevision: v.number(), reason: v.string(), idempotencyKey: v.string() },
  returns: v.id("financialOperationJobs"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may correct payment receipts.");
    const reason = why(args.reason); const key = text(args.idempotencyKey, "transaction key");
    const hash = await tokenHash(JSON.stringify([args.sourceEntryId, args.targetAmountCents, args.expectedSourceRevision, args.expectedFinancialRevision, reason]));
    const old = await ctx.db.query("financialOperationJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", key)).unique();
    if (old) { if (old.kind !== "paymentCorrection" || old.operationHash !== hash) throw new Error("Transaction key is already used for a different command."); return old._id; }
    const state = await correctionPreview(ctx, args.sourceEntryId, args.targetAmountCents);
    await requireSeasonFinanceReady(ctx, state.student.seasonId);
    const account = await readyFinancialAccount(ctx, state.student._id);
    if (state.preview.state !== "ready" || !state.source || state.source.revision !== args.expectedSourceRevision || account.revision !== args.expectedFinancialRevision) throw new Error(state.preview.message ?? "Payment changed. Refresh the correction preview.");
    const id = await ctx.db.insert("financialOperationJobs", { requiredFinancialProjectionVersion: 4, kind: "paymentCorrection", studentId: state.student._id, actorId: actor._id, originalActorId: actor._id, generation: account.generation, state: "running", step: 0, amountCents: Math.abs(args.targetAmountCents - state.source.receivedCents), committedCents: 0, idempotencyKey: key, operationHash: hash, chargeCursor: null, reason, updatedAt: Date.now(), sourceEntryId: args.sourceEntryId, originalReceivedCents: state.source.receivedCents, targetReceivedCents: args.targetAmountCents, releaseRequiredCents: state.preview.releaseRequiredCents! });
    account.state = "posting"; account.operationJobId = id; await saveFinancialAccount(ctx, account);
    await audit(ctx, actor, "ledgerEntries", args.sourceEntryId, "startPaymentCorrection", { receivedCents: state.source.receivedCents }, { targetReceivedCents: args.targetAmountCents, jobId: id }, reason);
    await ctx.runMutation(pageRef, { jobId: id, step: 0 });
    return id;
  },
});
export const correctionPage = internalMutation({
  args: { jobId: v.id("financialOperationJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId); if (!job || job.kind !== "paymentCorrection" || job.state !== "running" || job.step !== args.step) return null;
    const actor = await ctx.db.get(job.actorId); const season = await activeSeason(ctx); const student = await ctx.db.get(job.studentId);
    if (!actor?.active || actor.role !== "coach" || !student?.active || student.seasonId !== season._id) throw new Error("Payment correction actor or student is unavailable.");
    await requireSeasonFinancialContinuation(ctx, season._id, job._id);
    const account = await financialAccount(ctx, student._id);
    if (!account || account.operationJobId !== job._id || account.generation !== job.generation || account.state !== "posting" || !job.sourceEntryId || job.targetReceivedCents === undefined || job.originalReceivedCents === undefined || job.releaseRequiredCents === undefined) throw new Error("Payment correction lost its locked command.");
    const source = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("sourceEntryId", job.sourceEntryId!)).unique();
    if (!source || source.kind !== "payment" || source.rootOriginEntryId !== source.sourceEntryId || source.receivedCents !== job.originalReceivedCents || source.appliedCents === undefined) throw new Error("Payment correction provenance changed.");
    let committed = job.committedCents; let remaining = job.releaseRequiredCents - committed;
    if (remaining) {
      const allocations = await ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_sourceEntryId_and_status", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("sourceEntryId", job.sourceEntryId!).eq("status", "applied")).take(20);
      for (const allocation of allocations) {
        const release = Math.min(remaining, allocation.appliedCents); if (!release) continue;
        const charge = await ctx.db.get(allocation.chargeId); if (!charge || charge.studentId !== student._id) throw new Error("Payment allocation lost its original charge.");
        const before = charge.appliedCents; const effective = effectiveChargeCents(charge); charge.appliedCents = cents(before - release);
        const entry = await ctx.db.insert("ledgerEntries", { studentId: student._id, chargeId: charge._id, eventId: charge.eventId, kind: "deallocation", sourceEntryId: job.sourceEntryId, sourceKind: "payment", amountCents: release, previousCents: before, newCents: charge.appliedCents, recordedBy: actor._id, recordedAt: Date.now(), reason: job.reason, idempotencyKey: `payment-correction:${job._id}:${job.step}:${charge._id}` });
        await recordProjectedEntry(ctx, entry, account); await ctx.db.patch(charge._id, { appliedCents: charge.appliedCents }); await recordChargeChange(ctx, account, charge, effective, before);
        remaining -= release; committed += release; if (!remaining) break;
      }
      if (remaining && !allocations.length) throw new Error("Payment allocations do not cover the reviewed reduction.");
    }
    const done = remaining === 0;
    if (done) {
      const entry = await ctx.db.insert("ledgerEntries", { studentId: student._id, kind: "paymentCorrection", sourceEntryId: job.sourceEntryId, sourceKind: "payment", amountCents: job.amountCents, previousCents: job.originalReceivedCents, newCents: job.targetReceivedCents, recordedBy: actor._id, recordedAt: Date.now(), reason: job.reason, idempotencyKey: `payment-correction:${job._id}:receipt` });
      await recordProjectedEntry(ctx, entry, account);
    }
    await ctx.db.patch(job._id, { state: done ? "complete" : "running", step: job.step + 1, committedCents: committed, updatedAt: Date.now() });
    if (done) { account.state = "ready"; account.operationJobId = undefined; await saveFinancialAccount(ctx, account); await allocateUnapplied(ctx, actor, student._id, `payment-correction:${job._id}:allocate`, undefined, job._id); await audit(ctx, actor, "ledgerEntries", job.sourceEntryId, "completePaymentCorrection", { receivedCents: job.originalReceivedCents }, { receivedCents: job.targetReceivedCents, releasedCents: committed }, job.reason); }
    else await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    await refreshStudentFinance(ctx, student._id); return null;
  },
});
export const runCorrection = internalMutation({ args: { jobId: v.id("financialOperationJobs") }, returns: v.null(), handler: async (ctx, args) => { const job = await ctx.db.get(args.jobId); if (!job || job.kind !== "paymentCorrection" || job.state !== "running") return null; try { await ctx.runMutation(pageRef, { jobId: job._id, step: job.step }); } catch (error) { await ctx.db.patch(job._id, { state: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Payment correction failed.", updatedAt: Date.now() }); const account = await financialAccount(ctx, job.studentId); if (account?.operationJobId === job._id) await ctx.db.patch(account._id, { state: "failed", lastError: "Payment correction requires Coach retry.", updatedAt: Date.now() }); } return null; } });
export const correctionStatus = query({ args: { jobId: v.id("financialOperationJobs") }, returns: schema.doc("financialOperationJobs"), handler: async (ctx, args) => { const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may review payment corrections."); const job = await ctx.db.get(args.jobId); const student = job ? await ctx.db.get(job.studentId) : null; if (!job || job.kind !== "paymentCorrection" || student?.seasonId !== (await activeSeason(ctx))._id) throw new Error("Payment correction is unavailable."); return job; } });
export const retryCorrection = mutation({ args: { jobId: v.id("financialOperationJobs"), reason: v.string() }, returns: v.null(), handler: async (ctx, args) => { const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may retry payment corrections."); const job = await ctx.db.get(args.jobId); const account = job ? await financialAccount(ctx, job.studentId) : null; const season = await activeSeason(ctx); if (!job || job.kind !== "paymentCorrection" || job.state !== "failed" || account?.seasonId !== season._id || account.operationJobId !== job._id || account.generation !== job.generation) throw new Error("Payment correction cannot be retried."); await requireSeasonFinancialRetry(ctx, season._id, job._id); await ctx.db.patch(job._id, { actorId: actor._id, state: "running", lastError: undefined, updatedAt: Date.now() }); await ctx.db.patch(account._id, { state: "posting", lastError: undefined, updatedAt: Date.now() }); await audit(ctx, actor, "financialOperationJobs", job._id, "retryPaymentCorrection", null, null, why(args.reason)); await ctx.scheduler.runAfter(0, runRef, { jobId: job._id }); return null; } });

export const previewPayments = query({
  args: { rows: v.array(row) }, returns: v.array(v.object({ studentId: v.union(v.id("students"), v.null()), studentName: v.string(), expectedGeneration: v.union(v.number(), v.null()), error: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    editor(await viewer(ctx)); if (!args.rows.length || args.rows.length > 500) throw new Error("Review 1 to 500 payment rows at a time.");
    const season = await activeSeason(ctx); const duplicates = new Set<string>(); const result = [];
    for (const item of args.rows) {
      let error: string | null = null; try { receiptFields(item); } catch (failure) { error = failure instanceof Error ? failure.message : "Invalid receipt."; }
      let email = item.studentEmail.trim().toLowerCase();
      try { email = normalizeEmail(item.studentEmail, "Student email"); if (!email) throw new Error("Enter a student email."); } catch (failure) { result.push({ studentId: null, studentName: email, expectedGeneration: null, error: failure instanceof Error ? failure.message : "Invalid student email." }); continue; }
      const matches = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", email)).take(2);
      const student = matches.length === 1 && matches[0].active ? matches[0] : null;
      if (!student) error = "Match one active student's exact email address.";
      const identity = `${email}:${item.rowReference.trim()}`; if (duplicates.has(identity)) error = "Duplicate student and row reference in this batch."; duplicates.add(identity);
      const account = student ? await financialAccount(ctx, student._id) : null;
      if (account && (account.state !== "ready" || account.allocationSourceVersion !== 1)) error = "Finish financial preparation before recording this row.";
      if (student && !account) { const history = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", student._id)).first(); const charge = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", student._id)).first(); if (history || charge) error = "Historical finances require rebuilding."; }
      result.push({ studentId: student?._id ?? null, studentName: student?.legalName || student?.preferredName || email, expectedGeneration: student ? account?.generation ?? 1 : null, error });
    }
    return result;
  },
});
export const recordPaymentRow = mutation({
  args: { studentId: v.id("students"), amountCents: v.number(), method, reference: v.string(), occurredAt: v.number(), rowReference: v.string(), batchReference: v.string(), reason: v.string(), expectedGeneration: v.number() }, returns: v.id("ledgerEntries"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor); receiptFields(args); const reason = why(args.reason); const batch = text(args.batchReference, "batch reference");
    const season = await activeSeason(ctx); await requireSeasonFinanceReady(ctx, season._id);
    const student = await ctx.db.get(args.studentId); if (!student?.active || student.seasonId !== season._id) throw new Error("Student is unavailable in the active season.");
    const key = `payment-entry:${actor._id}:${await tokenHash(JSON.stringify([season._id, batch, student._id, args.rowReference.trim()]))}`;
    const old = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", key)).unique();
    if (old) { if (old.kind !== "payment" || old.studentId !== student._id || old.amountCents !== args.amountCents || old.method !== args.method || old.reference !== args.reference.trim() || old.occurredAt !== args.occurredAt || old.reason !== reason) throw new Error("This batch row already recorded a different receipt. Correct that original payment."); return old._id; }
    const account = await ensureFinancialAccount(ctx, student._id); if (account.generation !== args.expectedGeneration) throw new Error("Financial preparation changed. Preview the batch again.");
    const funds = cents(account.paidCents + account.personalAvailableCents + account.fundraisingAvailableCents);
    const id = await ctx.db.insert("ledgerEntries", { studentId: student._id, kind: "payment", amountCents: args.amountCents, previousCents: funds, newCents: cents(funds + args.amountCents), method: args.method, reference: args.reference.trim(), occurredAt: args.occurredAt, reason, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: key });
    await recordProjectedEntry(ctx, id, account); await allocateUnapplied(ctx, actor, student._id, `auto:${key}`); await audit(ctx, actor, "ledgerEntries", id, "recordPayment", null, { batchReference: batch, rowReference: args.rowReference.trim(), amountCents: args.amountCents, method: args.method, reference: args.reference.trim(), occurredAt: args.occurredAt }, reason); return id;
  },
});
