/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { invalidateAttendanceSession } from "./lib/attendanceReports";

const modules = import.meta.glob("./**/*.ts");
const hour = 3_600_000;
// Competition year 2027: kickoff is Saturday, January 9, 2027 (Chicago midnight).
// 6 p.m. CDT is 23:00Z in autumn; 5 p.m. CST is 23:00Z in winter.
const at = (date: string) => Date.parse(`${date}T23:00:00Z`);
const tuesdayBeforeKickoff = at("2026-10-13"), mondayBeforeKickoff = at("2026-10-12");
const mondayAfterKickoff = at("2027-01-11"), tuesdayAfterKickoff = at("2027-01-12"), thursday = at("2027-01-14");

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "parent" | "student") {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("bd-coach", "coach"), parent = await account("bd-parent", "parent"), stranger = await account("bd-stranger", "parent");
    const student = await account("bd-student", "student"), other = await account("bd-other", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const base = { seasonId: season, legalName: "Dev Student", preferredName: "Dev", email: "dev.student@example.invalid", active: true, travelTeam: false, subteam: "Build", roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
    const sid = await ctx.db.insert("students", { ...base, userId: student.id });
    const otherSid = await ctx.db.insert("students", { ...base, legalName: "Jordan Williams", preferredName: "Jordan", email: "jordan@example.invalid", userId: other.id });
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: sid, active: true, createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { coach, parent, stranger, student, other, season, sid, otherSid };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, coach: as(ids.coach), parent: as(ids.parent), stranger: as(ids.stranger), student: as(ids.student), other: as(ids.other) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Spec = { title: string; at: number; attended?: boolean; visitMs?: number; outreachOverride?: boolean; requiredOverride?: boolean };

async function settle(f: Fixture, sessionId: Id<"timeclockSessions">) {
  for (let step = 0; step < 100; step++) {
    const row = await f.t.run(ctx => ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", sessionId)).unique());
    if (!row || row.state !== "rebuilding") return;
    await f.t.mutation(internal.attendanceReportMaintenance.continueSession, { sessionId, expectedGeneration: row.reportGeneration, expectedSessionRevision: row.sessionRevision, expectedPhase: row.phase, expectedCursor: row.cursor });
  }
  throw new Error("Attendance report did not settle.");
}

/** A closed Timeclock session projected through the real report pipeline; the fixture student attends for the full 2 hours when `attended`. */
async function meeting(f: Fixture, spec: Spec) {
  const sessionId = await f.t.run(async ctx => {
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: "manual", sourceKey: `bd-${spec.at}-${spec.title}`, title: spec.title, allDay: false, cancelled: false, observedAt: spec.at, revision: 1, needsReview: false });
    const end = spec.at + 2 * hour;
    const id = await ctx.db.insert("timeclockSessions", { seasonId: f.ids.season, occurrenceId, state: "closed", scheduledStart: spec.at, scheduledEnd: end, effectiveEnd: end, extensionMs: 0, revision: 1, openedAt: spec.at, openedBy: f.ids.coach.id, closedAt: end, needsReview: false, ...(spec.outreachOverride !== undefined ? { outreachOverride: spec.outreachOverride } : {}), ...(spec.requiredOverride !== undefined ? { requiredOverride: spec.requiredOverride } : {}) });
    if (spec.attended) await ctx.db.insert("timeclockIntervals", { sessionId: id, studentId: f.ids.sid, inAt: spec.at, outAt: spec.at + (spec.visitMs ?? 2 * hour), openedBy: f.ids.coach.id, openCommandKey: `bd-${spec.at}`, scheduleRevision: 1 });
    await invalidateAttendanceSession(ctx, id);
    return id;
  });
  await settle(f, sessionId);
  return sessionId;
}
const reportState = (f: Fixture, sessionId: Id<"timeclockSessions">) => f.t.run(ctx => ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", sessionId)).unique());
const paging = { numItems: 10, cursor: null };

describe("meeting classification", () => {
  it.each([
    { name: "Tuesday before kickoff is Required", spec: { title: "Team meeting", at: tuesdayBeforeKickoff }, required: true, outreach: false },
    { name: "Monday after kickoff is Required", spec: { title: "Team meeting", at: mondayAfterKickoff }, required: true, outreach: false },
    { name: "Tuesday after kickoff is Other", spec: { title: "Team meeting", at: tuesdayAfterKickoff }, required: false, outreach: false },
    { name: "Monday before kickoff is Other", spec: { title: "Team meeting", at: mondayBeforeKickoff }, required: false, outreach: false },
    { name: "Thursday is Other", spec: { title: "Team meeting", at: thursday }, required: false, outreach: false },
    { name: "Outreach by title is never Required", spec: { title: "Library Outreach", at: tuesdayBeforeKickoff }, required: false, outreach: true },
    { name: "Outreach marked by the Coach is never Required", spec: { title: "Team meeting", at: tuesdayBeforeKickoff, outreachOverride: true }, required: false, outreach: true },
    { name: "Coach can make a Thursday Required", spec: { title: "Team meeting", at: thursday, requiredOverride: true }, required: true, outreach: false },
    { name: "Coach can make a Tuesday Other", spec: { title: "Team meeting", at: tuesdayBeforeKickoff, requiredOverride: false }, required: false, outreach: false },
  ])("$name", async ({ spec, required, outreach }) => {
    const f = await fixture();
    expect(await reportState(f, await meeting(f, spec))).toMatchObject({ required, outreach });
  });
});

describe("attendance breakdown", () => {
  async function season(f: Fixture) {
    // 12 Required Tuesdays (every week from Sep 1); the student attends the 3 oldest and the latest.
    const week = 7 * 24 * hour, first = at("2026-09-01");
    for (let i = 0; i < 12; i++) await meeting(f, { title: `Tuesday ${i}`, at: first + i * week, attended: i < 3 || i === 11 });
    await meeting(f, { title: "Thursday work", at: thursday, attended: true });
    await meeting(f, { title: "Extra Saturday", at: at("2027-01-16") });
    await meeting(f, { title: "Park Outreach", at: at("2026-11-07"), attended: true });
    await meeting(f, { title: "Fair Outreach", at: at("2026-11-14") });
  }

  it("counts each category, keeps Home's meetings to Required only, and shares the Build-hours value", async () => {
    const f = await fixture();
    await season(f);
    const result = await f.student.query(api.dashboardReports.attendanceBreakdown, { studentId: f.ids.sid });
    expect(result).toEqual({ state: "ready", kickoffAt: Date.parse("2027-01-09T06:00:00Z"), required: { attended: 4, held: 12 }, other: { attended: 1, held: 2 }, outreach: { attended: 1, held: 2 }, buildHours: { minutes: 0, targetHours: null, weekday: { attended: 0, held: 0, minutes: 0 }, weekend: { attended: 0, held: 0, minutes: 0 } } });
    const home = await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid });
    expect(home).toMatchObject({ state: "ready", meetings: result.required, outreach: result.outreach, buildHours: { minutes: result.buildHours.minutes } });
  });

  it("pages Required meetings newest first, 10 at a time, with missed meetings detected", async () => {
    const f = await fixture();
    await season(f);
    const first = await f.parent.query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind: "required", paginationOpts: paging });
    expect(first.page).toHaveLength(10);
    expect(first.isDone).toBe(false);
    expect(first.page.map(row => row.title)).toEqual(Array.from({ length: 10 }, (_, i) => `Tuesday ${11 - i}`));
    expect(first.page[0]).toMatchObject({ status: "attended", minutes: 120 });
    expect(first.page[1]).toMatchObject({ status: "missed" });
    expect(first.page[1]).not.toHaveProperty("minutes");
    const second = await f.parent.query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind: "required", paginationOpts: { numItems: 10, cursor: first.continueCursor } });
    expect(second.page.map(row => [row.title, row.status])).toEqual([["Tuesday 1", "attended"], ["Tuesday 0", "attended"]]);
    expect(second.isDone).toBe(true);
  });

  it.each([
    { kind: "other" as const, rows: [["Extra Saturday", "missed"], ["Thursday work", "attended"]] },
    { kind: "outreach" as const, rows: [["Fair Outreach", "missed"], ["Park Outreach", "attended"]] },
  ])("lists $kind meetings by date", async ({ kind, rows }) => {
    const f = await fixture();
    await season(f);
    const result = await f.coach.query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind, paginationOpts: paging });
    expect([...result.page].sort((a, b) => a.title!.localeCompare(b.title!)).map(row => [row.title, row.status])).toEqual(rows);
  });

  it.each([
    { who: "another student", as: (f: Fixture) => f.other },
    { who: "an unlinked parent", as: (f: Fixture) => f.stranger },
  ])("refuses $who", async ({ as }) => {
    const f = await fixture();
    await season(f);
    await expect(as(f).query(api.dashboardReports.attendanceBreakdown, { studentId: f.ids.sid })).rejects.toThrow(/permission/);
    await expect(as(f).query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind: "required", paginationOpts: paging })).rejects.toThrow(/permission/);
  });

  it("lists every Build day from kickoff, including never-clocked ones, and the minutes add up to Build hours", async () => {
    const f = await fixture();
    await meeting(f, { title: "Build meeting", at: at("2026-12-15"), attended: true }); // before kickoff: not listed or counted
    await meeting(f, { title: "Build Monday", at: mondayAfterKickoff, attended: true });
    await meeting(f, { title: "Saturday build", at: at("2027-01-16") });
    await meeting(f, { title: "Sunday build", at: at("2027-01-17"), attended: true, visitMs: 30_000 });
    await meeting(f, { title: "Build Wednesday", at: at("2027-01-13"), attended: true, visitMs: 90 * 60_000 });
    await meeting(f, { title: "Thursday work", at: thursday, attended: true }); // not a Build day
    const list = await f.parent.query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind: "build", paginationOpts: paging });
    expect(list.page.map(row => [row.title, row.status, row.minutes])).toEqual([["Sunday build", "attended", 0], ["Saturday build", "missed", undefined], ["Build Wednesday", "attended", 90], ["Build Monday", "attended", 120]]);
    const home = await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid });
    const breakdown = await f.student.query(api.dashboardReports.attendanceBreakdown, { studentId: f.ids.sid });
    expect(list.page.reduce((sum, row) => sum + (row.minutes ?? 0), 0)).toBe(210);
    expect(home.buildHours.minutes).toBe(210);
    expect(breakdown.buildHours.minutes).toBe(210);
  });

  it.each([
    { name: "Monday through Friday are weekday", days: ["2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14", "2027-01-15"], weekend: false },
    { name: "Saturday and Sunday are weekend", days: ["2027-01-16", "2027-01-17"], weekend: true },
  ])("$name", async ({ days, weekend }) => {
    const f = await fixture();
    for (const day of days) await meeting(f, { title: "Build day", at: at(day), attended: true, visitMs: 60 * 60_000 });
    const list = await f.student.query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind: "build", paginationOpts: paging });
    expect(list.page.map(row => row.dayType)).toEqual(days.map(() => weekend ? "weekend" : "weekday"));
    const { weekday: wd, weekend: we, minutes } = (await f.student.query(api.dashboardReports.attendanceBreakdown, { studentId: f.ids.sid })).buildHours;
    const mine = { attended: days.length, held: days.length, minutes: days.length * 60 }, none = { attended: 0, held: 0, minutes: 0 };
    expect(wd).toEqual(weekend ? none : mine);
    expect(we).toEqual(weekend ? mine : none);
    expect(wd.minutes + we.minutes).toBe(minutes);
  });

  it("counts never-clocked Build days as held, splits minutes by day type, and feeds the team report", async () => {
    const f = await fixture();
    await meeting(f, { title: "Build Monday", at: mondayAfterKickoff, attended: true });
    await meeting(f, { title: "Build Wednesday", at: at("2027-01-13") }); // never clocked
    await meeting(f, { title: "Saturday build", at: at("2027-01-16"), attended: true, visitMs: 90 * 60_000 });
    await meeting(f, { title: "Sunday build", at: at("2027-01-17") }); // never clocked
    const { buildHours } = await f.student.query(api.dashboardReports.attendanceBreakdown, { studentId: f.ids.sid });
    expect(buildHours).toMatchObject({ minutes: 210, weekday: { attended: 1, held: 2, minutes: 120 }, weekend: { attended: 1, held: 2, minutes: 90 } });
    const team = await f.coach.query(api.teamReports.list, { paginationOpts: paging, asOf: at("2027-02-01") });
    expect(team.page.find(row => row.studentId === f.ids.sid)?.attendance).toMatchObject({ buildWeekday: 1, buildWeekdayHeld: 2, buildWeekendAttended: 1, buildWeekendHeld: 2, buildMinutes: 210, buildWeekdayMinutes: 120, buildWeekendMinutes: 90 });
    await expect(f.parent.query(api.teamReports.list, { paginationOpts: paging, asOf: at("2027-02-01") })).rejects.toThrow(/Coach or Travel Lead/);
    await expect(f.student.query(api.teamReports.list, { paginationOpts: paging, asOf: at("2027-02-01") })).rejects.toThrow(/Coach or Travel Lead/);
  });

  it("reports updating when a session has no Build flag yet", async () => {
    const f = await fixture();
    await meeting(f, { title: "Build Monday", at: mondayAfterKickoff, attended: true });
    await f.t.run(async ctx => {
      const row = await ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_build", q => q.eq("seasonId", f.ids.season).eq("build", true)).first();
      await ctx.db.patch(row!._id, { build: undefined });
    });
    expect(await f.student.query(api.dashboardReports.attendanceBreakdown, { studentId: f.ids.sid })).toMatchObject({ state: "updating" });
    expect((await f.student.query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind: "build", paginationOpts: paging })).page).toEqual([]);
  });

  it("reports updating and lists nothing while a session is not yet classified as Required", async () => {
    const f = await fixture();
    await season(f);
    await f.t.run(async ctx => {
      const row = await ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_required", q => q.eq("seasonId", f.ids.season).eq("required", true)).first();
      await ctx.db.patch(row!._id, { required: undefined });
    });
    expect(await f.student.query(api.dashboardReports.attendanceBreakdown, { studentId: f.ids.sid })).toMatchObject({ state: "updating", required: { attended: 0, held: 0 } });
    expect(await f.student.query(api.dashboardReports.homeAttendance, { studentId: f.ids.sid })).toMatchObject({ state: "updating" });
    expect((await f.student.query(api.dashboardReports.attendanceSessions, { studentId: f.ids.sid, kind: "required", paginationOpts: paging })).page).toEqual([]);
  });
});
