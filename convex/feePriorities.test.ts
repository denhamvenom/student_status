/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { createFinancialAccount } from "./lib/financialSources";
import { allocateUnapplied } from "./lib/money";
const modules = import.meta.glob("./**/*.ts");
const move = makeFunctionReference<"mutation">("feePriorities:move");
const process = makeFunctionReference<"mutation">("feePriorityWorker:processPage");

it("permits projection-only Coach repair after a missing-account failure while keeping the frozen priority job and money gate", async () => {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "ready", mappingInitialized: true, orderReady: true, unmappedCount: 0, updatedAt: 0 });
    const base = { seasonId: season, kind: "custom" as const, defaultAmountCents: 100, revision: 0, state: "active" as const, createdBy: actor, createdAt: 0, updatedAt: 0 };
    const first = await ctx.db.insert("feeDefinitions", { ...base, label: "First", priority: 1 });
    await ctx.db.insert("feeDefinitions", { ...base, label: "Second", priority: 2 });
    const charge = await ctx.db.insert("charges", { studentId: student, feeDefinitionId: first, label: "Fee", amountCents: 100, appliedCents: 0, priority: 1, createdBy: actor, createdAt: 0 });
    return { auth, actor, season, student, control, first, charge };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const jobId = await coach.mutation(move, { feeDefinitionId: ids.first, direction: "down", expectedOrderRevision: 0, expectedDefinitionRevision: 0, reason: "Review shared fee order change", idempotencyKey: "missing-projection-swap" }) as Id<"feePriorityJobs">;
  const run = makeFunctionReference<"mutation">("feePriorityWorker:run");
  await t.mutation(run, { jobId }); await t.mutation(run, { jobId });
  expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "failed", firstFeeId: ids.first });
  expect(await t.run(ctx => ctx.db.get(ids.charge))).toMatchObject({ amountCents: 100, appliedCents: 0, priority: 1 });
  const accountId = await coach.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: ids.student }) as Id<"financialAccounts">;
  for (let i = 0; i < 20; i++) {
    if ((await t.run(ctx => ctx.db.get(accountId)))?.state === "ready") break;
    await t.mutation(makeFunctionReference<"mutation">("financialSources:run"), { accountId });
  }
  expect((await t.run(ctx => ctx.db.get(ids.control)))?.state).toBe("failed");
  await expect(t.run(async ctx => { const actor = await ctx.db.get(ids.actor); return allocateUnapplied(ctx, actor!, ids.student, "forbidden-during-repair"); })).rejects.toThrow("Season fees");
  await expect(coach.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: ids.student, kind: "payment", amountCents: 1, reason: "Forbidden during projection repair", idempotencyKey: "forbidden-repair-key" })).rejects.toThrow("Season fees");
  await coach.mutation(makeFunctionReference<"mutation">("feePriorities:retry"), { jobId, reason: "Coach verified completed source repair" });
  for (let i = 0; i < 20; i++) { if ((await t.run(ctx => ctx.db.get(jobId)))?.state === "complete") break; await t.mutation(run, { jobId }); }
  expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "complete", firstFeeId: ids.first, processed: 1 });
  expect(await t.run(ctx => ctx.db.get(accountId))).toMatchObject({ state: "ready", chargedCents: 100, paidCents: 0, personalAvailableCents: 0, fundraisingAvailableCents: 0 });
});

it("propagates a season-wide adjacent swap over multiple pages without changing obligations or allocations", async () => {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const account = await createFinancialAccount(ctx, student, "ready");
    await ctx.db.patch(account, { chargedCents: 4000, chargeCount: 40 });
    const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "ready", mappingInitialized: true, orderReady: true, unmappedCount: 0, updatedAt: 0 });
    const base = { seasonId: season, kind: "custom" as const, defaultAmountCents: 100, revision: 0, state: "active" as const, createdBy: actor, createdAt: 0, updatedAt: 0 };
    const first = await ctx.db.insert("feeDefinitions", { ...base, label: "First", priority: 1 });
    const second = await ctx.db.insert("feeDefinitions", { ...base, label: "Second", priority: 2 });
    for (let i = 0; i < 40; i++) await ctx.db.insert("charges", { studentId: student, feeDefinitionId: i < 30 ? first : second, label: "Fee", amountCents: 100, appliedCents: 0, priority: i < 30 ? 1 : 2, createdBy: actor, createdAt: i });
    return { auth, actor, season, student, account, control, first, second };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const input = { feeDefinitionId: ids.first, direction: "down", expectedOrderRevision: 0, expectedDefinitionRevision: 0, reason: "Reviewed season-wide priority", idempotencyKey: "priority-swap-key" };
  const jobId = await coach.mutation(move, input) as Id<"feePriorityJobs">;
  expect(await coach.mutation(move, input)).toBe(jobId);
  await expect(coach.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: ids.student, kind: "payment", amountCents: 1, reason: "Blocked during maintenance", idempotencyKey: "blocked-payment" })).rejects.toThrow("Season fees");
  for (let i = 0; i < 100; i++) {
    const job = await t.run(ctx => ctx.db.get(jobId));
    if (!job || job.state === "complete") break;
    await t.mutation(process, { jobId, step: job.step });
    await t.mutation(process, { jobId, step: job.step });
  }
  const result = await t.run(async ctx => ({ job: await ctx.db.get(jobId), control: await ctx.db.get(ids.control), account: await ctx.db.get(ids.account), charges: await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", ids.student)).collect(), receipts: await ctx.db.query("chargeRevisions").collect() }));
  expect(result.job).toMatchObject({ state: "complete", processed: 40 });
  expect(result.control?.state).toBe("ready");
  expect(result.account).toMatchObject({ chargedCents: 4000, paidCents: 0 });
  expect(result.receipts).toHaveLength(40);
  for (const charge of result.charges) expect(charge).toMatchObject({ priority: charge.feeDefinitionId === ids.first ? 2 : 1, amountCents: 100, appliedCents: 0 });
});
