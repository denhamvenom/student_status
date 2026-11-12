import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { effectiveIntervals } from "../lib/effectiveIntervals";
import { activeShifts, answerValue } from "../lib/eventSignupExtras";
import { studentReadiness } from "../lib/readModels";
import { feeMaintenanceProjection } from "../lib/seasonFinance";
import { MONEY_ITEMS } from "../lib/sheetRows";
import type { SheetLoader } from "../lib/sheetKinds";
import { teamTransportEnabled } from "../lib/transportation";
import type { Data, EventAttendancePerson, EventParticipantRow, EventRoomRow, EventShiftRow } from "../sheetKinds/event";
import { subteamDisplay } from "../../src/lib/subteams";
import { transportSummary } from "../travel";

/**
 * Everything one event's spreadsheet shows, read through bounded internal queries: the event itself, signups (a page at a time, with
 * readiness and answers), Mentors, rooms, rides, shifts and, when the event is linked to a Timeclock session through Team Calendar, clock-ins.
 * No money or health data is read here (money-flavored readiness items are dropped in `participantPage`).
 */
const PAGE = 20;
const MAX_PAGES = 100;
const cursorArg = v.union(v.string(), v.null());
const nullableString = v.union(v.string(), v.null());
const personName = (student: Doc<"students">) => student.legalName || student.preferredName;


const participantRow = v.object({
  studentId: v.id("students"), name: v.string(), subteam: v.string(), status: v.string(), independentTravel: v.boolean(),
  ready: v.union(v.boolean(), v.null()), missing: v.array(v.string()), answers: v.array(v.object({ questionId: v.string(), value: answerValue })),
});

export const core = internalQuery({
  args: { eventId: v.id("events"), seasonId: v.id("seasons") },
  returns: v.object({
    name: v.string(), type: v.string(), startsAt: v.number(), endsAt: v.number(), destination: v.string(), capacity: v.union(v.number(), v.null()),
    overnight: v.boolean(), roomingEnabled: v.boolean(), shiftsEnabled: v.boolean(), permissionRequired: v.boolean(),
    questions: v.array(v.object({ id: v.string(), prompt: v.string(), archived: v.boolean() })),
    shiftIds: v.array(v.id("eventShifts")),
    sessions: v.array(v.object({ id: v.id("timeclockSessions"), state: v.union(v.literal("open"), v.literal("closed")) })),
    transport: v.object({ enabled: v.boolean(), state: v.string(), seats: v.number(), demand: v.number(), busSeats: v.number(), open: v.array(v.string()), vehicles: v.array(v.object({ driver: v.string(), vehicle: v.string(), seats: v.number() })) }),
  }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== args.seasonId) throw new ConvexError("This event is not in the season.");
    const questions = await ctx.db.query("eventQuestions").withIndex("by_eventId_and_order", q => q.eq("eventId", event._id)).take(101);
    if (questions.length > 100) throw new ConvexError("This event has too many questions to show here.");
    const shifts = event.shiftsEnabled ? await activeShifts(ctx, event._id) : [];
    let sessions: { id: Id<"timeclockSessions">; state: "open" | "closed" }[] = [];
    if (event.calendarEventId) {
      const occurrence = await ctx.db.query("timeclockOccurrences").withIndex("by_source_and_sourceKey", q => q.eq("source", "calendar").eq("sourceKey", event.calendarEventId!)).unique();
      const found = occurrence ? await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).take(20) : [];
      // Every session that was not canceled counts, so a multi-day event with several sessions shows all of its clock-ins.
      sessions = found.filter((s): s is typeof s & { state: "open" | "closed" } => s.state !== "cancelled").sort((a, b) => a.openedAt - b.openedAt).map(s => ({ id: s._id, state: s.state }));
    }
    const enabled = teamTransportEnabled(event);
    const summary = await transportSummary(ctx, event);
    const vehicles: { driver: string; vehicle: string; seats: number }[] = [];
    if (enabled) {
      const assignments = await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(201);
      if (assignments.length > 200) throw new ConvexError("This event has too many vehicles to show here.");
      for (const assignment of assignments) {
        const driver = await ctx.db.get(assignment.driverId);
        if (driver) vehicles.push({ driver: driver.name, vehicle: driver.vehicleName ?? "", seats: Math.min(assignment.seats, driver.seats) });
      }
    }
    return {
      name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, destination: event.destination, capacity: event.capacity ?? null,
      overnight: event.overnight, roomingEnabled: event.roomingEnabled, shiftsEnabled: event.shiftsEnabled === true, permissionRequired: event.permissionRequired,
      questions: questions.map(q => ({ id: q._id as string, prompt: q.prompt, archived: q.archived === true })),
      shiftIds: shifts.map(s => s._id), sessions,
      transport: { enabled, state: summary.state, seats: summary.seats, demand: summary.demand, busSeats: summary.busSeats, open: summary.open, vehicles },
    };
  },
});

