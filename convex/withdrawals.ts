import { requireFamilyEventAccess } from "./lib/archivedEventAccess";
import { publicErrorResult } from './lib/publicErrors';
import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { enrollmentPending, requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { activeApprovedWithdrawal, STUDENT_UNDO_LIMIT, studentUndoCount, withdrawalHistory } from "./lib/withdrawalState";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, ownStudent, studentAccess, viewer } from "./lib/access";
import { effectiveChargeCents } from "./lib/money";
import { activeQuestions, checkAnswers, checkShifts, clearShifts, MAX_QUESTION_ROWS } from "./lib/eventSignupExtras";
import { teamTransportEnabled } from "./lib/transportation";
import { studentCanAccessEvent } from "./lib/eventAudience";
import { resolveAudience } from "./lib/eventAudienceRules";
import { notifyEventAssigned, notifyWithdrawalDecision, queueMentorMeetingActivityDigest, queueSignupPendingDigest, queueWithdrawalRequestDigest } from "./lib/notificationTriggers";

import { ensureFinancialAccount, saveFinancialAccount } from "./lib/financialSources";
import { makeFunctionReference } from "convex/server";

type Context = MutationCtx | QueryCtx;
const decision = v.union(v.literal("full"), v.literal("retain"), v.literal("partial"), v.literal("deny"));
const progressValidator = v.object({ jobId: v.id("financialOperationJobs"), state: v.union(v.literal("running"), v.literal("failed"), v.literal("complete")), committedCents: v.number(), totalCents: v.number(), lastError: v.union(v.string(), v.null()) });
const previewResult = v.object({ progress: v.union(progressValidator, v.null()), canRetry: v.boolean(), eventName: v.string(), studentName: v.string(), allowWithdrawal: v.boolean(), wholeTeam: v.boolean(), coachAssigned: v.boolean(), wholeTeamLeft: v.boolean(), revision: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")), reviewRequired: v.boolean(), withdrawnImmediately: v.boolean(), canUndo: v.boolean(), undoBlocked: v.union(v.string(), v.null()), undoUntil: v.number(), requestId: v.union(v.id("withdrawalRequests"), v.null()), requestStatus: v.union(v.literal("pending"), v.literal("processing"), v.literal("approved"), v.literal("denied"), v.null()), charges: v.array(v.object({ id: v.id("charges"), label: v.string(), category: v.union(v.literal("main"), v.literal("extra")), chargedCents: v.number(), originalChargedCents: v.number(), adjustedCents: v.number(), paidCents: v.number(), unpaidCents: v.number(), cancelledCents: v.number() })), paidMainCents: v.number(), paidExtraCents: v.number(), unpaidMainCents: v.number(), unpaidExtraCents: v.number() });

async function details(ctx: Context, eventId: Id<"events">, studentId: Id<"students">) {
  const event = await ctx.db.get(eventId), student = await ctx.db.get(studentId), season = await activeSeason(ctx);
  if (!event || !student || !student.active || event.seasonId !== season._id || student.seasonId !== season._id) throw new ConvexError("This event or signup no longer exists. Reload to see the latest.");
  const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (!participant) throw new ConvexError("There's no signup for this event. Reload to see the latest.");
  const charges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(101);
  if (charges.length > 100) throw new ConvexError("This event has too many fees to review here. Ask a Coach for help.");
  const requests = await withdrawalHistory(ctx, eventId, studentId);
  return { event, student, participant, charges, requests };
}

async function summary(ctx: Context, user: Doc<"appUsers">, data: Awaited<ReturnType<typeof details>>) {
  const charges = data.charges.map(c => ({ id: c._id, label: c.label, category: c.category ?? "main" as const, chargedCents: effectiveChargeCents(c), originalChargedCents: c.amountCents, adjustedCents: c.adjustedCents ?? 0, paidCents: c.appliedCents, unpaidCents: effectiveChargeCents(c) - c.appliedCents, cancelledCents: c.cancelledCents ?? 0 }));
  // A reinstated row is history only: it is not shown as the current request.
  const pending = data.requests.find(r => (r.status === "pending" || r.status === "processing")) ?? data.requests.filter(r => r.reinstatedAt === undefined).at(-1);
  const active = activeApprovedWithdrawal(data.requests);
  const undo = user.role === "student" && data.student.userId === user._id ? await undoCheck(ctx, data, Date.now()) : null;
  const ownUndo = !!undo && typeof undo !== "string";
  // Only the signup-rule refusals are shown next to the withdrawal; any other refusal just hides Undo.
  const undoBlocked = undo === UNDO_NEEDS_SHIFTS || undo === UNDO_NEEDS_ANSWERS ? undo : null;
  const job = pending?.jobId ? await ctx.db.get(pending.jobId) : null;
  const wholeTeamLeft = data.participant.status === "withdrawn" && data.event.assignmentScope === "wholeTeam" && !!await ctx.db.query("wholeTeamLeaveNotices").withIndex("by_participantId", q => q.eq("participantId", data.participant._id)).first();
  const progress = job ? { jobId: job._id, state: job.state, committedCents: job.committedCents, totalCents: job.amountCents, lastError: job.lastError ?? null } : null;
  return { progress, canRetry: user.role === "coach" && job?.state === "failed", eventName: data.event.name, studentName: data.student.legalName || data.student.preferredName, allowWithdrawal: data.event.allowWithdrawal && !data.event.archived, wholeTeam: data.event.assignmentScope === "wholeTeam" && data.event.signupMode === "assigned", coachAssigned: data.event.signupMode === "assigned", wholeTeamLeft, revision: revision(data), status: data.participant.status, reviewRequired: data.participant.status === "withdrawn" || await withdrawalNeedsReview(ctx, data), withdrawnImmediately: data.participant.status === "withdrawn" && !!active && isAutomaticWithdrawal(active), canUndo: ownUndo, undoBlocked, undoUntil: undoDeadline(data.event), requestId: pending?._id ?? null, requestStatus: pending?.status ?? null, charges, paidMainCents: charges.filter(c => c.category === "main").reduce((n, c) => n + c.paidCents, 0), paidExtraCents: charges.filter(c => c.category === "extra").reduce((n, c) => n + c.paidCents, 0), unpaidMainCents: charges.filter(c => c.category === "main").reduce((n, c) => n + c.unpaidCents, 0), unpaidExtraCents: charges.filter(c => c.category === "extra").reduce((n, c) => n + c.unpaidCents, 0) };
}

type WithdrawalData = Awaited<ReturnType<typeof details>>;
/** Stored on automatic withdrawals (no Coach decision); with no jobId it marks the row as automatic. */
const AUTO_WITHDRAW_REASON = "Automatic withdrawal: no fee, payment, room or team transport for this event.";
const isAutomaticWithdrawal = (request: Doc<"withdrawalRequests">) => request.status === "approved" && !request.jobId && request.reason === AUTO_WITHDRAW_REASON;

/** Money still tied to this signup, or a request already in review. Shared by requestWithdrawal and leaveWholeTeam. */
function withdrawalMoneyReview(data: WithdrawalData) {
  return data.requests.some(r => r.status === "pending" || r.status === "processing")
    || data.event.feeCents > 0
    || data.charges.some(charge => effectiveChargeCents(charge) > 0 || charge.appliedCents > 0);
}

/**
 * Owner decision 2026-11-06: a withdrawal skips Coach/Travel Lead review only when no money and no logistics
 * commitment is involved. Commitments: a room membership or room request for the event, or a confirmed seat in
 * team transport (team transport on and the student not travelling independently). Shift signups are not
 * commitments; they are cleared on withdrawal. Coach-assigned events (signupMode "assigned", including Whole Team, whose
 * leave path is leaveWholeTeam with its durable Coach notice) always keep Coach/Travel Lead review.
 */
async function withdrawalNeedsReview(ctx: Context, data: WithdrawalData) {
  if (data.event.signupMode === "assigned") return true;
  if (withdrawalMoneyReview(data)) return true;
  const eventId = data.event._id, studentId = data.student._id;
  if (await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).first()) return true;
  if (await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).first()) return true;
  return data.participant.status === "confirmed" && !data.participant.independentTravel && teamTransportEnabled(data.event);
}

