import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { audit } from "./access";
import { addCharge } from "./money";
import { resolveAudience, studentInAudience } from "./eventAudienceRules";
import { finishMembershipPage, membershipPage, type MembershipSyncOptions } from "./wholeTeam";

/** A mandatory event for one or more subteams: matching students are enrolled automatically (not the Whole Team path). */
export function isSubteamMandatory(event: Doc<"events">) {
  const audience = resolveAudience(event);
  return !audience.legacy && audience.kind === "subteams" && audience.mandatory && event.signupMode === "assigned";
}

/** Additive, like Whole Team enrollment: prior participation and approved withdrawals are never overridden. */
async function enrollSubteamMember(ctx: MutationCtx, actor: Doc<"appUsers">, event: Doc<"events">, student: Doc<"students">) {
  if (!student.active || student.seasonId !== event.seasonId || event.archived || event.cancelled || !isSubteamMandatory(event) || !studentInAudience(event, student, false)) return false;
  const prior = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
  if (prior) return false;
  const withdrawals = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
  if (withdrawals.length > 100) throw new Error("Withdrawal history limit reached; automatic assignment stopped safely.");
  if (withdrawals.some(request => request.status === "approved")) return false;
  const now = Date.now();
  await ctx.db.insert("participants", { eventId: event._id, studentId: student._id, status: "confirmed", createdAt: now, updatedAt: now });
  await audit(ctx, actor, "participants", `${event._id}:${student._id}`, "subteamAssignment", null, "confirmed");
  return true;
}

export async function assignSubteamMember(ctx: MutationCtx, actor: Doc<"appUsers">, event: Doc<"events">, student: Doc<"students">, enrollmentJobId?: Id<"eventEnrollmentJobs">) {
  if (await enrollSubteamMember(ctx, actor, event, student) && event.feeCents > 0) await addCharge(ctx, actor, student._id, event.name, event.feeCents, event.startsAt, `eventFee:${event._id}:${student._id}`, event._id, undefined, enrollmentJobId);
}

/**
 * Sync for a student whose subteam, secondary subteam, leadership or active status changed: joins future subteam-mandatory
 * events they now match. Only mandatory (Coach-assigned) subteam events are read, in bounded pages; later pages continue in
 * the background (membershipSync.continueSync) instead of failing the roster change. One notice per series.
 */
export async function syncSubteamMembership(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">, options: MembershipSyncOptions = {}) {
  if (!student.active) return false;
  const after = options.after;
  const now = Date.now();
  const page = await membershipPage(ctx.db.query("events").withIndex("by_seasonId_audienceKind_signupMode_archived_startsAt", q => after ? q.eq("seasonId", student.seasonId).eq("audienceKind", "subteams").eq("signupMode", "assigned").eq("archived", false).gte("startsAt", Math.max(after.startsAt, now)) : q.eq("seasonId", student.seasonId).eq("audienceKind", "subteams").eq("signupMode", "assigned").eq("archived", false).gt("startsAt", now)), after);
  const added: Doc<"events">[] = [];
  for (const event of page.page) if (await enrollSubteamMember(ctx, actor, event, student)) added.push(event);
  await finishMembershipPage(ctx, actor, student, "subteams", added, page, new Set(options.notifiedSeriesIds ?? []));
  return added.length > 0;
}
