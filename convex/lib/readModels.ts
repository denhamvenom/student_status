import { effectiveChargeCents } from "./chargeObligation";
import { enrollmentPending } from "./eventEnrollmentState";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { privateStudent, publicStudent } from "./access";
import { calculateStudentFinance } from "./financeSummaries";
import { permissionAccepted } from "./permissionCoverage";
import { feeMaintenanceProjection } from "./seasonFinance";
export { permissionAccepted } from "./permissionCoverage";

type Ctx = QueryCtx | MutationCtx;

export async function financeFor(ctx: Ctx, studentId: Id<"students">) {
  const account = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique();
  const student = await ctx.db.get(studentId);
  const maintenance = student ? await feeMaintenanceProjection(ctx, student.seasonId) : null;
  if (account?.state !== "ready" || account.allocationSourceVersion !== 1) return { state: account?.state === "failed" ? "failed" as const : "updating" as const, summary: null, maintenance };
  return { state: "ready" as const, summary: await calculateStudentFinance(ctx, studentId), maintenance };
}
export async function studentReadiness(ctx: Ctx, event: Doc<"events">, student: Doc<"students">) {
  const open: string[] = [];
  const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
  if (enrollmentPending(event)) return { state: "open" as const, open: ["Whole Team enrollment is not complete."], participation: participant?.status ?? null };
  if (participant?.status !== "confirmed") return { state: "notApplicable" as const, open, participation: participant?.status ?? null };
  const financialAccount = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
  const maintenance = await feeMaintenanceProjection(ctx, event.seasonId);
  if (maintenance && maintenance.state !== "ready") open.push("Season fee maintenance is not complete");
  if (financialAccount?.state !== "ready" || financialAccount.allocationSourceVersion !== 1) open.push("Financial records require review or are updating");
  const eventCharges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
  if (eventCharges.length > 100) open.push("Event financial records require review");
  if (eventCharges.some(x => x.appliedCents < effectiveChargeCents(x))) open.push("Required payment");
  if (event.permissionRequired && !(await permissionAccepted(ctx, student._id, event._id))) open.push("Permission accepted");
  const completions = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
  if (event.firstRequired && !completions.some(x => x.key === "first")) open.push("FIRST registration");
  const custom = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
  if (completions.length > 100 || custom.length > 100) open.push("Event requirements require review");
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
