import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { audit } from "./access";
import { addCharge, addCharges, type ChargeDraft } from "./money";
import { makeFunctionReference } from "convex/server";

const notifyAssignedRef = makeFunctionReference<"mutation", { studentId: Id<"students">; eventIds: Id<"events">[] }, null>("participation:notifyWholeTeamAssigned");

/** Enrollment is additive: existing participation and reviewed withdrawals retain their history. */
async function enrollWholeTeamMember(ctx: MutationCtx, actor: Doc<"appUsers">, event: Doc<"events">, student: Doc<"students">) {
  if (!student.active || student.seasonId !== event.seasonId || event.archived || event.cancelled || event.signupMode !== "assigned" || event.assignmentScope !== "wholeTeam") return false;
  const prior = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
  if (prior) return false;
  const withdrawals = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
  if (withdrawals.length > 100) throw new Error("Withdrawal history limit reached; automatic assignment stopped safely.");
  if (withdrawals.some(request => request.status === "approved")) return false;
  const count = event.wholeTeamParticipantCount;
  if (count === undefined || !Number.isSafeInteger(count) || count < 0) throw new Error("Whole Team enrollment count needs reconciliation before adding members.");
  if (count >= 500) throw new Error("Whole Team event roster limit reached; membership update stopped safely.");
  const now = Date.now();
  await ctx.db.insert("participants", { eventId: event._id, studentId: student._id, status: "confirmed", createdAt: now, updatedAt: now });
  await ctx.db.patch(event._id, { wholeTeamParticipantCount: count + 1 });
  await audit(ctx, actor, "participants", `${event._id}:${student._id}`, "wholeTeamAssignment", null, "confirmed");
  return true;
}

export async function assignWholeTeamMember(ctx: MutationCtx, actor: Doc<"appUsers">, event: Doc<"events">, student: Doc<"students">, enrollmentJobId?: Id<"eventEnrollmentJobs">) {
  if (await enrollWholeTeamMember(ctx, actor, event, student) && event.feeCents > 0) await addCharge(ctx, actor, student._id, event.name, event.feeCents, event.startsAt, `eventFee:${event._id}:${student._id}`, event._id, undefined, enrollmentJobId);
}

/** Events synced per mutation; the rest run as scheduled background pages (membershipSync.continueSync). */
export const MEMBERSHIP_SYNC_PAGE = 50;

/** Continuation key: the last event handled (index order is startsAt, then creation time). */
export type MembershipSyncAfter = { startsAt: number; creationTime: number };
export type MembershipSyncOptions = { after?: MembershipSyncAfter; notifiedSeriesIds?: Id<"eventSeries">[] };

const continueSyncRef = makeFunctionReference<"mutation", { kind: "wholeTeam" | "subteams"; studentId: Id<"students">; actorId: Id<"appUsers">; after: MembershipSyncAfter; notifiedSeriesIds: Id<"eventSeries">[] }, null>("membershipSync:continueSync");

/**
 * One bounded page of future events from an index ordered by startsAt (no .paginate(): a caller may run both syncs in one
 * mutation). Starts after `after` when continuing; `more` is true when another event follows the page.
 */
export async function membershipPage(query: AsyncIterable<Doc<"events">>, after: MembershipSyncAfter | undefined) {
  const page: Doc<"events">[] = [];
  for await (const event of query) {
    if (after && event.startsAt === after.startsAt && event._creationTime <= after.creationTime) continue;
    if (page.length >= MEMBERSHIP_SYNC_PAGE) return { page, more: true };
    page.push(event);
  }
  return { page, more: false };
}

/**
 * The events to send an assignment notice for: every standalone event, and only the first (earliest) newly joined meeting of
 * each recurring series, so joining a group sends one notice per series instead of one per meeting. `notified` carries the
 * series already noticed by earlier pages of the same sync and is updated in place.
 */
export function assignmentNoticeEventIds(added: Doc<"events">[], notified: Set<Id<"eventSeries">>): Id<"events">[] {
  const ids: Id<"events">[] = [];
  for (const event of [...added].sort((a, b) => a.startsAt - b.startsAt)) {
    if (event.seriesId === undefined) { ids.push(event._id); continue; }
    if (notified.has(event.seriesId)) continue;
    notified.add(event.seriesId);
    ids.push(event._id);
  }
  return ids;
}

/** Charges, one background notice batch and (when more events remain) the next page, shared by both membership syncs. */
export async function finishMembershipPage(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">, kind: "wholeTeam" | "subteams", added: Doc<"events">[], page: { page: Doc<"events">[]; more: boolean }, notified: Set<Id<"eventSeries">>) {
  const drafts: ChargeDraft[] = added.filter(event => event.feeCents > 0).map(event => ({ label: event.name, amountCents: event.feeCents, priority: event.startsAt, idempotencyKey: `eventFee:${event._id}:${student._id}`, eventId: event._id }));
  if (drafts.length) await addCharges(ctx, actor, student._id, drafts, `auto:${drafts[0].idempotencyKey}`);
  // Only events this call newly enrolled the student in, sent in the background so a roster change stays a bounded write.
  const notice = assignmentNoticeEventIds(added, notified);
  if (notice.length) await ctx.scheduler.runAfter(0, notifyAssignedRef, { studentId: student._id, eventIds: notice });
  const last = page.page[page.page.length - 1];
  if (page.more && last) await ctx.scheduler.runAfter(0, continueSyncRef, { kind, studentId: student._id, actorId: actor._id, after: { startsAt: last.startsAt, creationTime: last._creationTime }, notifiedSeriesIds: [...notified] });
}

/** Joins future Whole Team events (bounded pages; later pages continue in the background instead of failing the caller). */
export async function syncWholeTeamMembership(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">, options: MembershipSyncOptions = {}) {
  if (!student.active) return false;
  const after = options.after;
  const now = Date.now();
  const page = await membershipPage(ctx.db.query("events").withIndex("by_seasonId_and_assignmentScope_and_archived_and_startsAt", q => after ? q.eq("seasonId", student.seasonId).eq("assignmentScope", "wholeTeam").eq("archived", false).gte("startsAt", Math.max(after.startsAt, now)) : q.eq("seasonId", student.seasonId).eq("assignmentScope", "wholeTeam").eq("archived", false).gt("startsAt", now)), after);
  const added: Doc<"events">[] = [];
  for (const event of page.page) if (await enrollWholeTeamMember(ctx, actor, event, student)) added.push(event);
  await finishMembershipPage(ctx, actor, student, "wholeTeam", added, page, new Set(options.notifiedSeriesIds ?? []));
  return added.length > 0;
}
