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
const close = makeFunctionReference<"mutation">("fundraisers:close");
const heldStudents = makeFunctionReference<"query">("fundraisers:heldStudents");
const page = makeFunctionReference<"mutation">("fundraiserPosting:processPage");
const retry = makeFunctionReference<"mutation">("fundraiserPosting:retry");
const retryPreview = makeFunctionReference<"query">("fundraiserPosting:retryPreview");
const paginationOpts = { cursor: null, numItems: 10 };

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "close-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "close-coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const leadAuth = await ctx.db.insert("users", { email: "close-lead@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId: leadAuth, email: "close-lead@example.invalid", name: "Lead", role: "mentor", active: true, travelLead: true, financialEdit: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "close-student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ensureFinancialAccount(ctx, student);
    return { coachAuth, leadAuth, student };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), lead: t.withIdentity({ subject: `${ids.leadAuth}|session` }) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function runPost(f: Fixture, fundraiserId: Id<"fundraisers">, grossCents: number, key: string) {
  const data = await f.t.run(async ctx => ({ fund: await ctx.db.get(fundraiserId), row: await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiserId).eq("studentId", f.ids.student)).unique(), account: await financialAccount(ctx, f.ids.student) }));
  if (!data.fund || !data.account) throw new Error("Missing fixture");
  const jobId = await f.coach.mutation(post, { fundraiserId, expectedRevision: data.fund.revision, rows: [{ studentId: f.ids.student, grossCents, expectedRowRevision: data.row?.revision ?? 0, expectedFinancialRevision: data.account.revision }], reason: "Synthetic amount review", idempotencyKey: key }) as Id<"fundraiserPostingJobs">;
  await f.t.mutation(page, { jobId, cursor: null });
  return jobId;
}

// Posts 100, spends the credit, then tries to post 0 so the reduction is held.
async function heldFundraiser(f: Fixture) {
  const fundraiserId = await f.coach.mutation(create, { name: "Held one", teamBps: 5000, studentBps: 5000, idempotencyKey: "held-create" }) as Id<"fundraisers">;
  await runPost(f, fundraiserId, 100, "held-first");
  await f.coach.mutation(makeFunctionReference<"mutation">("finance:createCharge"), { studentId: f.ids.student, label: "Synthetic spent credit", amountCents: 50, priority: 1, idempotencyKey: "held-spend" });
  const jobId = await runPost(f, fundraiserId, 0, "held-reduce");
  const fundraiser = await f.t.run(ctx => ctx.db.get(fundraiserId));
  if (fundraiser?.state !== "held") throw new Error("Fixture did not reach held");
  return { fundraiserId, jobId, revision: fundraiser.revision };
}
const snapshot = (f: Fixture) => f.t.run(async ctx => ({ ledger: await ctx.db.query("ledgerEntries").collect(), totals: await ctx.db.query("fundraiserStudentTotals").collect(), rows: await ctx.db.query("fundraiserPostingRows").collect(), jobs: await ctx.db.query("fundraiserPostingJobs").collect(), account: await financialAccount(ctx, f.ids.student) }));

