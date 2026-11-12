/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { FunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { invalidateAttendanceSession } from "../lib/attendanceReports";
import { weekHeader, weekKeysBetween, weekStartKey } from "../lib/sheetAttendance";
import schema from "../schema";
import { ATTENDANCE_NOT_READY, load } from "../sheetData/attendance";
import { attendanceTabs, definition, type Data } from "./attendance";

const modules = import.meta.glob("../**/*.ts");
const hour = 3_600_000;
const at = (date: string) => Date.parse(`${date}T23:00:00Z`);

describe("attendance tabs", () => {
  const data: Data = {
    held: { required: 4, other: 2, outreach: 0 },
    students: [
      { name: "Zed Student", subteam: "Programming", required: 2, other: 0, outreach: 0, totalMs: 2.5 * hour, weeks: [{ week: "2026-10-12", ms: hour }, { week: "2026-11-02", ms: 1.5 * hour }] },
      { name: "Alex Student", subteam: "Build", required: 4, other: 1, outreach: 0, totalMs: 4 * hour, weeks: [{ week: "2026-10-12", ms: 4 * hour }] },
      { name: "Bea Student", subteam: "Build", required: 1, other: 1, outreach: 0, totalMs: 0, weeks: [] },
    ],
  };
  const [summary, bySubteam, weekly] = attendanceTabs(data);

  it("lists students by name with percents and hours", () => {
    expect(attendanceTabs(data).map(tab => tab.title)).toEqual(["Summary", "By subteam", "Weekly hours"]);
    expect(summary.rows[0]).toHaveLength(12);
    expect(summary.rows.slice(1).map(row => row.slice(0, 5))).toEqual([["Alex Student", "Build", 4, 4, 100], ["Bea Student", "Build", 1, 4, 25], ["Zed Student", "Programming", 2, 4, 50]]);
    expect(summary.rows[1].slice(5)).toEqual([1, 2, 50, 0, 0, "", 4]);
  });
  it("rolls up each subteam from sums, with average hours per student", () => {
    expect(bySubteam.rows[1]).toEqual(["Build", 2, 5, 8, 62.5, 2, 4, 50, 0, 0, "", 4, 2]);
    expect(bySubteam.rows[2].slice(0, 3)).toEqual(["Programming", 1, 2]);
    expect(bySubteam.rows[2].slice(-2)).toEqual([2.5, 2.5]);
  });
  it("gives every week between the first and last a column, even with no meetings", () => {
    expect(weekly.rows[0]).toEqual(["Student", "Subteam", "Week of Oct 12, 2026", "Week of Oct 19, 2026", "Week of Oct 26, 2026", "Week of Nov 2, 2026"]);
    expect(weekly.rows[3]).toEqual(["Zed Student", "Programming", 1, 0, 0, 1.5]);
  });
  it("still builds with no students", () => {
    expect(attendanceTabs({ held: { required: 0, other: 0, outreach: 0 }, students: [] }).map(tab => tab.rows.length)).toEqual([1, 1, 1]);
  });
  it("is a ready General team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["general", "team", true, "Attendance - Synthetic 2027"]);
  });
});

