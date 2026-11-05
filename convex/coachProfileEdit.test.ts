/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest as convexTest } from "../testUtils";
import { exportPKCS8, generateKeyPair } from "jose";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { SESSION_DELETE_BUDGET } from "./coachProfileEdit";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const t = convexTest(schema, modules); rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const person = async (email: string, role: "coach" | "mentor" | "parent" | "student", name: string) => {
      const auth = await ctx.db.insert("users", { email, name, emailVerificationTime: 1 });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email, name, role, active: true, travelLead: false, financialEdit: false });
      return { auth, user };
    };
    const coach = await person("coach@example.invalid", "coach", "Coach");
    const mentor = await person("mentor@example.invalid", "mentor", "Mentor");
    const parent = await person("parent@example.invalid", "parent", "Parent");
    const student = await person("student@example.invalid", "student", "Student");
    const other = await person("taken@example.invalid", "mentor", "Other Mentor");
    await ctx.db.insert("authAccounts", { userId: student.auth, provider: "google", providerAccountId: "google-student-sub", emailVerified: "student@example.invalid" });
    await ctx.db.insert("authAccounts", { userId: mentor.auth, provider: "google", providerAccountId: "google-mentor-sub", emailVerified: "mentor@example.invalid" });
    await ctx.db.insert("adultEmailIdentities", { authUserId: mentor.auth, email: "mentor@example.invalid", createdAt: 1 });
    await ctx.db.insert("parentEmailIdentities", { authUserId: parent.auth, email: "parent@example.invalid", createdAt: 1 });
    const season = await ctx.db.insert("seasons", { name: "Synthetic season", year: 2026, status: "active", startsAt: 0, permissionVersion: "draft", createdBy: coach.user });
    const studentId = await ctx.db.insert("students", { seasonId: season, userId: student.user, legalName: "Student Example", preferredName: "Student", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ctx.db.insert("familyLinks", { parentUserId: parent.user, studentId, seasonId: season, active: true, createdBy: coach.user });
    const studentSession = await ctx.db.insert("authSessions", { userId: student.auth, expirationTime: Date.now() + 86_400_000 });
    return { coach, mentor, parent, student, other, season, studentId, studentSession };
  });
  const as = (auth: Id<"users">) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), mentor: as(ids.mentor.auth), parent: as(ids.parent.auth), student: as(ids.student.auth) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const REASON = "Synthetic email correction";
const studentEdit = (f: Fixture, changes: Partial<{ email: string; expectedRevision: number; preferredName: string; reason: string }> = {}) => ({ studentId: f.ids.studentId, expectedRevision: 0, legalName: "Student Example", preferredName: "Student", email: "student@example.invalid", shirtSize: null, reason: REASON, ...changes });
const adultEdit = (userId: Id<"appUsers">, changes: Partial<{ email: string; expectedProfileRevision: number; name: string; phone: string; reason: string }> = {}) => ({ userId, expectedProfileRevision: 0, name: "Updated Name", email: "unchanged", phone: "202-555-0100", reason: REASON, ...changes });

