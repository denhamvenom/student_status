import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { activeSeason, requireRole, viewer } from "./lib/access";
import { correctedIntervals, invalidateAttendanceSession } from "./lib/attendanceReports";
import { chicagoDayBounds } from "./lib/timeclock";
import { timeclockTransitionLocked } from "./lib/timeclockTransition";

const row = v.object({ studentId: v.id("students"), inAt: v.number(), outAt: v.number() });
const args = {
  occurrenceId: v.id("timeclockOccurrences"),
  expectedRevision: v.number(),
  expectedScheduledStart: v.number(),
  expectedScheduledEnd: v.number(),
  outreach: v.boolean(),
  sourceSha256: v.string(),
  reason: v.string(),
  rows: v.array(row),
  dryRun: v.boolean(),
};
const result = v.object({ status: v.union(v.literal("ready"), v.literal("imported"), v.literal("unchanged")), sessionId: v.union(v.id("timeclockSessions"), v.null()), rowCount: v.number() });

/** A single occurrence is the transaction boundary. CLI callers use --identity for a Coach account. */
export const importOccurrence = internalMutation({
  args, returns: result,
  handler: async (ctx, input) => {
    const actor = await viewer(ctx);
    requireRole(actor, "coach");
    const season = await activeSeason(ctx);
    if (await timeclockTransitionLocked(ctx, season._id)) throw new ConvexError("Season transition is in progress.");
    const now = Date.now();
    const occurrence = await ctx.db.get(input.occurrenceId);
    if (!occurrence || occurrence.seasonId !== season._id || occurrence.cancelled || occurrence.allDay || occurrence.source !== "calendar") throw new ConvexError("An active timed Calendar occurrence in the active season is required.");
    if (occurrence.revision !== input.expectedRevision || occurrence.scheduledStart !== input.expectedScheduledStart || occurrence.scheduledEnd !== input.expectedScheduledEnd) throw new ConvexError("Calendar occurrence changed after review.");
    const start = occurrence.scheduledStart;
    const end = occurrence.scheduledEnd;
    if (start === undefined || end === undefined || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > now || end - start > 18 * 60 * 60 * 1000) throw new ConvexError("Historical scheduled window is invalid or not complete.");
    if (!/^[a-f0-9]{64}$/i.test(input.sourceSha256)) throw new ConvexError("A SHA-256 source fingerprint is required.");
    const reason = input.reason.trim();
    if (reason.length < 10 || reason.length > 1000) throw new ConvexError("An import reason of 10–1000 characters is required.");
    if (input.rows.length < 1 || input.rows.length > 100) throw new ConvexError("Import requires 1–100 student rows.");
    const seen = new Set<Id<"students">>();
    let effectiveEnd = end;
    for (const entry of input.rows) {
      if (seen.has(entry.studentId)) throw new ConvexError("Duplicate student in occurrence import.");
      seen.add(entry.studentId);
      if (!Number.isSafeInteger(entry.inAt) || !Number.isSafeInteger(entry.outAt) || entry.inAt !== start || entry.outAt <= start || entry.outAt > end + 2 * 60 * 60 * 1000 || entry.outAt > now) throw new ConvexError("Student interval is outside the approved historical window.");
      if (input.outreach && entry.outAt !== end) throw new ConvexError("Outreach import must cover the complete scheduled window.");
      effectiveEnd = Math.max(effectiveEnd, entry.outAt);
    }
    // Preserve supplied row order in the audit record; exact replay requires the same reviewed payload.
    const payloadJson = JSON.stringify({ occurrenceId: input.occurrenceId, expectedRevision: input.expectedRevision, expectedScheduledStart: start, expectedScheduledEnd: end, outreach: input.outreach, sourceSha256: input.sourceSha256.toLowerCase(), reason, rows: input.rows });
    const prior = await ctx.db.query("timeclockHistoryImports").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).unique();
    const session = await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).unique();
    if (prior) {
      if (prior.payloadJson !== payloadJson || !session || prior.sessionId !== session._id || session.state !== "closed" || session.revision !== 1) throw new ConvexError("Historical occurrence was already imported with different evidence or later changes.");
      return { status: "unchanged" as const, sessionId: session._id, rowCount: prior.rowCount };
    }
    if (session) throw new ConvexError("Occurrence already has an operational session.");
    const day = chicagoDayBounds(start);
    const legacyMeetings = await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id).gte("startsAt", day.start).lt("startsAt", day.end)).take(101);
    if (legacyMeetings.length > 100) throw new ConvexError("Historical day has too many legacy meetings to verify.");
    for (const meeting of legacyMeetings) {
      const record = await ctx.db.query("attendanceRecords").withIndex("by_meetingId_and_studentId", q => q.eq("meetingId", meeting._id)).first();
      if (record) throw new ConvexError("Historical day already contains legacy attendance.");
    }
    for (const entry of input.rows) {
      const student = await ctx.db.get(entry.studentId);
      if (!student || student.seasonId !== season._id || !student.active) throw new ConvexError("Import student is unavailable in the active season.");
      const originals = await ctx.db.query("timeclockIntervals").withIndex("by_studentId_and_inAt", q => q.eq("studentId", entry.studentId)).take(501);
      const corrections = await ctx.db.query("timeclockCorrections").withIndex("by_studentId_and_at", q => q.eq("studentId", entry.studentId)).take(501);
      if (originals.length > 500 || corrections.length > 500) throw new ConvexError("Student attendance history exceeds the supported conflict review limit.");
      const sessionIds = new Set<Id<"timeclockSessions">>([...originals.map(x => x.sessionId), ...corrections.map(x => x.sessionId)]);
      for (const otherId of sessionIds) {
        const other = await ctx.db.get(otherId);
        if (!other) throw new ConvexError("Student attendance references a missing session.");
        const original = originals.filter(x => x.sessionId === otherId);
        const corrected = corrections.filter(x => x.sessionId === otherId);
        for (const interval of correctedIntervals(other, original, corrected, now)) {
          if (entry.inAt < interval.outAt && interval.inAt < entry.outAt) throw new ConvexError("Student has overlapping attendance in another event.");
        }
      }
    }
    if (input.dryRun) return { status: "ready" as const, sessionId: null, rowCount: input.rows.length };
    const sessionId = await ctx.db.insert("timeclockSessions", { occurrenceId: occurrence._id, seasonId: season._id, state: "closed", scheduledStart: start, scheduledEnd: end, effectiveEnd, extensionMs: effectiveEnd - end, revision: 1, openedAt: start, openedBy: actor._id, closedAt: effectiveEnd, closeReason: "historical_import", needsReview: false, outreachOverride: input.outreach });
    for (const entry of input.rows) await ctx.db.insert("timeclockIntervals", { sessionId, studentId: entry.studentId, inAt: entry.inAt, outAt: entry.outAt, openedBy: actor._id, closedBy: actor._id, closeReason: "historical_import", openCommandKey: input.sourceSha256.toLowerCase(), scheduleRevision: occurrence.revision });
    await ctx.db.insert("timeclockHistoryImports", { occurrenceId: occurrence._id, sessionId, seasonId: season._id, actorId: actor._id, sourceSha256: input.sourceSha256.toLowerCase(), payloadJson, reason, importedAt: now, rowCount: input.rows.length });
    await invalidateAttendanceSession(ctx, sessionId);
    return { status: "imported" as const, sessionId, rowCount: input.rows.length };
  },
});
