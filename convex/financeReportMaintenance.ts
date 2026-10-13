import { seasonFinanceControl } from "./lib/seasonFinance";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { activeSeason, requireRole, viewer } from "./lib/access";
import { FINANCE_SUMMARY_VERSION, refreshStudentFinance } from "./lib/financeSummaries";
import type { Id } from "./_generated/dataModel";
import { startFinancialRebuild } from "./financialSources";
import { ensureFinancialAccount, financialAccount } from "./lib/financialSources";

const statusValidator = v.object({ state: v.union(v.literal("running"), v.literal("failed"), v.literal("complete")), processed: v.number(), updatedAt: v.number(), lastError: v.union(v.string(), v.null()) });

export const status = query({
  args: {}, returns: v.union(v.null(), statusValidator),
  handler: async ctx => {
    requireRole(await viewer(ctx), "coach");
    const season = await activeSeason(ctx);
    const row = await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    return row ? { state: row.state, processed: row.processed, updatedAt: row.updatedAt, lastError: row.lastError ?? null } : null;
  },
});

/** Start or resume current-season rebuild. A failed source row keeps its cursor for repair/retry. */
export const start = mutation({
  args: {}, returns: v.id("financeSummaryBackfills"),
  handler: async ctx => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const season = await activeSeason(ctx);
    const maintenance = await seasonFinanceControl(ctx, season._id);
    if (maintenance && maintenance.state !== "ready" && maintenance.state !== "failed") throw new Error("Wait for shared fee maintenance before rebuilding reports.");
    const previous = await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    if (previous?.state === "running") return previous._id;
    const resume = previous?.state === "failed";
    const cursor = resume ? previous.cursor : null;
    if (resume) {
      const page = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).paginate({ numItems: 5, cursor });
      for (const student of page.page) {
        const account = await financialAccount(ctx, student._id);
        if (account?.state === "failed") await startFinancialRebuild(ctx, student._id, actor._id);
      }
    }
    let backfillId: Id<"financeSummaryBackfills">;
    if (previous) {
      backfillId = previous._id;
      await ctx.db.patch(backfillId, { actorId: actor._id, state: "running", cursor, processed: resume ? previous.processed : 0, updatedAt: Date.now(), lastError: undefined });
    } else backfillId = await ctx.db.insert("financeSummaryBackfills", { actorId: actor._id, seasonId: season._id, state: "running", cursor: null, processed: 0, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.financeReportMaintenance.continueBackfill, { backfillId, expectedCursor: cursor });
    return backfillId;
  },
});

export const continueBackfill = internalMutation({
  args: { backfillId: v.id("financeSummaryBackfills"), expectedCursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const state = await ctx.db.get(args.backfillId);
    if (!state || state.state !== "running" || state.cursor !== args.expectedCursor) return null;
    let verifyingCoverage = false;
    try {
      const actor = state.actorId ? await ctx.db.get(state.actorId) : null;
      if (!actor?.active || actor.role !== "coach" || (await activeSeason(ctx))._id !== state.seasonId) throw new Error("Report rebuild authorization changed.");
      const page = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", state.seasonId)).paginate({ numItems: 5, cursor: state.cursor });
      let waiting = false;
      for (const student of page.page) {
        const account = await financialAccount(ctx, student._id);
        if (!account) {
          const entry = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", student._id)).first();
          const charge = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", student._id)).first();
          if (!entry && !charge) await ensureFinancialAccount(ctx, student._id);
          else { await startFinancialRebuild(ctx, student._id, actor._id); waiting = true; }
        }
        else if (account.state === "uninitialized") { await startFinancialRebuild(ctx, student._id, actor._id); waiting = true; }
        else if (account.state === "failed") throw new Error("Student financial processing failed.");
        else if (account.state !== "ready") waiting = true;
      }
      if (waiting) {
        await ctx.scheduler.runAfter(250, internal.financeReportMaintenance.continueBackfill, { backfillId: state._id, expectedCursor: state.cursor });
        return null;
      }
      for (const student of page.page) await refreshStudentFinance(ctx, student._id);
      if (page.isDone) {
        verifyingCoverage = true;
        const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", state.seasonId)).take(501);
        const summaries = await ctx.db.query("studentFinanceSummaries").withIndex("by_seasonId", q => q.eq("seasonId", state.seasonId)).take(501);
        if (students.length > 500 || summaries.length > 500) throw new Error("Report coverage exceeds the supported dashboard size.");
        const covered = new Set(summaries.filter(s => s.version === FINANCE_SUMMARY_VERSION).map(s => s.studentId));
        if (students.some(s => !covered.has(s._id)) || summaries.some(s => !students.some(student => student._id === s.studentId))) throw new Error("Report coverage changed during rebuild; restart from the beginning.");
        await ctx.db.patch(state._id, { state: "complete", cursor: null, processed: state.processed + page.page.length, updatedAt: Date.now(), lastError: undefined });
      } else {
        await ctx.db.patch(state._id, { cursor: page.continueCursor, processed: state.processed + page.page.length, updatedAt: Date.now() });
        await ctx.scheduler.runAfter(0, internal.financeReportMaintenance.continueBackfill, { backfillId: state._id, expectedCursor: page.continueCursor });
      }
    } catch {
      // Do not expose student details or financial history through maintenance errors.
      await ctx.db.patch(state._id, { state: "failed", ...(verifyingCoverage ? { cursor: null, processed: 0 } : {}), updatedAt: Date.now(), lastError: "Financial reports require source-data review before rebuilding can continue." });
    }
    return null;
  },
});
