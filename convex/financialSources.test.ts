/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { allocateUnapplied } from "./lib/money";
import { financialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
const rebuild = makeFunctionReference<"mutation">("financialSources:rebuild");
const processPage = makeFunctionReference<"mutation">("financialSources:processPage");
const funds = makeFunctionReference<"mutation">("finance:recordFunds");

async function fixture(count = 0) {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "foundation@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "foundation@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "foundation-student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    for (let i = 0; i < count; i++) await ctx.db.insert("ledgerEntries", { studentId: student, kind: "payment", amountCents: 1, previousCents: i, newCents: i + 1, recordedBy: coach, recordedAt: i, idempotencyKey: `historical:${i}` });
    return { auth, coach, student };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}

async function drain(f: Awaited<ReturnType<typeof fixture>>) {
  for (let i = 0; i < 150; i++) {
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    if (!account || account.state !== "rebuilding") return account;
    await f.t.mutation(processPage, { accountId: account._id, generation: account.generation, phase: account.phase, cursor: account.cursor });
  }
  throw new Error("Rebuild did not finish within fixture bound.");
}

describe("source financial foundation", () => {
  it("rebuilds more than 500 historical receipts without losing cents and resumes guarded pages", async () => {
    const f = await fixture(620);
    const id = await f.coach.mutation(rebuild, { studentId: f.ids.student }) as Id<"financialAccounts">;
    expect(await f.coach.mutation(rebuild, { studentId: f.ids.student })).toBe(id);
    const first = await f.t.run(ctx => ctx.db.get(id));
    if (!first) throw new Error("Missing account");
    const args = { accountId: id, generation: first.generation, phase: first.phase, cursor: first.cursor };
    await f.t.mutation(processPage, args);
    await f.t.mutation(processPage, args);
    expect((await f.t.run(ctx => ctx.db.get(id)))?.sourceCount).toBe(20);
    const complete = await drain(f);
    expect(complete).toMatchObject({ state: "ready", sourceCount: 620, ledgerCount: 620, personalAvailableCents: 620 });
    await f.coach.mutation(funds, { studentId: f.ids.student, kind: "payment", amountCents: 5, reason: "Exact increment", idempotencyKey: "new-receipt-after-history" });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ personalAvailableCents: 625, ledgerCount: 621 });
  });

  it("blocks competing transactions until preparation completes and rejects mismatched charge evidence", async () => {
    const f = await fixture(1);
    await f.t.run(async ctx => { await ctx.db.insert("charges", { studentId: f.ids.student, label: "Corrupt fixture", amountCents: 1, appliedCents: 1, priority: 1, createdBy: f.ids.coach, createdAt: 1 }); });
    await f.coach.mutation(rebuild, { studentId: f.ids.student });
    await expect(f.coach.mutation(funds, { studentId: f.ids.student, kind: "payment", amountCents: 5, reason: "Blocked", idempotencyKey: "blocked-during-rebuild" })).rejects.toThrow("updating");
    await expect(drain(f)).rejects.toThrow("funding history");
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "rebuilding", paidCents: 0 });
  });
  it("advances past excluded charges and continues a partial charge across more than 20 sources", async () => {
    const f = await fixture(45);
    const target = await f.t.run(async ctx => {
      const student = await ctx.db.get(f.ids.student);
      if (!student) throw new Error("Missing student");
      const excluded = await ctx.db.insert("events", { seasonId: student.seasonId, name: "Withdrawn", type: "Team", startsAt: 1, endsAt: 2, destination: "Synthetic", travel: "none", overnight: false, roomingEnabled: false, feeCents: 1, signupMode: "assigned", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
      for (let i = 0; i < 25; i++) await ctx.db.insert("charges", { studentId: f.ids.student, eventId: excluded, label: "Excluded", amountCents: 1, appliedCents: 0, priority: i, createdBy: f.ids.coach, createdAt: i });
      const charge = await ctx.db.insert("charges", { studentId: f.ids.student, label: "Eligible", amountCents: 45, appliedCents: 0, priority: 30, createdBy: f.ids.coach, createdAt: 30 });
      return { excluded, charge };
    });
    await f.coach.mutation(rebuild, { studentId: f.ids.student }); await drain(f);
    await f.t.run(async ctx => {
      const actor = await ctx.db.get(f.ids.coach); if (!actor) throw new Error("Missing actor");
      await allocateUnapplied(ctx, actor, f.ids.student, "excluded-source-test", target.excluded);
    });
    const page = makeFunctionReference<"mutation">("financialAllocation:processPage");
    for (let i = 0; i < 40; i++) {
      const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
      if (!account?.allocationJobId) break;
      const job = await f.t.run(ctx => ctx.db.get(account.allocationJobId!));
      if (!job) throw new Error("Missing allocation job");
      await f.t.mutation(page, { jobId: job._id, step: job.step });
    }
    expect(await f.t.run(ctx => ctx.db.get(target.charge))).toMatchObject({ appliedCents: 45, outstanding: false });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", personalAvailableCents: 0, paidCents: 45, chargedCents: 70 });
    const excluded = await f.t.run(ctx => ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", target.excluded).eq("studentId", f.ids.student)).collect());
    expect(excluded.every(c => c.appliedCents === 0)).toBe(true);
  });

  it("finishes student-triggered multipage allocation and preserves the lock after the actor becomes inactive", async () => {
    const f = await fixture(150);
    const actor = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "signup@example.invalid" });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: "signup@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
      await ctx.db.patch(f.ids.student, { userId: user });
      const student = await ctx.db.get(f.ids.student); if (!student) throw new Error("Missing student");
      await ctx.db.insert("charges", { studentId: student._id, label: "Earlier unpaid charge", amountCents: 30, appliedCents: 0, priority: 0, createdBy: f.ids.coach, createdAt: 0 });
      const event = await ctx.db.insert("events", { seasonId: student.seasonId, name: "Student signup", type: "Team", startsAt: Date.now() + 100000, endsAt: Date.now() + 200000, destination: "Synthetic", travel: "none", overnight: false, roomingEnabled: false, feeCents: 120, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
      return { auth, user, event };
    });
    await f.coach.mutation(rebuild, { studentId: f.ids.student }); await drain(f);
    const student = f.t.withIdentity({ subject: `${actor.auth}|session` });
    expect(await student.mutation(makeFunctionReference<"mutation">("participation:signUp"), { eventId: actor.event })).toBe("confirmed");
    const pending = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    expect(pending?.state).toBe("allocating"); expect(pending?.paidCents).toBeGreaterThan(0); expect(pending?.paidCents).toBeLessThan(150);
    if (!pending?.allocationJobId) throw new Error("Missing allocation job");
    await f.t.run(ctx => ctx.db.patch(actor.user, { active: false }));
    await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:run"), { jobId: pending.allocationJobId });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "failed", paidCents: pending.paidCents });
    await expect(f.coach.mutation(rebuild, { studentId: f.ids.student })).rejects.toThrow("existing financial job");
    await f.coach.mutation(makeFunctionReference<"mutation">("financialAllocation:retry"), { studentId: f.ids.student, reason: "Coach resumes validated signup allocation" });
    for (let i = 0; i < 20; i++) {
      const job = await f.t.run(ctx => ctx.db.get(pending.allocationJobId!));
      if (!job || job.state !== "running") break;
      const args = { jobId: job._id, step: job.step };
      await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:processPage"), args);
      await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:processPage"), args);
    }
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", paidCents: 150, personalAvailableCents: 0 });
  });

});
