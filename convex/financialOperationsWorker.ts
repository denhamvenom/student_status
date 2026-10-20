import { savedPublicError, publicErrorResult } from './lib/publicErrors';
import { requireSeasonTransitionFinancialAccess } from "./lib/seasonFinance";
import { recordOperationChange } from "./lib/financeChanges";
import { requireSeasonFinancialRetry, seasonFinancialRetryAvailable } from "./lib/seasonFinance";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import schema from "./schema";
import { activeSeason, audit, viewer } from "./lib/access";
import { financialAccount, recordProjectedEntry, saveFinancialAccount, verifyAppliedSources } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { allocateUnapplied } from "./lib/money";
import { withdrawalStep } from "./lib/financialWithdrawal";
import { finalizeWithdrawal } from "./withdrawals";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { chargeCorrectionStep } from "./lib/chargeCorrection";

const runRef = makeFunctionReference<"mutation">("financialOperationsWorker:run");
const pageRef = makeFunctionReference<"mutation">("financialOperationsWorker:processPage");

export const status = query({
  args: { studentId: v.id("students"), operationId: v.optional(v.id("financeOperations")) }, returns: v.object({ job: v.union(schema.doc("financialOperationJobs"), v.null()), operation: v.union(schema.doc("financeOperations"), v.null()), canRetry: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const season = await activeSeason(ctx); const student = await ctx.db.get(args.studentId);
    if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Financial operation access denied.");
    if (!student || student.seasonId !== season._id) throw new ConvexError("Student is unavailable in the active season.");
    const account = await financialAccount(ctx, student._id);
    const operation = args.operationId ? await ctx.db.get(args.operationId) : null;
    if (args.operationId && (!operation || operation.studentId !== student._id)) throw new ConvexError("Financial operation is unavailable for this student.");
    const jobId = operation?.jobId ?? account?.operationJobId;
    const job = jobId ? await ctx.db.get(jobId) : null;
    let canRetry = actor.role === "coach" && job?.state === "failed" && student.active;
    if (canRetry && job?.kind === "chargeCorrection" && job.eventId) {
      const event = await ctx.db.get(job.eventId);
      canRetry = !!event && !event.archived && event.seasonId === season._id;
    }
    if (canRetry && job) canRetry = await seasonFinancialRetryAvailable(ctx, season._id, job._id);
    return publicErrorResult({ job, operation, canRetry });
  },
});

export const processPage = internalMutation({
  args: { jobId: v.id("financialOperationJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running" || job.step !== args.step) return null;
    if (job.historicalCorrectionSessionId) return ctx.runMutation(makeFunctionReference<"mutation">("historicalFinancialCorrections:processPage"), args);
    if (job.kind === "paymentCorrection") return ctx.runMutation(makeFunctionReference<"mutation">("paymentAdministration:correctionPage"), args);
    const actor = await ctx.db.get(job.actorId); const season = await activeSeason(ctx);
    await requireSeasonTransitionFinancialAccess(ctx, season._id, true);
    if (!actor?.active || actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead && (job.kind === "withdrawal" || actor.financialEdit))) throw new Error("Financial editing permission is unavailable; a Coach must retry.");
    const sender = await financialAccount(ctx, job.studentId);
    const recipient = job.recipientStudentId ? await financialAccount(ctx, job.recipientStudentId) : null;
    const senderStudent = await ctx.db.get(job.studentId);
    const recipientStudent = job.recipientStudentId ? await ctx.db.get(job.recipientStudentId) : null;
    if (!senderStudent?.active || senderStudent.seasonId !== season._id || job.kind === "transfer" && (!recipientStudent?.active || recipientStudent.seasonId !== season._id)) throw new Error("Financial operation student became unavailable; Coach review is required.");
    if (!sender || sender.state !== "posting" || sender.operationJobId !== job._id || sender.generation !== job.generation || sender.seasonId !== season._id) throw new Error("Financial operation account changed.");
    if (job.requiredFinancialProjectionVersion === 4 || sender.allocationSourceVersion === 1) verifyAppliedSources(sender);
    if (recipient && (job.requiredFinancialProjectionVersion === 4 || recipient.allocationSourceVersion === 1)) verifyAppliedSources(recipient);
    if (job.kind === "chargeCorrection") {
      if (actor.role !== "coach") throw new Error("Only a Coach may process charge corrections.");
      if (job.eventId) {
        const event = await ctx.db.get(job.eventId);
        if (!event || event.archived || event.seasonId !== season._id) throw new Error("Correction event is archived or unavailable; explicit historical review is required.");
        requireEnrollmentComplete(event);
      }
      const result = await chargeCorrectionStep(ctx, actor, sender, job);
      await ctx.db.patch(job._id, { committedCents: result.committed, step: job.step + 1, state: result.done ? "complete" : "running", updatedAt: Date.now() });
      if (result.done) {
        sender.state = "ready"; sender.operationJobId = undefined; await saveFinancialAccount(ctx, sender);
        await allocateUnapplied(ctx, actor, sender.studentId, `correction:${job._id}:reallocate`, undefined, job._id);
      } else await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
      await refreshStudentFinance(ctx, sender.studentId);
      return null;
    }
    if (job.kind === "withdrawal") {
      const event = job.eventId ? await ctx.db.get(job.eventId) : null;
      if (!event || event.archived || event.seasonId !== season._id) throw new Error("Withdrawal event became unavailable.");
      requireEnrollmentComplete(event);
      const result = await withdrawalStep(ctx, actor, sender, job);
      await ctx.db.patch(job._id, { committedCents: result.committed, chargeCursor: result.cursor, step: job.step + 1, state: result.done ? "complete" : "running", updatedAt: Date.now() });
      if (result.done) {
        await finalizeWithdrawal(ctx, { ...job, committedCents: result.committed }, actor);
        sender.state = "ready"; sender.operationJobId = undefined; await saveFinancialAccount(ctx, sender);
        await allocateUnapplied(ctx, actor, sender.studentId, `withdraw:${job._id}:reallocate`, job.eventId, job._id);
      } else await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
      await refreshStudentFinance(ctx, sender.studentId);
      return null;
    }
    if (job.kind === "transfer" && (!recipient || recipient.state !== "posting" || recipient.operationJobId !== job._id || recipient.generation !== job.recipientGeneration || recipient.seasonId !== sender.seasonId)) throw new Error("Transfer recipient account changed.");
    if (job.kind === "teamTransfer" && (job.destination !== "team" || job.recipientStudentId)) throw new Error("Team transfer destination is inconsistent.");
    const kind = job.kind === "payout" ? "payment" : "fundraiser";
    const sources = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_kind_and_status", q => q.eq("studentId", sender.studentId).eq("generation", sender.generation).eq("kind", kind).eq("status", "available")).take(20);
    let remaining = job.amountCents - job.committedCents;
    let committed = job.committedCents;
    for (const source of sources) {
      const amount = Math.min(remaining, source.availableCents);
      if (amount <= 0) continue;
      const outId = await ctx.db.insert("ledgerEntries", { studentId: sender.studentId, kind: job.kind === "payout" ? "payout" : "transferOut", sourceEntryId: source.sourceEntryId, sourceKind: kind, originEntryId: job.kind === "teamTransfer" ? source.rootOriginEntryId : undefined, destination: job.kind === "teamTransfer" ? "team" : undefined, counterpartyStudentId: recipient?.studentId, amountCents: amount, previousCents: source.availableCents, newCents: source.availableCents - amount, reason: job.reason, method: job.method, reference: job.reference, occurredAt: job.occurredAt, operationId: job.operationId, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `operation:${job._id}:out:${job.step}:${source.sourceEntryId}` });
      await recordProjectedEntry(ctx, outId, sender);
      if (recipient) {
        const inId = await ctx.db.insert("ledgerEntries", { studentId: recipient.studentId, kind: "fundraiser", originEntryId: source.rootOriginEntryId, sourceKind: "fundraiser", counterpartyStudentId: sender.studentId, amountCents: amount, previousCents: 0, newCents: amount, reason: job.reason, operationId: job.operationId, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `operation:${job._id}:in:${job.step}:${source.sourceEntryId}` });
        await recordProjectedEntry(ctx, inId, recipient);
      }
      remaining -= amount; committed += amount;
      if (!remaining) break;
    }
    if (remaining && !sources.length) throw new Error("Financial operation has insufficient original available sources; Coach review is required.");
    const done = remaining === 0;
    await ctx.db.patch(job._id, { committedCents: committed, step: job.step + 1, state: done ? "complete" : "running", updatedAt: Date.now() });
    if (job.operationId) await ctx.db.patch(job.operationId, { state: done ? "complete" : "running", committedCents: committed });
    if (done) {
      sender.state = "ready"; sender.operationJobId = undefined; await saveFinancialAccount(ctx, sender);
      if (recipient) {
        recipient.state = "ready"; recipient.operationJobId = undefined; await saveFinancialAccount(ctx, recipient);
        await allocateUnapplied(ctx, actor, recipient.studentId, `transfer:${job.idempotencyKey}`, undefined, job._id);
      }
      if (job.operationId) {
        const receipt = await ctx.db.get(job.operationId); if (!receipt) throw new Error("Completed operation receipt is unavailable.");
        await recordOperationChange(ctx, receipt, sender.seasonId);
      }
      await audit(ctx, actor, "financeOperations", job.operationId ?? job._id, "completeOperation", { committedCents: job.committedCents }, { requestedCents: job.amountCents, committedCents: committed, state: "complete", senderAvailableCents: sender.personalAvailableCents + sender.fundraisingAvailableCents }, job.reason);
    } else await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    await refreshStudentFinance(ctx, sender.studentId);
    if (recipient) await refreshStudentFinance(ctx, recipient.studentId);
    return null;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("financialOperationJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running") return null;
    try { await ctx.runMutation(pageRef, { jobId: job._id, step: job.step }); }
    catch (error) {
      await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "Financial operation failed; Coach review is required."), updatedAt: Date.now() });
      if (job.operationId) await ctx.db.patch(job.operationId, { state: "failed" });
      for (const studentId of [job.studentId, job.recipientStudentId]) {
        if (!studentId) continue;
        const account = await financialAccount(ctx, studentId);
        if (account?.operationJobId === job._id && account.state === "posting") await ctx.db.patch(account._id, { state: "failed", lastError: savedPublicError(null, "Financial operation failed; Coach retry is required.") });
      }
    }
    return null;
  },
});

