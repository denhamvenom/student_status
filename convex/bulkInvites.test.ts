/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = createTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Coach" });
    const applicantAuth = await ctx.db.insert("users", { email: "student@example.invalid", name: "Student Google", emailVerificationTime: 1 });
    const otherAuth = await ctx.db.insert("users", { email: "other@example.invalid", name: "Other", emailVerificationTime: 1 });
    await ctx.db.insert("authAccounts", { userId: applicantAuth, provider: "google", providerAccountId: "student", emailVerified: "student@example.invalid" });
    await ctx.db.insert("authAccounts", { userId: otherAuth, provider: "google", providerAccountId: "other", emailVerified: "other@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    return { coachAuth, applicantAuth, otherAuth, coach, season };
  });
  const coach = t.withIdentity({ subject: `${ids.coachAuth}|session` });
  const applicant = t.withIdentity({ subject: `${ids.applicantAuth}|session` });
  const other = t.withIdentity({ subject: `${ids.otherAuth}|session` });
  return { t, ids, coach, applicant, other };
}

describe("bulk student invitations", () => {
  it("requires Coach review, creates normal zero-balance records, and replays the same batch once", async () => {
    const f = await fixture();
    const existing = await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Alex Doe", preferredName: "Alex", firstName: "Alex", lastName: "Doe", email: "", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
    await expect(f.applicant.query(api.bulkInvites.preview, { students: [{ firstName: "Alex", lastName: "Doe" }] })).rejects.toThrow("waiting for approval");
    const preview = await f.coach.query(api.bulkInvites.preview, { students: [{ firstName: "Alex", lastName: "Doe" }, { firstName: "Alex", lastName: "Doe" }] });
    expect(preview.rows[0].matches[0].studentId).toBe(existing);
    expect(preview.rows[1].duplicateInUpload).toBe(true);
    const entries = [{ firstName: "Alex", lastName: "Doe", resolution: "link" as const, existingStudentId: existing }, { firstName: "Jamie", lastName: "Lee", resolution: "create" as const }];
    const result = await f.coach.mutation(api.bulkInvites.createBatch, { entries, idempotencyKey: "batch_0001" });
    expect(result).toMatchObject({ created: 1, linked: 1, skipped: 0 });
    expect(await f.coach.mutation(api.bulkInvites.createBatch, { entries, idempotencyKey: "batch_0001" })).toEqual(result);
    await expect(f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Changed", lastName: "Name", resolution: "create" }], idempotencyKey: "batch_0001" })).rejects.toThrow("different batch");
    const detail = await f.coach.query(api.bulkInvites.batchDetail, { batchId: result.batchId, asOf: Date.now() });
    expect(detail.invites).toHaveLength(2);
    expect(detail.invites[0].code).toMatch(/^DV-[0-9A-F]{32}$/);
    const newStudent = await f.t.run(ctx => ctx.db.get(detail.invites[1].studentId));
    expect(newStudent).toMatchObject({ firstName: "Jamie", lastName: "Lee", email: "", active: true, travelTeam: false });
    const account = await f.t.run(ctx => ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", detail.invites[1].studentId)).unique());
    expect(account).toMatchObject({ state: "ready", chargedCents: 0, paidCents: 0 });
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", detail.invites[1].studentId)).take(1))).toHaveLength(0);
  });

  it("requires confirmed duplicates and preserves an existing student's fields when redeemed", async () => {
    const f = await fixture();
    const studentId = await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Alex Doe", preferredName: "Lex", firstName: "Alex", lastName: "Doe", email: "", subteam: "Mechanical", active: true, travelTeam: true, roomCategoryLocked: true, allergies: { state: "reported", text: "peanuts" }, medications: { state: "none" } }));
    await expect(f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Alex", lastName: "Doe", resolution: "create" }], idempotencyKey: "batch_0002" })).rejects.toThrow("Confirm the duplicate");
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Alex", lastName: "Doe", resolution: "link", existingStudentId: studentId }], idempotencyKey: "batch_0003" });
    const detail = await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() });
    const code = detail.invites[0].code!;
    expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code })).toMatchObject({ status: "valid", studentName: "Alex Doe" });
    expect(await f.other.mutation(api.bulkInvites.redeem, { code })).toMatchObject({ studentId });
    expect(await f.other.mutation(api.bulkInvites.redeem, { code })).toMatchObject({ studentId });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null });
    const student = await f.t.run(ctx => ctx.db.get(studentId));
    expect(student).toMatchObject({ preferredName: "Lex", subteam: "Mechanical", travelTeam: true, allergies: { state: "reported", text: "peanuts" }, email: "other@example.invalid" });
    const after = await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() });
    expect(after.invites[0]).toMatchObject({ status: "redeemed", code: null });
    expect((await f.coach.query(api.bulkInvites.listBatches, {}))[0]).toMatchObject({ connectedCount: 1, pendingCount: 0 });
  });

  it("rotates and revokes codes without changing the student record", async () => {
    const f = await fixture();
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Jordan", lastName: "Lee", resolution: "create" }], idempotencyKey: "batch_0004" });
    const before = await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() });
    const first = before.invites[0];
    const rotated = await f.coach.mutation(api.bulkInvites.replace, { inviteId: first.inviteId, expectedCode: first.code! });
    expect(rotated.inviteId).toBe(first.inviteId);
    expect(rotated.code).not.toBe(first.code);
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: first.code! })).toEqual({ studentId: null });
    await expect(f.coach.mutation(api.bulkInvites.revoke, { inviteId: first.inviteId, expectedCode: first.code! })).rejects.toThrow("Invitation changed");
    await f.coach.mutation(api.bulkInvites.revoke, { inviteId: first.inviteId, expectedCode: rotated.code });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: rotated.code })).toEqual({ studentId: null });
    expect((await f.coach.query(api.bulkInvites.listBatches, {}))[0]).toMatchObject({ inviteCount: 1, pendingCount: 0, connectedCount: 0 });
    expect((await f.t.run(ctx => ctx.db.get(first.studentId)))?.userId).toBeUndefined();
  });

  it("limits repeated guesses and closes unexpired codes when the season closes", async () => {
    const f = await fixture();
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Morgan", lastName: "Lane", resolution: "create" }], idempotencyKey: "batch_0005" });
    const code = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0].code!;
    for (let i = 0; i < 10; i++) expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code: `DV-${i.toString(16).padStart(32, "0")}` })).toMatchObject({ status: "unavailable" });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null });
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.season, { endsAt: Date.now() - 1 }); });
    expect((await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0].code).toBeNull();
    expect(await f.other.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null });
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.season, { status: "archived" }); });
    expect(await f.other.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null });
  });

  it("keeps only one pending code when an older batch invitation is restored", async () => {
    const f = await fixture();
    const studentId = await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Casey Park", preferredName: "Casey", firstName: "Casey", lastName: "Park", email: "", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
    const entry = [{ firstName: "Casey", lastName: "Park", resolution: "link" as const, existingStudentId: studentId }];
    const a = await f.coach.mutation(api.bulkInvites.createBatch, { entries: entry, idempotencyKey: "batch_old1" });
    const first = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: a.batchId, asOf: Date.now() })).invites[0];
    const b = await f.coach.mutation(api.bulkInvites.createBatch, { entries: entry, idempotencyKey: "batch_new2" });
    const second = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: b.batchId, asOf: Date.now() })).invites[0];
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: first.code! })).toEqual({ studentId: null });
    const rotated = await f.coach.mutation(api.bulkInvites.replace, { inviteId: first.inviteId, expectedCode: "" });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: second.code! })).toEqual({ studentId: null });
    expect((await f.coach.query(api.bulkInvites.listBatches, {})).map(row => row.pendingCount)).toEqual([0, 1]);
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: rotated.code })).toEqual({ studentId });
  });

  it("keeps existing paid event records and roster details untouched through import and redemption", async () => {
    const f = await fixture();
    const eventId = await f.t.run(ctx => ctx.db.insert("events", { seasonId: f.ids.season, name: "Paid Whole Team", type: "Team", startsAt: Date.now() + 86_400_000, endsAt: Date.now() + 90_000_000, destination: "School", travel: "None", overnight: false, roomingEnabled: false, feeCents: 2500, signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 0, enrollmentState: "complete", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false }));
    const studentId = await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Taylor Reed", preferredName: "Tay", firstName: "Taylor", lastName: "Reed", email: "", subteam: "Programming", active: true, travelTeam: true, roomCategory: "Girls", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } }));
    const existing = await f.t.run(async ctx => ({
      participantId: await ctx.db.insert("participants", { eventId, studentId, status: "confirmed", createdAt: 100, updatedAt: 100 }),
      chargeId: await ctx.db.insert("charges", { eventId, studentId, label: "Paid Whole Team", amountCents: 2500, appliedCents: 0, priority: 1, createdBy: f.ids.coach, createdAt: 100 }),
      requestId: await ctx.db.insert("joinRequests", { authUserId: f.ids.applicantAuth, email: "student@example.invalid", firstName: "Taylor", lastName: "Reed", seasonId: f.ids.season, status: "pending", createdAt: 100 }),
    }));
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Taylor", lastName: "Reed", resolution: "link", existingStudentId: studentId }, { firstName: "New", lastName: "Student", resolution: "create" }], idempotencyKey: "batch_paid1" });
    const details = await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() });
    const newStudentId = details.invites[1].studentId;
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", newStudentId)).unique())).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", newStudentId)).unique())).toBeNull();
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: details.invites[0].code! })).toEqual({ studentId });
    expect(await f.t.run(ctx => ctx.db.get(studentId))).toMatchObject({ preferredName: "Tay", subteam: "Programming", travelTeam: true, roomCategory: "Girls" });
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique())).toMatchObject({ _id: existing.participantId, status: "confirmed", createdAt: 100 });
    expect(await f.t.run(ctx => ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique())).toMatchObject({ _id: existing.chargeId, amountCents: 2500, appliedCents: 0 });
    expect(await f.t.run(ctx => ctx.db.get(existing.requestId))).toMatchObject({ status: "approved" });
  });

  it("rejects non-Coach management and linked Google accounts", async () => {
    const f = await fixture();
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Sam", lastName: "Quinn", resolution: "create" }], idempotencyKey: "batch_role1" });
    const invite = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0];
    await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: f.ids.otherAuth, email: "other@example.invalid", name: "Other", role: "parent", travelLead: false, financialEdit: false, active: true }));
    await expect(f.other.query(api.bulkInvites.listBatches, {})).rejects.toThrow("permission");
    await expect(f.other.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).rejects.toThrow("permission");
    await expect(f.other.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "No", lastName: "Access", resolution: "create" }], idempotencyKey: "batch_role2" })).rejects.toThrow("permission");
    await expect(f.other.mutation(api.bulkInvites.revoke, { inviteId: invite.inviteId, expectedCode: invite.code! })).rejects.toThrow("permission");
    await expect(f.other.mutation(api.bulkInvites.replace, { inviteId: invite.inviteId, expectedCode: invite.code! })).rejects.toThrow("permission");
    expect(await f.other.mutation(api.bulkInvites.previewCode, { code: invite.code! })).toMatchObject({ status: "accountConflict" });
    expect(await f.other.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null });
  });
});
