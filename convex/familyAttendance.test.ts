/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const familyQuery = makeFunctionReference<"query", { studentId: Id<"students">; asOf: number }>("familyAttendance:forStudent");
const HOUR = 60 * 60_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth: Record<string, Id<"users">> = {};
    const users: Record<string, Id<"appUsers">> = {};
    for (const role of ["coach", "mentor", "parent", "student", "otherStudent"] as const) {
      auth[role] = await ctx.db.insert("users", { email: `${role}@synthetic.example`, name: role });
      users[role] = await ctx.db.insert("appUsers", { authUserId: auth[role], email: `${role}@synthetic.example`, name: role, role: role === "otherStudent" ? "student" : role, travelLead: role === "mentor", financialEdit: false, active: true });
    }
    const season = await ctx.db.insert("seasons", { name: "Active", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: users.coach });
    const oldSeason = await ctx.db.insert("seasons", { name: "Archived", year: 2025, status: "archived", startsAt: 0, endsAt: 1, permissionVersion: "test", createdBy: users.coach });
    const studentBase = { legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@synthetic.example", subteam: "Test", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "reported" as const, text: "PRIVATE HEALTH" }, medications: { state: "none" as const } };
    const student = await ctx.db.insert("students", { ...studentBase, seasonId: season, userId: users.student });
    const other = await ctx.db.insert("students", { ...studentBase, seasonId: season, userId: users.otherStudent, email: "other@synthetic.example", preferredName: "Other" });
    const archived = await ctx.db.insert("students", { ...studentBase, seasonId: oldSeason, email: "archived@synthetic.example" });
    const link = await ctx.db.insert("familyLinks", { parentUserId: users.parent, studentId: student, active: true, createdBy: users.coach });
    const start = 2 * HOUR;
    const occurrence = await ctx.db.insert("timeclockOccurrences", { seasonId: season, source: "manual", sourceKey: "family-synthetic", title: "Practice", allDay: false, scheduledStart: start, scheduledEnd: start + 2 * HOUR, cancelled: false, observedAt: start, revision: 1, needsReview: false });
    const session = await ctx.db.insert("timeclockSessions", { occurrenceId: occurrence, seasonId: season, state: "closed", scheduledStart: start, scheduledEnd: start + 2 * HOUR, effectiveEnd: start + 3 * HOUR, extensionMs: HOUR, revision: 1, openedAt: start, openedBy: users.coach, closedAt: start + 3 * HOUR, needsReview: false });
    return { auth, users, season, oldSeason, student, other, archived, link, start, session };
  });
  const as = (role: keyof typeof ids.auth) => t.withIdentity({ subject: `${ids.auth[role]}|test` });
  return { t, ids, as };
}

