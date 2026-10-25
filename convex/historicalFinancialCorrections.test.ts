/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addCharge } from "./lib/money";
import { ensureFinancialAccount, financialAccount, recordProjectedEntry } from "./lib/financialSources";
const modules = import.meta.glob("./**/*.ts");
const previewRef = makeFunctionReference<"query">("historicalFinancialCorrections:preview");
const correctRef = makeFunctionReference<"mutation">("historicalFinancialCorrections:correct");
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "historical-coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "historical-coach@example.invalid", name: "Synthetic Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const parentAuth = await ctx.db.insert("users", { email: "historical-parent@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "historical-parent@example.invalid", name: "Synthetic Parent", role: "parent", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Archived synthetic", year: 2025, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Historical synthetic", preferredName: "Historical", email: "historical-student@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ensureFinancialAccount(ctx, student);
    const charge = await addCharge(ctx, (await ctx.db.get(actor))!, student, "Original historical fee", 200, 0, "historical-original-fee");
    const other = await addCharge(ctx, (await ctx.db.get(actor))!, student, "Other historical fee", 100, 1, "historical-other-fee");
    return { auth, parentAuth, actor, season, student, charge: charge!, other: other! };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  await coach.mutation(api.finance.recordFunds, { studentId: ids.student, kind: "payment", amountCents: 100, reason: "Synthetic personal receipt", idempotencyKey: "historical-personal-funds" });
  await coach.mutation(api.finance.recordFunds, { studentId: ids.student, kind: "fundraiser", amountCents: 100, reason: "Synthetic fundraising credit", idempotencyKey: "historical-fundraising-funds" });
  await t.run(async ctx => { await ctx.db.patch(ids.season, { status: "archived" }); await ctx.db.patch(ids.student, { active: false }); await ctx.db.insert("seasons", { name: "Current synthetic", year: 2026, status: "active", startsAt: 1, permissionVersion: "DRAFT", createdBy: ids.actor }); });
  const grant = await coach.mutation(api.historicalCorrections.open, { seasonId: ids.season, reason: "Reviewed historical financial correction", acknowledged: true });
  return { t, ids, coach, parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }), grant };
}
it("corrects archived charges through a scoped grant, releases exact funding sources and reapplies historical priorities", async () => {
  const f = await fixture(); const review = await f.coach.query(previewRef, { seasonId: f.ids.season, chargeId: f.ids.charge, targetEffectiveCents: 50, kind: "adjustment" });
  expect(review).toMatchObject({ ready: true, originalCents: 200, appliedCents: 200, releaseRequiredCents: 150 });
  const args = { correctionSessionId: f.grant.id, chargeId: f.ids.charge, targetEffectiveCents: 50, kind: "adjustment", expectedChargeRevision: review.expectedChargeRevision, expectedFinancialRevision: review.expectedFinancialRevision, reason: "Correct historical fee amount", idempotencyKey: "historical-charge-correction" };
  const job: Id<"financialOperationJobs"> = await f.coach.mutation(correctRef, args);
  expect(await f.coach.mutation(correctRef, args)).toBe(job);
  await f.t.run(async ctx => {
    const original = await ctx.db.get(f.ids.charge); const other = await ctx.db.get(f.ids.other); const account = await financialAccount(ctx, f.ids.student);
    expect(original).toMatchObject({ amountCents: 200, adjustedCents: -150, appliedCents: 50 }); expect(other?.appliedCents).toBe(100);
    expect(account).toMatchObject({ seasonId: f.ids.season, state: "ready", chargedCents: 150, paidCents: 150 }); expect(account!.personalAvailableCents + account!.fundraisingAvailableCents).toBe(50);
    const evidence = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_kind", q => q.eq("studentId", f.ids.student).eq("kind", "deallocation")).take(5);
    expect(evidence.reduce((sum, row) => sum + row.amountCents, 0)).toBe(150); expect(new Set(evidence.map(row => row.sourceKind))).toEqual(new Set(["payment", "fundraiser"]));
    expect((await ctx.db.get(job))?.historicalCorrectionSessionId).toBe(f.grant.id);
  });
  await expect(f.coach.mutation(api.chargeAdmin.correct, { chargeId: f.ids.charge, kind: "adjustment", targetEffectiveCents: 40, expectedChargeRevision: 0, expectedFinancialRevision: 0, reason: "Ordinary API must stay scoped", idempotencyKey: "ordinary-historical-denial" })).rejects.toThrow("active season");
});
it("denies expired/wrong-role/stale grants and holds all linked histories without changing balances", async () => {
  const f = await fixture(); const query = { seasonId: f.ids.season, chargeId: f.ids.charge, targetEffectiveCents: 50, kind: "cancellation" };
  await expect(f.parent.query(previewRef, query)).rejects.toThrow();
  const preview = await f.coach.query(previewRef, query);
  const args = { correctionSessionId: f.grant.id, chargeId: f.ids.charge, targetEffectiveCents: 50, kind: "cancellation", expectedChargeRevision: preview.expectedChargeRevision, expectedFinancialRevision: preview.expectedFinancialRevision, reason: "Reviewed historical cancellation", idempotencyKey: "historical-denial-command" };
  await expect(f.coach.mutation(correctRef, { ...args, expectedFinancialRevision: preview.expectedFinancialRevision - 1 })).rejects.toThrow("changed");
  await f.t.run(ctx => ctx.db.patch(f.grant.id, { expiresAt: 0 }));
  await expect(f.coach.mutation(correctRef, args)).rejects.toThrow("access has ended");
  const fresh = await f.coach.mutation(api.historicalCorrections.open, { seasonId: f.ids.season, reason: "Renewed historical review access", acknowledged: true });
  await f.t.run(async ctx => {
    const account = await financialAccount(ctx, f.ids.student);
    const root = await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "fundraiser", amountCents: 1, previousCents: 0, newCents: 1, recordedBy: f.ids.actor, recordedAt: 1, idempotencyKey: "historical-transfer-root" });
    await recordProjectedEntry(ctx, root, account!);
    const out = await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "transferOut", amountCents: 1, previousCents: 1, newCents: 0, sourceEntryId: root, sourceKind: "fundraiser", destination: "team", recordedBy: f.ids.actor, recordedAt: 2, reason: "Prior reviewed team transfer", idempotencyKey: "historical-transfer-out" });
    await recordProjectedEntry(ctx, out, account!);
  });
  const before = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
  expect(await f.coach.query(previewRef, query)).toMatchObject({ ready: false, message: expect.stringContaining("separate review") });
  await expect(f.coach.mutation(correctRef, { ...args, correctionSessionId: fresh.id })).rejects.toThrow("separate review");
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toEqual(before);
});

