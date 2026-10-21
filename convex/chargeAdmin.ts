import { publicErrorResult } from './lib/publicErrors';
import { requireSeasonFinanceReady, seasonFinanceControl, seasonFinancialRetryAvailable } from "./lib/seasonFinance";
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { activeSeason, audit, studentAccess, viewer } from "./lib/access";
import { correctionSnapshot } from "./lib/chargeCorrection";
import { ensureFinancialAccount, financialAccount, saveFinancialAccount } from "./lib/financialSources";
import { tokenHash } from "./lib/invitationIdentity";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";

const kind = v.union(v.literal("adjustment"), v.literal("cancellation"));
const financialState = v.union(v.literal("ready"), v.literal("updating"), v.literal("failed"), v.literal("uninitialized"));
function boundRead(options: { maximumRowsRead?: number }) {
  if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new ConvexError("Invalid correction read budget.");
  options.maximumRowsRead = Math.min(options.maximumRowsRead ?? 21, 21);
}
const amounts = v.object({ amountCents: v.number(), adjustedCents: v.number(), cancelledCents: v.number(), effectiveCents: v.number(), appliedCents: v.number(), priority: v.number(), revision: v.number() });
const previewResult = v.object({ state: v.union(v.literal("ready"), v.literal("updating"), v.literal("hold")), message: v.union(v.string(), v.null()), chargeId: v.id("charges"), amounts, targetEffectiveCents: v.number(), releaseRequiredCents: v.number(), targetOutstandingCents: v.number(), expectedChargeRevision: v.number(), expectedFinancialRevision: v.union(v.number(), v.null()) });

async function accessibleCharge(ctx: QueryCtx | MutationCtx, chargeId: Id<"charges">) {
  const actor = await viewer(ctx); const charge = await ctx.db.get(chargeId);
  if (!charge) throw new ConvexError("Charge not found.");
  const student = await studentAccess(ctx, actor, charge.studentId); const season = await activeSeason(ctx);
  if (student.seasonId !== season._id) throw new ConvexError("Charge is unavailable in the active season.");
  const event = charge.eventId ? await ctx.db.get(charge.eventId) : null;
  if (charge.eventId && (!event || event.seasonId !== season._id)) throw new ConvexError("Charge event is unavailable in the active season.");
  return { actor, charge, student, event };
}

function targetCents(target: number) {
  if (!Number.isSafeInteger(target) || target < 0) throw new ConvexError("Enter a nonnegative amount in exact cents.");
}

export const detail = query({
  args: { chargeId: v.id("charges") }, returns: v.object({ charge: schema.doc("charges"), amounts, financialState, financialRevision: v.union(v.number(), v.null()), canCorrect: v.boolean() }),
  handler: async (ctx, args) => {
    const { actor, charge, student, event } = await accessibleCharge(ctx, args.chargeId);
    const maintenance = await seasonFinanceControl(ctx, student.seasonId);
    const account = await financialAccount(ctx, charge.studentId);
    const state = !account || account.state === "uninitialized" ? "uninitialized" as const : account.state === "ready" && account.allocationSourceVersion === 1 ? "ready" as const : account.state === "failed" ? "failed" as const : "updating" as const;
    return { charge, amounts: correctionSnapshot(charge), financialState: state, financialRevision: account?.state === "ready" && account.allocationSourceVersion === 1 ? account.revision : null, canCorrect: actor.role === "coach" && state === "ready" && !event?.archived && (!maintenance || maintenance.state === "ready") };
  },
});

export const previewCorrection = query({
  args: { chargeId: v.id("charges"), targetEffectiveCents: v.number(), kind }, returns: previewResult,
  handler: async (ctx, args) => {
    const { actor, charge, event } = await accessibleCharge(ctx, args.chargeId);
    if (actor.role !== "coach") throw new ConvexError("Only a Coach may correct or cancel charges.");
    targetCents(args.targetEffectiveCents);
    const before = correctionSnapshot(charge); const account = await financialAccount(ctx, charge.studentId);
    const updating = account?.state !== "ready" || account.allocationSourceVersion !== 1 || event?.enrollmentState === "running" || event?.enrollmentState === "failed";
    const oversized = args.kind === "adjustment" && !Number.isSafeInteger(args.targetEffectiveCents + before.cancelledCents);
    const hold = !!event?.archived || oversized || args.targetEffectiveCents === before.effectiveCents || args.kind === "cancellation" && args.targetEffectiveCents > before.effectiveCents;
    return { state: event?.archived ? "hold" as const : updating ? "updating" as const : hold ? "hold" as const : "ready" as const, message: event?.archived ? "Archived event charges require explicit historical review." : updating ? "Financial or enrollment preparation must finish before correction." : oversized ? "Target plus prior cancellations exceeds the supported exact-cent range." : hold ? args.targetEffectiveCents === before.effectiveCents ? "Target amount already matches this obligation." : "Cancellation cannot increase a charge." : null, chargeId: charge._id, amounts: before, targetEffectiveCents: args.targetEffectiveCents, releaseRequiredCents: Math.max(0, before.appliedCents - args.targetEffectiveCents), targetOutstandingCents: Math.max(0, args.targetEffectiveCents - before.appliedCents), expectedChargeRevision: before.revision, expectedFinancialRevision: account?.state === "ready" && account.allocationSourceVersion === 1 ? account.revision : null };
  },
});

