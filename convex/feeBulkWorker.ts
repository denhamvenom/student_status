import { savedPublicError } from './lib/publicErrors';
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { seasonFinanceControl, seasonFinancialDrain } from "./lib/seasonFinance";
import { financialAccount } from "./lib/financialSources";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { tokenHash } from "./lib/invitationIdentity";
import { addCharges } from "./lib/money";
import { bulkTargetHold, startBulkChargeCorrection } from "./lib/feeBulkMoney";

const runRef = makeFunctionReference<"mutation">("feeBulkWorker:run");
const pageRef = makeFunctionReference<"mutation">("feeBulkWorker:processPage");

async function snapshotRow(ctx: MutationCtx, job: Doc<"feeBulkJobs">, studentId: Id<"students">, explicitCharge?: Doc<"charges">, existingRow?: Doc<"feeBulkRows">) {
  const student = await ctx.db.get(studentId); const account = await financialAccount(ctx, studentId);
  const matches = explicitCharge ? [explicitCharge] : await ctx.db.query("charges").withIndex("by_feeDefinitionId_and_studentId", q => q.eq("feeDefinitionId", job.feeDefinitionId).eq("studentId", studentId)).take(2);
  const charge = matches.length === 1 ? matches[0] : null;
  let message: string | undefined;
  if (!student || student.seasonId !== job.seasonId || !student.active) message = "This student is no longer active in this season.";
  else if (!account || account.state !== "ready" || job.requiredFinancialProjectionVersion === 4 && account.allocationSourceVersion !== 1) message = "This student's money records need to be rebuilt before this fee can be added.";
  else if (matches.length > 1) message = "This student has more than one matching earlier charge. Review them before changing this fee.";
  else if (job.kind !== "create" && !charge && job.scope === "existingCharges") message = "The student's original fee no longer exists.";
  else if (account) message = bulkTargetHold(account, charge, job.targetAmountCents, job.kind) ?? undefined;
  const fields = { chargeId: charge?._id, expectedChargeRevision: charge?.revision ?? (charge ? 0 : undefined), originalExpectedChargeRevision: charge?.revision ?? (charge ? 0 : undefined), expectedFinancialRevision: account?.revision, originalExpectedFinancialRevision: account?.revision, expectedGeneration: account?.generation, beforeEffectiveCents: charge ? effectiveChargeCents(charge) : 0, beforeAppliedCents: charge?.appliedCents ?? 0, state: message ? "held" as const : "pending" as const, message };
  const id = existingRow?._id ?? await ctx.db.insert("feeBulkRows", { jobId: job._id, studentId, targetAmountCents: job.targetAmountCents, ...fields });
  if (existingRow) await ctx.db.patch(id, fields);
  if (account?.state === "ready") {
    const fence = await ctx.db.query("feeBulkStudentFences").withIndex("by_jobId_and_studentId", q => q.eq("jobId", job._id).eq("studentId", studentId)).unique();
    if (!fence) await ctx.db.insert("feeBulkStudentFences", { jobId: job._id, studentId, generation: account.generation, expectedFinancialRevision: account.revision });
    else if (fence.generation !== account.generation || fence.expectedFinancialRevision !== account.revision) throw new Error("Financial scope changed while its preparation lock was held.");
  }
  return { fields, id, held: !!message };
}

