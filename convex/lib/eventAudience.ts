import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { parentUserIdsForStudents, studentUserIds } from "./notify";

/**
 * Who an event is for. This is the stable contract notification triggers and reminders build on:
 *
 * - `eventEligibleStudentIds(ctx, event)`: students who may take part (today: active students on the event's season roster;
 *   Travel Team events only Travel Team students).
 * - `eventParticipantStudentIds(ctx, eventId, { confirmedOnly })`: students on the event (every non-withdrawn signup,
 *   or only confirmed ones).
 * - `eventAudienceUserIds(ctx, eventId, { confirmedOnly })`: those participants' student accounts plus their linked Parents, deduplicated.
 *
 * The recurring-meetings / subteam sprint will extend these (subteam-scoped eligibility, invited staff in the audience).
 * Keep the signatures stable; add optional fields instead of changing positional arguments.
 */
type Ctx = QueryCtx | MutationCtx;

const MAX_ELIGIBLE = 1000;
const MAX_PARTICIPANTS = 1000;

export async function eventEligibleStudentIds(ctx: Ctx, event: Doc<"events">): Promise<Id<"students">[]> {
  const students = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", event.seasonId).eq("active", true)).take(MAX_ELIGIBLE);
  return students.filter(student => event.assignmentScope !== "travelTeam" || student.travelTeam).map(student => student._id);
}

export async function eventParticipantStudentIds(ctx: Ctx, eventId: Id<"events">, options: { confirmedOnly?: boolean } = {}): Promise<Id<"students">[]> {
  const rows = options.confirmedOnly
    ? await ctx.db.query("participants").withIndex("by_eventId_and_status", q => q.eq("eventId", eventId).eq("status", "confirmed")).take(MAX_PARTICIPANTS)
    : (await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(MAX_PARTICIPANTS)).filter(row => row.status !== "withdrawn");
  return [...new Set(rows.map(row => row.studentId))];
}

export async function eventAudienceUserIds(ctx: Ctx, eventId: Id<"events">, options: { confirmedOnly?: boolean } = {}): Promise<Id<"appUsers">[]> {
  const studentIds = await eventParticipantStudentIds(ctx, eventId, options);
  return [...new Set([...await studentUserIds(ctx, studentIds), ...await parentUserIdsForStudents(ctx, studentIds)])];
}
