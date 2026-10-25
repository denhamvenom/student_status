import { savedPublicError, publicErrorResult } from './lib/publicErrors';
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeSeason, viewer } from "./lib/access";
import { chargeAppliedSources, readyFinancialAccount } from "./lib/financialSources";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { seasonFinanceControl } from "./lib/seasonFinance";
import { boundedFinancePage } from "./financeAdmin";
const runRef = makeFunctionReference<"mutation">("financeExport:run");
const pageRef = makeFunctionReference<"mutation">("financeExport:processPage");
const nullable = v.union(v.number(), v.null());
const metadata = { schemaVersion: v.literal(1), scopeHash: v.string(), collectedAt: v.number() };
export const CSV_COLUMNS = ["Season ID", "Student ID", "Student", "Charge ID", "Charge", "Event", "Original cents", "Adjusted cents", "Canceled cents", "Effective cents", "Personal applied cents", "Fundraising applied cents", "Due cents", "Personal available cents (non-additive)", "Fundraising available cents (non-additive)", "Financial generation", "Financial revision", "Collected at"];
/** Quote every cell and neutralize spreadsheet formulas in text, preserving numeric cents. */
export function csvCell(value: string | number) {
  const text = String(value); let start = 0;
  while (start < text.length && (text.charCodeAt(start) <= 32 || /\s/u.test(text[start]))) start++;
  const safe = typeof value === "string" && /^[=+@-]/u.test(text.slice(start)) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
async function digest(text: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
async function exportViewer(ctx: QueryCtx | MutationCtx) { const actor = await viewer(ctx); if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Financial export access is not enabled for this account."); return actor; }
async function financialScopeReady(ctx: QueryCtx | MutationCtx, seasonId: Id<"seasons">) { const maintenance = await seasonFinanceControl(ctx, seasonId); if (maintenance && maintenance.state !== "ready") throw new Error("Finish shared fee maintenance before collecting financial exports."); }
async function authorize(ctx: QueryCtx | MutationCtx, jobId: Id<"financeExportJobs">, ready = true) {
  const actor = await exportViewer(ctx); const season = await activeSeason(ctx); const job = await ctx.db.get(jobId);
  if (!job || job.createdBy !== actor._id || job.seasonId !== season._id) throw new Error("Export is unavailable to this account or season.");
  if (ready && job.expiresAt <= Date.now()) throw new Error("Export expired; prepare a new export.");
  if (ready && job.state !== "ready") throw new Error("Finish export membership preparation before collecting records.");
  if (ready) await financialScopeReady(ctx, job.seasonId); return job;
}
async function memberAccount(ctx: QueryCtx | MutationCtx, job: Doc<"financeExportJobs">, member: Doc<"financeExportMembers">, preparing = false) {
  const student = await ctx.db.get(member.studentId);
  if (!student?.active || student.seasonId !== job.seasonId) throw new Error("An export member is no longer active in this season; discard the collection and prepare again.");
  const account = await readyFinancialAccount(ctx, student._id);
  if (!preparing && (account.generation !== member.generation || account.revision !== member.financialRevision || account.chargeCount !== member.chargeCount)) throw new Error("Financial records changed after export preparation; discard the collection and prepare again.");
  return { student, account };
}
export const prepare = mutation({
  args: { scope: v.union(v.literal("allActive"), v.literal("selected")), studentIds: v.optional(v.array(v.id("students"))), idempotencyKey: v.string() }, returns: v.id("financeExportJobs"),
  handler: async (ctx, args) => {
    const actor = await exportViewer(ctx); const season = await activeSeason(ctx); await financialScopeReady(ctx, season._id);
    if (!args.idempotencyKey.trim() || args.idempotencyKey.length > 150 || args.scope === "allActive" && args.studentIds !== undefined || args.scope === "selected" && (!args.studentIds?.length || args.studentIds.length > 500 || new Set(args.studentIds).size !== args.studentIds.length)) throw new ConvexError("Choose all active members or between 1 and 500 distinct selected members and provide an export key.");
    const ids = [...args.studentIds ?? []].sort(); const requestHash = await digest(JSON.stringify({ seasonId: season._id, scope: args.scope, ids }));
    const previous = await ctx.db.query("financeExportJobs").withIndex("by_createdBy_and_idempotencyKey", q => q.eq("createdBy", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (previous) { if (previous.requestHash !== requestHash || previous.expiresAt <= Date.now()) throw new ConvexError("Export key was used for a different or expired scope."); return previous._id; }
    const now = Date.now(); const jobId = await ctx.db.insert("financeExportJobs", { createdBy: actor._id, seasonId: season._id, scope: args.scope, state: "preparing", createdAt: now, expiresAt: now + 30 * 60 * 1000, cursor: null, memberCount: 0, scopeHash: await digest(requestHash), requestHash, idempotencyKey: args.idempotencyKey });
    for (const studentId of ids) await ctx.db.insert("financeExportMembers", { jobId, studentId });
    await ctx.scheduler.runAfter(0, runRef, { jobId }); return jobId;
  },
});
export const retry = mutation({
  args: { jobId: v.id("financeExportJobs") }, returns: v.null(),
  handler: async (ctx, args) => { const job = await authorize(ctx, args.jobId, false); if (job.expiresAt <= Date.now()) throw new ConvexError("Export expired; prepare a new export."); if (job.state !== "failed") throw new ConvexError("Only failed export preparation can be retried."); await financialScopeReady(ctx, job.seasonId); await ctx.db.patch(job._id, { state: "preparing", lastError: undefined }); await ctx.scheduler.runAfter(0, runRef, { jobId: job._id }); return null; },
});
export const run = internalMutation({
  args: { jobId: v.id("financeExportJobs") }, returns: v.null(),
  handler: async (ctx, args) => { const job = await ctx.db.get(args.jobId); if (!job || job.state !== "preparing") return null; try { await ctx.runMutation(pageRef, { jobId: job._id, cursor: job.cursor }); } catch (error) { await ctx.db.patch(job._id, { state: job.expiresAt <= Date.now() ? "expired" : "failed", lastError: savedPublicError(error, "Export preparation failed.") }); } return null; },
});
export const processPage = internalMutation({
  args: { jobId: v.id("financeExportJobs"), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId); if (!job || job.state !== "preparing" || job.cursor !== args.cursor) return null;
    const actor = await ctx.db.get(job.createdBy); const season = await activeSeason(ctx);
    if (!actor?.active || actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead) || season._id !== job.seasonId || job.expiresAt <= Date.now()) throw new Error("Export preparation authorization or expiry changed.");
    await financialScopeReady(ctx, job.seasonId); const opts = { cursor: job.cursor, numItems: 20, maximumRowsRead: 21 };
    let cursor: string; let done: boolean; let members: Doc<"financeExportMembers">[];
    if (job.scope === "selected") { const page = await ctx.db.query("financeExportMembers").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate(opts); members = page.page; cursor = page.continueCursor; done = page.isDone; }
    else {
      const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", job.seasonId).eq("active", true).lte("_creationTime", job.createdAt)).paginate(opts);
      if (page.page.length > 20) throw new Error("Export preparation exceeded its page budget.");
      members = []; for (const student of page.page) { const id = await ctx.db.insert("financeExportMembers", { jobId: job._id, studentId: student._id }); const member = await ctx.db.get(id); if (!member) throw new Error("Export member was not captured."); members.push(member); }
      cursor = page.continueCursor; done = page.isDone;
    }
    if (members.length > 20 || job.memberCount + members.length > 500) throw new Error("Export preparation exceeds the supported 500-member roster.");
    let scopeHash = job.scopeHash;
    for (const member of members) { const { account } = await memberAccount(ctx, job, member, true); const collectedAt = Date.now(); await ctx.db.patch(member._id, { generation: account.generation, financialRevision: account.revision, chargeCount: account.chargeCount, collectedAt }); scopeHash = await digest(`${scopeHash}:${member.studentId}:${account.generation}:${account.revision}:${account.chargeCount}`); }
    await ctx.db.patch(job._id, { cursor: done ? null : cursor, memberCount: job.memberCount + members.length, scopeHash, state: done ? "ready" : "preparing", completedAt: done ? Date.now() : undefined }); if (!done) await ctx.scheduler.runAfter(0, runRef, { jobId: job._id }); return null;
  },
});
export const status = query({
  args: { jobId: v.id("financeExportJobs") }, returns: v.object({ jobId: v.id("financeExportJobs"), seasonId: v.id("seasons"), scope: v.union(v.literal("allActive"), v.literal("selected")), state: v.union(v.literal("preparing"), v.literal("ready"), v.literal("failed"), v.literal("expired")), memberCount: v.number(), scopeHash: v.string(), createdAt: v.number(), completedAt: nullable, expiresAt: v.number(), lastError: v.union(v.string(), v.null()), schemaVersion: v.literal(1), columns: v.array(v.string()) }),
  handler: async (ctx, args) => { const job = await authorize(ctx, args.jobId, false); return publicErrorResult({ jobId: job._id, seasonId: job.seasonId, scope: job.scope, state: job.state, memberCount: job.memberCount, scopeHash: job.scopeHash, createdAt: job.createdAt, completedAt: job.completedAt ?? null, expiresAt: job.expiresAt, lastError: job.lastError ?? null, schemaVersion: 1 as const, columns: CSV_COLUMNS }); },
});
const memberRow = v.object({ studentId: v.id("students"), name: v.string(), generation: v.number(), financialRevision: v.number(), chargeCount: v.number(), capturedAt: v.number() });
export const members = mutation({
  args: { jobId: v.id("financeExportJobs"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(memberRow).extend(metadata),
  handler: async (ctx, args) => { const job = await authorize(ctx, args.jobId); const page = await ctx.db.query("financeExportMembers").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate(boundedFinancePage(args.paginationOpts)); if (page.page.length > 20) throw new ConvexError("Export membership expanded beyond its page budget."); const result = []; for (const member of page.page) { const { student, account } = await memberAccount(ctx, job, member); result.push({ studentId: student._id, name: student.legalName || student.preferredName, generation: account.generation, financialRevision: account.revision, chargeCount: member.chargeCount!, capturedAt: member.collectedAt! }); } return { ...page, page: result, schemaVersion: 1 as const, scopeHash: job.scopeHash, collectedAt: Date.now() }; },
});
const chargeRow = v.object({ seasonId: v.id("seasons"), studentId: v.id("students"), studentName: v.string(), chargeId: v.id("charges"), label: v.string(), eventName: v.union(v.string(), v.null()), originalCents: v.number(), adjustedCents: v.number(), cancelledCents: v.number(), effectiveCents: v.number(), personalAppliedCents: v.number(), fundraisingAppliedCents: v.number(), dueCents: v.number(), personalAvailableCents: v.number(), fundraisingAvailableCents: v.number(), generation: v.number(), financialRevision: v.number(), collectedAt: v.number(), csvLine: v.string() });
export const charges = mutation({
  args: { jobId: v.id("financeExportJobs"), studentId: v.id("students"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(chargeRow).extend(metadata),
  handler: async (ctx, args) => {
    const job = await authorize(ctx, args.jobId); const member = await ctx.db.query("financeExportMembers").withIndex("by_jobId_and_studentId", q => q.eq("jobId", job._id).eq("studentId", args.studentId)).unique(); if (!member) throw new ConvexError("Student is outside the prepared export scope.");
    const { student, account } = await memberAccount(ctx, job, member); const page = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", student._id)).paginate(boundedFinancePage(args.paginationOpts)); if (page.page.length > 20) throw new ConvexError("Export charge page expanded beyond its page budget.");
    const collectedAt = Date.now(); const result = [];
    for (const charge of page.page) {
      const net = await ctx.db.query("financialChargeAllocations").withIndex("by_studentId_and_generation_and_chargeId", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("chargeId", charge._id)).unique();
      const split = chargeAppliedSources(net, charge.appliedCents); const effective = effectiveChargeCents(charge); if (charge.appliedCents > effective) throw new ConvexError("Charge applied amount exceeds its obligation."); const event = charge.eventId ? await ctx.db.get(charge.eventId) : null; if (event && event.seasonId !== job.seasonId) throw new ConvexError("Charge event belongs to another season.");
      const row = { seasonId: job.seasonId, studentId: student._id, studentName: student.legalName || student.preferredName, chargeId: charge._id, label: charge.label, eventName: event?.name ?? null, originalCents: charge.amountCents, adjustedCents: charge.adjustedCents ?? 0, cancelledCents: charge.cancelledCents ?? 0, effectiveCents: effective, ...split, dueCents: effective - charge.appliedCents, personalAvailableCents: account.personalAvailableCents, fundraisingAvailableCents: account.fundraisingAvailableCents, generation: account.generation, financialRevision: account.revision, collectedAt };
      const cells = [row.seasonId, row.studentId, row.studentName, row.chargeId, row.label, row.eventName ?? "", row.originalCents, row.adjustedCents, row.cancelledCents, row.effectiveCents, row.personalAppliedCents, row.fundraisingAppliedCents, row.dueCents, row.personalAvailableCents, row.fundraisingAvailableCents, row.generation, row.financialRevision, row.collectedAt]; result.push({ ...row, csvLine: cells.map(csvCell).join(",") });
    }
    return { ...page, page: result, schemaVersion: 1 as const, scopeHash: job.scopeHash, collectedAt };
  },
});
/** Run every member page again immediately before downloading; rejection discards all buffered rows. */
export const verify = members;
