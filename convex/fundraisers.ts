import { requireSeasonFinanceReady, seasonFinanceControl } from "./lib/seasonFinance";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { activeSeason, audit, viewer } from "./lib/access";
import { fundraisingCapabilities, fundraisingSplit } from "./lib/fundraisingMath";
import { tokenHash } from "./lib/invitationIdentity";
import { financialAccount } from "./lib/financialSources";
import { availableOriginalFundraiserCredit, readFundraiserAggregates } from "./lib/reportAggregates";

const capabilities = v.object({ canCreate: v.boolean(), canChangePolicy: v.boolean(), canPost: v.boolean() });
const totals = v.object({ grossCents: v.number(), teamCents: v.number(), travelCreditCents: v.number(), memberCount: v.number() });
const studentRow = v.object({ studentId: v.id("students"), name: v.string(), grossCents: v.number(), teamCents: v.number(), travelCreditCents: v.number(), rowRevision: v.number(), financialRevision: v.union(v.number(), v.null()), financialState: v.union(v.literal("ready"), v.literal("updating")) });
const command = v.object({ studentId: v.id("students"), grossCents: v.number(), expectedRowRevision: v.number(), expectedFinancialRevision: v.number() });
const previewRow = v.object({ studentId: v.id("students"), grossCents: v.number(), teamCents: v.number(), travelCreditCents: v.number(), grossDeltaCents: v.number(), teamDeltaCents: v.number(), travelDeltaCents: v.number(), expectedRowRevision: v.number(), expectedFinancialRevision: v.union(v.number(), v.null()), availableOriginalCents: v.number(), requiredReductionCents: v.number(), state: v.union(v.literal("ready"), v.literal("hold"), v.literal("updating")), message: v.union(v.string(), v.null()) });

async function authorized(ctx: QueryCtx | MutationCtx) {
  const actor = await viewer(ctx);
  if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Fundraising access denied.");
  return actor;
}

async function currentFundraiser(ctx: QueryCtx | MutationCtx, id: Id<"fundraisers">) {
  const fundraiser = await ctx.db.get(id); const season = await activeSeason(ctx);
  if (!fundraiser || fundraiser.seasonId !== season._id) throw new Error("Fundraiser is unavailable in the active season.");
  return fundraiser;
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(schema.doc("fundraisers")), isDone: v.boolean(), continueCursor: v.string(), capabilities }),
  handler: async (ctx, args) => {
    const actor = await authorized(ctx); const season = await activeSeason(ctx);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 30) throw new Error("Request at most 30 fundraisers per page.");
    const page = await ctx.db.query("fundraisers").withIndex("by_seasonId_and_updatedAt", q => q.eq("seasonId", season._id)).order("desc").paginate({ ...args.paginationOpts, maximumRowsRead: 31 });
    if (page.page.length > 30) throw new Error("Fundraiser page exceeded its read budget.");
    return { page: page.page, isDone: page.isDone, continueCursor: page.continueCursor, capabilities: fundraisingCapabilities(actor) };
  },
});

export const create = mutation({
  args: { name: v.string(), teamBps: v.number(), studentBps: v.number(), idempotencyKey: v.string() }, returns: v.id("fundraisers"),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const actor = await authorized(ctx);
    if (!fundraisingCapabilities(actor).canCreate) throw new Error("Only a Coach may create a fundraiser.");
    const season = await activeSeason(ctx); const name = args.name.trim();
    if (!name || name.length > 150 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new Error("Provide a name and unique transaction key.");
    fundraisingSplit(0, args.studentBps, args.teamBps);
    const hash = await tokenHash(JSON.stringify([season._id, name, args.teamBps, args.studentBps]));
    const existing = await ctx.db.query("fundraisers").withIndex("by_createdBy_and_creationIdempotencyKey", q => q.eq("createdBy", actor._id).eq("creationIdempotencyKey", args.idempotencyKey)).unique();
    if (existing) {
      if (existing.creationHash !== hash) throw new Error("Transaction key is already used for a different fundraiser.");
      return existing._id;
    }
    const nameKey = name.toLocaleLowerCase("en-US");
    if (await ctx.db.query("fundraisers").withIndex("by_seasonId_and_nameKey", q => q.eq("seasonId", season._id).eq("nameKey", nameKey)).first()) throw new Error("A fundraiser with this name already exists in this season.");
    const now = Date.now();
    const id = await ctx.db.insert("fundraisers", { seasonId: season._id, name, nameKey, teamBps: args.teamBps, studentBps: args.studentBps, state: "draft", revision: 0, createdBy: actor._id, createdAt: now, updatedAt: now, creationIdempotencyKey: args.idempotencyKey, creationHash: hash });
    await audit(ctx, actor, "fundraisers", id, "create", null, { name, teamBps: args.teamBps, studentBps: args.studentBps });
    return id;
  },
});

