import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";

type Ctx = MutationCtx | QueryCtx;
export type FinancialContinuationId = Id<"feeBulkJobs"> | Id<"feePriorityJobs"> | Id<"financialOperationJobs"> | Id<"fundraiserPostingJobs"> | Id<"eventEnrollmentJobs"> | Id<"seasonTransitionPlans">;
export const feeMaintenanceValidator = v.union(v.null(), v.object({ state: v.union(v.literal("ready"), v.literal("draining"), v.literal("applying"), v.literal("failed")), revision: v.number() }));
export async function feeMaintenanceProjection(ctx: Ctx, seasonId: Id<"seasons">) {
  const control = await seasonFinanceControl(ctx, seasonId);
  return control ? { state: control.state, revision: control.revision } : null;
}
export async function seasonFinanceControl(ctx: Ctx, seasonId: Id<"seasons">) {
  return ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).unique();
}

export async function requireNoUnfinishedFeeScopes(ctx: Ctx, seasonId: Id<"seasons">) {
  for (const state of ["draining", "preparing", "prepared", "applying", "held", "failed"] as const) {
    const job = await ctx.db.query("feeBulkJobs").withIndex("by_seasonId_and_state", q => q.eq("seasonId", seasonId).eq("state", state)).first();
    if (job) throw new Error("Finish or cancel every prepared or held shared fee scope before remapping the season order.");
  }
}

/** The indexed open-plan read is an OCC fence shared by every financial writer. */
export async function requireSeasonTransitionFinancialAccess(ctx: Ctx, seasonId: Id<"seasons">, continuation = false) {
  const plan = await ctx.db.query("seasonTransitionPlans").withIndex("by_sourceSeasonId_and_open", q => q.eq("sourceSeasonId", seasonId).eq("open", true)).unique();
  if (!plan || plan.state === "draft" || plan.state === "reviewing") return;
  if (continuation && plan.state === "draining") return;
  throw new Error("Season transition is locked. Finish or retry the transition before changing financial records.");
}

/** New commands cannot enter while shared definitions are being changed. */
export async function requireSeasonFinanceReady(ctx: Ctx, seasonId: Id<"seasons">) {
  await requireSeasonTransitionFinancialAccess(ctx, seasonId);
  const control = await seasonFinanceControl(ctx, seasonId);
  if (control && control.state !== "ready") throw new Error("Season fees are being maintained. Finish or retry that maintenance before starting another financial change.");
}

/** Indexed upstream checks and the control transition share one transaction/OCC fence. */
export async function seasonFinancialDrain(ctx: Ctx, seasonId: Id<"seasons">) {
  for (const state of ["rebuilding", "allocating", "posting", "failed"] as const) {
    const account = await ctx.db.query("financialAccounts").withIndex("by_seasonId_and_state", q => q.eq("seasonId", seasonId).eq("state", state)).first();
    if (account) return { ready: false, blocked: state === "failed", message: state === "failed" ? "A failed student financial job requires Coach resolution." : "Existing student financial work is still finishing." };
  }
  const enrollment = await ctx.db.query("events").withIndex("by_seasonId_and_enrollmentState", q => q.eq("seasonId", seasonId).eq("enrollmentState", "running")).first();
  if (enrollment) return { ready: false, blocked: false, message: "Existing Whole Team enrollment is still finishing." };
  const failedEnrollment = await ctx.db.query("events").withIndex("by_seasonId_and_enrollmentState", q => q.eq("seasonId", seasonId).eq("enrollmentState", "failed")).first();
  if (failedEnrollment) return { ready: false, blocked: true, message: "A failed Whole Team enrollment requires Coach resolution." };
  const fundraiser = await ctx.db.query("fundraisers").withIndex("by_seasonId_and_state", q => q.eq("seasonId", seasonId).eq("state", "posting")).first();
  if (fundraiser) return { ready: false, blocked: false, message: "Existing fundraiser posting is still finishing." };
  const report = await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).unique();
  if (report?.state === "failed") return { ready: false, blocked: true, message: "Failed finance report preparation requires Coach resolution." };
  if (report?.state === "running") return { ready: false, blocked: false, message: "Existing finance report preparation is still finishing." };
  return { ready: true, blocked: false, message: null };
}

