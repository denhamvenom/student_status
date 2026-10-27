import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, requireRole, viewer } from "./lib/access";
import { kickoffForCompetitionYear } from "./lib/seasonCalendar";

type Ctx = QueryCtx | MutationCtx;
const choice = v.union(v.literal("return"), v.literal("depart"), v.null());
const kickoff = v.union(
  v.object({ state: v.literal("verified"), competitionYear: v.number(), kickoffDate: v.string(), timeZone: v.literal("America/Chicago"), sourceUrl: v.string(), verifiedOn: v.string() }),
  v.object({ state: v.literal("unavailable"), competitionYear: v.number(), reason: v.literal("kickoffDateNotVerified") }),
);
const planSummary = v.object({
  id: v.id("seasonTransitionPlans"), targetName: v.string(), targetCompetitionYear: v.number(),
  targetStartDate: v.string(), targetEndDate: v.string(), revision: v.number(), state: v.string(), updatedAt: v.number(),
});
const details = { targetName: v.string(), targetCompetitionYear: v.number(), targetStartDate: v.string(), targetEndDate: v.string() };

function summary(plan: Doc<"seasonTransitionPlans">) {
  return { id: plan._id, targetName: plan.targetName, targetCompetitionYear: plan.targetCompetitionYear,
    targetStartDate: plan.targetStartDate, targetEndDate: plan.targetEndDate, revision: plan.revision,
    state: plan.state, updatedAt: plan.updatedAt };
}

async function openPlan(ctx: Ctx, sourceSeasonId: Doc<"seasons">["_id"]) {
  return ctx.db.query("seasonTransitionPlans").withIndex("by_sourceSeasonId_and_open", q => q.eq("sourceSeasonId", sourceSeasonId).eq("open", true)).unique();
}

function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ConvexError("Enter a valid calendar date.");
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) throw new ConvexError("Enter a valid calendar date.");
  return value;
}