export const retry = mutation({
  args: { jobId: v.id("financialOperationJobs"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach") throw new ConvexError("Only a Coach may retry a financial operation.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new ConvexError("Provide a reason of at least eight characters.");
    const season = await activeSeason(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "failed") throw new ConvexError("No failed operation is available to retry.");
    await requireSeasonFinancialRetry(ctx, season._id, job._id);
    if (job.kind === "chargeCorrection" && job.eventId) {
      const event = await ctx.db.get(job.eventId);
      if (!event || event.archived || event.seasonId !== season._id) throw new ConvexError("Correction event is archived or unavailable; explicit historical review is required.");
    }
    for (const studentId of [job.studentId, job.recipientStudentId]) {
      if (!studentId) continue;
      const account = await financialAccount(ctx, studentId);
      const student = await ctx.db.get(studentId);
      const generation = studentId === job.studentId ? job.generation : job.recipientGeneration;
      if (!student?.active || student.seasonId !== season._id || !account || account.state !== "failed" || account.operationJobId !== job._id || account.generation !== generation) throw new ConvexError("Financial operation account changed.");
      await ctx.db.patch(account._id, { state: "posting", lastError: undefined });
    }
    await ctx.db.patch(job._id, { state: "running", actorId: actor._id, lastError: undefined });
    if (job.operationId) await ctx.db.patch(job.operationId, { state: "running" });
    await audit(ctx, actor, "financialOperationJobs", job._id, "retry", { actorId: job.actorId, committedCents: job.committedCents }, { actorId: actor._id, committedCents: job.committedCents }, args.reason.trim());
    await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    return null;
  },
});
