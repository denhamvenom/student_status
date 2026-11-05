import { ConvexError, v, type Infer } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ownStudent, requireRole, studentAccess, viewer, type AppUser } from "./lib/access";
import { resolveAudience } from "./lib/eventAudienceRules";
import { eventVisibleFor, onEventFor, parentLinkedStudentsOrNull } from "./lib/eventVisibility";
import { buildDayFromTitle, correctedIntervals, outreachForSession, outreachFromTitle, requiredForSession, requiredFromSchedule } from "./lib/attendanceReports";
import { kickoffBoundaryForCompetitionYear } from "./lib/seasonCalendar";
import { chicagoDayBounds, classifiedTime } from "./lib/timeclock";
import { teamReportAttendanceGate } from "./lib/teamReportAttendance";
import { eventKind, eventStatus, intervalMinutes, nextMonth, validMonth, type ReportInterval } from "./lib/attendanceReportView";

/** One month never holds more Timeclock sessions or calendar events than this; more is refused rather than cut short. */
const MAX_SESSIONS = 150;
const MAX_OCCURRENCES = 250;
const MAX_INTERVALS = 50;

const statusValidator = v.union(v.literal("neutral"), v.literal("missed"), v.literal("late"), v.literal("early"), v.literal("present"));
const neutralReasonValidator = v.union(v.literal("notStarted"), v.literal("inProgress"), v.literal("cancelled"), v.literal("underReview"), v.literal("optional"), v.null());
const kindValidator = v.union(v.literal("required"), v.literal("build"), v.literal("outreach"), v.literal("other"));

const eventValidator = v.object({
  key: v.string(),
  title: v.string(),
  scheduledStart: v.number(),
  scheduledEnd: v.number(),
  kind: kindValidator,
  required: v.boolean(),
  build: v.boolean(),
  outreach: v.boolean(),
  sessionState: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled"), v.null()),
  status: statusValidator,
  late: v.boolean(),
  early: v.boolean(),
  neutralReason: neutralReasonValidator,
  /** Clock-in/out pairs after Coach corrections. Empty while the session is still open. */
  intervals: v.array(v.object({ inAt: v.number(), outAt: v.number() })),
  minutes: v.number(),
  /** A Coach added, changed or removed a clock time. Correction reasons are staff notes and are not sent to families. */
  adjustedByCoach: v.boolean(),
  /** Counts as an attended Required meeting on Home (at least one hour inside the scheduled time). */
  countsAsAttended: v.boolean(),
});

const monthValidator = v.object({
  year: v.number(),
  month: v.number(),
  /** Chicago midnight starting the month and the next month. */
  startsAt: v.number(),
  endsAt: v.number(),
  seasonStartsAt: v.number(),
  /** Season attendance totals are still being rebuilt; Home withholds its counts meanwhile. */
  reportsUpdating: v.boolean(),
  summary: v.object({
    requiredAttended: v.number(),
    requiredHeld: v.number(),
    /** Build minutes from kickoff onward, as Home counts them; null while kickoff is unknown. */
    buildMinutes: v.union(v.number(), v.null()),
    late: v.number(),
    early: v.number(),
  }),
  events: v.array(eventValidator),
});

export type AttendanceMonth = Infer<typeof monthValidator>;
type ReportEvent = Infer<typeof eventValidator>;

/** Chicago midnight at the start of a calendar month (noon UTC on the 1st is always the 1st in Chicago). */
export function chicagoMonthStart(year: number, month: number) {
  return chicagoDayBounds(Date.UTC(year, month - 1, 1, 12)).start;
}

/**
 * "My attendance" for one Chicago calendar month: every timed Timeclock session and calendar event in the
 * Student's season, with clock times after Coach corrections and a status per event, plus month totals.
 * Students see only themselves; Parents only actively linked Students; Coaches any active Student, as on Home.
 */