describe("family attendance", () => {
  it("allows only the owning student or an active linked parent, not a Mentor with Travel access", async () => {
    const f = await fixture();
    const args = { studentId: f.ids.student, asOf: 10 * HOUR };
    expect((await f.as("student").query(familyQuery, args)).studentId).toBe(f.ids.student);
    expect((await f.as("parent").query(familyQuery, args)).studentId).toBe(f.ids.student);
    await expect(f.as("otherStudent").query(familyQuery, args)).rejects.toThrow("permission");
    await expect(f.as("mentor").query(familyQuery, args)).rejects.toThrow("permission");
    await expect(f.as("coach").query(familyQuery, args)).rejects.toThrow("permission");
    await expect(f.as("parent").query(familyQuery, { ...args, studentId: f.ids.other })).rejects.toThrow("permission");
    await f.t.run(ctx => ctx.db.patch(f.ids.link, { active: false }));
    await expect(f.as("parent").query(familyQuery, args)).rejects.toThrow("permission");
    await expect(f.as("student").query(familyQuery, { ...args, studentId: f.ids.archived })).rejects.toThrow("active season");
    await expect(f.as("student").query(familyQuery, { ...args, asOf: Number.POSITIVE_INFINITY })).rejects.toThrow("valid attendance date");
  });

  it("shows corrected own-session totals matching Coach summary without private evidence", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const original = await ctx.db.insert("timeclockIntervals", { sessionId: f.ids.session, studentId: f.ids.student, inAt: f.ids.start - HOUR / 2, outAt: f.ids.start + HOUR / 2, openedBy: f.ids.users.coach, openCommandKey: "seed", scheduleRevision: 1 });
      await ctx.db.insert("timeclockCorrections", { sessionId: f.ids.session, studentId: f.ids.student, originalIntervalId: original, kind: "replace", inAt: f.ids.start - HOUR / 2, outAt: f.ids.start + HOUR + HOUR / 2, reason: "PRIVATE AUDIT REASON", actorId: f.ids.users.coach, at: 7 * HOUR, commandKey: "fix" });
      await ctx.db.insert("timeclockIntervals", { sessionId: f.ids.session, studentId: f.ids.other, inAt: f.ids.start, outAt: f.ids.start + HOUR, openedBy: f.ids.users.coach, openCommandKey: "other", scheduleRevision: 1 });
    });
    const family = await f.as("student").query(familyQuery, { studentId: f.ids.student, asOf: 10 * HOUR });
    const coach = await f.as("coach").query(api.timeclock.summary, { sessionId: f.ids.session, studentId: f.ids.student, asOf: 10 * HOUR });
    expect(family.timed.sessions).toHaveLength(1);
    expect(family.timed.sessions[0]).toMatchObject({ totalMs: 2 * HOUR, earlyMs: HOUR / 2, scheduledMs: 1.5 * HOUR, extendedMs: 0, qualifies: true });
    expect(family.timed.sessions[0].scheduledMs).toBe(coach?.scheduledMs);
    expect(family.timed.sessions[0].qualifies).toBe(coach?.qualifies);
    const json = JSON.stringify(family);
    for (const secret of ["PRIVATE AUDIT REASON", "PRIVATE HEALTH", "Other", "actorId", "openedBy", "originalIntervalId", "reason", "allergies"]) expect(json).not.toContain(secret);
  });

  it("keeps add-only, split, voided, and cancelled evidence visible and excludes early or extension time from qualification", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const first = await ctx.db.insert("timeclockCorrections", { sessionId: f.ids.session, studentId: f.ids.student, kind: "add", inAt: f.ids.start - HOUR / 2, outAt: f.ids.start + HOUR / 2, reason: "first", actorId: f.ids.users.coach, at: 6 * HOUR, commandKey: "add1" });
      await ctx.db.insert("timeclockCorrections", { sessionId: f.ids.session, studentId: f.ids.student, kind: "add", inAt: f.ids.start + HOUR, outAt: f.ids.start + 1.5 * HOUR, reason: "second", actorId: f.ids.users.coach, at: 6 * HOUR + 1, commandKey: "add2" });
      const future = await ctx.db.insert("timeclockCorrections", { sessionId: f.ids.session, studentId: f.ids.student, kind: "add", inAt: f.ids.start + 2 * HOUR, outAt: f.ids.start + 3 * HOUR, reason: "extension", actorId: f.ids.users.coach, at: 6 * HOUR + 2, commandKey: "add3" });
      await ctx.db.insert("timeclockCorrections", { sessionId: f.ids.session, studentId: f.ids.student, targetCorrectionId: future, kind: "void", reason: "void", actorId: f.ids.users.coach, at: 6 * HOUR + 3, commandKey: "void" });
      void first;
    });
    const family = await f.as("parent").query(familyQuery, { studentId: f.ids.student, asOf: 10 * HOUR });
    expect(family.timed.sessions).toHaveLength(1);
    expect(family.timed.sessions[0]).toMatchObject({ intervalCount: 2, totalMs: 1.5 * HOUR, scheduledMs: HOUR, longestScheduledMs: HOUR / 2, qualifies: false });
    await f.t.run(ctx => ctx.db.patch(f.ids.session, { state: "cancelled" }));
    const cancelled = await f.as("parent").query(familyQuery, { studentId: f.ids.student, asOf: 10 * HOUR });
    expect(cancelled.timed.sessions[0]).toMatchObject({ state: "cancelled", qualifies: false });
  });

  it("separates legacy counts and excludes cancelled or future meetings", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const first = await ctx.db.insert("attendanceMeetings", { seasonId: f.ids.season, kind: "Tuesday", startsAt: HOUR, cancelled: false });
      const cancelled = await ctx.db.insert("attendanceMeetings", { seasonId: f.ids.season, kind: "Tuesday", startsAt: HOUR, cancelled: true });
      const future = await ctx.db.insert("attendanceMeetings", { seasonId: f.ids.season, kind: "Tuesday", startsAt: 20 * HOUR, cancelled: false });
      for (const meetingId of [first, cancelled, future]) await ctx.db.insert("attendanceRecords", { meetingId, studentId: f.ids.student, present: true, recordedBy: f.ids.users.coach });
    });
    const result = await f.as("student").query(familyQuery, { studentId: f.ids.student, asOf: 10 * HOUR });
    expect(result.legacy).toMatchObject({ label: "Legacy meeting records", tuesdayHeld: 1, tuesdayAttended: 1, tuesdayPercent: 100 });
    expect(result.timed).toMatchObject({ label: "Verified clock sessions", sessions: [] });
  });

  it("matches Coach when a persisted exit extends beyond a later shortened effective end", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.session, { effectiveEnd: f.ids.start + HOUR });
      await ctx.db.insert("timeclockIntervals", { sessionId: f.ids.session, studentId: f.ids.student, inAt: f.ids.start, outAt: f.ids.start + 1.5 * HOUR, openedBy: f.ids.users.coach, openCommandKey: "late-calendar-change", scheduleRevision: 1 });
    });
    const family = await f.as("student").query(familyQuery, { studentId: f.ids.student, asOf: 10 * HOUR });
    const coach = await f.as("coach").query(api.timeclock.summary, { sessionId: f.ids.session, studentId: f.ids.student, asOf: 10 * HOUR });
    expect(family.timed.sessions[0].totalMs).toBe(1.5 * HOUR);
    expect(family.timed.sessions[0].totalMs).toBe(coach?.totalMs);
  });

  it("shows provisional open time only through the supplied asOf and bounds an unfinished interval by effectiveEnd", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.session, { state: "open", closedAt: undefined });
      await ctx.db.insert("timeclockIntervals", { sessionId: f.ids.session, studentId: f.ids.student, inAt: f.ids.start, openedBy: f.ids.users.coach, openCommandKey: "open", scheduleRevision: 1 });
    });
    const early = await f.as("student").query(familyQuery, { studentId: f.ids.student, asOf: f.ids.start + HOUR / 2 });
    expect(early.timed.sessions[0]).toMatchObject({ state: "open", totalMs: HOUR / 2, qualifies: false });
    const late = await f.as("student").query(familyQuery, { studentId: f.ids.student, asOf: 10 * HOUR });
    expect(late.timed.sessions[0].totalMs).toBe(3 * HOUR);
    expect(late.timed.sessions[0].extendedMs).toBe(HOUR);
  });

  it("fails closed when selected-student clock history exceeds its source bound", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 501; i++) await ctx.db.insert("timeclockCorrections", { sessionId: f.ids.session, studentId: f.ids.student, kind: "add", inAt: f.ids.start + i, outAt: f.ids.start + i + 1, reason: "synthetic", actorId: f.ids.users.coach, at: i, commandKey: `bound-${i}` });
    });
    await expect(f.as("student").query(familyQuery, { studentId: f.ids.student, asOf: 10 * HOUR })).rejects.toThrow("review limit");
  });
});
