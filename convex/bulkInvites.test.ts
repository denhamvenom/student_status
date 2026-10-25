/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
import { tokenHash } from "./lib/invitationIdentity";

const modules = import.meta.glob("./**/*.ts");
async function approve(f: Awaited<ReturnType<typeof fixture>>, applicant: Awaited<ReturnType<typeof fixture>>["applicant"], code: string) {
  const result = await applicant.mutation(api.bulkInvites.redeem, { code });
  expect(result.studentId).toBeNull();
  expect(result.requestId).not.toBeNull();
  await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: result.requestId!, approve: true });
  const request = await f.t.run(ctx => ctx.db.get(result.requestId!));
  return { studentId: request!.studentId };
}
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
  it("keeps team requests separate from account linking and retries team-code collisions", async () => {
    const f = await fixture();
    const random = vi.spyOn(crypto, "getRandomValues");
    try {
      random.mockReturnValueOnce(new Uint32Array([0]));
      const first = await f.coach.mutation(api.admin.createJoinCode, { duration: "24h" });
      expect(first.code).toBe("100000");
      random.mockReturnValueOnce(new Uint32Array([0])).mockReturnValueOnce(new Uint32Array([1]));
      const second = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
      expect(second.code).toBe("100001");
      expect(second.expiresAt).toBeGreaterThan(first.expiresAt);
      const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Separate", lastName: "Student", resolution: "create" }], idempotencyKey: "separate_codes_1" });
      const invite = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0];
      expect(invite.code).toMatch(/^[1-9][0-9]{5}$/);
      expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code: first.code })).toMatchObject({ status: "unavailable" });
      expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: first.code })).toEqual({ studentId: null, requestId: null });
      expect(await f.applicant.mutation(api.app.requestJoin, { code: invite.code!, firstName: "Separate", lastName: "Student" })).toBeNull();
      const request = await f.applicant.mutation(api.app.requestJoin, { code: first.code, firstName: "Separate", lastName: "Student" });
      expect(request).not.toBeNull();
      expect(await f.applicant.query(api.app.joinStatus, {})).toEqual({ status: "pending" });
      expect((await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0].status).toBe("pending");
      expect(await approve(f, f.applicant, invite.code!)).toMatchObject({ studentId: invite.studentId });
      expect(await f.applicant.query(api.app.joinStatus, {})).toEqual({ status: "approved" });
      await f.t.run(async ctx => {
        const code = await ctx.db.query("joinCodes").withIndex("by_code", q => q.eq("code", second.code)).unique();
        await ctx.db.patch(code!._id, { revoked: true });
      });
      expect(await f.other.mutation(api.app.requestJoin, { code: second.code, firstName: "Other", lastName: "Student" })).toBeNull();
    } finally { random.mockRestore(); }
  });
  it("retries six-digit collisions and never recycles replaced codes", async () => {
    const f = await fixture();
    const random = vi.spyOn(crypto, "getRandomValues");
    try {
      random.mockReturnValueOnce(new Uint32Array([0]));
      const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Short", lastName: "Code", resolution: "create" }], idempotencyKey: "short_codes_1" });
      const invite = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0];
      expect(invite.code).toBe("100000");
      random.mockReturnValueOnce(new Uint32Array([0])).mockReturnValueOnce(new Uint32Array([1]));
      const next = await f.coach.mutation(api.bulkInvites.replace, { inviteId: invite.inviteId, expectedCode: invite.code! });
      expect(next.code).toBe("100001");
      random.mockReturnValueOnce(new Uint32Array([0])).mockReturnValueOnce(new Uint32Array([1])).mockReturnValueOnce(new Uint32Array([2]));
      const last = await f.coach.mutation(api.bulkInvites.replace, { inviteId: invite.inviteId, expectedCode: next.code });
      expect(last.code).toBe("100002");
      expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: "100000" })).toEqual({ studentId: null, requestId: null });
      expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: "100001" })).toEqual({ studentId: null, requestId: null });
      expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code: last.code })).toMatchObject({ status: "valid" });
      expect(await approve(f, f.applicant, last.code)).toMatchObject({ studentId: invite.studentId });
    } finally { random.mockRestore(); }
  });
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
    await expect(f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Changed", lastName: "Name", resolution: "create" }], idempotencyKey: "batch_0001" })).rejects.toThrow("different students");
    const detail = await f.coach.query(api.bulkInvites.batchDetail, { batchId: result.batchId, asOf: Date.now() });
    expect(detail.invites).toHaveLength(2);
    expect(detail.invites[0].code).toMatch(/^[1-9][0-9]{5}$/);
    const newStudent = await f.t.run(ctx => ctx.db.get(detail.invites[1].studentId));
    expect(newStudent).toMatchObject({ firstName: "Jamie", lastName: "Lee", email: "", active: true, travelTeam: false });
    const account = await f.t.run(ctx => ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", detail.invites[1].studentId)).unique());
    expect(account).toMatchObject({ state: "ready", chargedCents: 0, paidCents: 0 });
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", detail.invites[1].studentId)).take(1))).toHaveLength(0);
  });

  it("requires confirmed duplicates and preserves an existing student's fields when redeemed", async () => {
    const f = await fixture();
    const studentId = await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Alex Doe", preferredName: "Lex", firstName: "Alex", lastName: "Doe", email: "", subteam: "Mechanical", active: true, travelTeam: true, roomCategoryLocked: true, allergies: { state: "reported", text: "peanuts" }, medications: { state: "none" } }));
    await expect(f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Alex", lastName: "Doe", resolution: "create" }], idempotencyKey: "batch_0002" })).rejects.toThrow("matches an existing student");
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Alex", lastName: "Doe", resolution: "link", existingStudentId: studentId }], idempotencyKey: "batch_0003" });
    const detail = await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() });
    const code = detail.invites[0].code!;
    expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code })).toMatchObject({ status: "valid", studentName: null });
    expect(await approve(f, f.other, code)).toMatchObject({ studentId });
    expect(await f.other.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null, requestId: null });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null, requestId: null });
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
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: first.code! })).toEqual({ studentId: null, requestId: null });
    await expect(f.coach.mutation(api.bulkInvites.revoke, { inviteId: first.inviteId, expectedCode: first.code! })).rejects.toThrow("changed since you opened it");
    await f.coach.mutation(api.bulkInvites.revoke, { inviteId: first.inviteId, expectedCode: rotated.code });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: rotated.code })).toEqual({ studentId: null, requestId: null });
    expect((await f.coach.query(api.bulkInvites.listBatches, {}))[0]).toMatchObject({ inviteCount: 1, pendingCount: 0, connectedCount: 0 });
    expect((await f.t.run(ctx => ctx.db.get(first.studentId)))?.userId).toBeUndefined();
  });

  it("limits repeated guesses and closes unexpired codes when the season closes", async () => {
    const f = await fixture();
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Morgan", lastName: "Lane", resolution: "create" }], idempotencyKey: "batch_0005" });
    const code = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0].code!;
    for (let i = 0; i < 10; i++) expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code: `DV-${i.toString(16).padStart(32, "0")}` })).toMatchObject({ status: "unavailable" });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null, requestId: null });
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.season, { endsAt: Date.now() - 1 }); });
    expect((await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0].code).toBeNull();
    expect(await f.other.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null, requestId: null });
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.season, { status: "archived" }); });
    expect(await f.other.mutation(api.bulkInvites.redeem, { code })).toEqual({ studentId: null, requestId: null });
  });

  it("keeps only one pending code when an older batch invitation is restored", async () => {
    const f = await fixture();
    const studentId = await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Casey Park", preferredName: "Casey", firstName: "Casey", lastName: "Park", email: "", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
    const entry = [{ firstName: "Casey", lastName: "Park", resolution: "link" as const, existingStudentId: studentId }];
    const a = await f.coach.mutation(api.bulkInvites.createBatch, { entries: entry, idempotencyKey: "batch_old1" });
    const first = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: a.batchId, asOf: Date.now() })).invites[0];
    const b = await f.coach.mutation(api.bulkInvites.createBatch, { entries: entry, idempotencyKey: "batch_new2" });
    const second = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: b.batchId, asOf: Date.now() })).invites[0];
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: first.code! })).toEqual({ studentId: null, requestId: null });
    const rotated = await f.coach.mutation(api.bulkInvites.replace, { inviteId: first.inviteId, expectedCode: "" });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: second.code! })).toEqual({ studentId: null, requestId: null });
    expect((await f.coach.query(api.bulkInvites.listBatches, {})).map(row => row.pendingCount)).toEqual([0, 1]);
    expect(await approve(f, f.applicant, rotated.code)).toEqual({ studentId });
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
    expect(await approve(f, f.applicant, details.invites[0].code!)).toEqual({ studentId });
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
    expect(await f.other.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null, requestId: null });
  });
});

