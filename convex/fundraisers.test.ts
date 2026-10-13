/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { ensureFinancialAccount, financialAccount } from "./lib/financialSources";
const modules = import.meta.glob("./**/*.ts");
const create = makeFunctionReference<"mutation">("fundraisers:create");
const post = makeFunctionReference<"mutation">("fundraisers:post");
const page = makeFunctionReference<"mutation">("fundraiserPosting:processPage");

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "fund-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "fund-coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "fund-student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ensureFinancialAccount(ctx, student);
    return { auth, coach, student };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}
async function postAmount(f: Awaited<ReturnType<typeof fixture>>, fundraiserId: Id<"fundraisers">, grossCents: number, key: string) {
  const data = await f.t.run(async ctx => ({ fund: await ctx.db.get(fundraiserId), row: await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiserId).eq("studentId", f.ids.student)).unique(), account: await financialAccount(ctx, f.ids.student) }));
  if (!data.fund || !data.account) throw new Error("Missing fixture");
  const args = { fundraiserId, expectedRevision: data.fund.revision, rows: [{ studentId: f.ids.student, grossCents, expectedRowRevision: data.row?.revision ?? 0, expectedFinancialRevision: data.account.revision }], reason: "Synthetic amount review", idempotencyKey: key };
  const jobId = await f.coach.mutation(post, args) as Id<"fundraiserPostingJobs">;
  expect(await f.coach.mutation(post, args)).toBe(jobId);
  await f.t.mutation(page, { jobId, cursor: null });
  return jobId;
}

