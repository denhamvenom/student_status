/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", active = true, travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid`, name });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, active, travelLead, financialEdit: false });
      return { auth, id };
    }
    const coach = await account("workspace-coach", "coach");
    const mentor = await account("workspace-mentor", "mentor");
    const lead = await account("workspace-lead", "mentor", true, true);
    const studentUser = await account("workspace-student", "student");
    const parent = await account("workspace-parent", "parent");
    const inactive = await account("workspace-inactive", "coach", false);
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.id });
    const oldSeason = await ctx.db.insert("seasons", { name: "Archived", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.id });
    async function studentRow(name: string, seasonId: typeof season, active = true) {
      return ctx.db.insert("students", { seasonId, legalName: name, preferredName: name, email: `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid`, subteam: "Private Subteam", active, travelTeam: false, roomCategoryLocked: false, allergies: { state: "reported", text: "PRIVATE HEALTH" }, medications: { state: "unknown" } });
    }
    const alpha = await studentRow("Alpha Student", season);
    const inactiveStudent = await studentRow("Inactive Student", season, false);
    const old = await studentRow("Archived Student", oldSeason);
    async function sessionRow(title: string, seasonId: typeof season, start: number) {
      const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId, source: "manual", sourceKey: title, title, allDay: false, scheduledStart: start, scheduledEnd: start + 1000, cancelled: false, observedAt: start, revision: 1, needsReview: false });
      return ctx.db.insert("timeclockSessions", { occurrenceId, seasonId, state: "open", scheduledStart: start, scheduledEnd: start + 1000, effectiveEnd: start + 1000, extensionMs: 0, revision: 1, openedAt: start, openedBy: coach.id, needsReview: false });
    }
    const older = await sessionRow("Active older event", season, 1000);
    const newer = await sessionRow("Active newer event", season, 2000);
    const archivedSession = await sessionRow("PRIVATE archived event", oldSeason, 3000);
    return { coach, mentor, lead, studentUser, parent, inactive, season, oldSeason, alpha, inactiveStudent, old, older, newer, archivedSession };
  });
  const as = (account: typeof ids.coach) => t.withIdentity({ subject: `${account.auth}|session` });
  return { t, ids, coach: as(ids.coach), mentor: as(ids.mentor), lead: as(ids.lead), student: as(ids.studentUser), parent: as(ids.parent), inactive: as(ids.inactive) };
}

describe("Coach attendance workspace selectors", () => {
  it("denies Mentor, Travel Lead, student, parent, inactive Coach, and unauthenticated requests", async () => {
    const f = await fixture();
    for (const denied of [f.mentor, f.lead, f.student, f.parent, f.inactive, f.t]) await expect(denied.query(api.attendanceOperations.workspace, {})).rejects.toThrow();
    expect(await f.coach.query(api.attendanceOperations.workspace, {})).toBeTruthy();
  });

  it("returns only current-season students and sessions with the declared minimized fields", async () => {
    const f = await fixture();
    const workspace = await f.coach.query(api.attendanceOperations.workspace, {});
    expect(workspace.students.map(student => student.studentId)).toEqual([f.ids.alpha, f.ids.inactiveStudent]);
    expect(workspace.students.find(student => student.studentId === f.ids.inactiveStudent)?.active).toBe(false);
    expect(workspace.sessions.map(session => session.sessionId)).toEqual([f.ids.newer, f.ids.older]);
    expect(workspace.sessions.map(session => session.title)).toEqual(["Active newer event", "Active older event"]);
    expect(Object.keys(workspace.students[0]).sort()).toEqual(["active", "name", "studentId"]);
    expect(Object.keys(workspace.sessions[0]).sort()).toEqual(["effectiveEnd", "needsReview", "scheduledEnd", "scheduledStart", "sessionId", "state", "title"]);
    const text = JSON.stringify(workspace);
    expect(text).not.toContain("PRIVATE HEALTH");
    expect(text).not.toContain("Private Subteam");
    expect(text).not.toContain("Archived Student");
    expect(text).not.toContain("PRIVATE archived event");
  });

  it("fails closed instead of truncating a workspace above the student limit", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let index = 0; index < 499; index++) await ctx.db.insert("students", { seasonId: f.ids.season, legalName: `Synthetic ${index}`, preferredName: `Synthetic ${index}`, email: `synthetic-${index}@example.invalid`, subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    });
    await expect(f.coach.query(api.attendanceOperations.workspace, {})).rejects.toThrow("Too many students or meetings");
  });
});