export const workspace = query({
  args: { fundraiserId: v.id("fundraisers") },
  returns: v.object({ fundraiser: schema.doc("fundraisers"), capabilities, totals, job: v.union(schema.doc("fundraiserPostingJobs"), v.null()) }),
  handler: async (ctx, args) => {
    const actor = await authorized(ctx); const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    const job = fundraiser.postingJobId ? await ctx.db.get(fundraiser.postingJobId) : null;
    const maintenance = await seasonFinanceControl(ctx, fundraiser.seasonId);
    const currentCapabilities = fundraisingCapabilities(actor);
    if (maintenance && maintenance.state !== "ready") { currentCapabilities.canCreate = false; currentCapabilities.canPost = false; currentCapabilities.canChangePolicy = false; }
    return { fundraiser, capabilities: currentCapabilities, totals: await readFundraiserAggregates(ctx, fundraiser._id), job };
  },
});

export const students = query({
  args: { fundraiserId: v.id("fundraisers"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(studentRow), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await authorized(ctx); const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 30) throw new Error("Request at most 30 students per page.");
    const page = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", fundraiser.seasonId)).paginate({ ...args.paginationOpts, maximumRowsRead: 31 });
    if (page.page.length > 30) throw new Error("Student page exceeded its read budget.");
    const rows = [];
    for (const student of page.page) {
      if (!student.active) continue;
      const row = await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiser._id).eq("studentId", student._id)).unique();
      const account = await financialAccount(ctx, student._id);
      rows.push({ studentId: student._id, name: student.legalName || student.preferredName, grossCents: row?.grossCents ?? 0, teamCents: row?.teamCents ?? 0, travelCreditCents: row?.travelCreditCents ?? 0, rowRevision: row?.revision ?? 0, financialRevision: account?.state === "ready" && account.allocationSourceVersion === 1 ? account.revision : null, financialState: account?.state === "ready" && account.allocationSourceVersion === 1 ? "ready" as const : "updating" as const });
    }
    return { page: rows, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const preview = query({
  args: { fundraiserId: v.id("fundraisers"), expectedRevision: v.number(), rows: v.array(v.object({ studentId: v.id("students"), grossCents: v.number() })) },
  returns: v.object({ fundraiserRevision: v.number(), rows: v.array(previewRow) }),
  handler: async (ctx, args) => {
    const actor = await authorized(ctx);
    if (!fundraisingCapabilities(actor).canPost) throw new Error("Financial editing is not enabled for this account.");
    const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    if (fundraiser.revision !== args.expectedRevision || ["posting", "failed", "held", "closed"].includes(fundraiser.state)) throw new Error("Fundraiser changed or has unfinished posting; refresh before reviewing amounts.");
    if (!args.rows.length || args.rows.length > 20 || new Set(args.rows.map(r => r.studentId)).size !== args.rows.length) throw new Error("Preview at most 20 unique student rows per page.");
    const rows = [];
    for (const input of args.rows) {
      const student = await ctx.db.get(input.studentId);
      if (!student?.active || student.seasonId !== fundraiser.seasonId) throw new Error("Choose an active student in the current season.");
      const split = fundraisingSplit(input.grossCents, fundraiser.studentBps, fundraiser.teamBps);
      const previous = await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiser._id).eq("studentId", student._id)).unique();
      const account = await financialAccount(ctx, student._id);
      const available = account?.state === "ready" ? await availableOriginalFundraiserCredit(ctx, student._id, account.generation, fundraiser._id) : 0;
      const required = Math.max(0, (previous?.travelCreditCents ?? 0) - split.travelCreditCents);
      const state = account?.state !== "ready" || account?.allocationSourceVersion !== 1 ? "updating" as const : required > available ? "hold" as const : "ready" as const;
      rows.push({ studentId: student._id, ...split, grossDeltaCents: split.grossCents - (previous?.grossCents ?? 0), teamDeltaCents: split.teamCents - (previous?.teamCents ?? 0), travelDeltaCents: split.travelCreditCents - (previous?.travelCreditCents ?? 0), expectedRowRevision: previous?.revision ?? 0, expectedFinancialRevision: account?.state === "ready" && account.allocationSourceVersion === 1 ? account.revision : null, availableOriginalCents: available, requiredReductionCents: required, state, message: state === "updating" ? "Financial records must finish updating before posting." : state === "hold" ? "This student's travel credit was already spent or moved, so it can't be lowered yet. Balances have not changed. A Coach must sort it out." : null });
    }
    return { fundraiserRevision: fundraiser.revision, rows };
  },
});

