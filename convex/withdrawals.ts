import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, ownStudent, studentAccess, viewer } from "./lib/access";
import { effectiveChargeCents } from "./lib/money";

import { ensureFinancialAccount, saveFinancialAccount } from "./lib/financialSources";
import { makeFunctionReference } from "convex/server";

type Context = MutationCtx | QueryCtx;
const decision = v.union(v.literal("full"), v.literal("retain"), v.literal("partial"), v.literal("deny"));
const progressValidator = v.object({ jobId: v.id("financialOperationJobs"), state: v.union(v.literal("running"), v.literal("failed"), v.literal("complete")), committedCents: v.number(), totalCents: v.number(), lastError: v.union(v.string(), v.null()) });
const previewResult = v.object({ progress: v.union(progressValidator, v.null()), canRetry: v.boolean(), eventName: v.string(), studentName: v.string(), allowWithdrawal: v.boolean(), revision: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")), requestId: v.union(v.id("withdrawalRequests"), v.null()), requestStatus: v.union(v.literal("pending"), v.literal("processing"), v.literal("approved"), v.literal("denied"), v.null()), charges: v.array(v.object({ id: v.id("charges"), label: v.string(), category: v.union(v.literal("main"), v.literal("extra")), chargedCents: v.number(), originalChargedCents: v.number(), adjustedCents: v.number(), paidCents: v.number(), unpaidCents: v.number(), cancelledCents: v.number() })), paidMainCents: v.number(), paidExtraCents: v.number(), unpaidMainCents: v.number(), unpaidExtraCents: v.number() });

async function details(ctx: Context, eventId: Id<"events">, studentId: Id<"students">) {
  const event = await ctx.db.get(eventId), student = await ctx.db.get(studentId), season = await activeSeason(ctx);
  if (!event || !student || !student.active || event.seasonId !== season._id || student.seasonId !== season._id) throw new Error("Student or event not found.");
  const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (!participant) throw new Error("Student is not participating in this event.");
  const charges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(101);
  if (charges.length > 100) throw new Error("Event charge limit reached; review cannot proceed safely.");
  const requests = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(101);
  if (requests.length > 100) throw new Error("Withdrawal request limit reached; review cannot proceed safely.");
  return { event, student, participant, charges, requests };
}

async function summary(ctx: Context, user: Doc<"appUsers">, data: Awaited<ReturnType<typeof details>>) {
  const charges = data.charges.map(c => ({ id: c._id, label: c.label, category: c.category ?? "main" as const, chargedCents: effectiveChargeCents(c), originalChargedCents: c.amountCents, adjustedCents: c.adjustedCents ?? 0, paidCents: c.appliedCents, unpaidCents: effectiveChargeCents(c) - c.appliedCents, cancelledCents: c.cancelledCents ?? 0 }));
  const pending = data.requests.find(r => (r.status === "pending" || r.status === "processing")) ?? data.requests.at(-1);
  const job = pending?.jobId ? await ctx.db.get(pending.jobId) : null;
  const progress = job ? { jobId: job._id, state: job.state, committedCents: job.committedCents, totalCents: job.amountCents, lastError: job.lastError ?? null } : null;
  return { progress, canRetry: user.role === "coach" && job?.state === "failed", eventName: data.event.name, studentName: data.student.preferredName || data.student.legalName, allowWithdrawal: data.event.allowWithdrawal && !data.event.archived, revision: revision(data), status: data.participant.status, requestId: pending?._id ?? null, requestStatus: pending?.status ?? null, charges, paidMainCents: charges.filter(c => c.category === "main").reduce((n, c) => n + c.paidCents, 0), paidExtraCents: charges.filter(c => c.category === "extra").reduce((n, c) => n + c.paidCents, 0), unpaidMainCents: charges.filter(c => c.category === "main").reduce((n, c) => n + c.unpaidCents, 0), unpaidExtraCents: charges.filter(c => c.category === "extra").reduce((n, c) => n + c.unpaidCents, 0) };
}

function revision(data: Awaited<ReturnType<typeof details>>) {
  return JSON.stringify([data.event._id, data.event.archived, data.participant.status, data.participant.updatedAt, ...data.charges.map(c => [c._id, c.amountCents, c.adjustedCents ?? 0, c.appliedCents, c.cancelledCents ?? 0, c.revision ?? 0, c.category ?? "main"])]);
}

export const withdrawalPreview = query({
  args: { eventId: v.id("events"), studentId: v.id("students") }, returns: previewResult,
  handler: async (ctx, args) => { const user = await viewer(ctx); await studentAccess(ctx, user, args.studentId); return summary(ctx, user, await details(ctx, args.eventId, args.studentId)); },
});

export const pendingWithdrawals = query({
  args: {}, returns: v.array(v.object({ requestId: v.id("withdrawalRequests"), eventId: v.id("events"), studentId: v.id("students"), eventName: v.string(), studentName: v.string(), requestedAt: v.number(), status: v.union(v.literal("pending"), v.literal("processing")), progress: v.union(progressValidator, v.null()) })),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new Error("Withdrawal review denied.");
    const season = await activeSeason(ctx);
    const pending = await ctx.db.query("withdrawalRequests").withIndex("by_status", q => q.eq("status", "pending")).take(101);
    const processing = await ctx.db.query("withdrawalRequests").withIndex("by_status", q => q.eq("status", "processing")).take(101);
    const rows = [...pending, ...processing];
    if (pending.length > 100 || processing.length > 100) throw new Error("Withdrawal queue limit reached.");
    const result = [];
    for (const row of rows) {
      const event = await ctx.db.get(row.eventId), student = await ctx.db.get(row.studentId);
      const job = row.jobId ? await ctx.db.get(row.jobId) : null;
      const progress = job ? { jobId: job._id, state: job.state, committedCents: job.committedCents, totalCents: job.amountCents, lastError: job.lastError ?? null } : null;
      if (event?.seasonId === season._id && student?.seasonId === season._id) result.push({ requestId: row._id, eventId: row.eventId, studentId: row.studentId, eventName: event.name, studentName: student.preferredName || student.legalName, requestedAt: row.requestedAt, status: row.status as "pending" | "processing", progress });
    }
    return result;
  },
});

export const requestWithdrawal = mutation({
  args: { eventId: v.id("events"), idempotencyKey: v.string() }, returns: v.id("withdrawalRequests"),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx), student = await ownStudent(ctx, user);
    const data = await details(ctx, args.eventId, student._id);
    requireEnrollmentComplete(data.event);
    if (data.event.archived || !data.event.allowWithdrawal || data.participant.status === "withdrawn") throw new Error("Withdrawal is unavailable for this event.");
    if (args.idempotencyKey.length < 8 || args.idempotencyKey.length > 120) throw new Error("Invalid request key.");
    const duplicate = await ctx.db.query("withdrawalRequests").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (duplicate) { if (duplicate.eventId !== args.eventId || duplicate.studentId !== student._id) throw new Error("Request key is already used."); return duplicate._id; }
    const pending = data.requests.find(r => r.status === "pending" || r.status === "processing");
    if (pending) return pending._id;
    if (data.requests.some(r => r.status === "approved")) throw new Error("An approved withdrawal is already recorded.");
    const id = await ctx.db.insert("withdrawalRequests", { eventId: args.eventId, studentId: student._id, participantId: data.participant._id, status: "pending", requestedBy: user._id, requestedAt: Date.now(), idempotencyKey: args.idempotencyKey });
    await audit(ctx, user, "withdrawalRequests", id, "request", null, { eventId: args.eventId, studentId: student._id, participation: data.participant.status });
    return id;
  },
});

