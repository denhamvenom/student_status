/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import { addCharge } from "./lib/money";
import { ensureFinancialAccount, financialAccount, recordChargeChange, recordProjectedEntry } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { recordLedgerChange } from "./lib/financeChanges";
const modules = import.meta.glob("./**/*.ts");
const rows = makeFunctionReference<"query">("financeAdmin:students");
const feed = makeFunctionReference<"query">("financeAdmin:recentChanges");
const allocation = makeFunctionReference<"mutation">("financialAllocation:processPage");
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "v4@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, name: "Coach", email: "v4@example.invalid", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "V4", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "v4-student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    return { auth, actor, season, student };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}
describe("source-separated finance administration", () => {
  it("keeps personal Paid and fundraising Credits exact through source release and does not confuse receipts with wallet balances", async () => {
    const f = await fixture();
    const chargeId = await f.t.run(async ctx => {
      const actor = await ctx.db.get(f.ids.actor); if (!actor) throw new Error("Actor missing");
      const account = await ensureFinancialAccount(ctx, f.ids.student);
      for (const [kind, amount] of [["payment", 40], ["fundraiser", 60]] as const) {
        const id = await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind, amountCents: amount, previousCents: 900, newCents: 900 + amount, recordedBy: actor._id, recordedAt: Date.now(), idempotencyKey: `receipt:${kind}`, reason: "Receipt" });
        await recordProjectedEntry(ctx, id, account);
      }
      return addCharge(ctx, actor, f.ids.student, "Fee", 100, 0, "mixed-fee");
    });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ paidCents: 100, personalAppliedCents: 40, fundraisingAppliedCents: 60 });
    await f.t.run(async ctx => {
      const account = await financialAccount(ctx, f.ids.student); const charge = await ctx.db.get(chargeId); if (!account || !charge) throw new Error("Missing data");
      const source = await ctx.db.query("financialAllocations").withIndex("by_studentId_and_generation_and_chargeId_and_status", q => q.eq("studentId", f.ids.student).eq("generation", account.generation).eq("chargeId", chargeId).eq("status", "applied")).collect();
      const fundraiser = source.find(item => item.sourceKind === "fundraiser"); if (!fundraiser) throw new Error("Missing funding");
      const id = await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, chargeId, kind: "deallocation", amountCents: 15, previousCents: 100, newCents: 85, sourceEntryId: fundraiser.sourceEntryId, sourceKind: "fundraiser", recordedBy: f.ids.actor, recordedAt: Date.now(), idempotencyKey: "release", reason: "Release" });
      await recordProjectedEntry(ctx, id, account); await ctx.db.patch(chargeId, { appliedCents: 85 }); charge.appliedCents = 85;
      await recordChargeChange(ctx, account, charge, 100, 100); await refreshStudentFinance(ctx, f.ids.student);
      await recordLedgerChange(ctx, (await ctx.db.get(id))!, f.ids.season, true);
    });
