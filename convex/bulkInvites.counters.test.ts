/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = createTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Coach" });
    const applicantAuth = await ctx.db.insert("users", { email: "student@example.invalid", name: "Student Google", emailVerificationTime: 1 });
    await ctx.db.insert("authAccounts", { userId: applicantAuth, provider: "google", providerAccountId: "student", emailVerified: "student@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    return { coachAuth, applicantAuth, coach, season };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), applicant: t.withIdentity({ subject: `${ids.applicantAuth}|session` }) };
}
type F = Awaited<ReturnType<typeof fixture>>;

// Counters stored on each batch must equal what its invite rows say.
async function expectCountersMatchRows(f: F, label: string) {
  const { batches, invites } = await f.t.run(async ctx => ({ batches: await ctx.db.query("bulkInviteBatches").take(50), invites: await ctx.db.query("bulkStudentInvites").take(500) }));
  expect(batches.length, label).toBeGreaterThan(0);
  for (const batch of batches) {
    const rows = invites.filter(row => row.batchId === batch._id);
    expect({ inviteCount: batch.inviteCount, pendingCount: batch.pendingCount, connectedCount: batch.connectedCount }, label).toEqual({
      inviteCount: rows.length, pendingCount: rows.filter(row => row.status === "pending").length, connectedCount: rows.filter(row => row.status === "redeemed").length,
    });
  }
  // A student never holds two open codes at once.
  const open = invites.filter(row => row.status === "pending").map(row => row.studentId);
  expect(new Set(open).size, `${label}: one open code per student`).toBe(open.length);
}
async function rows(f: F, batchId: Id<"bulkInviteBatches">) {
  return (await f.coach.query(api.bulkInvites.batchDetail, { batchId, asOf: Date.now() })).invites;
}
async function student(f: F, firstName: string) {
  return f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: `${firstName} Synthetic`, preferredName: firstName, firstName, lastName: "Synthetic", email: "", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
}

describe("bulk invitation batch counters follow every status transition", () => {
  it("stays equal to the invite rows through create, revoke, replace and redeem outcomes", async () => {
    const f = await fixture();
    const existing = await student(f, "Linked");
    const a = await f.coach.mutation(api.bulkInvites.createBatch, { idempotencyKey: "counters_a1", entries: [
      { firstName: "Created", lastName: "Synthetic", resolution: "create" }, { firstName: "Linked", lastName: "Synthetic", resolution: "link", existingStudentId: existing },
      { firstName: "Third", lastName: "Synthetic", resolution: "create" }, { firstName: "Fourth", lastName: "Synthetic", resolution: "create" }, { firstName: "Skipped", lastName: "Synthetic", resolution: "skip" },
    ] });
    await expectCountersMatchRows(f, "create");
    const [created, ...others] = await rows(f, a.batchId);
    let [linked, third, fourth] = others;

    // replace from pending (rotate)
    const rotated = await f.coach.mutation(api.bulkInvites.replace, { inviteId: created.inviteId, expectedCode: created.code! });
    await expectCountersMatchRows(f, "replace from pending");
    // revoke, then replace from revoked (revive)
    await f.coach.mutation(api.bulkInvites.revoke, { inviteId: created.inviteId, expectedCode: rotated.code });
    await expectCountersMatchRows(f, "revoke");
    const revived = await f.coach.mutation(api.bulkInvites.replace, { inviteId: created.inviteId, expectedCode: "" });
    await expectCountersMatchRows(f, "replace from revoked");

    // a second batch supersedes the linked student's open code (pending -> replaced in batch A)
    const b = await f.coach.mutation(api.bulkInvites.createBatch, { idempotencyKey: "counters_b1", entries: [{ firstName: "Linked", lastName: "Synthetic", resolution: "link", existingStudentId: existing }] });
    await expectCountersMatchRows(f, "create supersedes older batch's open code");
    // replace from replaced: revives A's invite and supersedes batch B's open code
    await f.coach.mutation(api.bulkInvites.replace, { inviteId: linked.inviteId, expectedCode: "" });
    await expectCountersMatchRows(f, "replace from replaced");
    expect(await rows(f, b.batchId)).toMatchObject([{ status: "replaced" }]);

    // redeem: approve
    linked = (await rows(f, a.batchId)).find(row => row.inviteId === linked.inviteId)!;
    const approved = await f.applicant.mutation(api.bulkInvites.redeem, { code: linked.code! });
    await expectCountersMatchRows(f, "redeem request filed");
    await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: approved.requestId!, approve: true });
    await expectCountersMatchRows(f, "approve");
    await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: approved.requestId!, approve: true });
    await expectCountersMatchRows(f, "approve replayed");

    // redeem: decline leaves the invite pending
    third = (await rows(f, a.batchId)).find(row => row.inviteId === third.inviteId)!;
    const declined = await f.applicant.mutation(api.bulkInvites.redeem, { code: third.code! }).catch(() => null);
    if (declined?.requestId) await f.coach.mutation(api.bulkInvites.decideConnection, { requestId: declined.requestId, approve: false });
    await expectCountersMatchRows(f, "decline");

    // redeem: stale request (code replaced after submission) cannot be approved
    fourth = (await rows(f, a.batchId)).find(row => row.inviteId === fourth.inviteId)!;
    const stale = await f.applicant.mutation(api.bulkInvites.redeem, { code: fourth.code! }).catch(() => null);
    await f.coach.mutation(api.bulkInvites.replace, { inviteId: fourth.inviteId, expectedCode: fourth.code! });
    if (stale?.requestId) await expect(f.coach.mutation(api.bulkInvites.decideConnection, { requestId: stale.requestId, approve: true })).rejects.toThrow();
    await expectCountersMatchRows(f, "stale approval refused");
    expect(revived.inviteId).toBe(created.inviteId);
  });

  it("recountBatch repairs drifted counters from the rows without touching invites", async () => {
    const f = await fixture();
    const batch = await f.coach.mutation(api.bulkInvites.createBatch, { idempotencyKey: "counters_r1", entries: [{ firstName: "One", lastName: "Synthetic", resolution: "create" }, { firstName: "Two", lastName: "Synthetic", resolution: "create" }] });
    const [one] = await rows(f, batch.batchId);
    await f.coach.mutation(api.bulkInvites.revoke, { inviteId: one.inviteId, expectedCode: one.code! });
    await f.t.run(ctx => ctx.db.patch(batch.batchId, { pendingCount: 7, connectedCount: 3, inviteCount: 9 }));
    const before = await f.t.run(ctx => ctx.db.query("bulkStudentInvites").take(10));
    const result = await f.t.mutation(internal.bulkInvites.recountBatch, { batchId: batch.batchId });
    expect(result).toMatchObject({ done: true, pendingCount: 1, connectedCount: 0, inviteCount: 2 });
    await expectCountersMatchRows(f, "after recount");
    expect(await f.t.run(ctx => ctx.db.query("bulkStudentInvites").take(10))).toEqual(before);
  });
});
