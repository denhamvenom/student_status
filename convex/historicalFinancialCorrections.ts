import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query, mutation, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { audit, requireRole, viewer } from "./lib/access";
import { requireHistoricalCorrection } from "./historicalCorrections";
import { correctionSnapshot, chargeCorrectionStep } from "./lib/chargeCorrection";
import { allocateUnapplied } from "./lib/money";
import { financialAccount, readyFinancialAccount, saveFinancialAccount } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { historicalFinancialContinuation } from "./lib/seasonFinance";
import { tokenHash } from "./lib/invitationIdentity";
const kind = v.union(v.literal("adjustment"), v.literal("cancellation"));
const pageRef = makeFunctionReference<"mutation">("historicalFinancialCorrections:processPage");
const runRef = makeFunctionReference<"mutation">("historicalFinancialCorrections:run");
type Ctx = QueryCtx | MutationCtx;
async function historicalStudent(ctx: Ctx, seasonId: Id<"seasons">, studentId: Id<"students">) {
  const actor = await viewer(ctx); requireRole(actor, "coach");
  const season = await ctx.db.get(seasonId); const student = await ctx.db.get(studentId);
  if (season?.status !== "archived" || !student || student.seasonId !== season._id) throw new Error("Choose a student in this archived season.");
  return { actor, student };
}
/** Any linked account holds for a dedicated propagation review, never a partial old-season display edit. */
async function linkageHold(ctx: Ctx, studentId: Id<"students">) {
  const transfer = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_kind", q => q.eq("studentId", studentId).eq("kind", "transferOut")).first();
  const incoming = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_originEntryId", q => q.eq("studentId", studentId).gt("originEntryId", undefined)).first();
  const transition = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_seasonTransitionPlanId", q => q.eq("studentId", studentId).gt("seasonTransitionPlanId", undefined)).first();
  const openingDebt = await ctx.db.query("charges").withIndex("by_studentId_and_originChargeId", q => q.eq("studentId", studentId).gt("originChargeId", undefined)).first();
  if (transfer || incoming || transition || openingDebt) return "This account has a carried or transferred source/debt link. Its downstream financial correction is held for a dedicated propagation review; no balances have changed.";
  return null;
}
async function previewState(ctx: Ctx, seasonId: Id<"seasons">, chargeId: Id<"charges">, target: number, correctionKind: "adjustment" | "cancellation") {
  const charge = await ctx.db.get(chargeId); if (!charge) throw new Error("Historical charge not found.");
  const { actor, student } = await historicalStudent(ctx, seasonId, charge.studentId);
  if (!Number.isSafeInteger(target) || target < 0) throw new Error("Enter a nonnegative amount in exact cents.");
  const before = correctionSnapshot(charge); const account = await financialAccount(ctx, student._id);
  const hold = await linkageHold(ctx, student._id);
  const message = hold ?? (account?.state !== "ready" || account.allocationSourceVersion !== 1 ? "Historical financial preparation or existing work must finish before correction." : correctionKind === "cancellation" && target > before.effectiveCents ? "Cancellation cannot increase a charge." : target === before.effectiveCents ? "Enter a changed target amount." : !Number.isSafeInteger(target + before.cancelledCents) ? "Target and prior cancellation exceed the exact supported range." : null);
  return { actor, student, charge, account, before, message, ready: message === null };
}
export const charges = query({
  args: { seasonId: v.id("seasons"), studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ chargeId: v.id("charges"), label: v.string(), originalCents: v.number(), effectiveCents: v.number(), appliedCents: v.number(), revision: v.number() })),
  handler: async (ctx, args) => {
    await historicalStudent(ctx, args.seasonId, args.studentId);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 20) throw new Error("Review 1 to 20 historical charges per page.");
    const page = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", args.studentId)).paginate({ ...args.paginationOpts, maximumRowsRead: 21 });
    if (page.page.length > 20) throw new Error("Charge page exceeded its reviewed limit.");
    return { ...page, page: page.page.map(charge => { const before = correctionSnapshot(charge); return { chargeId: charge._id, label: charge.label, originalCents: before.amountCents, effectiveCents: before.effectiveCents, appliedCents: before.appliedCents, revision: before.revision }; }) };
  },
});
export const preview = query({
  args: { seasonId: v.id("seasons"), chargeId: v.id("charges"), targetEffectiveCents: v.number(), kind },
  returns: v.object({ ready: v.boolean(), message: v.union(v.string(), v.null()), originalCents: v.number(), effectiveCents: v.number(), appliedCents: v.number(), targetEffectiveCents: v.number(), releaseRequiredCents: v.number(), expectedChargeRevision: v.number(), expectedFinancialRevision: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => { const state = await previewState(ctx, args.seasonId, args.chargeId, args.targetEffectiveCents, args.kind); return { ready: state.ready, message: state.message, originalCents: state.before.amountCents, effectiveCents: state.before.effectiveCents, appliedCents: state.before.appliedCents, targetEffectiveCents: args.targetEffectiveCents, releaseRequiredCents: Math.max(0, state.before.appliedCents - args.targetEffectiveCents), expectedChargeRevision: state.before.revision, expectedFinancialRevision: state.account?.revision ?? null }; },
});
export const correct = mutation({
  args: { correctionSessionId: v.id("historicalCorrectionSessions"), chargeId: v.id("charges"), kind, targetEffectiveCents: v.number(), expectedChargeRevision: v.number(), expectedFinancialRevision: v.number(), reason: v.string(), idempotencyKey: v.string() }, returns: v.id("financialOperationJobs"),
  handler: async (ctx, args) => {
    const { actor, grant } = await requireHistoricalCorrection(ctx, args.correctionSessionId);
    const reason = args.reason.trim(); if (reason.length < 8 || reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new Error("Provide a correction reason and stable request key.");
    const hash = await tokenHash(JSON.stringify(["historicalCharge", grant.seasonId, args.chargeId, args.kind, args.targetEffectiveCents, args.expectedChargeRevision, args.expectedFinancialRevision, reason]));
    const old = await ctx.db.query("financialOperationJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (old) { if (old.operationHash !== hash || !old.historicalCorrectionSessionId) throw new Error("Request key belongs to a different financial command."); return old._id; }
    const state = await previewState(ctx, grant.seasonId, args.chargeId, args.targetEffectiveCents, args.kind);
    if (!state.ready) throw new Error(state.message ?? "Historical charge cannot be corrected.");
    const account = await readyFinancialAccount(ctx, state.student._id);
    if (state.before.revision !== args.expectedChargeRevision || account.revision !== args.expectedFinancialRevision) throw new Error("Historical charge or source balance changed. Review it again.");
    const release = Math.max(0, state.before.appliedCents - args.targetEffectiveCents);
    const id = await ctx.db.insert("financialOperationJobs", { requiredFinancialProjectionVersion: 4, kind: "chargeCorrection", historicalCorrectionSessionId: grant._id, studentId: state.student._id, actorId: actor._id, originalActorId: actor._id, generation: account.generation, state: "running", step: 0, amountCents: release, committedCents: 0, idempotencyKey: args.idempotencyKey, operationHash: hash, eventId: state.charge.eventId, chargeId: state.charge._id, correctionKind: args.kind, targetEffectiveCents: args.targetEffectiveCents, originalEffectiveCents: state.before.effectiveCents, originalAppliedCents: state.before.appliedCents, releaseRequiredCents: release, chargeBeforeJson: JSON.stringify(state.before), chargeCursor: null, reason, updatedAt: Date.now() });
    account.state = "posting"; account.operationJobId = id; await saveFinancialAccount(ctx, account);
    await audit(ctx, actor, "charges", state.charge._id, "startHistoricalFinancialCorrection", state.before, { jobId: id, correctionSessionId: grant._id, targetEffectiveCents: args.targetEffectiveCents }, reason);
    await ctx.runMutation(pageRef, { jobId: id, step: 0 }); return id;
  },
});
export const processPage = internalMutation({
  args: { jobId: v.id("financialOperationJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId); if (!job || !job.historicalCorrectionSessionId || job.kind !== "chargeCorrection" || job.state !== "running" || job.step !== args.step) return null;
    const student = await ctx.db.get(job.studentId); if (!student) throw new Error("Historical student is unavailable.");
    await historicalFinancialContinuation(ctx, student.seasonId, job._id);
    const hold = await linkageHold(ctx, student._id); if (hold) throw new Error(hold);
    const actor = await ctx.db.get(job.actorId); const account = await financialAccount(ctx, student._id);
    if (!actor || !account || account.operationJobId !== job._id || account.state !== "posting" || account.generation !== job.generation || account.seasonId !== student.seasonId) throw new Error("Historical correction source lock changed.");
    const result = await chargeCorrectionStep(ctx, actor, account, job);
    await ctx.db.patch(job._id, { state: result.done ? "complete" : "running", committedCents: result.committed, step: job.step + 1, updatedAt: Date.now() });
    if (result.done) {
      account.state = "ready"; account.operationJobId = undefined; await saveFinancialAccount(ctx, account);
      await allocateUnapplied(ctx, actor, account.studentId, `historical:${job._id}:allocate`, undefined, job._id);
      await audit(ctx, actor, "charges", job.chargeId!, "completeHistoricalFinancialCorrection", null, { jobId: job._id, correctionSessionId: job.historicalCorrectionSessionId }, job.reason);
    } else await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    await refreshStudentFinance(ctx, student._id); return null;
  },
});
export const run = internalMutation({ args: { jobId: v.id("financialOperationJobs") }, returns: v.null(), handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId); if (!job || !job.historicalCorrectionSessionId || job.state !== "running") return null;
  try { await ctx.runMutation(pageRef, { jobId: job._id, step: job.step }); }
  catch (error) { await ctx.db.patch(job._id, { state: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Historical correction failed.", updatedAt: Date.now() }); const account = await financialAccount(ctx, job.studentId); if (account?.operationJobId === job._id) await ctx.db.patch(account._id, { state: "failed", lastError: "Historical correction requires a fresh Coach grant and retry.", updatedAt: Date.now() }); }
  return null;
} });
export const status = query({
  args: { seasonId: v.id("seasons"), chargeId: v.id("charges"), jobId: v.optional(v.id("financialOperationJobs")) },
  returns: v.object({ job: v.union(schema.doc("financialOperationJobs"), v.null()), financialState: v.union(v.string(), v.null()), canRetry: v.boolean() }),
  handler: async (ctx, args) => {
    const charge = await ctx.db.get(args.chargeId); if (!charge) throw new Error("Historical charge is unavailable."); await historicalStudent(ctx, args.seasonId, charge.studentId);
    const candidate = args.jobId ? await ctx.db.get(args.jobId) : await ctx.db.query("financialOperationJobs").withIndex("by_chargeId_and_updatedAt", q => q.eq("chargeId", args.chargeId)).order("desc").first();
    if (candidate && (candidate.chargeId !== args.chargeId || candidate.kind !== "chargeCorrection")) throw new Error("Historical correction does not belong to this charge.");
    const job = candidate?.historicalCorrectionSessionId ? candidate : null; const account = await financialAccount(ctx, charge.studentId);
    const allocation = account?.allocationJobId ? await ctx.db.get(account.allocationJobId) : null;
    return { job, financialState: account?.state ?? null, canRetry: job?.state === "failed" || !!job && job.state === "complete" && account?.state === "failed" && allocation?.maintenanceOriginId === job._id };
  },
});
export const retry = mutation({
  args: { correctionSessionId: v.id("historicalCorrectionSessions"), jobId: v.id("financialOperationJobs"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, grant } = await requireHistoricalCorrection(ctx, args.correctionSessionId); const reason = args.reason.trim(); if (reason.length < 8 || reason.length > 1000) throw new Error("Provide a reason for retrying this historical correction.");
    const job = await ctx.db.get(args.jobId); const account = job ? await financialAccount(ctx, job.studentId) : null;
    if (!job?.historicalCorrectionSessionId || job.kind !== "chargeCorrection" || !account || account.seasonId !== grant.seasonId || account.generation !== job.generation) throw new Error("Historical correction does not belong to this season.");
    const hold = await linkageHold(ctx, job.studentId); if (hold) throw new Error(hold);
    const allocation = account.allocationJobId ? await ctx.db.get(account.allocationJobId) : null;
    if (job.state === "failed" && account.operationJobId === job._id) { await ctx.db.patch(job._id, { actorId: actor._id, historicalCorrectionSessionId: grant._id, state: "running", lastError: undefined, updatedAt: Date.now() }); await ctx.db.patch(account._id, { state: "posting", lastError: undefined, updatedAt: Date.now() }); await ctx.scheduler.runAfter(0, runRef, { jobId: job._id }); }
    else if (job.state === "complete" && account.state === "failed" && allocation?.state === "failed" && allocation.maintenanceOriginId === job._id) { await ctx.db.patch(job._id, { actorId: actor._id, historicalCorrectionSessionId: grant._id }); await ctx.db.patch(allocation._id, { actorId: actor._id, state: "running", lastError: undefined, updatedAt: Date.now() }); await ctx.db.patch(account._id, { state: "allocating", lastError: undefined, updatedAt: Date.now() }); await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("financialAllocation:run"), { jobId: allocation._id }); }
    else throw new Error("Historical correction has no failed work to retry.");
    await audit(ctx, actor, "financialOperationJobs", job._id, "retryHistoricalFinancialCorrection", { correctionSessionId: job.historicalCorrectionSessionId }, { correctionSessionId: grant._id }, reason); return null;
  },
});