export const month = query({
  args: { studentId: v.optional(v.id("students")), year: v.number(), month: v.number() },
  returns: monthValidator,
  handler: async (ctx, args): Promise<AttendanceMonth> => {
    const user = await viewer(ctx);
    requireRole(user, "student", "parent", "coach");
    if (!validMonth(args.year, args.month)) throw new ConvexError("That month is not available. Reload the page and try again.");
    const studentId: Id<"students"> | null = args.studentId ?? (user.role === "student" ? (await ownStudent(ctx, user))._id : null);
    if (!studentId) throw new ConvexError("Choose a student to see their attendance.");
    const student = await studentAccess(ctx, user, studentId);
    const season = await ctx.db.get(student.seasonId);
    if (!season) throw new ConvexError("This student's season could not be found. Reload the page, or contact a Coach if it keeps happening.");

    const startsAt = chicagoMonthStart(args.year, args.month);
    const following = nextMonth(args.year, args.month);
    const endsAt = chicagoMonthStart(following.year, following.month);
    const kickoff = kickoffBoundaryForCompetitionYear(season.year);
    const kickoffAt = kickoff.state === "verified" ? kickoff.kickoffAt : null;
    const gate = await teamReportAttendanceGate(ctx, season._id, season.year);

    const sessions = await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_scheduledStart", q => q.eq("seasonId", season._id).gte("scheduledStart", startsAt).lt("scheduledStart", endsAt)).take(MAX_SESSIONS + 1);
    const occurrences = await ctx.db.query("timeclockOccurrences").withIndex("by_seasonId_and_scheduledStart", q => q.eq("seasonId", season._id).gte("scheduledStart", startsAt).lt("scheduledStart", endsAt)).take(MAX_OCCURRENCES + 1);
    if (sessions.length > MAX_SESSIONS || occurrences.length > MAX_OCCURRENCES) throw new ConvexError("This month has too many events to show at once. Contact a Coach to review this attendance.");

    const events: ReportEvent[] = [];
    const sessionOccurrences = new Set<Id<"timeclockOccurrences">>();
    for (const session of sessions) {
      sessionOccurrences.add(session.occurrenceId);
      events.push(await sessionEvent(ctx, session, student._id));
    }
    // Calendar events with no session yet: upcoming, or never opened at the Timeclock. Always gray, and listed only when
    // the Student (or Parent) can already see the linked team event elsewhere; staff-only calendar items stay hidden.
    const unheld = occurrences.filter(occurrence => !occurrence.cancelled && !occurrence.allDay && !sessionOccurrences.has(occurrence._id) && occurrence.scheduledStart !== undefined && occurrence.scheduledEnd !== undefined);
    const canSee = unheld.length ? await familyEventVisibility(ctx, user, student) : null;
    for (const occurrence of unheld) {
      if (occurrence.scheduledStart === undefined || occurrence.scheduledEnd === undefined || !canSee || !await canSee(occurrence)) continue;
      const outreach = outreachFromTitle(occurrence.title);
      const build = buildDayFromTitle(occurrence.title, occurrence.scheduledStart) !== null;
      const required = requiredFromSchedule(occurrence.scheduledStart, outreach, kickoffAt);
      const result = eventStatus({ sessionState: null, needsReview: false, required, scheduledStart: occurrence.scheduledStart, scheduledEnd: occurrence.scheduledEnd, intervals: [] });
      events.push({ key: occurrence._id, title: occurrence.title, scheduledStart: occurrence.scheduledStart, scheduledEnd: occurrence.scheduledEnd, kind: eventKind({ required, outreach, build }), required, build, outreach, sessionState: null, ...result, intervals: [], minutes: 0, adjustedByCoach: false, countsAsAttended: false });
    }
    events.sort((a, b) => a.scheduledStart - b.scheduledStart || a.key.localeCompare(b.key));

    const held = events.filter(event => event.sessionState === "closed" && event.neutralReason !== "underReview");
    const required = held.filter(event => event.required);
    return {
      year: args.year,
      month: args.month,
      startsAt,
      endsAt,
      seasonStartsAt: season.startsAt,
      reportsUpdating: gate.state === "updating" || gate.state === "failed",
      summary: {
        requiredAttended: required.filter(event => event.countsAsAttended).length,
        requiredHeld: required.length,
        buildMinutes: kickoffAt === null ? null : held.filter(event => event.build && event.scheduledStart >= kickoffAt).reduce((sum, event) => sum + event.minutes, 0),
        late: held.filter(event => event.late).length,
        early: held.filter(event => event.early).length,
      },
      events,
    };
  },
});