/** Called only by trusted workers; no client-provided continuation bypass exists. */
export async function requireSeasonFinancialContinuation(ctx: Ctx, seasonId: Id<"seasons">, originId: FinancialContinuationId) {
  await requireSeasonTransitionFinancialAccess(ctx, seasonId, true);
  const origin = await ctx.db.get(originId);
  if (origin && "targetSeasonId" in origin) {
    const actor = await ctx.db.get(origin.updatedBy);
    if (!origin.open || origin.targetSeasonId !== seasonId || origin.state !== "applying" && origin.state !== "verifying" || !actor?.active || actor.role !== "coach") throw new Error("Season allocation continuation is unavailable.");
    return;
  }
  const control = await seasonFinanceControl(ctx, seasonId);
  if (!control || control.state === "ready") return;
  if (!origin) throw new Error("Financial continuation lost its originating job.");
  if ("seasonId" in origin && origin.seasonId !== seasonId) throw new Error("Financial continuation belongs to another season.");
  if ("studentId" in origin) {
    const student = await ctx.db.get(origin.studentId);
    if (!student || student.seasonId !== seasonId) throw new Error("Financial continuation belongs to another season.");
  }
  if ("fundraiserId" in origin) {
    const fundraiser = await ctx.db.get(origin.fundraiserId);
    if (!fundraiser || fundraiser.seasonId !== seasonId) throw new Error("Fundraiser continuation belongs to another season.");
  }
  if ("eventId" in origin && origin.eventId) {
    const event = await ctx.db.get(origin.eventId);
    if (!event || event.seasonId !== seasonId) throw new Error("Enrollment continuation belongs to another season.");
  }
  if (control.state === "draining") return;
  if (control.state === "failed") {
    const maintenance = control.priorityJobId ? await ctx.db.get(control.priorityJobId) : control.mappingJobId ? await ctx.db.get(control.mappingJobId) : control.bulkJobId ? await ctx.db.get(control.bulkJobId) : null;
    if (maintenance?.phase === "drain") return;
  }
  if (control.bulkJobId === originId || control.priorityJobId === originId) return;
  if ("feeBulkJobId" in origin && origin.feeBulkJobId === control.bulkJobId && control.bulkJobId) return;
  throw new Error("Financial continuation is outside the active season maintenance job.");
}

/** Existing failed jobs may be repaired while draining; applying is reserved for its own children. */
export async function requireSeasonFinancialRetry(ctx: Ctx, seasonId: Id<"seasons">, jobId: FinancialContinuationId | Id<"financialAllocationJobs">) {
  await requireSeasonTransitionFinancialAccess(ctx, seasonId, true);
  const control = await seasonFinanceControl(ctx, seasonId);
  if (!control || control.state === "ready" || control.state === "draining") return;
  const maintenance = control.priorityJobId ? await ctx.db.get(control.priorityJobId) : control.mappingJobId ? await ctx.db.get(control.mappingJobId) : control.bulkJobId ? await ctx.db.get(control.bulkJobId) : null;
  if (maintenance?.phase === "drain") return;
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("Financial retry lost its original job.");
  if ("feeBulkJobId" in job && job.feeBulkJobId && job.feeBulkJobId === control.bulkJobId) return;
  if ("maintenanceOriginId" in job && job.maintenanceOriginId) {
    await requireSeasonFinancialContinuation(ctx, seasonId, job.maintenanceOriginId); return;
  }
  throw new Error("Finish active season fee maintenance before restarting this upstream job.");
}

export async function seasonFinancialRetryAvailable(ctx: Ctx, seasonId: Id<"seasons">, jobId: FinancialContinuationId | Id<"financialAllocationJobs">) {
  try { await requireSeasonFinancialRetry(ctx, seasonId, jobId); return true; }
  catch { return false; }
}
