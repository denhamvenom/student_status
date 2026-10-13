/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { startFinancialRebuild } from "./financialSources";
import { financialAccount } from "./lib/financialSources";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const key = "operation-test-key";

async function fixture(prepared = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student", financialEdit = false, travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, financialEdit, travelLead, active: true });
      return { auth, user };
    }
    const coach = await account("finance-coach", "coach");
    const lead = await account("finance-lead", "mentor", true, true);
    const ungrantedLead = await account("finance-ungranted-lead", "mentor", false, true);
    const mentor = await account("finance-mentor", "mentor");
    const studentUser = await account("finance-student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const oldSeason = await ctx.db.insert("seasons", { name: "Archived", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.user, legalName: "Sender", preferredName: "Sender", email: "sender@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const recipient = await ctx.db.insert("students", { seasonId: season, legalName: "Recipient", preferredName: "Recipient", email: "recipient@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const inactive = await ctx.db.insert("students", { seasonId: season, legalName: "Inactive", preferredName: "Inactive", email: "inactive@example.invalid", subteam: "A", active: false, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const old = await ctx.db.insert("students", { seasonId: oldSeason, legalName: "Old", preferredName: "Old", email: "old@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const payment = await ctx.db.insert("ledgerEntries", { studentId: student, kind: "payment", amountCents: 5000, previousCents: 0, newCents: 5000, recordedBy: coach.user, recordedAt: 1, idempotencyKey: "fixture-personal" });
    const fundraisingA = await ctx.db.insert("ledgerEntries", { studentId: student, kind: "fundraiser", amountCents: 4000, previousCents: 0, newCents: 4000, recordedBy: coach.user, recordedAt: 2, idempotencyKey: "fixture-fund-a" });
    const fundraisingB = await ctx.db.insert("ledgerEntries", { studentId: student, kind: "fundraiser", amountCents: 3000, previousCents: 0, newCents: 3000, recordedBy: coach.user, recordedAt: 3, idempotencyKey: "fixture-fund-b" });
    const charge = await ctx.db.insert("charges", { studentId: student, label: "Already paid", amountCents: 4000, appliedCents: 4000, priority: 1, createdBy: coach.user, createdAt: 1 });
    await ctx.db.insert("ledgerEntries", { studentId: student, chargeId: charge, kind: "allocation", amountCents: 4000, previousCents: 0, newCents: 4000, sourceEntryId: payment, sourceKind: "payment", recordedBy: coach.user, recordedAt: 4, idempotencyKey: "fixture-allocation" });
    return { coach, lead, ungrantedLead, mentor, studentUser, student, recipient, inactive, old, payment, fundraisingA, fundraisingB };
  });
  if (prepared) {
    await rebuildStudent(t, ids.coach.user, ids.student);
    await rebuildStudent(t, ids.coach.user, ids.recipient);
  }
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), lead: as(ids.lead.auth), ungrantedLead: as(ids.ungrantedLead.auth), mentor: as(ids.mentor.auth), student: as(ids.studentUser.auth) };
}

async function rebuildStudent(t: ReturnType<typeof convexTest>, actorId: Id<"appUsers">, studentId: Id<"students">) {
  await t.run(ctx => startFinancialRebuild(ctx, studentId, actorId));
  for (let i = 0; i < 100; i++) {
    const account = await t.run(ctx => financialAccount(ctx, studentId));
    if (!account || account.state !== "rebuilding") return;
    await t.mutation(makeFunctionReference<"mutation">("financialSources:processPage"), { accountId: account._id, generation: account.generation, phase: account.phase, cursor: account.cursor });
  }
  throw new Error("Fixture rebuild did not finish");
}
async function finances(f: Awaited<ReturnType<typeof fixture>>, studentId: Id<"students">) {
  const result = await f.coach.query(api.app.studentFinances, { studentId });
  if (result.state !== "ready" || !result.summary) throw new Error("Expected prepared finances");
  const history = await f.coach.query(api.financeDetails.history, { studentId, paginationOpts: { numItems: 25, cursor: null } });
  return { summary: result.summary, entries: history.page };
}