describe("Chicago weeks", () => {
  it.each([
    { name: "Sunday night before the fall-back change stays in its week", ms: Date.parse("2026-11-02T05:30:00Z"), week: "2026-10-26" },
    { name: "Monday just after midnight starts the next week", ms: Date.parse("2026-11-02T06:30:00Z"), week: "2026-11-02" },
    { name: "Sunday night before spring-forward", ms: Date.parse("2027-03-15T03:00:00Z"), week: "2027-03-08" },
    { name: "Monday just after spring-forward midnight", ms: Date.parse("2027-03-15T05:10:00Z"), week: "2027-03-15" },
    { name: "a Tuesday 6 p.m. meeting", ms: at("2026-10-13"), week: "2026-10-12" },
  ])("$name", ({ ms, week }) => expect(weekStartKey(ms)).toBe(week));
  it("fills Mondays across a daylight-saving change and across years", () => {
    expect(weekKeysBetween("2027-03-01", "2027-03-22")).toEqual(["2027-03-01", "2027-03-08", "2027-03-15", "2027-03-22"]);
    expect(weekHeader("2026-12-28")).toBe("Week of Dec 28, 2026");
  });
});

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student") {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("sa-coach", "coach");
    const mentor = await account("sa-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026-27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const base = { seasonId: season, active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
    const student = async (name: string, subteam: string, active = true) => {
      const user = await account(`sa-${name}`, "student");
      const id = await ctx.db.insert("students", { ...base, active, legalName: `${name} Student`, preferredName: name, email: `${name}@example.invalid`, subteam, userId: user.id });
      return { id, auth: user.auth };
    };
    const dev = await student("Dev", "Build"), jo = await student("Jo", "Programming"), gone = await student("Gone", "Build", false);
    const backfill = await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { coach, mentor, season, dev, jo, gone, backfill };
  });
  return { t, ids, as: (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` }) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function meeting(f: Fixture, spec: { title: string; at: number; visits?: { student: Id<"students">; ms: number }[] }) {
  const sessionId = await f.t.run(async ctx => {
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: "manual", sourceKey: `sa-${spec.at}-${spec.title}`, title: spec.title, allDay: false, cancelled: false, observedAt: spec.at, revision: 1, needsReview: false });
    const end = spec.at + 2 * hour;
    const id = await ctx.db.insert("timeclockSessions", { seasonId: f.ids.season, occurrenceId, state: "closed", scheduledStart: spec.at, scheduledEnd: end, effectiveEnd: end, extensionMs: 0, revision: 1, openedAt: spec.at, openedBy: f.ids.coach.id, closedAt: end, needsReview: false });
    for (const visit of spec.visits ?? []) await ctx.db.insert("timeclockIntervals", { sessionId: id, studentId: visit.student, inAt: spec.at, outAt: spec.at + visit.ms, openedBy: f.ids.coach.id, openCommandKey: `sa-${spec.at}-${visit.student}`, scheduleRevision: 1 });
    await invalidateAttendanceSession(ctx, id);
    return id;
  });
  for (let step = 0; step < 100; step++) {
    const row = await f.t.run(ctx => ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", sessionId)).unique());
    if (!row || row.state !== "rebuilding") return;
    await f.t.mutation(internal.attendanceReportMaintenance.continueSession, { sessionId, expectedGeneration: row.reportGeneration, expectedSessionRevision: row.sessionRevision, expectedPhase: row.phase, expectedCursor: row.cursor });
  }
  throw new Error("Attendance report did not settle.");
}

/** The loader only needs runQuery; route it to the test database. */
const loadFrom = (f: Fixture) => load({ runQuery: (ref: FunctionReference<"query", "internal">, args: Record<string, unknown>) => f.t.query(ref, args) } as unknown as ActionCtx, { seasonId: f.ids.season, eventId: null });

async function season(f: Fixture) {
  const { dev, jo, gone } = f.ids;
  // Required Tuesdays (before kickoff), Dev attends 2 for 2 hours, Jo one for 30 minutes (does not qualify), the inactive student one.
  await meeting(f, { title: "Tuesday A", at: at("2026-10-13"), visits: [{ student: dev.id, ms: 2 * hour }, { student: gone.id, ms: 2 * hour }] });
  await meeting(f, { title: "Tuesday B", at: at("2026-10-20"), visits: [{ student: dev.id, ms: 2 * hour }, { student: jo.id, ms: 30 * 60_000 }] });
  await meeting(f, { title: "Tuesday C", at: at("2026-10-27") });
  await meeting(f, { title: "Thursday work", at: at("2026-11-05"), visits: [{ student: jo.id, ms: 2 * hour }] });
  await meeting(f, { title: "Park Outreach", at: at("2026-11-07"), visits: [{ student: dev.id, ms: 2 * hour }] });
}

describe("attendance data", () => {
  it("matches the app's attendance breakdown, counts only active students, and sums clocked hours", async () => {
    const f = await fixture();
    await season(f);
    const data = await loadFrom(f);
    expect(data.students.map(student => student.name).sort()).toEqual(["Dev Student", "Jo Student"]);
    for (const [who, studentId, name] of [[f.ids.dev, f.ids.dev.id, "Dev Student"], [f.ids.jo, f.ids.jo.id, "Jo Student"]] as const) {
      const breakdown = await f.as(who).query(api.dashboardReports.attendanceBreakdown, { studentId });
      const row = data.students.find(student => student.name === name)!;
      expect(breakdown.state).toBe("ready");
      expect([row.required, row.other, row.outreach]).toEqual([breakdown.required.attended, breakdown.other.attended, breakdown.outreach.attended]);
      expect(data.held).toEqual({ required: breakdown.required.held, other: breakdown.other.held, outreach: breakdown.outreach.held });
    }
    expect(data.held).toEqual({ required: 3, other: 1, outreach: 1 });
    const dev = data.students.find(student => student.name === "Dev Student")!, jo = data.students.find(student => student.name === "Jo Student")!;
    expect([dev.required, dev.outreach, dev.totalMs]).toEqual([2, 1, 6 * hour]);
    expect([jo.required, jo.other, jo.totalMs]).toEqual([0, 1, 2.5 * hour]);
    expect(Object.fromEntries(dev.weeks.map(week => [week.week, week.ms]))).toEqual({ "2026-10-12": 2 * hour, "2026-10-19": 2 * hour, "2026-11-02": 2 * hour });
    const [summary] = attendanceTabs(data);
    expect(summary.rows.map(row => row[0])).toEqual(["Student", "Dev Student", "Jo Student"]);
  });

  it.each([
    { name: "a failed backfill", state: "failed" as const },
    { name: "a backfill still running", state: "running" as const },
  ])("keeps the last file while attendance is updating ($name)", async ({ state }) => {
    const f = await fixture();
    await season(f);
    await f.t.run(ctx => ctx.db.patch(f.ids.backfill, { state }));
    await expect(loadFrom(f)).rejects.toThrow(ATTENDANCE_NOT_READY);
    expect(ATTENDANCE_NOT_READY).toBe("Attendance is updating, so its spreadsheet kept the last numbers. Try again in a few minutes.");
  });
});
