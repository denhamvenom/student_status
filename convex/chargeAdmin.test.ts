/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { createTest } from "../testUtils";
import schema from "./schema";
import { startFinancialRebuild } from "./financialSources";
import { financialAccount } from "./lib/financialSources";
import { effectiveChargeCents } from "./lib/chargeObligation";
const modules = import.meta.glob("./**/*.ts");
const preview = makeFunctionReference<"query">("chargeAdmin:previewCorrection");
const correct = makeFunctionReference<"mutation">("chargeAdmin:correct");
const worker = makeFunctionReference<"mutation">("financialOperationsWorker:processPage");

async function fixture(fragments = false, highCancellation = false) {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function user(name: string, role: "coach" | "mentor" | "student", lead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, active: true, travelLead: lead, financialEdit: lead });
      return { auth, id };
    }
    const coach = await user("Coach", "coach"); const alternate = await user("Alternate", "coach"); const mentor = await user("Lead", "mentor", true); const studentUser = await user("Student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.id });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.id, legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const charge = await ctx.db.insert("charges", { studentId: student, label: "Original fee", amountCents: highCancellation ? Number.MAX_SAFE_INTEGER : fragments ? 25 : 100, appliedCents: highCancellation ? 0 : fragments ? 25 : 80, cancelledCents: highCancellation ? Number.MAX_SAFE_INTEGER : undefined, priority: 1, createdBy: coach.id, createdAt: 1 });
    for (let i = 0; i < (highCancellation ? 0 : fragments ? 25 : 2); i++) {
      const kind = i % 2 === 0 ? "payment" as const : "fundraiser" as const;
      const amount = fragments ? 1 : 50;
      const source = await ctx.db.insert("ledgerEntries", { studentId: student, kind, amountCents: amount, previousCents: 0, newCents: amount, recordedBy: coach.id, recordedAt: i, idempotencyKey: `source:${i}` });
      await ctx.db.insert("ledgerEntries", { studentId: student, chargeId: charge, kind: "allocation", sourceEntryId: source, sourceKind: kind, amountCents: fragments ? 1 : 40, previousCents: 0, newCents: fragments ? 1 : 40, recordedBy: coach.id, recordedAt: i + 1, idempotencyKey: `allocate:${i}` });
    }
    return { coach, alternate, mentor, studentUser, season, student, charge };
  });
  await t.run(ctx => startFinancialRebuild(ctx, ids.student, ids.coach.id));
  for (let i = 0; i < 40; i++) {
    const account = await t.run(ctx => financialAccount(ctx, ids.student)); if (!account || account.state !== "rebuilding") break;
    await t.mutation(makeFunctionReference<"mutation">("financialSources:processPage"), { accountId: account._id, generation: account.generation, phase: account.phase, cursor: account.cursor });
  }
  const as = (auth: Id<"users">) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), alternate: as(ids.alternate.auth), mentor: as(ids.mentor.auth), student: as(ids.studentUser.auth) };
}

async function command(f: Awaited<ReturnType<typeof fixture>>, targetEffectiveCents: number, kind: "adjustment" | "cancellation", key: string, chargeId = f.ids.charge) {
  const result = await f.coach.query(preview, { chargeId, targetEffectiveCents, kind }) as { expectedChargeRevision: number; expectedFinancialRevision: number };
  return { chargeId, targetEffectiveCents, kind, expectedChargeRevision: result.expectedChargeRevision, expectedFinancialRevision: result.expectedFinancialRevision, reason: "Coach reviewed original fee correction", idempotencyKey: key };
}