type Restorable = "pending" | "confirmed" | "waitlist";

/** Open places for a returning signup; mirrors setParticipation (capacity, and no jumping ahead of a waitlist on optional events). */
async function placeBlocker(ctx: Context, event: Doc<"events">, status: Restorable) {
  if (status === "waitlist") return null;
  const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
  if (rows.length > 500) return "This event has too many signups to update here. Contact a Coach.";
  if (event.signupMode !== "assigned" && rows.some(p => p.status === "waitlist")) return "Students are Waitlisted for this event. Promote them before adding another student.";
  if (event.capacity !== undefined && rows.filter(p => p.status === "confirmed" || p.status === "pending").length >= event.capacity) return "This event is full. A Coach can raise its capacity in event settings.";
  return null;
}

/** Last moment a student can undo: the earlier of the event start and the signup close time (when one is set). */
function undoDeadline(event: Doc<"events">) {
  return event.signupClosesAt === undefined ? event.startsAt : Math.min(event.startsAt, event.signupClosesAt);
}

/**
 * Owner decision 2026-11-06: a student may undo their own automatic withdrawal (never a Coach-reviewed one) before the event
 * starts and before signup closes, whichever is first, while the event still takes signups from them (current, not archived
 * or canceled, not Coach-assigned, enrollment finished, still in the event's audience, an open place) and at most
 * STUDENT_UNDO_LIMIT times per event, and only when signUp's rules would still let them back (signupRuleBlocker).
 * Returns the status to restore, or why not. Rooms, shifts and charges are not restored.
 * A student who was Waitlisted rejoins at the end of the waitlist; nobody is ever moved up a status by an undo.
 */
