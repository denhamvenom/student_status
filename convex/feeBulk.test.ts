/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { createTest } from "../testUtils";
import schema from "./schema";
import { createFinancialAccount, financialAccount } from "./lib/financialSources";
const modules = import.meta.glob("./**/*.ts");
const prepare = makeFunctionReference<"mutation">("feeDefinitions:prepareBulk");
const commit = makeFunctionReference<"mutation">("feeDefinitions:commitBulk");
const process = makeFunctionReference<"mutation">("feeBulkWorker:processPage");

async function fixture(count = 35) {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "ready", mappingInitialized: true, orderReady: true, unmappedCount: 0, updatedAt: 0 });
    const students = [];
    for (let i = 0; i < count; i++) {
      const id = await ctx.db.insert("students", { seasonId: season, legalName: `Synthetic ${i}`, preferredName: `Synthetic ${i}`, email: `${i}@example.invalid`, subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      await createFinancialAccount(ctx, id, "ready"); students.push(id);
    }
    return { auth, actor, season, control, students };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}

async function finish(f: Awaited<ReturnType<typeof fixture>>, jobId: Id<"feeBulkJobs">) {
  for (let i = 0; i < 2000; i++) {
    const job = await f.t.run(ctx => ctx.db.get(jobId));
    if (!job || ["prepared", "held", "complete", "failed", "cancelled"].includes(job.state)) return job;
    await f.t.mutation(process, { jobId, step: job.step });
    await f.t.mutation(process, { jobId, step: job.step });
  }
  throw new Error("Prepared fee worker did not finish its bounded steps.");
}

async function confirm(f: Awaited<ReturnType<typeof fixture>>, jobId: Id<"feeBulkJobs">) {
  const job = await f.t.run(ctx => ctx.db.get(jobId)); const control = await f.t.run(ctx => ctx.db.get(f.ids.control));
  return f.coach.mutation(commit, { jobId, expectedScopeHash: job!.snapshotHash, expectedOrderRevision: control!.revision, expectedDefinitionRevision: job!.expectedDefinitionRevision, reason: "Coach confirmed exact prepared scope" });
}

describe("durable prepared custom fees", () => {
  it("holds an unrepresentable prior-cancellation target without money or a stranded season lock", async () => {
    const f = await fixture(1);
    const original = await f.t.run(async ctx => {
      const fee = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Near maximum historical fee", defaultAmountCents: Number.MAX_SAFE_INTEGER - 1, priority: 1, revision: 0, state: "active", createdBy: f.ids.actor, createdAt: 0, updatedAt: 0 });
      const charge = await ctx.db.insert("charges", { studentId: f.ids.students[0], feeDefinitionId: fee, label: "Historical fee", amountCents: Number.MAX_SAFE_INTEGER, cancelledCents: 1, appliedCents: 0, priority: 1, createdBy: f.ids.actor, createdAt: 0 });
      const account = await financialAccount(ctx, f.ids.students[0]); await ctx.db.patch(account!._id, { chargedCents: Number.MAX_SAFE_INTEGER - 1, chargeCount: 1 }); return { fee, charge };
    });
    const jobId = await f.coach.mutation(prepare, { kind: "edit", feeDefinitionId: original.fee, targetAmountCents: Number.MAX_SAFE_INTEGER, scope: "existingCharges", reason: "Review unsupported immutable target", idempotencyKey: "max-cancelled-target" }) as Id<"feeBulkJobs">;
    expect(await finish(f, jobId)).toMatchObject({ state: "prepared", held: 1 }); await confirm(f, jobId);
    expect(await finish(f, jobId)).toMatchObject({ state: "held", committed: 0 });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.control)))?.state).toBe("ready");
    expect(await f.t.run(ctx => ctx.db.get(original.charge))).toMatchObject({ amountCents: Number.MAX_SAFE_INTEGER, cancelledCents: 1, appliedCents: 0 });
    expect(await f.t.run(ctx => ctx.db.query("financialOperationJobs").collect())).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.query("ledgerEntries").collect())).toHaveLength(0);
  });

  it("keeps an exact cent when a high-value correction's intermediate addition would exceed the integer range, including rebuild", async () => {
    const f = await fixture(1);
    const fee = await f.t.run(async ctx => {
      const id = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Maximum fee", defaultAmountCents: Number.MAX_SAFE_INTEGER, priority: 1, revision: 0, state: "active", createdBy: f.ids.actor, createdAt: 0, updatedAt: 0 });
      const charge = await ctx.db.insert("charges", { studentId: f.ids.students[0], feeDefinitionId: id, label: "Maximum fee", amountCents: Number.MAX_SAFE_INTEGER, appliedCents: Number.MAX_SAFE_INTEGER, priority: 1, createdBy: f.ids.actor, createdAt: 0 });
      const source = await ctx.db.insert("ledgerEntries", { studentId: f.ids.students[0], kind: "payment", amountCents: Number.MAX_SAFE_INTEGER, previousCents: 0, newCents: Number.MAX_SAFE_INTEGER, recordedBy: f.ids.actor, recordedAt: 0, idempotencyKey: "max-source" });
      await ctx.db.insert("ledgerEntries", { studentId: f.ids.students[0], chargeId: charge, kind: "allocation", sourceEntryId: source, sourceKind: "payment", amountCents: Number.MAX_SAFE_INTEGER, previousCents: 0, newCents: Number.MAX_SAFE_INTEGER, recordedBy: f.ids.actor, recordedAt: 1, idempotencyKey: "max-allocation" });
      const account = await financialAccount(ctx, f.ids.students[0]); await ctx.db.patch(account!._id, { chargedCents: Number.MAX_SAFE_INTEGER, chargeCount: 1 }); return id;
    });
    const initial = await f.coach.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: f.ids.students[0] }) as Id<"financialAccounts">;
    for (let i = 0; i < 20; i++) { if ((await f.t.run(ctx => ctx.db.get(initial)))?.state === "ready") break; await f.t.mutation(makeFunctionReference<"mutation">("financialSources:run"), { accountId: initial }); }
    const jobId = await f.coach.mutation(prepare, { kind: "edit", feeDefinitionId: fee, targetAmountCents: Number.MAX_SAFE_INTEGER - 1, scope: "existingCharges", reason: "Coach reviewed one exact cent reduction", idempotencyKey: "exact-high-cent-change" }) as Id<"feeBulkJobs">;
    await finish(f, jobId); await confirm(f, jobId); expect(await finish(f, jobId)).toMatchObject({ state: "complete", committed: 1 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]))).toMatchObject({ chargedCents: Number.MAX_SAFE_INTEGER - 1, paidCents: Number.MAX_SAFE_INTEGER - 1, personalAvailableCents: 1 });
    const accountId = await f.coach.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: f.ids.students[0] }) as Id<"financialAccounts">;
    for (let i = 0; i < 20; i++) { if ((await f.t.run(ctx => ctx.db.get(accountId)))?.state === "ready") break; await f.t.mutation(makeFunctionReference<"mutation">("financialSources:run"), { accountId }); }
    expect(await f.t.run(ctx => ctx.db.get(accountId))).toMatchObject({ state: "ready", chargedCents: Number.MAX_SAFE_INTEGER - 1, paidCents: Number.MAX_SAFE_INTEGER - 1, personalAvailableCents: 1 });
  });

  it("does not rerank prepared or held scopes, and rejects subset cancellation before writes", async () => {
    const f = await fixture(1);
    const original = await f.t.run(async ctx => {
      const fee = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Existing fee", defaultAmountCents: 10, priority: 1, revision: 0, state: "active", createdBy: f.ids.actor, createdAt: 0, updatedAt: 0 });
      const charge = await ctx.db.insert("charges", { studentId: f.ids.students[0], feeDefinitionId: fee, label: "Existing fee", amountCents: 10, appliedCents: 0, priority: 1, createdBy: f.ids.actor, createdAt: 0 });
      const account = await financialAccount(ctx, f.ids.students[0]); await ctx.db.patch(account!._id, { chargedCents: 10, chargeCount: 1 });
      return { fee, charge };
    });
    const jobId = await f.coach.mutation(prepare, { kind: "edit", feeDefinitionId: original.fee, targetAmountCents: 20, scope: "existingCharges", reason: "Prepare immutable existing charge review", idempotencyKey: "prepared-edit-fence" }) as Id<"feeBulkJobs">;
    await finish(f, jobId);
    const proof = () => f.coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:prepareMapping"), { reason: "Attempt to reset the season mapping", idempotencyKey: "must-not-remap-held" });
    await expect(proof()).rejects.toThrow("prepared or held shared fee scope");
    const control = await f.t.run(ctx => ctx.db.get(f.ids.control));
    await expect(f.coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:mapCharges"), { chargeIds: [{ chargeId: original.charge, expectedChargeRevision: 0 }], feeDefinitionId: original.fee, expectedOrderRevision: control!.revision, reason: "Attempt to remap prepared charge", idempotencyKey: "must-not-map-prepared" })).rejects.toThrow("prepared or held shared fee scope");
    for (const scope of ["allActive", "selected", "confirmedEvent"]) await expect(f.coach.mutation(prepare, { kind: "cancel", feeDefinitionId: original.fee, targetAmountCents: 0, scope, ...(scope === "selected" ? { studentIds: f.ids.students } : {}), reason: "Invalid subset cancellation request", idempotencyKey: `invalid-cancel-${scope}` })).rejects.toThrow("exact fee amount");
    expect(await f.t.run(ctx => ctx.db.query("feeBulkJobs").collect())).toHaveLength(1);
    expect(await f.t.run(ctx => ctx.db.get(original.fee))).toMatchObject({ revision: 0 });
    await f.coach.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: f.ids.students[0], kind: "payment", amountCents: 1, reason: "Changed balance after prepared scope", idempotencyKey: "changed-fence-payment" });
    await confirm(f, jobId); expect(await finish(f, jobId)).toMatchObject({ state: "held", committed: 0 });
    await expect(proof()).rejects.toThrow("prepared or held shared fee scope");
    expect(await f.t.run(ctx => ctx.db.get(original.fee))).toMatchObject({ revision: 0 });
  });

  it("a failed verify stage with refreshed held rows returns to applying rather than completing an unapplied target", async () => {
    const f = await fixture(1);
    const jobId = await f.coach.mutation(prepare, { kind: "create", label: "Verify retry target", targetAmountCents: 100, scope: "selected", studentIds: f.ids.students, reason: "Prepare original single member target", idempotencyKey: "verify-retry-prepared" }) as Id<"feeBulkJobs">;
    await finish(f, jobId);
    await f.coach.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: f.ids.students[0], kind: "payment", amountCents: 50, reason: "Financial evidence changed after preparation", idempotencyKey: "verify-retry-payment" });
    await confirm(f, jobId);
    for (let i = 0; i < 5; i++) {
      const job = await f.t.run(ctx => ctx.db.get(jobId)); if (job?.phase === "verify") break;
      await f.t.mutation(process, { jobId, step: job!.step });
    }
    await f.t.run(ctx => ctx.db.patch(f.ids.actor, { active: false }));
    await f.t.mutation(makeFunctionReference<"mutation">("feeBulkWorker:run"), { jobId });
    expect(await f.t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "failed", phase: "verify", held: 1, committed: 0 });
    await f.t.run(ctx => ctx.db.patch(f.ids.actor, { active: true }));
    const row = await f.t.run(ctx => ctx.db.query("feeBulkRows").withIndex("by_jobId", q => q.eq("jobId", jobId)).first()); const account = await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]));
    await f.coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:retryBulk"), { jobId, rows: [{ rowId: row!._id, expectedFinancialRevision: account!.revision, expectedGeneration: account!.generation, expectedChargeRevision: null }], reason: "Coach refreshed the held original row" });
    expect(await finish(f, jobId)).toMatchObject({ state: "complete", committed: 1, held: 0 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]))).toMatchObject({ chargedCents: 100, paidCents: 50 });
  });

  it("snapshots and cancels more than 500 historical linked charges using bounded work and causal student fences", async () => {
    const f = await fixture(1);
    const fee = await f.t.run(async ctx => {
      const id = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Historical shared fee", defaultAmountCents: 1, priority: 1, revision: 0, state: "active", createdBy: f.ids.actor, createdAt: 0, updatedAt: 0 });
      const account = await financialAccount(ctx, f.ids.students[0]); await ctx.db.patch(account!._id, { chargedCents: 501, chargeCount: 501 });
      for (let i = 0; i < 501; i++) await ctx.db.insert("charges", { studentId: f.ids.students[0], feeDefinitionId: id, label: "Historical fee evidence", amountCents: 1, appliedCents: 0, priority: 1, createdBy: f.ids.actor, createdAt: i });
      return id;
    });
    const jobId = await f.coach.mutation(prepare, { kind: "cancel", feeDefinitionId: fee, targetAmountCents: 0, scope: "existingCharges", reason: "Coach reviewed entire historical linked scope", idempotencyKey: "cancel-full-501-history" }) as Id<"feeBulkJobs">;
    expect(await finish(f, jobId)).toMatchObject({ state: "prepared", snapshotCount: 501, committed: 0 });
    expect(await f.t.run(ctx => ctx.db.query("ledgerEntries").collect())).toHaveLength(0);
    await confirm(f, jobId);
    expect(await finish(f, jobId)).toMatchObject({ state: "complete", snapshotCount: 501, committed: 501, held: 0 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]))).toMatchObject({ chargedCents: 0, paidCents: 0, personalAvailableCents: 0, fundraisingAvailableCents: 0 });
    expect(await f.t.run(ctx => ctx.db.query("chargeRevisions").collect())).toHaveLength(501);
  }, 30000);

  it("full cancellation explicitly accounts for prior never-posted held rows and preserves their original evidence", async () => {
    const f = await fixture(2);
    await f.t.run(async ctx => { const account = await financialAccount(ctx, f.ids.students[1]); await ctx.db.patch(account!._id, { state: "uninitialized" }); });
    const originalId = await f.coach.mutation(prepare, { kind: "create", label: "Partially posted fee", targetAmountCents: 100, scope: "allActive", reason: "Prepare both original members", idempotencyKey: "original-partial-fee" }) as Id<"feeBulkJobs">;
    await finish(f, originalId); await confirm(f, originalId); const original = await finish(f, originalId);
    expect(original).toMatchObject({ state: "held", committed: 1, held: 1 });
    const input = { kind: "cancel", feeDefinitionId: original!.feeDefinitionId, targetAmountCents: 0, scope: "existingCharges", reason: "Coach reviewed full cancellation and unposted row", idempotencyKey: "full-cancel-held-scope" };
    await expect(f.coach.mutation(prepare, input)).rejects.toThrow("existing prepared operation");
    const cancelledDraft = await f.coach.mutation(prepare, { ...input, supersedeHeldJobId: originalId, expectedHeldRows: 1 }) as Id<"feeBulkJobs">;
    await finish(f, cancelledDraft);
    expect(await f.coach.query(makeFunctionReference<"query">("feeDefinitions:priorHeldRows"), { jobId: cancelledDraft, paginationOpts: { numItems: 20, cursor: null } })).toMatchObject({ page: [{ state: "held", targetAmountCents: 100 }] });
    await f.coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:cancelPrepared"), { jobId: cancelledDraft, reason: "Coach cancelled this zero-money prepared review" });
    expect(await f.t.run(ctx => ctx.db.get(original!.feeDefinitionId))).toMatchObject({ latestJobId: originalId, revision: original!.expectedDefinitionRevision });
    const cancellation = await f.coach.mutation(prepare, { ...input, idempotencyKey: "confirmed-full-cancel", supersedeHeldJobId: originalId, expectedHeldRows: 1 }) as Id<"feeBulkJobs">;
    const prepared = await finish(f, cancellation);
    expect(prepared).toMatchObject({ snapshotCount: 1, priorHeldRows: 1, supersededRows: 0 });
    expect(await f.t.run(ctx => ctx.db.get(originalId))).toMatchObject({ state: "held" });
    await confirm(f, cancellation); expect(await finish(f, cancellation)).toMatchObject({ state: "complete", committed: 1, supersededRows: 1 });
    expect(await f.t.run(ctx => ctx.db.get(originalId))).toMatchObject({ state: "superseded", supersededByJobId: cancellation, targetAmountCents: 100, snapshotHash: original!.snapshotHash, committed: 1 });
    const prior = await f.t.run(ctx => ctx.db.query("feeBulkRows").withIndex("by_jobId_and_studentId", q => q.eq("jobId", originalId).eq("studentId", f.ids.students[1])).unique());
    expect(prior).toMatchObject({ state: "superseded", targetAmountCents: 100 }); expect(prior?.chargeId).toBeUndefined();
    expect(await f.t.run(ctx => ctx.db.get(original!.feeDefinitionId))).toMatchObject({ state: "cancelled", defaultAmountCents: 0 });
  });

  it("retains old obligation through bounded mixed-source release and resumes a failed child without duplicated money", async () => {
    const f = await fixture(1);
    const evidence = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "alternate@example.invalid" });
      const alternate = await ctx.db.insert("appUsers", { authUserId: auth, email: "alternate@example.invalid", name: "Alternate", role: "coach", active: true, travelLead: false, financialEdit: false });
      const fee = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Original fee", defaultAmountCents: 100, priority: 1, revision: 0, state: "active", createdBy: f.ids.actor, createdAt: 0, updatedAt: 0 });
      const charge = await ctx.db.insert("charges", { studentId: f.ids.students[0], feeDefinitionId: fee, label: "Original fee", amountCents: 100, appliedCents: 25, priority: 1, createdBy: f.ids.actor, createdAt: 0 });
      for (let i = 0; i < 25; i++) {
        const kind = i % 2 ? "fundraiser" as const : "payment" as const;
        const source = await ctx.db.insert("ledgerEntries", { studentId: f.ids.students[0], kind, amountCents: 1, previousCents: 0, newCents: 1, recordedBy: f.ids.actor, recordedAt: i, idempotencyKey: `source:${i}` });
        await ctx.db.insert("ledgerEntries", { studentId: f.ids.students[0], chargeId: charge, kind: "allocation", sourceEntryId: source, sourceKind: kind, amountCents: 1, previousCents: i, newCents: i + 1, recordedBy: f.ids.actor, recordedAt: i + 1, idempotencyKey: `allocation:${i}` });
      }
      return { auth, alternate, fee, charge };
    });
    const rebuildId = await f.coach.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: f.ids.students[0] }) as Id<"financialAccounts">;
    for (let i = 0; i < 30; i++) {
      const account = await f.t.run(ctx => ctx.db.get(rebuildId)); if (account?.state === "ready") break;
      await f.t.mutation(makeFunctionReference<"mutation">("financialSources:run"), { accountId: rebuildId });
    }
    const jobId = await f.coach.mutation(prepare, { kind: "cancel", feeDefinitionId: evidence.fee, targetAmountCents: 0, scope: "existingCharges", reason: "Prepare cancellation of original fee", idempotencyKey: "mixed-cancel-fee" }) as Id<"feeBulkJobs">;
    await finish(f, jobId); await confirm(f, jobId);
    let job = await f.t.run(ctx => ctx.db.get(jobId)); await f.t.mutation(process, { jobId, step: job!.step });
    job = await f.t.run(ctx => ctx.db.get(jobId)); await f.t.mutation(process, { jobId, step: job!.step });
    const row = await f.t.run(ctx => ctx.db.query("feeBulkRows").withIndex("by_jobId", q => q.eq("jobId", jobId)).first());
    expect(await f.t.run(ctx => ctx.db.get(evidence.charge))).toMatchObject({ amountCents: 100, appliedCents: 5 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]))).toMatchObject({ state: "posting", chargedCents: 100, paidCents: 5 });
    expect(await f.t.run(ctx => ctx.db.get(row!.correctionJobId!))).toMatchObject({ state: "running", committedCents: 20, releaseRequiredCents: 25 });
    await f.t.run(ctx => ctx.db.patch(f.ids.actor, { active: false }));
    await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:run"), { jobId: row!.correctionJobId });
    await f.t.mutation(makeFunctionReference<"mutation">("feeBulkWorker:run"), { jobId });
    const alternate = f.t.withIdentity({ subject: `${evidence.auth}|session` });
    await expect(alternate.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: f.ids.students[0] })).rejects.toThrow("existing financial job");
    await expect(alternate.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: f.ids.students[0], kind: "payment", amountCents: 1, reason: "Blocked during partial release", idempotencyKey: "blocked-release-key" })).rejects.toThrow("Season fees");
    await alternate.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:retry"), { jobId: row!.correctionJobId, reason: "Coach resumed exact partial cancellation" });
    await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:run"), { jobId: row!.correctionJobId });
    await alternate.mutation(makeFunctionReference<"mutation">("feeDefinitions:retryBulk"), { jobId, rows: [], reason: "Coach resumed completed child evidence" });
    expect(await finish(f, jobId)).toMatchObject({ state: "complete", committed: 1, originalActorId: f.ids.actor, actorId: evidence.alternate });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]))).toMatchObject({ state: "ready", chargedCents: 0, paidCents: 0, personalAvailableCents: 13, fundraisingAvailableCents: 12 });
    expect((await f.t.run(ctx => ctx.db.query("ledgerEntries").collect())).filter(entry => entry.kind === "deallocation").reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(25);
  });

  it("prepares zero money, freezes members across pages, holds stale rows and retries only reviewed original targets", async () => {
    const f = await fixture();
    const jobId = await f.coach.mutation(prepare, { kind: "create", label: "Prepared custom fee", targetAmountCents: 100, scope: "allActive", reason: "Prepare current active members", idempotencyKey: "custom-all-active" }) as Id<"feeBulkJobs">;
    const prepared = await finish(f, jobId);
    expect(prepared).toMatchObject({ state: "prepared", snapshotCount: 35, committed: 0, processed: 0, snapshotComplete: true });
    expect(await f.t.run(ctx => ctx.db.query("charges").collect())).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.query("ledgerEntries").collect())).toHaveLength(0);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.control)))?.state).toBe("ready");
    const newcomer = await f.t.run(async ctx => {
      const id = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Later member", preferredName: "Later member", email: "later@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      await createFinancialAccount(ctx, id, "ready"); return id;
    });
    await f.coach.mutation(makeFunctionReference<"mutation">("finance:recordFunds"), { studentId: f.ids.students[0], kind: "payment", amountCents: 50, reason: "Payment changed after preview", idempotencyKey: "payment-after-prepared" });
    await confirm(f, jobId); const held = await finish(f, jobId);
    expect(held).toMatchObject({ state: "held", committed: 34, held: 1, processed: 35, snapshotCount: 35, snapshotHash: prepared!.snapshotHash });
    const charges = await f.t.run(ctx => ctx.db.query("charges").collect()); expect(charges).toHaveLength(34);
    expect(charges.some(charge => charge.studentId === newcomer)).toBe(false);
    const row = await f.t.run(ctx => ctx.db.query("feeBulkRows").withIndex("by_jobId_and_studentId", q => q.eq("jobId", jobId).eq("studentId", f.ids.students[0])).unique());
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]));
    expect(row).toMatchObject({ state: "held", targetAmountCents: 100, originalExpectedFinancialRevision: 0 });
    await f.coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:retryBulk"), { jobId, rows: [{ rowId: row!._id, expectedFinancialRevision: account!.revision, expectedGeneration: account!.generation, expectedChargeRevision: null }], reason: "Coach reviewed changed payment evidence" });
    expect(await finish(f, jobId)).toMatchObject({ state: "complete", committed: 35, held: 0, snapshotHash: prepared!.snapshotHash });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.students[0]))).toMatchObject({ chargedCents: 100, paidCents: 50, personalAvailableCents: 0 });
    expect((await f.t.run(ctx => ctx.db.get(row!._id)))?.originalExpectedFinancialRevision).toBe(0);
  });

  it("cancels untouched prepared commands with evidence and no ledger writes", async () => {
    const f = await fixture(2);
    const jobId = await f.coach.mutation(prepare, { kind: "create", label: "Never posted", targetAmountCents: 90, scope: "selected", studentIds: f.ids.students, reason: "Prepare explicit two member fee", idempotencyKey: "never-posted-key" }) as Id<"feeBulkJobs">;
    const prepared = await finish(f, jobId);
    await f.coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:cancelPrepared"), { jobId, reason: "Coach cancelled before monetary confirmation" });
    expect(await f.t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "cancelled", snapshotCount: 2, snapshotHash: prepared!.snapshotHash });
    expect(await f.t.run(ctx => ctx.db.query("feeBulkRows").collect())).toHaveLength(2);
    expect(await f.t.run(ctx => ctx.db.query("ledgerEntries").collect())).toHaveLength(0);
    await expect(confirm(f, jobId)).rejects.toThrow("not available");
  });
});
