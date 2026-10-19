/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";

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
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "student@example.invalid" })).rejects.toThrow("own identity");
    await expect(f.coach.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("permission");
  });

  it("keeps invite opaque until verified matching Google sign-in, then atomically links once", async () => {
    const f = await fixture();
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: " Parent@Example.Invalid " });
    expect(invite.expiresAt).toBeGreaterThan(Date.now());
    const stored = await f.t.run(ctx => ctx.db.query("parentInvitations").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique());
    expect(stored?.tokenHash).not.toBe(invite.token);
    expect(JSON.stringify(stored)).not.toContain(invite.token);
    const unsigned = await f.t.mutation(api.parentInvites.previewParentInvite, { token: invite.token });
    expect(unsigned).toEqual({ status: "signInRequired", studentName: null, parentEmail: null, expiresAt: null, attestationText: null, attestationVersion: null });
    const mismatched = await f.wrong.mutation(api.parentInvites.previewParentInvite, { token: invite.token });
    expect(mismatched.studentName).toBeNull();
    await expect(f.wrong.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("invited verified");
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("relationship");
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: false, attestationVersion: "parent-relationship-1" })).rejects.toThrow("attestation");
    expect((await f.parent.mutation(api.parentInvites.previewParentInvite, { token: invite.token })).studentName).toBe("Student");
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Mother", authorityAttested: true, attestationVersion: "stale-version" })).rejects.toThrow("Current relationship");
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
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    await expect(f.student.mutation(api.parentInvites.setInvitationEnabled, { enabled: false })).rejects.toThrow("permission");
    await f.coach.mutation(api.parentInvites.setInvitationEnabled, { enabled: false });
    expect((await f.student.query(api.parentInvites.invitationSettings, {})).enabled).toBe(false);
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("disabled");
    await f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Father", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    expect((await f.student.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student })).length).toBe(1);
  });

  it("rejects expired, replaced, revoked, and unverified invitations", async () => {
    const f = await fixture();
    const first = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    const next = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: first.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("unavailable");
    await f.t.run(async ctx => {
      const row = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail", q => q.eq("studentId", f.ids.student).eq("parentEmail", "parent@example.invalid")).order("desc").first();
      if (row) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
    });
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: next.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("expired");
    const fresh = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    const invite = (await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0];
    await f.coach.mutation(api.parentInvites.revokeParentInvite, { inviteId: invite._id });
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: fresh.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("unavailable");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("Coach");
    await f.coach.mutation(api.parentInvites.allowParentReinvite, { inviteId: invite._id, reason: "Verified request" });
    const unverified = await f.t.run(async ctx => { const id = await ctx.db.insert("users", { email: "unverified@example.invalid", name: "Unverified", emailVerificationTime: Date.now() }); await ctx.db.insert("authAccounts", { userId: id, provider: "google", providerAccountId: "google-unverified" }); return id; });
    const newInvite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "unverified@example.invalid" });
    await expect(f.t.withIdentity({ subject: `${unverified}|session` }).mutation(api.parentInvites.acceptParentInvite, { token: newInvite.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("verified Google");
  });

  it("does not elevate existing roles; Coach revocation blocks new invitations until restoration", async () => {
    const f = await fixture();
    const conflicting = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "wrong@example.invalid" });
    await f.t.run(async ctx => { await ctx.db.insert("appUsers", { authUserId: f.ids.wrongAuth, email: "wrong@example.invalid", name: "Wrong", role: "mentor", active: true, travelLead: false, financialEdit: false }); });
    await expect(f.wrong.mutation(api.parentInvites.acceptParentInvite, { token: conflicting.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow("another role");
    expect((await f.wrong.query(api.app.viewer, {})).user?.role).toBe("mentor");
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    await f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    const link = (await f.student.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student }))[0];
    await expect(f.student.mutation(api.parentInvites.revokeFamilyLink, { linkId: link._id })).rejects.toThrow("permission");
    await f.coach.mutation(api.parentInvites.revokeFamilyLink, { linkId: link._id });
    await f.t.run(ctx => ctx.db.patch(link._id, { seasonId: undefined }));
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.student })).rejects.toThrow("permission");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("revoked family link");
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
    const a = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    const b = await f.otherStudent.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.other, parentEmail: "parent@example.invalid" });
    const c = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent2@example.invalid" });
    for (const token of [a.token, b.token]) await f.parent.mutation(api.parentInvites.acceptParentInvite, { token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    await parent2.mutation(api.parentInvites.acceptParentInvite, { token: c.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" });
    expect((await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 50, cursor: null } })).page).toHaveLength(2);
    expect(await f.student.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student })).toHaveLength(2);
  });

  it("shows only current-season children and removes each revoked child from all family access", async () => {
    const f = await fixture();
    const first = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    const second = await f.otherStudent.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.other, parentEmail: "parent@example.invalid" });
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
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("revoked invitation");
    const actionable = await f.coach.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student });
    expect(actionable.find(row => row._id === revokedId)?.status).toBe("revoked");
    await f.coach.mutation(api.parentInvites.allowParentReinvite, { inviteId: actionable.find(row => row._id === revokedId)!._id, reason: "Resolved" });
    expect((await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps inactive and archived student records outside the invitation flow", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { active: false }));
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow();
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { active: true }));
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    await f.t.run(async ctx => { const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique(); if (season) await ctx.db.patch(season._id, { status: "archived" }); });
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: invite.token, relationship: "Guardian", authorityAttested: true, attestationVersion: "parent-relationship-1" })).rejects.toThrow();
  });
});

