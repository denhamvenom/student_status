import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { audit } from "./access";
import { addCharge, addCharges, type ChargeDraft } from "./money";

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

export async function syncWholeTeamMembership(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">) {
  if (!student.active) return false;
  const now = Date.now();
  const events = await ctx.db.query("events").withIndex("by_seasonId_and_assignmentScope_and_archived_and_startsAt", q => q.eq("seasonId", student.seasonId).eq("assignmentScope", "wholeTeam").eq("archived", false).gt("startsAt", now)).take(101);
  if (events.length > 100) throw new Error("Whole Team event limit reached; membership update stopped safely.");
  const drafts: ChargeDraft[] = [];
  for (const event of events) {
    if (await enrollWholeTeamMember(ctx, actor, event, student) && event.feeCents > 0) drafts.push({ label: event.name, amountCents: event.feeCents, priority: event.startsAt, idempotencyKey: `eventFee:${event._id}:${student._id}`, eventId: event._id });
  }
  if (drafts.length) await addCharges(ctx, actor, student._id, drafts, `auto:${drafts[0].idempotencyKey}`);
}
