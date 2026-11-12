import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import type { SheetLoader } from "../lib/sheetKinds";
import type { Data, TravelStudent } from "../sheetKinds/eventTravelEmergency";
import { adultRoleFor, healthAdultValidator, healthStudentFor, healthStudentValidator, permissionStatusText, type HealthAdult } from "../lib/healthRows";
import { coverageFor, permissionAccepted } from "../lib/permissionCoverage";
import { eventLocation } from "../lib/transportation";

/** Reads for one event's Travel emergency file (Health folder): confirmed participants and accepted Mentors only. */
const PAGE = 20;
const pageEnd = { isDone: v.boolean(), cursor: v.union(v.string(), v.null()) };
const cursorArg = v.union(v.string(), v.null());

export const eventHeader = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.union(v.null(), v.object({ name: v.string(), startsAt: v.number(), endsAt: v.number(), place: v.string() })),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    return event ? { name: event.name, startsAt: event.startsAt, endsAt: event.endsAt, place: eventLocation(event) } : null;
  },
});

/** Confirmed participants of the event (active students of the event's season), with health details and permission form status. */
export const studentPage = internalQuery({
  args: { eventId: v.id("events"), cursor: cursorArg },
  returns: v.object({ rows: v.array(v.object({ ...healthStudentValidator.fields, permissionForm: v.string() })), ...pageEnd }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const page = await ctx.db.query("participants").withIndex("by_eventId_and_status", q => q.eq("eventId", event._id).eq("status", "confirmed")).paginate({ numItems: PAGE, cursor: args.cursor });
    const rows: Array<ReturnType<typeof healthStudentFor> & { permissionForm: string }> = [];
    for (const participant of page.page) {
      const student = await ctx.db.get(participant.studentId);
      if (!student?.active || student.seasonId !== event.seasonId) continue;
      const draft = await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
      const row = await coverageFor(ctx, student._id, event._id);
      const accepted = event.permissionRequired && row ? await permissionAccepted(ctx, student._id, event._id) : false;
      rows.push({ ...healthStudentFor(student, draft?.grade ?? null), permissionForm: permissionStatusText(row, accepted, event.permissionRequired) });
    }
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

/** Mentors who accepted the invitation to this event: emergency contact only. */
export const mentorPage = internalQuery({
  args: { eventId: v.id("events"), cursor: cursorArg },
  returns: v.object({ rows: v.array(healthAdultValidator), ...pageEnd }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).paginate({ numItems: 40, cursor: args.cursor });
    const rows: HealthAdult[] = [];
    for (const invite of page.page) {
      if (invite.status !== "accepted") continue;
      const user = await ctx.db.get(invite.mentorUserId);
      if (!user?.active) continue;
      rows.push({ name: user.name, role: adultRoleFor(user), emergencyName: user.emergencyName ?? null, emergencyRelationship: user.emergencyRelationship ?? null, emergencyPhone: user.emergencyPhone ?? null });
    }
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

export const load: SheetLoader<Data> = async (ctx, args) => {
  const eventId = args.eventId;
  if (!eventId) throw new Error("A Travel emergency file needs its event");
  const event = await ctx.runQuery(internal.sheetData.eventTravelEmergency.eventHeader, { eventId });
  if (!event) throw new Error("Event not found");
  const students: TravelStudent[] = [];
  let cursor: string | null = null;
  for (let page = 0; ; page++) {
    if (page >= 100) throw new Error("Too many participants to read");
    const result: { rows: TravelStudent[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.eventTravelEmergency.studentPage, { eventId, cursor });
    students.push(...result.rows);
    if (result.isDone) break;
    cursor = result.cursor;
  }
  const adults: HealthAdult[] = [];
  let mentorCursor: string | null = null;
  for (let page = 0; ; page++) {
    if (page >= 100) throw new Error("Too many Mentors to read");
    const result: { rows: HealthAdult[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.eventTravelEmergency.mentorPage, { eventId, cursor: mentorCursor });
    adults.push(...result.rows);
    if (result.isDone) break;
    mentorCursor = result.cursor;
  }
  return { event, students, adults };
};
