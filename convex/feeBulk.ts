import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { activeSeason, audit, requireRole, viewer } from "./lib/access";
import { requireSeasonFinanceReady, seasonFinanceControl } from "./lib/seasonFinance";
import { tokenHash } from "./lib/invitationIdentity";
import { financialAccount } from "./lib/financialSources";
import { effectiveChargeCents } from "./lib/chargeObligation";

const kind = v.union(v.literal("create"), v.literal("edit"), v.literal("cancel"));
const scope = v.union(v.literal("allActive"), v.literal("selected"), v.literal("confirmedEvent"), v.literal("existingCharges"));
export const prepareBulk = mutation({
  args: { kind, feeDefinitionId: v.optional(v.id("feeDefinitions")), label: v.optional(v.string()), targetAmountCents: v.number(), scope, studentIds: v.optional(v.array(v.id("students"))), eventId: v.optional(v.id("events")), supersedeHeldJobId: v.optional(v.id("feeBulkJobs")), expectedHeldRows: v.optional(v.number()), reason: v.string(), idempotencyKey: v.string() }, returns: v.id("feeBulkJobs"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    if (!Number.isSafeInteger(args.targetAmountCents) || args.targetAmountCents < 0 || args.kind === "cancel" && (args.targetAmountCents !== 0 || args.scope !== "existingCharges") || args.reason.trim().length < 8 || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new Error("Provide an exact fee amount, review reason, and unique key.");
    if (args.scope === "selected" ? !args.studentIds?.length || args.studentIds.length > 500 || new Set(args.studentIds).size !== args.studentIds.length : !!args.studentIds?.length) throw new Error("Select up to 500 distinct students, or use an automatic immutable scope.");
    if (args.kind === "create" ? !!args.feeDefinitionId || !args.label?.trim() || args.label.length > 150 || args.scope === "existingCharges" : !args.feeDefinitionId) throw new Error("Choose a new fee label or an existing custom definition.");
    if (args.scope === "confirmedEvent" && !args.eventId) throw new Error("Choose the confirmed event scope.");
    const hash = await tokenHash(JSON.stringify([season._id, args.kind, args.feeDefinitionId ?? null, args.label?.trim() ?? null, args.targetAmountCents, args.scope, args.studentIds ?? null, args.eventId ?? null, args.supersedeHeldJobId ?? null, args.expectedHeldRows ?? null, args.reason.trim()]));
    const previous = await ctx.db.query("feeBulkJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (previous) { if (previous.operationHash !== hash) throw new Error("Fee key belongs to another prepared command."); return previous._id; }
    await requireSeasonFinanceReady(ctx, season._id); const control = await seasonFinanceControl(ctx, season._id);
    if (!control?.mappingInitialized || !control.orderReady || control.unmappedCount !== 0) throw new Error("Finish historical fee mapping before preparing shared custom fees.");
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (!event || event.seasonId !== season._id || event.archived || event.enrollmentState === "running" || event.enrollmentState === "failed") throw new Error("Event scope is archived or its enrollment is not complete.");
    }
    const now = Date.now(); let fee = args.feeDefinitionId ? await ctx.db.get(args.feeDefinitionId) : null; const before = fee ? JSON.stringify(fee) : null;
    if (fee && (fee.seasonId !== season._id || fee.kind !== "custom" || fee.state !== "active" || args.eventId && fee.eventId !== args.eventId)) throw new Error("Choose an active custom fee in the current season.");
    const prior = fee?.latestJobId ? await ctx.db.get(fee.latestJobId) : null;
    if (args.supersedeHeldJobId) {
      if (args.kind !== "cancel" || args.scope !== "existingCharges" || !prior || prior._id !== args.supersedeHeldJobId || prior.state !== "held" || prior.feeDefinitionId !== fee?._id || prior.held !== args.expectedHeldRows || !Number.isSafeInteger(args.expectedHeldRows) || !args.expectedHeldRows || !prior.snapshotComplete) throw new Error("Explicitly review the latest held operation and its never-posted rows before full cancellation.");
    } else if (args.expectedHeldRows !== undefined || fee?.latestJobId && prior?.state !== "complete" && prior?.state !== "cancelled") throw new Error("Finish or cancel the definition's existing prepared operation.");
    if (!fee) {
      const last = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", season._id)).order("desc").first();
      const id = await ctx.db.insert("feeDefinitions", { seasonId: season._id, kind: "custom", label: args.label!.trim(), eventId: args.eventId, defaultAmountCents: args.targetAmountCents, priority: (last?.priority ?? 0) + 1, revision: 0, state: "active", createdBy: actor._id, createdAt: now, updatedAt: now, originKey: `custom:${actor._id}:${args.idempotencyKey}`, originProof: "custom" });
      fee = await ctx.db.get(id);
    }
    if (!fee) throw new Error("Custom definition could not be prepared.");
    const jobId = await ctx.db.insert("feeBulkJobs", { seasonId: season._id, feeDefinitionId: fee._id, originalActorId: actor._id, actorId: actor._id, kind: args.kind, scope: args.scope, scopeEventId: args.eventId, targetAmountCents: args.targetAmountCents, definitionBeforeJson: before, state: "draining", phase: "drain", step: 0, cursor: null, processed: 0, committed: 0, held: 0, priorHeldJobId: args.supersedeHeldJobId, priorHeldRows: args.expectedHeldRows, supersededRows: 0, snapshotHash: await tokenHash(JSON.stringify([hash, fee._id])), snapshotCount: 0, snapshotComplete: false, expectedDefinitionRevision: fee.revision, idempotencyKey: args.idempotencyKey, operationHash: hash, reason: args.reason.trim(), createdAt: now, updatedAt: now });
    for (const studentId of args.studentIds ?? []) await ctx.db.insert("feeBulkRows", { jobId, studentId, targetAmountCents: args.targetAmountCents, state: "pending" });
    await ctx.db.patch(fee._id, { latestJobId: jobId, updatedAt: now });
    await ctx.db.patch(control._id, { state: "draining", bulkJobId: jobId, mappingJobId: undefined, priorityJobId: undefined, revision: control.revision + 1, updatedAt: now });
    await audit(ctx, actor, "feeBulkJobs", jobId, "prepareScope", null, { kind: args.kind, scope: args.scope, feeDefinitionId: fee._id, targetAmountCents: args.targetAmountCents }, args.reason.trim());
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feeBulkWorker:run"), { jobId }); return jobId;
  },
});

export const previewBulk = query({
  args: { jobId: v.id("feeBulkJobs") }, returns: v.object({ job: schema.doc("feeBulkJobs"), definition: schema.doc("feeDefinitions"), state: v.union(v.literal("ready"), v.literal("hold"), v.literal("updating")), message: v.union(v.string(), v.null()), expectedScopeHash: v.string(), expectedOrderRevision: v.number(), expectedDefinitionRevision: v.number(), scopeMemberCount: v.number(), canCommit: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    if (!job || job.seasonId !== season._id) throw new Error("Prepared fee scope is unavailable.");
    const definition = await ctx.db.get(job.feeDefinitionId); const control = await seasonFinanceControl(ctx, season._id);
    if (!definition || !control) throw new Error("Prepared fee scope lost its definition or season control.");
    const canCommit = job.state === "prepared" && job.snapshotComplete && (job.snapshotCount > 0 || (job.priorHeldRows ?? 0) > 0) && job.originalActorId === actor._id && definition.latestJobId === job._id && definition.revision === job.expectedDefinitionRevision && control.state === "ready";
    return { job, definition, state: canCommit ? "ready" as const : job.state === "draining" || job.state === "preparing" ? "updating" as const : "hold" as const, message: canCommit ? null : job.state === "prepared" && job.snapshotCount === 0 ? "This immutable scope contains no eligible rows." : "Scope preparation, authorization, or definition state requires review.", expectedScopeHash: job.snapshotHash, expectedOrderRevision: control.revision, expectedDefinitionRevision: definition.revision, scopeMemberCount: job.snapshotCount, canCommit };
  },
});

export const commitBulk = mutation({
  args: { jobId: v.id("feeBulkJobs"), expectedScopeHash: v.string(), expectedOrderRevision: v.number(), expectedDefinitionRevision: v.number(), reason: v.string() }, returns: v.id("feeBulkJobs"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    if (!job || job.seasonId !== season._id || job.originalActorId !== actor._id || args.expectedScopeHash !== job.snapshotHash || !job.snapshotComplete) throw new Error("Review your exact immutable prepared scope before committing.");
    if (job.state !== "prepared") { if (["draining", "applying", "held", "complete"].includes(job.state)) return job._id; throw new Error("Prepared fee command is not available to commit."); }
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Provide a confirmation reason of at least eight characters.");
    await requireSeasonFinanceReady(ctx, season._id); const control = await seasonFinanceControl(ctx, season._id); const definition = await ctx.db.get(job.feeDefinitionId);
    if ((!job.snapshotCount && !job.priorHeldRows) || !control || control.revision !== args.expectedOrderRevision || !definition || definition.latestJobId !== job._id || definition.revision !== args.expectedDefinitionRevision || definition.revision !== job.expectedDefinitionRevision) throw new Error("Shared fee order or definition changed; review the prepared scope again.");
    await ctx.db.patch(job._id, { state: "draining", phase: "drain", actorId: actor._id, reviewOrderRevision: control.revision, processed: job.held, step: job.step + 1, cursor: null, updatedAt: Date.now() });
    await ctx.db.patch(control._id, { state: "draining", bulkJobId: job._id, mappingJobId: undefined, priorityJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() });
    await audit(ctx, actor, "feeBulkJobs", job._id, "commitPreparedScope", { snapshotHash: job.snapshotHash, count: job.snapshotCount }, { snapshotHash: job.snapshotHash, count: job.snapshotCount }, args.reason.trim());
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feeBulkWorker:run"), { jobId: job._id }); return job._id;
  },
});

export const cancelPrepared = mutation({
  args: { jobId: v.id("feeBulkJobs"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    if (!job || job.seasonId !== season._id || !(job.state === "prepared" || job.state === "failed" && !job.snapshotComplete) || job.committed !== 0 || job.processed !== 0 || args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Only an untouched prepared scope may be cancelled with a review reason.");
    const control = await seasonFinanceControl(ctx, season._id);
    if (control && control.state !== "ready" && !(control.state === "failed" && control.bulkJobId === job._id && !job.snapshotComplete)) throw new Error("Another season maintenance operation blocks cancelling this preparation.");
    const waiting = await ctx.db.query("feeBulkRows").withIndex("by_jobId_and_state", q => q.eq("jobId", job._id).eq("state", "waiting")).first();
    if (waiting) throw new Error("A money child exists; preparation cannot be abandoned.");
    const definition = await ctx.db.get(job.feeDefinitionId);
    if (!definition || definition.latestJobId !== job._id) throw new Error("Prepared definition changed.");
    await ctx.db.patch(job._id, { state: "cancelled", updatedAt: Date.now() });
    await ctx.db.patch(definition._id, { latestJobId: job.priorHeldJobId, state: job.kind === "create" ? "cancelled" : definition.state, revision: job.priorHeldJobId ? definition.revision : definition.revision + 1, updatedAt: Date.now() });
    if (control?.bulkJobId === job._id) await ctx.db.patch(control._id, { state: "ready", bulkJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() });
    await audit(ctx, actor, "feeBulkJobs", job._id, "cancelPreparedScope", { state: job.state, count: job.snapshotCount }, { state: "cancelled", monetaryWrites: 0 }, args.reason.trim()); return null;
  },
});

export const bulkStatus = query({
  args: { jobId: v.id("feeBulkJobs") }, returns: v.object({ job: schema.doc("feeBulkJobs"), originalActorName: v.string(), processingActorName: v.string(), canCommit: v.boolean(), canRetry: v.boolean(), canCancel: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Fee operation viewing is not enabled.");
    const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId); if (!job || job.seasonId !== season._id) throw new Error("Shared fee operation is unavailable.");
    const original = await ctx.db.get(job.originalActorId); const processor = await ctx.db.get(job.actorId); const coach = actor.role === "coach";
    const control = await seasonFinanceControl(ctx, season._id); const definition = await ctx.db.get(job.feeDefinitionId);
    const available = (!control || control.state === "ready") && definition?.latestJobId === job._id;
    return { job, originalActorName: original?.name ?? "Archived account", processingActorName: processor?.name ?? "Archived account", canCommit: coach && available && job.state === "prepared" && job.originalActorId === actor._id && (job.snapshotCount > 0 || (job.priorHeldRows ?? 0) > 0), canRetry: coach && (available || control?.bulkJobId === job._id) && ["held", "failed"].includes(job.state), canCancel: coach && (available || control?.bulkJobId === job._id && control.state === "failed") && (job.state === "prepared" || job.state === "failed" && !job.snapshotComplete) && job.processed === 0 && job.committed === 0 };
  },
});

export const priorHeldRows = query({
  args: { jobId: v.id("feeBulkJobs"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("feeBulkRows").extend({ name: v.string() })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    if (!job || job.seasonId !== season._id || !job.priorHeldJobId) throw new Error("No prior unposted scope belongs to this full cancellation.");
    const opts = args.paginationOpts;
    if (!Number.isSafeInteger(opts.numItems) || opts.numItems < 1 || opts.numItems > 20 || opts.maximumRowsRead !== undefined && (!Number.isSafeInteger(opts.maximumRowsRead) || opts.maximumRowsRead < 1)) throw new Error("Request between 1 and 20 rows with a valid budget.");
    const state = job.state === "complete" ? "superseded" as const : "held" as const;
    const result = await ctx.db.query("feeBulkRows").withIndex("by_jobId_and_state", q => q.eq("jobId", job.priorHeldJobId!).eq("state", state)).paginate({ ...opts, maximumRowsRead: Math.min(opts.maximumRowsRead ?? 21, 21) });
    if (result.page.length > 20) throw new Error("Prior unposted scope page exceeded its supported size.");
    const page = await Promise.all(result.page.map(async row => { const student = await ctx.db.get(row.studentId); return { ...row, name: student?.preferredName || student?.legalName || "Archived student" }; })); return { ...result, page };
  },
});

const rowValidator = schema.doc("feeBulkRows").extend({ name: v.string(), currentFinancialRevision: v.union(v.number(), v.null()), currentChargeRevision: v.union(v.number(), v.null()), currentGeneration: v.union(v.number(), v.null()), currentEffectiveCents: v.union(v.number(), v.null()), currentAppliedCents: v.union(v.number(), v.null()), releaseRequiredCents: v.union(v.number(), v.null()), childState: v.union(v.literal("running"), v.literal("failed"), v.literal("complete"), v.null()), committedReleaseCents: v.number(), totalReleaseCents: v.number(), childError: v.union(v.string(), v.null()), canRetryChild: v.boolean(), financialState: v.union(v.literal("ready"), v.literal("updating"), v.literal("uninitialized"), v.literal("failed")) });
export const bulkRows = query({
  args: { jobId: v.id("feeBulkJobs"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    if (!job || job.seasonId !== season._id) throw new Error("Shared fee rows are unavailable.");
    const opts = args.paginationOpts;
    if (!Number.isSafeInteger(opts.numItems) || opts.numItems < 1 || opts.numItems > 20 || opts.maximumRowsRead !== undefined && (!Number.isSafeInteger(opts.maximumRowsRead) || opts.maximumRowsRead < 1)) throw new Error("Request between 1 and 20 rows with a valid budget.");
    const result = await ctx.db.query("feeBulkRows").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ ...opts, maximumRowsRead: Math.min(opts.maximumRowsRead ?? 21, 21) });
    if (result.page.length > 20) throw new Error("Fee row page exceeded its supported size.");
    const page = await Promise.all(result.page.map(async row => {
      const student = await ctx.db.get(row.studentId); const charge = row.chargeId ? await ctx.db.get(row.chargeId) : null; const account = await financialAccount(ctx, row.studentId);
      const child = row.correctionJobId ? await ctx.db.get(row.correctionJobId) : row.allocationJobId ? await ctx.db.get(row.allocationJobId) : null;
      const event = charge?.eventId ? await ctx.db.get(charge.eventId) : null;
      return { ...row, name: student?.preferredName || student?.legalName || "Archived student", childState: child?.state ?? null, committedReleaseCents: child && "committedCents" in child ? child.committedCents : 0, totalReleaseCents: child && "releaseRequiredCents" in child ? child.releaseRequiredCents ?? 0 : 0, childError: child?.lastError ?? null, canRetryChild: actor.role === "coach" && student?.active === true && !event?.archived && child?.state === "failed", currentFinancialRevision: account?.state === "ready" ? account.revision : null, currentGeneration: account?.state === "ready" ? account.generation : null, currentChargeRevision: charge ? charge.revision ?? 0 : null, currentEffectiveCents: charge ? effectiveChargeCents(charge) : null, currentAppliedCents: charge?.appliedCents ?? null, releaseRequiredCents: charge ? Math.max(0, charge.appliedCents - row.targetAmountCents) : 0, financialState: !account || account.state === "uninitialized" ? "uninitialized" as const : account.state === "ready" ? "ready" as const : account.state === "failed" ? "failed" as const : "updating" as const };
    })); return { ...result, page };
  },
});

export const bulkJobs = query({
  args: { feeDefinitionId: v.id("feeDefinitions"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("feeBulkJobs")),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Fee operation viewing is not enabled.");
    const season = await activeSeason(ctx); const fee = await ctx.db.get(args.feeDefinitionId);
    if (!fee || fee.seasonId !== season._id) throw new Error("Shared fee history is unavailable.");
    const opts = args.paginationOpts;
    if (!Number.isSafeInteger(opts.numItems) || opts.numItems < 1 || opts.numItems > 20 || opts.maximumRowsRead !== undefined && (!Number.isSafeInteger(opts.maximumRowsRead) || opts.maximumRowsRead < 1)) throw new Error("Request between 1 and 20 operations with a valid budget.");
    const result = await ctx.db.query("feeBulkJobs").withIndex("by_feeDefinitionId", q => q.eq("feeDefinitionId", fee._id)).order("desc").paginate({ ...opts, maximumRowsRead: Math.min(opts.maximumRowsRead ?? 21, 21) });
    if (result.page.length > 20) throw new Error("Fee history page exceeded its supported size."); return result;
  },
});

export const retryBulk = mutation({
  args: { jobId: v.id("feeBulkJobs"), rows: v.array(v.object({ rowId: v.id("feeBulkRows"), expectedFinancialRevision: v.number(), expectedGeneration: v.number(), expectedChargeRevision: v.union(v.number(), v.null()) })), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId);
    if (!job || job.seasonId !== season._id || !["held", "failed"].includes(job.state) || args.rows.length > 20 || new Set(args.rows.map(row => row.rowId)).size !== args.rows.length || args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Choose a held or failed fee operation with reviewed rows and a reason.");
    const definition = await ctx.db.get(job.feeDefinitionId); const control = await seasonFinanceControl(ctx, season._id);
    if (!definition || definition.latestJobId !== job._id || definition.revision !== job.expectedDefinitionRevision || !control || control.state !== "ready" && control.bulkJobId !== job._id) throw new Error("Another season operation or definition change blocks this retry.");
    const waiting = await ctx.db.query("feeBulkRows").withIndex("by_jobId_and_state", q => q.eq("jobId", job._id).eq("state", "waiting")).first();
    if (waiting) {
      const account = await financialAccount(ctx, waiting.studentId);
      if (account?.state !== "ready") throw new Error("Finish or retry the existing row money child before resuming this operation.");
    }
    if (job.state === "held" && !args.rows.length) throw new Error("Explicitly review at least one held row before retrying.");
    if (args.rows.length && !job.snapshotComplete) throw new Error("Finish or cancel zero-money scope preparation before refreshing held posting rows.");
    for (const input of args.rows) {
      const row = await ctx.db.get(input.rowId); const account = row ? await financialAccount(ctx, row.studentId) : null; const charge = row?.chargeId ? await ctx.db.get(row.chargeId) : null;
      if (!row || row.jobId !== job._id || row.state !== "held" || row.correctionJobId || row.allocationJobId || !account || account.state !== "ready" || account.revision !== input.expectedFinancialRevision || account.generation !== input.expectedGeneration || (charge ? charge.revision ?? 0 : null) !== input.expectedChargeRevision) throw new Error("Held row or financial evidence changed; refresh its explicit review.");
      const fence = await ctx.db.query("feeBulkStudentFences").withIndex("by_jobId_and_studentId", q => q.eq("jobId", job._id).eq("studentId", row.studentId)).unique();
      if (fence) await ctx.db.patch(fence._id, { generation: account.generation, expectedFinancialRevision: account.revision });
      else await ctx.db.insert("feeBulkStudentFences", { jobId: job._id, studentId: row.studentId, generation: account.generation, expectedFinancialRevision: account.revision });
      await ctx.db.patch(row._id, { state: "pending", expectedGeneration: account.generation, expectedFinancialRevision: account.revision, expectedChargeRevision: input.expectedChargeRevision ?? undefined, message: undefined });
    }
    const phase = job.state === "held" || args.rows.length > 0 ? "drain" as const : job.phase;
    await ctx.db.patch(job._id, { actorId: actor._id, state: phase === "drain" ? "draining" : job.snapshotComplete ? "applying" : "preparing", phase, held: job.held - args.rows.length, processed: Math.max(0, job.processed - args.rows.length), step: job.step + 1, lastError: undefined, updatedAt: Date.now() });
    await ctx.db.patch(control._id, { state: phase === "drain" ? "draining" : "applying", bulkJobId: job._id, revision: control.revision + 1, updatedAt: Date.now() });
    await audit(ctx, actor, "feeBulkJobs", job._id, "retryFrozenScope", { actorId: job.actorId, state: job.state, snapshotHash: job.snapshotHash }, { actorId: actor._id, rows: args.rows, snapshotHash: job.snapshotHash }, args.reason.trim());
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("feeBulkWorker:run"), { jobId: job._id }); return null;
  },
});
