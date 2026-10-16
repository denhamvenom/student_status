/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Mentor attendance report", () => {
  it("keeps each student's attendance distinct when meetings are loaded once for the season", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async ctx => {
      const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
      const mentorAuth = await ctx.db.insert("users", { email: "mentor@example.invalid" });
      const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
      await ctx.db.insert("appUsers", { authUserId: mentorAuth, email: "mentor@example.invalid", name: "Mentor", role: "mentor", travelLead: false, financialEdit: false, active: true });
      const season = await ctx.db.insert("seasons", { name: "2026–27", year: 2026, status: "active", startsAt: 1, permissionVersion: "DRAFT-1", createdBy: coach });
      const first = await ctx.db.insert("students", { seasonId: season, legalName: "First Student", preferredName: "First", email: "first@example.invalid", subteam: "Mechanical", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
      const second = await ctx.db.insert("students", { seasonId: season, legalName: "Second Student", preferredName: "Second", email: "second@example.invalid", subteam: "Programming", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
      const tuesday = await ctx.db.insert("attendanceMeetings", { seasonId: season, kind: "Tuesday", startsAt: 10, cancelled: false });
      const thursday = await ctx.db.insert("attendanceMeetings", { seasonId: season, kind: "Thursday", startsAt: 20, cancelled: false });
      await ctx.db.insert("attendanceMeetings", { seasonId: season, kind: "Tuesday", startsAt: 30, cancelled: true });
      await ctx.db.insert("attendanceRecords", { meetingId: tuesday, studentId: first, present: true, recordedBy: coach });
      await ctx.db.insert("attendanceRecords", { meetingId: thursday, studentId: second, present: true, recordedBy: coach });
      return { mentorAuth, first, second };
    });

    const report = await t.withIdentity({ subject: `${ids.mentorAuth}|session1` }).query(api.app.mentorReport, {});
    expect(report).toHaveLength(2);
    expect(report.find((row: { student: { _id: string } }) => row.student._id === ids.first)?.attendance)
      .toEqual({ tuesdayHeld: 1, tuesdayAttended: 1, tuesdayPercent: 100, thursdayAttended: 0, outreachAttended: 0 });
    expect(report.find((row: { student: { _id: string } }) => row.student._id === ids.second)?.attendance)
      .toEqual({ tuesdayHeld: 1, tuesdayAttended: 0, tuesdayPercent: 0, thursdayAttended: 1, outreachAttended: 0 });
  });
});
