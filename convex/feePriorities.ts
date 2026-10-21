import { publicErrorResult } from './lib/publicErrors';
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { activeSeason, viewer } from "./lib/access";
import { tokenHash } from "./lib/invitationIdentity";
import { requireNoUnfinishedFeeScopes, requireSeasonFinanceReady } from "./lib/seasonFinance";

export const maintenance = query({
  args: {},
  returns: v.object({ control: v.union(schema.doc("seasonFinanceControls"), v.null()), mappingState: v.union(v.literal("uninitialized"), v.literal("reviewRequired"), v.literal("ready")), hasUnmapped: v.union(v.boolean(), v.null()), canManageFees: v.boolean(), canMove: v.boolean(), canMap: v.boolean() }),
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Finance viewing is not enabled for this account.");
    const season = await activeSeason(ctx);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const initialized = control?.mappingInitialized === true;
    const hasUnmapped = initialized ? (control.unmappedCount ?? 0) > 0 : null;
    const available = actor.role === "coach" && (!control || control.state === "ready");
    let canMap = available;
    if (canMap) { try { await requireNoUnfinishedFeeScopes(ctx, season._id); } catch { canMap = false; } }
    return publicErrorResult({ control, mappingState: !initialized ? "uninitialized" as const : hasUnmapped ? "reviewRequired" as const : "ready" as const, hasUnmapped, canManageFees: available, canMove: available && initialized && !hasUnmapped && control?.orderReady === true, canMap });
  },
});

