import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { parentUserIdsForStudents, studentUserIds } from "./notify";
import { resolveAudience, studentInAudience, studentMatchesSubteams } from "./eventAudienceRules";

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
  const audience = resolveAudience(event);
  if (audience.legacy || audience.kind === "everyone" || audience.kind === "subteams") {
    const students = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", event.seasonId).eq("active", true)).take(MAX_ELIGIBLE);
    return students.filter(student => event.assignmentScope !== "travelTeam" || student.travelTeam)
      .filter(student => audience.legacy || audience.kind === "everyone" || studentMatchesSubteams(student, audience.subteams)).map(student => student._id);
  }
  if (audience.kind === "mentorsOnly") return [];
  const rows = await ctx.db.query("eventAudienceStudents").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_ELIGIBLE);
  const ids: Id<"students">[] = [];
  for (const row of rows) {
    const student = await ctx.db.get(row.studentId);
    if (student && student.active && student.seasonId === event.seasonId) ids.push(student._id);
  }
  return ids;
}

/** Whether the student may sign up for / see this event: the audience rules plus the event's listed students. Legacy events keep their old behavior. */
export async function studentCanAccessEvent(ctx: Ctx, event: Doc<"events">, student: Doc<"students">): Promise<boolean> {
  const audience = resolveAudience(event);
  if (audience.legacy) return true;
  const listed = audience.kind === "students" && !!await ctx.db.query("eventAudienceStudents").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
  return studentInAudience(event, student, listed);
}

/** Mentors invited to the event who have not declined (invited or accepted). */
export async function eventMentorUserIds(ctx: Ctx, eventId: Id<"events">): Promise<Id<"appUsers">[]> {
  const rows = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(MAX_PARTICIPANTS);
  return [...new Set(rows.filter(row => row.status !== "declined").map(row => row.mentorUserId))];
}

export async function eventParticipantStudentIds(ctx: Ctx, eventId: Id<"events">, options: { confirmedOnly?: boolean } = {}): Promise<Id<"students">[]> {
  const rows = options.confirmedOnly
    ? await ctx.db.query("participants").withIndex("by_eventId_and_status", q => q.eq("eventId", eventId).eq("status", "confirmed")).take(MAX_PARTICIPANTS)
    : (await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(MAX_PARTICIPANTS)).filter(row => row.status !== "withdrawn");
  return [...new Set(rows.map(row => row.studentId))];
}

export async function eventAudienceUserIds(ctx: Ctx, eventId: Id<"events">, options: { confirmedOnly?: boolean; includeMentors?: boolean } = {}): Promise<Id<"appUsers">[]> {
  const studentIds = await eventParticipantStudentIds(ctx, eventId, options);
  // Mentors are only ever there by invitation (invited or accepted); an audience never pulls them in.
  const mentors = options.includeMentors === false ? [] : await eventMentorUserIds(ctx, eventId);
  return [...new Set([...await studentUserIds(ctx, studentIds), ...await parentUserIdsForStudents(ctx, studentIds), ...mentors])];
}

/**
 * Student and Parent event lists: an event shows when it is a legacy event (no audience saved), a listed student is already
 * on it, or its audience includes one of the students. Staff lists don't use this. `onEvent` holds the events a student has a row on.
 */
export async function eventVisibleToStudents(ctx: Ctx, event: Doc<"events">, students: Doc<"students">[], onEvent: Set<Id<"events">>): Promise<boolean> {
  if (onEvent.has(event._id) || resolveAudience(event).legacy) return true;
  for (const student of students) if (await studentCanAccessEvent(ctx, event, student)) return true;
  return false;
}