export const correct = mutation({
  args: { chargeId: v.id("charges"), kind, targetEffectiveCents: v.number(), expectedChargeRevision: v.number(), expectedFinancialRevision: v.number(), reason: v.string(), idempotencyKey: v.string() },
  returns: v.object({ jobId: v.id("financialOperationJobs"), state: v.union(v.literal("running"), v.literal("failed"), v.literal("complete")), chargeRevisionId: v.union(v.id("chargeRevisions"), v.null()) }),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const { actor, charge, student, event } = await accessibleCharge(ctx, args.chargeId);
    if (actor.role !== "coach") throw new ConvexError("Only a Coach may correct or cancel charges.");
    targetCents(args.targetEffectiveCents);
    if (args.reason.trim().length < 8 || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150 || !Number.isSafeInteger(args.expectedChargeRevision) || !Number.isSafeInteger(args.expectedFinancialRevision)) throw new ConvexError("Provide reviewed revisions, a reason, and unique transaction key.");
    const hash = await tokenHash(JSON.stringify(["chargeCorrection", args.chargeId, args.kind, args.targetEffectiveCents, args.expectedChargeRevision, args.expectedFinancialRevision, args.reason.trim()]));
    const existing = await ctx.db.query("financialOperationJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) {
      if (existing.operationHash !== hash || existing.kind !== "chargeCorrection") throw new ConvexError("Transaction key is already used for a different financial command.");
      return { jobId: existing._id, state: existing.state, chargeRevisionId: existing.chargeRevisionId ?? null };
    }
    if (event?.archived) throw new ConvexError("Archived event charges require explicit historical review.");
    if (event) requireEnrollmentComplete(event);
    const before = correctionSnapshot(charge); const account = await ensureFinancialAccount(ctx, student._id);
    if (before.revision !== args.expectedChargeRevision || account.revision !== args.expectedFinancialRevision) throw new ConvexError("Charge or financial records changed; refresh the correction preview.");
    if (args.targetEffectiveCents === before.effectiveCents || args.kind === "cancellation" && args.targetEffectiveCents > before.effectiveCents) throw new ConvexError("Choose a changed target amount; cancellation cannot increase obligation.");
    if (args.kind === "adjustment" && !Number.isSafeInteger(args.targetEffectiveCents + before.cancelledCents)) throw new ConvexError("Target plus prior cancellations exceeds the supported exact-cent range.");
    const releaseRequiredCents = Math.max(0, before.appliedCents - args.targetEffectiveCents);
    const now = Date.now();
    const jobId = await ctx.db.insert("financialOperationJobs", { requiredFinancialProjectionVersion: 4, kind: "chargeCorrection", studentId: student._id, actorId: actor._id, originalActorId: actor._id, generation: account.generation, state: "running", step: 0, amountCents: releaseRequiredCents, committedCents: 0, idempotencyKey: args.idempotencyKey, operationHash: hash, eventId: charge.eventId, chargeId: charge._id, correctionKind: args.kind, targetEffectiveCents: args.targetEffectiveCents, originalEffectiveCents: before.effectiveCents, originalAppliedCents: before.appliedCents, releaseRequiredCents, chargeBeforeJson: JSON.stringify(before), chargeCursor: null, reason: args.reason.trim(), updatedAt: now });
    account.state = "posting"; account.operationJobId = jobId; await saveFinancialAccount(ctx, account);
    await audit(ctx, actor, "charges", charge._id, "startCorrection", before, { jobId, targetEffectiveCents: args.targetEffectiveCents, releaseRequiredCents, state: "running" }, args.reason.trim());
    await ctx.runMutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), { jobId, step: 0 });
    const job = await ctx.db.get(jobId);
    if (!job) throw new ConvexError("Correction job is unavailable.");
    return { jobId, state: job.state, chargeRevisionId: job.chargeRevisionId ?? null };
  },
});

