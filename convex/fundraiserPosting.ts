import { requireSeasonTransitionFinancialAccess } from "./lib/seasonFinance";
import { recordFundraiserChange } from "./lib/financeChanges";
import { requireSeasonFinancialRetry } from "./lib/seasonFinance";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import schema from "./schema";
import { activeSeason, audit, viewer } from "./lib/access";
import { fundraisingCapabilities, fundraisingSplit } from "./lib/fundraisingMath";
import { financialAccount, recordProjectedEntry, requireNoFinancialJob, saveFinancialAccount } from "./lib/financialSources";
import { availableOriginalFundraiserCredit, updateFundraiserAggregate } from "./lib/reportAggregates";
import { allocateUnapplied } from "./lib/money";
import { refreshStudentFinance } from "./lib/financeSummaries";

const runRef = makeFunctionReference<"mutation">("fundraiserPosting:run");
const pageRef = makeFunctionReference<"mutation">("fundraiserPosting:processPage");

export const processPage = internalMutation({
  args: { jobId: v.id("fundraiserPostingJobs"), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running" || job.cursor !== args.cursor) return null;
    const actor = await ctx.db.get(job.actorId); const season = await activeSeason(ctx);
    await requireSeasonTransitionFinancialAccess(ctx, season._id, true); const fundraiser = await ctx.db.get(job.fundraiserId);
    if (!actor?.active || !fundraisingCapabilities(actor).canPost) throw new Error("Financial editing permission is unavailable; a Coach must retry.");
    if (!fundraiser || fundraiser.seasonId !== season._id || fundraiser.postingJobId !== job._id || fundraiser.state !== "posting") throw new Error("Fundraiser posting scope changed.");
    const page = await ctx.db.query("fundraiserPostingRows").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ cursor: job.cursor, numItems: 1, maximumRowsRead: 2 });
    if (page.page.length > 1) throw new Error("Fundraiser page exceeded its read budget.");
    const row = page.page[0];
    let committed = job.committed; let held = job.held; let advance = true;
    if (row && row.state !== "committed") {
      const student = await ctx.db.get(row.studentId); const account = await financialAccount(ctx, row.studentId);
      const previous = await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiser._id).eq("studentId", row.studentId)).unique();
      const split = fundraisingSplit(row.grossCents, fundraiser.studentBps, fundraiser.teamBps);
      const reduction = Math.max(0, (previous?.travelCreditCents ?? 0) - split.travelCreditCents);
      const locked = account?.fundraiserJobId === job._id && account.fundraiserRowId === row._id;
      if (account?.state === "ready" && !locked) await requireNoFinancialJob(ctx, account);
      const available = account ? await availableOriginalFundraiserCredit(ctx, row.studentId, account.generation, fundraiser._id) : 0;
      const unavailable = !student?.active || student.seasonId !== fundraiser.seasonId || !account || (!locked && account.state !== "ready") || job.requiredFinancialProjectionVersion === 4 && account?.allocationSourceVersion !== 1;
      const stale = !locked && (account?.revision !== row.expectedFinancialRevision || (previous?.revision ?? 0) !== row.expectedRowRevision);
      const spent = !locked && reduction > available;
      if (unavailable || stale || spent) {
        if (locked) throw new Error("Locked fundraiser student became unavailable; Coach retry is required.");
        await ctx.db.patch(row._id, { state: "held", holdCode: unavailable ? "projectionUnavailable" : stale ? "financialStateChanged" : "spentOrTransferred", message: unavailable ? "Financial records must finish updating." : stale ? "Financial amounts changed; refresh the preview before retrying." : "Original award credit was spent or transferred. Balances remain unchanged; Coach resolution is required." });
        held++;
      } else {
        if (!account) throw new Error("Financial account is unavailable.");
        const now = Date.now();
        let revisionId = row.pendingRevisionId;
        if (!revisionId) {
          revisionId = await ctx.db.insert("fundraiserAmountRevisions", { fundraiserId: fundraiser._id, seasonId: fundraiser.seasonId, studentId: row.studentId, previousGrossCents: previous?.grossCents ?? 0, ...split, previousTeamCents: previous?.teamCents ?? 0, previousTravelCreditCents: previous?.travelCreditCents ?? 0, teamBps: fundraiser.teamBps, studentBps: fundraiser.studentBps, recordedBy: actor._id, recordedAt: now, reason: job.reason, jobId: job._id, rowId: row._id });
          await ctx.db.patch(row._id, { pendingRevisionId: revisionId, reversedCents: 0 });
        }
        if (reduction) {
          account.state = "posting"; account.fundraiserJobId = job._id; account.fundraiserRowId = row._id;
          await saveFinancialAccount(ctx, account);
          let reversed = row.reversedCents ?? 0;
          const sources = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_fundraiserId_and_status", q => q.eq("studentId", row.studentId).eq("generation", account.generation).eq("fundraiserId", fundraiser._id).eq("status", "available")).take(20);
          for (const source of sources) {
            if (source.kind !== "fundraiser" || source.rootOriginEntryId !== source.sourceEntryId) throw new Error("Fundraiser reversal source is not an original award.");
            const amount = Math.min(reduction - reversed, source.availableCents);
            if (amount <= 0) continue;
            const entryId = await ctx.db.insert("ledgerEntries", { studentId: row.studentId, kind: "awardReversal", sourceEntryId: source.sourceEntryId, sourceKind: "fundraiser", fundraiserId: fundraiser._id, fundraiserRevisionId: revisionId, amountCents: amount, previousCents: source.availableCents, newCents: source.availableCents - amount, recordedBy: actor._id, recordedAt: now, reason: job.reason, idempotencyKey: `fundraiser:${row._id}:reverse:${reversed}:${source.sourceEntryId}` });
            await recordProjectedEntry(ctx, entryId, account); reversed += amount;
            if (reversed === reduction) break;
          }
          if (reversed < reduction && !sources.length) throw new Error("Original award availability changed during its locked reduction.");
          await ctx.db.patch(row._id, { reversedCents: reversed });
          advance = reversed === reduction;
        } else {
          const credit = split.travelCreditCents - (previous?.travelCreditCents ?? 0);
          if (credit > 0) {
            const entryId = await ctx.db.insert("ledgerEntries", { studentId: row.studentId, kind: "fundraiser", amountCents: credit, previousCents: account.travelShareCents, newCents: account.travelShareCents + credit, fundraiserId: fundraiser._id, fundraiserRevisionId: revisionId, recordedBy: actor._id, recordedAt: now, reason: job.reason, idempotencyKey: `fundraiser:${row._id}:award` });
            await ctx.db.patch(revisionId, { awardSourceEntryId: entryId });
            await recordProjectedEntry(ctx, entryId, account);
          }
        }
        if (advance) {
          const fields = { fundraiserId: fundraiser._id, seasonId: fundraiser.seasonId, studentId: row.studentId, ...split, revision: (previous?.revision ?? 0) + 1, latestRevisionId: revisionId, updatedAt: now };
          const totalId = previous ? previous._id : await ctx.db.insert("fundraiserStudentTotals", fields);
          if (previous) await ctx.db.patch(totalId, fields);
          const total = await ctx.db.get(totalId);
          if (!total) throw new Error("Fundraiser totals are unavailable.");
          await updateFundraiserAggregate(ctx, previous, total);
          account.knownRaisedCents += split.grossCents - (previous?.grossCents ?? 0);
          if (!Number.isSafeInteger(account.knownRaisedCents) || account.knownRaisedCents < 0) throw new Error("Gross Raised totals exceed the supported exact-cent range.");
          account.lastFinancialChangeAt = now;
          account.revision++; account.state = "ready"; account.fundraiserJobId = undefined; account.fundraiserRowId = undefined;
          await saveFinancialAccount(ctx, account);
          await ctx.db.patch(row._id, { state: "committed", revisionId, holdCode: undefined, message: undefined });
          const committedRevision = await ctx.db.get(revisionId);
          if (!committedRevision) throw new Error("Fundraiser revision is unavailable.");
          await recordFundraiserChange(ctx, committedRevision);
          committed++;
          await audit(ctx, actor, "fundraiserStudentTotals", totalId, "postAmount", previous, fields, job.reason);
          await allocateUnapplied(ctx, actor, row.studentId, `fundraiser:${row._id}:allocate`, undefined, job._id);
        }
        await refreshStudentFinance(ctx, row.studentId);
      }
    }
    const done = advance && page.isDone;
    const state = done ? held ? "held" as const : "complete" as const : "running" as const;
    await ctx.db.patch(job._id, { cursor: advance ? page.continueCursor : job.cursor, processed: job.processed + (row && advance ? 1 : 0), committed, held, state, updatedAt: Date.now() });
    if (done) await ctx.db.patch(fundraiser._id, { state: held ? "held" : "posted", updatedAt: Date.now() });
    else await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    return null;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("fundraiserPostingJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running") return null;
    try { await ctx.runMutation(pageRef, { jobId: job._id, cursor: job.cursor }); }
    catch (error) {
      await ctx.db.patch(job._id, { state: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Fundraiser posting failed; Coach review is required.", updatedAt: Date.now() });
      await ctx.db.patch(job.fundraiserId, { state: "failed" });
      const page = await ctx.db.query("fundraiserPostingRows").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ cursor: job.cursor, numItems: 1, maximumRowsRead: 2 });
      const current = page.page[0];
      const account = current ? await financialAccount(ctx, current.studentId) : null;
      if (account?.fundraiserJobId === job._id && account.fundraiserRowId === current?._id) await ctx.db.patch(account._id, { state: "failed", lastError: "Fundraiser reduction failed; Coach retry is required." });
    }
    return null;
  },
});

