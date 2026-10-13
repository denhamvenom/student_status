import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./_generated/server";
import { activeSeason, viewer } from "./lib/access";
import { cents, createFinancialAccount, financialAccount, projectMovement, projectSource, requireNoFinancialJob, saveFinancialAccount } from "./lib/financialSources";
import { effectiveChargeCents } from "./lib/money";
import { refreshStudentFinance } from "./lib/financeSummaries";

const runRef = makeFunctionReference<"mutation">("financialSources:run");
const pageRef = makeFunctionReference<"mutation">("financialSources:processPage");

export const rebuild = mutation({
  args: { studentId: v.id("students") }, returns: v.id("financialAccounts"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach") throw new Error("Only a Coach may rebuild financial records.");
    return startFinancialRebuild(ctx, args.studentId, actor._id);
  },
});

export async function startFinancialRebuild(ctx: MutationCtx, studentId: Id<"students">, actorId: Id<"appUsers">) {
  const actor = await ctx.db.get(actorId);
  if (!actor?.active || actor.role !== "coach") throw new Error("Only an active Coach may rebuild financial records.");
  const student = await ctx.db.get(studentId); const season = await activeSeason(ctx);
  if (!student || student.seasonId !== season._id) throw new Error("Student is unavailable in the active season.");
  const current = await financialAccount(ctx, student._id);
  if (current) await requireNoFinancialJob(ctx, current);
  if (current?.state === "allocating") throw new Error("Finish the pending allocation before rebuilding.");
  if (current?.state === "rebuilding") return current._id;
  const freshId = await createFinancialAccount(ctx, student._id, "rebuilding", (current?.generation ?? 0) + 1);
  const fresh = await ctx.db.get(freshId);
  if (!fresh) throw new Error("Financial rebuild could not start.");
  let accountId = freshId;
  if (current) {
    const { _id, _creationTime, ...fields } = fresh; void _id; void _creationTime;
    await ctx.db.replace(current._id, { ...fields, revision: current.revision + 1 });
    await ctx.db.delete(freshId); accountId = current._id;
  }
  await ctx.db.patch(accountId, { rebuildActorId: actorId });
  await ctx.scheduler.runAfter(0, runRef, { accountId });
  return accountId;
}

/** Every page either commits projections and its cursor together, or commits neither. */
export const processPage = internalMutation({
  args: { accountId: v.id("financialAccounts"), generation: v.number(), phase: v.string(), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account || account.state !== "rebuilding" || account.generation !== args.generation || account.phase !== args.phase || account.cursor !== args.cursor) return null;
    const actor = account.rebuildActorId ? await ctx.db.get(account.rebuildActorId) : null;
    if (!actor?.active || actor.role !== "coach") throw new Error("Financial rebuild actor is unavailable; a Coach must restart.");
    const season = await activeSeason(ctx);
    if (season._id !== account.seasonId) throw new Error("Financial rebuild season changed.");
    const student = await ctx.db.get(account.studentId);
    if (!student || student.seasonId !== account.seasonId) throw new Error("Financial rebuild student scope changed.");
    if (account.phase === "sources" || account.phase === "movements") {
      const page = await ctx.db.query("ledgerEntries").withIndex("by_studentId", q => q.eq("studentId", account.studentId)).paginate({ cursor: account.cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Financial rebuild page exceeded its read budget.");
      for (const entry of page.page) {
        if (account.phase === "sources") {
          if (entry.kind === "payment" || entry.kind === "fundraiser") await projectSource(ctx, account, entry);
        } else {
          await projectMovement(ctx, account, entry);
          account.ledgerCount++;
          account.lastLedgerAt = Math.max(account.lastLedgerAt ?? 0, entry.recordedAt);
          account.lastFinancialChangeAt = Math.max(account.lastFinancialChangeAt ?? 0, entry.recordedAt);
        }
      }
      account.processed += page.page.length;
      account.cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) account.phase = account.phase === "sources" ? "movements" : "charges";
    } else if (account.phase === "charges") {
      const page = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", account.studentId)).paginate({ cursor: account.cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Financial rebuild page exceeded its read budget.");
      for (const charge of page.page) {
        const net = await ctx.db.query("financialChargeAllocations").withIndex("by_studentId_and_generation_and_chargeId", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("chargeId", charge._id)).unique();
        if ((net?.appliedCents ?? 0) !== charge.appliedCents) throw new Error("Charge balance differs from its funding history; Coach review is required.");
        if (net) await ctx.db.patch(net._id, { verified: true });
        const effective = effectiveChargeCents(charge);
        await ctx.db.patch(charge._id, { outstanding: effective > charge.appliedCents });
        account.chargedCents = cents(account.chargedCents + effective);
        account.paidCents = cents(account.paidCents + charge.appliedCents); account.chargeCount++;
      }
      account.processed += page.page.length; account.cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) account.phase = "raised";
    } else if (account.phase === "raised") {
      const page = await ctx.db.query("fundraiserStudentTotals").withIndex("by_seasonId_and_studentId", q => q.eq("seasonId", account.seasonId).eq("studentId", account.studentId)).paginate({ cursor: account.cursor, numItems: 20, maximumRowsRead: 21 });
      if (page.page.length > 20) throw new Error("Financial rebuild page exceeded its read budget.");
      for (const total of page.page) {
        const revision = await ctx.db.get(total.latestRevisionId);
        if (!revision || revision.fundraiserId !== total.fundraiserId || revision.studentId !== account.studentId || revision.seasonId !== account.seasonId || revision.grossCents !== total.grossCents || revision.teamCents !== total.teamCents || revision.travelCreditCents !== total.travelCreditCents || total.teamCents + total.travelCreditCents !== total.grossCents) throw new Error("Gross Raised evidence is inconsistent; Coach review is required.");
        account.knownRaisedCents = cents(account.knownRaisedCents + cents(total.grossCents));
        account.lastFinancialChangeAt = Math.max(account.lastFinancialChangeAt ?? 0, revision.recordedAt);
      }
      account.processed += page.page.length; account.cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) account.phase = "verify";
    } else {
      const orphan = await ctx.db.query("financialChargeAllocations").withIndex("by_studentId_and_generation_and_verified", q => q.eq("studentId", account.studentId).eq("generation", account.generation).eq("verified", false)).first();
      if (orphan || account.paidCents > account.chargedCents) throw new Error("Financial allocations refer to unavailable charges; Coach review is required.");
      account.state = "ready"; account.revision++;
    }
    await saveFinancialAccount(ctx, account);
    if (account.state === "ready") await refreshStudentFinance(ctx, account.studentId);
    if (account.state === "rebuilding") await ctx.scheduler.runAfter(0, runRef, { accountId: account._id });
    return null;
  },
});

export const run = internalMutation({
  args: { accountId: v.id("financialAccounts") }, returns: v.null(),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account || account.state !== "rebuilding") return null;
    try {
      await ctx.runMutation(pageRef, { accountId: account._id, generation: account.generation, phase: account.phase, cursor: account.cursor });
    } catch (error) {
      await ctx.db.patch(account._id, { state: "failed", updatedAt: Date.now(), lastError: error instanceof Error ? error.message.slice(0, 500) : "Financial rebuild failed; Coach review is required." });
    }
    return null;
  },
});
