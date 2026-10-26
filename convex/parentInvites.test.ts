/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { exportPKCS8, generateKeyPair } from "jose";

const privateTokens = vi.hoisted(() => ({ counter: 0, last: "" }));
vi.mock("./lib/invitationIdentity", async importOriginal => {
  const original = await importOriginal<typeof import("./lib/invitationIdentity")>();
  return { ...original, newToken: () => {
    const token = (++privateTokens.counter).toString(16).padStart(64, "0");
    privateTokens.last = token;
    return token;
  } };
});
async function attachToken<T extends { inviteId: Id<"parentInvitations"> }>(pending: Promise<T>): Promise<T & { token: string }> {
  const result = await pending;
  expect(Object.keys(result).sort()).toEqual(["expiresAt", "inviteId"]);
  return { ...result, token: privateTokens.last };
}

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Coach" });
    const studentAuth = await ctx.db.insert("users", { email: "student@example.invalid", name: "Student" });
    const otherStudentAuth = await ctx.db.insert("users", { email: "other@example.invalid", name: "Other" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid", name: "Parent", emailVerificationTime: Date.now() });
    const wrongAuth = await ctx.db.insert("users", { email: "wrong@example.invalid", name: "Wrong", emailVerificationTime: Date.now() });
    await ctx.db.insert("authAccounts", { userId: parentAuth, provider: "google", providerAccountId: "google-parent", emailVerified: "parent@example.invalid" });
    await ctx.db.insert("authAccounts", { userId: wrongAuth, provider: "google", providerAccountId: "google-wrong", emailVerified: "wrong@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const studentUser = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
    const otherUser = await ctx.db.insert("appUsers", { authUserId: otherStudentAuth, email: "other@example.invalid", name: "Other", role: "student", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT-1", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser, legalName: "Synthetic Student", preferredName: "Student", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const other = await ctx.db.insert("students", { seasonId: season, userId: otherUser, legalName: "Synthetic Other", preferredName: "Other", email: "other@example.invalid", subteam: "B", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 0, unresolved: 0, updatedAt: 0, generation: 1, startedBy: coach });
    return { coachAuth, studentAuth, otherStudentAuth, parentAuth, wrongAuth, student, other };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), student: t.withIdentity({ subject: `${ids.studentAuth}|session` }), otherStudent: t.withIdentity({ subject: `${ids.otherStudentAuth}|session` }), parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }), wrong: t.withIdentity({ subject: `${ids.wrongAuth}|session` }) };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
beforeEach(() => { enableSyntheticEmail(); });

function enableSyntheticEmail() {
  vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  vi.stubEnv("PARENT_INVITE_EMAIL_FROM", "Denham Venom <invites@example.test>");
  vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "https://student.example.test");
  vi.stubEnv("SITE_URL", "https://student.example.test");
}

describe("parent invitations", () => {
  it("requires own student scope and rejects a student's own email", async () => {
    const f = await fixture();
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.other, parentEmail: "parent@example.invalid" })).rejects.toThrow("own");
    await expect(f.otherStudent.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("own");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "student@example.invalid" })).rejects.toThrow("not your own");
    await expect(f.coach.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("permission");
  });

  it("keeps invite opaque until verified matching Google sign-in, then atomically links once", async () => {
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: " Parent@Example.Invalid " }));
    expect(invite.expiresAt).toBeGreaterThan(Date.now());
    const stored = await f.t.run(ctx => ctx.db.query("parentInvitations").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique());
    expect(stored?.tokenHash).not.toBe(invite.token);
    expect(JSON.stringify(stored)).not.toContain(invite.token);
    const unsigned = await f.t.mutation(api.parentInvites.previewParentInvite, { token: invite.token });
    expect(unsigned).toEqual({ status: "signInRequired", studentName: null, parentEmail: null, expiresAt: null, attestationText: null, attestationVersion: null });
    const mismatched = await f.wrong.mutation(api.parentInvites.previewParentInvite, { token: invite.token });
    expect(mismatched.studentName).toBeNull();
    await expect(f.wrong.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("invited parent");
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("relationship");
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: false, attestationVersion: "parent-relationship-1" })).rejects.toThrow("parent or legal guardian");
    expect((await f.parent.mutation(api.parentInvites.previewParentInvite, { token: invite.token })).studentName).toBe("Student");
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: true, attestationVersion: "stale-version" })).rejects.toThrow("relationship to the student");
    expect(await f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: true, attestationVersion: "parent-relationship-1" })).toEqual({ studentId: f.ids.student });
    const accepted = await f.t.run(ctx => ctx.db.query("parentInvitations").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique());
    expect(accepted?.attestationVersion).toBe("parent-relationship-1");
    expect(accepted?.attestationText).toContain("legal authority");
    expect(accepted?.attestedAt).toBeGreaterThan(0);
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("unavailable");
    const links = await f.student.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student });
    expect(links).toHaveLength(1);
    expect(links[0].active).toBe(true);
    const storedLink = await f.t.run(ctx => ctx.db.get(links[0]._id));
    const storedStudent = await f.t.run(ctx => ctx.db.get(f.ids.student));
    expect(storedLink?.seasonId).toBe(storedStudent?.seasonId);
    const parentView = await f.parent.query(api.app.viewer, {});
    expect(parentView.user?.role).toBe("parent");
    expect((await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 50, cursor: null } })).page.map(x => x._id)).toEqual([f.ids.student]);
  });

  it("honors outstanding invites when Coach disables new creation and replacement", async () => {
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await expect(f.student.mutation(api.parentInvites.setInvitationEnabled, { enabled: false })).rejects.toThrow("permission");
    await f.coach.mutation(api.parentInvites.setInvitationEnabled, { enabled: false });
    expect((await f.student.query(api.parentInvites.invitationSettings, {})).enabled).toBe(false);
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("turned off new parent invitations");
    await f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Father", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    expect((await f.student.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student })).length).toBe(1);
  });

  it("rejects expired, replaced, revoked, and unverified invitations", async () => {
    const f = await fixture();
    const first = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.t.run(ctx => ctx.db.patch(first.inviteId, { createdAt: Date.now() - 60 * 60_000 }));
    const next = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: first.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("unavailable");
    await f.t.run(async ctx => {
      const row = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail", q => q.eq("studentId", f.ids.student).eq("parentEmail", "parent@example.invalid")).order("desc").first();
      if (row) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
    });
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: next.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("expired");
    const fresh = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    const invite = (await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0];
    await f.coach.mutation(api.parentInvites.revokeParentInvite, { inviteId: invite._id });
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: fresh.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("unavailable");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("Coach");
    await f.coach.mutation(api.parentInvites.allowParentReinvite, { inviteId: invite._id, reason: "Verified request" });
    const unverified = await f.t.run(async ctx => { const id = await ctx.db.insert("users", { email: "unverified@example.invalid", name: "Unverified", emailVerificationTime: Date.now() }); await ctx.db.insert("authAccounts", { userId: id, provider: "google", providerAccountId: "google-unverified" }); return id; });
    const newInvite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "unverified@example.invalid" }));
    await expect(f.t.withIdentity({ subject: `${unverified}|session` }).mutation(api.parentInvites.acceptParentInvite, { token: newInvite.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("invited parent");
  });

  it("resends only the latest own pending invite at the exact one-hour boundary", async () => {
    const f = await fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const first = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await expect(f.t.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("Sign in");
    await expect(f.coach.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("permission");
    await expect(f.otherStudent.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("unavailable");
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("one hour");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: " PARENT@example.invalid " })).rejects.toMatchObject({ data: expect.stringMatching(/Wait one hour.*inbox and spam folder/) });
    const now = Date.now();
    await f.t.run(ctx => ctx.db.patch(first.inviteId, { createdAt: now - 60 * 60_000 + 1 }));
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("one hour");
    await f.t.run(ctx => ctx.db.patch(first.inviteId, { createdAt: now - 2 * 60 * 60_000, emailSentAt: now - 60 * 60_000 + 1 }));
    expect((await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0].resendAvailableAt).toBe(now + 1);
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("one hour");
    await f.t.run(ctx => ctx.db.patch(first.inviteId, { emailSentAt: now - 60 * 60_000 }));
    const second = await attachToken(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId }));
    expect(second.inviteId).not.toBe(first.inviteId);
    expect(second.token).not.toBe(first.token);
    expect(second.expiresAt).toBeGreaterThan(first.expiresAt - 1000);
    const rows = await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student });
    expect(rows.find(row => row._id === first.inviteId)?.status).toBe("replaced");
    expect(rows.find(row => row._id === second.inviteId)?.resendAvailableAt).toBe(rows.find(row => row._id === second.inviteId)!.createdAt + 60 * 60_000);
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: first.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("unavailable");
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("unavailable");
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: second.inviteId })).rejects.toThrow("one hour");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("one hour");
    expect((await f.t.run(ctx => ctx.db.get(second.inviteId)))?.status).toBe("pending");
  });

  it("rejects resend after acceptance, revocation, expiry, pause, or student deactivation", async () => {
    const f = await fixture();
    const accepted = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.parent.mutation(api.parentInvites.acceptParentInvite, { token: accepted.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: accepted.inviteId })).rejects.toThrow("unavailable");
    const revoked = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "revoked@example.invalid" }));
    await f.coach.mutation(api.parentInvites.revokeParentInvite, { inviteId: revoked.inviteId });
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: revoked.inviteId })).rejects.toThrow("unavailable");
    const expired = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "expired@example.invalid" }));
    await f.t.run(ctx => ctx.db.patch(expired.inviteId, { expiresAt: Date.now() - 1 }));
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: expired.inviteId })).rejects.toThrow("unavailable");
    const paused = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "paused@example.invalid" }));
    await f.coach.mutation(api.parentInvites.setInvitationEnabled, { enabled: false });
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: paused.inviteId })).rejects.toThrow("turned off new parent invitations");
    await f.coach.mutation(api.parentInvites.setInvitationEnabled, { enabled: true });
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { active: false }));
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: paused.inviteId })).rejects.toThrow();
  });

  it("allows only one replacement when resend requests race", async () => {
    const f = await fixture();
    const first = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.t.run(ctx => ctx.db.patch(first.inviteId, { createdAt: Date.now() - 60 * 60_000 }));
    const results = await Promise.allSettled([
      f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId }),
      f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const rows = await f.t.run(ctx => ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail_and_status", q => q.eq("studentId", f.ids.student).eq("parentEmail", "parent@example.invalid").eq("status", "pending")).take(10));
    expect(rows).toHaveLength(1);
  });

  it("does not elevate existing roles; Coach revocation blocks new invitations until restoration", async () => {
    const f = await fixture();
    const conflicting = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "wrong@example.invalid" }));
    await f.t.run(async ctx => { await ctx.db.insert("appUsers", { authUserId: f.ids.wrongAuth, email: "wrong@example.invalid", name: "Wrong", role: "mentor", active: true, travelLead: false, financialEdit: false }); });
    await expect(f.wrong.mutation(api.parentInvites.acceptParentInvite, { token: conflicting.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("another role");
    expect((await f.wrong.query(api.app.viewer, {})).user?.role).toBe("mentor");
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    const link = (await f.student.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student }))[0];
    await expect(f.student.mutation(api.parentInvites.revokeFamilyLink, { linkId: link._id })).rejects.toThrow("permission");
    await f.coach.mutation(api.parentInvites.revokeFamilyLink, { linkId: link._id });
    await f.t.run(ctx => ctx.db.patch(link._id, { seasonId: undefined }));
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.student })).rejects.toThrow("permission");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("removed this parent's access");
    await f.coach.mutation(api.parentInvites.restoreFamilyLink, { linkId: link._id, reason: "Verified by Coach" });
    const restoredLink = await f.t.run(ctx => ctx.db.get(link._id));
    const restoredStudent = await f.t.run(ctx => ctx.db.get(f.ids.student));
    expect(restoredLink?.seasonId).toBe(restoredStudent?.seasonId);
    expect((await f.parent.query(api.app.studentProfile, { studentId: f.ids.student }))._id).toBe(f.ids.student);
    const audits = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "familyLinks").eq("entityId", link._id)).take(10));
    expect(audits.map(x => x.action)).toContain("restore");
  });

  it("supports a parent linked to two students and two parents linked to one student", async () => {
    const f = await fixture();
    const parent2Auth = await f.t.run(async ctx => { const id = await ctx.db.insert("users", { email: "parent2@example.invalid", name: "Parent Two", emailVerificationTime: Date.now() }); await ctx.db.insert("authAccounts", { userId: id, provider: "google", providerAccountId: "google-parent2", emailVerified: "parent2@example.invalid" }); return id; });
    const parent2 = f.t.withIdentity({ subject: `${parent2Auth}|session` });
    const a = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    const b = await attachToken(f.otherStudent.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.other, parentEmail: "parent@example.invalid" }));
    const c = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent2@example.invalid" }));
    for (const token of [a.token, b.token]) await f.parent.mutation(api.parentInvites.acceptParentInvite, { token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    await parent2.mutation(api.parentInvites.acceptParentInvite, { token: c.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    expect((await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 50, cursor: null } })).page).toHaveLength(2);
    expect(await f.student.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student })).toHaveLength(2);
  });

  it("shows only current-season children and removes each revoked child from all family access", async () => {
    const f = await fixture();
    const first = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    const second = await attachToken(f.otherStudent.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.other, parentEmail: "parent@example.invalid" }));
    for (const token of [first.token, second.token]) await f.parent.mutation(api.parentInvites.acceptParentInvite, { token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    const archivedChild = await f.t.run(async ctx => {
      const parent = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.parentAuth)).unique();
      const coach = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.coachAuth)).unique();
      if (!parent || !coach) throw new Error("Fixture parent or Coach missing");
      const archived = await ctx.db.insert("seasons", { name: "Synthetic prior", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT-0", createdBy: coach._id });
      const child = await ctx.db.insert("students", { seasonId: archived, legalName: "Prior Child", preferredName: "Prior", email: "prior@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: child, seasonId: archived, active: true, createdBy: coach._id });
      return child;
    });
    expect((await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 50, cursor: null } })).page.map((student: { _id: string }) => student._id).sort()).toEqual([f.ids.student, f.ids.other].sort());
    await expect(f.parent.query(api.app.studentProfile, { studentId: archivedChild })).rejects.toThrow("unavailable");
    const firstLink = (await f.coach.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student }))[0];
    const secondLink = (await f.coach.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.other }))[0];
    await f.coach.mutation(api.parentInvites.revokeFamilyLink, { linkId: firstLink._id });
    expect((await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 50, cursor: null } })).page.map((student: { _id: string }) => student._id)).toEqual([f.ids.other]);
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.student })).rejects.toThrow("permission");
    await expect(f.parent.query(api.app.studentFinances, { studentId: f.ids.student })).rejects.toThrow("permission");
    await f.coach.mutation(api.parentInvites.revokeFamilyLink, { linkId: secondLink._id });
    expect((await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 50, cursor: null } })).page).toEqual([]);
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.other })).rejects.toThrow("permission");
    await expect(f.parent.query(api.app.studentFinances, { studentId: f.ids.other })).rejects.toThrow("permission");
  });

  it("ignores long replaced history but still detects an old Coach revocation", async () => {
    const f = await fixture();
    const revokedId = await f.t.run(async ctx => {
      const actor = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.studentAuth)).unique();
      if (!actor) throw new Error("Fixture actor missing");
      const revokedId = await ctx.db.insert("parentInvitations", { studentId: f.ids.student, parentEmail: "parent@example.invalid", tokenHash: "revoked-old", status: "revoked", createdBy: actor._id, createdAt: 0, expiresAt: 1 });
      for (let i = 0; i < 101; i++) await ctx.db.insert("parentInvitations", { studentId: f.ids.student, parentEmail: "parent@example.invalid", tokenHash: `old-${i}`, status: "replaced", createdBy: actor._id, createdAt: i, expiresAt: i + 1 });
      return revokedId;
    });
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("canceled an earlier invitation");
    const actionable = await f.coach.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student });
    expect(actionable.find(row => row._id === revokedId)?.status).toBe("revoked");
    await f.coach.mutation(api.parentInvites.allowParentReinvite, { inviteId: actionable.find(row => row._id === revokedId)!._id, reason: "Resolved" });
    expect((await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }))).token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps inactive and archived student records outside the invitation flow", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { active: false }));
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow();
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { active: true }));
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.t.run(async ctx => { const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique(); if (season) await ctx.db.patch(season._id, { status: "archived" }); });
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow();
  });
});