export const rows = query({
  args: { jobId: v.id("fundraiserPostingJobs"), paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(schema.doc("fundraiserPostingRows").extend({ name: v.string() })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId); const fundraiser = job ? await ctx.db.get(job.fundraiserId) : null;
    if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead) || !fundraiser || fundraiser.seasonId !== season._id) throw new Error("Fundraiser history access denied.");
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 30) throw new Error("Request at most 30 rows per page.");
    const page = await ctx.db.query("fundraiserPostingRows").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).paginate({ ...args.paginationOpts, maximumRowsRead: 31 });
    if (page.page.length > 30) throw new Error("Fundraiser page exceeded its read budget.");
    const named = [];
    for (const row of page.page) { const student = await ctx.db.get(row.studentId); named.push({ ...row, name: student?.legalName || student?.preferredName || "Unavailable student" }); }
    return { page: named, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const retryPreview = query({
  args: { jobId: v.id("fundraiserPostingJobs"), studentIds: v.array(v.id("students")) },
  returns: v.array(v.object({ studentId: v.id("students"), name: v.string(), grossCents: v.number(), expectedRowRevision: v.number(), expectedFinancialRevision: v.union(v.number(), v.null()), requiredReductionCents: v.number(), availableOriginalCents: v.number(), state: v.union(v.literal("ready"), v.literal("hold"), v.literal("updating")), message: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId); const fundraiser = job ? await ctx.db.get(job.fundraiserId) : null;
    if (actor.role !== "coach" || !job || !fundraiser || fundraiser.seasonId !== season._id || !["held", "failed"].includes(job.state)) throw new Error("Coach retry preview is unavailable.");
    if (!args.studentIds.length || args.studentIds.length > 20 || new Set(args.studentIds).size !== args.studentIds.length) throw new Error("Preview at most 20 unique held students.");
    const result = [];
    for (const studentId of args.studentIds) {
      const row = await ctx.db.query("fundraiserPostingRows").withIndex("by_jobId_and_studentId", q => q.eq("jobId", job._id).eq("studentId", studentId)).unique();
      if (!row || row.state !== "held" || row.pendingRevisionId) throw new Error("Only held uncommitted rows may refresh their reviewed revisions.");
      const student = await ctx.db.get(studentId); const account = await financialAccount(ctx, studentId);
      const previous = await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiser._id).eq("studentId", studentId)).unique();
      const split = fundraisingSplit(row.grossCents, fundraiser.studentBps, fundraiser.teamBps);
      const required = Math.max(0, (previous?.travelCreditCents ?? 0) - split.travelCreditCents);
      const available = account ? await availableOriginalFundraiserCredit(ctx, studentId, account.generation, fundraiser._id) : 0;
      const state = !student?.active || student.seasonId !== fundraiser.seasonId || account?.state !== "ready" || account?.allocationSourceVersion !== 1 ? "updating" as const : required > available ? "hold" as const : "ready" as const;
      result.push({ studentId, name: student?.legalName || student?.preferredName || "Unavailable student", grossCents: row.grossCents, expectedRowRevision: previous?.revision ?? 0, expectedFinancialRevision: account?.state === "ready" && account.allocationSourceVersion === 1 ? account.revision : null, requiredReductionCents: required, availableOriginalCents: available, state, message: state === "hold" ? "Original credit remains spent or transferred; balances remain unchanged." : state === "updating" ? "Student financial preparation must finish." : null });
    }
    return result;
  },
});