export const status = query({
  args: { chargeId: v.id("charges"), jobId: v.optional(v.id("financialOperationJobs")) },
  returns: v.object({ job: v.union(schema.doc("financialOperationJobs"), v.null()), financialState, canRetry: v.boolean(), originalActorName: v.union(v.string(), v.null()), processingActorName: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const { actor, charge, student, event } = await accessibleCharge(ctx, args.chargeId);
    const account = await financialAccount(ctx, charge.studentId);
    const job = args.jobId ? await ctx.db.get(args.jobId) : await ctx.db.query("financialOperationJobs").withIndex("by_chargeId_and_updatedAt", q => q.eq("chargeId", charge._id)).order("desc").first();
    if (job && (job.kind !== "chargeCorrection" || job.chargeId !== charge._id || job.studentId !== charge.studentId)) throw new ConvexError("Correction job is unavailable for this charge.");
    const original = job?.originalActorId ? await ctx.db.get(job.originalActorId) : null; const processor = job ? await ctx.db.get(job.actorId) : null;
    return publicErrorResult({ job, financialState: !account || account.state === "uninitialized" ? "uninitialized" as const : account.state === "ready" && account.allocationSourceVersion === 1 ? "ready" as const : account.state === "failed" ? "failed" as const : "updating" as const, canRetry: actor.role === "coach" && job?.state === "failed" && !event?.archived && await seasonFinancialRetryAvailable(ctx, student.seasonId, job._id), originalActorName: original?.name ?? null, processingActorName: processor?.name ?? null });
  },
});

export const history = query({
  args: { chargeId: v.id("charges"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("chargeRevisions").extend({ originalActorName: v.string(), processingActorName: v.string() })),
  handler: async (ctx, args) => {
    await accessibleCharge(ctx, args.chargeId);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 20) throw new ConvexError("Request at most 20 correction receipts per page.");
    boundRead(args.paginationOpts);
    const page = await ctx.db.query("chargeRevisions").withIndex("by_chargeId_and_recordedAt", q => q.eq("chargeId", args.chargeId)).order("desc").paginate(args.paginationOpts);
    if (page.page.length > 20) throw new ConvexError("Correction receipt page exceeded its read budget.");
    const named = [];
    for (const revision of page.page) {
      const original = await ctx.db.get(revision.createdBy); const processor = await ctx.db.get(revision.processedBy);
      named.push({ ...revision, originalActorName: original?.name ?? "Unavailable Coach", processingActorName: processor?.name ?? "Unavailable Coach" });
    }
    return { ...page, page: named };
  },
});

export const sourceEvidence = query({
  args: { chargeId: v.id("charges"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ sourceEntryId: v.id("ledgerEntries"), rootOriginEntryId: v.id("ledgerEntries"), sourceKind: v.union(v.literal("payment"), v.literal("fundraiser")), receivedCents: v.number(), availableCents: v.number(), appliedCents: v.number(), transferred: v.boolean(), recordedAt: v.union(v.number(), v.null()) })).extend({ financialState }),
  handler: async (ctx, args) => {
    const { charge } = await accessibleCharge(ctx, args.chargeId); const account = await financialAccount(ctx, charge.studentId);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 20) throw new ConvexError("Request at most 20 funding sources per page.");
    const state = !account || account.state === "uninitialized" ? "uninitialized" as const : account.state === "ready" && account.allocationSourceVersion === 1 ? "ready" as const : account.state === "failed" ? "failed" as const : "updating" as const;
    if (!account || account.state === "uninitialized" || account.state === "rebuilding" || account.state === "failed" && !account.operationJobId && !account.allocationJobId && !account.fundraiserJobId) return { financialState: state, page: [], isDone: true, continueCursor: "" };
    boundRead(args.paginationOpts);
    const page = await ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_chargeId", q => q.eq("studentId", charge.studentId).eq("generation", account.generation).eq("chargeId", charge._id)).paginate(args.paginationOpts);
    if (page.page.length > 20) throw new ConvexError("Source evidence page exceeded its read budget.");
    const rows = [];
    for (const allocation of page.page) {
      const source = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", charge.studentId).eq("generation", account.generation).eq("sourceEntryId", allocation.sourceEntryId)).unique();
      const receipt = await ctx.db.get(allocation.sourceEntryId);
      if (!source || !receipt || receipt.studentId !== charge.studentId) throw new ConvexError("Charge source evidence is inconsistent; Coach review is required.");
      rows.push({ sourceEntryId: source.sourceEntryId, rootOriginEntryId: source.rootOriginEntryId, sourceKind: source.kind, receivedCents: source.receivedCents, availableCents: source.availableCents, appliedCents: allocation.appliedCents, transferred: source.rootOriginEntryId !== source.sourceEntryId, recordedAt: receipt.recordedAt });
    }
    return { ...page, financialState: state, page: rows };
  },
});
