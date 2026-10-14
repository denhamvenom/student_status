/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
import { makeFunctionReference } from "convex/server";

const modules = import.meta.glob("./**/*.ts");

async function rehearsal() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", travelLead = false, financialEdit = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid`, name });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, travelLead, financialEdit, active: true });
      return { auth, id };
    }
    const coach = await account("rehearsal-coach", "coach");
    const mentor = await account("rehearsal-mentor", "mentor");
    const travel = await account("rehearsal-travel", "mentor", true);
    const financeLead = await account("rehearsal-finance", "mentor", true, true);
    const parent = await account("rehearsal-parent", "parent");
    const aliceUser = await account("rehearsal-alice", "student");
    const blakeUser = await account("rehearsal-blake", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic rehearsal", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.id });
    async function student(name: string, userId: typeof aliceUser.id) {
      return ctx.db.insert("students", { seasonId: season, userId, legalName: name, preferredName: name, email: `${name.toLowerCase()}@example.invalid`, subteam: "A", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    }
    const alice = await student("Alice", aliceUser.id);
    const blake = await student("Blake", blakeUser.id);
    const link = await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: alice, active: true, createdBy: coach.id });
    const startsAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic trip", type: "Competition", startsAt, endsAt: startsAt + 2 * 24 * 60 * 60 * 1000, destination: "Fictional venue", travel: "Team vehicle", overnight: true, roomingEnabled: true, roomDeadline: startsAt - 24 * 60 * 60 * 1000, feeCents: 6000, signupMode: "approval", capacity: 1, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { coach, mentor, travel, financeLead, parent, aliceUser, blakeUser, season, alice, blake, link, event, startsAt };
  });
  const as = (account: typeof ids.coach) => t.withIdentity({ subject: `${account.auth}|fictional-session` });
  return { t, ids, coach: as(ids.coach), mentor: as(ids.mentor), travel: as(ids.travel), financeLead: as(ids.financeLead), parent: as(ids.parent), alice: as(ids.aliceUser), blake: as(ids.blakeUser) };
}