const rebuildRef = makeFunctionReference<"mutation">("financialSources:rebuild");
    const rebuildPage = makeFunctionReference<"mutation">("financialSources:processPage");
    await f.coach.mutation(rebuildRef, { studentId: f.ids.student });
    for (let i = 0; i < 20; i++) {
      const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); if (!account || account.state !== "rebuilding") break;
      await f.t.mutation(rebuildPage, { accountId: account._id, generation: account.generation, phase: account.phase, cursor: account.cursor });
    }
    const result = await f.coach.query(rows, { paginationOpts: { numItems: 20, cursor: null } });
    expect(result.page[0]).toMatchObject({ name: "Synthetic Student", state: "ready", personalAppliedCents: 40, fundraisingAppliedCents: 45, dueCents: 15, fundraisingAvailableCents: 15 });
    const changes = await f.coach.query(feed, { paginationOpts: { numItems: 20, cursor: null } });
    expect(changes.page.filter((item: { kind: string }) => item.kind === "release")).toHaveLength(1);
    expect(changes.page.find((item: { kind: string }) => item.kind === "fundraisingCredit")).toMatchObject({ studentName: "Synthetic Student", meaning: "receipt", beforeCents: null, afterCents: 60 });
  });
  it("finishes a pre-migration allocator as v3 but refuses the same v3 account for a new v4 job", async () => {
    const f = await fixture();
    const jobId = await f.t.run(async ctx => {
      const actor = await ctx.db.get(f.ids.actor); if (!actor) throw new Error("Missing actor");
      await addCharge(ctx, actor, f.ids.student, "Fee", 20, 0, "legacy-fee");
      const account = await financialAccount(ctx, f.ids.student); if (!account) throw new Error("Missing account");
      const source = await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "payment", amountCents: 20, previousCents: 0, newCents: 20, idempotencyKey: "legacy-source", recordedBy: actor._id, recordedAt: Date.now() }); await recordProjectedEntry(ctx, source, account);
      const job = await ctx.db.insert("financialAllocationJobs", { requiredFinancialProjectionVersion: 4, studentId: f.ids.student, actorId: actor._id, generation: account.generation, state: "running", step: 0, processed: 0, chargeCursor: null, idempotencyPrefix: "legacy", updatedAt: Date.now() });
      await ctx.db.patch(account._id, { state: "allocating", allocationJobId: job, allocationSourceVersion: undefined, personalAppliedCents: undefined, fundraisingAppliedCents: undefined }); return job;
    });
    await expect(f.t.mutation(allocation, { jobId, step: 0 })).rejects.toThrow("Rebuild financial records");
    await f.t.run(ctx => ctx.db.patch(jobId, { requiredFinancialProjectionVersion: undefined }));
    await f.t.mutation(allocation, { jobId, step: 0 });
    expect(await f.t.run(ctx => ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique())).toMatchObject({ version: 3, paidCents: 20 });
    const page = await f.coach.query(rows, { paginationOpts: { numItems: 20, cursor: null } });
    expect(page.page[0]).toMatchObject({ state: "updating", personalAppliedCents: null, fundraisingAppliedCents: null, canRecord: false, canRebuild: true });
  });
  it("rejects family access and preserves native small row budgets", async () => {
    const f = await fixture();
    await expect(f.t.query(rows, { paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow();
    const page = await f.coach.query(rows, { paginationOpts: { numItems: 20, maximumRowsRead: 1, cursor: null } });
    expect(page.page.length).toBeLessThanOrEqual(1);
    expect(page.page[0]).toMatchObject({ state: "uninitialized", chargedCents: null, canRecord: false });
    await expect(f.coach.query(rows, { paginationOpts: { numItems: 21, cursor: null } })).rejects.toThrow("list couldn't load");
  });
  it("backfills more than 500 receipt facts in bounded replay-safe pages without inventing historical balances", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 510; i++) await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "payment", amountCents: 1, previousCents: i, newCents: i + 1, idempotencyKey: `old:${i}`, recordedBy: f.ids.actor, recordedAt: i });
    });
    const start = makeFunctionReference<"mutation">("financeChangeBackfill:start"); const process = makeFunctionReference<"mutation">("financeChangeBackfill:processPage");
    await f.coach.mutation(start, {});
    for (let i = 0; i < 40; i++) {
      const job = await f.t.run(ctx => ctx.db.query("financeChangeBackfills").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).unique());
      if (!job || job.state === "complete") break;
      const args = { id: job._id, phase: job.phase, cursor: job.cursor };
      await f.t.mutation(process, args); await f.t.mutation(process, args);
    }
    expect(await f.t.run(ctx => ctx.db.query("financeChangeEvents").collect())).toHaveLength(510);
    const page = await f.coach.query(feed, { paginationOpts: { numItems: 20, cursor: null } });
    expect(page.coverage.state).toBe("ready"); expect(page.page[0]).toMatchObject({ historical: true, meaning: "receipt", beforeCents: null, afterCents: 1 });
  });
  it("returns unavailable team totals when individually safe student obligations exceed the exact total range", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const actor = await ctx.db.get(f.ids.actor); const student = await ctx.db.get(f.ids.student); if (!actor || !student) throw new Error("Missing fixture");
      await addCharge(ctx, actor, student._id, "High obligation", Number.MAX_SAFE_INTEGER, 0, "max-charge");
      const { _id, _creationTime, ...fields } = student; void _id; void _creationTime;
      const other = await ctx.db.insert("students", { ...fields, legalName: "Other" });
      await addCharge(ctx, actor, other, "One cent", 1, 0, "one-cent");
      await ctx.db.insert("financeSummaryBackfills", { seasonId: f.ids.season, actorId: actor._id, state: "complete", cursor: null, processed: 2, updatedAt: Date.now() });
    });
    const result = await f.coach.query(makeFunctionReference<"query">("dashboardReports:team"), {});
    expect(result).toMatchObject({ state: "failed", finance: null }); expect(result.message).toContain("exact-cent range");
  });  it("preserves and completes an already-partially-posted legacy payout without falsely upgrading its summary", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const account = await ensureFinancialAccount(ctx, f.ids.student);
      for (let i = 0; i < 25; i++) {
        const id = await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "payment", amountCents: 1, previousCents: i, newCents: i + 1, idempotencyKey: `payout-source:${i}`, recordedBy: f.ids.actor, recordedAt: i });
        await recordProjectedEntry(ctx, id, account);
      }
      await refreshStudentFinance(ctx, f.ids.student);
    });
    await f.coach.mutation(makeFunctionReference<"mutation">("financeOperations:recordPayout"), { studentId: f.ids.student, amountCents: 25, method: "cash", reference: "Recorded cash", occurredAt: 0, reason: "Legacy actual refund", idempotencyKey: "legacy-payout" });
    const job = await f.t.run(async ctx => {
      const account = await financialAccount(ctx, f.ids.student); if (!account?.operationJobId) throw new Error("Missing partial payout");
      const job = await ctx.db.get(account.operationJobId); if (!job) throw new Error("Missing job");
      expect(job.committedCents).toBe(20);
      // Model the persisted pre-migration partial receipt/lock; no public API can remove this marker.
      await ctx.db.patch(job._id, { requiredFinancialProjectionVersion: undefined });
      await ctx.db.patch(account._id, { allocationSourceVersion: undefined, personalAppliedCents: undefined, fundraisingAppliedCents: undefined });
      return job;
    });
    const worker = makeFunctionReference<"mutation">("financialOperationsWorker:processPage");
    await f.t.mutation(worker, { jobId: job._id, step: job.step });
    await f.t.mutation(worker, { jobId: job._id, step: job.step });
    expect(await f.t.run(ctx => ctx.db.get(job._id))).toMatchObject({ state: "complete", committedCents: 25 });
    expect(await f.t.run(ctx => ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique())).toMatchObject({ version: 3, personalAvailableCents: 0 });
