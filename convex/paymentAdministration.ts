import { savedPublicError, publicErrorResult } from './lib/publicErrors';
import { normalizeEmail } from "./lib/contactValidation";
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { activeSeason, audit, viewer } from "./lib/access";
import { tokenHash } from "./lib/invitationIdentity";
import { cents, ensureFinancialAccount, financialAccount, readyFinancialAccount, recordChargeChange, recordProjectedEntry, requireNoFinancialJob, saveFinancialAccount } from "./lib/financialSources";
import { effectiveChargeCents, allocateUnapplied } from "./lib/money";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { recordFinanceChange } from "./lib/financeChanges";
import { financeRow } from "./lib/financeRow";
import { queueMoneyDigest } from "./lib/digest";
import { requireSeasonFinanceReady, requireSeasonFinancialContinuation, requireSeasonFinancialRetry } from "./lib/seasonFinance";

type Ctx = MutationCtx | QueryCtx;
const runRef = makeFunctionReference<"mutation">("paymentAdministration:runCorrection");
const pageRef = makeFunctionReference<"mutation">("paymentAdministration:correctionPage");
const method = v.union(v.literal("cash"), v.literal("check"), v.literal("other"));
const row = v.object({ studentEmail: v.optional(v.string()), studentId: v.optional(v.id("students")), amountCents: v.number(), method, reference: v.string(), occurredAt: v.number(), rowReference: v.string() });
type Method = "cash" | "check" | "other";
const methodLabel = (value: Method | null | undefined) => value === "cash" ? "Cash" : value === "check" ? "Check" : value === "other" ? "Other" : "Not recorded";
const money = (value: number) => `$${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const canEditMoney = (actor: Doc<"appUsers">) => actor.active && (actor.role === "coach" || (actor.role === "mentor" && actor.travelLead && actor.financialEdit));
function editor(actor: Doc<"appUsers">) { if (!canEditMoney(actor)) throw new ConvexError("Only a Coach or a Travel Lead with Money editing access can do this. Ask a Coach if you need a payment changed."); }
function why(value: string) { const text = value.trim(); if (text.length < 8 || text.length > 1000) throw new ConvexError("Enter a reason of at least 8 characters (up to 1,000), then try again."); return text; }
function text(value: string, label: string) { const result = value.trim(); if (!result || result.length > 150) throw new ConvexError(`Provide ${label} of 1 to 150 characters.`); return result; }
/** Cash needs no check or receipt number (owner decision November 9, 2026); check and other payments do. */
function paymentReference(value: string, kind: Method) { const result = value.trim(); if (result.length > 150) throw new ConvexError("Keep the check or receipt number to 150 characters or fewer."); if (!result && kind !== "cash") throw new ConvexError(kind === "check" ? "Enter the check number." : "Enter a receipt number or note for this payment."); return result; }
function receiptFields(value: { amountCents: number; method: Method; reference: string; occurredAt: number; rowReference: string }) { if (!Number.isSafeInteger(value.amountCents) || value.amountCents <= 0) throw new ConvexError("Enter an amount greater than $0.00."); if (!Number.isSafeInteger(value.occurredAt) || value.occurredAt < 0 || !Number.isFinite(new Date(value.occurredAt).getTime())) throw new ConvexError("Enter the date the payment was received."); paymentReference(value.reference, value.method); text(value.rowReference, "a payment number"); }
async function payment(ctx: Ctx, id: Id<"ledgerEntries">) {
  const actor = await viewer(ctx); editor(actor);
  const entry = await ctx.db.get(id); const season = await activeSeason(ctx);
  const student = entry ? await ctx.db.get(entry.studentId) : null;
  if (!entry || entry.kind !== "payment" || !student?.active || student.seasonId !== season._id) throw new ConvexError("This payment isn't in the current season. Reload to see the latest.");
  const account = await financialAccount(ctx, student._id);
  const source = account ? await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("sourceEntryId", entry._id)).unique() : null;
  return { actor, entry, student, account, source };
}
const previewValidator = v.object({ state: v.union(v.literal("ready"), v.literal("hold"), v.literal("updating")), message: v.union(v.string(), v.null()), originalAmountCents: v.number(), currentAmountCents: v.union(v.number(), v.null()), targetAmountCents: v.number(), releaseRequiredCents: v.union(v.number(), v.null()), irreversibleSpentCents: v.union(v.number(), v.null()), expectedSourceRevision: v.union(v.number(), v.null()), expectedFinancialRevision: v.union(v.number(), v.null()) });
const editValidator = v.object({ at: v.number(), actorName: v.string(), reason: v.string(), summary: v.string() });
type Details = { studentId: Id<"students">; amountCents: number; method: Method | null; reference: string | null };
/** The payment's method and check or receipt number after any edits; the original ledger row is never rewritten. */
async function currentDetails(ctx: Ctx, entry: Doc<"ledgerEntries">) {
  // Only the latest edit can be unfinished: a payment can't be edited again while an edit is saving or stopped.
  const [latest, previous] = await ctx.db.query("paymentEdits").withIndex("by_sourceEntryId_and_at", q => q.eq("sourceEntryId", entry._id)).order("desc").take(2);
  const toName = latest && latest.after.studentId !== latest.before.studentId ? await studentName(ctx, latest.after.studentId) : null;
  const job = latest?.correctionJobId ? await ctx.db.get(latest.correctionJobId) : null;
  // A move records the payment on the new student only when the correction finishes, so an unfinished edit is shown, not hidden.
  const pending = job && job.state !== "complete" ? { state: job.state === "failed" ? "failed" as const : "running" as const, movingToName: latest?.movedEntryId ? null : toName } : null;
  // While an edit is unfinished its new method and number don't apply yet; show the details that do.
  const applied = pending ? previous : latest;
  return { lastEditId: latest?._id ?? null, unfinishedEdit: pending ? latest : null, method: applied ? applied.after.method : entry.method ?? null, reference: applied ? applied.after.reference : entry.reference ?? null, movedEntryId: latest?.movedEntryId ?? null, movedToName: latest?.movedEntryId ? toName : null, pending };
}
const pendingValidator = v.union(v.null(), v.object({ state: v.union(v.literal("running"), v.literal("failed")), movingToName: v.union(v.string(), v.null()) }));
const staleEditMessage = "Someone else changed this payment. Reload to see the latest, then try again.";
const zeroMoveMessage = "This payment is $0, so there is nothing to move.";
const updatingMessage = (name: string) => `${name}'s money records are still updating. Wait a moment, then try again.`;
/** A payment can only move to a student whose account can take it now; say what to do instead of failing later. */
async function requireTargetReady(ctx: Ctx, target: Doc<"students">) {
  const name = target.legalName || target.preferredName || "This student";
  const account = await financialAccount(ctx, target._id);
  if (!account) {
    const history = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", target._id)).first();
    const charge = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", target._id)).first();
    if (history || charge) throw new ConvexError(`${name}'s account needs preparing first. A Coach can choose Prepare account on the Money page, then move this payment.`);
    return;
  }
  if (account.state !== "ready" || account.allocationSourceVersion !== 1) throw new ConvexError(updatingMessage(name));
  try { await requireNoFinancialJob(ctx, account); } catch { throw new ConvexError(updatingMessage(name)); }
}
async function editHistory(ctx: Ctx, sourceEntryId: Id<"ledgerEntries">) {
  const rows = await ctx.db.query("paymentEdits").withIndex("by_sourceEntryId_and_at", q => q.eq("sourceEntryId", sourceEntryId)).order("desc").take(5);
  return Promise.all(rows.map(async row => ({ at: row.at, actorName: (await ctx.db.get(row.actorId))?.name ?? "Former team account", reason: row.reason, summary: row.summary })));
}
async function studentName(ctx: Ctx, id: Id<"students">) { const student = await ctx.db.get(id); return student?.legalName || student?.preferredName || "another student"; }
async function editSummary(ctx: Ctx, before: Details, after: Details) {
  const parts: string[] = [];
  if (before.amountCents !== after.amountCents) parts.push(`Amount ${money(before.amountCents)} → ${money(after.amountCents)}`);
  if (before.method !== after.method) parts.push(`Method ${methodLabel(before.method)} → ${methodLabel(after.method)}`);
  if ((before.reference ?? "") !== (after.reference ?? "")) parts.push(`Check or receipt number ${before.reference || "none"} → ${after.reference || "none"}`);
  if (before.studentId !== after.studentId) parts.push(`Moved from ${await studentName(ctx, before.studentId)} to ${await studentName(ctx, after.studentId)}`);
  return parts.join("; ");
}
async function insertPayment(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">, payment: { amountCents: number; method: Method; reference: string; occurredAt: number; reason: string; key: string }, expectedGeneration?: number) {
  const old = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", payment.key)).unique();
  if (old) { if (old.kind !== "payment" || old.studentId !== student._id || old.amountCents !== payment.amountCents || old.method !== payment.method || (old.reference ?? "") !== payment.reference || old.occurredAt !== payment.occurredAt || old.reason !== payment.reason) throw new ConvexError("This payment was already saved with different details. Reload, then use Edit payment to change it."); return { id: old._id, replay: true }; }
  const account = await ensureFinancialAccount(ctx, student._id); if (expectedGeneration !== undefined && account.generation !== expectedGeneration) throw new ConvexError("This student's money changed since you reviewed it. Review the payments again.");
  const funds = cents(account.paidCents + account.personalAvailableCents + account.fundraisingAvailableCents);
  if (!Number.isSafeInteger(funds + payment.amountCents)) throw new ConvexError("That amount is too large. Check it and enter a smaller amount.");
  const id = await ctx.db.insert("ledgerEntries", { studentId: student._id, kind: "payment", amountCents: payment.amountCents, previousCents: funds, newCents: cents(funds + payment.amountCents), method: payment.method, reference: payment.reference || undefined, occurredAt: payment.occurredAt, reason: payment.reason, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: payment.key });
  await recordProjectedEntry(ctx, id, account); await allocateUnapplied(ctx, actor, student._id, `auto:${payment.key}`);
  return { id, replay: false };
}
async function correctionPreview(ctx: Ctx, id: Id<"ledgerEntries">, target: number) {
  cents(target);
  const state = await payment(ctx, id); const { entry, account, source } = state;
  const prepared = account?.state === "ready" && account.allocationSourceVersion === 1 && source?.appliedCents !== undefined;
  const consumed = prepared ? cents(source.receivedCents - source.availableCents - source.appliedCents!) : null;
  const release = prepared ? Math.max(0, source.receivedCents - target - source.availableCents) : null;
  const message = !prepared ? "This student's money records need to be rebuilt before this payment can be corrected." : entry.originEntryId ? "This payment came from an earlier season. Correct it in that season instead." : target < consumed! ? "Part of this payment was already paid out or transferred. Undo that first, then lower the payment." : target === source.receivedCents ? "The payment is already this amount. Enter a different amount." : null;
  return { ...state, preview: { state: !prepared ? "updating" as const : message ? "hold" as const : "ready" as const, message, originalAmountCents: entry.amountCents, currentAmountCents: source?.receivedCents ?? null, targetAmountCents: target, releaseRequiredCents: release, irreversibleSpentCents: consumed, expectedSourceRevision: source?.revision ?? null, expectedFinancialRevision: account?.revision ?? null } };
}
type CorrectionState = Awaited<ReturnType<typeof correctionPreview>>;
/** Starts the recorded correction: the original receipt stays, released money leaves its fees, and the new amount is applied again in fee order. */
async function startCorrection(ctx: MutationCtx, actor: Doc<"appUsers">, state: CorrectionState, target: number, reason: string, key: string, hash: string, runFirstPage = true) {
  await requireSeasonFinanceReady(ctx, state.student.seasonId);
  const account = await readyFinancialAccount(ctx, state.student._id);
  if (state.preview.state !== "ready" || !state.source) throw new ConvexError(state.preview.message ?? "This payment changed since you opened it. Review it again, then save.");
  const id = await ctx.db.insert("financialOperationJobs", { requiredFinancialProjectionVersion: 4, kind: "paymentCorrection", studentId: state.student._id, actorId: actor._id, originalActorId: actor._id, generation: account.generation, state: "running", step: 0, amountCents: Math.abs(target - state.source.receivedCents), committedCents: 0, idempotencyKey: key, operationHash: hash, chargeCursor: null, reason, updatedAt: Date.now(), sourceEntryId: state.entry._id, originalReceivedCents: state.source.receivedCents, targetReceivedCents: target, releaseRequiredCents: state.preview.releaseRequiredCents! });
  account.state = "posting"; account.operationJobId = id; await saveFinancialAccount(ctx, account);
  await audit(ctx, actor, "ledgerEntries", state.entry._id, "startPaymentCorrection", { receivedCents: state.source.receivedCents }, { targetReceivedCents: target, jobId: id }, reason);
  if (runFirstPage) await ctx.runMutation(pageRef, { jobId: id, step: 0 });
  return id;
}
/**
 * The last step of a move: once the original payment is corrected to $0, record it on the new student in the same
 * transaction. If this fails, the whole step rolls back and the edit shows as stopped with Try again.
 */