describe("parent invitation email", () => {
  it("defaults to visible unsent status without configuration and never calls a provider", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "false");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    expect(invite.inviteId).toBeTruthy();
    const row = (await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0];
    expect(row.emailStatus).toBe("not_sent");
    expect(row.emailError).toContain("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps email unsent when opt-in lacks a trusted sender or origin", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "synthetic-key");
    vi.stubEnv("PARENT_INVITE_EMAIL_FROM", "invites@example.test");
    vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "http://untrusted.example.test");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    expect((await f.t.run(ctx => ctx.db.get(invite.inviteId)))?.emailStatus).toBe("not_sent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a minimal email with a fragment link and records provider acceptance", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    expect((await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0].emailStatus).toBe("queued");
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    const row = (await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0];
    expect(row.emailStatus).toBe("sent");
    expect(row.emailError).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(url).toBe("https://api.resend.com/emails");
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).toBe(`parent-invite/${invite.inviteId}`);
    expect(body.to).toEqual(["parent@example.invalid"]);
    expect(body.reply_to).toBe("coach@team8044.org");
    expect(body.text).toContain(`/invite-parent#token=${invite.token}`);
    expect(body.html).toContain("Open invitation");
    expect(body.html).not.toContain("Synthetic Student");
    expect(body.text).toContain("Google account");
    expect(JSON.stringify(await f.t.run(ctx => ctx.db.get(invite.inviteId)))).not.toContain(invite.token);
  });

  it("does not send revoked, replaced, or expired invitations", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    const revoked = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "first@example.invalid" });
    await f.coach.mutation(api.parentInvites.revokeParentInvite, { inviteId: revoked.inviteId });
    await f.t.action(internal.parentInviteEmail.send, { inviteId: revoked.inviteId, token: revoked.token, attempt: 1 });
    const replaced = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "second@example.invalid" });
    await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "second@example.invalid" });
    await f.t.action(internal.parentInviteEmail.send, { inviteId: replaced.inviteId, token: replaced.token, attempt: 1 });
    const expired = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "third@example.invalid" });
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
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 1 });
    expect((await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0].emailStatus).toBe("queued");
    await f.t.action(internal.parentInviteEmail.send, { inviteId: invite.inviteId, token: invite.token, attempt: 2 });
    expect((await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student }))[0].emailStatus).toBe("sent");
    const stalled = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "stalled@example.invalid" });
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
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
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
    const invite = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
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
    for (let i = 0; i < 10; i++) await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: `parent${i}@example.invalid` });
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "extra@example.invalid" })).rejects.toThrow("Too many email invitations");
  });

  it("limits repeated mail to one recipient", async () => {
    vi.useFakeTimers(); enableSyntheticEmail();
    const f = await fixture();
    for (let i = 0; i < 3; i++) await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("Too many email invitations");
  });
});
