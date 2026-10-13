import { requireSeasonTransitionFinancialAccess } from "./lib/seasonFinance";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { allocationStep } from "./lib/financialAllocation";
import { financialAccount, saveFinancialAccount, verifyAppliedSources } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { requireSeasonFinancialContinuation, requireSeasonFinancialRetry, seasonFinanceControl } from "./lib/seasonFinance";

const runRef = makeFunctionReference<"mutation">("financialAllocation:run");
const pageRef = makeFunctionReference<"mutation">("financialAllocation:processPage");

export const processPage = internalMutation({
  args: { jobId: v.id("financialAllocationJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running" || job.step !== args.step) return null;
    const account = await financialAccount(ctx, job.studentId); const actor = await ctx.db.get(job.actorId);
    if (!account || account.state !== "allocating" || account.allocationJobId !== job._id || account.generation !== job.generation) throw new Error("Allocation account changed; Coach review is required.");
    if (job.requiredFinancialProjectionVersion === 4 || account.allocationSourceVersion === 1) verifyAppliedSources(account);
    // Jobs are minted only inside validated server writes; allocation itself is deterministic.
    if (!actor?.active) throw new Error("Allocation actor is unavailable; a Coach must retry.");
    const student = await ctx.db.get(job.studentId); const season = await ctx.db.get(account.seasonId);
    const origin = job.maintenanceOriginId ? await ctx.db.get(job.maintenanceOriginId) : null;
    const transitionTarget = origin && "targetSeasonId" in origin && origin.open && origin.targetSeasonId === account.seasonId && (origin.state === "applying" || origin.state === "verifying");
    if (transitionTarget && job.maintenanceOriginId) await requireSeasonFinancialContinuation(ctx, account.seasonId, job.maintenanceOriginId);
    if (!student?.active || !season || season.status !== "active" && !(transitionTarget && season.status === "draft") || student.seasonId !== account.seasonId) throw new Error("Allocation student is unavailable in the active season.");
    await requireSeasonTransitionFinancialAccess(ctx, account.seasonId, true);
    const control = await seasonFinanceControl(ctx, account.seasonId);
    if (control && control.state !== "ready" && control.state !== "draining") {
      const maintenance = control.priorityJobId ? await ctx.db.get(control.priorityJobId) : control.mappingJobId ? await ctx.db.get(control.mappingJobId) : control.bulkJobId ? await ctx.db.get(control.bulkJobId) : null;
      if (maintenance?.phase !== "drain") {
        if (!job.maintenanceOriginId) throw new Error("Allocation is outside the active shared fee maintenance operation.");
        await requireSeasonFinancialContinuation(ctx, account.seasonId, job.maintenanceOriginId);
      }
    }
    const result = await allocationStep(ctx, actor, account, job);
    await ctx.db.patch(job._id, { step: job.step + 1, processed: job.processed + result.processed, chargeCursor: result.cursor, state: result.done ? "complete" : "running", updatedAt: Date.now() });
    if (result.done) { account.state = "ready"; account.allocationJobId = undefined; await saveFinancialAccount(ctx, account); }
    await refreshStudentFinance(ctx, account.studentId);
    if (!result.done) await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    return null;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("financialAllocationJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running") return null;
    try { await ctx.runMutation(pageRef, { jobId: job._id, step: job.step }); }
    catch (error) {
      await ctx.db.patch(job._id, { state: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Allocation failed; Coach review is required.", updatedAt: Date.now() });
      const account = await financialAccount(ctx, job.studentId);
      if (account?.allocationJobId === job._id && account.generation === job.generation) await ctx.db.patch(account._id, { state: "failed", lastError: "Allocation failed; a Coach must retry.", updatedAt: Date.now() });
    }
    return null;
  },
});

export const retry = mutation({
  args: { studentId: v.id("students"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach") throw new Error("Only a Coach may retry allocation.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Provide a reason of at least eight characters.");
    const season = await activeSeason(ctx); const student = await ctx.db.get(args.studentId);
    if (!student?.active || student.seasonId !== season._id) throw new Error("Allocation student is unavailable.");
    const account = await financialAccount(ctx, args.studentId);
    const job = account?.allocationJobId ? await ctx.db.get(account.allocationJobId) : null;
    if (!account || !job || account.state !== "failed" || job.state !== "failed" || job.generation !== account.generation) throw new Error("No failed allocation is available to retry.");
    await requireSeasonFinancialRetry(ctx, season._id, job._id);
    await ctx.db.patch(job._id, { actorId: actor._id, state: "running", lastError: undefined, updatedAt: Date.now() });
    await ctx.db.patch(account._id, { state: "allocating", lastError: undefined, updatedAt: Date.now() });
    await audit(ctx, actor, "financialAllocationJobs", job._id, "retry", { actorId: job.actorId, step: job.step }, { actorId: actor._id, step: job.step }, args.reason.trim());
    await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    return null;
  },
});
