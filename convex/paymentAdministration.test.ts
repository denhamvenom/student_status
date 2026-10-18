/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { addCharge } from "./lib/money";
import { ensureFinancialAccount, financialAccount } from "./lib/financialSources";
import { startFinancialRebuild } from "./financialSources";
const modules = import.meta.glob("./**/*.ts");
const preview = makeFunctionReference<"query">("paymentAdministration:previewCorrection");
const correct = makeFunctionReference<"mutation">("paymentAdministration:correct");
const post = makeFunctionReference<"mutation">("paymentAdministration:recordPaymentRow");
const batchPreview = makeFunctionReference<"query">("paymentAdministration:previewPayments");
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "synthetic-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "synthetic-coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const parentAuth = await ctx.db.insert("users", { email: "synthetic-parent@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "synthetic-parent@example.invalid", name: "Synthetic Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "synthetic-student@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ensureFinancialAccount(ctx, student);
    await addCharge(ctx, (await ctx.db.get(coach))!, student, "Synthetic fee", 120, 0, "synthetic-payment-fee");
    return { auth, parentAuth, coach, student, season };
  });
  const actor = t.withIdentity({ subject: `${ids.auth}|session` });
  return { t, ids, actor, parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }) };
}
it("corrects allocated receipts without payout, preserves originals, reapplies priority and rebuilds consistently", async () => {
  const f = await fixture(); const row = { studentId: f.ids.student, amountCents: 200, method: "check", reference: "Synthetic check", occurredAt: 1, rowReference: "1", batchReference: "synthetic-batch", reason: "Synthetic receipt entry", expectedGeneration: 1 };
  const receipt: Id<"ledgerEntries"> = await f.actor.mutation(post, row);
  expect(await f.actor.mutation(post, row)).toBe(receipt);
  await expect(f.actor.mutation(post, { ...row, amountCents: 201 })).rejects.toThrow("different receipt");
  const before = await f.actor.query(preview, { sourceEntryId: receipt, targetAmountCents: 80 });
  expect(before).toMatchObject({ state: "ready", releaseRequiredCents: 40, irreversibleSpentCents: 0 });
  const command = { sourceEntryId: receipt, targetAmountCents: 80, expectedSourceRevision: before.expectedSourceRevision, expectedFinancialRevision: before.expectedFinancialRevision, reason: "Correct mistyped receipt", idempotencyKey: "synthetic-payment-correction" };
  const job = await f.actor.mutation(correct, command);
  expect(await f.actor.mutation(correct, command)).toBe(job);
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ paidCents: 80, chargedCents: 120, personalAvailableCents: 0 });
  const second = await f.actor.query(preview, { sourceEntryId: receipt, targetAmountCents: 150 });
  await f.actor.mutation(correct, { ...command, targetAmountCents: 150, expectedSourceRevision: second.expectedSourceRevision, expectedFinancialRevision: second.expectedFinancialRevision, idempotencyKey: "synthetic-payment-correction-two" });
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ paidCents: 120, personalAvailableCents: 30 });
  await f.actor.mutation(api.financeOperations.recordPayout, { studentId: f.ids.student, amountCents: 20, method: "cash", reference: "Synthetic actual payout", occurredAt: 1, reason: "Synthetic family refund", idempotencyKey: "synthetic-payment-payout" });
  expect(await f.actor.query(preview, { sourceEntryId: receipt, targetAmountCents: 10 })).toMatchObject({ state: "hold", irreversibleSpentCents: 20 });
  await f.t.run(async ctx => { expect((await ctx.db.get(receipt))?.amountCents).toBe(200); const payouts = await ctx.db.query("ledgerEntries").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).take(30); expect(payouts.filter(entry => entry.kind === "payout")).toHaveLength(1); await startFinancialRebuild(ctx, f.ids.student, f.ids.coach); });
  for (let count = 0; count < 8; count++) { const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student)); if (account?.state !== "rebuilding") break; await f.t.mutation(makeFunctionReference<"mutation">("financialSources:processPage"), { accountId: account._id, generation: account.generation, phase: account.phase, cursor: account.cursor }); }
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", paidCents: 120, personalAvailableCents: 10 });
});
it("matches active-season emails, holds duplicate rows, denies family edits and rejects stale/locked commands", async () => {
  const f = await fixture(); const data = { studentEmail: "synthetic-student@example.invalid", amountCents: 200, method: "cash", reference: "Synthetic cash receipt", occurredAt: 1, rowReference: "1" };
  const matches = await f.actor.query(batchPreview, { rows: [data, data, { ...data, studentEmail: "unknown@example.invalid", rowReference: "2" }] });
  expect(matches[0]).toMatchObject({ studentId: f.ids.student, error: null }); expect(matches[1].error).toContain("Duplicate"); expect(matches[2].studentId).toBeNull();
  await expect(f.parent.query(batchPreview, { rows: [data] })).rejects.toThrow("Financial editing");
  const receipt: Id<"ledgerEntries"> = await f.actor.mutation(post, { amountCents: data.amountCents, method: data.method, reference: data.reference, occurredAt: data.occurredAt, rowReference: data.rowReference, studentId: f.ids.student, batchReference: "permission-batch", reason: "Synthetic authorized entry", expectedGeneration: 1 });
  await expect(f.parent.query(preview, { sourceEntryId: receipt, targetAmountCents: 80 })).rejects.toThrow("Only a Coach");
  const review = await f.actor.query(preview, { sourceEntryId: receipt, targetAmountCents: 80 });
  await expect(f.actor.mutation(correct, { sourceEntryId: receipt, targetAmountCents: 80, expectedSourceRevision: review.expectedSourceRevision, expectedFinancialRevision: review.expectedFinancialRevision - 1, reason: "Synthetic stale correction", idempotencyKey: "synthetic-stale-key" })).rejects.toThrow("changed");
});
