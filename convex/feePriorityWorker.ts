import { savedPublicError } from './lib/publicErrors';
import { recordChargeRevisionChange, recordPriorityJobChange } from "./lib/financeChanges";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { seasonFinancialDrain, seasonFinanceControl } from "./lib/seasonFinance";
import { readyFinancialAccountForFeeJob, recordChargeChange } from "./lib/financialSources";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { allocateUnapplied } from "./lib/money";
const runRef = makeFunctionReference<"mutation">("feePriorityWorker:run");
const stepRef = makeFunctionReference<"mutation">("feePriorityWorker:processPage");

export const processPage = internalMutation({
  args: { jobId: v.id("feePriorityJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !["draining", "applying"].includes(job.state) || job.step !== args.step) return null;
    const actor = await ctx.db.get(job.actorId); const season = await ctx.db.get(job.seasonId);
    const control = await seasonFinanceControl(ctx, job.seasonId);
    if (!actor?.active || actor.role !== "coach" || season?.status !== "active" || control?.priorityJobId !== job._id) throw new Error("Shared fee maintenance authority or season changed.");
    const first = await ctx.db.get(job.firstFeeId); const second = await ctx.db.get(job.secondFeeId);
    if (!first || !second || first.seasonId !== job.seasonId || second.seasonId !== job.seasonId) throw new Error("Shared fee definitions are unavailable.");
    if (job.phase === "drain") {
      const drain = await seasonFinancialDrain(ctx, job.seasonId);
      if (drain.blocked) throw new Error(drain.message ?? "Resolve existing financial work before maintenance.");
      if (!drain.ready) { await ctx.scheduler.runAfter(1000, runRef, { jobId: job._id }); return null; }
      if (first.revision !== job.firstRevision || second.revision !== job.secondRevision || first.priority !== job.firstPriority || second.priority !== job.secondPriority) throw new Error("Fee order changed before maintenance acquired its lock.");
      await ctx.db.patch(first._id, { priority: job.secondPriority, revision: first.revision + 1, updatedAt: Date.now() });
      await ctx.db.patch(second._id, { priority: job.firstPriority, revision: second.revision + 1, updatedAt: Date.now() });
      await ctx.db.patch(control._id, { state: "applying", updatedAt: Date.now() });
      await ctx.db.patch(job._id, { state: "applying", phase: "firstFee", step: job.step + 1, updatedAt: Date.now() });
    } else if (job.phase === "firstFee" || job.phase === "secondFee") {
      const fee = job.phase === "firstFee" ? first : second;
      const target = job.phase === "firstFee" ? job.secondPriority : job.firstPriority;
      const page = await ctx.db.query("charges").withIndex("by_feeDefinitionId", q => q.eq("feeDefinitionId", fee._id)).paginate({ cursor: job.cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Fee propagation page exceeded its supported size.");
      for (const charge of page.page) {
        if (charge.priority === target) continue;
        const student = await ctx.db.get(charge.studentId);
        if (!student || student.seasonId !== job.seasonId) throw new Error("Linked fee charge belongs to another season.");
        const account = await readyFinancialAccountForFeeJob(ctx, charge.studentId, job);
        const effective = effectiveChargeCents(charge); const beforePriority = charge.priority;
        await ctx.db.patch(charge._id, { priority: target }); charge.priority = target;
        await recordChargeChange(ctx, account, charge, effective, charge.appliedCents);
        const changeRevisionId = await ctx.db.insert("chargeRevisions", { chargeId: charge._id, studentId: charge.studentId, seasonId: job.seasonId, kind: "priority", beforeAdjustedCents: charge.adjustedCents ?? 0, afterAdjustedCents: charge.adjustedCents ?? 0, beforeCancelledCents: charge.cancelledCents ?? 0, afterCancelledCents: charge.cancelledCents ?? 0, beforeEffectiveCents: effective, afterEffectiveCents: effective, beforeAppliedCents: charge.appliedCents, afterAppliedCents: charge.appliedCents, beforePriority, afterPriority: target, releasedCents: 0, createdBy: job.originalActorId, processedBy: actor._id, recordedAt: Date.now(), reason: job.reason, idempotencyKey: `priority:${job._id}:${charge._id}`, operationHash: job.operationHash });
        const changeRevision = await ctx.db.get(changeRevisionId);
        if (!changeRevision) throw new Error("Charge change evidence is unavailable.");
        await recordChargeRevisionChange(ctx, changeRevision);
        await refreshStudentFinance(ctx, charge.studentId);
      }
      await ctx.db.patch(job._id, { cursor: page.isDone ? null : page.continueCursor, phase: page.isDone ? job.phase === "firstFee" ? "secondFee" : "verify" : job.phase, processed: job.processed + page.page.length, step: job.step + 1, updatedAt: Date.now() });
    } else if (job.phase === "verify") {
      if (first.priority !== job.secondPriority || second.priority !== job.firstPriority || first.revision !== job.firstRevision + 1 || second.revision !== job.secondRevision + 1) throw new Error("Locked fee definitions changed during propagation.");
      await ctx.db.patch(job._id, { phase: "allocateFirst", cursor: null, step: job.step + 1, updatedAt: Date.now() });
    } else {
      const fee = job.phase === "allocateFirst" ? first : second;
      const page = await ctx.db.query("charges").withIndex("by_feeDefinitionId", q => q.eq("feeDefinitionId", fee._id)).paginate({ cursor: job.cursor, numItems: 1, maximumRowsRead: 2 });
      if (page.page.length > 1) throw new Error("Fee allocation page exceeded its supported size.");
      for (const charge of page.page) {
        const student = await ctx.db.get(charge.studentId);
        if (student?.active) {
          const account = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
          if (account?.state === "ready") await allocateUnapplied(ctx, actor, student._id, `priority:${job._id}:${student._id}`, undefined, job._id);
          else if (account?.state !== "allocating") throw new Error("Student financial preparation changed during fee allocation.");
        }
      }
      const done = page.isDone && job.phase === "allocateSecond";
      await ctx.db.patch(job._id, { cursor: page.isDone ? null : page.continueCursor, phase: page.isDone && !done ? "allocateSecond" : job.phase, state: done ? "complete" : "applying", step: job.step + 1, updatedAt: Date.now() });
      if (done) {
        const completedJob = await ctx.db.get(job._id); if (!completedJob) throw new Error("Fee order receipt is unavailable.");
        await recordPriorityJobChange(ctx, completedJob);
      }
      if (done) await ctx.db.patch(control._id, { state: "ready", priorityJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() });
    }
    const current = await ctx.db.get(job._id);
    if (current?.state !== "complete") await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    return null;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("feePriorityJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId); if (!job || !["draining", "applying"].includes(job.state)) return null;
    try { await ctx.runMutation(stepRef, { jobId: job._id, step: job.step }); }
    catch (error) {
      await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "Fee priority maintenance failed."), updatedAt: Date.now() });
      const control = await seasonFinanceControl(ctx, job.seasonId);
      if (control?.priorityJobId === job._id) await ctx.db.patch(control._id, { state: "failed", updatedAt: Date.now() });
    }
    return null;
  },
});
