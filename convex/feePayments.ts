import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { activeSeason, audit, viewer } from "./lib/access";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { cents, financialAccount, readyFinancialAccount, recordChargeChange, recordProjectedEntry } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";

const method = v.union(v.literal("cash"), v.literal("check"), v.literal("other"));
const filter = v.union(v.literal("all"), v.literal("paid"), v.literal("unpaid"));
const row = v.object({ rowKey: v.string(), studentId: v.id("students"), chargeId: v.id("charges"), amountCents: v.number(), expectedChargeRevision: v.number(), expectedFinancialGeneration: v.number(), expectedFinancialRevision: v.number() });
type ImportRow = typeof row.type;
type Ctx = QueryCtx | MutationCtx;

function editor(actor: Doc<"appUsers">) {
  if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead && actor.financialEdit)) throw new ConvexError("Financial editing is not enabled for this account.");
}
function token(value: string, label: string) {
  const trimmed = value.trim();
  if (value !== trimmed || !/^[A-Za-z0-9._:-]{8,100}$/.test(trimmed)) throw new ConvexError(`Provide a stable ${label} of 8 to 100 letters, digits, dots, underscores, colons, or hyphens.`);
  return trimmed;
}
function receiptMetadata(reference: string, occurredAt: number, exportId: string) {
  if (reference.trim().length > 150 || !Number.isSafeInteger(occurredAt) || occurredAt < 0 || !Number.isFinite(new Date(occurredAt).getTime())) throw new ConvexError("Provide a valid receipt reference and date.");
  return reference.trim() || `Fee CSV ${exportId}`;
}
function rowShape(item: ImportRow) {
  token(item.rowKey, "row key");
  if (!Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 || !Number.isSafeInteger(item.expectedChargeRevision) || item.expectedChargeRevision < 0 || !Number.isSafeInteger(item.expectedFinancialGeneration) || item.expectedFinancialGeneration < 1 || !Number.isSafeInteger(item.expectedFinancialRevision) || item.expectedFinancialRevision < 0) throw new ConvexError("A payment row has an invalid amount or version.");
}
async function selectedFee(ctx: Ctx, feeDefinitionId: Doc<"feeDefinitions">["_id"]) {
  const season = await activeSeason(ctx);
  const fee = await ctx.db.get(feeDefinitionId);
  if (!fee || fee.seasonId !== season._id || fee.state !== "active") throw new ConvexError("Choose an active fee in the current season.");
  return { season, fee };
}
async function rowState(ctx: Ctx, fee: Doc<"feeDefinitions">, item: ImportRow) {
  const [student, charge, account] = await Promise.all([ctx.db.get(item.studentId), ctx.db.get(item.chargeId), financialAccount(ctx, item.studentId)]);
  if (!student?.active || student.seasonId !== fee.seasonId || !charge || charge.studentId !== student._id || charge.feeDefinitionId !== fee._id || !account || account.seasonId !== fee.seasonId || account.state !== "ready" || account.allocationSourceVersion !== 1) return { state: "invalid" as const, message: "Student, fee charge, or financial records are unavailable.", studentName: null, chargedCents: null, appliedCents: null, owedCents: null };
  const chargedCents = effectiveChargeCents(charge);
  const owedCents = chargedCents - charge.appliedCents;
  const facts = { studentName: student.legalName, chargedCents, appliedCents: charge.appliedCents, owedCents };
  if ((charge.revision ?? 0) !== item.expectedChargeRevision || account.generation !== item.expectedFinancialGeneration || account.revision !== item.expectedFinancialRevision) return { state: "stale" as const, message: "This fee balance changed. Export a fresh file before recording this row.", ...facts };
  if (item.amountCents > owedCents || owedCents <= 0) return { state: "invalid" as const, message: "The new payment exceeds the amount owed for this fee.", ...facts };
  return { state: "ready" as const, message: null, ...facts };
}
function canonical(rows: ImportRow[]) { return [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey)).map(item => [item.rowKey, item.studentId, item.chargeId, item.amountCents, item.expectedChargeRevision, item.expectedFinancialGeneration, item.expectedFinancialRevision]); }
async function hash(value: unknown) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }

export const exportPage = query({
  args: { feeDefinitionId: v.id("feeDefinitions"), filter, paginationOpts: paginationOptsValidator },
  returns: v.object({ feeLabel: v.string(), page: v.array(v.object({ studentId: v.id("students"), chargeId: v.id("charges"), studentName: v.string(), chargedCents: v.number(), appliedCents: v.number(), owedCents: v.number(), chargeRevision: v.number(), financialGeneration: v.number(), financialRevision: v.number() })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    editor(await viewer(ctx));
    if (args.paginationOpts.numItems > 30 || args.paginationOpts.numItems < 1) throw new ConvexError("Export up to 30 fee charges per page.");
    const { fee } = await selectedFee(ctx, args.feeDefinitionId);
    const source = await ctx.db.query("charges").withIndex("by_feeDefinitionId", q => q.eq("feeDefinitionId", fee._id)).paginate(args.paginationOpts);
    const page = [];
    for (const charge of source.page) {
      const student = await ctx.db.get(charge.studentId);
      if (!student?.active || student.seasonId !== fee.seasonId) continue;
      const chargedCents = effectiveChargeCents(charge);
      const owedCents = chargedCents - charge.appliedCents;
      if (args.filter === "paid" && owedCents !== 0 || args.filter === "unpaid" && owedCents === 0) continue;
      const account = await financialAccount(ctx, student._id);
      if (!account || account.seasonId !== fee.seasonId || account.state !== "ready" || account.allocationSourceVersion !== 1) throw new ConvexError("Prepare financial records before exporting this fee.");
      page.push({ studentId: student._id, chargeId: charge._id, studentName: student.legalName, chargedCents, appliedCents: charge.appliedCents, owedCents, chargeRevision: charge.revision ?? 0, financialGeneration: account.generation, financialRevision: account.revision });
    }
    return { feeLabel: fee.label, page, isDone: source.isDone, continueCursor: source.continueCursor };
  },
});

export const previewRows = query({
  args: { feeDefinitionId: v.id("feeDefinitions"), exportId: v.string(), rows: v.array(row) },
  returns: v.array(v.object({ rowKey: v.string(), state: v.union(v.literal("ready"), v.literal("recorded"), v.literal("stale"), v.literal("invalid")), message: v.union(v.string(), v.null()), studentName: v.union(v.string(), v.null()), chargedCents: v.union(v.number(), v.null()), appliedCents: v.union(v.number(), v.null()), owedCents: v.union(v.number(), v.null()) })),
  handler: async (ctx, args) => {
    editor(await viewer(ctx)); token(args.exportId, "export batch ID");
    if (!args.rows.length || args.rows.length > 20 || new Set(args.rows.map(item => item.rowKey)).size !== args.rows.length) throw new ConvexError("Preview 1 to 20 distinct payment rows.");
    const { fee } = await selectedFee(ctx, args.feeDefinitionId);
    const batch = await ctx.db.query("feePaymentBatches").withIndex("by_seasonId_and_exportId", q => q.eq("seasonId", fee.seasonId).eq("exportId", args.exportId.trim())).unique();
    const result = [];
    for (const item of args.rows) {
      rowShape(item);
      const recorded = batch ? await ctx.db.query("feePaymentRows").withIndex("by_batchId_and_rowKey", q => q.eq("batchId", batch._id).eq("rowKey", item.rowKey)).unique() : null;
      const bound = batch?.rows.find(saved => saved.rowKey === item.rowKey);
      const live = await rowState(ctx, fee, item);
      const facts = { studentName: live.studentName, chargedCents: live.chargedCents, appliedCents: live.appliedCents, owedCents: live.owedCents };
      if (recorded && bound && JSON.stringify(canonical([bound])) === JSON.stringify(canonical([item]))) result.push({ rowKey: item.rowKey, state: "recorded" as const, message: "Already recorded in this batch.", ...facts });
      else if (recorded || batch && (!bound || JSON.stringify(canonical([bound])) !== JSON.stringify(canonical([item])))) result.push({ rowKey: item.rowKey, state: "invalid" as const, message: "The confirmed batch row changed.", ...facts });
      else result.push({ rowKey: item.rowKey, ...live });
    }
    return result;
  },
});

export const beginBatch = mutation({
  args: { feeDefinitionId: v.id("feeDefinitions"), exportId: v.string(), rows: v.array(row), method, reference: v.string(), occurredAt: v.number() },
  returns: v.object({ batchId: v.id("feePaymentBatches"), resumed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor);
    const { season, fee } = await selectedFee(ctx, args.feeDefinitionId);
    await requireSeasonFinanceReady(ctx, season._id);
    const exportId = token(args.exportId, "export batch ID");
    const reference = receiptMetadata(args.reference, args.occurredAt, exportId);
    if (!args.rows.length || args.rows.length > 500) throw new ConvexError("Confirm 1 to 500 payment rows per file.");
    for (const item of args.rows) rowShape(item);
    if (new Set(args.rows.map(item => item.rowKey)).size !== args.rows.length || new Set(args.rows.map(item => item.chargeId)).size !== args.rows.length || new Set(args.rows.map(item => item.studentId)).size !== args.rows.length) throw new ConvexError("A file repeats a row key, student, or fee charge.");
    const manifestHash = await hash([fee._id, args.method, reference, args.occurredAt, canonical(args.rows)]);
    const existing = await ctx.db.query("feePaymentBatches").withIndex("by_seasonId_and_exportId", q => q.eq("seasonId", season._id).eq("exportId", exportId)).unique();
    if (existing) {
      if (existing.feeDefinitionId !== fee._id || existing.manifestHash !== manifestHash || existing.rows.length !== args.rows.length) throw new ConvexError("This export batch was already confirmed with different payment rows or receipt details.");
      return { batchId: existing._id, resumed: true };
    }
    const batchId = await ctx.db.insert("feePaymentBatches", { seasonId: season._id, feeDefinitionId: fee._id, exportId, manifestHash, rows: args.rows, method: args.method, reference, occurredAt: args.occurredAt, createdBy: actor._id, createdAt: Date.now() });
    return { batchId, resumed: false };
  },
});

export const recordRow = mutation({
  args: { batchId: v.id("feePaymentBatches"), rowKey: v.string() },
  returns: v.object({ receiptId: v.id("ledgerEntries"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor);
    const batch = await ctx.db.get(args.batchId);
    const season = await activeSeason(ctx);
    if (!batch || batch.seasonId !== season._id) throw new ConvexError("Fee payment batch is unavailable in the active season.");
    const item = batch.rows.find(saved => saved.rowKey === args.rowKey);
    if (!item) throw new ConvexError("This row is not in the confirmed payment file.");
    const prior = await ctx.db.query("feePaymentRows").withIndex("by_batchId_and_rowKey", q => q.eq("batchId", batch._id).eq("rowKey", item.rowKey)).unique();
    if (prior) {
      const receipt = await ctx.db.get(prior.receiptId);
      const allocation = await ctx.db.get(prior.allocationId);
      if (!receipt || receipt.kind !== "payment" || receipt.studentId !== item.studentId || receipt.chargeId !== item.chargeId || receipt.amountCents !== item.amountCents || !allocation || allocation.kind !== "allocation" || allocation.sourceEntryId !== receipt._id || allocation.chargeId !== item.chargeId) throw new ConvexError("This recorded batch row needs a Coach financial review.");
      return { receiptId: prior.receiptId, replayed: true };
    }
    await requireSeasonFinanceReady(ctx, season._id);
    const { fee } = await selectedFee(ctx, batch.feeDefinitionId);
    const state = await rowState(ctx, fee, item);
    if (state.state !== "ready") throw new Error(state.message ?? "Export a fresh fee balance before recording this row.");
    const account = await readyFinancialAccount(ctx, item.studentId);
    const charge = await ctx.db.get(item.chargeId);
    if (!charge) throw new ConvexError("Fee charge is unavailable.");
    const effective = effectiveChargeCents(charge);
    const previousApplied = charge.appliedCents;
    const now = Date.now();
    const reason = `Fee-specific CSV payment for ${fee.label}`;
    const funds = cents(account.paidCents + account.personalAvailableCents + account.fundraisingAvailableCents);
    const receiptId = await ctx.db.insert("ledgerEntries", { studentId: item.studentId, chargeId: charge._id, eventId: charge.eventId, kind: "payment", amountCents: item.amountCents, previousCents: funds, newCents: cents(funds + item.amountCents), method: batch.method, reference: batch.reference, occurredAt: batch.occurredAt, reason, recordedBy: actor._id, recordedAt: now, idempotencyKey: `fee-payment:${batch._id}:${item.rowKey}:receipt` });
    await recordProjectedEntry(ctx, receiptId, account);
    charge.appliedCents = cents(previousApplied + item.amountCents);
    await ctx.db.patch(charge._id, { appliedCents: charge.appliedCents });
    const allocationId = await ctx.db.insert("ledgerEntries", { studentId: item.studentId, chargeId: charge._id, eventId: charge.eventId, kind: "allocation", amountCents: item.amountCents, previousCents: previousApplied, newCents: charge.appliedCents, sourceEntryId: receiptId, sourceKind: "payment", reason, recordedBy: actor._id, recordedAt: now, idempotencyKey: `fee-payment:${batch._id}:${item.rowKey}:allocation` });
    await recordProjectedEntry(ctx, allocationId, account);
    await recordChargeChange(ctx, account, charge, effective, previousApplied);
    await refreshStudentFinance(ctx, item.studentId);
    await ctx.db.insert("feePaymentRows", { batchId: batch._id, rowKey: item.rowKey, receiptId, allocationId, recordedBy: actor._id, recordedAt: now });
    await audit(ctx, actor, "charges", charge._id, "recordFeeSpecificPayment", { appliedCents: previousApplied }, { appliedCents: charge.appliedCents, receiptId, exportId: batch.exportId, rowKey: item.rowKey }, reason);
    return { receiptId, replayed: false };
  },
});