describe("closing a held fundraiser", () => {
  it("lets a Coach see who was not credited, then close with a reason, leaving every money record untouched", async () => {
    const f = await fixture(); const h = await heldFundraiser(f);
    const listed = await f.coach.query(heldStudents, { fundraiserId: h.fundraiserId, paginationOpts });
    expect(listed.page).toMatchObject([{ studentId: f.ids.student, name: "Synthetic Student", grossCents: 0, currentCents: 100, notCreditedCents: 0 }]);
    expect(listed.totalCents).toBe(0);
    expect(listed.page[0].message).toContain("Balances have not changed");
    const before = await snapshot(f);
    await expect(f.coach.mutation(close, { fundraiserId: h.fundraiserId, expectedRevision: h.revision + 5, reason: "Owner approved closing" })).rejects.toThrow("changed");
    await expect(f.coach.mutation(close, { fundraiserId: h.fundraiserId, expectedRevision: h.revision, reason: "  " })).rejects.toThrow("reason");
    await f.coach.mutation(close, { fundraiserId: h.fundraiserId, expectedRevision: h.revision, reason: "Owner approved closing" });
    expect(await f.t.run(ctx => ctx.db.get(h.fundraiserId))).toMatchObject({ state: "closed", revision: h.revision + 1 });
    expect(await snapshot(f)).toEqual(before);
    const audits = await f.t.run(ctx => ctx.db.query("audit").collect());
    expect(JSON.parse(audits.find(a => a.action === "close")?.afterJson ?? "{}")).toMatchObject({ state: "closed", notCreditedStudents: 1, notCreditedCents: 0 });
  });

  it("counts only the increase a held row would have added, and keeps reductions at zero", async () => {
    const f = await fixture();
    const fundraiserId = await f.coach.mutation(create, { name: "Increase", teamBps: 5000, studentBps: 5000, idempotencyKey: "inc-create" }) as Id<"fundraisers">;
    await runPost(f, fundraiserId, 100, "inc-first");
    const data = await f.t.run(async ctx => ({ fund: await ctx.db.get(fundraiserId), row: await ctx.db.query("fundraiserStudentTotals").withIndex("by_fundraiserId_and_studentId", q => q.eq("fundraiserId", fundraiserId).eq("studentId", f.ids.student)).unique(), account: await financialAccount(ctx, f.ids.student) }));
    if (!data.fund || !data.row || !data.account) throw new Error("Missing fixture");
    const jobId = await f.coach.mutation(post, { fundraiserId, expectedRevision: data.fund.revision, rows: [{ studentId: f.ids.student, grossCents: 350, expectedRowRevision: data.row.revision, expectedFinancialRevision: data.account.revision + 1000 }], reason: "Synthetic stale increase", idempotencyKey: "inc-stale" });
    await f.t.mutation(page, { jobId, cursor: null });
    const fundraiser = await f.t.run(ctx => ctx.db.get(fundraiserId));
    expect(fundraiser?.state).toBe("held");
    const listed = await f.coach.query(heldStudents, { fundraiserId, paginationOpts });
    expect(listed.page).toMatchObject([{ grossCents: 350, currentCents: 100, notCreditedCents: 250 }]);
    expect(listed.totalCents).toBe(250);
    await f.coach.mutation(close, { fundraiserId, expectedRevision: fundraiser!.revision, reason: "Owner approved closing" });
    const audits = await f.t.run(ctx => ctx.db.query("audit").collect());
    expect(JSON.parse(audits.find(a => a.action === "close")?.afterJson ?? "{}")).toMatchObject({ notCreditedStudents: 1, notCreditedCents: 250 });
  });

  it("does not let a Travel Lead close a held fundraiser or see the list", async () => {
    const f = await fixture(); const h = await heldFundraiser(f);
    await expect(f.lead.mutation(close, { fundraiserId: h.fundraiserId, expectedRevision: h.revision, reason: "Travel Lead tries" })).rejects.toThrow("Only a Coach");
    await expect(f.lead.query(heldStudents, { fundraiserId: h.fundraiserId, paginationOpts })).rejects.toThrow("Only a Coach");
    expect(await f.t.run(ctx => ctx.db.get(h.fundraiserId))).toMatchObject({ state: "held" });
  });

  it("keeps a failed fundraiser open for Try again", async () => {
    const f = await fixture(); const h = await heldFundraiser(f);
    await f.t.run(async ctx => { await ctx.db.patch(h.fundraiserId, { state: "failed" }); });
    await expect(f.coach.mutation(close, { fundraiserId: h.fundraiserId, expectedRevision: h.revision, reason: "Owner approved closing" })).rejects.toThrow("Try posting again");
    expect(await f.t.run(ctx => ctx.db.get(h.fundraiserId))).toMatchObject({ state: "failed" });
  });

  it("cannot be reopened by reviewing or retrying the held rows afterwards", async () => {
    const f = await fixture(); const h = await heldFundraiser(f);
    await f.coach.mutation(close, { fundraiserId: h.fundraiserId, expectedRevision: h.revision, reason: "Owner approved closing" });
    await expect(f.coach.query(retryPreview, { jobId: h.jobId, studentIds: [f.ids.student] })).rejects.toThrow();
    await expect(f.coach.mutation(retry, { jobId: h.jobId, reason: "Trying after close", rows: [] })).rejects.toThrow();
    expect(await f.t.run(ctx => ctx.db.get(h.fundraiserId))).toMatchObject({ state: "closed" });
    expect((await f.t.run(ctx => ctx.db.query("fundraiserPostingRows").collect())).map(row => row.state)).toEqual(["committed", "held"]);
  });
});