async function oneInvite(f: Awaited<ReturnType<typeof fixture>>) {
  const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [{ firstName: "Synthetic", lastName: "Approval", resolution: "create" }], idempotencyKey: "approval_batch" });
  return (await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites[0];
}

describe("Coach-approved bulk account connections", () => {
  it("does not expose a name or grant profile/finance access until the Coach chooses one of two applicants", async () => {
    const f = await fixture(); const invite = await oneInvite(f);
    expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code: invite.code! })).toEqual({ status: "valid", studentName: null });
    const [a, b] = await Promise.all([f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! }), f.other.mutation(api.bulkInvites.redeem, { code: invite.code! })]);
    expect(a.requestId).not.toBeNull(); expect(b.requestId).not.toBeNull();
    expect(a.studentId).toBeNull(); expect(b.studentId).toBeNull();
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual(a);
    expect(await f.applicant.query(api.app.viewer, {})).toMatchObject({ status: "pending", students: [] });
    await expect(f.applicant.query(api.app.studentProfile, { studentId: invite.studentId })).rejects.toThrow("waiting for approval");
    await expect(f.applicant.query(api.app.studentFinances, { studentId: invite.studentId })).rejects.toThrow("waiting for approval");
    await expect(f.applicant.query(api.bulkInvites.listConnectionRequests, {})).rejects.toThrow();
    await expect(f.applicant.mutation(api.bulkInvites.decideConnection, { requestId: a.requestId!, approve: true })).rejects.toThrow();
    expect(await f.applicant.query(api.bulkInvites.myConnectionRequests, {})).toEqual([{ requestId: a.requestId, status: "pending", createdAt: expect.any(Number) }]);
    expect(await f.coach.query(api.bulkInvites.listConnectionRequests, {})).toHaveLength(2);
    const results = await Promise.allSettled([f.coach.mutation(api.bulkInvites.decideConnection, { requestId: a.requestId!, approve: true }), f.coach.mutation(api.bulkInvites.decideConnection, { requestId: b.requestId!, approve: true })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const requests = await f.t.run(ctx => ctx.db.query("bulkInviteConnectionRequests").take(10));
    expect(requests.filter(row => row.status === "approved")).toHaveLength(1);
    expect(requests.find(row => row.status === "approved")?.decidedBy).toBe(f.ids.coach);
    const users = await f.t.run(ctx => ctx.db.query("appUsers").take(10));
    expect(users.filter(row => row.role === "student")).toHaveLength(1);
    const winner = requests.find(row => row.status === "approved")!;
    await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: winner._id, approve: true });
    expect((await f.coach.query(api.bulkInvites.listBatches, {}))[0]).toMatchObject({ connectedCount: 1, pendingCount: 0 });
  });

  it("declines without connecting; retry requires a new code and a fresh submission", async () => {
    const f = await fixture(); const invite = await oneInvite(f);
    const request = await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! });
    await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: request.requestId!, approve: false });
    expect(await f.applicant.query(api.bulkInvites.myConnectionRequests, {})).toMatchObject([{ status: "declined" }]);
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null, requestId: null });
    const replacement = await f.coach.mutation(api.bulkInvites.replace, { inviteId: invite.inviteId, expectedCode: invite.code! });
    const retry = await f.applicant.mutation(api.bulkInvites.redeem, { code: replacement.code });
    expect(retry.requestId).not.toBeNull(); expect(retry.requestId).not.toBe(request.requestId);
    expect((await f.t.run(ctx => ctx.db.get(invite.studentId)))?.userId).toBeUndefined();
    await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: retry.requestId!, approve: true });
  });

  it.each(["replace", "revoke", "inactive", "expiry", "season", "identity", "unverified", "missingProvider", "studentEmailCollision", "emailCollision"] as const)("rechecks %s before approval and permits declining stale requests", async reason => {
    const f = await fixture(); const invite = await oneInvite(f);
    const request = await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! });
    if (reason === "replace") await f.coach.mutation(api.bulkInvites.replace, { inviteId: invite.inviteId, expectedCode: invite.code! });
    if (reason === "revoke") await f.coach.mutation(api.bulkInvites.revoke, { inviteId: invite.inviteId, expectedCode: invite.code! });
    await f.t.run(async ctx => {
      if (reason === "inactive") await ctx.db.patch(invite.studentId, { active: false });
      if (reason === "expiry") await ctx.db.patch(invite.inviteId, { expiresAt: Date.now() - 1 });
      if (reason === "season") {
        await ctx.db.patch(f.ids.season, { status: "archived" });
        await ctx.db.insert("seasons", { name: "Next", year: 2027, status: "active", startsAt: 0, permissionVersion: "test", createdBy: f.ids.coach });
      }
      if (reason === "identity") await ctx.db.patch(f.ids.applicantAuth, { email: "changed@example.invalid" });
      if (reason === "unverified") await ctx.db.patch(f.ids.applicantAuth, { emailVerificationTime: undefined });
      if (reason === "missingProvider") {
        const account = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", f.ids.applicantAuth).eq("provider", "google")).unique();
        await ctx.db.delete(account!._id);
      }
      if (reason === "studentEmailCollision") await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Other Student", preferredName: "Other", email: "student@example.invalid", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      if (reason === "emailCollision") await ctx.db.insert("appUsers", { authUserId: f.ids.otherAuth, email: "student@example.invalid", name: "Collision", role: "parent", active: true, travelLead: false, financialEdit: false });
    });
    await expect(f.coach.mutation(api.bulkInvites.decideConnection, { requestId: request.requestId!, approve: true })).rejects.toThrow();
    expect((await f.t.run(ctx => ctx.db.get(invite.studentId)))?.userId).toBeUndefined();
    await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: request.requestId!, approve: false });
  });

  it("rejects anonymous, unverified, duplicate-email and inactive-student submissions", async () => {
    const f = await fixture(); const invite = await oneInvite(f);
    expect(await f.t.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null, requestId: null });
    expect(await f.t.query(api.bulkInvites.myConnectionRequests, {})).toEqual([]);
    await f.t.run(ctx => ctx.db.patch(f.ids.applicantAuth, { emailVerificationTime: undefined }));
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null, requestId: null });
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.applicantAuth, { emailVerificationTime: 1 });
      const student = await ctx.db.get(invite.studentId);
      const { _id: _id, _creationTime: _creationTime, ...fields } = student!;
      void _id; void _creationTime;
      await ctx.db.insert("students", { ...fields, email: "student@example.invalid" });
    });
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null, requestId: null });
    await f.t.run(ctx => ctx.db.patch(invite.studentId, { active: false }));
    expect(await f.other.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null, requestId: null });
  });

  it("shares the daily 30-attempt allowance between preview and submission across minute resets", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
      const f = await fixture(); const invite = await oneInvite(f);
      for (let i = 0; i < 30; i++) {
        if (i && i % 10 === 0) vi.advanceTimersByTime(61_000);
        if (i % 2) expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: "00000" })).toEqual({ studentId: null, requestId: null });
        else expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code: "00000" })).toMatchObject({ status: "unavailable" });
      }
      vi.advanceTimersByTime(61_000);
      expect(await f.applicant.mutation(api.bulkInvites.previewCode, { code: invite.code! })).toMatchObject({ status: "unavailable" });
      expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! })).toEqual({ studentId: null, requestId: null });
      vi.advanceTimersByTime(86_400_001);
      expect((await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! })).requestId).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("imports 100 unique students without automatic travel status, events or charges and bounds pending requests", async () => {
    const f = await fixture();
    const entries = Array.from({ length: 100 }, (_, i) => ({ firstName: "Synthetic", lastName: "Student" + i, resolution: "create" as const }));
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries, idempotencyKey: "hundred_students" });
    expect(batch).toMatchObject({ created: 100, linked: 0, skipped: 0 });
    const detail = await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() });
    expect(detail.invites).toHaveLength(100);
    expect(new Set(detail.invites.map(row => row.code)).size).toBe(100);
    const students = await f.t.run(ctx => ctx.db.query("students").take(101));
    expect(students.every(row => row.active && !row.travelTeam && !row.userId)).toBe(true);
    expect(await f.t.run(ctx => ctx.db.query("charges").take(1))).toEqual([]);
    expect(await f.t.run(ctx => ctx.db.query("participants").take(1))).toEqual([]);
    for (const invite of detail.invites.slice(0, 3)) expect((await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! })).requestId).not.toBeNull();
    expect(await f.applicant.mutation(api.bulkInvites.redeem, { code: detail.invites[3].code! })).toEqual({ studentId: null, requestId: null });
  });
});

