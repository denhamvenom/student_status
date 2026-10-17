/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { currentSeasonOwnStudent } from "./lib/seasonIdentity";

const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid" });
    const studentAuth = await ctx.db.insert("users", { email: "student@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const parent = await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const studentUser = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
    const oldSeason = await ctx.db.insert("seasons", { name: "Old", year: 2026, status: "archived", startsAt: 0, permissionVersion: "draft", createdBy: coach });
    const currentSeason = await ctx.db.insert("seasons", { name: "Current", year: 2027, status: "active", startsAt: 1, permissionVersion: "draft", createdBy: coach });
    const oldStudent = await ctx.db.insert("students", { seasonId: oldSeason, userId: studentUser, legalName: "Old Profile", preferredName: "Old", email: "student@example.invalid", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const currentStudent = await ctx.db.insert("students", { seasonId: currentSeason, userId: studentUser, legalName: "Current Profile", preferredName: "Current", email: "student@example.invalid", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    return { coachAuth, parentAuth, studentAuth, coach, parent, studentUser, oldSeason, currentSeason, oldStudent, currentStudent };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }), student: t.withIdentity({ subject: `${ids.studentAuth}|session` }) };
}

describe("active-season identity and Parent links", () => {
  it("selects the current profile despite a same-account historical profile and denies wrong roles/inactive rows", async () => {
    const f = await fixture();
    expect((await f.student.query(currentSeasonOwnStudent))._id).toBe(f.ids.currentStudent);
    await expect(f.parent.query(currentSeasonOwnStudent)).rejects.toThrow("permission");
    await f.t.run(ctx => ctx.db.patch(f.ids.currentStudent, { active: false }));
    await expect(f.student.query(currentSeasonOwnStudent)).rejects.toThrow("No active student profile");
  });

});