async function undoCheck(ctx: Context, data: WithdrawalData, now: number): Promise<{ restore: Restorable; request: Doc<"withdrawalRequests"> } | string> {
  const closed = "You can't undo this withdrawal now. Ask a Coach if you still need to go.";
  const request = activeApprovedWithdrawal(data.requests);
  if (data.participant.status !== "withdrawn" || !request || !isAutomaticWithdrawal(request) || request.participantId !== data.participant._id || !request.priorParticipation) return closed;
  if (data.requests.some(r => r.status === "pending" || r.status === "processing")) return closed;
  if (studentUndoCount(data.requests) >= STUDENT_UNDO_LIMIT) return "You've already undone a withdrawal from this event several times. Ask a Coach if you still need to go.";
  const event = data.event;
  if (event.archived || event.cancelled || event.signupMode === "assigned" || enrollmentPending(event) || now >= undoDeadline(event)) return closed;
  if (!await studentCanAccessEvent(ctx, event, data.student)) return closed;
  // Security review 2026-11-07: an undo follows signUp's rules. An approval event takes the student back as Waiting for approval at most.
  const restore = request.priorParticipation === "confirmed" && event.signupMode === "approval" ? "pending" : request.priorParticipation;
  const blocker = await placeBlocker(ctx, event, restore) ?? await signupRuleBlocker(ctx, event, data.student._id, restore);
  return blocker ?? { restore, request };
}

const UNDO_NEEDS_SHIFTS = "This event needs you to pick shifts, so Undo can't put you back. Ask a Coach to put you back on it.";
const UNDO_NEEDS_ANSWERS = "This event has questions you haven't answered, so Undo can't put you back. Ask a Coach to put you back on it.";

/**
 * The shift and question checks signUp makes, run against what the student already has: shifts were cleared on withdrawal,
 * so an event that requires shifts (outside the waitlist) can't be rejoined by Undo; stored answers must still satisfy the
 * event's current active questions (new required questions, or changed options). Reads only.
 */
async function signupRuleBlocker(ctx: Context, event: Doc<"events">, studentId: Id<"students">, restore: Restorable) {
  if (restore !== "waitlist" && await refused(() => checkShifts(ctx, event, studentId, []))) return UNDO_NEEDS_SHIFTS;
  const questions = new Set((await activeQuestions(ctx, event._id)).map(q => q._id));
  const stored = await ctx.db.query("eventQuestionAnswers").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).take(MAX_QUESTION_ROWS + 1);
  if (stored.length > MAX_QUESTION_ROWS) return UNDO_NEEDS_ANSWERS;
  const answers = stored.filter(a => questions.has(a.questionId)).map(a => ({ questionId: a.questionId, value: a.value }));
  if (await refused(() => checkAnswers(ctx, event._id, answers))) return UNDO_NEEDS_ANSWERS;
  return null;
}

