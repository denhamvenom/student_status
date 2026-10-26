import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, requireRole, viewer } from "./lib/access";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { financialAccount, readyFinancialAccount } from "./lib/financialSources";

type Ctx = QueryCtx | MutationCtx;
const studentId = v.id("students");
const planId = v.id("seasonTransitionPlans");
const pageArgs = { planId, studentId, paginationOpts: paginationOptsValidator };
const checkPage = (options: { numItems: number; maximumRowsRead?: number }) => {
  if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 25) throw new ConvexError("Up to 25 records can be shown at a time. Reload the page and try again.");
  if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new ConvexError("The season review could not load. Reload the page and try again.");
  options.maximumRowsRead = Math.min(options.maximumRowsRead ?? 26, 26);
};
const studentFingerprint = (student: Doc<"students">) => JSON.stringify([student._id, student.seasonId, student.userId ?? null, student.active, student.profileRevision ?? 0]);
const accountFingerprint = (account: Doc<"appUsers"> | null) => account ? JSON.stringify([account._id, account.active, account.archivedAt ?? null, account.accessRevision ?? 0, account.role]) : "none";
const revision = (value: number) => { if (!Number.isSafeInteger(value) || value < 0) throw new ConvexError("This choice could not be saved. Reload the page and try again."); return value; };
const reason = (value: string, required: boolean) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > 500 || required && normalized.length < 8) throw new ConvexError("Enter a reason of 8 to 500 characters.");
  return normalized;
};

async function reviewed(ctx: Ctx, id: Id<"seasonTransitionPlans">, subjectId: Id<"students">) {
  requireRole(await viewer(ctx), "coach");
  const season = await activeSeason(ctx);
  const plan = await ctx.db.get(id);
  if (!plan || !plan.open || plan.state !== "draft" || plan.sourceSeasonId !== season._id) throw new ConvexError("This season draft was finished or discarded. Reload to see the latest.");
  const student = await ctx.db.get(subjectId);
  if (!student || !student.active || student.seasonId !== season._id) throw new ConvexError("This student is no longer active in the current season. Reload the review to see the latest.");
  const roster = await ctx.db.query("seasonTransitionRosterDecisions").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", id).eq("sourceStudentId", subjectId)).unique();
  const account = student.userId ? await ctx.db.get(student.userId) : null;
  return { season, plan, student, roster, account };
}

async function mutationReview(ctx: MutationCtx, id: Id<"seasonTransitionPlans">, subjectId: Id<"students">, expectedPlanRevision: number) {
  const actor = await viewer(ctx); requireRole(actor, "coach");
  const state = await reviewed(ctx, id, subjectId);
  if (state.plan.revision !== revision(expectedPlanRevision)) throw new ConvexError("The season review changed since you opened it. Reload to see the latest, then try again.");
  return { ...state, actor };
}

export const studentPreview = query({
  args: { planId, studentId },
  returns: v.object({ studentId, legalName: v.string(), preferredName: v.string(), rosterChoice: v.union(v.literal("return"), v.literal("depart"), v.null()), rosterRevision: v.union(v.number(), v.null()), studentFingerprint: v.string(),
    account: v.union(v.null(), v.object({ active: v.boolean(), role: v.string(), archivedAt: v.union(v.number(), v.null()) })), accountFingerprint: v.string(),
    review: v.union(v.null(), v.object({ copyGuardianContact: v.boolean(), copySubteam: v.boolean(), copyParentLinks: v.boolean(), accountAction: v.union(v.literal("keepActive"), v.literal("archive")), reason: v.string(), revision: v.number(), stale: v.boolean() })),
    financial: v.object({ state: v.union(v.literal("ready"), v.literal("unavailable")), personalAvailableCents: v.union(v.number(), v.null()), fundraisingAvailableCents: v.union(v.number(), v.null()), dueCents: v.union(v.number(), v.null()), generation: v.union(v.number(), v.null()), revision: v.union(v.number(), v.null()) }),
  }),
  handler: async (ctx, args) => {
    const { plan, student, roster, account } = await reviewed(ctx, args.planId, args.studentId);
    const review = await ctx.db.query("seasonTransitionStudentReviews").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", plan._id).eq("sourceStudentId", student._id)).unique();
    const finance = await financialAccount(ctx, student._id);
    return { studentId: student._id, legalName: student.legalName, preferredName: student.preferredName,
      rosterChoice: roster?.choice ?? null, rosterRevision: roster?.revision ?? null, studentFingerprint: studentFingerprint(student),
      account: account ? { active: account.active, role: account.role, archivedAt: account.archivedAt ?? null } : null, accountFingerprint: accountFingerprint(account),
      review: review ? { copyGuardianContact: review.copyGuardianContact, copySubteam: review.copySubteam, copyParentLinks: review.copyParentLinks,
        accountAction: review.accountAction, reason: review.reason, revision: review.revision,
        stale: review.rosterRevision !== roster?.revision || review.studentFingerprint !== studentFingerprint(student) || review.accountFingerprint !== accountFingerprint(account) } : null,
      financial: finance?.state === "ready" && finance.allocationSourceVersion === 1 ? { state: "ready" as const, personalAvailableCents: finance.personalAvailableCents,
        fundraisingAvailableCents: finance.fundraisingAvailableCents, dueCents: finance.chargedCents - finance.paidCents, generation: finance.generation, revision: finance.revision }
        : { state: "unavailable" as const, personalAvailableCents: null, fundraisingAvailableCents: null, dueCents: null, generation: null, revision: null },
    };
  },
});

