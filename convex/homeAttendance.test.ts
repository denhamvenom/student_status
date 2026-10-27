/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { invalidateAttendanceSession } from "./lib/attendanceReports";
import { buildMinutesContribution, reportAggregate, studentBuildMinutesNamespace, updateSessionAggregate } from "./lib/reportAggregates";
import type { HomeAttendance } from "../src/features/student-home/contract";

// The Student Home screens consume the contract type; the return validator must produce exactly that shape.
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const returnsContract: Exact<FunctionReturnType<typeof api.dashboardReports.homeAttendance>, HomeAttendance> = true;
void returnsContract;

const modules = import.meta.glob("./**/*.ts");
const minute = 60000;
const hour = 60 * minute;
type T = ReturnType<typeof createTest>;
type Visit = { inAt: number; outAt?: number };
type Meeting = { title: string; at: number; scheduledMs?: number; extensionMs?: number; state?: "open" | "closed"; needsReview?: boolean; visits?: Visit[] };

// Competition year 2027: kickoff is Saturday, January 9, 2027 at Chicago midnight.
const kickoffAt = Date.parse("2027-01-09T06:00:00Z");

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "parent" | "student", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("home-coach", "coach"), mentor = await account("home-mentor", "mentor"), lead = await account("home-lead", "mentor", true);
    const parent = await account("home-parent", "parent"), otherParent = await account("home-other-parent", "parent");
    const student = await account("home-student", "student"), otherStudent = await account("home-other-student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const base = { seasonId: season, legalName: "Dev Student", preferredName: "Dev", email: "dev.student@example.invalid", active: true, travelTeam: false, subteam: "Build", roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
    const sid = await ctx.db.insert("students", { ...base, userId: student.id });
    const otherSid = await ctx.db.insert("students", { ...base, legalName: "Jordan Williams", preferredName: "Jordan", email: "jordan@example.invalid", userId: otherStudent.id });
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: sid, active: true, createdBy: coach.id });
    await ctx.db.insert("familyLinks", { parentUserId: otherParent.id, studentId: otherSid, active: true, createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { coach, mentor, lead, parent, otherParent, student, otherStudent, season, sid, otherSid };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, coach: as(ids.coach), mentor: as(ids.mentor), lead: as(ids.lead), parent: as(ids.parent), otherParent: as(ids.otherParent), student: as(ids.student), otherStudent: as(ids.otherStudent) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function settle(t: T, sessionId: Id<"timeclockSessions">) {
  for (let step = 0; step < 100; step++) {
    const row = await t.run(ctx => ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", sessionId)).unique());
    if (!row || row.state !== "rebuilding") return;
    await t.mutation(internal.attendanceReportMaintenance.continueSession, { sessionId, expectedGeneration: row.reportGeneration, expectedSessionRevision: row.sessionRevision, expectedPhase: row.phase, expectedCursor: row.cursor });
  }
  throw new Error("Attendance report did not settle.");
}

/** A Timeclock meeting for the fixture student, projected through the real report pipeline. */
async function meeting(f: Fixture, spec: Meeting) {
  const scheduledMs = spec.scheduledMs ?? 2 * hour, extensionMs = spec.extensionMs ?? 0, state = spec.state ?? "closed";
  const session = await f.t.run(async ctx => {
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: "manual", sourceKey: `synthetic-${spec.at}`, title: spec.title, allDay: false, cancelled: false, observedAt: spec.at, revision: 1, needsReview: false });
    const effectiveEnd = spec.at + scheduledMs + extensionMs;
    const sessionId = await ctx.db.insert("timeclockSessions", { seasonId: f.ids.season, occurrenceId, state, scheduledStart: spec.at, scheduledEnd: spec.at + scheduledMs, effectiveEnd, extensionMs, revision: 1, openedAt: spec.at, openedBy: f.ids.coach.id, closedAt: state === "closed" ? effectiveEnd : undefined, needsReview: spec.needsReview ?? false });
    for (const [index, visit] of (spec.visits ?? []).entries()) await ctx.db.insert("timeclockIntervals", { sessionId, studentId: f.ids.sid, inAt: visit.inAt, outAt: visit.outAt, openedBy: f.ids.coach.id, openCommandKey: `synthetic-${spec.at}-${index}`, scheduleRevision: 1 });
    await invalidateAttendanceSession(ctx, sessionId);
    return sessionId;
  });
  await settle(f.t, session);
  return session;
}
async function change(f: Fixture, sessionId: Id<"timeclockSessions">, patch: { state?: "closed" | "cancelled"; needsReview?: boolean; closedAt?: number }) {
  await f.t.run(async ctx => { const session = await ctx.db.get(sessionId); await ctx.db.patch(sessionId, { ...patch, revision: session!.revision + 1 }); await invalidateAttendanceSession(ctx, sessionId); });
  await settle(f.t, sessionId);
}
const full = (at: number, ms = 2 * hour): Visit[] => [{ inAt: at, outAt: at + ms }];
const minutesFor = (f: Fixture) => f.t.run(ctx => reportAggregate.sum(ctx, { namespace: studentBuildMinutesNamespace(f.ids.season, f.ids.sid) }));

// Chicago times: 6 p.m. CDT is 23:00Z in October; 5 p.m. CST is 23:00Z in January.
const tuesday = Date.parse("2026-10-13T23:00:00Z");
const buildBeforeKickoff = Date.parse("2026-12-15T23:00:00Z");
const outreachAttended = Date.parse("2026-11-07T15:00:00Z");
const outreachMissed = Date.parse("2026-11-14T15:00:00Z");
const buildWeekday = Date.parse("2027-01-12T23:00:00Z");
const buildSaturday = Date.parse("2027-01-16T15:00:00Z");
const thursday = Date.parse("2027-01-14T23:00:00Z");
const buildNeedsReview = Date.parse("2027-01-19T23:00:00Z");

async function season(f: Fixture) {
  await meeting(f, { title: "Tuesday meeting", at: tuesday, visits: full(tuesday) });
  await meeting(f, { title: "Build meeting", at: buildBeforeKickoff, visits: full(buildBeforeKickoff) });
  await meeting(f, { title: "Library outreach", at: outreachAttended, scheduledMs: 3 * hour, visits: full(outreachAttended, 3 * hour) });
  await meeting(f, { title: "Outreach fair", at: outreachMissed });
  // 30 minutes early through 30 minutes of a 1-hour extension: 4 hours clocked.
  const weekday = await meeting(f, { title: "Build meeting", at: buildWeekday, scheduledMs: 3 * hour, extensionMs: hour, visits: [{ inAt: buildWeekday - 30 * minute, outAt: buildWeekday + 3.5 * hour }] });
  // A short visit does not qualify as attendance but its 20 whole minutes still count.
  const saturday = await meeting(f, { title: "Saturday build", at: buildSaturday, scheduledMs: 6 * hour, visits: [{ inAt: buildSaturday, outAt: buildSaturday + 20 * minute + 10000 }] });
  await meeting(f, { title: "Thursday meeting", at: thursday, visits: full(thursday) });
  const review = await meeting(f, { title: "Build meeting", at: buildNeedsReview, needsReview: true, visits: full(buildNeedsReview) });
  return { weekday, saturday, review };
}

describe("Build minutes contribution", () => {
  it.each([
    { name: "closed weekday Build", row: { buildDay: "weekday", sessionState: "closed", needsReview: false, totalMs: 90 * minute + 59999 }, minutes: 90 },
    { name: "closed Saturday Build", row: { buildDay: "saturday", sessionState: "closed", needsReview: false, totalMs: 6 * hour }, minutes: 360 },
    { name: "closed Sunday Build", row: { buildDay: "sunday", sessionState: "closed", needsReview: false, totalMs: 59999 }, minutes: 0 },
    { name: "not a Build meeting", row: { buildDay: null, sessionState: "closed", needsReview: false, totalMs: 2 * hour }, minutes: 0 },
    { name: "unclassified older row", row: { buildDay: undefined, sessionState: "closed", needsReview: false, totalMs: 2 * hour }, minutes: 0 },
    { name: "needs review", row: { buildDay: "weekday", sessionState: "closed", needsReview: true, totalMs: 2 * hour }, minutes: 0 },
    { name: "canceled", row: { buildDay: "weekday", sessionState: "cancelled", needsReview: false, totalMs: 2 * hour }, minutes: 0 },
  ] as const)("$name", ({ row, minutes }) => {
    expect(buildMinutesContribution(row)).toBe(minutes);
  });
});

describe("Student Home participation rings", () => {
  it("counts Meetings without Outreach, Outreach separately and Build hours from kickoff", async () => {
    const f = await fixture();
    await season(f);
    const result = await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid });
    // Held: Tuesday, pre-kickoff Build, Saturday Build, weekday Build, Thursday (the needs-review meeting is not held yet).
    expect(result).toEqual({ state: "ready", meetings: { attended: 4, held: 5 }, outreach: { attended: 1, held: 2 }, buildHours: { state: "ready", minutes: 240 + 20, targetHours: null }, kickoffAt });
    expect(await f.parent.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toEqual(result);
    expect(await f.coach.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toEqual(result);
    // The pre-kickoff Build meeting is stored but sits before the kickoff bound.
    expect(await minutesFor(f)).toBe(120 + 240 + 20);
    expect(await f.otherStudent.query(api.dashboardReports.homeAttendance, { studentId: f.ids.otherSid })).toMatchObject({ meetings: { attended: 0, held: 5 }, outreach: { attended: 0, held: 2 }, buildHours: { minutes: 0 } });
  });

  it("maintains Build minutes through corrections, review, cancellation and closing", async () => {
    const f = await fixture();
    const { weekday, saturday, review } = await season(f);
    const minutes = async () => (await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).buildHours.minutes;
    // A corrected visit replaces the old contribution instead of adding to it.
    await f.t.run(async ctx => {
      const interval = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", weekday).eq("studentId", f.ids.sid)).unique();
      await ctx.db.insert("timeclockCorrections", { sessionId: weekday, studentId: f.ids.sid, originalIntervalId: interval!._id, kind: "replace", inAt: buildWeekday, outAt: buildWeekday + hour, reason: "Synthetic correction", actorId: f.ids.coach.id, at: buildWeekday + 5 * hour, commandKey: "synthetic-replace" });
      await invalidateAttendanceSession(ctx, weekday);
    });
    await settle(f.t, weekday);
    expect(await minutes()).toBe(60 + 20);
    // Review cleared: the meeting starts counting.
    await change(f, review, { needsReview: false });
    expect(await minutes()).toBe(60 + 20 + 120);
    // Sent back for review, then canceled: each removes its contribution.
    await change(f, weekday, { needsReview: true });
    expect(await minutes()).toBe(20 + 120);
    await change(f, saturday, { state: "cancelled" });
    expect(await minutes()).toBe(120);
    // An open meeting is provisional and adds nothing until it closes.
    const openAt = Date.parse("2027-01-23T15:00:00Z");
    const open = await meeting(f, { title: "Build Saturday", at: openAt, scheduledMs: 4 * hour, state: "open", visits: [{ inAt: openAt }] });
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toMatchObject({ state: "ready", buildHours: { minutes: 120 } });
    await change(f, open, { state: "closed", closedAt: openAt + 4 * hour });
    expect(await minutes()).toBe(120 + 240);
  });

  it("is backfilled by Recalculate attendance for rows projected before Build minutes existed", async () => {
    const f = await fixture();
    const { weekday } = await season(f);
    // Simulate the deployed state before this change: summaries exist, the minutes namespace does not.
    await f.t.run(async ctx => {
      const summaries = await ctx.db.query("timeclockAttendanceSummaries").withIndex("by_studentId_and_scheduledStart", q => q.eq("studentId", f.ids.sid)).take(20);
      for (const row of summaries) await reportAggregate.deleteIfExists(ctx, { namespace: studentBuildMinutesNamespace(row.seasonId, row.studentId), key: row.scheduledStart, id: row.sessionId });
    });
    expect(await minutesFor(f)).toBe(0);
    const backfillId = await f.coach.mutation(api.attendanceReportMaintenance.start, {});
    for (let step = 0; step < 20; step++) {
      const row = await f.t.run(ctx => ctx.db.get(backfillId));
      if (row?.state !== "running") break;
      await f.t.mutation(internal.attendanceReportMaintenance.continueSeason, { backfillId, expectedCursor: row.cursor });
    }
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toMatchObject({ state: "updating", meetings: { attended: 0, held: 0 }, buildHours: { minutes: 0 } });
    const sessions = await f.t.run(ctx => ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state", q => q.eq("seasonId", f.ids.season)).take(20));
    for (const session of sessions) await settle(f.t, session._id);
    expect(sessions.some(session => session._id === weekday)).toBe(true);
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toMatchObject({ state: "ready", buildHours: { state: "ready", minutes: 260 } });
  });

  it("withholds counts while a meeting is recalculating or needs Coach review", async () => {
    const f = await fixture();
    const { weekday } = await season(f);
    await f.t.run(async ctx => { await ctx.db.patch(weekday, { revision: 2 }); await invalidateAttendanceSession(ctx, weekday); });
    const updating = { state: "updating", meetings: { attended: 0, held: 0 }, outreach: { attended: 0, held: 0 }, buildHours: { state: "ready", minutes: 0, targetHours: null }, kickoffAt };
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toEqual(updating);
    const state = await f.t.run(ctx => ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", weekday)).unique());
    await f.t.run(async ctx => {
      await ctx.db.patch(state!._id, { state: "failed" });
      await updateSessionAggregate(ctx, state, (await ctx.db.get(state!._id))!);
    });
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toEqual(updating);
  });

  it("reports an unverified kickoff without guessing Build hours", async () => {
    const f = await fixture();
    await season(f);
    await f.coach.mutation(api.seasonAdmin.setBuildHoursTarget, { hours: 80 });
    await f.t.run(ctx => ctx.db.patch(f.ids.season, { year: 2099 }));
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toEqual({ state: "ready", meetings: { attended: 4, held: 5 }, outreach: { attended: 1, held: 2 }, buildHours: { state: "kickoffUnknown", minutes: 0, targetHours: 80 }, kickoffAt: null });
  });

  it("refuses other families, Mentors and Travel Leads, and reports old or inactive records as unavailable", async () => {
    const f = await fixture();
    for (const client of [f.t, f.otherParent, f.otherStudent, f.mentor, f.lead]) await expect(client.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).rejects.toThrow();
    await f.t.run(async ctx => { const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", f.ids.parent.id).eq("studentId", f.ids.sid)).unique(); await ctx.db.patch(link!._id, { active: false }); });
    await expect(f.parent.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).rejects.toThrow("permission");
    const old = await f.t.run(async ctx => {
      const archived = await ctx.db.insert("seasons", { name: "Synthetic 2025–26", year: 2026, startsAt: 0, status: "archived", permissionVersion: "DRAFT", createdBy: f.ids.coach.id });
      return ctx.db.insert("students", { seasonId: archived, legalName: "Dev Student", preferredName: "Dev", email: "dev.student@example.invalid", active: true, travelTeam: false, subteam: "Build", roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" }, userId: f.ids.student.id });
    });
    const unavailable = { state: "unavailable", meetings: { attended: 0, held: 0 }, outreach: { attended: 0, held: 0 }, buildHours: { state: "kickoffUnknown", minutes: 0, targetHours: null }, kickoffAt: null };
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: old })).toEqual(unavailable);
    // Another family's old record is still refused, not described.
    await expect(f.otherStudent.query(api.dashboardReports.homeAttendance, { studentId: old })).rejects.toThrow("permission");
    await f.t.run(ctx => ctx.db.patch(f.ids.otherSid, { active: false }));
    expect(await f.otherParent.query(api.dashboardReports.homeAttendance, { studentId: f.ids.otherSid })).toEqual(unavailable);
  });

  it("reads a bounded number of documents however many meetings were held", async () => {
    const f = await fixture();
    await season(f);
    const measure = () => f.student.run(async ctx => {
      const result = await ctx.runQuery(api.dashboardReports.homeAttendance, { studentId: f.ids.sid });
      const metrics = await ctx.meta.getTransactionMetrics();
      return { state: result.state, held: result.meetings.held, documentsRead: metrics.documentsRead.used, databaseQueries: metrics.databaseQueries.used };
    });
    // Measured at 19 documents and 31 queries for both samples; the bounds leave a little room for gate changes.
    const budget = { documentsRead: 25, databaseQueries: 40 };
    const first = await measure();
    // Counts come from aggregates, so more held meetings must not mean more reads.
    for (let week = 0; week < 6; week++) { const at = Date.parse("2027-02-02T23:00:00Z") + week * 7 * 24 * hour; await meeting(f, { title: "Build meeting", at, visits: full(at) }); }
    const later = await measure();
    for (const [sample, held] of [[first, 5], [later, 11]] as const) {
      expect(sample).toMatchObject({ state: "ready", held });
      expect(sample.documentsRead, `documents read with ${held} held`).toBeLessThanOrEqual(budget.documentsRead);
      expect(sample.databaseQueries, `queries with ${held} held`).toBeLessThanOrEqual(budget.databaseQueries);
    }
  });

  it.each([
    { name: "moved from before kickoff to after kickoff", from: buildBeforeKickoff, to: Date.parse("2027-01-26T23:00:00Z"), shown: 120 },
    { name: "moved from after kickoff to before kickoff", from: Date.parse("2027-01-26T23:00:00Z"), to: buildBeforeKickoff, shown: 0 },
  ])("re-keys a Build meeting's minutes once, on its new side of kickoff, after its session start changes and the session is invalidated: $name", async ({ from, to, shown }) => {
    const f = await fixture();
    const session = await meeting(f, { title: "Build meeting", at: from, visits: full(from) });
    expect(await minutesFor(f)).toBe(120);
    // Checks aggregate re-keying only: the session row and visit are patched directly, then invalidated.
    // It does not exercise the calendar reschedule path that moves a real meeting.
    await f.t.run(async ctx => {
      const row = (await ctx.db.get(session))!;
      await ctx.db.patch(session, { scheduledStart: to, scheduledEnd: to + 2 * hour, effectiveEnd: to + 2 * hour, openedAt: to, closedAt: to + 2 * hour, revision: row.revision + 1 });
      const interval = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session).eq("studentId", f.ids.sid)).unique();
      await ctx.db.patch(interval!._id, { inAt: to, outAt: to + 2 * hour });
      await invalidateAttendanceSession(ctx, session);
    });
    await settle(f.t, session);
    const namespace = studentBuildMinutesNamespace(f.ids.season, f.ids.sid);
    const split = await f.t.run(async ctx => ({
      total: await reportAggregate.sum(ctx, { namespace }),
      beforeKickoff: await reportAggregate.sum(ctx, { namespace, bounds: { upper: { key: kickoffAt, inclusive: false } } }),
      fromKickoff: await reportAggregate.sum(ctx, { namespace, bounds: { lower: { key: kickoffAt, inclusive: true } } }),
    }));
    expect(split).toEqual({ total: 120, beforeKickoff: 120 - shown, fromKickoff: shown });
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toMatchObject({ state: "ready", meetings: { attended: 1, held: 1 }, buildHours: { state: "ready", minutes: shown } });
  });
});

describe("Build hours target", () => {
  it("lets only a Coach set whole hours from 1 to 2000 and audits each change", async () => {
    const f = await fixture();
    for (const client of [f.t, f.mentor, f.lead, f.parent, f.student]) await expect(client.mutation(api.seasonAdmin.setBuildHoursTarget, { hours: 60 })).rejects.toThrow();
    for (const hours of [0, -5, 1.5, 2001, Number.NaN, Number.POSITIVE_INFINITY]) await expect(f.coach.mutation(api.seasonAdmin.setBuildHoursTarget, { hours })).rejects.toThrow("whole hours from 1 to 2000");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.season))).not.toHaveProperty("buildHoursTarget");
    for (const hours of [1, 2000, 120]) expect(await f.coach.mutation(api.seasonAdmin.setBuildHoursTarget, { hours })).toBe(hours);
    expect(await f.coach.mutation(api.seasonAdmin.setBuildHoursTarget, { hours: 120 })).toBe(120);
    expect((await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).buildHours.targetHours).toBe(120);
    expect((await f.coach.query(api.seasonAdmin.overview, {})).source.buildHoursTarget).toBe(120);
    expect(await f.coach.mutation(api.seasonAdmin.setBuildHoursTarget, { hours: null })).toBeNull();
    expect(await f.t.run(ctx => ctx.db.get(f.ids.season))).not.toHaveProperty("buildHoursTarget");
    expect((await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).buildHours.targetHours).toBeNull();
    const audits = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "seasons").eq("entityId", f.ids.season)).take(10));
    // The repeated 120 changed nothing and wrote no audit row.
    expect(audits.map(row => [row.action, row.beforeJson, row.afterJson])).toEqual([
      ["setBuildHoursTarget", JSON.stringify({ buildHoursTarget: null }), JSON.stringify({ buildHoursTarget: 1 })],
      ["setBuildHoursTarget", JSON.stringify({ buildHoursTarget: 1 }), JSON.stringify({ buildHoursTarget: 2000 })],
      ["setBuildHoursTarget", JSON.stringify({ buildHoursTarget: 2000 }), JSON.stringify({ buildHoursTarget: 120 })],
      ["setBuildHoursTarget", JSON.stringify({ buildHoursTarget: 120 }), JSON.stringify({ buildHoursTarget: null })],
    ]);
  });
});