/**
 * Whether an unheld calendar occurrence may be listed for this Student. It must be claimed by a team event (events table)
 * that the event list would show, using the same rule as studentOrParentCanSeeEvent: legacy events are visible, Mentors-only
 * events never are, otherwise the Student must be in the audience or on the event. A Parent whose season Family links can't
 * load sees only events the Student is actually on (fail closed). Coaches see what the Student would see.
 * Family links are read once here: Convex allows a single paginated read per query.
 */
async function familyEventVisibility(ctx: QueryCtx, user: AppUser, student: Doc<"students">) {
  const parentLinksReady = user.role === "parent" ? await parentLinkedStudentsOrNull(ctx) !== null : true;
  return async (occurrence: Doc<"timeclockOccurrences">) => {
    if (occurrence.source !== "calendar") return false;
    const claim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", occurrence.sourceKey)).unique();
    const event = claim ? await ctx.db.get(claim.eventId) : null;
    if (!event || event.seasonId !== student.seasonId || event.cancelled) return false;
    const audience = resolveAudience(event);
    if (audience.legacy) return true;
    if (audience.kind === "mentorsOnly") return false;
    return parentLinksReady ? await eventVisibleFor(ctx, event, [student], true) : await onEventFor(ctx, event, [student], false);
  };
}

async function sessionEvent(ctx: QueryCtx, session: Doc<"timeclockSessions">, studentId: Id<"students">): Promise<ReportEvent> {
  const occurrence = await ctx.db.get(session.occurrenceId);
  const title = occurrence?.title ?? "";
  const outreach = outreachForSession(session, title);
  const build = buildDayFromTitle(title, session.scheduledStart) !== null;
  const required = await requiredForSession(ctx, session, outreach);
  const [originals, corrections] = await Promise.all([
    ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", studentId)).take(MAX_INTERVALS + 1),
    ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", studentId)).take(MAX_INTERVALS + 1),
  ]);
  if (originals.length > MAX_INTERVALS || corrections.length > MAX_INTERVALS) throw new ConvexError("One event has too many clock times to show. Contact a Coach to review this attendance.");
  // An open session is still running; its times appear once it closes, the same moment Home counts it.
  // Clock times a Coach must fix (overlapping or incomplete corrections) gray out this one event instead of failing the month.
  let intervals: ReportInterval[] = [];
  let qualifies = false;
  let unreadable = false;
  if (session.state === "closed") {
    try {
      intervals = correctedIntervals(session, originals, corrections, Number.MAX_SAFE_INTEGER).sort((a, b) => a.inAt - b.inAt);
      qualifies = intervals.length > 0 && classifiedTime(intervals, session.scheduledStart, session.scheduledEnd, session.effectiveEnd).qualifies;
    } catch {
      intervals = [];
      unreadable = true;
    }
  }
  const needsReview = session.needsReview || unreadable;
  const result = eventStatus({ sessionState: session.state, needsReview, required, scheduledStart: session.scheduledStart, scheduledEnd: session.scheduledEnd, intervals });
  return {
    key: session._id,
    title,
    scheduledStart: session.scheduledStart,
    scheduledEnd: session.scheduledEnd,
    kind: eventKind({ required, outreach, build }),
    required,
    build,
    outreach,
    sessionState: session.state,
    ...result,
    intervals,
    minutes: intervalMinutes(intervals),
    adjustedByCoach: session.state === "closed" && !unreadable && corrections.length > 0,
    countsAsAttended: required && session.state === "closed" && !needsReview && qualifies,
  };
}