describe("fundraiser source posting", () => {
  it("records genuine gross for a 100% team fundraiser with no invented student credit", async () => {
    const f = await fixture();
    const fundraiserId = await f.coach.mutation(create, { name: "All team", teamBps: 10000, studentBps: 0, idempotencyKey: "all-team-create" }) as Id<"fundraisers">;
    await postAmount(f, fundraiserId, 2900, "all-team-post");
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ knownRaisedCents: 2900, travelShareCents: 0, fundraisingAvailableCents: 0 });
    expect((await f.t.run(ctx => ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique()))?.updatedAt).not.toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.student)).collect())).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.query("financeChangeEvents").collect())).toMatchObject([{ kind: "fundraiserGross", state: "committed", beforeCents: 0, afterCents: 2900, deltaCents: 2900 }]);
  });

  it("preserves original award source, reverses only available award credit and holds spent reductions unchanged", async () => {
    const f = await fixture();
    const fundraiserId = await f.coach.mutation(create, { name: "Half", teamBps: 5000, studentBps: 5000, idempotencyKey: "half-create" }) as Id<"fundraisers">;
    await postAmount(f, fundraiserId, 100, "first-post");
    await postAmount(f, fundraiserId, 60, "safe-reduction");
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ knownRaisedCents: 60, travelShareCents: 30, fundraisingAvailableCents: 30 });
    await f.coach.mutation(makeFunctionReference<"mutation">("finance:createCharge"), { studentId: f.ids.student, label: "Synthetic spent credit", amountCents: 30, priority: 1, idempotencyKey: "spent-award-charge" });
    const before = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    const heldId = await postAmount(f, fundraiserId, 0, "held-reduction");
    expect(await f.t.run(ctx => ctx.db.get(heldId))).toMatchObject({ state: "held", held: 1, committed: 0 });
    const after = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    expect(after).toEqual(before);
    const row = await f.t.run(ctx => ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiserId).eq("studentId", f.ids.student)).unique());
    expect(row).toMatchObject({ grossCents: 60, travelCreditCents: 30 });
  });
  it("continues a reduction across more than 20 original awards and preserves its lock after failure", async () => {
    const f = await fixture();
    const fundraiserId = await f.coach.mutation(create, { name: "Many awards", teamBps: 0, studentBps: 10000, idempotencyKey: "many-awards-create" }) as Id<"fundraisers">;
    for (let gross = 1; gross <= 25; gross++) await postAmount(f, fundraiserId, gross, `award-step-${gross}`);
    const data = await f.t.run(async ctx => ({ fund: await ctx.db.get(fundraiserId), row: await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiserId).eq("studentId", f.ids.student)).unique(), account: await financialAccount(ctx, f.ids.student) }));
    if (!data.fund || !data.row || !data.account) throw new Error("Missing fixture");
    const jobId = await f.coach.mutation(post, { fundraiserId, expectedRevision: data.fund.revision, rows: [{ studentId: f.ids.student, grossCents: 0, expectedRowRevision: data.row.revision, expectedFinancialRevision: data.account.revision }], reason: "Reviewed original award correction", idempotencyKey: "many-awards-reduce" }) as Id<"fundraiserPostingJobs">;
    await f.t.mutation(page, { jobId, cursor: null });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "posting", fundraisingAvailableCents: 5, knownRaisedCents: 25, travelShareCents: 5 });
    const alternate = await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.coach, { active: false });
      const auth = await ctx.db.insert("users", { email: "alternate-coach@example.invalid" });
      await ctx.db.insert("appUsers", { authUserId: auth, email: "alternate-coach@example.invalid", name: "Alternate Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
      return auth;
    });
    await f.t.mutation(makeFunctionReference<"mutation">("fundraiserPosting:run"), { jobId });
    const coach = f.t.withIdentity({ subject: `${alternate}|session` });
    await expect(coach.mutation(makeFunctionReference<"mutation">("financialSources:rebuild"), { studentId: f.ids.student })).rejects.toThrow("existing financial job");
    await coach.mutation(makeFunctionReference<"mutation">("fundraiserPosting:retry"), { jobId, rows: [], reason: "Alternate Coach authorizes continuation" });
    const job = await f.t.run(ctx => ctx.db.get(jobId)); if (!job) throw new Error("Missing job");
    await f.t.mutation(page, { jobId, cursor: job.cursor });
    await f.t.mutation(page, { jobId, cursor: job.cursor });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", fundraisingAvailableCents: 0, knownRaisedCents: 0, travelShareCents: 0 });
    expect(await f.t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "complete", committed: 1, originalActorId: f.ids.coach });
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: true }));
    expect(await f.coach.mutation(post, { fundraiserId, expectedRevision: data.fund.revision, rows: [{ studentId: f.ids.student, grossCents: 0, expectedRowRevision: data.row.revision, expectedFinancialRevision: data.account.revision }], reason: "Reviewed original award correction", idempotencyKey: "many-awards-reduce" })).toBe(jobId);
  });

  it("enforces real creation grants and stops a granted poster whose financial permission is revoked", async () => {
    const f = await fixture();
    const lead = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "fund-lead@example.invalid" });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: "fund-lead@example.invalid", name: "Lead", role: "mentor", travelLead: true, financialEdit: true, active: true });
      return { auth, user };
    });
    const poster = f.t.withIdentity({ subject: `${lead.auth}|session` });
    const createArgs = { name: "Grant test", teamBps: 5000, studentBps: 5000, idempotencyKey: "grant-create-key" };
    await expect(poster.mutation(create, createArgs)).rejects.toThrow("Only a Coach");
    const fundraiserId = await f.coach.mutation(create, createArgs) as Id<"fundraisers">;
    const jobId = await poster.mutation(post, { fundraiserId, expectedRevision: 0, rows: [{ studentId: f.ids.student, grossCents: 100, expectedRowRevision: 0, expectedFinancialRevision: 0 }], reason: "Granted poster amount review", idempotencyKey: "grant-post-key" }) as Id<"fundraiserPostingJobs">;
    await f.t.run(ctx => ctx.db.patch(lead.user, { financialEdit: false }));
    await f.t.mutation(makeFunctionReference<"mutation">("fundraiserPosting:run"), { jobId });
    expect(await f.t.run(ctx => ctx.db.get(jobId))).toMatchObject({ state: "failed", committed: 0 });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ knownRaisedCents: 0, fundraisingAvailableCents: 0 });
  });

});
