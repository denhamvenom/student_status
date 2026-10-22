/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const hour = 60 * 60_000;
const digest = "a".repeat(64);

async function settle(t: ReturnType<typeof convexTest>, sessionId: Id<"timeclockSessions">) {
  for (let count = 0; count < 20; count++) {
    const state = await t.run(ctx => ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", sessionId)).unique());
    if (state?.state === "ready") return;
    if (!state || state.state !== "rebuilding") throw new Error("Attendance report did not start.");
    await t.mutation(internal.attendanceReportMaintenance.continueSession, { sessionId, expectedGeneration: state.reportGeneration, expectedSessionRevision: state.sessionRevision, expectedPhase: state.phase, expectedCursor: state.cursor });
  }
  throw new Error("Attendance report did not settle.");
}

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach-import@example.org", name: "Coach" });
    const mentorAuth = await ctx.db.insert("users", { email: "mentor-import@example.org", name: "Mentor" });
    const coachId = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach-import@example.org", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    await ctx.db.insert("appUsers", { authUserId: mentorAuth, email: "mentor-import@example.org", name: "Mentor", role: "mentor", active: true, travelLead: false, financialEdit: false });
    const seasonId = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coachId });
    const studentId = await ctx.db.insert("students", { seasonId, legalName: "Sample Student", preferredName: "Sample", email: "student-import@example.org", subteam: "Test", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    const secondId = await ctx.db.insert("students", { seasonId, legalName: "Second Student", preferredName: "Second", email: "second-import@example.org", subteam: "Test", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    const start = Date.now() - 8 * hour;
    const end = start + 2 * hour;
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId, source: "calendar", sourceKey: "test-first", title: "Team visit", allDay: false, scheduledStart: start, scheduledEnd: end, cancelled: false, observedAt: start, revision: 3, needsReview: false });
    const secondOccurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId, source: "calendar", sourceKey: "test-second", title: "Another event", allDay: false, scheduledStart: start + 3 * hour, scheduledEnd: end + 3 * hour, cancelled: false, observedAt: start, revision: 1, needsReview: false });
    return { coachAuth, mentorAuth, coachId, seasonId, studentId, secondId, occurrenceId, secondOccurrenceId, start, end };
  });
  const args = { occurrenceId: ids.occurrenceId, expectedRevision: 3, expectedScheduledStart: ids.start, expectedScheduledEnd: ids.end, outreach: false, sourceSha256: digest, reason: "Reviewed historical source", rows: [{ studentId: ids.studentId, inAt: ids.start, outAt: ids.end + 26 * 60_000 }] };
  return { t, ids, args, coach: t.withIdentity({ subject: `${ids.coachAuth}|test` }), mentor: t.withIdentity({ subject: `${ids.mentorAuth}|test` }) };
}

describe("historical timeclock import", () => {
  it("previews without writes, then imports one closed session with late-out evidence and exact replay", async () => {
    const f = await fixture();
    await expect(f.mentor.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, dryRun: true })).rejects.toThrow("permission");
    expect(await f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, dryRun: true })).toMatchObject({ status: "ready", sessionId: null, rowCount: 1 });
    expect(await f.t.run(ctx => ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", f.ids.occurrenceId)).unique())).toBeNull();
    const imported = await f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, dryRun: false });
    expect(imported.status).toBe("imported");
    expect(await f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, dryRun: false })).toMatchObject({ status: "unchanged", sessionId: imported.sessionId });
    const session = await f.t.run(ctx => ctx.db.get(imported.sessionId!));
    expect(session).toMatchObject({ state: "closed", effectiveEnd: f.args.rows[0].outAt, extensionMs: 26 * 60_000, outreachOverride: false });
    await settle(f.t, imported.sessionId!);
    const summary = await f.t.run(ctx => ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", imported.sessionId!).eq("studentId", f.ids.studentId)).unique());
    expect(summary).toMatchObject({ totalMs: 2 * hour + 26 * 60_000, scheduledMs: 2 * hour, extendedMs: 26 * 60_000, qualifies: true, outreach: false });
    await expect(f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, rows: [{ ...f.args.rows[0], outAt: f.ids.end }], dryRun: false })).rejects.toThrow("different evidence");
    const second = await f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, occurrenceId: f.ids.secondOccurrenceId, expectedRevision: 1, expectedScheduledStart: f.ids.start + 3 * hour, expectedScheduledEnd: f.ids.end + 3 * hour, rows: [{ studentId: f.ids.studentId, inAt: f.ids.start + 3 * hour, outAt: f.ids.end + 3 * hour }], dryRun: false });
    expect(second.status).toBe("imported"); // the same CSV fingerprint covers both occurrence batches
  });

  it("rejects duplicate rows and conflicting history atomically", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, rows: [f.args.rows[0], f.args.rows[0]], dryRun: false })).rejects.toThrow("Duplicate student");
    await f.t.run(async ctx => {
      const other = await ctx.db.insert("timeclockSessions", { occurrenceId: f.ids.secondOccurrenceId, seasonId: f.ids.seasonId, state: "closed", scheduledStart: f.ids.start, scheduledEnd: f.ids.end, effectiveEnd: f.ids.end, extensionMs: 0, revision: 1, openedAt: f.ids.start, openedBy: f.ids.coachId, closedAt: f.ids.end, needsReview: false });
      await ctx.db.insert("timeclockCorrections", { sessionId: other, studentId: f.ids.secondId, kind: "add", inAt: f.ids.start + hour, outAt: f.ids.end, reason: "Synthetic correction", actorId: f.ids.coachId, at: Date.now(), commandKey: "synthetic-correction" });
    });
    const rows = [f.args.rows[0], { studentId: f.ids.secondId, inAt: f.ids.start, outAt: f.ids.end }];
    await expect(f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, rows, dryRun: false })).rejects.toThrow("overlapping attendance");
    expect(await f.t.run(ctx => ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", f.ids.occurrenceId)).unique())).toBeNull();
  });

  it("enforces full-window outreach and stores explicit outreach classification", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, outreach: true, dryRun: true })).rejects.toThrow("Outreach import");
    const result = await f.coach.mutation(internal.timeclockHistoryImport.importOccurrence, { ...f.args, outreach: true, rows: [{ ...f.args.rows[0], outAt: f.ids.end }], dryRun: false });
    const report = await f.t.run(ctx => ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", result.sessionId!)).unique());
    expect(report?.outreach).toBe(true);
    await settle(f.t, result.sessionId!);
    const summary = await f.t.run(ctx => ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", result.sessionId!).eq("studentId", f.ids.studentId)).unique());
    expect(summary).toMatchObject({ outreach: true, totalMs: 2 * hour, extendedMs: 0, qualifies: true });
  });
});
