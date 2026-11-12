import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { attendanceNamespace, reportAggregate, studentAttendanceNamespace, studentBuildMinutesNamespace } from "../lib/reportAggregates";
import { kickoffBoundaryForCompetitionYear } from "../lib/seasonCalendar";
import { weekStartKey } from "../lib/sheetAttendance";
import type { SheetLoader } from "../lib/sheetKinds";
import { teamReportAttendanceGate } from "../lib/teamReportAttendance";
import type { Data } from "../sheetKinds/attendance";

/** What the Reports card should say when the file keeps its last numbers. */
export const ATTENDANCE_NOT_READY = "Attendance is updating, so its spreadsheet kept the last numbers. Try again in a few minutes.";

/** A few students per page: each reads up to 1,000 summaries plus their session states. */
const STUDENTS_PER_PAGE = 4;
const SUMMARIES_PER_STUDENT = 1000;
const heldValidator = v.object({ required: v.number(), other: v.number(), outreach: v.number() });

/** Whether the season's attendance reports are ready (same gate as the app), and the meetings held in each group. */
export const gate = internalQuery({
  args: { seasonId: v.id("seasons") },
  returns: v.object({ ready: v.boolean(), held: heldValidator }),
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new ConvexError("This season no longer exists.");
    const state = (await teamReportAttendanceGate(ctx, season._id, season.year)).state;
    const held = async (category: "Required" | "Other" | "Outreach") => await reportAggregate.count(ctx, { namespace: attendanceNamespace(season._id, "held", category) });
    // Same rule as the app's breakdown: only updating or failed reports withhold counts.
    return { ready: state !== "updating" && state !== "failed", held: { required: await held("Required"), other: await held("Other"), outreach: await held("Outreach") } };
  },
});

/** Active students with their attended counts and clocked time, one small page at a time. */
export const studentPage = internalQuery({
  args: { seasonId: v.id("seasons"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    rows: v.array(v.object({ name: v.string(), subteam: v.string(), required: v.number(), other: v.number(), outreach: v.number(), buildMinutes: v.number(), totalMs: v.number(), weeks: v.array(v.object({ week: v.string(), ms: v.number() })) })),
    isDone: v.boolean(), cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new ConvexError("This season no longer exists.");
    // Build hours are the app's: whole minutes at Build-day sessions from kickoff on (zero while kickoff is not verified).
    const kickoff = kickoffBoundaryForCompetitionYear(season.year);
    const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", args.seasonId).eq("active", true)).paginate({ numItems: STUDENTS_PER_PAGE, cursor: args.cursor });
    const rows = await Promise.all(page.page.map(async student => {
      const attended = async (category: "Required" | "Other" | "Outreach") => await reportAggregate.count(ctx, { namespace: studentAttendanceNamespace(args.seasonId, student._id, category) });
      const summaries = await ctx.db.query("timeclockAttendanceSummaries").withIndex("by_studentId_and_scheduledStart", q => q.eq("studentId", student._id)).take(SUMMARIES_PER_STUDENT + 1);
      if (summaries.length > SUMMARIES_PER_STUDENT) throw new Error("Too many attendance records for one student");
      const weeks = new Map<string, number>();
      let totalMs = 0;
      for (const row of summaries) {
        if (row.seasonId !== args.seasonId || row.sessionState !== "closed" || row.needsReview || !(row.totalMs > 0)) continue;
        // Only current summaries of held sessions count, as in the app's meeting list.
        const report = await ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", row.sessionId)).unique();
        if (!report || report.state !== "ready" || report.sessionState !== "closed" || report.needsReview || report.reportGeneration !== row.reportGeneration) continue;
        totalMs += row.totalMs;
        const week = weekStartKey(row.scheduledStart);
        weeks.set(week, (weeks.get(week) ?? 0) + row.totalMs);
      }
      const buildMinutes = kickoff.state === "verified" ? await reportAggregate.sum(ctx, { namespace: studentBuildMinutesNamespace(args.seasonId, student._id), bounds: { lower: { key: kickoff.kickoffAt, inclusive: true } } }) : 0;
      return { name: student.legalName || student.preferredName, subteam: student.subteam, required: await attended("Required"), other: await attended("Other"), outreach: await attended("Outreach"), buildMinutes, totalMs, weeks: [...weeks].map(([week, ms]) => ({ week, ms })) };
    }));
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

type GateResult = { ready: boolean; held: Data["held"] };
type StudentPage = { rows: Data["students"][number][]; isDone: boolean; cursor: string | null };

/** Active students' attendance. Throws (so the file keeps its last numbers) while the season's attendance reports are updating or failed. */
export const load: SheetLoader<Data> = async (ctx, args) => {
  const before: GateResult = await ctx.runQuery(internal.sheetData.attendance.gate, { seasonId: args.seasonId });
  if (!before.ready) throw new ConvexError(ATTENDANCE_NOT_READY);
  const students: Data["students"][number][] = [];
  let cursor: string | null = null;
  for (let page = 0; ; page++) {
    if (page >= 200) throw new Error("Too many students to read");
    const result: StudentPage = await ctx.runQuery(internal.sheetData.attendance.studentPage, { seasonId: args.seasonId, cursor });
    students.push(...result.rows);
    if (result.isDone) break;
    cursor = result.cursor;
  }
  // The numbers come from several queries, so check the reports did not start updating meanwhile.
  const after: GateResult = await ctx.runQuery(internal.sheetData.attendance.gate, { seasonId: args.seasonId });
  if (!after.ready || JSON.stringify(after.held) !== JSON.stringify(before.held)) throw new ConvexError(ATTENDANCE_NOT_READY);
  return { held: before.held, students };
};
