/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function user(role: "coach" | "mentor" | "student" | "parent", active = true) {
      const auth = await ctx.db.insert("users", { email: `${role}-${active}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, email: `${role}-${active}@example.invalid`, name: "Synthetic", role, active, travelLead: role !== "coach", financialEdit: false });
      return { auth, id };
    }
    const coach = await user("coach"), mentor = await user("mentor"), student = await user("student"), parent = await user("parent"), inactive = await user("mentor", false);
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.id });
    const archived = await ctx.db.insert("seasons", { name: "Archived", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.id });
    async function studentRow(firstName: string, lastName: string, subteam: string, reviewed = true, seasonId = season, active = true) {
      return ctx.db.insert("students", { seasonId, legalName: `${firstName} ${lastName}`, firstName, lastName, structuredNameReviewed: reviewed, preferredName: firstName, email: "synthetic@example.invalid", subteam, active, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    }
    const z = await studentRow("Zoe", "Zebra", "Build");
    await studentRow("Alex", "Adams", "Build");
    await studentRow("Alex", "Avery", "Code");
    await studentRow("Sam", "Stone", "Build");
    await studentRow("Sam", "Smith", "Build");
    const unreviewed = await studentRow("Legacy", "Uncertain", "", false);
    await studentRow("Past", "Person", "", true, archived);
    await studentRow("Inactive", "Person", "", true, season, false);
    const meeting = await ctx.db.insert("attendanceMeetings", { seasonId: season, kind: "Tuesday", startsAt: 0, cancelled: false });
    return { coach, mentor, student, parent, inactive, unreviewed, z, meeting, season, archived };
  });
  const as = (id: typeof ids.coach) => t.withIdentity({ subject: `${id.auth}|test` });
  return { t, ids, coach: as(ids.coach), mentor: as(ids.mentor), student: as(ids.student), parent: as(ids.parent), inactive: as(ids.inactive) };
}

async function sessionFixture(f: Awaited<ReturnType<typeof fixture>>) {
  return await f.t.run(async ctx => {
    const start = Date.now() - 60_000;
    const end = start + 2 * 60 * 60_000;
    const first = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: "manual", sourceKey: "roster-first", title: "First", allDay: false, scheduledStart: start, scheduledEnd: end, cancelled: false, observedAt: start, revision: 1, needsReview: false });
    const second = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: "manual", sourceKey: "roster-second", title: "Second", allDay: false, scheduledStart: start, scheduledEnd: end, cancelled: false, observedAt: start, revision: 1, needsReview: false });
    const base = { seasonId: f.ids.season, state: "open" as const, scheduledStart: start, scheduledEnd: end, effectiveEnd: end, extensionMs: 0, revision: 1, openedAt: start, openedBy: f.ids.coach.id, needsReview: false };
    const a = await ctx.db.insert("timeclockSessions", { ...base, occurrenceId: first });
    const b = await ctx.db.insert("timeclockSessions", { ...base, occurrenceId: second });
    return { a, b };
  });
}

describe("Timeclock roster and attendance boundary", () => {
  it("returns surname-sorted minimized names and only uses subteam for duplicates", async () => {
    const f = await fixture();
    const roster = await f.mentor.query(api.timeclockRoster.list, {});
    expect(roster.unreviewedCount).toBe(1);
    expect(roster.students.map(s => s.displayName)).toEqual(["Alex A.", "Alex A.", "Sam S.", "Sam S.", "Zoe Z."]);
    expect(roster.students.map(s => s.subteam)).toEqual(["Build", "Code", "Build", "Build", null]);
    expect(roster.students.map(s => s.collision)).toEqual([false, false, true, true, false]);
    expect(Object.keys(roster.students[0]).sort()).toEqual(["collision", "displayName", "studentId", "subteam"]);
    for (const denied of [f.student, f.parent, f.inactive, f.t]) await expect(denied.query(api.timeclockRoster.list, {})).rejects.toThrow();
  });
  it("requires an explicit Coach name review and keeps it auditable", async () => {
    const f = await fixture();
    const args = { studentId: f.ids.unreviewed, firstName: "Legacy", lastName: "Reviewed", reason: "Synthetic review against source" };
    await expect(f.mentor.query(api.timeclockRoster.namesForReview, {})).rejects.toThrow("Coach-only");
    await expect(f.mentor.mutation(api.timeclockRoster.reviewNames, args)).rejects.toThrow("Coach-only");
    await expect(f.coach.mutation(api.timeclockRoster.reviewNames, { ...args, reason: " " })).rejects.toThrow();
    await f.coach.mutation(api.timeclockRoster.reviewNames, args);
    expect((await f.mentor.query(api.timeclockRoster.list, {})).unreviewedCount).toBe(0);
    const auditRows = await f.t.run(ctx => ctx.db.query("audit").take(2));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("reviewStructuredName");
  });
  it("removes the legacy Travel Lead attendance-write bypass", async () => {
    const f = await fixture();
    const args = { meetingId: f.ids.meeting, studentId: f.ids.z, present: true };
    await expect(f.mentor.mutation(api.admin.recordAttendance, args)).rejects.toThrow("Coach-only");
    await f.coach.mutation(api.admin.recordAttendance, args);
    expect((await f.t.run(ctx => ctx.db.query("attendanceRecords").take(2)))).toHaveLength(1);
    expect((await f.t.run(ctx => ctx.db.query("timeclockIntervals").take(1)))).toHaveLength(0);
  });

  it("exposes minimized reviewed-student status only to active operators in the active season", async () => {
    const f = await fixture();
    const sessions = await sessionFixture(f);
    const status = await f.mentor.query(api.timeclockRoster.clockStatus, { sessionId: sessions.a });
    expect(status).toMatchObject({ sessionId: sessions.a, state: "open", revision: 1 });
    expect(status.students).toHaveLength(5);
    expect(status.students.find(s => s.studentId === f.ids.unreviewed)).toBeUndefined();
    expect(status.students.every(s => s.status === "no_activity" && s.activeSessionId === null && s.activeIntervalId === null && !s.hasConflict)).toBe(true);
    expect(Object.keys(status.students[0]).sort()).toEqual(["activeIntervalId", "activeSessionId", "hasConflict", "status", "studentId"]);
    expect(JSON.stringify(status)).not.toContain("synthetic@example.invalid");
    for (const denied of [f.student, f.parent, f.inactive, f.t]) await expect(denied.query(api.timeclockRoster.clockStatus, { sessionId: sessions.a })).rejects.toThrow();
    const archivedSession = await f.t.run(async ctx => {
      const occurrence = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.archived, source: "manual", sourceKey: "roster-archived", title: "Archive", allDay: false, scheduledStart: 0, scheduledEnd: 1000, cancelled: false, observedAt: 0, revision: 1, needsReview: false });
      return await ctx.db.insert("timeclockSessions", { occurrenceId: occurrence, seasonId: f.ids.archived, state: "closed", scheduledStart: 0, scheduledEnd: 1000, effectiveEnd: 1000, extensionMs: 0, revision: 2, openedAt: 0, openedBy: f.ids.coach.id, closedAt: 1000, needsReview: false });
    });
    await expect(f.coach.query(api.timeclockRoster.clockStatus, { sessionId: archivedSession })).rejects.toThrow("active season");
  });

  it("distinguishes selected activity, prior checkout, and another event conflict", async () => {
    const f = await fixture();
    const sessions = await sessionFixture(f);
    const row = async () => (await f.coach.query(api.timeclockRoster.clockStatus, { sessionId: sessions.a })).students.find(s => s.studentId === f.ids.z)!;
    expect((await row()).status).toBe("no_activity");
    expect((await f.coach.mutation(api.timeclock.clockGroup, { sessionId: sessions.a, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.z, intervalId: null }], key: "roster-clock-in-001" })).ok).toBe(true);
    const inside = await row();
    expect(inside).toMatchObject({ status: "in", activeSessionId: sessions.a, hasConflict: false });
    expect(inside.activeIntervalId).not.toBeNull();
    expect((await f.coach.mutation(api.timeclock.clockGroup, { sessionId: sessions.a, mode: "out", expectedRevision: 1, expected: [{ studentId: f.ids.z, intervalId: inside.activeIntervalId }], key: "roster-clock-out-01" })).ok).toBe(true);
    expect(await row()).toMatchObject({ status: "out", activeSessionId: null, activeIntervalId: null, hasConflict: false });
    expect((await f.coach.mutation(api.timeclock.clockGroup, { sessionId: sessions.b, mode: "in", expectedRevision: 1, expected: [{ studentId: f.ids.z, intervalId: null }], key: "roster-other-in-001" })).ok).toBe(true);
    expect(await row()).toMatchObject({ status: "out", activeSessionId: sessions.b, hasConflict: true });
  });

  it("ignores stale pointers and closed sessions as active conflicts", async () => {
    const f = await fixture();
    const sessions = await sessionFixture(f);
    const interval = await f.t.run(async ctx => {
      const id = await ctx.db.insert("timeclockIntervals", { sessionId: sessions.a, studentId: f.ids.z, inAt: 10, outAt: 20, openedBy: f.ids.coach.id, openCommandKey: "synthetic", scheduleRevision: 1 });
      await ctx.db.insert("timeclockStudentLocks", { studentId: f.ids.z, sessionId: sessions.a, intervalId: id });
      return id;
    });
    const row = async () => (await f.coach.query(api.timeclockRoster.clockStatus, { sessionId: sessions.a })).students.find(s => s.studentId === f.ids.z)!;
    expect(await row()).toMatchObject({ status: "out", activeSessionId: null, activeIntervalId: null, hasConflict: false });
    await f.t.run(async ctx => { await ctx.db.patch(interval, { outAt: undefined }); await ctx.db.patch(sessions.a, { state: "closed", closedAt: 30 }); });
    expect(await row()).toMatchObject({ status: "out", activeSessionId: null, activeIntervalId: null, hasConflict: false });
  });

  it("keeps corrected attendance separate from operational clock status", async () => {
    const f = await fixture();
    const sessions = await sessionFixture(f);
    await f.t.run(async ctx => {
      await ctx.db.patch(sessions.a, { state: "closed", closedAt: Date.now() });
      await ctx.db.insert("timeclockCorrections", { sessionId: sessions.a, studentId: f.ids.z, kind: "add", inAt: 10, outAt: 70, reason: "Synthetic missing visit", actorId: f.ids.coach.id, at: 80, commandKey: "synthetic-correction" });
    });
    const row = (await f.coach.query(api.timeclockRoster.clockStatus, { sessionId: sessions.a })).students.find(s => s.studentId === f.ids.z);
    expect(row).toMatchObject({ status: "no_activity", activeSessionId: null, activeIntervalId: null, hasConflict: false });
  });
});