/** True when a signUp check refuses (a ConvexError); any other error still throws. */
async function refused(check: () => Promise<unknown>) {
  try { await check(); return false; } catch (error) { if (error instanceof ConvexError) return true; throw error; }
}

function revision(data: Awaited<ReturnType<typeof details>>) {
  return JSON.stringify([data.event._id, data.event.archived, data.participant.status, data.participant.updatedAt, ...data.charges.map(c => [c._id, c.amountCents, c.adjustedCents ?? 0, c.appliedCents, c.cancelledCents ?? 0, c.revision ?? 0, c.category ?? "main"])]);
}

export const withdrawalPreview = query({
  args: { eventId: v.id("events"), studentId: v.id("students") }, returns: previewResult,
  handler: async (ctx, args) => { const user = await viewer(ctx); await studentAccess(ctx, user, args.studentId); await requireFamilyEventAccess(ctx, user, [args.eventId]); return publicErrorResult(summary(ctx, user, await details(ctx, args.eventId, args.studentId))); },
});

export const pendingWithdrawals = query({
  args: {}, returns: v.array(v.object({ requestId: v.id("withdrawalRequests"), eventId: v.id("events"), studentId: v.id("students"), eventName: v.string(), studentName: v.string(), requestedAt: v.number(), status: v.union(v.literal("pending"), v.literal("processing")), progress: v.union(progressValidator, v.null()) })),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can review withdrawal requests.");
    const season = await activeSeason(ctx);
    const pending = await ctx.db.query("withdrawalRequests").withIndex("by_status", q => q.eq("status", "pending")).take(101);
    const processing = await ctx.db.query("withdrawalRequests").withIndex("by_status", q => q.eq("status", "processing")).take(101);
    const rows = [...pending, ...processing];
    if (pending.length > 100 || processing.length > 100) throw new ConvexError("There are too many withdrawal requests to show. Decide some, then reload.");
    const result = [];
    for (const row of rows) {
      const event = await ctx.db.get(row.eventId), student = await ctx.db.get(row.studentId);
      const job = row.jobId ? await ctx.db.get(row.jobId) : null;
      const progress = job ? { jobId: job._id, state: job.state, committedCents: job.committedCents, totalCents: job.amountCents, lastError: job.lastError ?? null } : null;
      if (event?.seasonId === season._id && student?.seasonId === season._id) result.push({ requestId: row._id, eventId: row.eventId, studentId: row.studentId, eventName: event.name, studentName: student.legalName || student.preferredName, requestedAt: row.requestedAt, status: row.status as "pending" | "processing", progress });
    }
    return publicErrorResult(result);
  },
});

export const wholeTeamLeaveNotices = query({
  args: { eventId: v.optional(v.id("events")) },
  returns: v.array(v.object({ noticeId: v.id("wholeTeamLeaveNotices"), eventId: v.id("events"), eventName: v.string(), studentName: v.string(), leftAt: v.number() })),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can see Whole Team leave notices.");
    const season = await activeSeason(ctx);
    const event = args.eventId ? await ctx.db.get(args.eventId) : null;
    if (args.eventId && (!event || event.seasonId !== season._id)) throw new ConvexError("This event isn't in the current season. Reload to see the latest.");
    const notices = args.eventId
      ? await ctx.db.query("wholeTeamLeaveNotices").withIndex("by_eventId_and_dismissedAt", q => q.eq("eventId", args.eventId!).eq("dismissedAt", undefined)).take(101)
      : await ctx.db.query("wholeTeamLeaveNotices").withIndex("by_seasonId_and_dismissedAt", q => q.eq("seasonId", season._id).eq("dismissedAt", undefined)).take(101);
    if (notices.length > 100) throw new ConvexError("There are too many leave notices to show. Dismiss some, then reload.");
    const rows = [];
    for (const notice of notices) {
      if (notice.seasonId !== season._id || notice.dismissedAt !== undefined) continue;
      const student = await ctx.db.get(notice.studentId);
      const noticeEvent = event ?? await ctx.db.get(notice.eventId);
      if (!student || !noticeEvent || student.seasonId !== season._id || noticeEvent.seasonId !== season._id) continue;
      rows.push({ noticeId: notice._id, eventId: notice.eventId, eventName: noticeEvent.name, studentName: student.legalName || student.preferredName, leftAt: notice.leftAt });
    }
    return publicErrorResult(rows);
  },
});

