/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
const page = { numItems: 25, cursor: null };

async function fixture(linked = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "student" | "parent") {
      const auth = await ctx.db.insert("users", { email: `${name}@synthetic.test`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@synthetic.test`, name, role, travelLead: false, financialEdit: false, active: true, accessRevision: 0 });
      return { auth, user };
    }
    const coach = await account("coach", "coach");
    const parent = await account("parent", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const login = await account("student0", "student");
    const base = { seasonId: season, legalName: "Synthetic Student", preferredName: "Student", subteam: "Other", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" as const }, medications: { state: "none" as const } };
    const studentId = await ctx.db.insert("students", { ...base, email: "student0@synthetic.test", ...(linked ? { userId: login.user } : {}) });
    await ctx.db.insert("pushSubscriptions", { userId: login.user, endpoint: "https://push.invalid/a", p256dh: "k", auth: "a", deviceLabel: "Phone", createdAt: 1 });
    await ctx.db.insert("pushSubscriptions", { userId: parent.user, endpoint: "https://push.invalid/p", p256dh: "k", auth: "a", deviceLabel: "Parent phone", createdAt: 1 });
    return { coachAuth: coach.auth, studentId, loginId: login.user, parentId: parent.user };
  });
  const coach = t.withIdentity({ subject: `${ids.coachAuth}|session` });
  const login = () => t.run(ctx => ctx.db.get(ids.loginId));
  const push = (userId: typeof ids.loginId) => t.run(async ctx => (await ctx.db.query("pushSubscriptions").withIndex("by_userId", q => q.eq("userId", userId)).collect()).length);
  const setActive = (active: boolean, expectedRevision: number) => coach.mutation(api.admin.updateRoster, { studentId: ids.studentId, expectedRevision, active, reason: "Left the team" });
  return { t, ids, coach, login, push, setActive };
}

describe("archiving a student turns off their login", () => {
  it("turns the login off, bumps its revision, removes push subscriptions and audits it", async () => {
    const f = await fixture();
    await f.setActive(false, 0);
    const student = await f.t.run(ctx => ctx.db.get(f.ids.studentId));
    const login = await f.login();
    expect(login?.active).toBe(false);
    expect(login?.archivedAt).toBe(student?.archivedAt);
    expect(login?.accessRevision).toBe(1);
    expect(await f.push(f.ids.loginId)).toBe(0);
    expect(await f.push(f.ids.parentId)).toBe(1);
    const audits = await f.t.run(ctx => ctx.db.query("audit").collect());
    expect(audits.some(a => a.action === "archiveStudentLogin" && a.entityId === String(f.ids.loginId))).toBe(true);
  });

  it("turns the login back on when the student is reactivated, keeping the earlier archive date", async () => {
    const f = await fixture();
    await f.setActive(false, 0);
    const archivedAt = (await f.login())?.archivedAt;
    await f.setActive(true, 1);
    const login = await f.login();
    expect(login?.active).toBe(true);
    expect(login?.archivedAt).toBe(archivedAt);
    expect(login?.accessRevision).toBe(2);
    const audits = await f.t.run(ctx => ctx.db.query("audit").collect());
    expect(audits.some(a => a.action === "reactivateStudentLogin")).toBe(true);
  });

  it("leaves a student with no linked login, and Parent accounts, unaffected", async () => {
    const f = await fixture(false);
    await f.setActive(false, 0);
    expect((await f.login())?.active).toBe(true);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.parentId)))?.active).toBe(true);
    expect(await f.push(f.ids.loginId)).toBe(1);
  });

  it("no longer reports an archived student as having an active linked login", async () => {
    const f = await fixture();
    await f.setActive(false, 0);
    const list = await f.coach.query(api.retentionReview.students, { paginationOpts: page, asOf: Date.now() });
    expect(list.page).toHaveLength(1);
    expect(list.page[0].status).toBe("waiting");
  });
});

describe("the viewer tells a turned-off account from a join request", () => {
  async function signedIn(role: "student" | "mentor", active: boolean, row = true) {
    const t = convexTest(schema, modules);
    const authId = await t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "someone@synthetic.test", name: "Someone" });
      if (row) await ctx.db.insert("appUsers", { authUserId: auth, email: "someone@synthetic.test", name: "Someone", role, travelLead: false, financialEdit: false, active, ...(active ? {} : { archivedAt: 1 }) });
      return auth;
    });
    return t.withIdentity({ subject: `${authId}|session` });
  }
  it.each([["an archived student's login", "student"], ["a deactivated adult", "mentor"]] as const)("returns inactive for %s", async (_label, role) => {
    expect((await (await signedIn(role, false)).query(api.app.viewer, {})).status).toBe("inactive");
  });
  it("still returns pending with no account yet, and active for an active account", async () => {
    expect((await (await signedIn("student", true, false)).query(api.app.viewer, {})).status).toBe("pending");
    expect((await (await signedIn("mentor", true)).query(api.app.viewer, {})).status).toBe("active");
  });
});

describe("a season archive of a departing student's login", () => {
  it("also removes that login's push subscriptions", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const ids = await t.run(async ctx => {
        const auth = await ctx.db.insert("users", { email: "coach@fixture.invalid" });
        const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@fixture.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
        const season = await ctx.db.insert("seasons", { name: "Synthetic old", year: 2026, status: "active", startsAt: 0, permissionVersion: "old", createdBy: coach });
        const loginAuth = await ctx.db.insert("users", { email: "student@fixture.invalid" });
        const login = await ctx.db.insert("appUsers", { authUserId: loginAuth, email: "student@fixture.invalid", name: "Synthetic Student", role: "student", active: true, travelLead: false, financialEdit: false });
        const student = await ctx.db.insert("students", { seasonId: season, userId: login, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@fixture.invalid", subteam: "Programming", active: true, travelTeam: true, roomCategoryLocked: true, allergies: { state: "reported", text: "Synthetic" }, medications: { state: "none" } });
        await createFinancialAccount(ctx, student, "ready");
        await ctx.db.insert("pushSubscriptions", { userId: login, endpoint: "https://push.invalid/s", p256dh: "k", auth: "a", deviceLabel: "Phone", createdAt: 1 });
        return { auth, student, login };
      });
      const coach = t.withIdentity({ subject: `${ids.auth}|session` });
      const planId = await coach.mutation(api.seasonAdmin.createDraft, { targetName: "Synthetic next", targetCompetitionYear: 2027, targetStartDate: "2026-08-01", targetEndDate: "2027-07-31", idempotencyKey: "depart-test" });
      const rows = await coach.query(api.seasonAdmin.rosterPage, { planId, paginationOpts: { numItems: 20, cursor: null } });
      await coach.mutation(api.seasonAdmin.saveRosterDecision, { planId, studentId: ids.student, choice: "depart", expectedPlanRevision: 1, expectedStudentFingerprint: rows.page[0].studentFingerprint, expectedDecisionRevision: null });
      const preview = await coach.query(api.seasonTransitionReview.studentPreview, { planId, studentId: ids.student });
      await coach.mutation(api.seasonTransitionReview.saveStudentReview, { planId, studentId: ids.student, expectedPlanRevision: 2, expectedRosterRevision: 1, expectedStudentFingerprint: preview.studentFingerprint, expectedAccountFingerprint: preview.accountFingerprint, expectedReviewRevision: null, copyGuardianContact: false, copySubteam: false, copyParentLinks: false, accountAction: "archive", reason: "Graduated" });
      await coach.mutation(api.seasonTransition.saveResetReview, { planId, expectedRevision: 3, copyPermissionWording: false, resetReviewed: true });
      await coach.mutation(api.seasonTransition.confirm, { planId, expectedRevision: 4, confirmationName: "Synthetic next" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const plan = await t.run(ctx => ctx.db.get(planId));
      expect(plan?.lastError).toBeUndefined();
      expect(plan?.state).toBe("complete");
      expect((await t.run(ctx => ctx.db.get(ids.login)))?.active).toBe(false);
      expect(await t.run(async ctx => (await ctx.db.query("pushSubscriptions").withIndex("by_userId", q => q.eq("userId", ids.login)).collect()).length)).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
