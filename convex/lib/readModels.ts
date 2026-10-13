import { enrollmentPending } from "./eventEnrollmentState";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { privateStudent, publicStudent } from "./access";
import { effectiveChargeCents, sourceBalances } from "./money";
import { permissionAccepted } from "./permissionCoverage";
export { permissionAccepted } from "./permissionCoverage";

type Ctx = QueryCtx | MutationCtx;

export async function financeFor(ctx: Ctx, studentId: Id<"students">) {
  const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).take(501);
  const entries = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", studentId)).order("desc").take(501);
  if (charges.length > 500 || entries.length > 500) throw new Error("Financial record limit reached; contact an administrator before continuing.");
  const chargedCents = charges.reduce((sum, x) => sum + effectiveChargeCents(x), 0);
  const appliedCents = charges.reduce((sum, x) => sum + x.appliedCents, 0);
  const sources = sourceBalances(entries);
  const personalAvailableCents = sources.filter(x => x.entry.kind === "payment").reduce((sum, x) => sum + x.available, 0);
  const fundraisingAvailableCents = sources.filter(x => x.entry.kind === "fundraiser").reduce((sum, x) => sum + x.available, 0);
  return { charges, entries, summary: { chargedCents, paidCents: appliedCents, dueCents: chargedCents - appliedCents, travelBalanceCents: personalAvailableCents + fundraisingAvailableCents, personalAvailableCents, fundraisingAvailableCents } };
}

export async function studentReadiness(ctx: Ctx, event: Doc<"events">, student: Doc<"students">) {
  const open: string[] = [];
  const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
  if (enrollmentPending(event)) return { state: "open" as const, open: ["Whole Team enrollment is not complete."], participation: participant?.status ?? null };
  if (participant?.status !== "confirmed") return { state: "notApplicable" as const, open, participation: participant?.status ?? null };
  const eventCharges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100);
  if (eventCharges.some(x => x.appliedCents < x.amountCents - (x.cancelledCents ?? 0))) open.push("Required payment");
  if (event.permissionRequired && !(await permissionAccepted(ctx, student._id, event._id))) open.push("Permission accepted");
  const completions = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100);
  if (event.firstRequired && !completions.some(x => x.key === "first")) open.push("FIRST registration");
  const custom = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
  for (const requirement of custom) if (!completions.some(x => x.key === requirement.key)) open.push(requirement.label);
  if (event.overnight && event.roomingEnabled) {
    const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    let complete = !!request;
    if (membership) {
      const group = await ctx.db.get(membership.groupId);
      const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", membership.groupId)).take(6);
      complete = complete || !!group?.finalized || members.length > 1;
    }
    if (!complete) open.push("Room selection");
  }
  return { state: open.length ? "open" as const : "ready" as const, open, participation: participant.status };
}

export async function attendanceFor(ctx: Ctx, student: Doc<"students">) {
  const meetings = await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", student.seasonId)).take(500);
  const records = await ctx.db.query("attendanceRecords").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(500);
  const present = new Set(records.filter(x => x.present).map(x => x.meetingId));
  const held = meetings.filter(x => !x.cancelled);
  const tuesdayHeld = held.filter(x => x.kind === "Tuesday").length;
  const tuesdayAttended = held.filter(x => x.kind === "Tuesday" && present.has(x._id)).length;
  return { tuesdayHeld, tuesdayAttended, tuesdayPercent: tuesdayHeld ? Math.round(100 * tuesdayAttended / tuesdayHeld) : null, thursdayAttended: held.filter(x => x.kind === "Thursday" && present.has(x._id)).length, outreachAttended: held.filter(x => x.kind === "Outreach" && present.has(x._id)).length };
}

export { publicStudent, privateStudent };