const item = v.object({ definition: schema.doc("feeDefinitions"), eventName: v.union(v.string(), v.null()), canMoveUp: v.boolean(), canMoveDown: v.boolean(), canEdit: v.boolean(), canCancel: v.boolean() });
export const status = query({
  args: { jobId: v.id("feePriorityJobs") }, returns: v.object({ job: schema.doc("feePriorityJobs"), originalActorName: v.string(), processingActorName: v.string(), canRetry: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Finance viewing is not enabled for this account.");
    const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    if (!job || job.seasonId !== season._id) throw new ConvexError("Shared fee job is unavailable in the active season.");
    const original = await ctx.db.get(job.originalActorId); const processor = await ctx.db.get(job.actorId);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    return publicErrorResult({ job, originalActorName: original?.name ?? "Archived account", processingActorName: processor?.name ?? "Archived account", canRetry: actor.role === "coach" && job.state === "failed" && control?.priorityJobId === job._id });
  },
});
export const move = mutation({
  args: { feeDefinitionId: v.id("feeDefinitions"), direction: v.union(v.literal("up"), v.literal("down")), expectedOrderRevision: v.number(), expectedDefinitionRevision: v.number(), reason: v.string(), idempotencyKey: v.string() }, returns: v.id("feePriorityJobs"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new ConvexError("Only a Coach may change shared fee priorities.");
    const season = await activeSeason(ctx);
    if (args.reason.trim().length < 8 || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new ConvexError("Provide a reason and unique transaction key.");
    const hash = await tokenHash(JSON.stringify([args.feeDefinitionId, args.direction, args.expectedOrderRevision, args.expectedDefinitionRevision, args.reason.trim()]));
    const existing = await ctx.db.query("feePriorityJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) { if (existing.operationHash !== hash) throw new ConvexError("Transaction key belongs to another priority change."); return existing._id; }
    await requireSeasonFinanceReady(ctx, season._id);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const first = await ctx.db.get(args.feeDefinitionId);
    if (!control?.mappingInitialized || !control.orderReady || control.unmappedCount !== 0 || control.revision !== args.expectedOrderRevision || !first || first.seasonId !== season._id || first.revision !== args.expectedDefinitionRevision) throw new ConvexError("Refresh the verified shared fee order before moving a fee.");
    const second = args.direction === "up" ? await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", season._id).lt("priority", first.priority)).order("desc").first() : await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", season._id).gt("priority", first.priority)).first();
    if (!second) throw new ConvexError("This fee is already at the boundary of the season order.");
    for (const fee of [first, second]) { if (fee.latestJobId && !["complete", "cancelled"].includes((await ctx.db.get(fee.latestJobId))?.state ?? "missing")) throw new ConvexError("Finish the existing fee operation before moving either adjacent definition."); }
    const now = Date.now();
    const id = await ctx.db.insert("feePriorityJobs", { requiredFinancialProjectionVersion: 4, seasonId: season._id, originalActorId: actor._id, actorId: actor._id, idempotencyKey: args.idempotencyKey, operationHash: hash, reason: args.reason.trim(), state: "draining", step: 0, cursor: null, phase: "drain", firstFeeId: first._id, secondFeeId: second._id, firstPriority: first.priority, secondPriority: second.priority, firstRevision: first.revision, secondRevision: second.revision, processed: 0, createdAt: now, updatedAt: now });
    await ctx.db.patch(control._id, { state: "draining", priorityJobId: id, mappingJobId: undefined, bulkJobId: undefined, revision: control.revision + 1, updatedAt: now });
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feePriorityWorker:run"), { jobId: id });
    return id;
  },
});

export const retry = mutation({
  args: { jobId: v.id("feePriorityJobs"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new ConvexError("Only a Coach may retry shared fee maintenance.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new ConvexError("Provide a reason of at least eight characters.");
    const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    if (!job || job.seasonId !== season._id || job.state !== "failed" || control?.priorityJobId !== job._id) throw new ConvexError("No failed priority maintenance is available to retry.");
    await ctx.db.patch(job._id, { actorId: actor._id, state: job.phase === "drain" ? "draining" : "applying", lastError: undefined, updatedAt: Date.now() });
    await ctx.db.patch(control._id, { state: job.phase === "drain" ? "draining" : "applying", updatedAt: Date.now() });
    await ctx.db.insert("audit", { actorId: actor._id, entity: "feePriorityJobs", entityId: job._id, action: "retry", reason: args.reason.trim(), beforeJson: JSON.stringify({ actorId: job.actorId, step: job.step }), afterJson: JSON.stringify({ actorId: actor._id, step: job.step }), at: Date.now() });
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feePriorityWorker:run"), { jobId: job._id });
    return null;
  },
});
export const list = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(item),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Finance viewing is not enabled for this account.");
    const season = await activeSeason(ctx);
    const opts = args.paginationOpts;
    if (!Number.isSafeInteger(opts.numItems) || opts.numItems < 1 || opts.numItems > 20) throw new ConvexError("Request between 1 and 20 fees.");
    if (opts.maximumRowsRead !== undefined && (!Number.isSafeInteger(opts.maximumRowsRead) || opts.maximumRowsRead < 1)) throw new ConvexError("Invalid fee read budget.");
    const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const canMove = actor.role === "coach" && control?.state === "ready" && control.mappingInitialized === true && control.orderReady === true && control.unmappedCount === 0;
    const result = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", season._id)).paginate({ ...opts, maximumRowsRead: Math.min(opts.maximumRowsRead ?? 21, 21) });
    if (result.page.length > 20) throw new ConvexError("Fee page exceeded its supported size.");
    const page = await Promise.all(result.page.map(async definition => {
      const event = definition.eventId ? await ctx.db.get(definition.eventId) : null;
      const before = canMove ? await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", season._id).lt("priority", definition.priority)).order("desc").first() : null;
      const after = canMove ? await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", season._id).gt("priority", definition.priority)).first() : null;
      const ownJob = definition.latestJobId ? await ctx.db.get(definition.latestJobId) : null;
      const beforeJob = before?.latestJobId ? await ctx.db.get(before.latestJobId) : null;
      const afterJob = after?.latestJobId ? await ctx.db.get(after.latestJobId) : null;
      const ownReady = !definition.latestJobId || ownJob?.state === "complete" || ownJob?.state === "cancelled";
      const manage = canMove && definition.kind === "custom" && definition.state === "active";
      return { definition, eventName: event?.seasonId === season._id ? event.name : null, canEdit: manage && ownReady, canCancel: manage && (ownReady || ownJob?.state === "held"), canMoveUp: !!before && ownReady && (!before.latestJobId || beforeJob?.state === "complete" || beforeJob?.state === "cancelled"), canMoveDown: !!after && ownReady && (!after.latestJobId || afterJob?.state === "complete" || afterJob?.state === "cancelled") };
    }));
    return publicErrorResult({ ...result, page });
  },
});