/** One page of signups with readiness (fee items removed) and answers. */
export const participantPage = internalQuery({
  args: { eventId: v.id("events"), cursor: cursorArg },
  returns: v.object({ rows: v.array(participantRow), isDone: v.boolean(), cursor: nullableString }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError("Event not found.");
    const page = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).paginate({ numItems: PAGE, cursor: args.cursor });
    const needsReadiness = page.page.some(p => p.status === "confirmed");
    const maintenance = needsReadiness ? await feeMaintenanceProjection(ctx, event.seasonId) : undefined;
    const requirements = needsReadiness ? await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101) : undefined;
    const rows: (EventParticipantRow & { studentId: Id<"students"> })[] = [];
    for (const participant of page.page) {
      const student = await ctx.db.get(participant.studentId);
      if (!student || !student.active || student.seasonId !== event.seasonId) continue;
      let ready: boolean | null = null;
      let missing: string[] = [];
      if (participant.status === "confirmed") {
        const result = await studentReadiness(ctx, event, student, { participant, maintenance, requirements });
        missing = result.open.filter(item => !MONEY_ITEMS.has(item));
        ready = missing.length === 0;
      } else if (participant.status === "pending" || participant.status === "waitlist") {
        missing = ["Signup not confirmed yet"];
      }
      const answers = await ctx.db.query("eventQuestionAnswers").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
      rows.push({ studentId: student._id, name: personName(student), subteam: subteamDisplay(student.subteam), status: participant.status, independentTravel: participant.independentTravel === true, ready, missing, answers: answers.map(a => ({ questionId: a.questionId as string, value: a.value })) });
    }
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

export const mentorPage = internalQuery({
  args: { eventId: v.id("events"), cursor: cursorArg },
  returns: v.object({ rows: v.array(v.object({ name: v.string(), response: v.string(), canDrive: v.union(v.boolean(), v.null()), needsHotel: v.union(v.boolean(), v.null()) })), isDone: v.boolean(), cursor: nullableString }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).paginate({ numItems: PAGE * 2, cursor: args.cursor });
    const rows = [];
    for (const invite of page.page) {
      const user = await ctx.db.get(invite.mentorUserId);
      if (!user) continue;
      rows.push({ name: user.name, response: invite.status, canDrive: invite.canDriveStudents ?? null, needsHotel: invite.needsHotelRoom ?? null });
    }
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

/** Room places (kind "members") and open requests to be assigned (kind "requests"), one page at a time. */
export const roomPage = internalQuery({
  args: { eventId: v.id("events"), kind: v.union(v.literal("members"), v.literal("requests")), cursor: cursorArg },
  returns: v.object({ rows: v.array(v.object({ student: v.string(), room: v.string(), category: v.string(), finalized: v.boolean(), needsReview: v.boolean(), requested: v.boolean() })), isDone: v.boolean(), cursor: nullableString }),
  handler: async (ctx, args) => {
    const page = args.kind === "members"
      ? await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId)).paginate({ numItems: PAGE * 2, cursor: args.cursor })
      : await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId)).paginate({ numItems: PAGE * 2, cursor: args.cursor });
    const rows: EventRoomRow[] = [];
    const groups = new Map<string, Doc<"roomGroups"> | null>();
    for (const row of page.page) {
      const student = await ctx.db.get(row.studentId);
      if (!student || !student.active) continue;
      if ("groupId" in row) {
        if (!groups.has(row.groupId)) groups.set(row.groupId, await ctx.db.get(row.groupId));
        const group = groups.get(row.groupId);
        if (!group) continue;
        rows.push({ student: personName(student), room: group.name, category: group.category, finalized: group.finalized, needsReview: group.needsReview, requested: false });
      } else {
        // A request only counts while the student has no room yet.
        const placed = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", row.studentId)).unique();
        if (!placed) rows.push({ student: personName(student), room: "", category: "", finalized: false, needsReview: false, requested: true });
      }
    }
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

export const shiftDetail = internalQuery({
  args: { shiftId: v.id("eventShifts") },
  returns: v.object({ label: v.string(), startsAt: v.number(), endsAt: v.number(), capacity: v.union(v.number(), v.null()), students: v.array(v.object({ studentId: v.id("students"), name: v.string() })) }),
  handler: async (ctx, args) => {
    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new ConvexError("Shift not found.");
    const places = await ctx.db.query("shiftSignups").withIndex("by_shiftId", q => q.eq("shiftId", shift._id)).take(301);
    if (places.length > 300) throw new ConvexError("This shift has too many signups to show here.");
    const students = [];
    for (const place of places) {
      const student = await ctx.db.get(place.studentId);
      if (student) students.push({ studentId: student._id, name: personName(student) });
    }
    return { label: shift.label ?? "", startsAt: shift.startsAt, endsAt: shift.endsAt, capacity: shift.capacity ?? null, students };
  },
});

/** Students who have a clock-in or a correction in the session, one page at a time. */
export const clockedStudentPage = internalQuery({
  args: { sessionId: v.id("timeclockSessions"), kind: v.union(v.literal("intervals"), v.literal("corrections")), cursor: cursorArg },
  returns: v.object({ studentIds: v.array(v.id("students")), isDone: v.boolean(), cursor: nullableString }),
  handler: async (ctx, args) => {
    const page = args.kind === "intervals"
      ? await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", args.sessionId)).paginate({ numItems: 100, cursor: args.cursor })
      : await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", args.sessionId)).paginate({ numItems: 100, cursor: args.cursor });
    return { studentIds: [...new Set(page.page.map(row => row.studentId))], isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

/** Clock times (corrections applied) for a few students of one session. */
export const clockBatch = internalQuery({
  args: { sessionId: v.id("timeclockSessions"), studentIds: v.array(v.id("students")), asOf: v.number() },
  returns: v.array(v.object({ studentId: v.id("students"), name: v.string(), subteam: v.string(), intervals: v.array(v.object({ inAt: v.number(), outAt: v.number() })), corrections: v.number() })),
  handler: async (ctx, args) => {
    if (args.studentIds.length > 10) throw new ConvexError("Too many students in one batch.");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    const out = [];
    for (const studentId of args.studentIds) {
      const student = await ctx.db.get(studentId);
      // Inactive students stay off the Attendance tab, as they stay off the signup list.
      if (!student || !student.active || student.seasonId !== session.seasonId) continue;
      const intervals = await effectiveIntervals(ctx, session, studentId, args.asOf);
      const corrections = await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", studentId)).take(501);
      out.push({ studentId, name: personName(student), subteam: subteamDisplay(student.subteam), intervals, corrections: corrections.length });
    }
    return out;
  },
});

async function allPages<Row>(read: (cursor: string | null) => Promise<{ rows: Row[]; isDone: boolean; cursor: string | null }>): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: { rows: Row[]; isDone: boolean; cursor: string | null } = await read(cursor);
    rows.push(...page.rows);
    if (page.isDone) return rows;
    cursor = page.cursor;
  }
  throw new Error("Too many rows to read");
}

type CoreResult = Omit<Data["event"], never> & { questions: Data["questions"]; shiftIds: Id<"eventShifts">[]; sessions: { id: Id<"timeclockSessions">; state: "open" | "closed" }[]; transport: Data["transport"] };
type ClockRow = { studentId: Id<"students">; name: string; subteam: string; intervals: { inAt: number; outAt: number }[]; corrections: number };

export const load: SheetLoader<Data> = async (ctx, args) => {
  if (!args.eventId) throw new Error("An event spreadsheet needs its event");
  const eventId = args.eventId;
  const core: CoreResult = await ctx.runQuery(internal.sheetData.event.core, { eventId, seasonId: args.seasonId });
  const participants: EventParticipantRow[] = await allPages<EventParticipantRow>(cursor => ctx.runQuery(internal.sheetData.event.participantPage, { eventId, cursor }));
  const mentors: Data["mentors"] = await allPages<Data["mentors"][number]>(cursor => ctx.runQuery(internal.sheetData.event.mentorPage, { eventId, cursor }));

  let rooming: EventRoomRow[] | null = null;
  if (core.overnight && core.roomingEnabled) {
    const members: EventRoomRow[] = await allPages<EventRoomRow>(cursor => ctx.runQuery(internal.sheetData.event.roomPage, { eventId, kind: "members", cursor }));
    const requests: EventRoomRow[] = await allPages<EventRoomRow>(cursor => ctx.runQuery(internal.sheetData.event.roomPage, { eventId, kind: "requests", cursor }));
    rooming = [...members, ...requests];
  }

  let shifts: Data["shifts"] = null;
  if (core.shiftsEnabled) {
    shifts = [];
    for (const shiftId of core.shiftIds) shifts.push(await ctx.runQuery(internal.sheetData.event.shiftDetail, { shiftId }) as EventShiftRow);
  }

  let attendance: Data["attendance"] = null;
  if (core.sessions.length) {
    const times = new Map<string, { name: string; subteam: string; intervals: { inAt: number; outAt: number }[]; corrections: number }>();
    const asOf = Date.now();
    for (const { id: sessionId } of core.sessions) {
      const clocked = new Set<Id<"students">>();
      for (const kind of ["intervals", "corrections"] as const) {
        let cursor: string | null = null;
        for (let i = 0; ; i++) {
          if (i >= MAX_PAGES) throw new Error("Too many clock-ins to read");
          const page: { studentIds: Id<"students">[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.event.clockedStudentPage, { sessionId, kind, cursor });
          for (const id of page.studentIds) clocked.add(id);
          if (page.isDone) break;
          cursor = page.cursor;
        }
      }
      const ids = [...clocked];
      for (let i = 0; i < ids.length; i += 10) {
        const batch: ClockRow[] = await ctx.runQuery(internal.sheetData.event.clockBatch, { sessionId, studentIds: ids.slice(i, i + 10), asOf });
        for (const row of batch) {
          const before = times.get(row.studentId);
          times.set(row.studentId, before ? { ...before, intervals: [...before.intervals, ...row.intervals], corrections: before.corrections + row.corrections } : row);
        }
      }
    }
    const people: EventAttendancePerson[] = [];
    const seen = new Set<string>();
    for (const p of participants) {
      const confirmed = p.status === "confirmed";
      const t = times.get(p.studentId);
      seen.add(p.studentId);
      if (!confirmed && !t) continue;
      people.push({ studentId: p.studentId, name: p.name, subteam: p.subteam, signedUp: p.status !== "withdrawn", confirmed, intervals: t?.intervals ?? [], corrections: t?.corrections ?? 0 });
    }
    for (const [studentId, t] of times) if (!seen.has(studentId)) people.push({ studentId, name: t.name, subteam: t.subteam, signedUp: false, confirmed: false, intervals: t.intervals, corrections: t.corrections });
    attendance = { sessionState: core.sessions.some(session => session.state === "open") ? "open" : "closed", people };
  }

  return {
    event: { name: core.name, type: core.type, startsAt: core.startsAt, endsAt: core.endsAt, destination: core.destination, capacity: core.capacity, overnight: core.overnight, roomingEnabled: core.roomingEnabled, shiftsEnabled: core.shiftsEnabled, permissionRequired: core.permissionRequired },
    questions: core.questions, participants, mentors, rooming, transport: core.transport, shifts, attendance,
  };
};
