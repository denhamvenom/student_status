/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { financeMetrics, financeNamespace, reportAggregate } from "./lib/reportAggregates";
import schema from "./schema";
import { tokenHash } from "./lib/invitationIdentity";

const modules = import.meta.glob("./**/*.ts");
const targetUrl = "https://synthetic-rehearsal.convex.cloud";
const envNames = ["CONVEX_CLOUD_URL", "SYNTHETIC_REHEARSAL_CLEANUP_ENABLED", "SYNTHETIC_REHEARSAL_CLEANUP_CLOUD_URL"] as const;
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
afterEach(() => { for (const name of envNames) { const value = originalEnv[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

function enabled() {
  process.env.CONVEX_CLOUD_URL = targetUrl;
  process.env.SYNTHETIC_REHEARSAL_CLEANUP_ENABLED = "true";
  process.env.SYNTHETIC_REHEARSAL_CLEANUP_CLOUD_URL = targetUrl;
}

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid", emailVerificationTime: 1 });
    const coachAccount = await ctx.db.insert("authAccounts", { userId: coachAuth, provider: "google", providerAccountId: "real-coach-google-sub", emailVerified: "coach@example.invalid" });
    const coachSession = await ctx.db.insert("authSessions", { userId: coachAuth, expirationTime: 10_000 });
    const coachToken = await ctx.db.insert("authRefreshTokens", { sessionId: coachSession, expirationTime: 10_000 });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic Season", year: 2026, status: "active", startsAt: 1, permissionVersion: "DRAFT-1", createdBy: coach });
    const unrelatedAuth = await ctx.db.insert("users", { email: "unrelated@example.invalid", emailVerificationTime: 1 });
    const unrelated = await ctx.db.insert("appUsers", { authUserId: unrelatedAuth, email: "unrelated@example.invalid", name: "Unrelated", role: "mentor", travelLead: false, financialEdit: false, active: true });
    const auth = await ctx.db.insert("users", { email: "test.mentor@example.invalid", emailVerificationTime: 1 });
    const authAccount = await ctx.db.insert("authAccounts", { userId: auth, provider: "google", providerAccountId: "synthetic-google-sub", emailVerified: "test.mentor@example.invalid" });
    const appUser = await ctx.db.insert("appUsers", { authUserId: auth, email: "test.mentor@example.invalid", name: "Test Mentor", role: "mentor", travelLead: false, financialEdit: false, active: true });
    const session = await ctx.db.insert("authSessions", { userId: auth, expirationTime: 10_000 });
    const token = await ctx.db.insert("authRefreshTokens", { sessionId: session, expirationTime: 10_000 });
    const audit = await ctx.db.insert("audit", { actorId: coach, entity: "appUsers", entityId: appUser, action: "inviteAccepted", at: 1 });
    const realAudit = await ctx.db.insert("audit", { actorId: coach, entity: "seasons", entityId: season, action: "bootstrapProduction", at: 1 });
    return { coachAuth, coachAccount, coachSession, coachToken, coach, season, unrelatedAuth, unrelated, auth, authAccount, appUser, session, token, audit, realAudit };
  });
  const manifest = {
    seasonId: ids.season, coachId: ids.coach,
    accounts: [{ id: ids.appUser, authUserId: ids.auth, email: "test.mentor@example.invalid", name: "Test Mentor", role: "mentor" as "mentor" | "parent" | "student" }],
    students: [] as Array<{ id: Id<"students">; userId: Id<"appUsers">; email: string; legalName: string }>, authUsersToDelete: [{ id: ids.auth, email: "test.mentor@example.invalid" }],
    ids: {
      adultInvitations: [] as Id<"adultInvitations">[], parentInvitations: [] as Id<"parentInvitations">[], familyLinks: [] as Id<"familyLinks">[], joinRequests: [] as Id<"joinRequests">[], joinAttempts: [] as Id<"joinAttempts">[], joinCodes: [] as Id<"joinCodes">[], setupDrafts: [] as Id<"setupDrafts">[],
      studentFinanceSummaries: [] as Id<"studentFinanceSummaries">[], financialAccounts: [] as Id<"financialAccounts">[], authAccounts: [ids.authAccount], authSessions: [ids.session],
      authRefreshTokens: [ids.token], authVerificationCodes: [], authVerifiers: [] as Id<"authVerifiers">[], audit: [ids.audit],
    },
  };
  return { t, ids, manifest };
}

describe("exact synthetic account cleanup", () => {
  it("requires the exact opt-in and refuses a changed dependency inventory", async () => {
    const f = await fixture();
    await expect(f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest })).rejects.toThrow("disabled or bound");
    enabled();
    const reviewed = await f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest });
    await f.t.run(ctx => ctx.db.insert("adultInvitations", { email: "test.mentor@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false, tokenHash: "synthetic", status: "pending", createdBy: f.ids.coach, createdAt: 1, expiresAt: 2 }));
    await expect(f.t.mutation(internal.syntheticRehearsalCleanup.commit, { targetUrl, manifest: f.manifest, reviewedFingerprint: reviewed.fingerprint, reviewedCounts: reviewed.counts })).rejects.toThrow("Unexpected adultInvitations reference");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.appUser))).not.toBeNull();
  });

  it("deletes only reviewed rehearsal identities and leaves the real Coach, season, and audit", async () => {
    enabled();
    const f = await fixture();
    const reviewed = await f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest });
    expect(reviewed.counts).toMatchObject({ appUsers: 1, users: 1, authAccounts: 1, authSessions: 1, authRefreshTokens: 1, audit: 1 });
    await expect(f.t.mutation(internal.syntheticRehearsalCleanup.commit, { targetUrl, manifest: f.manifest, reviewedFingerprint: "wrong", reviewedCounts: reviewed.counts })).rejects.toThrow("inventory changed");
    const committed = await f.t.mutation(internal.syntheticRehearsalCleanup.commit, { targetUrl, manifest: f.manifest, reviewedFingerprint: reviewed.fingerprint, reviewedCounts: reviewed.counts });
    const remaining = await f.t.run(async ctx => ({
      coach: await ctx.db.get(f.ids.coach), coachAuth: await ctx.db.get(f.ids.coachAuth), coachAccount: await ctx.db.get(f.ids.coachAccount), coachSession: await ctx.db.get(f.ids.coachSession), coachToken: await ctx.db.get(f.ids.coachToken), season: await ctx.db.get(f.ids.season), unrelated: await ctx.db.get(f.ids.unrelated),
      realAudit: await ctx.db.get(f.ids.realAudit), testUser: await ctx.db.get(f.ids.appUser), auth: await ctx.db.get(f.ids.auth),
      session: await ctx.db.get(f.ids.session), token: await ctx.db.get(f.ids.token), testAudit: await ctx.db.get(f.ids.audit),
      receipt: await ctx.db.get(committed.receiptId),
    }));
    expect(remaining.coach?.role).toBe("coach");
    expect(remaining.coachAuth?.email).toBe("coach@example.invalid");
    expect(remaining.coachAccount?.provider).toBe("google");
    expect(remaining.coachSession?.userId).toBe(f.ids.coachAuth);
    expect(remaining.coachToken?.sessionId).toBe(f.ids.coachSession);
    expect(remaining.season?.status).toBe("active");
    expect(remaining.unrelated?.active).toBe(true);
    expect(remaining.realAudit?.action).toBe("bootstrapProduction");
    expect([remaining.testUser, remaining.auth, remaining.session, remaining.token, remaining.testAudit]).toEqual([null, null, null, null, null]);
    expect(remaining.receipt?.afterJson).not.toContain("example.invalid");
  });

  it("refuses to include any part of the Coach auth chain in the manifest", async () => {
    enabled();
    const f = await fixture();
    f.manifest.ids.authAccounts.push(f.ids.coachAccount);
    await expect(f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest })).rejects.toThrow();
    f.manifest.ids.authAccounts.pop();
    f.manifest.ids.authSessions.push(f.ids.coachSession);
    await expect(f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest })).rejects.toThrow();
    f.manifest.ids.authSessions.pop();
    f.manifest.ids.authRefreshTokens.push(f.ids.coachToken);
    await expect(f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest })).rejects.toThrow();
    f.manifest.ids.authRefreshTokens.pop();
    f.manifest.authUsersToDelete.push({ id: f.ids.coachAuth, email: "coach@example.invalid" });
    await expect(f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest })).rejects.toThrow();
    expect(await f.t.run(ctx => ctx.db.get(f.ids.coachToken))).not.toBeNull();
  });

  it("removes only exact reviewed signature-only orphan verifiers", async () => {
    enabled();
    const f = await fixture();
    const verifiers = await f.t.run(async ctx => ({
      target: await ctx.db.insert("authVerifiers", { signature: "orphan-for-rehearsal" }),
      unrelated: await ctx.db.insert("authVerifiers", { signature: "unrelated-orphan" }),
      unsigned: await ctx.db.insert("authVerifiers", {}),
    }));
    f.manifest.ids.authVerifiers.push(verifiers.unsigned);
    await expect(f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest })).rejects.toThrow("outside the account-only rehearsal scope");
    f.manifest.ids.authVerifiers.pop();
    f.manifest.ids.authVerifiers.push(verifiers.target);
    const reviewed = await f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest });
    expect(reviewed.counts.authVerifiers).toBe(1);
    await f.t.run(ctx => ctx.db.patch(verifiers.target, { signature: "changed-after-review" }));
    await expect(f.t.mutation(internal.syntheticRehearsalCleanup.commit, { targetUrl, manifest: f.manifest, reviewedFingerprint: reviewed.fingerprint, reviewedCounts: reviewed.counts })).rejects.toThrow("inventory changed");
    const fresh = await f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest });
    await f.t.mutation(internal.syntheticRehearsalCleanup.commit, { targetUrl, manifest: f.manifest, reviewedFingerprint: fresh.fingerprint, reviewedCounts: fresh.counts });
    expect(await f.t.run(ctx => ctx.db.get(verifiers.target))).toBeNull();
    expect(await f.t.run(ctx => ctx.db.get(verifiers.unrelated))).not.toBeNull();
    expect(await f.t.run(ctx => ctx.db.get(verifiers.unsigned))).not.toBeNull();
  });

  it("preserves more than 40 unrelated calendar occurrence cache rows", async () => {
    enabled();
    const f = await fixture();
    const cacheIds = await f.t.run(async ctx => {
      const ids: Id<"timeclockOccurrences">[] = [];
      for (let index = 0; index < 63; index++) ids.push(await ctx.db.insert("timeclockOccurrences", {
        seasonId: f.ids.season, source: "calendar", sourceKey: `unrelated-${index}`, title: "Unrelated calendar cache", allDay: false,
        scheduledStart: index + 1, scheduledEnd: index + 2, cancelled: false, observedAt: 1, revision: 1,
        needsReview: false, lastSeenGeneration: 1,
      }));
      return ids;
    });
    const reviewed = await f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest });
    await f.t.mutation(internal.syntheticRehearsalCleanup.commit, { targetUrl, manifest: f.manifest, reviewedFingerprint: reviewed.fingerprint, reviewedCounts: reviewed.counts });
    const retained = await f.t.run(async ctx => Promise.all(cacheIds.map(id => ctx.db.get(id))));
    expect(retained).toHaveLength(63);
    expect(retained.every(Boolean)).toBe(true);
  });

  it("cleans a real join and parent invitation flow with zero finance leaves", async () => {
    enabled();
    const f = await fixture();
    const coach = f.t.withIdentity({ subject: `${f.ids.coachAuth}|session` });
    const signedIn = await f.t.run(async ctx => {
      const studentAuth = await ctx.db.insert("users", { email: "test.student@example.invalid", name: "Test Student", emailVerificationTime: 1 });
      const studentAccount = await ctx.db.insert("authAccounts", { userId: studentAuth, provider: "google", providerAccountId: "synthetic-student", emailVerified: "test.student@example.invalid" });
      const parentAuth = await ctx.db.insert("users", { email: "test.parent@example.invalid", name: "Test Parent", emailVerificationTime: 1 });
      const parentAccount = await ctx.db.insert("authAccounts", { userId: parentAuth, provider: "google", providerAccountId: "synthetic-parent", emailVerified: "test.parent@example.invalid" });
      return { studentAuth, studentAccount, parentAuth, parentAccount };
    });
    const studentLogin = f.t.withIdentity({ subject: `${signedIn.studentAuth}|session` });
    const parentLogin = f.t.withIdentity({ subject: `${signedIn.parentAuth}|session` });
    const code = await coach.mutation(api.admin.createJoinCode, { duration: "24h" });
    const requestId = await studentLogin.mutation(api.app.requestJoin, { code: code.code, firstName: "Test", lastName: "Student" });
    expect(requestId).not.toBeNull();
    await coach.mutation(api.admin.approveJoin, { requestId: requestId!, approve: true });
    const joined = await f.t.run(async ctx => {
      const codeRow = await ctx.db.query("joinCodes").withIndex("by_code", q => q.eq("code", code.code)).unique();
      const studentApp = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", signedIn.studentAuth)).unique();
      const studentRow = await ctx.db.query("students").withIndex("by_userId", q => q.eq("userId", studentApp!._id)).unique();
      const summary = await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", studentRow!._id)).unique();
      const account = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", studentRow!._id)).unique();
      return { codeRow: codeRow!, studentApp: studentApp!, studentRow: studentRow!, summary: summary!, account: account! };
    });
    const parentToken = "a".repeat(64);
    await f.t.run(async ctx => ctx.db.insert("parentInvitations", { studentId: joined.studentRow._id, parentEmail: "test.parent@example.invalid", tokenHash: await tokenHash(parentToken), status: "pending", createdBy: joined.studentApp._id, createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60_000 }));
    await parentLogin.mutation(api.parentInvites.acceptParentInvite, { token: parentToken, relationship: "Parent", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    await coach.mutation(api.admin.revokeJoinCode, { codeId: joined.codeRow._id });
    const related = await f.t.run(async ctx => {
      const parentApp = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", signedIn.parentAuth)).unique();
      const parentInvite = await ctx.db.query("parentInvitations").withIndex("by_studentId", q => q.eq("studentId", joined.studentRow._id)).unique();
      const familyLink = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", joined.studentRow._id)).unique();
      const audits = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "joinRequests").eq("entityId", requestId!)).take(10);
      const codeAudits = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "joinCodes").eq("entityId", code.code)).take(10);
      const codeRevokeAudit = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "joinCodes").eq("entityId", joined.codeRow._id)).take(10);
      const inviteAudits = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "parentInvitations").eq("entityId", parentInvite!._id)).take(10);
      return { parentApp: parentApp!, parentInvite: parentInvite!, familyLink: familyLink!, audits, codeAudits, codeRevokeAudit, inviteAudits };
    });
    expect(related.parentInvite.attestationText).toContain("legal authority");
    f.manifest.accounts.push({ id: joined.studentApp._id, authUserId: signedIn.studentAuth, email: "test.student@example.invalid", name: "Test Student", role: "student" });
    f.manifest.accounts.push({ id: related.parentApp._id, authUserId: signedIn.parentAuth, email: "test.parent@example.invalid", name: "Test Parent", role: "parent" });
    f.manifest.students.push({ id: joined.studentRow._id, userId: joined.studentApp._id, email: "test.student@example.invalid", legalName: "Test Student" });
    f.manifest.authUsersToDelete.push({ id: signedIn.studentAuth, email: "test.student@example.invalid" }, { id: signedIn.parentAuth, email: "test.parent@example.invalid" });
    f.manifest.ids.authAccounts.push(signedIn.studentAccount, signedIn.parentAccount);
    f.manifest.ids.joinRequests.push(requestId!);
    f.manifest.ids.joinCodes.push(joined.codeRow._id);
    f.manifest.ids.parentInvitations.push(related.parentInvite._id);
    f.manifest.ids.familyLinks.push(related.familyLink._id);
    f.manifest.ids.financialAccounts.push(joined.account._id);
    f.manifest.ids.studentFinanceSummaries.push(joined.summary._id);
    f.manifest.ids.audit.push(...related.audits.map(a => a._id), ...related.codeAudits.map(a => a._id), ...related.codeRevokeAudit.map(a => a._id), ...related.inviteAudits.map(a => a._id));
    const leavesBefore = await f.t.run(ctx => reportAggregate.count(ctx, { namespace: financeNamespace(f.ids.season, financeMetrics[0]) }));
    expect(leavesBefore).toBe(1);
    const reviewed = await f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest });
    expect(reviewed.counts).toMatchObject({ students: 1, familyLinks: 1, parentInvitations: 1, joinRequests: 1, joinCodes: 1, studentFinanceSummaries: 1, financialAccounts: 1 });
    await f.t.mutation(internal.syntheticRehearsalCleanup.commit, { targetUrl, manifest: f.manifest, reviewedFingerprint: reviewed.fingerprint, reviewedCounts: reviewed.counts });
    for (const metric of financeMetrics) {
      expect(await f.t.run(ctx => reportAggregate.count(ctx, { namespace: financeNamespace(f.ids.season, metric) }))).toBe(0);
    }
    expect(await f.t.run(ctx => ctx.db.get(related.parentInvite._id))).toBeNull();
    expect(await f.t.run(ctx => ctx.db.get(f.ids.coach))).not.toBeNull();
  });

  it("refuses account deletion after participation appears", async () => {
    enabled();
    const f = await fixture();
    const student = await f.t.run(async ctx => {
      const studentAuth = await ctx.db.insert("users", { email: "test.student@example.invalid", emailVerificationTime: 1 });
      await ctx.db.insert("authAccounts", { userId: studentAuth, provider: "google", providerAccountId: "synthetic-student", emailVerified: "test.student@example.invalid" });
      const studentApp = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "test.student@example.invalid", name: "Test Student", role: "student", travelLead: false, financialEdit: false, active: true });
      const studentId = await ctx.db.insert("students", { seasonId: f.ids.season, userId: studentApp, email: "test.student@example.invalid", legalName: "Test Student", preferredName: "Test", subteam: "Programming", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const event = await ctx.db.insert("events", { seasonId: f.ids.season, name: "Practice", type: "Team", startsAt: 1, endsAt: 2, destination: "School", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
      await ctx.db.insert("participants", { eventId: event, studentId, status: "confirmed", createdAt: 1, updatedAt: 1 });
      return { studentId, studentApp, studentAuth };
    });
    f.manifest.accounts.push({ id: student.studentApp, authUserId: student.studentAuth, email: "test.student@example.invalid", name: "Test Student", role: "student" });
    f.manifest.students.push({ id: student.studentId, userId: student.studentApp, email: "test.student@example.invalid", legalName: "Test Student" });
    await expect(f.t.query(internal.syntheticRehearsalCleanup.preview, { targetUrl, manifest: f.manifest })).rejects.toThrow("Unexpected participants reference");
    expect(await f.t.run(ctx => ctx.db.get(student.studentId))).not.toBeNull();
  });
});
