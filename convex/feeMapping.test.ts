/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { createTest } from "../testUtils";
import schema from "./schema";
import { createFinancialAccount, financialAccount, recordProjectedEntry, saveFinancialAccount } from "./lib/financialSources";
const modules = import.meta.glob("./**/*.ts");

it("cancels a stale zero-money mapping review after an existing allocator drains and reprepares without abandoning its money", async () => {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "ready", mappingInitialized: true, orderReady: false, unmappedCount: 1, updatedAt: 0 });
    const charge = await ctx.db.insert("charges", { studentId: student, label: "Legacy charge", amountCents: 100, appliedCents: 0, priority: 1, outstanding: true, createdBy: actor, createdAt: 0 });
    await ctx.db.insert("feeUnmappedCharges", { seasonId: season, chargeId: charge, state: "unmapped", observedAt: 0 });
    const fee = await ctx.db.insert("feeDefinitions", { seasonId: season, kind: "custom", label: "Explicit reviewed fee", defaultAmountCents: 100, priority: 1, revision: 0, state: "active", createdBy: actor, createdAt: 0, updatedAt: 0 });
    const accountId = await createFinancialAccount(ctx, student, "ready"); const account = await ctx.db.get(accountId); if (!account) throw new Error("fixture");
    account.chargedCents = 100; account.chargeCount = 1;
    const source = await ctx.db.insert("ledgerEntries", { studentId: student, kind: "payment", amountCents: 1, previousCents: 0, newCents: 1, recordedBy: actor, recordedAt: 0, idempotencyKey: "already-running-source" });
    await recordProjectedEntry(ctx, source, account);
    const allocation = await ctx.db.insert("financialAllocationJobs", { studentId: student, actorId: actor, generation: account.generation, state: "running", chargeCursor: null, step: 0, processed: 0, idempotencyPrefix: "already-running", updatedAt: 0 });
    account.state = "allocating"; account.allocationJobId = allocation; await saveFinancialAccount(ctx, account);
    return { auth, season, student, charge, fee, control, allocation };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const map = makeFunctionReference<"mutation">("feeDefinitions:mapCharges");
  const run = makeFunctionReference<"mutation">("feeMappingWorker:run");
  const jobId = await coach.mutation(map, { chargeIds: [{ chargeId: ids.charge, expectedChargeRevision: 0 }], feeDefinitionId: ids.fee, expectedOrderRevision: 0, reason: "Coach explicitly reviewed original charge", idempotencyKey: "mapping-before-drain" }) as Id<"feeMappingJobs">;
  await t.mutation(run, { jobId });
  await t.mutation(makeFunctionReference<"mutation">("financialAllocation:processPage"), { jobId: ids.allocation, step: 0 });
  await t.mutation(run, { jobId }); await t.mutation(run, { jobId });
  expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "failed", mapped: 0, phase: "review" });
  expect(await t.run(ctx => ctx.db.get(ids.allocation))).toMatchObject({ state: "complete" });
  await coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:cancelMapping"), { jobId, reason: "Coach canceled stale zero-money mapping review" });
  expect(await t.run(ctx => financialAccount(ctx, ids.student))).toMatchObject({ state: "ready", chargedCents: 100, paidCents: 1, personalAvailableCents: 0 });
  const charge = await t.run(ctx => ctx.db.get(ids.charge)); const control = await t.run(ctx => ctx.db.get(ids.control));
  const fresh = await coach.mutation(map, { chargeIds: [{ chargeId: ids.charge, expectedChargeRevision: charge!.revision }], feeDefinitionId: ids.fee, expectedOrderRevision: control!.revision, reason: "Coach reviewed completed allocation evidence", idempotencyKey: "fresh-mapping-review" }) as Id<"feeMappingJobs">;
  for (let i = 0; i < 20; i++) { if ((await t.run(ctx => ctx.db.get(fresh)))?.state === "complete") break; await t.mutation(run, { jobId: fresh }); }
  expect(await t.run(ctx => ctx.db.get(fresh))).toMatchObject({ state: "complete", mapped: 1 });
  expect(await t.run(ctx => ctx.db.get(ids.control))).toMatchObject({ state: "ready", unmappedCount: 0, orderReady: true });
  expect(await t.run(ctx => ctx.db.get(ids.charge))).toMatchObject({ feeDefinitionId: ids.fee, amountCents: 100, appliedCents: 1 });
});

it("keeps every ambiguous historical charge reviewable beyond 500 rows and never guesses from equal labels", async () => {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const charges = [];
    for (let i = 0; i < 511; i++) charges.push(await ctx.db.insert("charges", { studentId: student, label: "Identical legacy label", amountCents: 100, appliedCents: 0, priority: 1, createdBy: actor, createdAt: i }));
    const definition = await ctx.db.insert("feeDefinitions", { seasonId: season, kind: "custom", label: "Coach explicitly grouped fee", defaultAmountCents: 100, priority: 1, revision: 0, state: "active", createdBy: actor, createdAt: 0, updatedAt: 0, originProof: "manual" });
    return { auth, season, charges, definition };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const start = makeFunctionReference<"mutation">("feeDefinitions:prepareMapping");
  const process = makeFunctionReference<"mutation">("feeMappingWorker:processPage");
  async function finish(jobId: Id<"feeMappingJobs">) {
    for (let i = 0; i < 100; i++) {
      const job = await t.run(ctx => ctx.db.get(jobId));
      if (!job || job.state === "complete") return;
      await t.mutation(process, { jobId, step: job.step });
    }
    throw new Error("Mapping failed to finish within expected page count.");
  }
  const jobId = await coach.mutation(start, { reason: "Review imported fee identities", idempotencyKey: "prepare-historical" }) as Id<"feeMappingJobs">;
  await finish(jobId);
  const control = await t.run(ctx => ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", ids.season)).unique());
  expect(control).toMatchObject({ state: "ready", mappingInitialized: true, orderReady: false, unmappedCount: 511 });
  expect(await t.run(ctx => ctx.db.query("feeUnmappedCharges").collect())).toHaveLength(511);
  expect(await t.run(ctx => ctx.db.get(ids.charges[0]))).not.toHaveProperty("feeDefinitionId");
  const reviewed = await coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:mapCharges"), { chargeIds: ids.charges.slice(0, 20).map(chargeId => ({ chargeId, expectedChargeRevision: 0 })), feeDefinitionId: ids.definition, expectedOrderRevision: control!.revision, reason: "Coach reviewed explicit grouping", idempotencyKey: "review-first-twenty" }) as Id<"feeMappingJobs">;
  await finish(reviewed);
  expect(await t.run(ctx => ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", ids.season)).unique())).toMatchObject({ unmappedCount: 491, orderReady: false, state: "ready" });
  expect(await t.run(ctx => ctx.db.get(ids.charges[0]))).toMatchObject({ feeDefinitionId: ids.definition, amountCents: 100, appliedCents: 0, priority: 1 });
});