await f.t.run(async ctx => { const evidence = await ctx.db.query("financeChangeEvents").collect(); for (const row of evidence) if (row.sourceType === "financeOperation") await ctx.db.delete(row._id); });
    await f.coach.mutation(makeFunctionReference<"mutation">("financeChangeBackfill:start"), {});
    for (let i = 0; i < 20; i++) { const job = await f.t.run(ctx => ctx.db.query("financeChangeBackfills").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).unique()); if (!job || job.state === "complete") break; await f.t.mutation(makeFunctionReference<"mutation">("financeChangeBackfill:processPage"), { id: job._id, phase: job.phase, cursor: job.cursor }); }
    const events = await f.t.run(ctx => ctx.db.query("financeChangeEvents").collect());
    expect(events.filter(row => row.sourceType === "financeOperation")).toHaveLength(1);
    expect(events.find(row => row.sourceType === "financeOperation")).toMatchObject({ state: "committed", afterCents: 25, sourceKind: "payment" });
  });  it("allows read-only Travel Leads while denying authenticated families, ordinary Mentors and history preparation", async () => {
    const f = await fixture();
    for (const [role, travelLead, allowed] of [["parent", false, false], ["mentor", false, false], ["mentor", true, true]] as const) {
      const auth = await f.t.run(async ctx => {
        const auth = await ctx.db.insert("users", { email: `${role}-${travelLead}@example.invalid` });
        await ctx.db.insert("appUsers", { authUserId: auth, name: "Viewer", email: `${role}-${travelLead}@example.invalid`, role, travelLead, financialEdit: false, active: true }); return auth;
      });
      const user = f.t.withIdentity({ subject: `${auth}|session` });
      if (!allowed) { await expect(user.query(rows, { paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow("can see team money"); await expect(user.query(feed, { paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow("can see team money"); }
      else {
        const result = await user.query(rows, { paginationOpts: { numItems: 20, cursor: null } }); expect(result.page[0]).toMatchObject({ canRecord: false, canRebuild: false });
        expect(await user.query(makeFunctionReference<"query">("financeAdmin:status"), {})).toMatchObject({ canPrepareHistory: false });
      }
      await expect(user.mutation(makeFunctionReference<"mutation">("financeChangeBackfill:start"), {})).rejects.toThrow();
    }
  });
  it("caps native expanded pages before hydration and retains split metadata and caller budgets", async () => {
    const f = await fixture();
    await f.t.run(async ctx => { const original = await ctx.db.get(f.ids.student); if (!original) throw new Error("Fixture"); const { _id, _creationTime, ...student } = original; void _id; void _creationTime; for (let i = 0; i < 44; i++) await ctx.db.insert("students", { ...student, legalName: `Row ${i}` }); });
    const first = await f.coach.query(rows, { paginationOpts: { numItems: 20, cursor: null } });
    const second = await f.coach.query(rows, { paginationOpts: { numItems: 20, cursor: first.continueCursor } });
    await expect(f.coach.query(rows, { paginationOpts: { numItems: 1, cursor: null, endCursor: second.continueCursor, maximumRowsRead: 10000 } })).rejects.toThrow("list couldn't load");
    await expect(f.coach.query(rows, { paginationOpts: { numItems: 20, cursor: null, maximumRowsRead: Number.NaN } })).rejects.toThrow("list couldn't load");
    const small = await f.coach.query(rows, { paginationOpts: { numItems: 20, maximumRowsRead: 2, cursor: null } });
    expect(small.page.length).toBeLessThanOrEqual(2); expect(small).toHaveProperty("pageStatus"); expect(small).toHaveProperty("splitCursor");
  });
  it("continues persisted legacy fee propagation but prevents new mapping and priority jobs from bypassing v4", async () => {
    const f = await fixture();
    const ids = await f.t.run(async ctx => {
      const actor = await ctx.db.get(f.ids.actor); if (!actor) throw new Error("Actor");
      const charge = await addCharge(ctx, actor, f.ids.student, "Priority fee", 20, 0, "legacy-priority-fee");
      const current = await ctx.db.get(charge); const account = await financialAccount(ctx, f.ids.student); if (!current?.feeDefinitionId || !account) throw new Error("Fixture");
      const first = await ctx.db.get(current.feeDefinitionId); if (!first) throw new Error("Fee");
      await ctx.db.patch(first._id, { priority: 2, revision: 1 }); await ctx.db.patch(charge, { priority: 1 });
      const second = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Second", defaultAmountCents: 0, priority: 1, revision: 1, state: "active", createdBy: actor._id, createdAt: 0, updatedAt: 0 });
      const priority = await ctx.db.insert("feePriorityJobs", { requiredFinancialProjectionVersion: 4, seasonId: f.ids.season, originalActorId: actor._id, actorId: actor._id, idempotencyKey: "legacy-priority", operationHash: "fixture", reason: "Legacy order", state: "applying", step: 0, cursor: null, phase: "firstFee", firstFeeId: first._id, secondFeeId: second, firstPriority: 1, secondPriority: 2, firstRevision: 0, secondRevision: 0, processed: 0, createdAt: 0, updatedAt: 0 });
      const control = await ctx.db.query("seasonFinanceControls").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).unique(); const controlId = control?._id ?? await ctx.db.insert("seasonFinanceControls", { seasonId: f.ids.season, revision: 0, state: "ready", mappingInitialized: true, orderReady: true, unmappedCount: 0, updatedAt: 0 });
      await ctx.db.patch(controlId, { state: "applying", priorityJobId: priority }); await ctx.db.patch(account._id, { allocationSourceVersion: undefined, personalAppliedCents: undefined, fundraisingAppliedCents: undefined });
      return { priority, control: controlId, charge, first: first._id };
    });
    const priorityPage = makeFunctionReference<"mutation">("feePriorityWorker:processPage");
    await expect(f.t.mutation(priorityPage, { jobId: ids.priority, step: 0 })).rejects.toThrow("Rebuild financial");
    await f.t.run(ctx => ctx.db.patch(ids.priority, { requiredFinancialProjectionVersion: undefined }));
    for (let i = 0; i < 10; i++) { const job = await f.t.run(ctx => ctx.db.get(ids.priority)); if (!job || job.state === "complete") break; await f.t.mutation(priorityPage, { jobId: job._id, step: job.step }); }
    expect(await f.t.run(ctx => ctx.db.get(ids.priority))).toMatchObject({ state: "complete" });
    expect(await f.t.run(ctx => ctx.db.query("financeChangeEvents").withIndex("by_sourceKey", q => q.eq("sourceKey", `feePriorityJob:${ids.priority}:first`)).unique())).toMatchObject({ meaning: "priority", beforeCents: 1, afterCents: 2 });
    const mapping = await f.t.run(async ctx => {
      await ctx.db.patch(ids.charge, { priority: 1 });
      const id = await ctx.db.insert("feeMappingJobs", { requiredFinancialProjectionVersion: 4, seasonId: f.ids.season, originalActorId: f.ids.actor, actorId: f.ids.actor, mode: "prove", state: "applying", phase: "propagate", step: 0, cursor: null, nextRank: 3, processed: 0, mapped: 1, unmapped: 0, idempotencyKey: "legacy-mapping", operationHash: "fixture", reason: "Legacy propagation", createdAt: 0, updatedAt: 0 });
      await ctx.db.patch(ids.control, { state: "applying", mappingJobId: id, priorityJobId: undefined }); return id;
    });
    const mappingPage = makeFunctionReference<"mutation">("feeMappingWorker:processPage");
    await expect(f.t.mutation(mappingPage, { jobId: mapping, step: 0 })).rejects.toThrow("Rebuild financial");
    await f.t.run(ctx => ctx.db.patch(mapping, { requiredFinancialProjectionVersion: undefined }));
    for (let i = 0; i < 10; i++) { const job = await f.t.run(ctx => ctx.db.get(mapping)); if (!job || job.state === "complete") break; await f.t.mutation(mappingPage, { jobId: job._id, step: job.step }); }
    expect(await f.t.run(ctx => ctx.db.get(mapping))).toMatchObject({ state: "complete" });
    await f.t.run(async ctx => { const evidence = await ctx.db.query("financeChangeEvents").collect(); for (const row of evidence) if (row.sourceType === "feePriorityJob") await ctx.db.delete(row._id); });
    await f.coach.mutation(makeFunctionReference<"mutation">("financeChangeBackfill:start"), {});
    for (let i = 0; i < 20; i++) { const job = await f.t.run(ctx => ctx.db.query("financeChangeBackfills").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).unique()); if (!job || job.state === "complete") break; await f.t.mutation(makeFunctionReference<"mutation">("financeChangeBackfill:processPage"), { id: job._id, phase: job.phase, cursor: job.cursor }); }
    const restored = await f.t.run(ctx => ctx.db.query("financeChangeEvents").withIndex("by_sourceKey", q => q.eq("sourceKey", `feePriorityJob:${ids.priority}:first`)).unique());
    expect(restored).toMatchObject({ historical: true, feeDefinitionId: ids.first, meaning: "priority", beforeCents: 1, afterCents: 2 });
    expect(await f.t.run(ctx => ctx.db.get(ids.charge))).toMatchObject({ priority: 2, appliedCents: 0 });
    expect(await f.t.run(ctx => ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique())).toMatchObject({ version: 3 });
  });});
