import { savedPublicError, publicErrorResult } from './lib/publicErrors';
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { audit, requireRole, viewer } from "./lib/access";

const runRef = makeFunctionReference<"mutation">("familyLinkSeasonMigration:runStep");
const pageRef = makeFunctionReference<"mutation">("familyLinkSeasonMigration:processPage");
const phase = v.union(v.literal("backfill"), v.literal("verify"));
const expected = { generation: v.number(), phase, cursor: v.union(v.string(), v.null()) };

async function current(ctx: Parameters<typeof viewer>[0]) {
  return ctx.db.query("familyLinkSeasonBackfill").withIndex("by_key", q => q.eq("key", "team")).unique();
}

export const status = query({
  args: {},
  returns: v.union(v.null(), v.object({
    state: v.union(v.literal("pending"), v.literal("running"), v.literal("failed"), v.literal("complete")),
    phase, scanned: v.number(), unresolved: v.number(), updatedAt: v.number(), lastError: v.union(v.string(), v.null()),
  })),
  handler: async ctx => {
    requireRole(await viewer(ctx), "coach");
    const job = await current(ctx);
    return publicErrorResult(job ? { state: job.state, phase: job.phase, scanned: job.scanned, unresolved: job.unresolved, updatedAt: job.updatedAt, lastError: job.lastError ?? null } : null);
  },
});

/** Existing access remains live until this reaches complete after the second verification pass. */
export const start = mutation({
  args: {}, returns: v.id("familyLinkSeasonBackfill"),
  handler: async ctx => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const previous = await current(ctx);
    if (previous?.state === "running" || previous?.state === "complete") return previous._id;
    if (previous?.state === "failed") throw new ConvexError("Family link maintenance stopped. Review its status, then try again with a reason.");
    const generation = (previous?.generation ?? 0) + 1;
    const now = Date.now();
    const id = previous ? previous._id : await ctx.db.insert("familyLinkSeasonBackfill", {
      key: "team", state: "running", phase: "backfill", cursor: null, scanned: 0, unresolved: 0,
      generation, startedBy: actor._id, updatedAt: now,
    });
    if (previous) await ctx.db.patch(id, { state: "running", phase: "backfill", cursor: null, scanned: 0, unresolved: 0, generation, startedBy: actor._id, updatedAt: now, lastError: undefined });
    await audit(ctx, actor, "familyLinkSeasonBackfill", id, "start", previous?.state ?? null, "running");
    await ctx.scheduler.runAfter(0, runRef, { generation, phase: "backfill", cursor: null });
    return id;
  },
});

export const retry = mutation({
  args: { reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const reason = args.reason.trim();
    if (reason.length < 8 || reason.length > 500) throw new ConvexError("Enter a reason of 8 to 500 characters.");
    const job = await current(ctx);
    if (!job || job.state !== "failed") throw new ConvexError("Family link maintenance has not stopped, so there is nothing to restart. Reload to see its status.");
    const generation = job.generation + 1;
    await ctx.db.patch(job._id, { state: "running", generation, startedBy: actor._id, unresolved: 0, lastError: undefined, updatedAt: Date.now() });
    await audit(ctx, actor, "familyLinkSeasonBackfill", job._id, "retry", { state: "failed", phase: job.phase, cursor: job.cursor, error: job.lastError }, { state: "running", generation }, reason);
    await ctx.scheduler.runAfter(0, runRef, { generation, phase: job.phase, cursor: job.cursor });
    return null;
  },
});

/** Catch a page failure after its nested transaction rolls back, preserving an exact retry cursor. */
export const runStep = internalMutation({
  args: expected, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await current(ctx);
    if (!job || job.state !== "running" || job.generation !== args.generation || job.phase !== args.phase || job.cursor !== args.cursor) return null;
    try { await ctx.runMutation(pageRef, args); }
    catch (error) {
      const fresh = await current(ctx);
      if (fresh?.state === "running" && fresh.generation === args.generation && fresh.phase === args.phase && fresh.cursor === args.cursor) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "Family link backfill failed; Coach review is required.";
        await ctx.db.patch(fresh._id, { state: "failed", unresolved: message.includes("Family link ") ? 1 : 0, lastError: savedPublicError(error, "Family link maintenance stopped because some links need review. Check the links, then try again with a reason."), updatedAt: Date.now() });
      }
    }
    return null;
  },
});

export const processPage = internalMutation({
  args: expected, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await current(ctx);
    if (!job || job.state !== "running" || job.generation !== args.generation || job.phase !== args.phase || job.cursor !== args.cursor) return null;
    const actor = await ctx.db.get(job.startedBy);
    if (!actor?.active || actor.role !== "coach") throw new ConvexError("The Coach who started this maintenance no longer has Coach access. Another Coach must try again with a reason.");
    const page = await ctx.db.query("familyLinks").order("asc").paginate({ numItems: 40, cursor: job.cursor });
    for (const link of page.page) {
      const student = await ctx.db.get(link.studentId);
      if (!student) throw new Error(`Family link ${link._id} has no student record; Coach reconciliation is required.`);
      if (link.seasonId && link.seasonId !== student.seasonId) throw new Error(`Family link ${link._id} disagrees with its student season; Coach reconciliation is required.`);
      if (!link.seasonId) {
        if (job.phase === "verify") throw new Error(`Family link ${link._id} has no season after backfill; Coach reconciliation is required.`);
        await ctx.db.patch(link._id, { seasonId: student.seasonId });
      }
    }
    const nextPhase = job.phase === "backfill" && page.isDone ? "verify" : job.phase;
    const done = job.phase === "verify" && page.isDone;
    const cursor = page.isDone ? null : page.continueCursor;
    await ctx.db.patch(job._id, { state: done ? "complete" : "running", phase: nextPhase, cursor, scanned: job.scanned + page.page.length, unresolved: 0, lastError: undefined, updatedAt: Date.now() });
    if (done) {
      await audit(ctx, actor, "familyLinkSeasonBackfill", job._id, "complete", "running", { verified: true, scanned: job.scanned + page.page.length });
    } else await ctx.scheduler.runAfter(0, runRef, { generation: job.generation, phase: nextPhase, cursor });
    return null;
  },
});