export const retry = mutation({
  args: { jobId: v.id("fundraiserPostingJobs"), reason: v.string(), rows: v.array(v.object({ studentId: v.id("students"), expectedRowRevision: v.number(), expectedFinancialRevision: v.number() })) }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const season = await activeSeason(ctx); const job = await ctx.db.get(args.jobId); const fundraiser = job ? await ctx.db.get(job.fundraiserId) : null;
    if (actor.role !== "coach") throw new Error("Only a Coach may retry fundraiser posting.");
    if (!job || !fundraiser || fundraiser.seasonId !== season._id || !["failed", "held"].includes(job.state) || fundraiser.postingJobId !== job._id) throw new Error("No held or failed fundraiser posting is available to retry.");
    await requireSeasonFinancialRetry(ctx, season._id, job._id);
    if (args.reason.trim().length < 8 || args.reason.length > 1000 || args.rows.length > 500 || new Set(args.rows.map(r => r.studentId)).size !== args.rows.length) throw new Error("Provide a reason and unique reviewed rows.");
    for (const input of args.rows) {
      if (!Number.isSafeInteger(input.expectedRowRevision) || input.expectedRowRevision < 0 || !Number.isSafeInteger(input.expectedFinancialRevision) || input.expectedFinancialRevision < 0) throw new Error("Refresh reviewed row revisions before retrying.");
      const row = await ctx.db.query("fundraiserPostingRows").withIndex("by_jobId_and_studentId", q => q.eq("jobId", job._id).eq("studentId", input.studentId)).unique();
      if (!row || row.state !== "held" || row.pendingRevisionId) throw new Error("Only uncommitted held rows may refresh their reviewed revisions.");
      await ctx.db.patch(row._id, { expectedRowRevision: input.expectedRowRevision, expectedFinancialRevision: input.expectedFinancialRevision, state: "pending", holdCode: undefined, message: undefined });
    }
    await audit(ctx, actor, "fundraiserPostingJobs", job._id, "retry", { actorId: job.actorId, committed: job.committed }, { actorId: actor._id, reviewedRows: args.rows.length }, args.reason.trim());
    await ctx.db.patch(job._id, { actorId: actor._id, state: "running", cursor: job.state === "held" ? null : job.cursor, processed: job.state === "held" ? 0 : job.processed, held: job.state === "held" ? 0 : job.held, lastError: undefined, updatedAt: Date.now() });
    await ctx.db.patch(fundraiser._id, { state: "posting", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    return null;
  },
});