async function finishMove(ctx: MutationCtx, actor: Doc<"appUsers">, job: Doc<"financialOperationJobs">) {
  const sourceEntryId = job.sourceEntryId; if (!sourceEntryId) return;
  const edits = await ctx.db.query("paymentEdits").withIndex("by_sourceEntryId_and_at", q => q.eq("sourceEntryId", sourceEntryId)).order("desc").take(5);
  const edit = edits.find(row => row.correctionJobId === job._id);
  if (!edit || edit.after.studentId === edit.before.studentId || edit.movedEntryId) return;
  const original = await ctx.db.get(sourceEntryId); const target = await ctx.db.get(edit.after.studentId); const season = await activeSeason(ctx);
  if (!original) throw new ConvexError("This payment's history couldn't be found. Reload to see the latest.");
  if (!target?.active || target.seasonId !== season._id) throw new ConvexError("The student this payment was moving to isn't active this season. Ask a Coach to check the payment.");
  await requireTargetReady(ctx, target);
  const moved = await insertPayment(ctx, actor, target, { amountCents: edit.after.amountCents, method: edit.after.method ?? "other", reference: edit.after.reference ?? "", occurredAt: original.occurredAt ?? original.recordedAt, reason: job.reason, key: `payment-edit:${edit.actorId}:${edit.idempotencyKey}` });
  await ctx.db.patch(edit._id, { movedEntryId: moved.id });
  await queueMoneyDigest(ctx, target._id, "payment");
  await audit(ctx, actor, "paymentEdits", edit._id, "finishPaymentMove", null, { movedEntryId: moved.id }, edit.reason);
}
export const receipts = query({
  args: { studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ sourceEntryId: v.id("ledgerEntries"), originalAmountCents: v.number(), currentAmountCents: v.number(), availableCents: v.number(), reference: v.string(), method: v.union(method, v.null()), occurredAt: v.number(), carried: v.boolean(), movedToName: v.union(v.string(), v.null()), pending: pendingValidator, edits: v.array(editValidator) })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor);
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id || !Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 25) throw new ConvexError("This payment isn't in the current season. Reload to see the latest.");
    const account = await financialAccount(ctx, student._id);
    if (!account) return { page: [], isDone: true, continueCursor: "" };
    if (account.allocationSourceVersion !== 1) throw new ConvexError("This student's money records are still updating. Wait a moment, then try again.");
    const page = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_kind_and_status", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("kind", "payment")).paginate({ ...args.paginationOpts, maximumRowsRead: 26 });
    if (page.page.length > 25) throw new ConvexError("This list couldn't load. Reload the page to try again.");
    const entries = await Promise.all(page.page.map(async source => { const original = await ctx.db.get(source.sourceEntryId); if (!original) throw new ConvexError("This payment's history couldn't be found. Reload to see the latest."); const details = await currentDetails(ctx, original); const history = await editHistory(ctx, original._id); return { sourceEntryId: source.sourceEntryId, originalAmountCents: original.amountCents, currentAmountCents: source.receivedCents, availableCents: source.availableCents, reference: details.reference ?? "", method: details.method, occurredAt: original.occurredAt ?? original.recordedAt, carried: !!original.originEntryId, movedToName: details.movedToName, pending: details.pending, edits: history }; }));
    return publicErrorResult({ ...page, page: entries });
  },
});
export const previewCorrection = query({ args: { sourceEntryId: v.id("ledgerEntries"), targetAmountCents: v.number() }, returns: previewValidator, handler: async (ctx, args) => (await correctionPreview(ctx, args.sourceEntryId, args.targetAmountCents)).preview });
export const correct = mutation({
  args: { sourceEntryId: v.id("ledgerEntries"), targetAmountCents: v.number(), expectedSourceRevision: v.number(), expectedFinancialRevision: v.number(), reason: v.string(), idempotencyKey: v.string() },
  returns: v.id("financialOperationJobs"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor);
    const reason = why(args.reason); const key = text(args.idempotencyKey, "transaction key");
    const hash = await tokenHash(JSON.stringify([args.sourceEntryId, args.targetAmountCents, args.expectedSourceRevision, args.expectedFinancialRevision, reason]));
    const old = await ctx.db.query("financialOperationJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", actor._id).eq("idempotencyKey", key)).unique();
    if (old) { if (old.kind !== "paymentCorrection" || old.operationHash !== hash) throw new ConvexError("This was already submitted with different details. Reload to see the latest, then try again."); return old._id; }
    const state = await correctionPreview(ctx, args.sourceEntryId, args.targetAmountCents);
    if (state.preview.state !== "ready" || !state.source || state.source.revision !== args.expectedSourceRevision || state.account?.revision !== args.expectedFinancialRevision) throw new ConvexError(state.preview.message ?? "This payment changed since you opened it. Review it again, then save.");
    const id = await startCorrection(ctx, actor, state, args.targetAmountCents, reason, key, hash);
    return id;
  },
});
export const correctionPage = internalMutation({
  args: { jobId: v.id("financialOperationJobs"), step: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId); if (!job || job.kind !== "paymentCorrection" || job.state !== "running" || job.step !== args.step) return null;
    const actor = await ctx.db.get(job.actorId); const season = await activeSeason(ctx); const student = await ctx.db.get(job.studentId);
    if (!actor || !canEditMoney(actor) || !student?.active || student.seasonId !== season._id) throw new Error("Payment correction actor or student is unavailable.");
    await requireSeasonFinancialContinuation(ctx, season._id, job._id);
    const account = await financialAccount(ctx, student._id);
    if (!account || account.operationJobId !== job._id || account.generation !== job.generation || account.state !== "posting" || !job.sourceEntryId || job.targetReceivedCents === undefined || job.originalReceivedCents === undefined || job.releaseRequiredCents === undefined) throw new Error("Payment correction lost its locked command.");
    const source = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("sourceEntryId", job.sourceEntryId!)).unique();
    if (!source || source.kind !== "payment" || source.rootOriginEntryId !== source.sourceEntryId || source.receivedCents !== job.originalReceivedCents || source.appliedCents === undefined) throw new Error("Payment correction provenance changed.");
    let committed = job.committedCents; let remaining = job.releaseRequiredCents - committed;
    if (remaining) {
      const allocations = await ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_sourceEntryId_and_status", q => q.eq("studentId", student._id).eq("generation", account.generation).eq("sourceEntryId", job.sourceEntryId!).eq("status", "applied")).take(20);
      for (const allocation of allocations) {
        const release = Math.min(remaining, allocation.appliedCents); if (!release) continue;
        const charge = await ctx.db.get(allocation.chargeId); if (!charge || charge.studentId !== student._id) throw new Error("Payment allocation lost its original charge.");
        const before = charge.appliedCents; const effective = effectiveChargeCents(charge); charge.appliedCents = cents(before - release);
        const entry = await ctx.db.insert("ledgerEntries", { studentId: student._id, chargeId: charge._id, eventId: charge.eventId, kind: "deallocation", sourceEntryId: job.sourceEntryId, sourceKind: "payment", amountCents: release, previousCents: before, newCents: charge.appliedCents, recordedBy: actor._id, recordedAt: Date.now(), reason: job.reason, idempotencyKey: `payment-correction:${job._id}:${job.step}:${charge._id}` });
        await recordProjectedEntry(ctx, entry, account); await ctx.db.patch(charge._id, { appliedCents: charge.appliedCents }); await recordChargeChange(ctx, account, charge, effective, before);
        remaining -= release; committed += release; if (!remaining) break;
      }
      if (remaining && !allocations.length) throw new Error("Payment allocations do not cover the reviewed reduction.");
    }
    const done = remaining === 0;
    if (done) {
      const entry = await ctx.db.insert("ledgerEntries", { studentId: student._id, kind: "paymentCorrection", sourceEntryId: job.sourceEntryId, sourceKind: "payment", amountCents: job.amountCents, previousCents: job.originalReceivedCents, newCents: job.targetReceivedCents, recordedBy: actor._id, recordedAt: Date.now(), reason: job.reason, idempotencyKey: `payment-correction:${job._id}:receipt` });
      await recordProjectedEntry(ctx, entry, account);
    }
    await ctx.db.patch(job._id, { state: done ? "complete" : "running", step: job.step + 1, committedCents: committed, updatedAt: Date.now() });
    if (done) { account.state = "ready"; account.operationJobId = undefined; await saveFinancialAccount(ctx, account); await allocateUnapplied(ctx, actor, student._id, `payment-correction:${job._id}:allocate`, undefined, job._id); await audit(ctx, actor, "ledgerEntries", job.sourceEntryId, "completePaymentCorrection", { receivedCents: job.originalReceivedCents }, { receivedCents: job.targetReceivedCents, releasedCents: committed }, job.reason); await finishMove(ctx, actor, job); }
    else await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
    await refreshStudentFinance(ctx, student._id); return null;
  },
});
export const runCorrection = internalMutation({ args: { jobId: v.id("financialOperationJobs") }, returns: v.null(), handler: async (ctx, args) => { const job = await ctx.db.get(args.jobId); if (!job || job.kind !== "paymentCorrection" || job.state !== "running") return null; try { await ctx.runMutation(pageRef, { jobId: job._id, step: job.step }); } catch (error) { await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "This payment correction stopped. Review it, then try again."), updatedAt: Date.now() }); const account = await financialAccount(ctx, job.studentId); if (account?.operationJobId === job._id) await ctx.db.patch(account._id, { state: "failed", lastError: savedPublicError(null, "This payment edit stopped. A Coach or a Travel Lead with Money editing access can choose Try again, or cancel the edit, on the payment."), updatedAt: Date.now() }); } return null; } });
export const correctionStatus = query({ args: { jobId: v.id("financialOperationJobs") }, returns: schema.doc("financialOperationJobs"), handler: async (ctx, args) => { const actor = await viewer(ctx); editor(actor); const job = await ctx.db.get(args.jobId); const student = job ? await ctx.db.get(job.studentId) : null; if (!job || job.kind !== "paymentCorrection" || student?.seasonId !== (await activeSeason(ctx))._id) throw new ConvexError("This payment correction no longer exists. Reload to see the latest."); return publicErrorResult(job); } });
async function retryJob(ctx: MutationCtx, actor: Doc<"appUsers">, jobId: Id<"financialOperationJobs">, reason: string) {
  const job = await ctx.db.get(jobId); const account = job ? await financialAccount(ctx, job.studentId) : null; const season = await activeSeason(ctx);
  if (!job || job.kind !== "paymentCorrection" || job.state !== "failed" || account?.seasonId !== season._id || account.operationJobId !== job._id || account.generation !== job.generation) throw new ConvexError("This payment edit can't be tried again now. Reload to see the latest.");
  await requireSeasonFinancialRetry(ctx, season._id, job._id);
  await ctx.db.patch(job._id, { actorId: actor._id, state: "running", lastError: undefined, updatedAt: Date.now() }); await ctx.db.patch(account._id, { state: "posting", lastError: undefined, updatedAt: Date.now() });
  await audit(ctx, actor, "financialOperationJobs", job._id, "retryPaymentCorrection", null, null, reason); await ctx.scheduler.runAfter(0, runRef, { jobId: job._id });
}
export const retryCorrection = mutation({ args: { jobId: v.id("financialOperationJobs"), reason: v.string() }, returns: v.null(), handler: async (ctx, args) => { const actor = await viewer(ctx); editor(actor); await retryJob(ctx, actor, args.jobId, why(args.reason)); return null; } });
/** Try again on a stopped Edit payment, for the same people who can edit payments. */
export const retryEdit = mutation({
  args: { sourceEntryId: v.id("ledgerEntries") }, returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, entry } = await payment(ctx, args.sourceEntryId);
    const latest = await ctx.db.query("paymentEdits").withIndex("by_sourceEntryId_and_at", q => q.eq("sourceEntryId", entry._id)).order("desc").first();
    if (!latest?.correctionJobId) throw new ConvexError("This payment edit can't be tried again now. Reload to see the latest.");
    await retryJob(ctx, actor, latest.correctionJobId, `Tried the payment edit again. ${latest.reason}`.slice(0, 1000)); return null;
  },
});
/**
 * Cancel a stopped Edit payment, for the same people who can edit payments. A stopped edit never wrote its corrected
 * amount (the step that writes it, and records a move on the new student, rolls back as a whole), so the payment still
 * has its original amount on the original student. Cancelling puts any money already released back on fees in order,
 * unlocks the account, and records the cancel with its reason in the payment's changes, the audit log and Recent changes.
 */
