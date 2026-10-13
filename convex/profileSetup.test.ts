/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const studentAuth = await ctx.db.insert("users", { email: "student@example.invalid" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const studentUser = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
    const parentUser = await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Test", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser, legalName: "Student Example", preferredName: "Student", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const link = await ctx.db.insert("familyLinks", { studentId: student, parentUserId: parentUser, active: true, createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Trip", type: "Team", startsAt: 1, endsAt: 2, destination: "Test", travel: "Bus", overnight: true, roomingEnabled: true, feeCents: 0, signupMode: "assigned", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
    const group = await ctx.db.insert("roomGroups", { eventId: event, category: "Boys", name: "Room", finalized: true, adultFifthException: false, needsReview: false, createdBy: coach });
    await ctx.db.insert("roomMemberships", { eventId: event, groupId: group, studentId: student, joinedAt: 0 });
    return { coachAuth, studentAuth, parentAuth, coach, season, student, link, group };
  });
  const as = (auth: typeof ids.coachAuth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coachAuth), student: as(ids.studentAuth), parent: as(ids.parentAuth) };
}
const setup = { expectedRevision: 0, shirtSize: "M", roomCategory: "Boys" as const };
describe("profile setup and corrections", () => {
  it("requires explicit setup, validates required fields, locks category and rejects repeat and stale saves", async () => {
    const f = await fixture();
    expect(await f.student.query(api.profileSetup.get, {})).toMatchObject({ setupRequired: true, revision: 0, roomCategoryLocked: false });
    await expect(f.student.mutation(api.profileSetup.complete, { ...setup, shirtSize: "" })).rejects.toThrow("valid shirt");
    await expect(f.student.mutation(api.profileSetup.complete, { ...setup, expectedRevision: 1 })).rejects.toThrow("Profile changed");
    await expect(f.parent.mutation(api.profileSetup.complete, setup)).rejects.toThrow("permission");
    await f.student.mutation(api.profileSetup.complete, { ...setup, preferredName: " ", guardianName: "Guardian", guardianEmail: " GUARDIAN@EXAMPLE.INVALID " });
    expect(await f.student.query(api.profileSetup.get, {})).toMatchObject({ setupRequired: false, preferredName: "Student", revision: 1, roomCategoryLocked: true, guardianEmail: "guardian@example.invalid" });
    await expect(f.student.mutation(api.profileSetup.complete, setup)).rejects.toThrow("already complete");
  });

  it("preserves an existing legacy locked category during first setup", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { roomCategory: "Girls", roomCategoryLocked: true }));
    await expect(f.student.mutation(api.profileSetup.complete, setup)).rejects.toThrow("locked room");
    await f.student.mutation(api.profileSetup.complete, { ...setup, roomCategory: "Girls" });
    expect(await f.student.query(api.profileSetup.get, {})).toMatchObject({ roomCategory: "Girls", roomCategoryLocked: true, setupRequired: false });
  });

  it("uses Coach-only revisioned corrections and marks existing room placement for review", async () => {
    const f = await fixture();
    await f.student.mutation(api.profileSetup.complete, setup);
    const requestId = await f.parent.mutation(api.profileSetup.requestCorrection, { studentId: f.ids.student, expectedRevision: 1, field: "roomCategory", note: "Please correct category" });
    await expect(f.parent.mutation(api.profileSetup.correct, { studentId: f.ids.student, expectedRevision: 1, roomCategory: "Girls", reason: "Correction" })).rejects.toThrow("Only a Coach");
    await expect(f.coach.mutation(api.profileSetup.correct, { studentId: f.ids.student, expectedRevision: 0, roomCategory: "Girls", reason: "Correction" })).rejects.toThrow("Profile changed");
    await f.coach.mutation(api.profileSetup.correct, { studentId: f.ids.student, expectedRevision: 1, roomCategory: "Girls", reason: "Confirmed correction", requestId });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.group))).toMatchObject({ needsReview: true });
    expect(await f.t.run(ctx => ctx.db.get(requestId))).toMatchObject({ status: "approved", decidedBy: f.ids.coach });
    expect(await f.student.query(api.profileSetup.get, {})).toMatchObject({ revision: 2, roomCategory: "Girls", roomCategoryLocked: true });
    await expect(f.coach.mutation(api.profileSetup.correct, { studentId: f.ids.student, expectedRevision: 2, roomCategory: "Boys", reason: "Replay", requestId })).rejects.toThrow("unavailable");
    await f.t.run(ctx => ctx.db.patch(f.ids.link, { active: false }));
    await expect(f.parent.mutation(api.profileSetup.requestCorrection, { studentId: f.ids.student, expectedRevision: 2, field: "legalName", note: "Change" })).rejects.toThrow("permission");
  });

  it("keeps earlier-season correction history out of the current Coach queue", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const oldSeason = await ctx.db.insert("seasons", { name: "Archived", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: f.ids.coach });
      const oldStudent = await ctx.db.insert("students", { seasonId: oldSeason, legalName: "Archived Student", preferredName: "Archived", email: "archived@example.invalid", subteam: "A", active: false, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      for (let index = 0; index < 110; index++) await ctx.db.insert("profileCorrectionRequests", { seasonId: oldSeason, studentId: oldStudent, field: "legalName", requestedBy: f.ids.coach, requestedAt: index, note: "Historical correction", status: "pending" });
    });
    const current = await f.parent.mutation(api.profileSetup.requestCorrection, { studentId: f.ids.student, expectedRevision: 0, field: "legalName", note: "Current correction" });
    const queue = await f.coach.query(api.profileSetup.corrections, { paginationOpts: { cursor: null, numItems: 20 } });
    expect(queue.page).toHaveLength(1);
    expect(queue.page[0]).toMatchObject({ requestId: current, studentId: f.ids.student, note: "Current correction" });
  });

  it("keeps one pending request per field and treats an identical retry as the same request", async () => {
    const f = await fixture();
    const args = { studentId: f.ids.student, expectedRevision: 0, field: "roomCategory" as const, note: "Please correct category" };
    const requests = await Promise.all([f.parent.mutation(api.profileSetup.requestCorrection, args), f.parent.mutation(api.profileSetup.requestCorrection, args)]);
    expect(requests[0]).toBe(requests[1]);
    await expect(f.student.mutation(api.profileSetup.requestCorrection, args)).rejects.toThrow("already waiting");
    await expect(f.parent.mutation(api.profileSetup.requestCorrection, { ...args, note: "A different correction" })).rejects.toThrow("already waiting");
    const nameRequest = await f.parent.mutation(api.profileSetup.requestCorrection, { ...args, field: "legalName" });
    expect(nameRequest).not.toBe(requests[0]);
    const pending = await f.t.run(ctx => ctx.db.query("profileCorrectionRequests").withIndex("by_studentId_and_field_and_status", q => q.eq("studentId", f.ids.student).eq("field", "roomCategory").eq("status", "pending")).collect());
    expect(pending).toHaveLength(1);
    await f.coach.mutation(api.profileSetup.denyCorrection, { requestId: requests[0], expectedRevision: 0, reason: "Reviewed and declined" });
    expect(await f.parent.mutation(api.profileSetup.requestCorrection, args)).not.toBe(requests[0]);
  });

  it("paginates more than 100 legitimate current-season corrections without truncation", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let index = 0; index < 125; index++) {
        const studentId = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: `Current Student ${index}`, preferredName: `Current ${index}`, email: `current-${index}@example.invalid`, subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
        await ctx.db.insert("profileCorrectionRequests", { seasonId: f.ids.season, studentId, field: "legalName", requestedBy: f.ids.coach, requestedAt: index, note: "Legitimate pending correction", status: "pending" });
      }
    });
    const requestIds = new Set<string>();
    let cursor: string | null = null;
    let pageCount = 0;
    while (true) {
      const page: FunctionReturnType<typeof api.profileSetup.corrections> = await f.coach.query(api.profileSetup.corrections, { paginationOpts: { cursor, numItems: 20 } });
      expect(page.page.length).toBeLessThanOrEqual(20);
      for (const row of page.page) { expect(requestIds.has(row.requestId)).toBe(false); requestIds.add(row.requestId); }
      pageCount++;
      if (page.isDone) break;
      cursor = page.continueCursor;
      if (pageCount > 10) throw new Error("Correction pagination did not finish.");
    }
    expect(requestIds.size).toBe(125);
    expect(pageCount).toBeGreaterThan(1);
    await expect(f.parent.query(api.profileSetup.corrections, { paginationOpts: { cursor: null, numItems: 20 } })).rejects.toThrow("Only a Coach");
  });

  it("closes the legacy roster correction bypass and preserves archival date after reactivation", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.student, roomCategory: "Girls" })).rejects.toThrow("revision and reason");
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.student, roomCategory: "Girls", expectedRevision: 0, reason: "Confirmed correction" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.group))).toMatchObject({ needsReview: true });
    await expect(f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.student, active: false })).rejects.toThrow("revision and reason");
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.student, active: false, expectedRevision: 1, reason: "Archive synthetic member" });
    const archivedAt = (await f.t.run(ctx => ctx.db.get(f.ids.student)))?.archivedAt;
    expect(archivedAt).toBeTypeOf("number");
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.student, active: true, expectedRevision: 2, reason: "Reactivate synthetic member" });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.student, active: false, expectedRevision: 3, reason: "Archive again" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.student)))?.archivedAt).toBe(archivedAt);
  });
});
