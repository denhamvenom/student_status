import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { linkedStudents, type AppUser } from "./access";
import { studentCanAccessEvent } from "./eventAudience";
import { resolveAudience } from "./eventAudienceRules";
import { currentSeasonLinkedStudentsPage } from "./seasonFamilyLinks";

/**
 * Which events a Student or Parent may see (event list, event detail, shifts, signup questions). One rule everywhere:
 *
 * - a legacy event (no audience saved) is visible;
 * - a Mentors-only event is never visible on a direct read;
 * - otherwise the event's audience must include one of the viewer's students, or one of them must be on it;
 * - while a Parent's season-scoped Family links can't load (backfill incomplete or a link needing review) the Parent sees a
 *   targeted event only when a linked student is actually on it (not withdrawn) — never on audience alone.
 */

export const EVENT_UNAVAILABLE = "This event is no longer available. It may have moved to Past events. Reload to see current events.";

/** The student's participation row on one event (point lookup, so no per-student scan cap can hide an event). */
export async function participationOn(ctx: QueryCtx, eventId: Id<"events">, studentId: Id<"students">) {
  return await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).first();
}

/**
 * A Parent's active-season, active linked students read from the per-student family links (bounded). Used only where the
 * season-scoped Family link pages can't load, and only to find events a student is actually on: studentAccess authorizes a
 * Parent with the same links.
 */
export async function parentLinkedStudentsFallback(ctx: QueryCtx, parentUserId: Id<"appUsers">, seasonId: Id<"seasons">) {
  const links = await ctx.db.query("familyLinks").withIndex("by_parentUserId", q => q.eq("parentUserId", parentUserId)).take(100);
  const students: Doc<"students">[] = [];
  for (const link of links) {
    if (!link.active) continue;
    const student = await ctx.db.get(link.studentId);
    if (student && student.active && student.seasonId === seasonId && !students.some(row => row._id === student._id)) students.push(student);
  }
  return students;
}

/** The Parent's season-scoped linked students, or null while Family links can't load (callers then fail closed). */
export async function parentLinkedStudentsOrNull(ctx: QueryCtx): Promise<Doc<"students">[] | null> {
  // One page of 50 linked students (a family never has more; Convex allows one paginated read per query).
  try { return (await currentSeasonLinkedStudentsPage(ctx, { cursor: null, numItems: 50 })).page; } catch { return null; }
}

/**
 * Audience or participation for these students. `anyStatus` counts withdrawn rows too (the event list's long-standing rule).
 */
export async function eventVisibleFor(ctx: QueryCtx, event: Doc<"events">, students: Doc<"students">[], anyStatus: boolean) {
  if (resolveAudience(event).legacy) return true;
  for (const student of students) if (await studentCanAccessEvent(ctx, event, student)) return true;
  return await onEventFor(ctx, event, students, anyStatus);
}

/** Whether one of the students has a participation row on the event (withdrawn rows count only with `anyStatus`). */
export async function onEventFor(ctx: QueryCtx, event: Doc<"events">, students: Doc<"students">[], anyStatus: boolean) {
  for (const student of students) {
    const row = await participationOn(ctx, event._id, student._id);
    if (row && (anyStatus || row.status !== "withdrawn")) return true;
  }
  return false;
}

/**
 * Direct reads of one event by a Student or Parent (detail, shifts, signup questions). `student` is the student the caller
 * already authorized (studentAccess/ownStudent), or null to use all of the viewer's students. Staff are not checked here.
 */
export async function studentOrParentCanSeeEvent(ctx: QueryCtx, user: AppUser, event: Doc<"events">, student: Doc<"students"> | null): Promise<boolean> {
  if (user.role !== "student" && user.role !== "parent") return true;
  const audience = resolveAudience(event);
  if (audience.legacy) return true;
  if (audience.kind === "mentorsOnly") return false;
  if (user.role === "student") return await eventVisibleFor(ctx, event, student ? [student] : await linkedStudents(ctx, user), true);
  const linked = await parentLinkedStudentsOrNull(ctx);
  if (linked) return await eventVisibleFor(ctx, event, student ? [student] : linked, true);
  // Fail closed, exactly like app.listEvents: only an event a linked student is actually on.
  return await onEventFor(ctx, event, student ? [student] : await parentLinkedStudentsFallback(ctx, user._id, event.seasonId), false);
}

export async function requireStudentOrParentCanSeeEvent(ctx: QueryCtx, user: AppUser, event: Doc<"events">, student: Doc<"students"> | null) {
  if (!await studentOrParentCanSeeEvent(ctx, user, event, student)) throw new ConvexError(EVENT_UNAVAILABLE);
}
