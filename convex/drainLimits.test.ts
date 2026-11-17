/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
const modules = import.meta.glob("./**/*.ts");
type JobId = Id<"feePriorityJobs"> | Id<"feeMappingJobs"> | Id<"feeBulkJobs">;
const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const run = (name: string) => makeFunctionReference<"mutation">(name);
const LIMIT_MESSAGE = "Money updates are still running after 30 minutes. Wait for them to finish, then choose Try again.";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

/** A season whose money reports never finish: drain is neither ready nor blocked, forever. */
async function stuckSeason() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    await ctx.db.insert("financeSummaryBackfills", { seasonId: season, state: "running", cursor: null, processed: 0, updatedAt: NOW });
    const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "draining", mappingInitialized: true, orderReady: true, unmappedCount: 0, updatedAt: NOW });
    const fee = { seasonId: season, kind: "custom" as const, defaultAmountCents: 100, revision: 0, state: "active" as const, createdBy: actor, createdAt: 0, updatedAt: 0 };
    const first = await ctx.db.insert("feeDefinitions", { ...fee, label: "First", priority: 1 });
    const second = await ctx.db.insert("feeDefinitions", { ...fee, label: "Second", priority: 2 });
    return { auth, actor, season, control, first, second };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}
type Stuck = Awaited<ReturnType<typeof stuckSeason>>;
const pending = (t: Stuck["t"]) => t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").collect()).filter(f => f.state.kind === "pending").length);

/** Poll the worker the way the scheduler does: every second, until it stops rescheduling or the bound is passed. */
async function pollUntilStopped(s: Stuck, name: string, jobId: JobId, maxMinutes: number) {
  let polls = 0;
  for (let elapsed = 0; elapsed <= maxMinutes * MINUTE; elapsed += 30_000) {
    vi.setSystemTime(NOW + elapsed);
    const before = await pending(s.t);
    await s.t.mutation(run(name), { jobId });
    polls++;
    if (await pending(s.t) === before) break;
  }
  return polls;
}

const priorityJob = (s: Stuck, updatedAt: number) => s.t.run(ctx => ctx.db.insert("feePriorityJobs", { seasonId: s.ids.season, originalActorId: s.ids.actor, actorId: s.ids.actor, idempotencyKey: "k", operationHash: "h", reason: "Synthetic reason", state: "draining", step: 0, cursor: null, phase: "drain", firstFeeId: s.ids.first, secondFeeId: s.ids.second, firstPriority: 1, secondPriority: 2, firstRevision: 0, secondRevision: 0, processed: 0, createdAt: updatedAt, updatedAt })).then(async id => { await s.t.run(ctx => ctx.db.patch(s.ids.control, { priorityJobId: id })); return id; });
const mappingJob = (s: Stuck, updatedAt: number) => s.t.run(ctx => ctx.db.insert("feeMappingJobs", { seasonId: s.ids.season, originalActorId: s.ids.actor, actorId: s.ids.actor, mode: "prove", state: "draining", phase: "drain", step: 0, cursor: null, nextRank: 1, processed: 0, mapped: 0, unmapped: 0, idempotencyKey: "k", operationHash: "h", reason: "Synthetic reason", createdAt: updatedAt, updatedAt })).then(async id => { await s.t.run(ctx => ctx.db.patch(s.ids.control, { mappingJobId: id })); return id; });
const bulkJob = (s: Stuck, updatedAt: number) => s.t.run(ctx => ctx.db.insert("feeBulkJobs", { seasonId: s.ids.season, feeDefinitionId: s.ids.first, originalActorId: s.ids.actor, actorId: s.ids.actor, kind: "edit", scope: "allActive", targetAmountCents: 200, definitionBeforeJson: null, snapshotHash: "s", snapshotCount: 0, snapshotComplete: false, expectedDefinitionRevision: 0, state: "draining", phase: "drain", step: 0, cursor: null, processed: 0, committed: 0, held: 0, supersededRows: 0, idempotencyKey: "k", operationHash: "h", reason: "Synthetic reason", createdAt: updatedAt, updatedAt })).then(async id => { await s.t.run(async ctx => { await ctx.db.patch(s.ids.control, { bulkJobId: id }); await ctx.db.patch(s.ids.first, { latestJobId: id }); }); return id; });
const transitionPlan = (s: Stuck, updatedAt: number) => s.t.run(ctx => ctx.db.insert("seasonTransitionPlans", { sourceSeasonId: s.ids.season, targetName: "Next", targetCompetitionYear: 2027, targetStartDate: "2026-12-01", targetEndDate: "2027-06-01", state: "draining", stage: "drainSource", open: true, revision: 1, createdBy: s.ids.actor, updatedBy: s.ids.actor, createdAt: updatedAt, updatedAt, idempotencyKey: "k", requestHash: "h", cursor: null, processed: 0 }));

const workers = [
  { label: "fee order (priority)", name: "feePriorityWorker:run", make: priorityJob, table: "feePriorityJobs" as const },
  { label: "fee matching (mapping)", name: "feeMappingWorker:run", make: mappingJob, table: "feeMappingJobs" as const },
  { label: "bulk fee change", name: "feeBulkWorker:run", make: bulkJob, table: "feeBulkJobs" as const },
];

