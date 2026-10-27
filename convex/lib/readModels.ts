import { effectiveChargeCents } from "./chargeObligation";
import { enrollmentPending } from "./eventEnrollmentState";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { privateStudent, publicStudent } from "./access";
import { calculateStudentFinance } from "./financeSummaries";
import { permissionAccepted } from "./permissionCoverage";
import { feeMaintenanceProjection } from "./seasonFinance";
import { firstStatus } from "../firstRegistration";
export { permissionAccepted } from "./permissionCoverage";

type Ctx = QueryCtx | MutationCtx;

export async function financeFor(ctx: Ctx, studentId: Id<"students">) {
  const account = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique();
  const student = await ctx.db.get(studentId);
  const maintenance = student ? await feeMaintenanceProjection(ctx, student.seasonId) : null;
  if (account?.state !== "ready" || account.allocationSourceVersion !== 1) return { state: account?.state === "failed" ? "failed" as const : "updating" as const, summary: null, maintenance };
  return { state: "ready" as const, summary: await calculateStudentFinance(ctx, studentId), maintenance };
}
/** Rows a caller already read for this event and student. Each one supplied skips the matching read; undefined means "read it here". */
export type ReadinessPreload = {
  participant?: Doc<"participants"> | null;
  financialAccount?: Doc<"financialAccounts"> | null;
  maintenance?: Awaited<ReturnType<typeof feeMaintenanceProjection>>;
  firstRegistrationState?: Awaited<ReturnType<typeof firstStatus>>;
  /** Must be read with take(101) so the over-100 review check still works. */
  completions?: Doc<"requirementCompletions">[];
  /** Must be read with take(101) so the over-100 review check still works. */
  requirements?: Doc<"requirements">[];
  room?: RoomSelectionState;
};
export type RoomSelectionState = { membership: Doc<"roomMemberships"> | null; request: Doc<"roomRequests"> | null; group: Doc<"roomGroups"> | null; members: Doc<"roomMemberships">[] };

export async function roomSelectionState(ctx: Ctx, eventId: Id<"events">, studentId: Id<"students">): Promise<RoomSelectionState> {
  const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (!membership) return { membership: null, request, group: null, members: [] };
  const group = await ctx.db.get(membership.groupId);
  const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", membership.groupId)).take(6);
  return { membership, request, group, members };
}
/** A room choice is done once the Student asked to be assigned, is in a final group, or shares a group. */
export function roomSelectionComplete(room: RoomSelectionState) {
  return !!room.request || !!room.membership && (!!room.group?.finalized || room.members.length > 1);
}

export async function studentReadiness(ctx: Ctx, event: Doc<"events">, student: Doc<"students">, known: ReadinessPreload = {}) {
  const open: string[] = [];
  const firstRegistrationState = event.type === "Competition" ? known.firstRegistrationState ?? await firstStatus(ctx, student._id) : null;
  const participant = known.participant !== undefined ? known.participant : await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
  if (event.cancelled) return { state: "open" as const, open: ["This event is canceled."], participation: participant?.status ?? null, permissionStatus: "unknown" as const, firstRegistrationState };
  if (enrollmentPending(event)) return { state: "open" as const, open: ["Whole Team enrollment is not complete."], participation: participant?.status ?? null, permissionStatus: "unknown" as const, firstRegistrationState };
  if (participant?.status !== "confirmed") return { state: "notApplicable" as const, open, participation: participant?.status ?? null, permissionStatus: "notApplicable" as const, firstRegistrationState };
  const financialAccount = known.financialAccount !== undefined ? known.financialAccount : await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
  const maintenance = known.maintenance !== undefined ? known.maintenance : await feeMaintenanceProjection(ctx, event.seasonId);
  if (maintenance && maintenance.state !== "ready") open.push("Season fee maintenance is not complete");
  if (financialAccount?.state !== "ready" || financialAccount.allocationSourceVersion !== 1) open.push("Financial records require review or are updating");
  const eventCharges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
  if (eventCharges.length > 100) open.push("Event financial records require review");
  if (eventCharges.some(x => x.appliedCents < effectiveChargeCents(x))) open.push("Required payment");
  const permissionStatus = !event.permissionRequired ? "notRequired" as const : await permissionAccepted(ctx, student._id, event._id) ? "accepted" as const : "missing" as const;
  if (permissionStatus === "missing") open.push("Permission accepted");
  const completions = known.completions ?? await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
  if (event.type === "Competition") { if (firstRegistrationState !== "verified") open.push("FIRST registration and Consent & Release"); }
  else if (event.firstRequired && !completions.some(x => x.key === "first")) open.push("FIRST registration");
  const custom = known.requirements ?? await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
  if (completions.length > 100 || custom.length > 100) open.push("Event requirements require review");
  for (const requirement of custom) if (!completions.some(x => x.key === requirement.key)) open.push(requirement.label);
  if (event.overnight && event.roomingEnabled && !roomSelectionComplete(known.room ?? await roomSelectionState(ctx, event._id, student._id))) open.push("Room selection");
  return { state: open.length ? "open" as const : "ready" as const, open, participation: participant.status, permissionStatus, firstRegistrationState };
}

export async function attendanceFor(ctx: Ctx, student: Doc<"students">, seasonMeetings?: Doc<"attendanceMeetings">[]) {
  const meetings = seasonMeetings ?? await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", student.seasonId)).take(500);
  const records = await ctx.db.query("attendanceRecords").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(500);
  const present = new Set(records.filter(x => x.present).map(x => x.meetingId));
  const held = meetings.filter(x => !x.cancelled);
  const tuesdayHeld = held.filter(x => x.kind === "Tuesday").length;
  const tuesdayAttended = held.filter(x => x.kind === "Tuesday" && present.has(x._id)).length;
  return { tuesdayHeld, tuesdayAttended, tuesdayPercent: tuesdayHeld ? Math.round(100 * tuesdayAttended / tuesdayHeld) : null, thursdayAttended: held.filter(x => x.kind === "Thursday" && present.has(x._id)).length, outreachAttended: held.filter(x => x.kind === "Outreach" && present.has(x._id)).length };
}

export { publicStudent, privateStudent };