export const dismissWholeTeamLeaveNotice = mutation({
  args: { noticeId: v.id("wholeTeamLeaveNotices") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new ConvexError("Only a Coach can dismiss Whole Team leave notices.");
    const season = await activeSeason(ctx);
    const notice = await ctx.db.get(args.noticeId);
    if (!notice || notice.seasonId !== season._id) throw new ConvexError("This leave notice no longer exists. Reload to see the latest.");
    if (notice.dismissedAt !== undefined) return null;
    const dismissedAt = Date.now();
    await ctx.db.patch(notice._id, { dismissedAt, dismissedBy: user._id });
    await audit(ctx, user, "wholeTeamLeaveNotices", notice._id, "dismiss", { dismissedAt: null }, { dismissedAt });
    return null;
  },
});

export const requestWithdrawal = mutation({
  args: { eventId: v.id("events"), idempotencyKey: v.string() }, returns: v.id("withdrawalRequests"),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx), student = await ownStudent(ctx, user);
    const data = await details(ctx, args.eventId, student._id);
    requireEnrollmentComplete(data.event);
    const blocked = "You can't withdraw from this event. Ask a Coach or Travel Lead if you need to leave.";
    if (data.event.archived || !data.event.allowWithdrawal) throw new ConvexError(blocked);
    if (args.idempotencyKey.length < 8 || args.idempotencyKey.length > 120) throw new ConvexError("Something went wrong sending your request. Reload, then try again.");
    const duplicate = await ctx.db.query("withdrawalRequests").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (duplicate) { if (duplicate.eventId !== args.eventId || duplicate.studentId !== student._id) throw new ConvexError("This was already submitted with different details. Reload to see the latest, then try again."); return duplicate._id; }
    if (data.participant.status === "withdrawn") throw new ConvexError(blocked);
    const pending = data.requests.find(r => r.status === "pending" || r.status === "processing");
    if (pending) return pending._id;
    if (activeApprovedWithdrawal(data.requests)) throw new ConvexError("Your withdrawal from this event was already approved.");
    const priorParticipation = data.participant.status;
    const now = Date.now();
    if (!await withdrawalNeedsReview(ctx, data)) {
      // No money or logistics commitment: withdraw now and keep an approved row so history, retries and re-enrollment rules still apply.
      const id = await ctx.db.insert("withdrawalRequests", { eventId: args.eventId, studentId: student._id, participantId: data.participant._id, status: "approved", requestedBy: user._id, requestedAt: now, decidedBy: user._id, decidedAt: now, decision: "full", returnCents: 0, retainedCents: 0, cancelUnpaidMain: false, reason: AUTO_WITHDRAW_REASON, idempotencyKey: args.idempotencyKey, priorParticipation });
      await removeRoomState(ctx, data.event._id, student._id, user);
      const shiftSignupsCleared = await clearShifts(ctx, data.event._id, student._id);
      await ctx.db.patch(data.participant._id, { status: "withdrawn", updatedAt: now });
      await audit(ctx, user, "withdrawalRequests", id, "autoWithdraw", { participation: data.participant.status }, { status: "approved", participation: "withdrawn", eventId: args.eventId, studentId: student._id, shiftSignupsCleared }, AUTO_WITHDRAW_REASON);
      // M5 to the Mentor who created the meeting (no-op for other events). Like signUp, only a Signed up student counts.
      if (priorParticipation === "confirmed") await queueMentorMeetingActivityDigest(ctx, { eventId: args.eventId, activity: "studentLeft" });
      return id;
    }
    const id = await ctx.db.insert("withdrawalRequests", { eventId: args.eventId, studentId: student._id, participantId: data.participant._id, status: "pending", requestedBy: user._id, requestedAt: now, idempotencyKey: args.idempotencyKey });
    await audit(ctx, user, "withdrawalRequests", id, "request", null, { eventId: args.eventId, studentId: student._id, participation: data.participant.status });
    await queueWithdrawalRequestDigest(ctx);
    return id;
  },
});