describe("drain polling has a time limit", () => {
  for (const w of workers) {
    describe(w.label, () => {
      it("keeps waiting while the wait is within the limit, then fails with a plain message after it", async () => {
        const s = await stuckSeason(); const jobId = await w.make(s, NOW);
        // Before the fix this never stopped: every poll re-scheduled itself for as long as the drain stayed busy.
        const polls = await pollUntilStopped(s, w.name, jobId, 120);
        const job = await s.t.run(ctx => ctx.db.get(jobId)) as { state: string; lastError?: string; updatedAt: number } | null;
        expect(job?.state).toBe("failed");
        expect(job?.lastError).toContain(LIMIT_MESSAGE);
        expect(polls).toBeGreaterThan(2); // it did wait through the early polls
        expect((await s.t.run(ctx => ctx.db.get(s.ids.control)))?.state).toBe("failed");
      });
      it("still reschedules a drain that has waited only 29 minutes", async () => {
        const s = await stuckSeason(); const jobId = await w.make(s, NOW - 29 * MINUTE);
        await s.t.mutation(run(w.name), { jobId });
        expect((await s.t.run(ctx => ctx.db.get(jobId)))?.state).toBe("draining");
        expect(await pending(s.t)).toBe(1);
      });
      it("fails a drain that has waited 31 minutes and stops rescheduling", async () => {
        const s = await stuckSeason(); const jobId = await w.make(s, NOW - 31 * MINUTE);
        await s.t.mutation(run(w.name), { jobId });
        expect(await s.t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "failed" });
        expect(await pending(s.t)).toBe(0);
      });
      it("lets a normal drain finish: once the drain is ready it proceeds even after a long wait", async () => {
        const s = await stuckSeason(); const jobId = await w.make(s, NOW - 31 * MINUTE);
        await s.t.run(async ctx => { const r = await ctx.db.query("financeSummaryBackfills").first(); await ctx.db.patch(r!._id, { state: "complete" }); });
        await s.t.mutation(run(w.name), { jobId });
        expect((await s.t.run(ctx => ctx.db.get(jobId)))?.state).not.toBe("failed");
      });
    });
  }

  it("a stale poll cannot fail a job that already moved on", async () => {
    const s = await stuckSeason(); const jobId = await priorityJob(s, NOW - 31 * MINUTE);
    await s.t.run(ctx => ctx.db.patch(jobId, { step: 1, phase: "firstFee", state: "applying" }));
    await s.t.mutation(makeFunctionReference<"mutation">("feePriorityWorker:processPage"), { jobId, step: 0 });
    expect((await s.t.run(ctx => ctx.db.get(jobId)))?.state).toBe("applying");
  });

  it("a Coach can try the fee order update again after the limit, and it gets a fresh wait", async () => {
    const s = await stuckSeason(); const jobId = await priorityJob(s, NOW - 31 * MINUTE);
    await s.t.mutation(run("feePriorityWorker:run"), { jobId });
    expect((await s.t.run(ctx => ctx.db.get(jobId)))?.state).toBe("failed");
    await s.coach.mutation(makeFunctionReference<"mutation">("feePriorities:retry"), { jobId, reason: "Money reports finished, trying again" });
    expect((await s.t.run(ctx => ctx.db.get(jobId)))?.state).toBe("draining");
    await s.t.mutation(run("feePriorityWorker:run"), { jobId });
    expect((await s.t.run(ctx => ctx.db.get(jobId)))?.state).toBe("draining");
    expect(await pending(s.t)).toBeGreaterThanOrEqual(1);
  });

  describe("season transition", () => {
    const advance = (s: Stuck, planId: Id<"seasonTransitionPlans">) => s.t.mutation(makeFunctionReference<"mutation">("seasonTransition:advance"), { planId });
    it("stops polling the source drain after the limit and fails the plan with a plain message", async () => {
      const s = await stuckSeason(); const planId = await transitionPlan(s, NOW);
      let polls = 0;
      for (let elapsed = 0; elapsed <= 120 * MINUTE; elapsed += 30_000) {
        vi.setSystemTime(NOW + elapsed); const before = await pending(s.t);
        await advance(s, planId); polls++;
        if (await pending(s.t) === before) break;
      }
      const plan = await s.t.run(ctx => ctx.db.get(planId));
      expect(plan?.state).toBe("failed");
      expect(plan?.lastError).toContain("Money updates are still running after 30 minutes. Wait for them to finish, then choose Resume transition.");
      expect(polls).toBeGreaterThan(2);
    });
    it("keeps polling a drain that has waited only 29 minutes", async () => {
      const s = await stuckSeason(); const planId = await transitionPlan(s, NOW - 29 * MINUTE);
      await advance(s, planId);
      expect((await s.t.run(ctx => ctx.db.get(planId)))?.state).toBe("draining");
      expect(await pending(s.t)).toBe(1);
    });
    it("Resume transition works after the limit and starts a fresh wait", async () => {
      const s = await stuckSeason(); const planId = await transitionPlan(s, NOW - 31 * MINUTE);
      await advance(s, planId);
      expect((await s.t.run(ctx => ctx.db.get(planId)))?.state).toBe("failed");
      await s.coach.mutation(makeFunctionReference<"mutation">("seasonTransition:resume"), { planId });
      expect((await s.t.run(ctx => ctx.db.get(planId)))?.state).toBe("draining");
      await advance(s, planId);
      expect((await s.t.run(ctx => ctx.db.get(planId)))?.state).toBe("draining");
    });
    it("does not touch a plan that is no longer waiting on a drain", async () => {
      const s = await stuckSeason(); const planId = await transitionPlan(s, NOW - 31 * MINUTE);
      await s.t.run(ctx => ctx.db.patch(planId, { stage: "validateRoster", state: "applying" }));
      await advance(s, planId);
      expect(await s.t.run(ctx => ctx.db.get(planId))).not.toMatchObject({ lastError: expect.stringContaining("30 minutes") });
    });
  });
});