describe("connection request lifecycle", () => {
  it("does not strand an applicant behind three rotated, revoked or prior-season requests", async () => {
    const f = await fixture();
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { entries: [0, 1, 2, 3].map(i => ({ firstName: "Lifecycle", lastName: "Student" + i, resolution: "create" as const })), idempotencyKey: "lifecycle_students" });
    const invites = (await f.coach.query(api.bulkInvites.batchDetail, { batchId: batch.batchId, asOf: Date.now() })).invites;
    for (const invite of invites.slice(0, 3)) await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! });
    await f.coach.mutation(api.bulkInvites.replace, { inviteId: invites[0].inviteId, expectedCode: invites[0].code! });
    await f.coach.mutation(api.bulkInvites.revoke, { inviteId: invites[1].inviteId, expectedCode: invites[1].code! });
    await f.t.run(ctx => ctx.db.patch(invites[2].inviteId, { expiresAt: Date.now() - 1 }));
    expect((await f.applicant.query(api.bulkInvites.myConnectionRequests, { asOf: Date.now() })).every(row => row.status === "declined")).toBe(true);
    expect((await f.applicant.mutation(api.bulkInvites.redeem, { code: invites[3].code! })).requestId).not.toBeNull();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.season, { status: "archived" });
      await ctx.db.insert("seasons", { name: "Next", year: 2027, status: "active", startsAt: 0, permissionVersion: "test", createdBy: f.ids.coach });
    });
    expect((await f.applicant.query(api.bulkInvites.myConnectionRequests, { asOf: Date.now() })).every(row => row.status === "declined")).toBe(true);
    const next = await oneInvite(f);
    expect((await f.applicant.mutation(api.bulkInvites.redeem, { code: next.code! })).requestId).not.toBeNull();
  });

  it("shows competing requests as unavailable after approval", async () => {
    const f = await fixture(); const invite = await oneInvite(f);
    const a = await f.applicant.mutation(api.bulkInvites.redeem, { code: invite.code! });
    const b = await f.other.mutation(api.bulkInvites.redeem, { code: invite.code! });
    await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: a.requestId!, approve: true });
    expect(await f.other.query(api.bulkInvites.myConnectionRequests, { asOf: Date.now() })).toMatchObject([{ requestId: b.requestId, status: "declined" }]);
    await expect(f.coach.mutation(api.bulkInvites.decideConnection, { requestId: b.requestId!, approve: true })).rejects.toThrow("no longer valid");
  });
});