export const cancelEdit = mutation({
  args: { sourceEntryId: v.id("ledgerEntries"), reason: v.string() }, returns: v.id("paymentEdits"),
  handler: async (ctx, args) => {
    const { actor, entry, student, account, source } = await payment(ctx, args.sourceEntryId);
    const reason = why(args.reason);
    const details = await currentDetails(ctx, entry); const stopped = details.unfinishedEdit;
    const job = stopped?.correctionJobId ? await ctx.db.get(stopped.correctionJobId) : null;
    const cantCancel = "This payment edit can't be cancelled now. Reload to see the latest.";
    if (!stopped || !job || job.kind !== "paymentCorrection" || job.state !== "failed" || stopped.movedEntryId || !account || account.operationJobId !== job._id || account.generation !== job.generation || account.state !== "failed") throw new ConvexError(cantCancel);
    if (!source || job.originalReceivedCents === undefined || source.receivedCents !== job.originalReceivedCents) throw new ConvexError(cantCancel);
    const season = await activeSeason(ctx); await requireSeasonFinancialRetry(ctx, season._id, job._id);
    const at = Date.now();
    await ctx.db.patch(job._id, { state: "complete", targetReceivedCents: job.originalReceivedCents, amountCents: 0, lastError: undefined, updatedAt: at });
    account.state = "ready"; account.operationJobId = undefined; account.lastError = undefined; await saveFinancialAccount(ctx, account);
    // Money released before the edit stopped goes back on this student's fees in fee order.
    await allocateUnapplied(ctx, actor, student._id, `payment-edit-cancel:${job._id}:allocate`, undefined, job._id);
    const moving = stopped.after.studentId !== stopped.before.studentId;
    const summary = moving ? `Cancelled the move to ${await studentName(ctx, stopped.after.studentId)}; the payment stays on ${await studentName(ctx, student._id)} at ${money(source.receivedCents)}` : `Cancelled the change to ${money(stopped.after.amountCents)}; the payment stays ${money(source.receivedCents)}`;
    const before = stopped.after; const after = { ...stopped.before, studentId: student._id, amountCents: source.receivedCents };
    const editId = await ctx.db.insert("paymentEdits", { seasonId: season._id, sourceEntryId: entry._id, actorId: actor._id, at, reason, summary, idempotencyKey: `cancel:${job._id}`, before, after });
    await recordFinanceChange(ctx, { seasonId: season._id, studentId: student._id, actorId: actor._id, sourceKind: "payment", occurredAt: at, kind: "paymentEdit", state: "committed", meaning: "receipt", beforeCents: source.receivedCents, afterCents: source.receivedCents, deltaCents: 0, reason: `${summary}. ${reason}`, sourceType: "ledger", sourceId: entry._id, sourceKey: `paymentEdit:${editId}`, historical: false });
    await audit(ctx, actor, "paymentEdits", editId, "cancelPaymentEdit", before, { ...after, cancelledEditId: stopped._id, correctionJobId: job._id }, reason);
    await refreshStudentFinance(ctx, student._id);
    return editId;
  },
});

