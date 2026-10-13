import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { activeSeason, viewer } from "./lib/access";
import { feeMaintenanceProjection, feeMaintenanceValidator } from "./lib/seasonFinance";
import { financeRow } from "./lib/financeRow";

const nullable = v.union(v.number(), v.null());
const row = v.object({ studentId: v.id("students"), name: v.string(), active: v.boolean(), state: v.union(v.literal("ready"), v.literal("updating"), v.literal("failed"), v.literal("uninitialized")), chargedCents: nullable, personalAppliedCents: nullable, fundraisingAppliedCents: nullable, dueCents: nullable, fundraisingAvailableCents: nullable, personalAvailableCents: nullable, generation: nullable, financialRevision: nullable, updatedAt: nullable, canRecord: v.boolean(), canView: v.boolean(), canRebuild: v.boolean() });

export const students = query({
  args: { paginationOpts: paginationOptsValidator, active: v.optional(v.boolean()) }, returns: paginationResultValidator(row).extend({ seasonId: v.id("seasons"), maintenance: feeMaintenanceValidator }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const readable = actor.role === "coach" || actor.role === "mentor" && actor.travelLead;
    if (!readable) throw new Error("Team finance viewing is not enabled for this account.");
    const season = await activeSeason(ctx); const maintenance = await feeMaintenanceProjection(ctx, season._id); const opts = boundedFinancePage(args.paginationOpts);
    const result = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", season._id).eq("active", args.active ?? true)).paginate(opts);
    if (result.page.length > 20) throw new Error("Finance roster page exceeded its supported size.");
    const page = await Promise.all(result.page.map(async student => {
      const { account, ...projection } = await financeRow(ctx, student._id);
      const writable = !maintenance || maintenance.state === "ready";
      return { studentId: student._id, name: student.preferredName || student.legalName, active: student.active, ...projection, canRecord: projection.state === "ready" && writable && student.active && (actor.role === "coach" || actor.financialEdit), canView: student.active, canRebuild: actor.role === "coach" && (!maintenance || ["ready", "failed"].includes(maintenance.state)) && (!account || ["ready", "failed", "uninitialized"].includes(account.state) && !account.operationJobId && !account.allocationJobId && !account.fundraiserJobId) };
    }));
    return { ...result, page, seasonId: season._id, maintenance };
  },
});

const change = v.object({ feeDefinitionId: v.union(v.id("feeDefinitions"), v.null()), feeLabel: v.union(v.string(), v.null()), changeId: v.id("financeChangeEvents"), studentId: v.union(v.id("students"), v.null()), studentName: v.union(v.string(), v.null()), actorName: v.string(), occurredAt: v.number(), kind: v.string(), state: v.union(v.literal("committed"), v.literal("progress")), meaning: v.union(v.literal("receipt"), v.literal("obligation"), v.literal("applied"), v.literal("personalAvailable"), v.literal("fundraisingAvailable"), v.literal("grossRaised"), v.literal("priority")), beforeCents: nullable, afterCents: nullable, deltaCents: nullable, reason: v.string(), sourceKind: v.union(v.literal("payment"), v.literal("fundraiser"), v.null()), sourceType: v.string(), sourceId: v.string(), historical: v.boolean() });
export const recentChanges = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(change).extend({ seasonId: v.id("seasons"), coverage: v.object({ state: v.union(v.literal("updating"), v.literal("ready"), v.literal("failed")), startedAt: nullable, completedAt: nullable }) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Team finance viewing is not enabled for this account.");
    const season = await activeSeason(ctx); const result = await ctx.db.query("financeChangeEvents").withIndex("by_seasonId_and_occurredAt", q => q.eq("seasonId", season._id)).order("desc").paginate(boundedFinancePage(args.paginationOpts));
    if (result.page.length > 20) throw new Error("Finance change page exceeded its supported size.");
    const coverage = await ctx.db.query("financeChangeBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const page = await Promise.all(result.page.map(async item => {
      const [student, actor, fee] = await Promise.all([item.studentId ? ctx.db.get(item.studentId) : null, ctx.db.get(item.actorId), item.feeDefinitionId ? ctx.db.get(item.feeDefinitionId) : null]);
      return { feeDefinitionId: item.feeDefinitionId ?? null, feeLabel: item.feeDefinitionId ? fee?.label ?? "Fee definition unavailable" : null, changeId: item._id, studentId: item.studentId ?? null, studentName: student?.preferredName || student?.legalName || (item.studentId ? "Archived student" : null), actorName: actor?.name ?? "Archived account", occurredAt: item.occurredAt, kind: item.kind, state: item.state, meaning: item.meaning, beforeCents: item.beforeCents, afterCents: item.afterCents, deltaCents: item.deltaCents, reason: item.reason, sourceKind: item.sourceKind ?? null, sourceType: item.sourceType, sourceId: item.sourceId, historical: item.historical };
    }));
    return { ...result, page, seasonId: season._id, coverage: { state: coverage?.state === "complete" ? "ready" as const : coverage?.state === "failed" ? "failed" as const : "updating" as const, startedAt: coverage?.startedAt ?? null, completedAt: coverage?.completedAt ?? null } };
  },
});

type Options = { numItems: number; cursor: string | null; maximumRowsRead?: number };
export function boundedFinancePage<T extends Options>(opts: T): T {
  if (!Number.isSafeInteger(opts.numItems) || opts.numItems < 1 || opts.numItems > 20 || opts.maximumRowsRead !== undefined && (!Number.isSafeInteger(opts.maximumRowsRead) || opts.maximumRowsRead < 1)) throw new Error("Request between 1 and 20 records with a valid row budget.");
  return { ...opts, maximumRowsRead: Math.min(opts.maximumRowsRead ?? 21, 21) };
}

export const status = query({
  args: {}, returns: v.object({ seasonId: v.id("seasons"), maintenance: feeMaintenanceValidator, coverage: v.object({ state: v.union(v.literal("updating"), v.literal("ready"), v.literal("failed")), startedAt: nullable, completedAt: nullable }), canPrepareHistory: v.boolean() }),
  handler: async ctx => {
    const actor = await viewer(ctx); if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Team finance viewing is not enabled for this account.");
    const season = await activeSeason(ctx);
    const coverage = await ctx.db.query("financeChangeBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    return { seasonId: season._id, maintenance: await feeMaintenanceProjection(ctx, season._id), coverage: { state: coverage?.state === "complete" ? "ready" as const : coverage?.state === "failed" ? "failed" as const : "updating" as const, startedAt: coverage?.startedAt ?? null, completedAt: coverage?.completedAt ?? null }, canPrepareHistory: actor.role === "coach" && coverage?.state !== "running" && coverage?.state !== "complete" };
  },
});
