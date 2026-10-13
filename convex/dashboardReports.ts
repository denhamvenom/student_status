import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeSeason, requireRole, studentAccess, viewer } from "./lib/access";
import { financeFor } from "./lib/readModels";
import { classifiedTime, assertNoOverlap } from "./lib/timeclock";
import { FINANCE_SUMMARY_VERSION } from "./lib/financeSummaries";

const nullableNumber = v.union(v.number(), v.null());
const financeValidator = v.object({ chargedCents: v.number(), paidCents: v.number(), dueCents: v.number(), travelBalanceCents: v.number(), personalAvailableCents: v.number(), fundraisingAvailableCents: v.number(), raisedCents: v.null(), travelShareCents: v.number(), transferredInCents: v.number(), updatedAt: nullableNumber });

/** Gross fundraiser proceeds are not stored: do not relabel awarded credit as Raised. */
async function financialProjection(ctx: QueryCtx, studentId: Id<"students">) {
  const data = await financeFor(ctx, studentId);
  return { ...data.summary, raisedCents: null, travelShareCents: data.entries.filter(e => e.kind === "fundraiser" && !e.originEntryId).reduce((sum, e) => sum + e.amountCents, 0), transferredInCents: data.entries.filter(e => e.kind === "fundraiser" && !!e.originEntryId).reduce((sum, e) => sum + e.amountCents, 0), updatedAt: data.entries.length ? Math.max(...data.entries.map(e => e.recordedAt)) : null };
}

export const familyFinance = query({
  args: { studentId: v.id("students") }, returns: financeValidator,
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    requireRole(user, "student", "parent", "coach", "mentor");
    if (user.role === "mentor" && !user.travelLead) throw new Error("You do not have permission for finances.");
    await studentAccess(ctx, user, args.studentId);
    return financialProjection(ctx, args.studentId);
  },
});

export const team = query({
  args: {}, returns: v.union(
    v.object({ state: v.literal("ready"), activeStudents: v.number(), inactiveStudents: v.number(), travelTeamStudents: v.number(), finance: financeValidator }),
    v.object({ state: v.union(v.literal("updating"), v.literal("failed")), activeStudents: v.number(), inactiveStudents: v.number(), travelTeamStudents: v.number(), finance: v.null(), processed: v.number(), rebuildRunning: v.boolean(), canRebuild: v.boolean(), message: v.string() }),
  ),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new Error("You do not have permission for team finances.");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    if (students.length > 500) throw new Error("Dashboard roster limit reached; totals are unavailable.");
    const backfill = await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const summaries = await ctx.db.query("studentFinanceSummaries").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    const roster = { activeStudents: students.filter(s => s.active).length, inactiveStudents: students.filter(s => !s.active).length, travelTeamStudents: students.filter(s => s.active && s.travelTeam).length };
    if (backfill?.state !== "complete" || summaries.length > 500 || summaries.length !== students.length || summaries.some(summary => summary.version !== FINANCE_SUMMARY_VERSION || !students.some(student => student._id === summary.studentId)) || students.some(student => !summaries.some(summary => summary.studentId === student._id))) return { state: backfill?.state === "failed" ? "failed" as const : "updating" as const, ...roster, finance: null, processed: backfill?.processed ?? 0, rebuildRunning: backfill?.state === "running", canRebuild: user.role === "coach" && backfill?.state !== "running", message: backfill?.lastError ?? "Financial reports are updating; rebuild reports before viewing totals." };
    // Finance includes inactive current-season accounts: archiving never erases debt or credit.
    const totals = { chargedCents: 0, paidCents: 0, dueCents: 0, travelBalanceCents: 0, personalAvailableCents: 0, fundraisingAvailableCents: 0, raisedCents: null, travelShareCents: 0, transferredInCents: 0, updatedAt: null as number | null };
    for (const finance of summaries) {
      for (const key of ["chargedCents", "paidCents", "dueCents", "travelBalanceCents", "personalAvailableCents", "fundraisingAvailableCents", "travelShareCents", "transferredInCents"] as const) totals[key] += finance[key];
      if (finance.updatedAt !== null) totals.updatedAt = Math.max(totals.updatedAt ?? finance.updatedAt, finance.updatedAt);
    }
    return { state: "ready" as const, ...roster, finance: totals };
  },
});

export function correctedIntervals(session: Doc<"timeclockSessions">, originals: Doc<"timeclockIntervals">[], corrections: Doc<"timeclockCorrections">[], asOf: number) {
  // asOf is an elapsed-time cutoff, not a historical snapshot: latest audited corrections apply.
  const latest = new Map<string, Doc<"timeclockCorrections">>();
  for (const correction of corrections) {
    const key = correction.originalIntervalId ?? correction.targetCorrectionId;
    if (key) latest.set(key, correction);
  }
  const rows = [...originals.map(row => ({ id: row._id as string, inAt: row.inAt, outAt: row.outAt ?? (session.state === "open" ? Math.min(asOf, session.effectiveEnd) : session.closedAt ?? session.effectiveEnd) })), ...corrections.filter(c => c.kind === "add" && c.inAt !== undefined && c.outAt !== undefined).map(c => ({ id: c._id as string, inAt: c.inAt!, outAt: c.outAt! }))];
  const result = rows.flatMap(row => {
    const correction = latest.get(row.id);
    if (correction?.kind === "void") return [];
    const inAt = correction?.kind === "replace" ? correction.inAt : row.inAt;
    const outAt = correction?.kind === "replace" ? correction.outAt : row.outAt;
    if (inAt === undefined || outAt === undefined) throw new Error("Attendance correction is incomplete.");
    return Math.min(outAt, asOf) > inAt ? [{ inAt, outAt: Math.min(outAt, asOf) }] : [];
  });
  assertNoOverlap(result);
  return result;
}