it("pauses archived allocation after grant expiry and resumes only with a fresh grant", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const account = await financialAccount(ctx, f.ids.student);
    for (let number = 0; number < 8; number++) {
      const id = await ctx.db.insert("charges", { studentId: f.ids.student, label: `Historical small fee ${number}`, amountCents: 1, appliedCents: 0, outstanding: true, priority: number + 2, createdBy: f.ids.actor, createdAt: number });
      const { recordChargeChange } = await import("./lib/financialSources");
      await recordChargeChange(ctx, account!, (await ctx.db.get(id))!, 0, 0, true);
    }
  });
  const review = await f.coach.query(previewRef, { seasonId: f.ids.season, chargeId: f.ids.charge, targetEffectiveCents: 50, kind: "adjustment" });
  const job: Id<"financialOperationJobs"> = await f.coach.mutation(correctRef, { correctionSessionId: f.grant.id, chargeId: f.ids.charge, targetEffectiveCents: 50, kind: "adjustment", expectedChargeRevision: review.expectedChargeRevision, expectedFinancialRevision: review.expectedFinancialRevision, reason: "Reviewed allocation recovery", idempotencyKey: "historical-recovery-command" });
  const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); expect(account?.state).toBe("allocating");
  await f.t.run(ctx => ctx.db.patch(f.grant.id, { expiresAt: 0 }));
  await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:run"), { jobId: account!.allocationJobId });
  expect((await f.t.run(ctx => financialAccount(ctx, f.ids.student)))?.state).toBe("failed");
  await expect(f.coach.mutation(makeFunctionReference<"mutation">("historicalFinancialCorrections:retry"), { correctionSessionId: f.grant.id, jobId: job, reason: "Expired access is rejected" })).rejects.toThrow("access has ended");
  const fresh = await f.coach.mutation(api.historicalCorrections.open, { seasonId: f.ids.season, reason: "Fresh grant for recovery", acknowledged: true });
  await f.coach.mutation(makeFunctionReference<"mutation">("historicalFinancialCorrections:retry"), { correctionSessionId: fresh.id, jobId: job, reason: "Coach reviewed failed allocation" });
  for (let step = 0; step < 10; step++) {
    const current = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); if (current?.state === "ready") break;
    await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:run"), { jobId: current!.allocationJobId });
  }
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", chargedCents: 158, paidCents: 158 });
});