describe("financial operations", () => {
  it("records only unallocated personal payment refunds and preserves both source and idempotency", async () => {
    const f = await fixture();
    const args = { studentId: f.ids.student, amountCents: 1000, method: "check" as const, reference: "synthetic-check", occurredAt: 1, reason: "Family received check", idempotencyKey: key };
    await expect(f.coach.mutation(api.financeOperations.recordPayout, { ...args, amountCents: 1001 })).rejects.toThrow("unallocated personal");
    const id = await f.coach.mutation(api.financeOperations.recordPayout, args);
    expect(await f.coach.mutation(api.financeOperations.recordPayout, args)).toBe(id);
    await expect(f.coach.mutation(api.financeOperations.recordPayout, { ...args, amountCents: 500 })).rejects.toThrow("different operation");
    const money = await finances(f, f.ids.student);
    expect(money.summary).toMatchObject({ personalAvailableCents: 0, fundraisingAvailableCents: 7000 });
    const payouts = money.entries.filter((entry: { kind: string }) => entry.kind === "payout");
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ sourceEntryId: f.ids.payment, sourceKind: "payment", method: "check", reference: "synthetic-check", amountCents: 1000 });
    await f.coach.mutation(api.finance.recordFunds, { studentId: f.ids.student, kind: "payment", amountCents: 100, reason: "New payment", idempotencyKey: "after-payout-payment" });
    const updated = await finances(f, f.ids.student);
    expect(updated.entries.find((entry: { idempotencyKey: string }) => entry.idempotencyKey === "after-payout-payment")).toMatchObject({ previousCents: 11000, newCents: 11100 });
  });

  it("moves mixed fundraising sources atomically and conserves credit after recipient allocation", async () => {
    const f = await fixture();
    await f.t.run(async ctx => { await ctx.db.insert("charges", { studentId: f.ids.recipient, label: "Recipient fee", amountCents: 2000, appliedCents: 0, priority: 1, createdBy: f.ids.coach.user, createdAt: 1 }); });
    await rebuildStudent(f.t, f.ids.coach.user, f.ids.recipient);
    const args = { studentId: f.ids.student, recipientStudentId: f.ids.recipient, amountCents: 5000, reason: "Authorized travel share transfer", idempotencyKey: key };
    const id = await f.lead.mutation(api.financeOperations.transferFundraising, args);
    expect(await f.lead.mutation(api.financeOperations.transferFundraising, args)).toBe(id);
    const sender = await finances(f, f.ids.student);
    const recipient = await finances(f, f.ids.recipient);
    expect(sender.summary.fundraisingAvailableCents).toBe(2000);
    expect(recipient.summary.fundraisingAvailableCents).toBe(3000);
    expect(recipient.summary.paidCents).toBe(2000);
    expect(sender.entries.filter((entry: { kind: string }) => entry.kind === "transferOut").map((entry: { amountCents: number }) => entry.amountCents).sort()).toEqual([1000, 4000]);
    expect(recipient.entries.filter((entry: { kind: string; operationId?: string }) => entry.kind === "fundraiser" && entry.operationId === id)).toHaveLength(2);
    expect(sender.summary.fundraisingAvailableCents + recipient.summary.fundraisingAvailableCents + recipient.summary.paidCents).toBe(7000);
  });

  it("rejects unauthorized, cross-season, inactive, duplicate-key, and overdraw attempts", async () => {
    const f = await fixture();
    const args = { studentId: f.ids.student, recipientStudentId: f.ids.recipient, amountCents: 1000, reason: "Approved transfer", idempotencyKey: key };
    await expect(f.student.mutation(api.financeOperations.transferFundraising, args)).rejects.toThrow("Financial editing");
    await expect(f.mentor.mutation(api.financeOperations.transferFundraising, args)).rejects.toThrow("Financial editing");
    await expect(f.ungrantedLead.mutation(api.financeOperations.transferFundraising, args)).rejects.toThrow("Financial editing");
    await expect(f.ungrantedLead.query(api.financeOperations.operationOptions, { studentId: f.ids.student })).rejects.toThrow("Financial editing");
    await expect(f.coach.mutation(api.financeOperations.transferFundraising, { ...args, recipientStudentId: f.ids.old })).rejects.toThrow("active student");
    await expect(f.coach.mutation(api.financeOperations.transferFundraising, { ...args, recipientStudentId: f.ids.inactive })).rejects.toThrow("active student");
    await expect(f.coach.mutation(api.financeOperations.transferFundraising, { ...args, amountCents: 7001 })).rejects.toThrow("available fundraising");
    const id = await f.coach.mutation(api.financeOperations.transferFundraising, args);
    await expect(f.coach.mutation(api.financeOperations.transferFundraising, { ...args, reason: "Changed" })).rejects.toThrow("different operation");
    expect(id).toBeTruthy();
  });

  it("rolls back both transfer sides if recipient allocation cannot complete", async () => {
    const f = await fixture();
    await f.t.run(async ctx => { await ctx.db.insert("charges", { studentId: f.ids.recipient, label: "Inconsistent charge", amountCents: 1000, appliedCents: 1001, outstanding: true, priority: 1, createdBy: f.ids.coach.user, createdAt: 1 }); });
    await expect(f.coach.mutation(api.financeOperations.transferFundraising, { studentId: f.ids.student, recipientStudentId: f.ids.recipient, amountCents: 1000, reason: "Attempt", idempotencyKey: key })).rejects.toThrow("inconsistent");
    const sender = await finances(f, f.ids.student);
    expect(sender.summary.fundraisingAvailableCents).toBe(7000);
    const operation = await f.t.run(ctx => ctx.db.query("financeOperations").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", key)).unique());
    expect(operation).toBeNull();
    const entries = await f.t.run(ctx => ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.recipient)).take(20));
    expect(entries).toHaveLength(0);
  });

  it("keeps transferred credits in fundraising after deallocation", async () => {
    const f = await fixture();
    const charge = await f.t.run(ctx => ctx.db.insert("charges", { studentId: f.ids.recipient, label: "Fee", amountCents: 1000, appliedCents: 0, priority: 1, createdBy: f.ids.coach.user, createdAt: 1 }));
    await rebuildStudent(f.t, f.ids.coach.user, f.ids.recipient);
    await f.coach.mutation(api.financeOperations.transferFundraising, { studentId: f.ids.student, recipientStudentId: f.ids.recipient, amountCents: 1000, reason: "Transfer", idempotencyKey: key });
    const allocation = await f.t.run(async ctx => (await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.recipient)).take(20)).find(x => x.kind === "allocation"));
    expect(allocation?.sourceKind).toBe("fundraiser");
    await f.t.run(async ctx => {
      await ctx.db.patch(charge, { appliedCents: 0, cancelledCents: 1000 });
      await ctx.db.insert("ledgerEntries", { studentId: f.ids.recipient, chargeId: charge, kind: "deallocation", amountCents: 1000, previousCents: 1000, newCents: 0, sourceEntryId: allocation!.sourceEntryId, sourceKind: "fundraiser", recordedBy: f.ids.coach.user, recordedAt: 5, idempotencyKey: "synthetic-reversal" });
    });
    await rebuildStudent(f.t, f.ids.coach.user, f.ids.recipient);
    const money = await finances(f, f.ids.recipient);
    expect(money.summary).toMatchObject({ personalAvailableCents: 0, fundraisingAvailableCents: 1000 });
    await expect(f.coach.mutation(api.financeOperations.recordPayout, { studentId: f.ids.recipient, amountCents: 1000, method: "check", reference: "not-allowed", occurredAt: 1, reason: "No fundraising cashout", idempotencyKey: "no-fundraising-payout" })).rejects.toThrow("unallocated personal");
  });

  it("rejects a competing spend when the available source changes", async () => {
    const f = await fixture();
    const base = { studentId: f.ids.student, recipientStudentId: f.ids.recipient, amountCents: 5000, reason: "Two planned transfers" };
    const first = f.coach.mutation(api.financeOperations.transferFundraising, { ...base, idempotencyKey: "competing-one" });
    const second = f.lead.mutation(api.financeOperations.transferFundraising, { ...base, idempotencyKey: "competing-two" });
    const results = await Promise.allSettled([first, second]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const sender = await finances(f, f.ids.student);
    const recipient = await finances(f, f.ids.recipient);
    expect(sender.summary.fundraisingAvailableCents).toBe(2000);
    expect(recipient.summary.fundraisingAvailableCents).toBe(5000);
  });
  it("retains both locks after a partially committed transfer loses authorization and retries without duplicate money", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 40; i++) await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "fundraiser", amountCents: 1, previousCents: 0, newCents: 1, recordedBy: f.ids.coach.user, recordedAt: 100 + i, idempotencyKey: `fragment:${i}` });
    });
    await rebuildStudent(f.t, f.ids.coach.user, f.ids.student);
    const operationId = await f.lead.mutation(api.financeOperations.transferFundraising, { studentId: f.ids.student, recipientStudentId: f.ids.recipient, amountCents: 7040, reason: "Many original funding fragments", idempotencyKey: "fragmented-transfer" });
    const operation = await f.t.run(ctx => ctx.db.get(operationId));
    if (!operation?.jobId) throw new Error("Missing durable operation");
    expect(operation.state).toBe("running");
    expect(operation.committedCents).toBe(7018);
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.user, { active: false }));
    await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:run"), { jobId: operation.jobId });
    const before = await f.t.run(async ctx => ({ sender: await financialAccount(ctx, f.ids.student), recipient: await financialAccount(ctx, f.ids.recipient), job: await ctx.db.get(operation.jobId!) }));
    expect(before.job?.state).toBe("failed");
    for (const studentId of [f.ids.student, f.ids.recipient]) await expect(f.coach.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId })).rejects.toThrow("existing financial job");
    expect(await f.t.run(async ctx => ({ sender: await financialAccount(ctx, f.ids.student), recipient: await financialAccount(ctx, f.ids.recipient), job: await ctx.db.get(operation.jobId!) }))).toEqual(before);
    await f.coach.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:retry"), { jobId: operation.jobId, reason: "Coach authorized continuation" });
    for (let i = 0; i < 10; i++) {
      const job = await f.t.run(ctx => ctx.db.get(operation.jobId!));
      if (!job || job.state !== "running") break;
      const args = { jobId: job._id, step: job.step };
      await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), args);
      await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), args);
    }
    expect(await f.t.run(ctx => ctx.db.get(operationId))).toMatchObject({ state: "complete", committedCents: 7040 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", fundraisingAvailableCents: 0 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.recipient))).toMatchObject({ state: "ready", fundraisingAvailableCents: 7040 });
  });

  it("returns preparation state without invented balances for historical accounts awaiting rebuild", async () => {
    const f = await fixture(false);
    expect(await f.coach.query(api.financeOperations.operationOptions, { studentId: f.ids.student })).toEqual({ state: "uninitialized", personalAvailableCents: null, fundraisingAvailableCents: null, sourceCount: null, chargeCount: null, recipients: [] });
    await expect(f.mentor.query(api.financeOperations.operationOptions, { studentId: f.ids.student })).rejects.toThrow("Financial editing");
    await f.coach.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: f.ids.student });
    expect(await f.coach.query(api.financeOperations.operationOptions, { studentId: f.ids.student })).toEqual({ state: "updating", personalAvailableCents: null, fundraisingAvailableCents: null, sourceCount: null, chargeCount: null, recipients: [] });
    await rebuildStudent(f.t, f.ids.coach.user, f.ids.student);
    expect(await f.coach.query(api.financeOperations.operationOptions, { studentId: f.ids.student })).toMatchObject({ state: "ready", personalAvailableCents: 1000, fundraisingAvailableCents: 7000 });
  });

  it("transfers only fundraising to the team with explicit destination, preserved roots and creator-scoped replay", async () => {
    const f = await fixture();
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); if (!account) throw new Error("Missing account");
    const args = { studentId: f.ids.student, amountCents: 5000, expectedFinancialRevision: account.revision, reason: "Approved unused fundraising to team", idempotencyKey: "team-transfer-test" };
    const transfer = makeFunctionReference<"mutation">("financeOperations:transferToTeam");
    const id = await f.lead.mutation(transfer, args) as Id<"financeOperations">;
    expect(await f.lead.mutation(transfer, args)).toBe(id);
    expect(await f.t.run(ctx => ctx.db.get(id))).toMatchObject({ kind: "teamTransfer", destination: "team", state: "complete", committedCents: 5000 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ personalAvailableCents: 1000, fundraisingAvailableCents: 2000, travelShareCents: 7000, knownRaisedCents: 0, unknownGrossSourceCount: 2 });
    const entries = await f.t.run(ctx => ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.student)).take(20));
    const outgoing = entries.filter(e => e.operationId === id);
    expect(outgoing).toHaveLength(2);
    expect(outgoing.every(e => e.kind === "transferOut" && e.destination === "team" && e.sourceKind === "fundraiser" && e.originEntryId === e.sourceEntryId && !e.counterpartyStudentId)).toBe(true);
    await expect(f.lead.mutation(transfer, { ...args, amountCents: 1 })).rejects.toThrow("different financial command");
    await expect(f.student.mutation(transfer, args)).rejects.toThrow("Financial editing");
    const updated = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); if (!updated) throw new Error("Missing account");
    await expect(f.coach.mutation(transfer, { ...args, amountCents: 2001, expectedFinancialRevision: updated.revision, idempotencyKey: "cannot-transfer-personal" })).rejects.toThrow("Personal payments");
    await expect(f.coach.mutation(transfer, { ...args, amountCents: 1, idempotencyKey: "stale-team-preview" })).rejects.toThrow("changed");
  });

  it("resumes a multipage team transfer after grant revocation without spending personal money or losing creator replay", async () => {
    const f = await fixture();
    await f.t.run(async ctx => { for (let i = 0; i < 40; i++) await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "fundraiser", amountCents: 1, previousCents: 0, newCents: 1, recordedBy: f.ids.coach.user, recordedAt: 100 + i, idempotencyKey: `team-fragment:${i}` }); });
    await rebuildStudent(f.t, f.ids.coach.user, f.ids.student);
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); if (!account) throw new Error("Missing account");
    const args = { studentId: f.ids.student, amountCents: 7040, expectedFinancialRevision: account.revision, reason: "Approved original credit to team", idempotencyKey: "multipage-team-transfer" };
    const transfer = makeFunctionReference<"mutation">("financeOperations:transferToTeam");
    const operationId = await f.lead.mutation(transfer, args) as Id<"financeOperations">;
    const operation = await f.t.run(ctx => ctx.db.get(operationId)); if (!operation?.jobId) throw new Error("Missing job");
    expect(operation).toMatchObject({ state: "running", committedCents: 7018 });
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.user, { financialEdit: false }));
    await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:run"), { jobId: operation.jobId });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "failed", personalAvailableCents: 1000, fundraisingAvailableCents: 22 });
    await f.coach.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:retry"), { jobId: operation.jobId, reason: "Coach authorizes remaining transfer" });
    for (let i = 0; i < 5; i++) {
      const job = await f.t.run(ctx => ctx.db.get(operation.jobId!)); if (!job || job.state !== "running") break;
      const step = { jobId: job._id, step: job.step };
      await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), step);
      await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), step);
    }
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", personalAvailableCents: 1000, fundraisingAvailableCents: 0 });
    expect(await f.t.run(ctx => ctx.db.get(operation.jobId!))).toMatchObject({ state: "complete", committedCents: 7040, originalActorId: f.ids.lead.user, actorId: f.ids.coach.user });
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.user, { financialEdit: true }));
    expect(await f.lead.mutation(transfer, args)).toBe(operationId);
  });

});