export const leaveWholeTeam = mutation({
  args: { eventId: v.id("events") }, returns: v.object({ moneyReviewPending: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx), student = await ownStudent(ctx, user);
    const data = await details(ctx, args.eventId, student._id);
    requireEnrollmentComplete(data.event);
    if (data.event.archived || data.event.assignmentScope !== "wholeTeam" || data.event.signupMode !== "assigned") throw new ConvexError("You can't leave this event here. Reload to see the latest.");
    if (data.participant.status === "withdrawn") {
      const prior = await ctx.db.query("wholeTeamLeaveNotices").withIndex("by_participantId", q => q.eq("participantId", data.participant._id)).first();
      if (!prior) throw new ConvexError("Your signup already changed. Reload to see the latest.");
      return { moneyReviewPending: data.requests.some(request => request.wholeTeamLeave && (request.status === "pending" || request.status === "processing")) };
    }
    if (data.participant.status !== "confirmed") throw new ConvexError("You can leave this event only once you're signed up for it.");
    const pending = data.requests.find(request => request.status === "pending" || request.status === "processing");
    const needsMoneyReview = withdrawalMoneyReview(data);
    if (activeApprovedWithdrawal(data.requests)) throw new ConvexError("An earlier withdrawal from this event needs a Coach to review it. Ask a Coach for help.");
    const now = Date.now();
    const noticeId = await ctx.db.insert("wholeTeamLeaveNotices", { seasonId: data.event.seasonId, eventId: data.event._id, studentId: student._id, participantId: data.participant._id, leftAt: now });
    if (needsMoneyReview) {
      if (pending) await ctx.db.patch(pending._id, { wholeTeamLeave: true });
      else {
        await ctx.db.insert("withdrawalRequests", { eventId: data.event._id, studentId: student._id, participantId: data.participant._id, wholeTeamLeave: true, status: "pending", requestedBy: user._id, requestedAt: now, idempotencyKey: `wholeTeamLeave:${noticeId}` });
        await queueWithdrawalRequestDigest(ctx);
      }
    }
    await removeRoomState(ctx, data.event._id, student._id, user);
    await clearShifts(ctx, data.event._id, student._id);
    await ctx.db.patch(data.participant._id, { status: "withdrawn", updatedAt: now });
    await audit(ctx, user, "participants", data.participant._id, "leaveWholeTeam", { status: "confirmed" }, { status: "withdrawn", noticeId, moneyReviewPending: needsMoneyReview });
    return { moneyReviewPending: needsMoneyReview };
  },
});

/** Student undo of their own automatic withdrawal (see undoCheck). Identity comes from the session; Parents cannot undo. */
export const undoWithdrawal = mutation({
  args: { eventId: v.id("events") }, returns: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist")),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx), student = await ownStudent(ctx, user);
    const data = await details(ctx, args.eventId, student._id);
    requireEnrollmentComplete(data.event);
    const latest = data.requests.at(-1);
    if (data.participant.status !== "withdrawn" && latest?.reinstatedByStudent && latest.reinstatedBy === user._id) return data.participant.status;
    const now = Date.now();
    const check = await undoCheck(ctx, data, now);
    if (typeof check === "string") throw new ConvexError(check);
    await ctx.db.patch(check.request._id, { reinstatedAt: now, reinstatedBy: user._id, reinstatedByStudent: true });
    await ctx.db.patch(data.participant._id, { status: check.restore, createdAt: check.restore === "waitlist" ? now : data.participant.createdAt, updatedAt: now });
    // Owner decision 2026-11-07: Undo never adds, restores or changes a charge (the fee rule is deferred).
    await audit(ctx, user, "withdrawalRequests", check.request._id, "undoWithdrawal", { participation: "withdrawn" }, { participation: check.restore, reinstatedAt: now, chargesChanged: false });
    if (check.restore === "pending") await queueSignupPendingDigest(ctx, { eventId: data.event._id });
    // M5, as for a new signup: back on as Signed up, or waiting for approval. A Waitlisted return is not reported.
    if (check.restore === "confirmed") await queueMentorMeetingActivityDigest(ctx, { eventId: data.event._id, activity: "studentJoined" });
    else if (check.restore === "pending") await queueMentorMeetingActivityDigest(ctx, { eventId: data.event._id, activity: "signupPending" });
    return check.restore;
  },
});

