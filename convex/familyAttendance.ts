import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { activeSeason, viewer } from "./lib/access";
import { effectiveIntervals } from "./lib/attendanceIntervals";
import { classifiedTime } from "./lib/timeclock";

const studentId = v.id("students");
const timedRow = v.object({
  sessionId: v.id("timeclockSessions"),
  title: v.string(),
  scheduledStart: v.number(),
  scheduledEnd: v.number(),
  state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")),
  totalMs: v.number(),
  earlyMs: v.number(),
  scheduledMs: v.number(),
  extendedMs: v.number(),
  longestScheduledMs: v.number(),
  qualifies: v.boolean(),
  intervalCount: v.number(),
  needsReview: v.boolean(),
});

export const forStudent = query({
  args: { studentId, asOf: v.number() },
  returns: v.object({
    studentId,
    studentName: v.string(),
    legacy: v.object({
      label: v.literal("Legacy meeting records"),
      tuesdayHeld: v.number(),
      tuesdayAttended: v.number(),
      tuesdayPercent: v.union(v.number(), v.null()),
      thursdayAttended: v.number(),
      outreachAttended: v.number(),
    }),
    timed: v.object({ label: v.literal("Verified clock sessions"), sessions: v.array(timedRow) }),
  }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.asOf) || args.asOf < 0) throw new Error("A valid attendance date is required.");
    const actor = await viewer(ctx);
    if (actor.role !== "student" && actor.role !== "parent") throw new Error("You do not have permission for this student.");
    const season = await activeSeason(ctx);
    const student = await ctx.db.get(args.studentId);
    if (!student?.active || student.seasonId !== season._id) throw new Error("Student is unavailable in the active season.");
    if (actor.role === "student") {
      if (student.userId !== actor._id) throw new Error("You do not have permission for this student.");
    } else {
      const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", actor._id).eq("studentId", student._id)).unique();
      if (!link?.active) throw new Error("You do not have permission for this student.");
    }

    const meetings = await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id).lte("startsAt", args.asOf)).take(501);
    const records = await ctx.db.query("attendanceRecords").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(501);
    if (meetings.length > 500 || records.length > 500) throw new Error("Legacy attendance history exceeds the review limit.");
    const held = meetings.filter(meeting => !meeting.cancelled);
    const present = new Set(records.filter(record => record.present).map(record => record.meetingId));
    const tuesdayHeld = held.filter(meeting => meeting.kind === "Tuesday").length;
    const tuesdayAttended = held.filter(meeting => meeting.kind === "Tuesday" && present.has(meeting._id)).length;

    const original = await ctx.db.query("timeclockIntervals").withIndex("by_studentId_and_inAt", q => q.eq("studentId", student._id)).take(501);
    const corrections = await ctx.db.query("timeclockCorrections").withIndex("by_studentId_and_at", q => q.eq("studentId", student._id)).take(501);
    if (original.length > 500 || corrections.length > 500) throw new Error("Clock attendance history exceeds the review limit.");
    const candidateIds = new Set([...original.map(row => row.sessionId), ...corrections.map(row => row.sessionId)]);
    const candidateSessions = await Promise.all([...candidateIds].map(id => ctx.db.get(id)));
    const currentSessions = candidateSessions.filter((session): session is Doc<"timeclockSessions"> => !!session && session.seasonId === season._id);
    if (currentSessions.length > 100) throw new Error("Clock attendance sessions exceed the review limit.");

    const sessions = await Promise.all(currentSessions.map(async session => {
      const occurrence = await ctx.db.get(session.occurrenceId);
      const intervals = await effectiveIntervals(ctx, session, student._id, args.asOf);
      const capped = intervals.map(interval => ({ inAt: interval.inAt, outAt: Math.min(interval.outAt, args.asOf) })).filter(interval => interval.outAt > interval.inAt);
      const time = classifiedTime(capped, session.scheduledStart, session.scheduledEnd, session.effectiveEnd);
      return {
        sessionId: session._id,
        title: occurrence?.title ?? "Clock session",
        scheduledStart: session.scheduledStart,
        scheduledEnd: session.scheduledEnd,
        state: session.state,
        ...time,
        qualifies: session.state === "cancelled" ? false : time.qualifies,
        intervalCount: capped.length,
        needsReview: session.needsReview,
      };
    }));
    sessions.sort((a, b) => b.scheduledStart - a.scheduledStart || String(b.sessionId).localeCompare(String(a.sessionId)));

    return {
      studentId: student._id,
      studentName: student.preferredName,
      legacy: {
        label: "Legacy meeting records" as const,
        tuesdayHeld,
        tuesdayAttended,
        tuesdayPercent: tuesdayHeld ? Math.round(100 * tuesdayAttended / tuesdayHeld) : null,
        thursdayAttended: held.filter(meeting => meeting.kind === "Thursday" && present.has(meeting._id)).length,
        outreachAttended: held.filter(meeting => meeting.kind === "Outreach" && present.has(meeting._id)).length,
      },
      timed: { label: "Verified clock sessions" as const, sessions },
    };
  },
});
