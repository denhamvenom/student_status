import { savedPublicError } from './lib/publicErrors';
import { recordChargeRevisionChange } from "./lib/financeChanges";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { seasonFinanceControl, seasonFinancialDrain } from "./lib/seasonFinance";
import { provenMainFee } from "./lib/feeDefinitions";
import { readyFinancialAccountForFeeJob, recordChargeChange } from "./lib/financialSources";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { refreshStudentFinance } from "./lib/financeSummaries";
const runRef = makeFunctionReference<"mutation">("feeMappingWorker:run");
const pageRef = makeFunctionReference<"mutation">("feeMappingWorker:processPage");

export const processPage = internalMutation({
  args: { jobId: v.id("feeMappingJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !["draining", "applying"].includes(job.state) || job.step !== args.step) return null;
    const control = await seasonFinanceControl(ctx, job.seasonId); const actor = await ctx.db.get(job.actorId); const season = await ctx.db.get(job.seasonId);
    if (!control || control.mappingJobId !== job._id || !actor?.active || actor.role !== "coach" || season?.status !== "active") throw new Error("Fee mapping authority or season changed.");
    let phase = job.phase; let cursor = job.cursor; let processed = job.processed; let mapped = job.mapped; let unmapped = job.unmapped; let nextRank = job.nextRank;
    if (phase === "drain") {
      const drain = await seasonFinancialDrain(ctx, job.seasonId);
      if (drain.blocked) throw new Error(drain.message ?? "Existing financial work needs resolution.");
      if (!drain.ready) { await ctx.scheduler.runAfter(1000, runRef, { jobId: job._id }); return null; }
      phase = job.mode === "prove" ? "events" : "review";
      await ctx.db.patch(control._id, { state: "applying", updatedAt: Date.now() });
    } else if (phase === "events") {
      const page = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", job.seasonId)).paginate({ cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Event fee mapping exceeded its page budget.");
      for (const event of page.page) {
        if (event.feeCents <= 0) continue;
        const originKey = `event:${event._id}:main`;
        const existing = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_originKey", q => q.eq("seasonId", job.seasonId).eq("originKey", originKey)).unique();
        if (!existing) await ctx.db.insert("feeDefinitions", { seasonId: job.seasonId, kind: "eventMain", label: event.name, eventId: event._id, defaultAmountCents: event.feeCents, priority: event.startsAt, revision: 0, state: "active", createdBy: job.originalActorId, createdAt: Date.now(), updatedAt: Date.now(), originKey, originProof: "eventMain" });
      }
      processed += page.page.length; cursor = page.isDone ? null : page.continueCursor; if (page.isDone) phase = "scan";
    } else if (phase === "scan") {
      const page = await ctx.db.query("charges").withIndex("by_feeDefinitionId", q => q.eq("feeDefinitionId", undefined)).paginate({ cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Historical fee mapping exceeded its page budget.");
      for (const charge of page.page) {
        const student = await ctx.db.get(charge.studentId); if (!student || student.seasonId !== job.seasonId) continue;
        const definition = await provenMainFee(ctx, charge);
        if (definition) { await ctx.db.patch(charge._id, { feeDefinitionId: definition._id }); mapped++; }
        else {
          const review = await ctx.db.query("feeUnmappedCharges").withIndex("by_chargeId", q => q.eq("chargeId", charge._id)).unique();
          if (!review) await ctx.db.insert("feeUnmappedCharges", { seasonId: job.seasonId, chargeId: charge._id, state: "unmapped", observedAt: Date.now() });
          else if (review.state !== "unmapped") throw new Error("Mapped historical fee lost its definition link.");
          unmapped++;
        }
      }
      processed += page.page.length; cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) {
        if (unmapped > 0) {
          await ctx.db.patch(control._id, { state: "ready", mappingInitialized: true, orderReady: false, unmappedCount: unmapped, mappingJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() });
          await ctx.db.patch(job._id, { state: "complete", step: job.step + 1, cursor: null, processed, mapped, unmapped, updatedAt: Date.now() });
          return null;
        }
        phase = "planRanks";
      }
    } else if (phase === "review") {
      if (!job.feeDefinitionId) throw new Error("Explicit mapping requires a selected shared definition.");
      const fee = await ctx.db.get(job.feeDefinitionId);
      if (!fee || fee.seasonId !== job.seasonId || fee.state !== "active") throw new Error("Selected fee definition is unavailable.");
      const page = await ctx.db.query("feeMappingRows").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Explicit mapping exceeded its page budget.");
      for (const row of page.page) {
        if (row.state === "mapped") continue;
        const charge = await ctx.db.get(row.chargeId); const review = await ctx.db.query("feeUnmappedCharges").withIndex("by_chargeId", q => q.eq("chargeId", row.chargeId)).unique();
        const student = charge ? await ctx.db.get(charge.studentId) : null;
        if (!charge || !student || student.seasonId !== job.seasonId || charge.feeDefinitionId || (charge.revision ?? 0) !== row.expectedChargeRevision || review?.state !== "unmapped" || charge.eventId !== fee.eventId) throw new Error("Historical fee changed; refresh the explicit mapping review.");
        await ctx.db.patch(charge._id, { feeDefinitionId: fee._id });
        await ctx.db.patch(review._id, { state: "mapped", mappedBy: job.originalActorId, mappedAt: Date.now(), feeDefinitionId: fee._id, reason: job.reason });
        await ctx.db.patch(row._id, { state: "mapped" }); mapped++; unmapped--;
      }
      processed += page.page.length; cursor = page.isDone ? null : page.continueCursor;
      if (unmapped < 0) throw new Error("Historical fee review count is inconsistent.");
      if (page.isDone) {
        if (unmapped > 0) {
          await ctx.db.patch(control._id, { state: "ready", unmappedCount: unmapped, mappingJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() });
          await ctx.db.patch(job._id, { state: "complete", step: job.step + 1, cursor: null, processed, mapped, unmapped, updatedAt: Date.now() }); return null;
        }
        phase = "planRanks";
      }
    } else if (phase === "planRanks") {
      const page = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", job.seasonId)).paginate({ cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Fee rank planning exceeded its page budget.");
      for (const fee of page.page) await ctx.db.patch(fee._id, { pendingPriority: nextRank++ });
      cursor = page.isDone ? null : page.continueCursor; if (page.isDone) phase = "applyRanks";
    } else if (phase === "applyRanks") {
      const page = await ctx.db.query("feeDefinitions").withIndex("by_seasonId", q => q.eq("seasonId", job.seasonId)).paginate({ cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Fee rank application exceeded its page budget.");
      for (const fee of page.page) {
        if (!Number.isSafeInteger(fee.pendingPriority) || !fee.pendingPriority || fee.pendingPriority < 1) throw new Error("Fee rank plan is missing.");
        await ctx.db.patch(fee._id, { priority: fee.pendingPriority, pendingPriority: undefined, revision: fee.revision + 1, updatedAt: Date.now() });
      }
      cursor = page.isDone ? null : page.continueCursor; if (page.isDone) phase = "propagate";
    } else if (phase === "propagate") {
      const page = await ctx.db.query("charges").paginate({ cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Fee charge propagation exceeded its page budget.");
      for (const charge of page.page) {
        const student = await ctx.db.get(charge.studentId); if (!student || student.seasonId !== job.seasonId) continue;
        const fee = charge.feeDefinitionId ? await ctx.db.get(charge.feeDefinitionId) : null;
        if (!fee || fee.seasonId !== job.seasonId) throw new Error("Unmapped fee appeared during locked propagation.");
        if (charge.priority === fee.priority) continue;
        const account = await readyFinancialAccountForFeeJob(ctx, charge.studentId, job); const effective = effectiveChargeCents(charge); const previousPriority = charge.priority;
        await ctx.db.patch(charge._id, { priority: fee.priority }); charge.priority = fee.priority;
        await recordChargeChange(ctx, account, charge, effective, charge.appliedCents);
        const changeRevisionId = await ctx.db.insert("chargeRevisions", { chargeId: charge._id, studentId: charge.studentId, seasonId: job.seasonId, kind: "priority", beforeAdjustedCents: charge.adjustedCents ?? 0, afterAdjustedCents: charge.adjustedCents ?? 0, beforeCancelledCents: charge.cancelledCents ?? 0, afterCancelledCents: charge.cancelledCents ?? 0, beforeEffectiveCents: effective, afterEffectiveCents: effective, beforeAppliedCents: charge.appliedCents, afterAppliedCents: charge.appliedCents, beforePriority: previousPriority, afterPriority: fee.priority, releasedCents: 0, createdBy: job.originalActorId, processedBy: actor._id, recordedAt: Date.now(), reason: job.reason, idempotencyKey: `mapping:${job._id}:${charge._id}`, operationHash: job.operationHash });
        const changeRevision = await ctx.db.get(changeRevisionId);
        if (!changeRevision) throw new Error("Charge change evidence is unavailable.");
        await recordChargeRevisionChange(ctx, changeRevision);
        await refreshStudentFinance(ctx, charge.studentId);
      }
      cursor = page.isDone ? null : page.continueCursor; if (page.isDone) phase = "verify";
    } else {
      await ctx.db.patch(control._id, { state: "ready", mappingInitialized: true, orderReady: true, unmappedCount: 0, mappingJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() });
      await ctx.db.patch(job._id, { state: "complete", step: job.step + 1, cursor: null, updatedAt: Date.now() }); return null;
    }
    await ctx.db.patch(job._id, { state: "applying", phase, cursor, processed, mapped, unmapped, nextRank, step: job.step + 1, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, runRef, { jobId: job._id }); return null;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("feeMappingJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId); if (!job || !["draining", "applying"].includes(job.state)) return null;
    try { await ctx.runMutation(pageRef, { jobId: job._id, step: job.step }); }
    catch (error) {
      await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "Fee mapping failed."), updatedAt: Date.now() });
      const control = await seasonFinanceControl(ctx, job.seasonId); if (control?.mappingJobId === job._id) await ctx.db.patch(control._id, { state: "failed", updatedAt: Date.now() });
    }
    return null;
  },
});