/**
 * Coach "Put back on event" for a withdrawn student (owner decision 2026-11-06). Permissions mirror setParticipation: a Coach for
 * any event, a Travel Lead only for events that are not Coach-assigned. The approved withdrawal is marked reinstated, never
 * deleted, and money stays exactly as the withdrawal decision left it: owner decision 2026-11-07 defers the Put back fee rule, so
 * no charge is added, restored, reversed or re-allocated here. The Coach or Travel Lead adjusts charges by hand if the student
 * should pay. The student goes back to Signed up.
 */
export const putBackOnEvent = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can put a student back on an event.");
    if (args.reason !== undefined && args.reason.length > 1000) throw new ConvexError("Keep the note under 1,000 characters.");
    const data = await details(ctx, args.eventId, args.studentId);
    const event = data.event;
    if (event.archived || event.cancelled) throw new ConvexError("This event is canceled or in Past events, so students can't be put back on it.");
    requireEnrollmentComplete(event);
    if (resolveAudience(event).kind === "mentorsOnly") throw new ConvexError("This event is for Mentors only, so students can't be added to it.");
    if (event.signupMode === "assigned" && user.role !== "coach") throw new ConvexError("Only a Coach can change signups for a required event.");
    if (data.participant.status !== "withdrawn") throw new ConvexError("This student is already on this event. Reload to see the latest.");
    if (data.requests.some(r => r.status === "pending" || r.status === "processing")) throw new ConvexError("A withdrawal for this student is still being reviewed. Finish it under Withdrawal requests first.");
    const blocker = await placeBlocker(ctx, event, "confirmed");
    if (blocker) throw new ConvexError(blocker);
    const now = Date.now();
    const request = activeApprovedWithdrawal(data.requests);
    if (request) await ctx.db.patch(request._id, { reinstatedAt: now, reinstatedBy: user._id });
    await ctx.db.patch(data.participant._id, { status: "confirmed", createdAt: now, updatedAt: now });
    // Owner decision 2026-11-07: Put back never touches charges; the audit row records that no fee was changed.
    await audit(ctx, user, "participants", data.participant._id, "putBackOnEvent", { status: "withdrawn", withdrawalRequestId: request?._id ?? null, moneyDecision: !!request?.jobId }, { status: "confirmed", chargesChanged: false }, args.reason?.trim() || undefined);
    // The student is back, so their Whole Team leave notice is no longer news for Coaches.
    if (event.assignmentScope === "wholeTeam") {
      const notices = await ctx.db.query("wholeTeamLeaveNotices").withIndex("by_participantId", q => q.eq("participantId", data.participant._id)).take(101);
      if (notices.length > 100) throw new ConvexError("This student has too many leave notices to update here. Ask a Coach for help.");
      for (const notice of notices) {
        if (notice.dismissedAt !== undefined || notice.eventId !== event._id) continue;
        await ctx.db.patch(notice._id, { dismissedAt: now, dismissedBy: user._id });
        await audit(ctx, user, "wholeTeamLeaveNotices", notice._id, "dismiss", { dismissedAt: null }, { dismissedAt: now }, "Put back on event");
      }
    }
    await notifyEventAssigned(ctx, { eventId: event._id, studentIds: [data.student._id] });
    await queueMentorMeetingActivityDigest(ctx, { eventId: event._id, activity: "studentJoined" }); // M5
    return null;
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
  if (invites.length > 100) throw new ConvexError("There are too many room invitations to update. Ask a Coach for help.");
  for (const invite of invites) if (invite.eventId === eventId && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
  const groups = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(101);
  if (groups.length > 100) throw new ConvexError("There are too many room groups to update. Ask a Coach for help.");
  for (const group of groups) {
    const groupInvites = await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(101);
    if (groupInvites.length > 100) throw new ConvexError("There are too many room invitations to update. Ask a Coach for help.");
    for (const invite of groupInvites) if (invite.invitedBy === studentId && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
  }
}

export const reviewWithdrawal = mutation({
  args: { requestId: v.id("withdrawalRequests"), decision, returnCents: v.optional(v.number()), cancelUnpaidMain: v.boolean(), reason: v.string(), expectedRevision: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can review withdrawal requests.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new ConvexError("Provide an explanation of at least eight characters.");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("This withdrawal request no longer exists. Reload to see the latest.");
    if (request.status !== "pending") {
      if (request.decision === args.decision && request.cancelUnpaidMain === args.cancelUnpaidMain && request.reason === args.reason.trim() && (args.decision !== "partial" || request.returnCents === args.returnCents)) return null;
      throw new ConvexError("This withdrawal request was already decided. Reload to see the decision.");
    }
    const data = await details(ctx, request.eventId, request.studentId);
    requireEnrollmentComplete(data.event);
    if (data.event.archived) throw new ConvexError("This event is in Past events, so its withdrawal requests can't be decided here.");
    if (args.expectedRevision !== revision(data)) throw new ConvexError("The signup or fees changed. Review the updated amounts before deciding.");
    if (data.participant._id !== request.participantId || (request.wholeTeamLeave ? data.participant.status !== "withdrawn" : data.participant.status === "withdrawn")) throw new ConvexError("The signup changed. Review the request again.");
    if (args.decision === "deny") {
      if (args.returnCents !== undefined || args.cancelUnpaidMain) throw new ConvexError("Denying a request can't move money. Choose another decision to return money.");
      await ctx.db.patch(request._id, { status: "denied", decision: "deny", decidedBy: user._id, decidedAt: Date.now(), reason: args.reason.trim(), cancelUnpaidMain: false, returnCents: 0, retainedCents: 0 });
      await audit(ctx, user, "withdrawalRequests", request._id, "deny", { status: "pending" }, { status: "denied", participation: data.participant.status }, args.reason.trim());
      await notifyWithdrawalDecision(ctx, { requestId: request._id, approved: false });
      return null;
    }
    const totalPaid = data.charges.reduce((n, c) => n + c.appliedCents, 0);
    const returned = args.decision === "full" ? totalPaid : args.decision === "retain" ? 0 : args.returnCents;
    if (!Number.isSafeInteger(returned) || returned === undefined || returned < 0 || returned > totalPaid || args.decision === "partial" && returned === 0) throw new ConvexError("Enter an amount between $0.01 and the amount paid for this event.");
    if (args.decision !== "partial" && args.returnCents !== undefined) throw new ConvexError("Enter a custom amount only when returning part of the money.");
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
  if (!job.withdrawalRequestId || !job.eventId) throw new ConvexError("Withdrawal job is missing its frozen request.");
  const request = await ctx.db.get(job.withdrawalRequestId);
  if (!request || request.status !== "processing" || request.jobId !== job._id) throw new ConvexError("This changed since you opened it. Reload to see the latest, then try again.");
  const participant = await ctx.db.get(request.participantId);
  if (!participant || participant.studentId !== job.studentId || participant.eventId !== job.eventId || (request.wholeTeamLeave ? participant.status !== "withdrawn" : participant.status === "withdrawn")) throw new ConvexError("The signup changed. Review the request again.");
  const leftSignedUp = participant.status === "confirmed";
  if (participant.status !== "withdrawn") {
    await removeRoomState(ctx, job.eventId, job.studentId, user);
    await clearShifts(ctx, job.eventId, job.studentId);
    await ctx.db.patch(participant._id, { status: "withdrawn", updatedAt: Date.now() });
  }
  await ctx.db.patch(request._id, { status: "approved", decidedBy: user._id, decidedAt: Date.now() });
  await notifyWithdrawalDecision(ctx, { requestId: request._id, approved: true });
  // M5 to the Mentor who created the meeting; a Whole Team leave (already withdrawn) was not a drop-out here.
  if (leftSignedUp) await queueMentorMeetingActivityDigest(ctx, { eventId: job.eventId, activity: "studentLeft" });
  await audit(ctx, user, "withdrawalRequests", request._id, "approve", { status: "processing", participation: participant.status }, { status: "approved", participation: "withdrawn", returnedCents: job.committedCents, retainedCents: request.retainedCents }, job.reason);
}
