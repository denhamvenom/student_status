import { savedPublicError } from './lib/publicErrors';
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, mutation } from "./_generated/server";
import { activeSeason, requireRole, viewer } from "./lib/access";
import { recordLedgerChange, recordFundraiserChange, recordChargeRevisionChange, recordOperationChange, recordPriorityJobChange } from "./lib/financeChanges";
const runRef = makeFunctionReference<"mutation">("financeChangeBackfill:run");
const pageRef = makeFunctionReference<"mutation">("financeChangeBackfill:processPage");

/** Historical coverage is separate from live feed emission; it never rewrites money or receipts. */
export const start = mutation({
  args: {}, returns: v.id("financeChangeBackfills"),
  handler: async ctx => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); const season = await activeSeason(ctx);
    const previous = await ctx.db.query("financeChangeBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    if (previous?.state === "running" || previous?.state === "complete") return previous._id;
    const now = Date.now();
    const id = previous ? previous._id : await ctx.db.insert("financeChangeBackfills", { seasonId: season._id, actorId: actor._id, state: "running", phase: "ledger", cursor: null, processed: 0, startedAt: now, updatedAt: now });
    if (previous) await ctx.db.patch(id, { actorId: actor._id, state: "running", lastError: undefined, updatedAt: now });
    await ctx.scheduler.runAfter(0, runRef, { id }); return id;
  },
});
export const run = internalMutation({
  args: { id: v.id("financeChangeBackfills") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id); if (!job || job.state !== "running") return null;
    try { await ctx.runMutation(pageRef, { id: job._id, phase: job.phase, cursor: job.cursor }); }
    catch (error) { await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "Finance change preparation failed."), updatedAt: Date.now() }); }
    return null;
  },
});
export const processPage = internalMutation({
  args: { id: v.id("financeChangeBackfills"), phase: v.union(v.literal("ledger"), v.literal("fundraisers"), v.literal("revisions"), v.literal("operations"), v.literal("priorities")), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id); if (!job || job.state !== "running" || job.phase !== args.phase || job.cursor !== args.cursor) return null;
    const actor = await ctx.db.get(job.actorId);
    if (!actor?.active || actor.role !== "coach" || (await activeSeason(ctx))._id !== job.seasonId) throw new Error("Finance change preparation authorization changed.");
    let done: boolean; let cursor: string; let count: number;
    const opts = { numItems: 20, maximumRowsRead: 21, cursor: job.cursor };
    if (job.phase === "ledger") {
      const page = await ctx.db.query("ledgerEntries").paginate(opts); if (page.page.length > 20) throw new Error("Finance change page exceeded its budget.");
      for (const entry of page.page) { const student = await ctx.db.get(entry.studentId); if (student?.seasonId === job.seasonId) await recordLedgerChange(ctx, entry, job.seasonId, true); }
      done = page.isDone; cursor = page.continueCursor; count = page.page.length;
    } else if (job.phase === "fundraisers") {
      const page = await ctx.db.query("fundraiserAmountRevisions").paginate(opts); if (page.page.length > 20) throw new Error("Finance change page exceeded its budget.");
      for (const revision of page.page) {
        if (revision.seasonId !== job.seasonId) continue;
        const row = await ctx.db.get(revision.rowId);
        // A planned or partially posted target is not evidence of committed Gross Raised.
        if (row?.state === "committed" && row.revisionId === revision._id) await recordFundraiserChange(ctx, revision, true);
      }
      done = page.isDone; cursor = page.continueCursor; count = page.page.length;
    } else if (job.phase === "revisions") {
      const page = await ctx.db.query("chargeRevisions").paginate(opts); if (page.page.length > 20) throw new Error("Finance change page exceeded its budget.");
      for (const revision of page.page) if (revision.seasonId === job.seasonId) await recordChargeRevisionChange(ctx, revision, true);
      done = page.isDone; cursor = page.continueCursor; count = page.page.length;
    } else if (job.phase === "operations") {
      const page = await ctx.db.query("financeOperations").paginate(opts); if (page.page.length > 20) throw new Error("Finance change page exceeded its budget.");
      for (const operation of page.page) { const student = await ctx.db.get(operation.studentId); if (student?.seasonId === job.seasonId) await recordOperationChange(ctx, operation, job.seasonId, true); }
      done = page.isDone; cursor = page.continueCursor; count = page.page.length;
    } else {
      const page = await ctx.db.query("feePriorityJobs").paginate(opts); if (page.page.length > 20) throw new Error("Finance change page exceeded its budget.");
      for (const priority of page.page) if (priority.seasonId === job.seasonId) await recordPriorityJobChange(ctx, priority, true);
      done = page.isDone; cursor = page.continueCursor; count = page.page.length;
    }
    const complete = done && job.phase === "priorities";
    const nextPhase = { ledger: "fundraisers", fundraisers: "revisions", revisions: "operations", operations: "priorities", priorities: "priorities" } as const;
    const phase = done ? nextPhase[job.phase] : job.phase;
    await ctx.db.patch(job._id, { phase, cursor: done ? null : cursor, processed: job.processed + count, state: complete ? "complete" : "running", updatedAt: Date.now(), completedAt: complete ? Date.now() : undefined });
    if (!complete) await ctx.scheduler.runAfter(0, runRef, { id: job._id }); return null;
  },
});
