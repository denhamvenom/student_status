/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
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
    return { coachAuth, studentAuth, otherStudentAuth, parentAuth, wrongAuth, student, other };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), student: t.withIdentity({ subject: `${ids.studentAuth}|session` }), otherStudent: t.withIdentity({ subject: `${ids.otherStudentAuth}|session` }), parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }), wrong: t.withIdentity({ subject: `${ids.wrongAuth}|session` }) };
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
    const parentView = await f.parent.query(api.app.viewer, {});
    expect(parentView.user?.role).toBe("parent");
    expect(parentView.students.map((x: { _id: string }) => x._id)).toEqual([f.ids.student]);
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
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.student })).rejects.toThrow("permission");
    await expect(f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" })).rejects.toThrow("revoked family link");
    await f.coach.mutation(api.parentInvites.restoreFamilyLink, { linkId: link._id, reason: "Verified by Coach" });
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
    expect((await f.parent.query(api.app.viewer, {})).students).toHaveLength(2);
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
      await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: child, active: true, createdBy: coach._id });
      return child;
    });
    expect((await f.parent.query(api.app.viewer, {})).students.map((student: { _id: string }) => student._id).sort()).toEqual([f.ids.student, f.ids.other].sort());
    await expect(f.parent.query(api.app.studentProfile, { studentId: archivedChild })).rejects.toThrow("unavailable");
    const firstLink = (await f.coach.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.student }))[0];
    const secondLink = (await f.coach.query(api.parentInvites.listFamilyLinks, { studentId: f.ids.other }))[0];
    await f.coach.mutation(api.parentInvites.revokeFamilyLink, { linkId: firstLink._id });
    expect((await f.parent.query(api.app.viewer, {})).students.map((student: { _id: string }) => student._id)).toEqual([f.ids.other]);
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.student })).rejects.toThrow("permission");
    await expect(f.parent.query(api.app.studentFinances, { studentId: f.ids.student })).rejects.toThrow("permission");
    await f.coach.mutation(api.parentInvites.revokeFamilyLink, { linkId: secondLink._id });
    expect((await f.parent.query(api.app.viewer, {})).students).toEqual([]);
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