export const post = mutation({
  args: { fundraiserId: v.id("fundraisers"), expectedRevision: v.number(), rows: v.array(command), reason: v.string(), idempotencyKey: v.string() }, returns: v.id("fundraiserPostingJobs"),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const actor = await authorized(ctx);
    if (!fundraisingCapabilities(actor).canPost) throw new Error("Financial editing is not enabled for this account.");
    const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    if (!args.rows.length || args.rows.length > 500 || new Set(args.rows.map(r => r.studentId)).size !== args.rows.length || args.reason.trim().length < 8 || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new Error("Provide unique student amounts, a reason, and a unique transaction key.");
    for (const row of args.rows) {
      fundraisingSplit(row.grossCents, fundraiser.studentBps, fundraiser.teamBps);
      if (!Number.isSafeInteger(row.expectedRowRevision) || row.expectedRowRevision < 0 || !Number.isSafeInteger(row.expectedFinancialRevision) || row.expectedFinancialRevision < 0) throw new Error("Refresh the preview before posting.");
    }
    const hash = await tokenHash(JSON.stringify([args.fundraiserId, args.expectedRevision, args.rows, args.reason.trim()]));
    const existing = await ctx.db.query("fundraiserPostingJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) { if (existing.operationHash !== hash) throw new Error("Transaction key is already used for different fundraiser amounts."); return existing._id; }
    if (fundraiser.revision !== args.expectedRevision || ["posting", "failed", "held", "closed"].includes(fundraiser.state)) throw new Error("Fundraiser changed or has unfinished posting; refresh before posting.");
    for (const input of args.rows) {
      const student = await ctx.db.get(input.studentId);
      if (!student?.active || student.seasonId !== fundraiser.seasonId) throw new Error("Choose active students in the current season before starting a posting job.");
    }
    const now = Date.now();
    const jobId = await ctx.db.insert("fundraiserPostingJobs", { requiredFinancialProjectionVersion: 4, fundraiserId: fundraiser._id, actorId: actor._id, originalActorId: actor._id, state: "running", cursor: null, processed: 0, committed: 0, held: 0, idempotencyKey: args.idempotencyKey, operationHash: hash, reason: args.reason.trim(), createdAt: now, updatedAt: now });
    for (const row of args.rows) await ctx.db.insert("fundraiserPostingRows", { jobId, ...row, state: "pending" });
    await ctx.db.patch(fundraiser._id, { state: "posting", revision: fundraiser.revision + 1, postingJobId: jobId, updatedAt: now });
    await audit(ctx, actor, "fundraisers", fundraiser._id, "startPosting", { revision: fundraiser.revision }, { jobId, rows: args.rows.length }, args.reason.trim());
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("fundraiserPosting:run"), { jobId });
    return jobId;
  },
});