export const saveStudentReview = mutation({
  args: { planId, studentId, expectedPlanRevision: v.number(), expectedRosterRevision: v.number(), expectedStudentFingerprint: v.string(), expectedAccountFingerprint: v.string(), expectedReviewRevision: v.union(v.number(), v.null()),
    copyGuardianContact: v.boolean(), copySubteam: v.boolean(), copyParentLinks: v.boolean(), accountAction: v.union(v.literal("keepActive"), v.literal("archive")), reason: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { actor, plan, student, roster, account } = await mutationReview(ctx, args.planId, args.studentId, args.expectedPlanRevision);
    if (!roster || roster.revision !== revision(args.expectedRosterRevision) || roster.studentFingerprint !== studentFingerprint(student) || args.expectedStudentFingerprint !== studentFingerprint(student) || args.expectedAccountFingerprint !== accountFingerprint(account)) throw new ConvexError("This student or their account changed since you opened it. Reload to see the latest, then try again.");
    if (roster.choice === "return" && args.accountAction !== "keepActive") throw new ConvexError("A returning student's account must stay active. Change the student's season status first if they are leaving.");
    if (roster.choice === "depart" && (args.copyGuardianContact || args.copySubteam || args.copyParentLinks)) throw new ConvexError("Departing students don't move to the new season, so their profile details can't be copied. Clear those choices to continue.");
    if (args.accountAction === "archive" && (!account || !account.active || account.role !== "student")) throw new ConvexError("Only an active student account can be archived. Choose another option for this student.");
    const why = reason(args.reason, args.accountAction === "archive");
    const old = await ctx.db.query("seasonTransitionStudentReviews").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", plan._id).eq("sourceStudentId", student._id)).unique();
    if ((old?.revision ?? null) !== args.expectedReviewRevision) throw new ConvexError("This student's review changed since you opened it. Reload to see the latest, then try again.");
    const next = { rosterRevision: roster.revision, studentFingerprint: studentFingerprint(student), accountFingerprint: accountFingerprint(account),
      copyGuardianContact: args.copyGuardianContact, copySubteam: args.copySubteam, copyParentLinks: args.copyParentLinks, accountAction: args.accountAction, reason: why,
      revision: (old?.revision ?? 0) + 1, reviewedBy: actor._id, reviewedAt: Date.now() };
    if (old) await ctx.db.patch(old._id, next);
    else await ctx.db.insert("seasonTransitionStudentReviews", { planId: plan._id, sourceStudentId: student._id, ...next });
    await ctx.db.patch(plan._id, { revision: plan.revision + 1, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor, "seasonTransitionStudentReviews", `${plan._id}:${student._id}`, "review", old ?? null, next, why || undefined);
    return next.revision;
  },
});

export const chargePage = query({
  args: pageArgs,
  returns: paginationResultValidator(v.object({ chargeId: v.id("charges"), label: v.string(), outstandingCents: v.number(), chargeRevision: v.number(),
    choice: v.union(v.literal("carry"), v.literal("writeOff"), v.null()), reason: v.string(), decisionRevision: v.union(v.number(), v.null()), stale: v.boolean() })),
  handler: async (ctx, args) => {
    const { plan, student } = await reviewed(ctx, args.planId, args.studentId);
    checkPage(args.paginationOpts);
    const account = await financialAccount(ctx, student._id);
    if (!account || account.state !== "ready" || account.allocationSourceVersion !== 1) throw new ConvexError("This student's account is not ready yet. Finish preparing it on the Money page, then review balances again.");
    const result = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", student._id)).paginate(args.paginationOpts);
    if (result.page.length > 25) throw new ConvexError("Too many fees to show at once. Reload the list to see fewer at a time.");
    const page = await Promise.all(result.page.map(async charge => {
      const outstandingCents = effectiveChargeCents(charge) - charge.appliedCents;
      const decision = await ctx.db.query("seasonTransitionChargeDecisions").withIndex("by_planId_and_chargeId", q => q.eq("planId", plan._id).eq("chargeId", charge._id)).unique();
      return { chargeId: charge._id, label: charge.label, outstandingCents, chargeRevision: charge.revision ?? 0,
        choice: outstandingCents > 0 ? decision?.choice ?? null : null, reason: decision?.reason ?? "", decisionRevision: decision?.revision ?? null,
        stale: !!decision && (decision.outstandingCents !== outstandingCents || decision.chargeRevision !== (charge.revision ?? 0) || decision.financialGeneration !== account.generation || decision.financialRevision !== account.revision) };
    }));
    return { ...result, page };
  },
});

export const saveChargeDecision = mutation({
  args: { planId, studentId, chargeId: v.id("charges"), choice: v.union(v.literal("carry"), v.literal("writeOff")), expectedPlanRevision: v.number(), expectedChargeRevision: v.number(), expectedOutstandingCents: v.number(), expectedFinancialRevision: v.number(), expectedDecisionRevision: v.union(v.number(), v.null()), reason: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { actor, plan, student, roster } = await mutationReview(ctx, args.planId, args.studentId, args.expectedPlanRevision);
    if (!roster || roster.studentFingerprint !== studentFingerprint(student)) throw new ConvexError("Choose and review this student's season status first.");
    if (args.choice === "carry" && roster.choice !== "return") throw new ConvexError("Only returning students can carry a balance due into the new season. Choose another option for this fee.");
    const account = await readyFinancialAccount(ctx, student._id);
    const charge = await ctx.db.get(args.chargeId);
    const outstandingCents = charge ? effectiveChargeCents(charge) - charge.appliedCents : 0;
    if (!charge || charge.studentId !== student._id || outstandingCents <= 0 || (charge.revision ?? 0) !== args.expectedChargeRevision || outstandingCents !== args.expectedOutstandingCents || account.revision !== args.expectedFinancialRevision) throw new ConvexError("This fee or the student's balance changed since you opened it. Reload to see the latest, then try again.");
    const why = reason(args.reason, args.choice === "writeOff");
    const old = await ctx.db.query("seasonTransitionChargeDecisions").withIndex("by_planId_and_chargeId", q => q.eq("planId", plan._id).eq("chargeId", charge._id)).unique();
    if ((old?.revision ?? null) !== args.expectedDecisionRevision) throw new ConvexError("This fee decision changed since you opened it. Reload to see the latest, then try again.");
    const next = { choice: args.choice, outstandingCents, chargeRevision: charge.revision ?? 0, financialGeneration: account.generation, financialRevision: account.revision,
      reason: why, revision: (old?.revision ?? 0) + 1, decidedBy: actor._id, decidedAt: Date.now() };
    if (old) await ctx.db.patch(old._id, next);
    else await ctx.db.insert("seasonTransitionChargeDecisions", { planId: plan._id, sourceStudentId: student._id, chargeId: charge._id, ...next });
    await ctx.db.patch(plan._id, { revision: plan.revision + 1, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor, "seasonTransitionChargeDecisions", `${plan._id}:${charge._id}`, "review", old ?? null, next, why || undefined);
    return next.revision;
  },
});

export const sourcePage = query({
  args: pageArgs,
  returns: paginationResultValidator(v.object({ sourceEntryId: v.id("ledgerEntries"), kind: v.union(v.literal("payment"), v.literal("fundraiser")), availableCents: v.number(), sourceRevision: v.number(),
    choice: v.union(v.literal("carry"), v.literal("hold"), v.literal("team"), v.null()), reason: v.string(), decisionRevision: v.union(v.number(), v.null()), stale: v.boolean() })),
  handler: async (ctx, args) => {
    const { plan, student } = await reviewed(ctx, args.planId, args.studentId);
    checkPage(args.paginationOpts);
    const account = await financialAccount(ctx, student._id);
    if (!account || account.state !== "ready" || account.allocationSourceVersion !== 1) throw new ConvexError("This student's account is not ready yet. Finish preparing it on the Money page, then review balances again.");
    const result = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceCreatedAt", q => q.eq("studentId", student._id).eq("generation", account.generation)).paginate(args.paginationOpts);
    if (result.page.length > 25) throw new ConvexError("Too many available funds to show at once. Reload the list to see fewer at a time.");
    const page = await Promise.all(result.page.map(async source => {
      const decision = await ctx.db.query("seasonTransitionSourceDecisions").withIndex("by_planId_and_sourceEntryId", q => q.eq("planId", plan._id).eq("sourceEntryId", source.sourceEntryId)).unique();
      return { sourceEntryId: source.sourceEntryId, kind: source.kind, availableCents: source.availableCents, sourceRevision: source.revision,
        choice: source.availableCents > 0 ? decision?.choice ?? null : null, reason: decision?.reason ?? "", decisionRevision: decision?.revision ?? null,
        stale: !!decision && (decision.amountCents !== source.availableCents || decision.sourceRevision !== source.revision || decision.financialGeneration !== account.generation || decision.financialRevision !== account.revision) };
    }));
    return { ...result, page };
  },
});

export const saveSourceDecision = mutation({
  args: { planId, studentId, sourceEntryId: v.id("ledgerEntries"), choice: v.union(v.literal("carry"), v.literal("hold"), v.literal("team")), expectedPlanRevision: v.number(), expectedSourceRevision: v.number(), expectedAvailableCents: v.number(), expectedFinancialRevision: v.number(), expectedDecisionRevision: v.union(v.number(), v.null()), reason: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { actor, plan, student, roster } = await mutationReview(ctx, args.planId, args.studentId, args.expectedPlanRevision);
    if (!roster || roster.studentFingerprint !== studentFingerprint(student)) throw new ConvexError("Choose and review this student's season status first.");
    if (args.choice === "carry" && roster.choice !== "return" || args.choice === "team" && roster.choice !== "depart") throw new ConvexError("This choice doesn't match the student's season status. Only returning students can carry funds forward, and only departing students' funds can move to the team.");
    const account = await readyFinancialAccount(ctx, student._id);
    const source = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("sourceEntryId", args.sourceEntryId)).unique();
    if (!source || source.availableCents <= 0 || source.revision !== args.expectedSourceRevision || source.availableCents !== args.expectedAvailableCents || account.revision !== args.expectedFinancialRevision) throw new ConvexError("These available funds changed since you opened them. Reload to see the latest, then try again.");
    const why = reason(args.reason, args.choice !== "carry");
    const old = await ctx.db.query("seasonTransitionSourceDecisions").withIndex("by_planId_and_sourceEntryId", q => q.eq("planId", plan._id).eq("sourceEntryId", source.sourceEntryId)).unique();
    if ((old?.revision ?? null) !== args.expectedDecisionRevision) throw new ConvexError("This funds decision changed since you opened it. Reload to see the latest, then try again.");
    const next = { kind: source.kind, choice: args.choice, amountCents: source.availableCents, sourceRevision: source.revision,
      financialGeneration: account.generation, financialRevision: account.revision, reason: why,
      revision: (old?.revision ?? 0) + 1, decidedBy: actor._id, decidedAt: Date.now() };
    if (old) await ctx.db.patch(old._id, next);
    else await ctx.db.insert("seasonTransitionSourceDecisions", { planId: plan._id, sourceStudentId: student._id, sourceEntryId: source.sourceEntryId, ...next });
    await ctx.db.patch(plan._id, { revision: plan.revision + 1, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor, "seasonTransitionSourceDecisions", `${plan._id}:${source.sourceEntryId}`, "review", old ?? null, next, why || undefined);
    return next.revision;
  },
});