describe("parent invitation email", () => {
  it("rejects creation without private email delivery and never calls a provider", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "false");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("Parent invitation emails are turned off");
    expect(await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects creation when opt-in lacks a trusted origin", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "synthetic-key");
    vi.stubEnv("PARENT_INVITE_EMAIL_FROM", "invites@example.test");
    vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "http://untrusted.example.test");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("Parent invitation emails are turned off");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a minimal email with a fragment link and records provider acceptance", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    expect((await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0].emailStatus).toBe("queued");
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    const row = (await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0];
    expect(row.emailStatus).toBe("sent");
    expect(row.emailError).toBeNull();
    // Earlier tests' scheduled sends can reach this global fetch stub under load; check only this invitation's sends.
    const ours = (fetchMock.mock.calls as [string, RequestInit][]).filter(([, init]) => (init.headers as Record<string, string>)["Idempotency-Key"] === `parent-invite/${invite.inviteId}`);
    expect(ours).toHaveLength(1);
    const [url, request] = ours[0];
    const body = JSON.parse(String(request.body));
    expect(url).toBe("https://api.resend.com/emails");
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).toBe(`parent-invite/${invite.inviteId}`);
    expect(body.to).toEqual(["parent@example.invalid"]);
    expect(body.reply_to).toBe("coach@team8044.org");
    expect(body.text).toContain(`/invite-parent#token=${invite.token}`);
    expect(body.html).toContain("Open private invitation");
    // The instructions name the button that is in the email and give one time limit.
    expect(body.html).toContain("Choose Open private invitation");
    expect(body.html).not.toContain("Continue");
    expect(body.html).not.toContain("24 hours");
    expect(body.subject).toBe("Parent invitation to Denham Venom Student Status");
    expect(body.html).not.toContain("Synthetic Student");
    expect(body.text).toContain("private link");
    expect(JSON.stringify(await f.t.run(ctx => ctx.db.get(invite.inviteId)))).not.toContain(invite.token);
  });

  it("does not send revoked, replaced, or expired invitations", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const revoked = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "first@example.invalid" }));
    await f.coach.mutation(api.parentInvites.revokeParentInvite, { inviteId: revoked.inviteId });
    await f.t.action(internal.parentInviteEmail.send, { inviteId: revoked.inviteId, token: revoked.token, attempt: 1 });
    const replaced = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "second@example.invalid" }));
    await f.t.run(ctx => ctx.db.patch(replaced.inviteId, { createdAt: Date.now() - 60 * 60_000 }));
    await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "second@example.invalid" }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: replaced.inviteId, token: replaced.token, attempt: 1 });
    const expired = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "third@example.invalid" }));
    await f.t.run(ctx => ctx.db.patch(expired.inviteId, { expiresAt: Date.now() - 1 }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: expired.inviteId, token: expired.token, attempt: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    const rows = await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student });
    for (const id of [revoked.inviteId, replaced.inviteId, expired.inviteId]) expect(rows.find(row => row._id === id)?.emailStatus).toBe("not_sent");
  });

  it("retries temporary failures and fails closed if a queued job stalls", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    expect((await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0].emailStatus).toBe("queued");
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 2 });
    expect((await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0].emailStatus).toBe("sent");
    const stalled = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "stalled@example.invalid" }));
    await f.t.mutation(internal.parentInviteEmail.markStalled, { inviteId: stalled.inviteId });
    expect((await f.t.run(ctx => ctx.db.get(stalled.inviteId)))?.emailStatus).toBe("failed");
    await f.t.action(internal.parentInviteEmail.send, { inviteId: stalled.inviteId, token: stalled.token, attempt: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks permanent provider rejection failed without exposing provider text", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const fetchMock = vi.fn().mockResolvedValue(new Response("secret provider details", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    const row = (await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0];
    expect(row.emailStatus).toBe("failed");
    expect(row.emailError).not.toContain("secret provider details");
  });

  it("runs the scheduled job and exhausts bounded retries with one provider key", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const fetchMock = vi.fn().mockResolvedValue(new Response("temporary failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    vi.advanceTimersByTime(1);
    await f.t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(60_000);
    await f.t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(5 * 60_000);
    await f.t.finishInProgressScheduledFunctions();
    const row = (await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0];
    expect(row.emailStatus).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([, request]) => (request.headers as Record<string, string>)["Idempotency-Key"])).toEqual(Array(3).fill(`parent-invite/${invite.inviteId}`));
  });

  it("caps automatic mail creation across changing recipients", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const f = await fixture();
    for (let i = 0; i < 10; i++) await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: `parent${i}@example.invalid` }));
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "extra@example.invalid" })).rejects.toThrow("Too many invitations were sent recently");
  });

  it("does not schedule mail for a cooldown rejection", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const f = await fixture();
    const first = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("one hour");
    await expect(f.student.mutation(api.parentInvites.resendParentInvite, { inviteId: first.inviteId })).rejects.toThrow("one hour");
    const pending = await f.t.run(ctx => ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail_and_status", q => q.eq("studentId", f.ids.student).eq("parentEmail", "parent@example.invalid").eq("status", "pending")).take(10));
    expect(pending).toHaveLength(1);
  });
});

