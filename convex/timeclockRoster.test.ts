/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
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
    return { coach, mentor, student, parent, inactive, unreviewed, z, meeting };
  });
  const as = (id: typeof ids.coach) => t.withIdentity({ subject: `${id.auth}|test` });
  return { t, ids, coach: as(ids.coach), mentor: as(ids.mentor), student: as(ids.student), parent: as(ids.parent), inactive: as(ids.inactive) };
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
});