async function finishMoney(f: Awaited<ReturnType<typeof rehearsal>>) {
  for (let step = 0; step < 100; step++) {
    const jobs = await f.t.run(async ctx => ({
      operations: await ctx.db.query("financialOperationJobs").collect(),
      allocations: await ctx.db.query("financialAllocationJobs").collect(),
    }));
    if ([...jobs.operations, ...jobs.allocations].some(job => job.state === "failed")) throw new Error("Synthetic money job failed.");
    const operations = jobs.operations.filter(job => job.state === "running");
    const allocations = jobs.allocations.filter(job => job.state === "running");
    if (!operations.length && !allocations.length) return;
    for (const job of operations) await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:run"), { jobId: job._id });
    for (const job of allocations) await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:run"), { jobId: job._id });
  }
  throw new Error("Synthetic financial jobs did not finish.");
}
describe("fictional multi-role operations rehearsal (mocked Convex identities)", () => {
  it("reconciles signup, approval, room release, partial return, payout, promotion, and source-preserving transfer", async () => {
    const f = await rehearsal();
    expect(await f.alice.mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("pending");
    expect(await f.blake.mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("waitlist");
    expect((await f.coach.query(api.financeDetails.charges, { studentId: f.ids.alice, paginationOpts: { cursor: null, numItems: 25 } })).page).toHaveLength(0);
    await expect(f.travel.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.blake, decision: "promote" })).rejects.toThrow();
    await f.travel.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.alice, decision: "approve" });
    const roomId = await f.alice.mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "Synthetic room" });
    await expect(f.parent.mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "Parent room" })).rejects.toThrow();
    await f.coach.mutation(api.finance.createCharge, { studentId: f.ids.alice, label: "Other fee", amountCents: 2000, priority: f.ids.startsAt + 1, idempotencyKey: "rehearsal-other-charge" });
    await finishMoney(f);
    await f.coach.mutation(api.finance.recordFunds, { studentId: f.ids.alice, kind: "payment", amountCents: 5000, reason: "Fictional check received", idempotencyKey: "rehearsal-payment-a" });
    await finishMoney(f);
    await f.financeLead.mutation(api.finance.recordFunds, { studentId: f.ids.alice, kind: "fundraiser", amountCents: 2000, reason: "Fictional fundraising share", idempotencyKey: "rehearsal-fund-a" });
    await finishMoney(f);
    const before = await f.parent.query(api.app.studentFinances, { studentId: f.ids.alice });
    expect(before.summary).toMatchObject({ paidCents: 7000, dueCents: 1000, personalAvailableCents: 0, fundraisingAvailableCents: 0 });
    await expect(f.parent.query(api.app.studentFinances, { studentId: f.ids.blake })).rejects.toThrow();
    await expect(f.mentor.query(api.app.studentFinances, { studentId: f.ids.alice })).rejects.toThrow();
    await f.coach.mutation(api.finance.createCharge, { studentId: f.ids.alice, eventId: f.ids.event, category: "extra", label: "Unpaid fictional lunch", amountCents: 100, priority: f.ids.startsAt + 2, idempotencyKey: "rehearsal-unpaid-extra" });
    const requestId = await f.alice.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "rehearsal-withdraw-a" });
    const preview = await f.travel.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.alice });
    expect(preview).toMatchObject({ paidMainCents: 6000, requestStatus: "pending" });
    await f.travel.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "partial", returnCents: 5000, cancelUnpaidMain: false, reason: "Fictional partial return approved", expectedRevision: preview.revision });
    expect(await f.t.run(ctx => ctx.db.get(requestId))).toMatchObject({ status: "processing" });
    expect(await f.parent.query(api.app.studentFinances, { studentId: f.ids.alice })).toMatchObject({ state: "updating", summary: null });
    expect(await f.t.run(ctx => ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.alice)).unique())).not.toBeNull();
    await finishMoney(f);
    expect(await f.t.run(ctx => ctx.db.get(requestId))).toMatchObject({ status: "approved" });
    expect((await f.coach.query(api.eventOperations.workspace, { eventId: f.ids.event })).waitlist.find((p: { studentId: string }) => p.studentId === f.ids.blake)?.status).toBe("waitlist");
    const room = await f.coach.query(api.rooms.workspace, { eventId: f.ids.event });
    expect(room.groups.find((group: { _id: string }) => group._id === roomId)).toMatchObject({ needsReview: true, finalized: false, members: [] });
    const returned = await f.parent.query(api.app.studentFinances, { studentId: f.ids.alice });
    expect(returned.summary).toMatchObject({ dueCents: 0, personalAvailableCents: 4000, fundraisingAvailableCents: 0 });
    expect((await f.parent.query(api.financeDetails.history, { studentId: f.ids.alice, paginationOpts: { cursor: null, numItems: 25 } })).page.filter((entry: { kind: string }) => entry.kind === "deallocation").every(entry => entry.sourceKind === "payment")).toBe(true);
    await expect(f.travel.mutation(api.financeOperations.recordPayout, { studentId: f.ids.alice, amountCents: 1000, method: "check", reference: "fictional-check", occurredAt: 1, reason: "Check returned to family", idempotencyKey: "rehearsal-payout-denied" })).rejects.toThrow("Financial editing");
    await f.financeLead.mutation(api.financeOperations.recordPayout, { studentId: f.ids.alice, amountCents: 1000, method: "check", reference: "fictional-check", occurredAt: 1, reason: "Check returned to family", idempotencyKey: "rehearsal-payout-a" });
    await finishMoney(f);
    expect((await f.parent.query(api.app.studentFinances, { studentId: f.ids.alice })).summary!.personalAvailableCents).toBe(3000);
    await f.coach.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.blake, decision: "promote" });
    expect((await f.coach.query(api.app.studentFinances, { studentId: f.ids.blake })).summary!.dueCents).toBe(6000);
    await f.coach.mutation(api.finance.recordFunds, { studentId: f.ids.alice, kind: "fundraiser", amountCents: 3000, reason: "Second fictional fundraiser", idempotencyKey: "rehearsal-fund-b" });
    await finishMoney(f);
    await expect(f.travel.mutation(api.financeOperations.transferFundraising, { studentId: f.ids.alice, recipientStudentId: f.ids.blake, amountCents: 2000, reason: "Travel share", idempotencyKey: "rehearsal-transfer-denied" })).rejects.toThrow("Financial editing");
    const transferId = await f.financeLead.mutation(api.financeOperations.transferFundraising, { studentId: f.ids.alice, recipientStudentId: f.ids.blake, amountCents: 2000, reason: "Travel share", idempotencyKey: "rehearsal-transfer-a" });
    await finishMoney(f);
    expect(await f.financeLead.mutation(api.financeOperations.transferFundraising, { studentId: f.ids.alice, recipientStudentId: f.ids.blake, amountCents: 2000, reason: "Travel share", idempotencyKey: "rehearsal-transfer-a" })).toBe(transferId);
    const alice = await f.coach.query(api.app.studentFinances, { studentId: f.ids.alice });
    const blake = await f.coach.query(api.app.studentFinances, { studentId: f.ids.blake });
    expect(alice.summary).toMatchObject({ personalAvailableCents: 3000, fundraisingAvailableCents: 1000 });
    expect(blake.summary).toMatchObject({ paidCents: 2000, dueCents: 4000, personalAvailableCents: 0, fundraisingAvailableCents: 0 });
    const transferReceipt = (await f.coach.query(api.financeDetails.history, { studentId: f.ids.blake, paginationOpts: { cursor: null, numItems: 25 } })).page.find(entry => "operationId" in entry && entry.operationId === transferId && entry.kind === "fundraiser");
    expect(transferReceipt && "originEntryId" in transferReceipt ? transferReceipt.originEntryId : null).toBeTruthy();
    expect((await f.coach.query(api.financeDetails.history, { studentId: f.ids.blake, paginationOpts: { cursor: null, numItems: 25 } })).page.find((entry: { kind: string }) => entry.kind === "allocation")?.sourceKind).toBe("fundraiser");
    await expect(f.parent.query(api.app.studentFinances, { studentId: f.ids.blake })).rejects.toThrow();
  });

  it("enforces financial capabilities and revokes a linked parent's open-session access", async () => {
    const f = await rehearsal();
    const payout = { studentId: f.ids.alice, amountCents: 100, method: "cash" as const, reference: "fictional receipt", occurredAt: 1, reason: "Fictional return", idempotencyKey: "rehearsal-restricted-payout" };
    for (const denied of [f.alice, f.parent, f.mentor, f.travel, f.t]) await expect(denied.mutation(api.financeOperations.recordPayout, payout)).rejects.toThrow();
    await expect(f.parent.mutation(api.finance.recordFunds, { studentId: f.ids.alice, kind: "payment", amountCents: 100, reason: "Unauthorized", idempotencyKey: "rehearsal-parent-payment" })).rejects.toThrow();
    await expect(f.parent.mutation(api.participation.signUp, { eventId: f.ids.event })).rejects.toThrow();
    await f.parent.query(api.app.studentFinances, { studentId: f.ids.alice });
    await f.coach.mutation(api.parentInvites.revokeFamilyLink, { linkId: f.ids.link });
    await expect(f.parent.query(api.app.studentFinances, { studentId: f.ids.alice })).rejects.toThrow();
    await expect(f.parent.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.alice })).rejects.toThrow();
  });
});