function normalized(input: { targetName: string; targetCompetitionYear: number; targetStartDate: string; targetEndDate: string }, source: Doc<"seasons">) {
  const targetName = input.targetName.trim().replace(/\s+/g, " ");
  if (targetName.length < 3 || targetName.length > 100 || [...targetName].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new ConvexError("Season name must be 3 to 100 characters, using letters, numbers and punctuation.");
  const targetCompetitionYear = input.targetCompetitionYear;
  if (!Number.isSafeInteger(targetCompetitionYear) || targetCompetitionYear <= source.year || targetCompetitionYear > 9999) throw new ConvexError("Enter a four-digit FIRST competition year later than the current season's.");
  const targetStartDate = date(input.targetStartDate);
  const targetEndDate = date(input.targetEndDate);
  if (targetEndDate <= targetStartDate) throw new ConvexError("Choose an end date after the start date.");
  const kickoff = kickoffForCompetitionYear(targetCompetitionYear);
  if (kickoff.state === "verified" && (kickoff.kickoffDate < targetStartDate || kickoff.kickoffDate > targetEndDate)) throw new ConvexError("FIRST kickoff falls outside these dates. Choose season dates that include kickoff day.");
  return { targetName, targetCompetitionYear, targetStartDate, targetEndDate };
}

async function checkNameAndYear(ctx: Ctx, values: ReturnType<typeof normalized>) {
  const name = await ctx.db.query("seasons").withIndex("by_name", q => q.eq("name", values.targetName)).first();
  if (name) throw new ConvexError("A season with this name already exists. Choose a different name.");
  const year = await ctx.db.query("seasons").withIndex("by_year", q => q.eq("year", values.targetCompetitionYear)).first();
  if (year) throw new ConvexError("A season for this competition year already exists. Choose a different year.");
}

function fingerprint(student: Doc<"students">) {
  return JSON.stringify([student._id, student.seasonId, student.userId ?? null, student.active, student.profileRevision ?? 0]);
}

async function draft(ctx: Ctx, planId: Doc<"seasonTransitionPlans">["_id"], expectedRevision: number) {
  const source = await activeSeason(ctx);
  const plan = await ctx.db.get(planId);
  if (!plan || plan.sourceSeasonId !== source._id || !plan.open || plan.state !== "draft") throw new ConvexError("This season draft was finished or discarded. Reload to see the latest.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== plan.revision) throw new ConvexError("This season draft changed since you opened it. Reload to see the latest, then try again.");
  return { source, plan };
}

export const overview = query({
  args: {}, returns: v.object({ source: v.object({ id: v.id("seasons"), name: v.string(), year: v.number(), buildHoursTarget: v.union(v.number(), v.null()) }), plan: v.union(planSummary, v.null()), kickoff: v.union(kickoff, v.null()) }),
  handler: async ctx => {
    requireRole(await viewer(ctx), "coach");
    const source = await activeSeason(ctx);
    const plan = await openPlan(ctx, source._id);
    return { source: { id: source._id, name: source.name, year: source.year, buildHoursTarget: source.buildHoursTarget ?? null }, plan: plan ? summary(plan) : null,
      kickoff: plan ? kickoffForCompetitionYear(plan.targetCompetitionYear) : null };
  },
});

/** The active season's Build hours goal shown on Student Home; null clears it. */
export const setBuildHoursTarget = mutation({
  args: { hours: v.union(v.number(), v.null()) }, returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    if (args.hours !== null && (!Number.isSafeInteger(args.hours) || args.hours < 1 || args.hours > 2000)) throw new ConvexError("Enter whole hours from 1 to 2000, or leave the box empty to clear the target.");
    const season = await activeSeason(ctx);
    const before = season.buildHoursTarget ?? null;
    if (before === args.hours) return before;
    await ctx.db.patch("seasons", season._id, { buildHoursTarget: args.hours ?? undefined });
    await audit(ctx, actor, "seasons", season._id, "setBuildHoursTarget", { buildHoursTarget: before }, { buildHoursTarget: args.hours });
    return args.hours;
  },
});

export const createDraft = mutation({
  args: { ...details, idempotencyKey: v.string() }, returns: v.id("seasonTransitionPlans"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const source = await activeSeason(ctx);
    const values = normalized(args, source);
    const idempotencyKey = args.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 100) throw new ConvexError("The season draft could not be saved. Reload the page and try again.");
    const requestHash = JSON.stringify([source._id, values]);
    const previous = await ctx.db.query("seasonTransitionPlans").withIndex("by_createdBy_and_idempotencyKey", q => q.eq("createdBy", actor._id).eq("idempotencyKey", idempotencyKey)).unique();
    if (previous) {
      if (previous.requestHash !== requestHash) throw new ConvexError("This season draft was already sent with different details. Reload to see the latest, then try again.");
      return previous._id;
    }
    if (await openPlan(ctx, source._id)) throw new ConvexError("A season draft already exists. Open it before creating another.");
    await checkNameAndYear(ctx, values);
    const now = Date.now();
    const id = await ctx.db.insert("seasonTransitionPlans", { sourceSeasonId: source._id, ...values, state: "draft", open: true, revision: 1,
      createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now, idempotencyKey, requestHash });
    await audit(ctx, actor, "seasonTransitionPlans", id, "createDraft", null, values);
    return id;
  },
});