export const updatePolicy = mutation({
  args: { fundraiserId: v.id("fundraisers"), expectedRevision: v.number(), teamBps: v.number(), studentBps: v.number(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const actor = await authorized(ctx); const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    if (!fundraisingCapabilities(actor).canChangePolicy) throw new Error("Only a Coach may change the fundraiser split.");
    if (fundraiser.state !== "draft" || fundraiser.revision !== args.expectedRevision || fundraiser.postingJobId) throw new Error("A posted fundraiser split is immutable. Refresh the draft before editing.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Provide a reason of at least eight characters.");
    fundraisingSplit(0, args.studentBps, args.teamBps);
    await ctx.db.patch(fundraiser._id, { teamBps: args.teamBps, studentBps: args.studentBps, revision: fundraiser.revision + 1, updatedAt: Date.now() });
    await audit(ctx, actor, "fundraisers", fundraiser._id, "updateSplit", { teamBps: fundraiser.teamBps, studentBps: fundraiser.studentBps }, { teamBps: args.teamBps, studentBps: args.studentBps }, args.reason.trim());
    return null;
  },
});

export const close = mutation({
  args: { fundraiserId: v.id("fundraisers"), expectedRevision: v.number(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const actor = await authorized(ctx); const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    if (!fundraisingCapabilities(actor).canChangePolicy) throw new Error("Only a Coach may close a fundraiser.");
    if (fundraiser.revision !== args.expectedRevision || ["posting", "failed", "held", "closed"].includes(fundraiser.state)) throw new Error("Fundraiser changed or has unfinished posting; resolve it before closing.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Provide a reason of at least eight characters.");
    await ctx.db.patch(fundraiser._id, { state: "closed", revision: fundraiser.revision + 1, updatedAt: Date.now() });
    await audit(ctx, actor, "fundraisers", fundraiser._id, "close", { state: fundraiser.state }, { state: "closed" }, args.reason.trim());
    return null;
  },
});

export const history = query({
  args: { fundraiserId: v.id("fundraisers"), studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(schema.doc("fundraiserAmountRevisions").extend({ recordState: v.union(v.literal("committed"), v.literal("processing"), v.literal("failed"), v.literal("held")) })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await authorized(ctx); const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    const student = await ctx.db.get(args.studentId);
    if (!student || student.seasonId !== fundraiser.seasonId) throw new Error("Student is unavailable in this season.");
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 30) throw new Error("Request at most 30 history rows per page.");
    const page = await ctx.db.query("fundraiserAmountRevisions").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiser._id).eq("studentId", student._id)).order("desc").paginate({ ...args.paginationOpts, maximumRowsRead: 31 });
    if (page.page.length > 30) throw new Error("History page exceeded its read budget.");
    const records = [];
    for (const revision of page.page) {
      const row = await ctx.db.get(revision.rowId); const job = await ctx.db.get(revision.jobId);
      const recordState = row?.state === "committed" && row.revisionId === revision._id ? "committed" as const : job?.state === "failed" ? "failed" as const : row?.state === "held" ? "held" as const : "processing" as const;
      records.push({ ...revision, recordState });
    }
    return { page: records, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const jobs = query({
  args: { fundraiserId: v.id("fundraisers"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(schema.doc("fundraiserPostingJobs").extend({ actorName: v.string() })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await authorized(ctx); const fundraiser = await currentFundraiser(ctx, args.fundraiserId);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 30) throw new Error("Request at most 30 posting jobs per page.");
    const page = await ctx.db.query("fundraiserPostingJobs").withIndex("by_fundraiserId", q => q.eq("fundraiserId", fundraiser._id)).order("desc").paginate({ ...args.paginationOpts, maximumRowsRead: 31 });
    if (page.page.length > 30) throw new Error("Job page exceeded its read budget.");
    const named = [];
    for (const job of page.page) { const actor = await ctx.db.get(job.actorId); named.push({ ...job, actorName: actor?.name ?? "Unavailable operator" }); }
    return { page: named, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
