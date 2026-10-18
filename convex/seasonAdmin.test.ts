/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const overview = makeFunctionReference<"query">("seasonAdmin:overview");
const create = makeFunctionReference<"mutation">("seasonAdmin:createDraft");
const update = makeFunctionReference<"mutation">("seasonAdmin:updateDraft");
const discard = makeFunctionReference<"mutation">("seasonAdmin:discardDraft");
const roster = makeFunctionReference<"query">("seasonAdmin:rosterPage");
const decide = makeFunctionReference<"mutation">("seasonAdmin:saveRosterDecision");
const details = { targetName: "2026–27 season", targetCompetitionYear: 2027, targetStartDate: "2026-08-01", targetEndDate: "2027-07-31" };

async function fixture(students = 2) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const otherCoachAuth = await ctx.db.insert("users", { email: "other.coach@example.invalid" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    await ctx.db.insert("appUsers", { authUserId: otherCoachAuth, email: "other.coach@example.invalid", name: "Other Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const source = await ctx.db.insert("seasons", { name: "2025–26 season", year: 2026, status: "active", startsAt: 0, permissionVersion: "draft", createdBy: coach });
    const studentIds = [];
    for (let i = 0; i < students; i++) studentIds.push(await ctx.db.insert("students", { seasonId: source, legalName: `Synthetic Student ${i}`, preferredName: `Student ${i}`, email: `student${i}@example.invalid`, subteam: "Programming", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
    return { coachAuth, otherCoachAuth, parentAuth, source, studentIds };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), otherCoach: t.withIdentity({ subject: `${ids.otherCoachAuth}|session` }), parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }) };
}

describe("Coach season draft and roster review", () => {
  it("saves a draft once without creating a season or changing any student", async () => {
    const f = await fixture();
    await expect(f.parent.mutation(create, { ...details, idempotencyKey: "draft-key-1" })).rejects.toThrow("permission");
    const id = await f.coach.mutation(create, { ...details, idempotencyKey: "draft-key-1" });
    expect(await f.coach.mutation(create, { ...details, idempotencyKey: "draft-key-1" })).toBe(id);
    await expect(f.coach.mutation(create, { ...details, targetName: "Changed", idempotencyKey: "draft-key-1" })).rejects.toThrow("different details");
    await expect(f.otherCoach.mutation(create, { ...details, idempotencyKey: "other-key-1" })).rejects.toThrow("already exists");
    const view = await f.coach.query(overview, {}) as { plan: { id: string; revision: number }; kickoff: { state: string; kickoffDate?: string } };
    expect(view.plan).toMatchObject({ id, revision: 1 });
    expect(view.kickoff).toMatchObject({ state: "verified", kickoffDate: "2027-01-09" });
    const source = await f.t.run(ctx => ctx.db.get(f.ids.source));
    expect(source?.status).toBe("active");
    expect((await f.t.run(ctx => ctx.db.query("seasons").withIndex("by_year", q => q.eq("year", 2027)).first()))).toBeNull();
    expect((await f.t.run(ctx => ctx.db.get(f.ids.studentIds[0])))?.active).toBe(true);
  });

  it("validates dates and revisions, and permits a reasoned discard without deleting decisions", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(create, { ...details, targetStartDate: "2027-02-30", idempotencyKey: "bad-date-1" })).rejects.toThrow("valid calendar date");
    await expect(f.coach.mutation(create, { ...details, targetEndDate: "2026-01-01", idempotencyKey: "bad-order-1" })).rejects.toThrow("follow start");
    await expect(f.coach.mutation(create, { ...details, targetStartDate: "2027-08-01", targetEndDate: "2028-07-31", idempotencyKey: "bad-kickoff-1" })).rejects.toThrow("kickoff day");
    const id = await f.coach.mutation(create, { ...details, idempotencyKey: "good-draft-1" }) as Id<"seasonTransitionPlans">;
    await expect(f.coach.mutation(update, { planId: id, expectedRevision: 0, ...details })).rejects.toThrow("changed");
    expect(await f.otherCoach.mutation(update, { planId: id, expectedRevision: 1, ...details, targetEndDate: "2028-08-31" })).toBe(2);
    await expect(f.coach.mutation(discard, { planId: id, expectedRevision: 1, reason: "Coach reviewed replacement draft" })).rejects.toThrow("changed");
    await f.coach.mutation(discard, { planId: id, expectedRevision: 2, reason: "Coach reviewed replacement draft" });
    expect((await f.t.run(ctx => ctx.db.get(id)))?.state).toBe("cancelled");
    await expect(f.coach.query(roster, { planId: id, paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow("unavailable");
  });

  it("pages a large active roster and fences stale student and competing Coach decisions", async () => {
    const f = await fixture(105);
    const planId = await f.coach.mutation(create, { ...details, idempotencyKey: "roster-key-1" });
    const first = await f.coach.query(roster, { planId, paginationOpts: { numItems: 50, cursor: null } }) as { page: { studentId: string; studentFingerprint: string; choice: null; decisionRevision: null }[]; continueCursor: string; isDone: boolean };
    expect(first.page).toHaveLength(50);
    expect(first.isDone).toBe(false);
    const second = await f.coach.query(roster, { planId, paginationOpts: { numItems: 50, cursor: first.continueCursor } }) as { page: { studentId: string }[]; continueCursor: string };
    const third = await f.coach.query(roster, { planId, paginationOpts: { numItems: 50, cursor: second.continueCursor } }) as { page: { studentId: string }[]; isDone: boolean };
    expect(third.page).toHaveLength(5);
    expect(third.isDone).toBe(true);
    await expect(f.parent.query(roster, { planId, paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow("permission");
    const row = first.page[0];
    await expect(f.parent.mutation(decide, { planId, studentId: row.studentId, choice: "depart", expectedPlanRevision: 1, expectedStudentFingerprint: row.studentFingerprint, expectedDecisionRevision: null })).rejects.toThrow("permission");
    const saved = await f.coach.mutation(decide, { planId, studentId: row.studentId, choice: "return", expectedPlanRevision: 1, expectedStudentFingerprint: row.studentFingerprint, expectedDecisionRevision: null }) as { planRevision: number; decisionRevision: number };
    expect(saved).toMatchObject({ planRevision: 2, decisionRevision: 1 });
    await f.t.run(ctx => ctx.db.patch(f.ids.studentIds[0], { profileRevision: 2 }));
    const changed = await f.coach.query(roster, { planId, paginationOpts: { numItems: 50, cursor: null } }) as { page: { studentId: string; studentFingerprint: string; decisionRevision: number | null; decisionStale: boolean }[] };
    const changedRow = changed.page.find(item => item.studentId === row.studentId)!;
    expect(changedRow.decisionStale).toBe(true);
    expect(await f.coach.mutation(decide, { planId, studentId: row.studentId, choice: "return", expectedPlanRevision: 2, expectedStudentFingerprint: changedRow.studentFingerprint, expectedDecisionRevision: 1 })).toMatchObject({ planRevision: 3, decisionRevision: 2 });
    const refreshed = await f.coach.query(roster, { planId, paginationOpts: { numItems: 50, cursor: null } }) as { page: { studentId: string; decisionStale: boolean }[] };
    expect(refreshed.page.find(item => item.studentId === row.studentId)?.decisionStale).toBe(false);
    await expect(f.otherCoach.mutation(decide, { planId, studentId: row.studentId, choice: "depart", expectedPlanRevision: 1, expectedStudentFingerprint: row.studentFingerprint, expectedDecisionRevision: 1 })).rejects.toThrow("changed");
    await f.t.run(ctx => ctx.db.patch(f.ids.studentIds[1], { profileRevision: 2 }));
    const staleRow = first.page[1];
    await expect(f.coach.mutation(decide, { planId, studentId: staleRow.studentId, choice: "return", expectedPlanRevision: 3, expectedStudentFingerprint: staleRow.studentFingerprint, expectedDecisionRevision: null })).rejects.toThrow("Student profile changed");
    expect(await f.otherCoach.mutation(decide, { planId, studentId: row.studentId, choice: null, expectedPlanRevision: 3, expectedStudentFingerprint: changedRow.studentFingerprint, expectedDecisionRevision: 2 })).toMatchObject({ planRevision: 4, decisionRevision: null });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.studentIds[0])))?.active).toBe(true);
    const audits = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "seasonTransitionRosterDecisions").eq("entityId", `${planId}:${row.studentId}`)).take(10));
    expect(audits.map(audit => audit.action)).toEqual(["setChoice", "setChoice", "setChoice"]);
  });
});