async function removeRoomState(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">, actor: Doc<"appUsers">) {
  const member = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (member) {
    await ctx.db.delete(member._id);
    const group = await ctx.db.get(member.groupId);
    if (group) { await ctx.db.patch(group._id, { needsReview: true, finalized: false }); await audit(ctx, actor, "roomGroups", group._id, "withdrawalReview", { needsReview: group.needsReview, finalized: group.finalized }, { needsReview: true, finalized: false }); }
  }
  const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (request) await ctx.db.delete(request._id);
  const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", studentId)).take(101);
  if (invites.length > 100) throw new Error("Room invitation limit reached.");
  for (const invite of invites) if (invite.eventId === eventId && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
  const groups = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(101);
  if (groups.length > 100) throw new Error("Room group limit reached.");
  for (const group of groups) {
    const groupInvites = await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(101);
    if (groupInvites.length > 100) throw new Error("Room invitation limit reached.");
    for (const invite of groupInvites) if (invite.invitedBy === studentId && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
  }
}

export const reviewWithdrawal = mutation({
  args: { requestId: v.id("withdrawalRequests"), decision, returnCents: v.optional(v.number()), cancelUnpaidMain: v.boolean(), reason: v.string(), expectedRevision: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new Error("Withdrawal review denied.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Provide an explanation of at least eight characters.");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Withdrawal request not found.");
    if (request.status !== "pending") {
      if (request.decision === args.decision && request.cancelUnpaidMain === args.cancelUnpaidMain && request.reason === args.reason.trim() && (args.decision !== "partial" || request.returnCents === args.returnCents)) return null;
      throw new Error("This withdrawal request was already decided differently.");
    }
    const data = await details(ctx, request.eventId, request.studentId);
    requireEnrollmentComplete(data.event);
    if (data.event.archived) throw new Error("This event was archived; withdrawal review is unavailable.");
    if (args.expectedRevision !== revision(data)) throw new Error("Participation or charges changed. Review the updated amounts before deciding.");
    if (data.participant._id !== request.participantId || data.participant.status === "withdrawn") throw new Error("Participation changed; review the request again.");
    if (args.decision === "deny") {
      if (args.returnCents !== undefined || args.cancelUnpaidMain) throw new Error("Denial cannot change finances.");
      await ctx.db.patch(request._id, { status: "denied", decision: "deny", decidedBy: user._id, decidedAt: Date.now(), reason: args.reason.trim(), cancelUnpaidMain: false, returnCents: 0, retainedCents: 0 });
      await audit(ctx, user, "withdrawalRequests", request._id, "deny", { status: "pending" }, { status: "denied", participation: data.participant.status }, args.reason.trim());
      return null;
    }
    const totalPaid = data.charges.reduce((n, c) => n + c.appliedCents, 0);
    const returned = args.decision === "full" ? totalPaid : args.decision === "retain" ? 0 : args.returnCents;
    if (!Number.isSafeInteger(returned) || returned === undefined || returned < 0 || returned > totalPaid || args.decision === "partial" && returned === 0) throw new Error("Return must be between one cent and the eligible paid amount.");
    if (args.decision !== "partial" && args.returnCents !== undefined) throw new Error("Custom return is only for a partial decision.");
    const account = await ensureFinancialAccount(ctx, request.studentId);
    const key = `withdraw:${request._id}`;
    const jobId = await ctx.db.insert("financialOperationJobs", { requiredFinancialProjectionVersion: 4, kind: "withdrawal", studentId: request.studentId, actorId: user._id, generation: account.generation, state: "running", step: 0, amountCents: returned, committedCents: 0, idempotencyKey: key, withdrawalRequestId: request._id, eventId: request.eventId, decision: args.decision, returnCents: returned, cancelUnpaidMain: args.cancelUnpaidMain, chargeCursor: null, reason: args.reason.trim(), updatedAt: Date.now() });
    let remaining = returned;
    const ordered = [...data.charges].sort((a, b) => (a.category ?? "main") === (b.category ?? "main") ? a.createdAt - b.createdAt : (a.category ?? "main") === "main" ? -1 : 1);
    for (const charge of ordered) {
      const refund = Math.min(remaining, charge.appliedCents); remaining -= refund;
      const unpaid = effectiveChargeCents(charge) - charge.appliedCents;
      await ctx.db.insert("financialWithdrawalCharges", { jobId, chargeId: charge._id, refundCents: refund, returnedCents: 0, cancelUnpaidCents: charge.category === "extra" || args.cancelUnpaidMain ? unpaid : 0, state: "pending" });
    }
    account.state = "posting"; account.operationJobId = jobId; await saveFinancialAccount(ctx, account);
    await ctx.db.patch(request._id, { status: "processing", jobId, decision: args.decision, returnCents: returned, retainedCents: totalPaid - returned, cancelUnpaidMain: args.cancelUnpaidMain, reason: args.reason.trim(), decidedBy: user._id });
    await audit(ctx, user, "withdrawalRequests", request._id, "startDisposition", { status: "pending" }, { status: "processing", returnedCents: returned, jobId }, args.reason.trim());
    await ctx.runMutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), { jobId, step: 0 });
    return null;
  },
});

export async function finalizeWithdrawal(ctx: MutationCtx, job: Doc<"financialOperationJobs">, user: Doc<"appUsers">) {
  if (!job.withdrawalRequestId || !job.eventId) throw new Error("Withdrawal job is missing its frozen request.");
  const request = await ctx.db.get(job.withdrawalRequestId);
  if (!request || request.status !== "processing" || request.jobId !== job._id) throw new Error("Withdrawal request changed.");
  const participant = await ctx.db.get(request.participantId);
  if (!participant || participant.studentId !== job.studentId || participant.eventId !== job.eventId || participant.status === "withdrawn") throw new Error("Withdrawal participation changed.");
  await removeRoomState(ctx, job.eventId, job.studentId, user);
  await ctx.db.patch(participant._id, { status: "withdrawn", updatedAt: Date.now() });
  await ctx.db.patch(request._id, { status: "approved", decidedBy: user._id, decidedAt: Date.now() });
  await audit(ctx, user, "withdrawalRequests", request._id, "approve", { status: "processing", participation: participant.status }, { status: "approved", participation: "withdrawn", returnedCents: job.committedCents, retainedCents: request.retainedCents }, job.reason);
}