export const previewPayments = query({
  args: { rows: v.array(row) }, returns: v.array(v.object({ studentId: v.union(v.id("students"), v.null()), studentName: v.string(), expectedGeneration: v.union(v.number(), v.null()), balanceDueCents: v.union(v.number(), v.null()), error: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    editor(await viewer(ctx)); if (!args.rows.length || args.rows.length > 500) throw new ConvexError("Review 1 to 500 payments at a time.");
    const season = await activeSeason(ctx); const duplicates = new Set<string>(); const result = [];
    for (const item of args.rows) {
      let error: string | null = null; try { receiptFields(item); } catch (failure) { error = failure instanceof Error ? failure.message : "Check the amount, check or receipt number and date."; }
      let student: Doc<"students"> | null; let label = "";
      if (item.studentId) { const found = await ctx.db.get(item.studentId); student = found?.active && found.seasonId === season._id ? found : null; if (!student) error = "This student isn't active this season. Choose another student."; }
      else {
        let email = (item.studentEmail ?? "").trim().toLowerCase(); label = email;
        try { email = normalizeEmail(item.studentEmail ?? "", "Student email"); if (!email) throw new ConvexError("Choose a student."); } catch (failure) { result.push({ studentId: null, studentName: label, expectedGeneration: null, balanceDueCents: null, error: failure instanceof Error ? failure.message : "Check the student's email address." }); continue; }
        const matches = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", email)).take(2);
        student = matches.length === 1 && matches[0].active ? matches[0] : null; label = email;
        if (!student) error = "No active student has this email. Use the email on the student's account.";
      }
      const identity = `${student?._id ?? label}:${item.rowReference.trim()}`; if (duplicates.has(identity)) error = "This payment appears twice. Remove the extra one."; duplicates.add(identity);
      const account = student ? await financialAccount(ctx, student._id) : null;
      if (account && (account.state !== "ready" || account.allocationSourceVersion !== 1)) error = "This student's money records are still updating. Try again in a moment.";
      if (student && !account) { const studentId = student._id; const history = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", studentId)).first(); const charge = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).first(); if (history || charge) error = "This student's account needs preparing first. A Coach can choose Prepare account on the Money page."; }
      const due = student ? (await financeRow(ctx, student._id)).dueCents : null;
      result.push({ studentId: student?._id ?? null, studentName: student?.legalName || student?.preferredName || label, expectedGeneration: student ? account?.generation ?? 1 : null, balanceDueCents: due, error });
    }
    return publicErrorResult(result);
  },
});
export const recordPaymentRow = mutation({
  args: { studentId: v.id("students"), amountCents: v.number(), method, reference: v.string(), occurredAt: v.number(), rowReference: v.string(), batchReference: v.string(), reason: v.string(), expectedGeneration: v.number() }, returns: v.id("ledgerEntries"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor); receiptFields(args); const reason = why(args.reason); const batch = text(args.batchReference, "a list name");
    const season = await activeSeason(ctx); await requireSeasonFinanceReady(ctx, season._id);
    const student = await ctx.db.get(args.studentId); if (!student?.active || student.seasonId !== season._id) throw new ConvexError("This student isn't in the current season. Reload and choose a current student.");
    const key = `payment-entry:${actor._id}:${await tokenHash(JSON.stringify([season._id, batch, student._id, args.rowReference.trim()]))}`;
    const reference = paymentReference(args.reference, args.method);
    const saved = await insertPayment(ctx, actor, student, { amountCents: args.amountCents, method: args.method, reference, occurredAt: args.occurredAt, reason, key }, args.expectedGeneration);
    if (!saved.replay) { await audit(ctx, actor, "ledgerEntries", saved.id, "recordPayment", null, { batchReference: batch, rowReference: args.rowReference.trim(), amountCents: args.amountCents, method: args.method, reference, occurredAt: args.occurredAt }, reason); await queueMoneyDigest(ctx, student._id, "payment"); }
    return saved.id;
  },
});

/** Balance due and readiness for the Record payment form, so a large overpayment can be confirmed first. */
export const recordContext = query({
  args: { studentId: v.id("students") }, returns: v.object({ state: v.union(v.literal("ready"), v.literal("updating"), v.literal("failed"), v.literal("uninitialized")), balanceDueCents: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    editor(await viewer(ctx)); const season = await activeSeason(ctx); const student = await ctx.db.get(args.studentId);
    if (!student?.active || student.seasonId !== season._id) throw new ConvexError("This student isn't in the current season. Reload to see the latest.");
    const row = await financeRow(ctx, student._id);
    return { state: row.state, balanceDueCents: row.dueCents };
  },
});

/** Active students by name, for choosing who a payment belongs to. */
export const studentOptions = query({
  args: {}, returns: v.array(v.object({ studentId: v.id("students"), name: v.string() })),
  handler: async ctx => {
    editor(await viewer(ctx)); const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", season._id).eq("active", true)).take(500);
    return students.map(student => ({ studentId: student._id, name: student.legalName || student.preferredName || "Unnamed student" })).sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Records one payment from the Record payment form. */
export const recordPayment = mutation({
  args: { studentId: v.id("students"), amountCents: v.number(), method, reference: v.string(), occurredAt: v.number(), note: v.string(), idempotencyKey: v.string() }, returns: v.id("ledgerEntries"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor); const key = text(args.idempotencyKey, "a save key");
    receiptFields({ ...args, rowReference: "1" }); const reference = paymentReference(args.reference, args.method);
    const note = args.note.trim(); if (note.length > 1000) throw new ConvexError("Keep the note to 1,000 characters or fewer.");
    const season = await activeSeason(ctx); await requireSeasonFinanceReady(ctx, season._id);
    const student = await ctx.db.get(args.studentId); if (!student?.active || student.seasonId !== season._id) throw new ConvexError("This student isn't in the current season. Reload and choose a current student.");
    const reason = note || `${methodLabel(args.method)} payment`;
    const saved = await insertPayment(ctx, actor, student, { amountCents: args.amountCents, method: args.method, reference, occurredAt: args.occurredAt, reason, key: `payment-form:${actor._id}:${key}` });
    if (!saved.replay) { await audit(ctx, actor, "ledgerEntries", saved.id, "recordPayment", null, { amountCents: args.amountCents, method: args.method, reference, occurredAt: args.occurredAt }, reason); await queueMoneyDigest(ctx, student._id, "payment"); }
    return saved.id;
  },
});

/**
 * Edit payment (owner decision November 9, 2026). A Coach, or a Travel Lead with Money editing access, can change the
 * amount, method, check or receipt number, or student. The original receipt is never overwritten: an amount change is a
 * recorded correction, a student change corrects the original to $0 and records the payment on the new student, and
 * every edit stores who, when, why and the before and after details.
 */
export const editPayment = mutation({
  args: { sourceEntryId: v.id("ledgerEntries"), studentId: v.id("students"), amountCents: v.number(), method, reference: v.string(), reason: v.string(), expectedSourceRevision: v.number(), expectedEditId: v.union(v.id("paymentEdits"), v.null()), expectedBefore: v.optional(v.object({ studentId: v.id("students"), amountCents: v.number(), method: v.union(method, v.null()), reference: v.union(v.string(), v.null()) })), idempotencyKey: v.string() },
  returns: v.id("paymentEdits"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); editor(actor);
    const reason = why(args.reason); const key = text(args.idempotencyKey, "a save key");
    if (!Number.isSafeInteger(args.amountCents) || args.amountCents < 0) throw new ConvexError("Enter an amount of $0.00 or more.");
    const reference = paymentReference(args.reference, args.method);
    // A repeated save key returns the first edit only when every detail matches; a reused key with new details is refused.
    const replay = await ctx.db.query("paymentEdits").withIndex("by_actorId_and_idempotencyKey", q => q.eq("actorId", actor._id).eq("idempotencyKey", key)).unique();
    if (replay) { if (replay.sourceEntryId !== args.sourceEntryId || replay.reason !== reason || replay.after.studentId !== args.studentId || replay.after.amountCents !== args.amountCents || replay.after.method !== args.method || (replay.after.reference ?? "") !== reference) throw new ConvexError("This was already submitted with different details. Reload to see the latest, then try again."); return replay._id; }
    const original = await ctx.db.get(args.sourceEntryId);
    const moving = !!original && args.studentId !== original.studentId;
    if (moving && args.amountCents === 0) throw new ConvexError("Enter the amount the other student paid, or keep the payment on this student and set it to $0.00.");
    const state = await correctionPreview(ctx, args.sourceEntryId, moving ? 0 : args.amountCents);
    const { entry, student, source } = state;
    if (entry.originEntryId) throw new ConvexError("This payment came from an earlier season. A Coach can change it in that season's records.");
    const details = await currentDetails(ctx, entry);
    if (details.movedEntryId) throw new ConvexError(`This payment was moved to ${details.movedToName}. Edit it on that student's account.`);
    if (state.preview.state === "updating" || !source) throw new ConvexError("This student's money records are still updating. Wait a moment, then try again.");
    if (source.revision !== args.expectedSourceRevision) throw new ConvexError("This payment changed since you opened it. Reload to see the latest, then try again.");
    // A method or number change doesn't move money, so it doesn't change the revision; the latest edit catches two people saving at once.
    if (details.lastEditId !== args.expectedEditId) throw new ConvexError(staleEditMessage);
    const before: Details = { studentId: student._id, amountCents: source.receivedCents, method: details.method, reference: details.reference };
    // The details the form showed when it opened must still be the payment's details, field by field.
    const shown = args.expectedBefore;
    if (shown && (shown.studentId !== before.studentId || shown.amountCents !== before.amountCents || shown.method !== before.method || (shown.reference ?? null) !== (before.reference ?? null))) throw new ConvexError(staleEditMessage);
    if (moving && source.receivedCents === 0) throw new ConvexError(zeroMoveMessage);
    const after: Details = { studentId: args.studentId, amountCents: args.amountCents, method: args.method, reference: reference || null };
    const summary = await editSummary(ctx, before, after);
    if (!summary) throw new ConvexError("Nothing changed. Change the amount, method, check or receipt number, or student, then save.");
    const season = await activeSeason(ctx); await requireSeasonFinanceReady(ctx, season._id);
    if (moving) {
      const target = await ctx.db.get(args.studentId);
      if (!target?.active || target.seasonId !== season._id) throw new ConvexError("Choose a student who is active this season.");
      await requireTargetReady(ctx, target);
    }
    const amountChanges = moving || args.amountCents !== source.receivedCents;
    if (amountChanges && state.preview.state !== "ready") throw new ConvexError(state.preview.message ?? "This payment can't be changed right now. Reload to see the latest, then try again.");
    const hash = await tokenHash(JSON.stringify([args.sourceEntryId, args.studentId, args.amountCents, args.method, reference, reason]));
    const at = Date.now();
    const editId = await ctx.db.insert("paymentEdits", { seasonId: season._id, sourceEntryId: entry._id, actorId: actor._id, at, reason, summary, idempotencyKey: key, before, after });
    if (amountChanges) {
      // One line per edit in Recent changes: the correction's own receipt line (and, for a move, the new student's
      // payment line) carries the summary and reason. A move records on the new student only when the correction finishes.
      const correctionJobId = await startCorrection(ctx, actor, state, moving ? 0 : args.amountCents, `${summary}. ${reason}`, `edit:${key}`, hash, false);
      await ctx.db.patch(editId, { correctionJobId });
      await ctx.runMutation(pageRef, { jobId: correctionJobId, step: 0 });
    } else {
      await recordFinanceChange(ctx, { seasonId: season._id, studentId: student._id, actorId: actor._id, sourceKind: "payment", occurredAt: at, kind: "paymentEdit", state: "committed", meaning: "receipt", beforeCents: before.amountCents, afterCents: after.amountCents, deltaCents: 0, reason: `${summary}. ${reason}`, sourceType: "ledger", sourceId: entry._id, sourceKey: `paymentEdit:${editId}`, historical: false });
    }
    const saved = await ctx.db.get(editId);
    await audit(ctx, actor, "paymentEdits", editId, "editPayment", before, { ...after, movedEntryId: saved?.movedEntryId ?? null, correctionJobId: saved?.correctionJobId ?? null }, reason);
    return editId;
  },
});

/** Current details and the revision the Edit payment form sends back, so an edit never lands on a payment that changed meanwhile. */
export const editContext = query({
  args: { sourceEntryId: v.id("ledgerEntries") }, returns: v.object({ studentId: v.id("students"), amountCents: v.number(), method: v.union(method, v.null()), reference: v.union(v.string(), v.null()), expectedSourceRevision: v.union(v.number(), v.null()), expectedEditId: v.union(v.id("paymentEdits"), v.null()), lockedMessage: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const { entry, student, source, account } = await payment(ctx, args.sourceEntryId);
    const details = await currentDetails(ctx, entry);
    const prepared = account?.state === "ready" && account.allocationSourceVersion === 1 && source?.appliedCents !== undefined;
    const lockedMessage = entry.originEntryId ? "This payment came from an earlier season. A Coach can change it in that season's records." : details.movedEntryId ? `This payment was moved to ${details.movedToName}. Edit it on that student's account.` : details.pending?.state === "failed" ? "The last edit to this payment stopped before it finished. Choose Try again or cancel it on the payment first." : details.pending ? "The last edit to this payment is still saving. Wait a moment, then try again." : !prepared ? "This student's money records are still updating. Wait a moment, then try again." : null;
    return { studentId: student._id, amountCents: source?.receivedCents ?? entry.amountCents, method: details.method, reference: details.reference, expectedSourceRevision: source?.revision ?? null, expectedEditId: details.lastEditId, lockedMessage };
  },
});
