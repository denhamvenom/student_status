import { publicErrorResult } from './lib/publicErrors';
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { activeSeason, requireRole, viewer } from "./lib/access";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { tokenHash } from "./lib/invitationIdentity";
import { requireSeasonFinanceReady, requireNoUnfinishedFeeScopes } from "./lib/seasonFinance";
export { prepareBulk, previewBulk, commitBulk, cancelPrepared, bulkStatus, bulkRows, bulkJobs, priorHeldRows, retryBulk } from "./feeBulk";

export const prepareMapping = mutation({
  args: { reason: v.string(), idempotencyKey: v.string() }, returns: v.id("feeMappingJobs"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    if (args.reason.trim().length < 8 || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new ConvexError("Enter a reason of at least eight characters.");
    const hash = await tokenHash(JSON.stringify([season._id, "prove", args.reason.trim()]));
    const existing = await ctx.db.query("feeMappingJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) { if (existing.operationHash !== hash) throw new ConvexError("This was already submitted with different details. Reload to see the latest, then try again."); return existing._id; }
    await requireSeasonFinanceReady(ctx, season._id);
    await requireNoUnfinishedFeeScopes(ctx, season._id);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const now = Date.now();
    const jobId = await ctx.db.insert("feeMappingJobs", { requiredFinancialProjectionVersion: 4, seasonId: season._id, originalActorId: actor._id, actorId: actor._id, mode: "prove", state: "draining", phase: "drain", step: 0, cursor: null, nextRank: 1, processed: 0, mapped: 0, unmapped: 0, idempotencyKey: args.idempotencyKey, operationHash: hash, reason: args.reason.trim(), createdAt: now, updatedAt: now });
    const fields = { state: "draining" as const, mappingJobId: jobId, priorityJobId: undefined, bulkJobId: undefined, mappingInitialized: false, orderReady: false, unmappedCount: 0, updatedAt: now };
    if (control) await ctx.db.patch(control._id, { ...fields, revision: control.revision + 1 });
    else await ctx.db.insert("seasonFinanceControls", { ...fields, seasonId: season._id, revision: 1 });
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feeMappingWorker:run"), { jobId });
    return jobId;
  },
});

export const mappingStatus = query({
  args: { jobId: v.id("feeMappingJobs") }, returns: v.object({ job: schema.doc("feeMappingJobs"), originalActorName: v.string(), processingActorName: v.string(), canRetry: v.boolean(), canCancel: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    const job = await ctx.db.get(args.jobId); if (!job || job.seasonId !== season._id) throw new ConvexError("This fee matching no longer exists. Reload to see the latest.");
    const original = await ctx.db.get(job.originalActorId); const processor = await ctx.db.get(job.actorId);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    return publicErrorResult({ job, originalActorName: original?.name ?? "Archived account", processingActorName: processor?.name ?? "Archived account", canRetry: job.state === "failed" && control?.mappingJobId === job._id, canCancel: job.state === "failed" && control?.mappingJobId === job._id && (job.mode === "review" ? job.mapped === 0 && ["drain", "review"].includes(job.phase) : ["drain", "events", "scan"].includes(job.phase)) });
  },
});

export const cancelMapping = mutation({
  args: { jobId: v.id("feeMappingJobs"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId); const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    if (!job || job.seasonId !== season._id || job.state !== "failed" || control?.mappingJobId !== job._id || !(job.mode === "review" ? job.mapped === 0 && ["drain", "review"].includes(job.phase) : ["drain", "events", "scan"].includes(job.phase)) || args.reason.trim().length < 8 || args.reason.length > 1000) throw new ConvexError("Only fee matching that stopped early can be canceled. Enter a reason of at least eight characters.");
    await ctx.db.patch(job._id, { state: "cancelled", updatedAt: Date.now() });
    await ctx.db.patch(control._id, { state: "ready", mappingJobId: undefined, ...(job.mode === "prove" ? { mappingInitialized: false, orderReady: false, unmappedCount: undefined } : {}), revision: control.revision + 1, updatedAt: Date.now() });
    await ctx.db.insert("audit", { actorId: actor._id, entity: "feeMappingJobs", entityId: job._id, action: "cancelStaleMapping", reason: args.reason.trim(), at: Date.now(), beforeJson: JSON.stringify({ mode: job.mode, phase: job.phase, mapped: job.mapped }), afterJson: JSON.stringify({ state: "cancelled", monetaryWrites: 0, existingChargeRankWrites: 0 }) }); return null;
  },
});

export const mapCharges = mutation({
  args: { chargeIds: v.array(v.object({ chargeId: v.id("charges"), expectedChargeRevision: v.number() })), feeDefinitionId: v.id("feeDefinitions"), expectedOrderRevision: v.number(), reason: v.string(), idempotencyKey: v.string() }, returns: v.id("feeMappingJobs"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    if (!args.chargeIds.length || args.chargeIds.length > 20 || new Set(args.chargeIds.map(row => row.chargeId)).size !== args.chargeIds.length || args.reason.trim().length < 8 || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new ConvexError("Choose up to 20 fees and enter a reason of at least eight characters.");
    const hash = await tokenHash(JSON.stringify([season._id, "review", args.chargeIds, args.feeDefinitionId, args.expectedOrderRevision, args.reason.trim()]));
    const existing = await ctx.db.query("feeMappingJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) { if (existing.operationHash !== hash) throw new ConvexError("This was already submitted with different details. Reload to see the latest, then try again."); return existing._id; }
    await requireSeasonFinanceReady(ctx, season._id);
    await requireNoUnfinishedFeeScopes(ctx, season._id);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const definition = await ctx.db.get(args.feeDefinitionId);
    if (!control?.mappingInitialized || control.revision !== args.expectedOrderRevision || !definition || definition.seasonId !== season._id || definition.state !== "active") throw new ConvexError("This changed since you opened it. Reload to see the latest, then try again.");
    for (const row of args.chargeIds) {
      const charge = await ctx.db.get(row.chargeId); const student = charge ? await ctx.db.get(charge.studentId) : null;
      const review = await ctx.db.query("feeUnmappedCharges").withIndex("by_chargeId", q => q.eq("chargeId", row.chargeId)).unique();
      if (!charge || !student || student.seasonId !== season._id || charge.feeDefinitionId || (charge.revision ?? 0) !== row.expectedChargeRevision || review?.state !== "unmapped" || charge.eventId !== definition.eventId) throw new ConvexError("A selected fee changed or belongs to another event. Reload and choose again.");
    }
    const now = Date.now();
    const jobId = await ctx.db.insert("feeMappingJobs", { requiredFinancialProjectionVersion: 4, seasonId: season._id, originalActorId: actor._id, actorId: actor._id, mode: "review", state: "draining", phase: "drain", step: 0, cursor: null, nextRank: 1, processed: 0, mapped: 0, unmapped: control.unmappedCount ?? 0, feeDefinitionId: definition._id, idempotencyKey: args.idempotencyKey, operationHash: hash, reason: args.reason.trim(), createdAt: now, updatedAt: now });
    for (const row of args.chargeIds) await ctx.db.insert("feeMappingRows", { jobId, ...row, state: "pending" });
    await ctx.db.patch(control._id, { state: "draining", mappingJobId: jobId, priorityJobId: undefined, bulkJobId: undefined, revision: control.revision + 1, updatedAt: now });
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feeMappingWorker:run"), { jobId }); return jobId;
  },
});

export const retryMapping = mutation({
  args: { jobId: v.id("feeMappingJobs"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new ConvexError("Provide a reason of at least eight characters.");
    const job = await ctx.db.get(args.jobId); const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    if (!job || job.state !== "failed" || job.seasonId !== season._id || control?.mappingJobId !== job._id) throw new ConvexError("There is no stopped fee matching to retry. Reload to see the latest.");
    const state = job.phase === "drain" ? "draining" as const : "applying" as const;
    await ctx.db.patch(job._id, { actorId: actor._id, state, lastError: undefined, updatedAt: Date.now() });
    await ctx.db.patch(control._id, { state, updatedAt: Date.now() });
    await ctx.db.insert("audit", { actorId: actor._id, entity: "feeMappingJobs", entityId: job._id, action: "retry", reason: args.reason.trim(), beforeJson: JSON.stringify({ actorId: job.actorId, step: job.step }), afterJson: JSON.stringify({ actorId: actor._id, step: job.step }), at: Date.now() });
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feeMappingWorker:run"), { jobId: job._id }); return null;
  },
});

export const createMappingDefinition = mutation({
  args: { label: v.string(), kind: v.union(v.literal("eventExtra"), v.literal("custom")), eventId: v.optional(v.id("events")), defaultAmountCents: v.number(), expectedOrderRevision: v.number(), reason: v.string(), idempotencyKey: v.string() }, returns: v.id("feeDefinitions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    if (!args.label.trim() || args.label.length > 150 || !Number.isSafeInteger(args.defaultAmountCents) || args.defaultAmountCents < 0 || args.reason.trim().length < 8 || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150 || (args.kind === "eventExtra") !== !!args.eventId) throw new ConvexError("Enter the fee name, amount, and a reason of at least eight characters.");
    const originKey = `review:${actor._id}:${args.idempotencyKey}`;
    const existing = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_originKey", q => q.eq("seasonId", season._id).eq("originKey", originKey)).unique();
    if (existing) {
      if (existing.label !== args.label.trim() || existing.kind !== args.kind || existing.eventId !== args.eventId || existing.defaultAmountCents !== args.defaultAmountCents) throw new ConvexError("This was already submitted with different details. Reload to see the latest, then try again.");
      return existing._id;
    }
    await requireSeasonFinanceReady(ctx, season._id);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    if (!control?.mappingInitialized || control.revision !== args.expectedOrderRevision) throw new ConvexError("This changed since you opened it. Reload to see the latest, then try again.");
    if (args.eventId && (await ctx.db.get(args.eventId))?.seasonId !== season._id) throw new ConvexError("This event isn't in the current season. Choose another event.");
    const last = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", season._id)).order("desc").first();
    const now = Date.now(); const priority = (last?.priority ?? 0) + 1;
    if (!Number.isSafeInteger(priority)) throw new ConvexError("The fee order isn't ready yet. Reload, then try again.");
    const id = await ctx.db.insert("feeDefinitions", { seasonId: season._id, kind: args.kind, eventId: args.eventId, label: args.label.trim(), defaultAmountCents: args.defaultAmountCents, priority, revision: 0, state: "active", createdBy: actor._id, createdAt: now, updatedAt: now, originKey, originProof: "manual" });
    await ctx.db.patch(control._id, { revision: control.revision + 1, updatedAt: now });
    await ctx.db.insert("audit", { actorId: actor._id, entity: "feeDefinitions", entityId: id, action: "createMappingDestination", reason: args.reason.trim(), at: now, afterJson: JSON.stringify({ kind: args.kind, label: args.label.trim(), eventId: args.eventId }) });
    return id;
  },
});

const unmappedItem = v.object({ review: schema.doc("feeUnmappedCharges"), charge: schema.doc("charges"), studentName: v.string(), eventName: v.union(v.string(), v.null()), effectiveCents: v.number() });
export const unmapped = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(unmappedItem),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    const opts = boundedOptions(args.paginationOpts);
    const result = await ctx.db.query("feeUnmappedCharges").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id).eq("state", "unmapped")).paginate(opts);
    if (result.page.length > 20) throw new ConvexError("This list couldn't load. Reload the page to try again.");
    const page = await Promise.all(result.page.map(async review => {
      const charge = await ctx.db.get(review.chargeId);
      if (!charge) throw new ConvexError("A fee in this list no longer exists. Reload to see the latest.");
      const student = await ctx.db.get(charge.studentId);
      if (!student || student.seasonId !== season._id) throw new ConvexError("This fee isn't in the current season. Reload to see the latest.");
      const event = charge.eventId ? await ctx.db.get(charge.eventId) : null;
      return { review, charge, studentName: student.legalName || student.preferredName, eventName: event?.name ?? null, effectiveCents: effectiveChargeCents(charge) };
    }));
    return publicErrorResult({ ...result, page });
  },
});

const studentItem = v.object({ studentId: v.id("students"), name: v.string() });
export const students = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(studentItem),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    const result = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", season._id).eq("active", true)).paginate(boundedOptions(args.paginationOpts));
    if (result.page.length > 20) throw new ConvexError("This list couldn't load. Reload the page to try again.");
    return publicErrorResult({ ...result, page: result.page.map(student => ({ studentId: student._id, name: student.legalName || student.preferredName })) });
  },
});

const eventItem = v.object({ eventId: v.id("events"), name: v.string(), startsAt: v.number(), archived: v.boolean() });
export const events = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(eventItem),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    const result = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).paginate(boundedOptions(args.paginationOpts));
    if (result.page.length > 20) throw new ConvexError("This list couldn't load. Reload the page to try again.");
    return publicErrorResult({ ...result, page: result.page.map(event => ({ eventId: event._id, name: event.name, startsAt: event.startsAt, archived: event.archived })) });
  },
});

type NativeOptions = { numItems: number; cursor: string | null; endCursor?: string | null; maximumRowsRead?: number; maximumBytesRead?: number; id?: number };
function boundedOptions<T extends NativeOptions>(opts: T): T {
  if (!Number.isSafeInteger(opts.numItems) || opts.numItems < 1 || opts.numItems > 20) throw new ConvexError("Request between 1 and 20 records.");
  if (opts.maximumRowsRead !== undefined && (!Number.isSafeInteger(opts.maximumRowsRead) || opts.maximumRowsRead < 1)) throw new ConvexError("This list couldn't load. Reload the page to try again.");
  return { ...opts, maximumRowsRead: Math.min(opts.maximumRowsRead ?? 21, 21) };
}
