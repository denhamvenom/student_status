import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { canonicalSubteam } from "../src/lib/subteams";
import { activeSeason, viewer } from "./lib/access";
import { PRIMARY_SUBTEAMS, SECONDARY_SUBTEAMS, studentMatchesSubteams } from "./lib/eventAudienceRules";
import { plausibleAsOf, requireMeetingMentor } from "./lib/mentorMeetings";
import { MAX_GROUP_SIZE } from "./lib/timeclock";

/** Open Timeclock sessions read for the season (the console normally has one or two open at a time). */
const MAX_OPEN_SESSIONS = 20;
/** Open clock-ins read across those sessions in total (a session holds at most MAX_GROUP_SIZE per clock-in group). */
const MAX_OPEN_INTERVALS = 500;

const clockedInStudent = v.object({ displayName: v.string(), subteam: v.string(), clockedInAt: v.number() });

/**
 * Which students of the Mentor's subteams are clocked in at Timeclock right now (Mentor Home). Mentors only (isMentorCapable:
 * a Mentor account, or a Parent with a current Mentor or Travel Lead staff-access grant); Students, Parents without a grant and
 * Coaches are refused. Minimized: a display name, the student's primary subteam and the clock-in time; no ids, contact,
 * health or finance data.
 *
 * Reads, by index and bounded: the active season's OPEN Timeclock sessions (`timeclockSessions.by_seasonId_and_state`, up to
 * 20) and their open clock-ins (`timeclockIntervals.by_sessionId_and_outAt` with no clock-out, up to 500 in total), then each
 * clocked-in student. A student is listed under every Mentor subteam they match: their primary subteam (legacy names
 * canonicalized) or their secondary subteam (CAD). Active, current-season students only. A session past its effective end is
 * treated as closed (the server closes it at that time). `asOf` is the client's time (queries don't read the clock), clamped by
 * plausibleAsOf; it only decides whether an open session has already run past its end.
 */
export const mySubteamClockedIn = query({
  args: { asOf: v.number() },
  returns: v.object({
    /** One group per Mentor subteam, in the order a Coach set them; students sorted by name. */
    subteams: v.array(v.object({ subteam: v.string(), count: v.number(), students: v.array(clockedInStudent) })),
    /** Distinct students clocked in across all of the Mentor's subteams (a Build + CAD student counts once). */
    totalCount: v.number(),
    /** True when a read cap was reached, so some clocked-in students may be missing. */
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireMeetingMentor(ctx, await viewer(ctx));
    const season = await activeSeason(ctx);
    const now = plausibleAsOf(args.asOf, [season._creationTime, user._creationTime]);
    if (now === null) throw new ConvexError("Clocked-in students could not load. Reload the page and try again.");
    // The Mentor's subteams as a Coach set them (primary subteams and CAD; legacy names canonicalized, duplicates dropped).
    const allowed = new Set<string>([...PRIMARY_SUBTEAMS, ...SECONDARY_SUBTEAMS]);
    const mine = [...new Set((user.subteams ?? []).map(canonicalSubteam))].filter(subteam => allowed.has(subteam));
    if (mine.length === 0) return { subteams: [], totalCount: 0, truncated: false };

    let truncated = false;
    const sessions = await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id).eq("state", "open")).take(MAX_OPEN_SESSIONS + 1);
    if (sessions.length > MAX_OPEN_SESSIONS) truncated = true;
    // Earliest open clock-in per student (a student holds one open clock-in at a time; this only guards odd data).
    const clockedIn = new Map<Id<"students">, number>();
    let intervalsRead = 0;
    for (const session of sessions.slice(0, MAX_OPEN_SESSIONS)) {
      if (now >= session.effectiveEnd) continue;
      const budget = Math.min(MAX_GROUP_SIZE * 2, MAX_OPEN_INTERVALS - intervalsRead);
      if (budget <= 0) { truncated = true; break; }
      const open = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_outAt", q => q.eq("sessionId", session._id).eq("outAt", undefined)).take(budget + 1);
      if (open.length > budget) truncated = true;
      intervalsRead += Math.min(open.length, budget);
      for (const interval of open.slice(0, budget)) {
        const earlier = clockedIn.get(interval.studentId);
        if (earlier === undefined || interval.inAt < earlier) clockedIn.set(interval.studentId, interval.inAt);
      }
    }

    const groups = new Map(mine.map(subteam => [subteam, [] as { displayName: string; subteam: string; clockedInAt: number }[]] as const));
    const counted = new Set<Id<"students">>();
    for (const [studentId, clockedInAt] of clockedIn) {
      const student: Doc<"students"> | null = await ctx.db.get(studentId);
      if (!student || !student.active || student.seasonId !== season._id) continue;
      const row = { displayName: student.preferredName.trim() || student.legalName, subteam: canonicalSubteam(student.subteam), clockedInAt };
      for (const subteam of mine) {
        if (!studentMatchesSubteams(student, [subteam])) continue;
        groups.get(subteam)!.push(row);
        counted.add(studentId);
      }
    }
    return {
      subteams: mine.map(subteam => {
        const students = groups.get(subteam)!.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.clockedInAt - b.clockedInAt);
        return { subteam, count: students.length, students };
      }),
      totalCount: counted.size,
      truncated,
    };
  },
});