const legacyValidator = v.object({ tuesdayHeld: v.number(), tuesdayAttended: v.number(), tuesdayPercent: nullableNumber, thursdayAttended: v.number(), outreachAttended: v.number() });
const sessionValidator = v.object({ sessionId: v.id("timeclockSessions"), title: v.string(), scheduledStart: v.number(), state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")), totalMs: v.number(), scheduledMs: v.number(), earlyMs: v.number(), extendedMs: v.number(), longestScheduledMs: v.number(), qualifies: v.boolean(), needsReview: v.boolean(), provisional: v.boolean() });
export const familyAttendance = query({
  args: { studentId: v.id("students"), asOf: v.number() },
  returns: v.object({ sessions: v.array(sessionValidator), verified: v.object({ sessionsHeld: v.number(), sessionsAttended: v.number(), tuesdayHeld: v.number(), tuesdayAttended: v.number(), tuesdayPercent: nullableNumber, thursdayAttended: v.number(), outreachAttended: v.null(), updatedAt: nullableNumber }), legacy: legacyValidator }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.asOf)) throw new Error("Invalid report time.");
    const user = await viewer(ctx);
    requireRole(user, "student", "parent", "coach");
    const student = await studentAccess(ctx, user, args.studentId);
    const stored = await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state", q => q.eq("seasonId", student.seasonId)).take(501);
    if (stored.length > 500) throw new Error("Attendance session limit reached; totals are unavailable.");
    const sessions = [];
    let updatedAt: number | null = null;
    for (const session of stored.filter(s => s.scheduledStart <= args.asOf).sort((a,b) => b.scheduledStart - a.scheduledStart)) {
      const originals = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", student._id)).take(501);
      const corrections = await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", student._id)).take(501);
      if (originals.length > 500 || corrections.length > 500) throw new Error("Attendance history limit reached; totals are unavailable.");
      const occurrence = await ctx.db.get(session.occurrenceId);
      const math = classifiedTime(correctedIntervals(session, originals, corrections, args.asOf), session.scheduledStart, session.scheduledEnd, session.effectiveEnd);
      sessions.push({ sessionId: session._id, title: occurrence?.title ?? "Unavailable event", scheduledStart: session.scheduledStart, state: session.state, ...math, needsReview: session.needsReview, provisional: session.state === "open" || (session.closedAt ?? session.effectiveEnd) > args.asOf });
      const changes = [session.openedAt, session.closedAt ?? 0, ...originals.flatMap(i => [i.inAt, i.outAt ?? 0]), ...corrections.map(c => c.at)];
      for (const at of changes) updatedAt = Math.max(updatedAt ?? at, at);
    }
    const held = sessions.filter(s => s.state === "closed" && !s.provisional && !s.needsReview);
    const day = (at: number) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long" }).format(at);
    const tuesdays = held.filter(s => day(s.scheduledStart) === "Tuesday");
    const tuesdayAttended = tuesdays.filter(s => s.qualifies).length;
    const meetings = await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", student.seasonId).lte("startsAt", args.asOf)).take(501);
    const records = await ctx.db.query("attendanceRecords").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(501);
    if (meetings.length > 500 || records.length > 500) throw new Error("Legacy attendance limit reached; totals are unavailable.");
    const present = new Set(records.filter(r => r.present).map(r => r.meetingId));
    const legacyHeld = meetings.filter(m => !m.cancelled);
    const legacyTuesdays = legacyHeld.filter(m => m.kind === "Tuesday");
    const legacyAttended = legacyTuesdays.filter(m => present.has(m._id)).length;
    const legacy = { tuesdayHeld: legacyTuesdays.length, tuesdayAttended: legacyAttended, tuesdayPercent: legacyTuesdays.length ? Math.round(100 * legacyAttended / legacyTuesdays.length) : null, thursdayAttended: legacyHeld.filter(m => m.kind === "Thursday" && present.has(m._id)).length, outreachAttended: legacyHeld.filter(m => m.kind === "Outreach" && present.has(m._id)).length };
    return { sessions, verified: { sessionsHeld: held.length, sessionsAttended: held.filter(s => s.qualifies).length, tuesdayHeld: tuesdays.length, tuesdayAttended, tuesdayPercent: tuesdays.length ? Math.round(100 * tuesdayAttended / tuesdays.length) : null, thursdayAttended: held.filter(s => day(s.scheduledStart) === "Thursday" && s.qualifies).length, outreachAttended: null, updatedAt }, legacy };
  },
});