describe("private parent email authentication", () => {
  it("issues an Auth session only for a sent, one-use private invitation", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
    vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    const returned = await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student });
    expect(JSON.stringify(returned)).not.toContain(invite.token);
    await f.t.run(ctx => ctx.db.patch(invite.inviteId, { emailStatus: "failed" }));
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "invite", token: invite.token } })).tokens).toBeNull();
    await f.t.run(ctx => ctx.db.patch(invite.inviteId, { emailStatus: "queued", emailAttempt: undefined }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    const signedIn = await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "invite", token: invite.token } });
    expect(signedIn.tokens?.token).toBeTruthy();
    expect(signedIn.tokens?.refreshToken).toBeTruthy();
    const session = await f.t.run(ctx => ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", f.ids.parentAuth)).first());
    expect(session?.userId).toBe(f.ids.parentAuth);
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "invite", token: invite.token } })).tokens).toBeNull();
    const marker = await f.t.run(ctx => ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.parentAuth)).unique());
    expect(marker?.email).toBe("parent@example.invalid");
    const parentSession = f.t.withIdentity({ subject: `${f.ids.parentAuth}|${session!._id}` });
    expect((await parentSession.mutation(api.parentInvites.previewParentInvite, { token: invite.token })).status).toBe("valid");
    await expect(parentSession.mutation(api.app.requestJoin, { code: "FAKE", firstName: "P", lastName: "X" })).rejects.toThrow("Google");
  });

  it("uses an emailed code when the first-time private login window expired", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
    vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    await f.t.run(ctx => ctx.db.patch(invite.inviteId, { loginExpiresAt: Date.now() - 1 }));
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "invite", token: invite.token } })).tokens).toBeNull();
    expect(await f.t.action(api.parentEmailAuth.requestCode, { email: "parent@example.invalid", inviteToken: invite.token })).toEqual({ sent: true });
    const body = JSON.parse(String((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body)) as { text: string };
    const code = body.text.match(/\b[0-9]{6}\b/)?.[0];
    expect(code).toMatch(/^[0-9]{6}$/);
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email: "parent@example.invalid", code: "000000" === code ? "999999" : "000000" } })).tokens).toBeNull();
    const signedIn = await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email: "parent@example.invalid", code } });
    expect(signedIn.tokens?.token).toBeTruthy();
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email: "parent@example.invalid", code } })).tokens).toBeNull();
    await f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Parent", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    expect((await f.parent.query(api.app.viewer, {})).user?.role).toBe("parent");
  });

  it("creates a parent-only identity for a first-time email recipient without Google", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
    vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const email = "fresh.parent@example.invalid";
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: email }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    await f.t.run(ctx => ctx.db.patch(invite.inviteId, { loginExpiresAt: Date.now() - 1 }));
    await f.t.action(api.parentEmailAuth.requestCode, { email, inviteToken: invite.token });
    const body = JSON.parse(String((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body)) as { text: string };
    const code = body.text.match(/\b[0-9]{6}\b/)?.[0];
    const signedIn = await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email, code } });
    expect(signedIn.tokens?.token).toBeTruthy();
    const marker = await f.t.run(ctx => ctx.db.query("parentEmailIdentities").withIndex("by_email", q => q.eq("email", email)).unique());
    expect(marker).toBeTruthy();
    expect(await f.t.run(ctx => ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", marker!.authUserId).eq("provider", "google")).take(1))).toEqual([]);
    const session = await f.t.run(ctx => ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", marker!.authUserId)).first());
    const parent = f.t.withIdentity({ subject: `${marker!.authUserId}|${session!._id}` });
    expect((await parent.mutation(api.parentInvites.previewParentInvite, { token: invite.token })).status).toBe("valid");
    await parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    expect((await parent.query(api.app.viewer, {})).user?.role).toBe("parent");
  });

  it("never upgrades a legacy shared invitation or a student address into a parent login", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
    vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
    const f = await fixture();
    const legacyToken = "b".repeat(64);
    await f.t.run(async ctx => {
      const actor = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.studentAuth)).unique();
      await ctx.db.insert("parentInvitations", { studentId: f.ids.student, parentEmail: "parent@example.invalid", tokenHash: await (await import("./lib/invitationIdentity")).tokenHash(legacyToken), status: "pending", emailStatus: "sent", createdBy: actor!._id, createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60_000 });
    });
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "invite", token: legacyToken } })).tokens).toBeNull();
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "student2@example.invalid" }));
    await f.t.run(async ctx => {
      const app = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.otherStudentAuth)).unique();
      await ctx.db.patch(app!._id, { email: "student2@example.invalid" });
      await ctx.db.patch(f.ids.otherStudentAuth, { email: "student2@example.invalid", emailVerificationTime: Date.now() });
      await ctx.db.patch(invite.inviteId, { emailStatus: "sent" });
    });
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "invite", token: invite.token } })).tokens).toBeNull();
  });

  it("persists the five-attempt OTP cap and rejects an expired code through Auth", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
    vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const email = "fresh.parent@example.invalid";
    const invite = await attachToken(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: email }));
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    await f.t.action(api.parentEmailAuth.requestCode, { email, inviteToken: invite.token });
    const body = JSON.parse(String((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body)) as { text: string };
    const code = body.text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
    const wrong = code === "000000" ? "999999" : "000000";
    for (let i = 0; i < 5; i++) expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email, code: wrong } })).tokens).toBeNull();
    const stored = await f.t.run(ctx => ctx.db.query("parentEmailCodes").withIndex("by_email_and_createdAt", q => q.eq("email", email)).order("desc").first());
    expect(stored?.attempts).toBe(5);
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email, code } })).tokens).toBeNull();
    await f.t.run(ctx => ctx.db.patch(stored!._id, { attempts: 0, expiresAt: Date.now() - 1 }));
    expect((await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email, code } })).tokens).toBeNull();
  });
});