describe("charge obligation administration", () => {
  it("increases obligation without rewriting original charge, then cancels paid mixed sources without creating money", async () => {
    const f = await fixture();
    const increase = await command(f, 150, "adjustment", "increase-correction");
    await f.coach.mutation(correct, increase);
    const increased = await f.t.run(ctx => ctx.db.get(f.ids.charge));
    expect(increased).toMatchObject({ amountCents: 100, adjustedCents: 50, appliedCents: 100 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ chargedCents: 150, paidCents: 100, personalAvailableCents: 0, fundraisingAvailableCents: 0 });
    const cancel = await command(f, 0, "cancellation", "cancel-correction");
    await f.coach.mutation(correct, cancel);
    const cancelled = await f.t.run(ctx => ctx.db.get(f.ids.charge));
    expect(cancelled).toMatchObject({ amountCents: 100, adjustedCents: 50, cancelledCents: 150, appliedCents: 0 });
    expect(cancelled && effectiveChargeCents(cancelled)).toBe(0);
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ chargedCents: 0, paidCents: 0, personalAvailableCents: 50, fundraisingAvailableCents: 50, travelShareCents: 50 });
    const history = await f.student.query(makeFunctionReference<"query">("chargeAdmin:history"), { chargeId: f.ids.charge, paginationOpts: { numItems: 20, cursor: null } }) as { page: { releasedCents: number }[] };
    expect(history.page).toHaveLength(2); expect(history.page[0].releasedCents).toBe(100);
    await expect(f.student.mutation(correct, cancel)).rejects.toThrow("Only a Coach");
    await expect(f.mentor.query(preview, { chargeId: f.ids.charge, kind: "adjustment", targetEffectiveCents: 1 })).rejects.toThrow("Only a Coach");
  });

  it("keeps old obligation pending across more than20 releases, failure and reasoned takeover retry", async () => {
    const f = await fixture(true); const args = await command(f, 0, "cancellation", "fragmented-cancel");
    const result = await f.coach.mutation(correct, args) as { jobId: Id<"financialOperationJobs"> };
    expect(await f.t.run(ctx => ctx.db.get(f.ids.charge))).toMatchObject({ amountCents: 25, appliedCents: 5 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "posting", chargedCents: 25, paidCents: 5 });
    expect(await f.t.run(ctx => ctx.db.query("chargeRevisions").withIndex("by_chargeId_and_recordedAt", q => q.eq("chargeId", f.ids.charge)).first())).toBeNull();
    await f.t.run(ctx => ctx.db.patch(f.ids.coach.id, { active: false }));
    await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:run"), { jobId: result.jobId });
    await expect(f.alternate.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: f.ids.student })).rejects.toThrow("existing financial job");
    await f.alternate.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:retry"), { jobId: result.jobId, reason: "Alternate Coach reviewed continuation" });
    const job = await f.t.run(ctx => ctx.db.get(result.jobId)); if (!job) throw new Error("Missing job");
    await f.t.mutation(worker, { jobId: job._id, step: job.step }); await f.t.mutation(worker, { jobId: job._id, step: job.step });
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    expect(account).toMatchObject({ state: "ready", chargedCents: 0, paidCents: 0 });
    expect((account?.personalAvailableCents ?? 0) + (account?.fundraisingAvailableCents ?? 0)).toBe(25);
    expect(await f.t.run(ctx => ctx.db.query("chargeRevisions").withIndex("by_chargeId_and_recordedAt", q => q.eq("chargeId", f.ids.charge)).first())).toMatchObject({ beforeAppliedCents: 25, afterAppliedCents: 0, releasedCents: 25, createdBy: f.ids.coach.id, processedBy: f.ids.alternate.id });
    await f.t.run(ctx => ctx.db.patch(f.ids.coach.id, { active: true }));
    expect((await f.coach.mutation(correct, args) as { jobId: string }).jobId).toBe(result.jobId);
    await expect(f.coach.mutation(correct, { ...args, targetEffectiveCents: 1 })).rejects.toThrow("already submitted with different details");
  });

  it("rejects stale reviewed amounts and cancellation increases before acquiring a lock", async () => {
    const f = await fixture(); const args = await command(f, 50, "adjustment", "stale-correction");
    await f.coach.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: f.ids.student, kind: "payment", amountCents: 1, reason: "Concurrent receipt", idempotencyKey: "concurrent-receipt" });
    await expect(f.coach.mutation(correct, args)).rejects.toThrow("changed");
    const invalid = await f.coach.query(preview, { chargeId: f.ids.charge, targetEffectiveCents: 101, kind: "cancellation" }) as { state: string };
    expect(invalid.state).toBe("hold");
    expect((await f.t.run(ctx => financialAccount(ctx, f.ids.student)))?.state).toBe("ready");
  });
  it("corrects unpaid fees and preserves an approved withdrawal when correcting its retained payment", async () => {
    const f = await fixture(true);
    const newCharge = await f.coach.mutation(makeFunctionReference<"mutation">("finance:createCharge"), { studentId: f.ids.student, label: "Unpaid extra", amountCents: 10, priority: 2, idempotencyKey: "unpaid-new-charge" }) as Id<"charges">;
    await f.coach.mutation(correct, await command(f, 5, "adjustment", "unpaid-adjustment", newCharge));
    expect(await f.t.run(ctx => ctx.db.get(newCharge))).toMatchObject({ amountCents: 10, adjustedCents: -5, appliedCents: 0 });
    await f.coach.mutation(correct, await command(f, 0, "cancellation", "unpaid-cancellation", newCharge));
    const event = await f.t.run(async ctx => {
      const id = await ctx.db.insert("events", { seasonId: f.ids.season, name: "Synthetic prior trip", type: "Team", startsAt: 1, endsAt: 2, destination: "Synthetic", travel: "none", overnight: false, roomingEnabled: false, feeCents: 25, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
      await ctx.db.patch(f.ids.charge, { eventId: id });
      await ctx.db.insert("participants", { eventId: id, studentId: f.ids.student, status: "confirmed", createdAt: 1, updatedAt: 1 });
      return id;
    });
    await f.coach.mutation(correct, await command(f, 50, "adjustment", "before-withdrawal-increase"));
    await f.coach.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: f.ids.student, kind: "payment", amountCents: 25, reason: "Funds for adjusted travel fee", idempotencyKey: "adjusted-fee-payment" });
    const display = await f.student.query(makeFunctionReference<"query">("withdrawals:withdrawalPreview"), { eventId: event, studentId: f.ids.student }) as { charges: { chargedCents: number; originalChargedCents: number; adjustedCents: number; paidCents: number }[] };
    expect(display.charges[0]).toMatchObject({ chargedCents: 50, originalChargedCents: 25, adjustedCents: 25, paidCents: 50 });
    const requestId = await f.student.mutation(makeFunctionReference<"mutation">("withdrawals:requestWithdrawal"), { eventId: event, idempotencyKey: "retained-withdrawal-request" });
    const oldPreview = await f.coach.query(makeFunctionReference<"query">("withdrawals:withdrawalPreview"), { eventId: event, studentId: f.ids.student }) as { revision: string };
    await f.coach.mutation(makeFunctionReference<"mutation">("withdrawals:reviewWithdrawal"), { requestId, decision: "retain", cancelUnpaidMain: false, reason: "Retain previously paid travel fee", expectedRevision: oldPreview.revision });
    const result = await f.coach.mutation(correct, await command(f, 10, "adjustment", "after-withdrawal-correction")) as { jobId: Id<"financialOperationJobs"> };
    for (let i = 0; i < 5; i++) {
      const job = await f.t.run(ctx => ctx.db.get(result.jobId)); if (!job || job.state !== "running") break;
      await f.t.mutation(worker, { jobId: job._id, step: job.step });
    }
    const participant = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event).eq("studentId", f.ids.student)).unique());
    expect(participant?.status).toBe("withdrawn");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.charge))).toMatchObject({ amountCents: 25, adjustedCents: -15, appliedCents: 10 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ chargedCents: 10, paidCents: 10 });
  });

  it("preserves native split metadata and small read budgets while rejecting expanded source pages before hydration", async () => {
    const f = await fixture(true);
    const source = makeFunctionReference<"query">("chargeAdmin:sourceEvidence");
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); if (!account) throw new Error("Missing account");
    const options = { numItems: 20, cursor: null, maximumRowsRead: 1 };
    const native = await f.t.run(ctx => ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_chargeId", q => q.eq("studentId", f.ids.student).eq("generation", account.generation).eq("chargeId", f.ids.charge)).paginate(options));
    const wrapped = await f.student.query(source, { chargeId: f.ids.charge, paginationOpts: options }) as { page: unknown[]; isDone: boolean; continueCursor: string; splitCursor?: string; pageStatus?: string };
    expect(wrapped.page).toHaveLength(native.page.length);
    expect(wrapped.continueCursor).toBe(native.continueCursor); expect(wrapped.splitCursor).toBe(native.splitCursor); expect(wrapped.pageStatus).toBe(native.pageStatus);
    const first = await f.student.query(source, { chargeId: f.ids.charge, paginationOpts: { numItems: 20, cursor: null } }) as { continueCursor: string };
    const second = await f.student.query(source, { chargeId: f.ids.charge, paginationOpts: { numItems: 20, cursor: first.continueCursor } }) as { continueCursor: string };
    await expect(f.student.query(source, { chargeId: f.ids.charge, paginationOpts: { numItems: 1, cursor: null, endCursor: second.continueCursor, maximumRowsRead: 10000 } })).rejects.toThrow("list couldn't load");
    await expect(f.student.query(source, { chargeId: f.ids.charge, paginationOpts: { numItems: 1, cursor: null, maximumRowsRead: Number.NaN } })).rejects.toThrow("list couldn't load");
  });

  it("denies cross-season charges and concurrent contradictory commands before any extra money movement", async () => {
    const f = await fixture();
    const oldCharge = await f.t.run(async ctx => {
      const season = await ctx.db.insert("seasons", { name: "Archived", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: f.ids.coach.id });
      const student = await ctx.db.insert("students", { seasonId: season, legalName: "Archived synthetic", preferredName: "Archived", email: "archived@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      return ctx.db.insert("charges", { studentId: student, label: "Archived fee", amountCents: 1, appliedCents: 0, priority: 1, createdBy: f.ids.coach.id, createdAt: 1 });
    });
    await expect(f.coach.query(preview, { chargeId: oldCharge, kind: "cancellation", targetEffectiveCents: 0 })).rejects.toThrow("active season");
    const args = await command(f, 30, "adjustment", "concurrent-correction");
    const results = await Promise.all([f.coach.mutation(correct, args), f.coach.mutation(correct, args)]) as { jobId: string }[];
    expect(results[0].jobId).toBe(results[1].jobId);
    expect(await f.t.run(ctx => ctx.db.query("chargeRevisions").withIndex("by_chargeId_and_recordedAt", q => q.eq("chargeId", f.ids.charge)).collect())).toHaveLength(1);
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    expect(account).toMatchObject({ chargedCents: 30, paidCents: 30 });
    expect((account?.personalAvailableCents ?? 0) + (account?.fundraisingAvailableCents ?? 0)).toBe(70);
  });

  it("holds unrepresentable high-cancellation targets before acquiring a financial lock", async () => {
    const f = await fixture(false, true);
    const result = await f.coach.query(preview, { chargeId: f.ids.charge, targetEffectiveCents: 1, kind: "adjustment" }) as { state: string; message: string };
    expect(result).toMatchObject({ state: "hold" }); expect(result.message).toContain("too large");
    const before = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    await expect(f.coach.mutation(correct, await command(f, 1, "adjustment", "oversized-adjustment"))).rejects.toThrow("too large");
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toEqual(before);
    expect(await f.t.run(ctx => ctx.db.query("financialOperationJobs").withIndex("by_chargeId_and_updatedAt", q => q.eq("chargeId", f.ids.charge)).first())).toBeNull();
  });

  it("stops when an event is archived between source-release pages and preserves the failed lock", async () => {
    const f = await fixture(true);
    const event = await f.t.run(async ctx => {
      const id = await ctx.db.insert("events", { seasonId: f.ids.season, name: "Archive during correction", type: "Team", startsAt: 1, endsAt: 2, destination: "Synthetic", travel: "none", overnight: false, roomingEnabled: false, feeCents: 25, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
      await ctx.db.patch(f.ids.charge, { eventId: id }); return id;
    });
    const args = await command(f, 0, "cancellation", "archive-pending-correction");
    const result = await f.coach.mutation(correct, args) as { jobId: Id<"financialOperationJobs"> };
    await f.t.run(ctx => ctx.db.patch(event, { archived: true }));
    await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:run"), { jobId: result.jobId });
    const before = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    expect(before).toMatchObject({ state: "failed", chargedCents: 25, paidCents: 5 });
    expect(await f.student.query(makeFunctionReference<"query">("chargeAdmin:status"), { chargeId: f.ids.charge, jobId: result.jobId })).toMatchObject({ financialState: "failed", canRetry: false, job: { state: "failed", committedCents: 20 } });
    expect(await f.coach.query(makeFunctionReference<"query">("financialOperationsWorker:status"), { studentId: f.ids.student })).toMatchObject({ canRetry: false, job: { state: "failed" } });
    expect(await f.coach.query(preview, { chargeId: f.ids.charge, kind: "cancellation", targetEffectiveCents: 0 })).toMatchObject({ state: "hold" });
    await expect(f.coach.mutation(correct, { ...args, idempotencyKey: "new-archived-correction" })).rejects.toThrow("past event");
    await expect(f.coach.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:retry"), { jobId: result.jobId, reason: "Cannot bypass historical review" })).rejects.toThrow("Past events");
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toEqual(before);
  });

});