describe("coach profile edits", () => {
  it("lets a Coach edit student and adult basics, with revision bumps and an audit trail", async () => {
    const f = await fixture();
    expect(await f.coach.mutation(api.coachProfileEdit.updateStudentProfile, { ...studentEdit(f, { preferredName: " Stu " }), shirtSize: "M", reason: "Name preference" })).toEqual({ emailChanged: false, endedSessions: 0, removedGoogleLinks: 0 });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.studentId))).toMatchObject({ preferredName: "Stu", shirtSize: "M", profileRevision: 1, email: "student@example.invalid" });
    expect(await f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.parent.user, { email: " Parent@Example.invalid " }))).toMatchObject({ emailChanged: false });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.parent.user))).toMatchObject({ name: "Updated Name", phone: "(202) 555-0100", profileRevision: 1, email: "parent@example.invalid" });
    const profile = await f.coach.query(api.coachProfileEdit.studentProfile, { studentId: f.ids.studentId });
    expect(profile).toMatchObject({ profileRevision: 1, signIn: "linked", parents: [{ userId: f.ids.parent.user, profileRevision: 1 }] });
    const audits = await f.t.run(ctx => ctx.db.query("audit").collect());
    expect(audits.filter(row => row.action === "coachEditProfile").map(row => row.entityId).sort()).toEqual([f.ids.studentId, f.ids.parent.user].sort());
  });

  it.each(["mentor", "parent", "student"] as const)("rejects a %s for every read and write", async role => {
    const f = await fixture();
    const caller = f[role];
    await expect(caller.query(api.coachProfileEdit.studentProfile, { studentId: f.ids.studentId })).rejects.toThrow("permission");
    await expect(caller.query(api.coachProfileEdit.adultProfile, { userId: f.ids.mentor.user })).rejects.toThrow("permission");
    await expect(caller.mutation(api.coachProfileEdit.updateStudentProfile, studentEdit(f, { email: "new@example.invalid" }))).rejects.toThrow("permission");
    await expect(caller.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.parent.user, { email: "new@example.invalid" }))).rejects.toThrow("permission");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.studentId))).toMatchObject({ email: "student@example.invalid" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.parent.user))).toMatchObject({ email: "parent@example.invalid", name: "Parent" });
  });

  it("moves a student's Google sign-in to the new email and ends their sessions", async () => {
    const f = await fixture();
    expect(await f.coach.mutation(api.coachProfileEdit.updateStudentProfile, studentEdit(f, { email: " New.Student@Example.invalid " }))).toEqual({ emailChanged: true, endedSessions: 1, removedGoogleLinks: 1 });
    const state = await f.t.run(async ctx => ({
      student: await ctx.db.get(f.ids.studentId), app: await ctx.db.get(f.ids.student.user), auth: await ctx.db.get(f.ids.student.auth),
      accounts: await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", f.ids.student.auth)).collect(),
      session: await ctx.db.get(f.ids.studentSession),
      linkable: await ctx.db.query("users").withIndex("email", q => q.eq("email", "new.student@example.invalid")).collect(),
    }));
    expect(state.student?.email).toBe("new.student@example.invalid");
    expect(state.app).toMatchObject({ email: "new.student@example.invalid", profileRevision: 1 });
    // Convex Auth links a new Google login only to a unique users row with this verified email.
    expect(state.auth).toMatchObject({ email: "new.student@example.invalid" });
    expect(state.auth?.emailVerificationTime).toBeGreaterThan(1);
    expect(state.linkable.map(row => row._id)).toEqual([f.ids.student.auth]);
    expect(state.accounts).toEqual([]);
    expect(state.session).toBeNull();
  });

  it.each([["mentor", "adultEmailIdentities"], ["parent", "parentEmailIdentities"]] as const)("lets a %s sign in by email code with the new address and not the old one", async (role, markerTable) => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey)); vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
    const f = await fixture();
    const who = f.ids[role];
    const oldEmail = `${role}@example.invalid`, newEmail = `${role}.new@example.invalid`;
    const prepare = (email: string) => f.t.mutation(internal.parentEmailAuth.prepareCode, { email, code: "123456", nonce: "b".repeat(64) });
    const signIn = (email: string) => f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email, code: "123456" } });
    expect(await prepare(oldEmail)).toBe(true);
    expect(await f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(who.user, { email: newEmail }))).toMatchObject({ emailChanged: true });
    const marker = await f.t.run(ctx => ctx.db.query(markerTable).withIndex("by_authUserId", q => q.eq("authUserId", who.auth)).unique());
    expect(marker?.email).toBe(newEmail);
    // The code issued to the old address before the change no longer works, and the old address gets no new code.
    expect((await signIn(oldEmail)).tokens ?? null).toBeNull();
    expect(await prepare(oldEmail)).toBe(false);
    expect(await prepare(newEmail)).toBe(true);
    const result = await signIn(newEmail);
    expect(result.tokens?.token).toBeTruthy();
    const session = await f.t.run(ctx => ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", who.auth)).first());
    const signedIn = f.t.withIdentity({ subject: `${who.auth}|${session!._id}` });
    expect(await signedIn.query(api.app.viewer, {})).toMatchObject({ status: "active", user: { email: newEmail } });
  });

  it.each([
    ["an active account", "taken@example.invalid", "Another account already uses this email"],
    ["a sign-in without a team account", "orphan@example.invalid", "already signed in with this email"],
    ["an invalid address", "not-an-email", "valid email"],
  ])("rejects an email used by %s without changing anything", async (_label, email, message) => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.insert("users", { email: "orphan@example.invalid", emailVerificationTime: 1 }));
    await expect(f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.mentor.user, { email }))).rejects.toThrow(message);
    await expect(f.coach.mutation(api.coachProfileEdit.updateStudentProfile, studentEdit(f, { email }))).rejects.toThrow(message);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor.auth))).toMatchObject({ email: "mentor@example.invalid" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.studentId))).toMatchObject({ email: "student@example.invalid" });
  });

  it("rejects stale revisions and a Coach changing their own sign-in email", async () => {
    const f = await fixture();
    await f.coach.mutation(api.coachProfileEdit.updateStudentProfile, studentEdit(f));
    await expect(f.coach.mutation(api.coachProfileEdit.updateStudentProfile, studentEdit(f, { email: "late@example.invalid" }))).rejects.toThrow("changed since you opened it");
    await f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.mentor.user, { email: "mentor@example.invalid" }));
    await expect(f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.mentor.user, { email: "late@example.invalid" }))).rejects.toThrow("changed since you opened it");
    await expect(f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.coach.user, { email: "coach.new@example.invalid" }))).rejects.toThrow("your own sign-in email");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.student.user))).toMatchObject({ email: "student@example.invalid" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.coach.auth))).toMatchObject({ email: "coach@example.invalid" });
  });

  it.each(["mentor", "parent"] as const)("revokes pending Parent and Coach/Mentor invitations to a %s's old email, not others", async role => {
    const f = await fixture();
    const oldEmail = `${role}@example.invalid`;
    const invites = await f.t.run(async ctx => {
      const base = { status: "pending" as const, createdBy: f.ids.coach.user, createdAt: 1, expiresAt: Date.now() + 86_400_000 };
      const parentInvite = (parentEmail: string, tokenHash: string) => ctx.db.insert("parentInvitations", { ...base, studentId: f.ids.studentId, parentEmail, tokenHash });
      const adultInvite = (email: string, tokenHash: string) => ctx.db.insert("adultInvitations", { ...base, email, role: "mentor", travelLead: true, financialEdit: false, healthExport: false, tokenHash });
      return {
        old: [await parentInvite(oldEmail, "p-old"), await adultInvite(oldEmail, "a-old")],
        other: [await parentInvite("someone.else@example.invalid", "p-other"), await adultInvite("someone.else@example.invalid", "a-other")],
      };
    });
    await f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids[role].user, { email: `${role}.new@example.invalid` }));
    const status = (ids: Array<Id<"parentInvitations"> | Id<"adultInvitations">>) => f.t.run(async ctx => Promise.all(ids.map(async id => (await ctx.db.get(id))?.status)));
    expect(await status(invites.old)).toEqual(["revoked", "revoked"]);
    expect(await status(invites.other)).toEqual(["pending", "pending"]);
    const revokes = await f.t.run(async ctx => (await ctx.db.query("audit").collect()).filter(row => row.action === "revoke"));
    expect(revokes.map(row => [row.entityId, row.reason]).sort()).toEqual(invites.old.map(id => [id, REASON]).sort());
  });

  it.each([
    ["no reason", undefined, "short reason"],
    ["a blank reason", "   ", "short reason"],
    ["an overlong reason", "x".repeat(501), "500 characters"],
  ])("requires a reason when the sign-in email changes (%s)", async (_label, reason, message) => {
    const f = await fixture();
    const withReason = <T extends object>(edit: T) => ({ ...edit, reason });
    await expect(f.coach.mutation(api.coachProfileEdit.updateAdultProfile, withReason(adultEdit(f.ids.mentor.user, { email: "mentor.new@example.invalid" })))).rejects.toThrow(message);
    await expect(f.coach.mutation(api.coachProfileEdit.updateStudentProfile, withReason(studentEdit(f, { email: "student.new@example.invalid" })))).rejects.toThrow(message);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor.user))).toMatchObject({ email: "mentor@example.invalid", name: "Mentor" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.studentId))).toMatchObject({ email: "student@example.invalid" });
    // Ordinary edits keep the reason optional.
    expect(await f.coach.mutation(api.coachProfileEdit.updateAdultProfile, { ...adultEdit(f.ids.mentor.user, { email: "mentor@example.invalid" }), reason: undefined })).toMatchObject({ emailChanged: false });
  });

  it("pauses adult profile edits while the season transition is locked", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.insert("seasonTransitionPlans", { sourceSeasonId: f.ids.season, targetName: "Next", targetCompetitionYear: 2027, targetStartDate: "2027-01-01", targetEndDate: "2027-12-31", state: "draining", open: true, revision: 0, createdBy: f.ids.coach.user, updatedBy: f.ids.coach.user, createdAt: 1, updatedAt: 1, idempotencyKey: "k", requestHash: "h" }));
    await expect(f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.mentor.user, { email: "mentor@example.invalid" }))).rejects.toThrow("moving to a new season");
    await expect(f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.parent.user, { email: "parent.new@example.invalid" }))).rejects.toThrow("moving to a new season");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.parent.user))).toMatchObject({ email: "parent@example.invalid", name: "Parent" });
  });

  it("ends every session and refresh token, continuing past one transaction's budget, but not sessions started afterwards", async () => {
    vi.useFakeTimers();
    try {
      const f = await fixture();
      const auth = f.ids.mentor.auth;
      // One session has more refresh tokens than one query batch; the rest exceed the per-transaction budget together.
      const sessionCount = SESSION_DELETE_BUDGET;
      await f.t.run(async ctx => {
        for (let i = 0; i < sessionCount; i++) {
          const sessionId = await ctx.db.insert("authSessions", { userId: auth, expirationTime: Date.now() + 86_400_000 });
          for (let j = 0; j < (i === 0 ? 150 : 1); j++) await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + 86_400_000 });
          if (i === 1) await ctx.db.insert("operatingRoles", { sessionId, userId: f.ids.mentor.user, role: "mentor", accessRevision: 0 });
        }
      });
      const result = await f.coach.mutation(api.coachProfileEdit.updateAdultProfile, adultEdit(f.ids.mentor.user, { email: "mentor.new@example.invalid" }));
      expect(result.endedSessions).toBeGreaterThan(100);
      expect(result.endedSessions).toBeLessThan(sessionCount);
      // A sign-in with the new email after the change must survive the continuation.
      vi.setSystemTime(Date.now() + 60_000);
      const fresh = await f.t.run(ctx => ctx.db.insert("authSessions", { userId: auth, expirationTime: Date.now() + 86_400_000 }));
      await f.t.finishAllScheduledFunctions(vi.runAllTimers);
      const left = await f.t.run(async ctx => ({
        sessions: (await ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", auth)).collect()).map(row => row._id),
        tokens: (await ctx.db.query("authRefreshTokens").collect()).length,
        roles: (await ctx.db.query("operatingRoles").collect()).length,
      }));
      expect(left).toEqual({ sessions: [fresh], tokens: 0, roles: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});