export const updateDraft = mutation({
  args: { planId: v.id("seasonTransitionPlans"), expectedRevision: v.number(), ...details }, returns: v.number(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const { source, plan } = await draft(ctx, args.planId, args.expectedRevision);
    const values = normalized(args, source);
    await checkNameAndYear(ctx, values);
    const revision = plan.revision + 1;
    await ctx.db.patch(plan._id, { ...values, revision, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor, "seasonTransitionPlans", plan._id, "updateDraft", summary(plan), { ...values, revision });
    return revision;
  },
});

export const discardDraft = mutation({
  args: { planId: v.id("seasonTransitionPlans"), expectedRevision: v.number(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const { plan } = await draft(ctx, args.planId, args.expectedRevision);
    const reason = args.reason.trim();
    if (reason.length < 8 || reason.length > 500) throw new ConvexError("Enter a reason of 8 to 500 characters.");
    await ctx.db.patch(plan._id, { state: "cancelled", open: false, revision: plan.revision + 1, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor, "seasonTransitionPlans", plan._id, "discardDraft", "draft", "cancelled", reason);
    return null;
  },
});

export const rosterPage = query({
  args: { planId: v.id("seasonTransitionPlans"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ studentId: v.id("students"), legalName: v.string(), preferredName: v.string(), subteam: v.string(),
    studentFingerprint: v.string(), choice, decisionRevision: v.union(v.number(), v.null()), decisionStale: v.boolean() })),
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    const source = await activeSeason(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.sourceSeasonId !== source._id || !plan.open || plan.state !== "draft") throw new ConvexError("This season draft was finished or discarded. Reload to see the latest.");
    const options = args.paginationOpts;
    if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 50) throw new ConvexError("The roster could not load. Reload the page and try again.");
    if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new ConvexError("The roster could not load. Reload the page and try again.");
    const result = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", source._id).eq("active", true))
      .paginate({ ...options, maximumRowsRead: Math.min(options.maximumRowsRead ?? 51, 51) });
    if (result.page.length > 50) throw new ConvexError("Too many students to show at once. Reload the roster to see fewer at a time.");
    const page = await Promise.all(result.page.map(async student => {
      const decision = await ctx.db.query("seasonTransitionRosterDecisions").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", plan._id).eq("sourceStudentId", student._id)).unique();
      const studentFingerprint = fingerprint(student);
      return { studentId: student._id, legalName: student.legalName, preferredName: student.preferredName, subteam: student.subteam,
        studentFingerprint, choice: decision?.choice ?? null, decisionRevision: decision?.revision ?? null,
        decisionStale: decision !== null && decision?.studentFingerprint !== studentFingerprint };
    }));
    return { ...result, page };
  },
});

export const saveRosterDecision = mutation({
  args: { planId: v.id("seasonTransitionPlans"), studentId: v.id("students"), choice,
    expectedPlanRevision: v.number(), expectedStudentFingerprint: v.string(), expectedDecisionRevision: v.union(v.number(), v.null()) },
  returns: v.object({ planRevision: v.number(), decisionRevision: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const { source, plan } = await draft(ctx, args.planId, args.expectedPlanRevision);
    const student = await ctx.db.get(args.studentId);
    if (!student?.active || student.seasonId !== source._id) throw new ConvexError("This student is no longer active in the current season. Reload the roster to see the latest.");
    if (fingerprint(student) !== args.expectedStudentFingerprint) throw new ConvexError("This student's profile changed since you opened it. Reload the roster, then try again.");
    const old = await ctx.db.query("seasonTransitionRosterDecisions").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", plan._id).eq("sourceStudentId", student._id)).unique();
    if ((old?.revision ?? null) !== args.expectedDecisionRevision) throw new ConvexError("This student's season choice changed since you opened it. Reload the roster, then try again.");
    if ((old?.choice ?? null) === args.choice && (!old || old.studentFingerprint === fingerprint(student))) return { planRevision: plan.revision, decisionRevision: old?.revision ?? null };
    const now = Date.now();
    const decisionRevision = args.choice === null ? null : (old?.revision ?? 0) + 1;
    if (args.choice === null && old) await ctx.db.delete(old._id);
    else if (args.choice !== null && old) await ctx.db.patch(old._id, { choice: args.choice, studentFingerprint: fingerprint(student), revision: decisionRevision!, decidedBy: actor._id, decidedAt: now });
    else if (args.choice !== null) await ctx.db.insert("seasonTransitionRosterDecisions", { planId: plan._id, sourceStudentId: student._id, choice: args.choice,
      studentFingerprint: fingerprint(student), revision: decisionRevision!, decidedBy: actor._id, decidedAt: now });
    const planRevision = plan.revision + 1;
    await ctx.db.patch(plan._id, { revision: planRevision, updatedBy: actor._id, updatedAt: now });
    await audit(ctx, actor, "seasonTransitionRosterDecisions", `${plan._id}:${student._id}`, "setChoice", old?.choice ?? null, args.choice);
    return { planRevision, decisionRevision };
  },
});