export const processPage = internalMutation({
  args: { jobId: v.id("feeBulkJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !["draining", "preparing", "applying"].includes(job.state) || job.step !== args.step) return null;
    const control = await seasonFinanceControl(ctx, job.seasonId); const actor = await ctx.db.get(job.actorId); const season = await ctx.db.get(job.seasonId); const fee = await ctx.db.get(job.feeDefinitionId);
    if (!control || control.bulkJobId !== job._id || !actor?.active || actor.role !== "coach" || season?.status !== "active" || !fee || fee.latestJobId !== job._id || fee.revision !== job.expectedDefinitionRevision) throw new Error("Prepared fee authority, definition or season changed.");
    if (job.phase === "drain") {
      const drain = await seasonFinancialDrain(ctx, job.seasonId);
      if (drain.blocked) throw new Error(drain.message ?? "Existing financial work requires resolution.");
      if (!drain.ready) { await ctx.scheduler.runAfter(1000, runRef, { jobId: job._id }); return null; }
      await ctx.db.patch(control._id, { state: "applying", updatedAt: Date.now() });
      await ctx.db.patch(job._id, { state: job.snapshotComplete ? "applying" : "preparing", phase: job.snapshotComplete ? "apply" : "snapshot", cursor: null, step: job.step + 1, updatedAt: Date.now() });
    } else if (job.phase === "snapshot") {
      let done: boolean; let cursor: string | null; let count = job.snapshotCount; let held = job.held; let hash = job.snapshotHash;
      const seal = async (studentId: Id<"students">, charge?: Doc<"charges">, existing?: Doc<"feeBulkRows">) => {
        const result = await snapshotRow(ctx, job, studentId, charge, existing); count++; if (result.held) held++;
        hash = await tokenHash(JSON.stringify([hash, result.id, studentId, job.targetAmountCents, result.fields]));
      };
      if (job.scope === "selected") {
        const page = await ctx.db.query("feeBulkRows").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ cursor: job.cursor, numItems: 20, maximumRowsRead: 21 });
        if (page.page.length > 20) throw new Error("Selected scope exceeded its preparation budget.");
        for (const row of page.page) await seal(row.studentId, undefined, row);
        done = page.isDone; cursor = page.continueCursor;
      } else if (job.scope === "allActive") {
        const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", job.seasonId).eq("active", true)).paginate({ cursor: job.cursor, numItems: 20, maximumRowsRead: 21 });
        if (page.page.length > 20) throw new Error("Member scope exceeded its preparation budget.");
        for (const student of page.page) await seal(student._id);
        done = page.isDone; cursor = page.continueCursor;
      } else if (job.scope === "confirmedEvent") {
        if (!job.scopeEventId) throw new Error("Prepared event scope is missing.");
        const event = await ctx.db.get(job.scopeEventId);
        if (!event || event.archived || event.seasonId !== job.seasonId || event.enrollmentState === "running" || event.enrollmentState === "failed") throw new Error("Prepared event enrollment is unavailable.");
        const page = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", job.scopeEventId!)).paginate({ cursor: job.cursor, numItems: 20, maximumRowsRead: 21 });
        if (page.page.length > 20) throw new Error("Event scope exceeded its preparation budget.");
        for (const participant of page.page) if (participant.status === "confirmed") await seal(participant.studentId);
        done = page.isDone; cursor = page.continueCursor;
      } else {
        const page = await ctx.db.query("charges").withIndex("by_feeDefinitionId", q => q.eq("feeDefinitionId", fee._id)).paginate({ cursor: job.cursor, numItems: 20, maximumRowsRead: 21 });
        if (page.page.length > 20) throw new Error("Historical charge scope exceeded its preparation budget.");
        for (const charge of page.page) await seal(charge.studentId, charge);
        done = page.isDone; cursor = page.continueCursor;
      }
      await ctx.db.patch(job._id, { snapshotCount: count, held, snapshotHash: hash, snapshotComplete: done, cursor: done ? null : cursor, state: done ? "prepared" : "preparing", step: job.step + 1, updatedAt: Date.now() });
      if (done) {
        await ctx.db.patch(control._id, { state: "ready", bulkJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() });
        return null;
      }
    } else if (job.phase === "apply") {
      const waiting = await ctx.db.query("feeBulkRows").withIndex("by_jobId_and_state", q => q.eq("jobId", job._id).eq("state", "waiting")).first();
      const row = waiting ?? await ctx.db.query("feeBulkRows").withIndex("by_jobId_and_state", q => q.eq("jobId", job._id).eq("state", "pending")).first();
      if (!row) {
        await ctx.db.patch(job._id, { phase: "verify", step: job.step + 1, updatedAt: Date.now() });
      } else {
        const student = await ctx.db.get(row.studentId); const account = await financialAccount(ctx, row.studentId);
        const fence = await ctx.db.query("feeBulkStudentFences").withIndex("by_jobId_and_studentId", q => q.eq("jobId", job._id).eq("studentId", row.studentId)).unique();
        if (row.state === "waiting") {
          const child = row.correctionJobId ? await ctx.db.get(row.correctionJobId) : row.allocationJobId ? await ctx.db.get(row.allocationJobId) : null;
          if (child?.state === "failed" || account?.state === "failed") throw new Error("An existing row money child failed. Retry that child before resuming its prepared fee operation.");
          if (child && child.state !== "complete" || account?.state === "allocating" || account?.state === "posting") {
            await ctx.scheduler.runAfter(1000, runRef, { jobId: job._id }); return null;
          }
          if (!account || account.state !== "ready" || !fence || account.generation !== fence.generation) throw new Error("Completed row financial generation changed.");
          if (row.correctionJobId && (!child || !("feeBulkJobId" in child) || child.feeBulkJobId !== job._id)) throw new Error("Row lost its prepared correction evidence.");
          await ctx.db.patch(fence._id, { expectedFinancialRevision: account.revision });
          await ctx.db.patch(row._id, { state: "committed", message: undefined });
          await ctx.db.patch(job._id, { committed: job.committed + 1, processed: job.processed + 1, step: job.step + 1, updatedAt: Date.now() });
        } else {
          const charge = row.chargeId ? await ctx.db.get(row.chargeId) : null;
          let message: string | undefined;
          if (!student?.active || student.seasonId !== job.seasonId) message = "This student is no longer active in this season.";
          else if (!account || account.state !== "ready" || job.requiredFinancialProjectionVersion === 4 && account.allocationSourceVersion !== 1 || !fence || account.generation !== fence.generation || account.revision !== fence.expectedFinancialRevision) message = "This student's money changed. Review this student again.";
          else if (row.chargeId && (!charge || charge.feeDefinitionId !== fee._id || (charge.revision ?? 0) !== row.expectedChargeRevision)) message = "This student's fee changed. Review this student again.";
          else if (account) message = bulkTargetHold(account, charge, row.targetAmountCents, job.kind) ?? undefined;
          if (fee.eventId) {
            const event = await ctx.db.get(fee.eventId); const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", fee.eventId!).eq("studentId", row.studentId)).unique();
            if (!event || event.archived || event.seasonId !== job.seasonId || participant?.status !== "confirmed") message = "This student is no longer signed up for the event.";
          }
          if (message) {
            await ctx.db.patch(row._id, { state: "held", message });
            await ctx.db.patch(job._id, { held: job.held + 1, processed: job.processed + 1, step: job.step + 1, updatedAt: Date.now() });
          } else if (charge && effectiveChargeCents(charge) === row.targetAmountCents) {
            await ctx.db.patch(row._id, { state: "committed" });
            await ctx.db.patch(job._id, { committed: job.committed + 1, processed: job.processed + 1, step: job.step + 1, updatedAt: Date.now() });
          } else if (charge && account) {
            const childId = await startBulkChargeCorrection(ctx, actor, job, row, account);
            await ctx.db.patch(row._id, { state: "waiting", correctionJobId: childId });
            await ctx.runMutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), { jobId: childId, step: 0 });
            await ctx.db.patch(job._id, { step: job.step + 1, updatedAt: Date.now() });
          } else if (account) {
            if (job.kind === "cancel") throw new Error("Cancellation lost its original charge.");
            const [chargeId] = await addCharges(ctx, actor, row.studentId, [{ feeDefinitionId: fee._id, label: fee.label, eventId: fee.eventId, category: fee.eventId ? "extra" : "main", amountCents: row.targetAmountCents, priority: fee.priority, idempotencyKey: `fee-bulk:${job._id}:${row._id}` }], `fee-bulk:${job._id}:${row._id}:allocate`, job._id);
            const after = await financialAccount(ctx, row.studentId);
            await ctx.db.patch(row._id, { chargeId, state: "waiting", allocationJobId: after?.allocationJobId });
            await ctx.db.patch(job._id, { step: job.step + 1, updatedAt: Date.now() });
          }
        }
      }
    } else if (job.phase === "supersede") {
      if (!job.priorHeldJobId || job.kind !== "cancel" || job.scope !== "existingCharges") throw new Error("Full cancellation lost its prior held review.");
      const prior = await ctx.db.get(job.priorHeldJobId);
      if (!prior || prior.state !== "held" || prior.feeDefinitionId !== fee._id || prior.held !== job.priorHeldRows) throw new Error("Prior held fee evidence changed.");
      const rows = await ctx.db.query("feeBulkRows").withIndex("by_jobId_and_state", q => q.eq("jobId", prior._id).eq("state", "held")).take(20);
      for (const row of rows) {
        if (row.correctionJobId || row.allocationJobId) throw new Error("A prior held row has money child evidence and cannot be superseded.");
        await ctx.db.patch(row._id, { state: "superseded", message: "Not added; the fee was canceled for this student instead." });
      }
      const count = job.supersededRows + rows.length;
      if (count > (job.priorHeldRows ?? 0)) throw new Error("Prior unposted row count is inconsistent.");
      if (!rows.length) {
        if (count !== job.priorHeldRows) throw new Error("Full cancellation did not account for every prior unposted row.");
        await ctx.db.patch(prior._id, { state: "superseded", supersededByJobId: job._id, updatedAt: Date.now() });
        await ctx.db.patch(job._id, { state: "complete", supersededRows: count, step: job.step + 1, updatedAt: Date.now() });
        await ctx.db.patch(fee._id, { defaultAmountCents: 0, state: "cancelled", revision: fee.revision + 1, updatedAt: Date.now() });
        await ctx.db.patch(control._id, { state: "ready", bulkJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() }); return null;
      }
      await ctx.db.patch(job._id, { supersededRows: count, step: job.step + 1, updatedAt: Date.now() });
    } else {
      const held = await ctx.db.query("feeBulkRows").withIndex("by_jobId_and_state", q => q.eq("jobId", job._id).eq("state", "held")).first();
      if (!held && job.priorHeldJobId) {
        await ctx.db.patch(job._id, { phase: "supersede", step: job.step + 1, updatedAt: Date.now() });
        await ctx.scheduler.runAfter(0, runRef, { jobId: job._id }); return null;
      }
      await ctx.db.patch(job._id, { state: held ? "held" : "complete", step: job.step + 1, updatedAt: Date.now() });
      if (!held) await ctx.db.patch(fee._id, { defaultAmountCents: job.targetAmountCents, state: job.kind === "cancel" ? "cancelled" : "active", revision: fee.revision + 1, updatedAt: Date.now() });
      await ctx.db.patch(control._id, { state: "ready", bulkJobId: undefined, revision: control.revision + 1, updatedAt: Date.now() }); return null;
    }
    const current = await ctx.db.get(job._id); if (current && ["draining", "preparing", "applying"].includes(current.state)) await ctx.scheduler.runAfter(0, runRef, { jobId: job._id }); return null;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("feeBulkJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId); if (!job || !["draining", "preparing", "applying"].includes(job.state)) return null;
    try { await ctx.runMutation(pageRef, { jobId: job._id, step: job.step }); }
    catch (error) {
      await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "The fee change stopped before it finished. Ask a Coach to review it, then try again."), updatedAt: Date.now() });
      const control = await seasonFinanceControl(ctx, job.seasonId); if (control?.bulkJobId === job._id) await ctx.db.patch(control._id, { state: "failed", updatedAt: Date.now() });
    }
    return null;
  },
});