describe("one invitation code field", () => {
  it("never issues a team code and an individual invitation with the same value", async () => {
    const f = await fixture();
    const random = vi.spyOn(crypto, "getRandomValues");
    try {
      random.mockReturnValueOnce(new Uint32Array([0]));
      expect((await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" })).code).toBe("100000");
      random.mockReturnValueOnce(new Uint32Array([0])).mockReturnValueOnce(new Uint32Array([1]));
      expect((await oneInvite(f)).code).toBe("100001");
      random.mockReturnValueOnce(new Uint32Array([0])).mockReturnValueOnce(new Uint32Array([1])).mockReturnValueOnce(new Uint32Array([2]));
      expect((await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" })).code).toBe("100002");
    } finally { random.mockRestore(); }
  });

  it("tells the join page which kind each code is and keeps accepting outstanding five-digit invitations", async () => {
    const f = await fixture();
    const team = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    const revoked = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    await f.t.run(async ctx => {
      const row = await ctx.db.query("joinCodes").withIndex("by_code", q => q.eq("code", revoked.code)).unique();
      await ctx.db.patch(row!._id, { revoked: true });
    });
    const invite = await oneInvite(f);
    const legacyCode = "54321";
    const legacyStudent = await f.t.run(async ctx => {
      const studentId = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Legacy Synthetic", preferredName: "Legacy", firstName: "Legacy", lastName: "Synthetic", email: "", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const original = await ctx.db.get(invite.inviteId);
      await ctx.db.insert("bulkStudentInvites", { batchId: original!.batchId, seasonId: f.ids.season, studentId, code: legacyCode, codeHash: await tokenHash(legacyCode), status: "pending", createdBy: f.ids.coach, createdAt: Date.now() });
      return studentId;
    });
    const cases = [
      { label: "team code", code: ` ${team.code} `, kind: "team" },
      { label: "individual invitation", code: invite.code!, kind: "individual" },
      { label: "outstanding five-digit invitation", code: legacyCode, kind: "individual" },
      { label: "revoked team code", code: revoked.code, kind: "unavailable" },
      { label: "unknown code", code: "999999", kind: "unavailable" },
    ] as const;
    for (const { label, code, kind } of cases) {
      expect(await f.applicant.mutation(api.bulkInvites.checkInvitationCode, { code }), label).toEqual({ kind });
    }
    // Individual invitations connect without a name; a Coach approves the connection.
    expect(await approve(f, f.applicant, legacyCode)).toMatchObject({ studentId: legacyStudent });
  });

  it("locks the account after five wrong codes in either path", async () => {
    const f = await fixture();
    const team = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    for (let i = 0; i < 4; i++) expect(await f.other.mutation(api.bulkInvites.checkInvitationCode, { code: "999999" })).toEqual({ kind: "unavailable" });
    expect(await f.other.mutation(api.app.requestJoin, { code: "999998", firstName: "Locked", lastName: "Synthetic" })).toBeNull();
    expect(await f.other.mutation(api.bulkInvites.checkInvitationCode, { code: team.code })).toEqual({ kind: "tooManyAttempts" });
    expect(await f.other.mutation(api.app.requestJoin, { code: team.code, firstName: "Locked", lastName: "Synthetic" })).toBeNull();
  });
});
