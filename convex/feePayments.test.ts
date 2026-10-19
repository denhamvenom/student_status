/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import { ensureFinancialAccount, financialAccount, recordChargeChange } from "./lib/financialSources";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const secondAuth = await ctx.db.insert("users", { email: "second.coach@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId: secondAuth, email: "second.coach@example.invalid", name: "Second Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const otherAuth = await ctx.db.insert("users", { email: "parent@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId: otherAuth, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2027, status: "active", startsAt: 0, permissionVersion: "draft", createdBy: actor });
    const fee = await ctx.db.insert("feeDefinitions", { seasonId: season, kind: "custom", label: "Trip fee", defaultAmountCents: 1000, priority: 20, revision: 0, state: "active", createdBy: actor, createdAt: 1, updatedAt: 1 });
    const otherFee = await ctx.db.insert("feeDefinitions", { seasonId: season, kind: "custom", label: "Earlier fee", defaultAmountCents: 500, priority: 10, revision: 0, state: "active", createdBy: actor, createdAt: 1, updatedAt: 1 });
    const students = [];
    for (let index = 0; index < 2; index++) {
      const student = await ctx.db.insert("students", { seasonId: season, legalName: `Synthetic ${index}`, preferredName: `Synthetic ${index}`, email: `student${index}@example.invalid`, subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const account = await ensureFinancialAccount(ctx, student);
      const otherCharge = await ctx.db.insert("charges", { studentId: student, feeDefinitionId: otherFee, label: "Earlier fee", amountCents: 500, appliedCents: 0, priority: 10, createdBy: actor, createdAt: 1 });
      const charge = await ctx.db.insert("charges", { studentId: student, feeDefinitionId: fee, label: "Trip fee", amountCents: 1000, appliedCents: 0, priority: 20, createdBy: actor, createdAt: 1 });
      await recordChargeChange(ctx, account, (await ctx.db.get(otherCharge))!, 0, 0, true);
      await recordChargeChange(ctx, account, (await ctx.db.get(charge))!, 0, 0, true);
      students.push({ student, charge, otherCharge });
    }
    return { auth, secondAuth, otherAuth, actor, season, fee, otherFee, students };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const secondCoach = t.withIdentity({ subject: `${ids.secondAuth}|session` });
  const parent = t.withIdentity({ subject: `${ids.otherAuth}|session` });
  const exportPage = async () => coach.query(api.feePayments.exportPage, { feeDefinitionId: ids.fee, filter: "all", paginationOpts: { cursor: null, numItems: 20 } });
  const rows = async () => (await exportPage()).page.map((item, index) => ({ rowKey: `synthetic-row-${index}`, studentId: item.studentId, chargeId: item.chargeId, amountCents: index ? 600 : 400, expectedChargeRevision: item.chargeRevision, expectedFinancialGeneration: item.financialGeneration, expectedFinancialRevision: item.financialRevision }));
  return { t, ids, coach, secondCoach, parent, exportPage, rows };
}
const details = { method: "check" as const, reference: "Synthetic receipt", occurredAt: 1000 };

describe("fee-specific CSV payment batches", () => {
  it("exports assessed active students and applies a new receipt only to its chosen fee", async () => {
    const f = await fixture();
    const exported = await f.exportPage();
    expect(exported.page).toHaveLength(2);
    expect(exported.page[0]).toMatchObject({ chargedCents: 1000, appliedCents: 0, owedCents: 1000 });
    await expect(f.parent.query(api.feePayments.exportPage, { feeDefinitionId: f.ids.fee, filter: "all", paginationOpts: { cursor: null, numItems: 20 } })).rejects.toThrow("Financial editing");
    const rows = await f.rows();
    const preview = await f.coach.query(api.feePayments.previewRows, { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-1", rows });
    expect(preview.map(item => item.state)).toEqual(["ready", "ready"]);
    const batch = await f.coach.mutation(api.feePayments.beginBatch, { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-1", rows, ...details });
    await expect(f.parent.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[0].rowKey })).rejects.toThrow("Financial editing");
    const saved = await f.coach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[0].rowKey });
    expect(saved.replayed).toBe(false);
    const state = await f.t.run(async ctx => ({
      chosen: await ctx.db.get(rows[0].chargeId), other: await ctx.db.get(f.ids.students[0].otherCharge), account: await financialAccount(ctx, rows[0].studentId),
      receipt: await ctx.db.get(saved.receiptId), sources: await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", rows[0].studentId).eq("generation", 1).eq("sourceEntryId", saved.receiptId)).unique(),
    }));
    expect(state.chosen?.appliedCents).toBe(400);
    expect(state.other?.appliedCents).toBe(0);
    expect(state.account).toMatchObject({ paidCents: 400, personalAppliedCents: 400, personalAvailableCents: 0 });
    expect(state.sources).toMatchObject({ receivedCents: 400, availableCents: 0, appliedCents: 400 });
    expect(state.receipt).toMatchObject({ kind: "payment", amountCents: 400, chargeId: rows[0].chargeId, method: "check" });
    expect((await f.coach.query(api.feePayments.exportPage, { feeDefinitionId: f.ids.fee, filter: "unpaid", paginationOpts: { cursor: null, numItems: 20 } })).page).toHaveLength(2);
  });

  it("resumes a partial batch across actors, rejects changed upload, and blocks stale or excessive amounts", async () => {
    const f = await fixture();
    const rows = await f.rows();
    const start = { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-2", rows, ...details };
    const batch = await f.coach.mutation(api.feePayments.beginBatch, start);
    const first = await f.coach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[0].rowKey });
    expect(await f.secondCoach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[0].rowKey })).toEqual({ receiptId: first.receiptId, replayed: true });
    expect(await f.secondCoach.mutation(api.feePayments.beginBatch, { ...start, rows: [...rows].reverse() })).toEqual({ batchId: batch.batchId, resumed: true });
    await expect(f.coach.mutation(api.feePayments.beginBatch, { ...start, rows: [{ ...rows[0], amountCents: 401 }, rows[1]] })).rejects.toThrow("different payment rows");
    await expect(f.coach.mutation(api.feePayments.beginBatch, { ...start, reference: "Changed receipt" })).rejects.toThrow("different payment rows");
    const reorderedFirst = { amountCents: rows[0].amountCents, expectedFinancialRevision: rows[0].expectedFinancialRevision, chargeId: rows[0].chargeId, rowKey: rows[0].rowKey, expectedFinancialGeneration: rows[0].expectedFinancialGeneration, studentId: rows[0].studentId, expectedChargeRevision: rows[0].expectedChargeRevision };
    expect((await f.secondCoach.query(api.feePayments.previewRows, { feeDefinitionId: f.ids.fee, exportId: start.exportId, rows: [reorderedFirst, rows[1]] })).map(item => item.state)).toEqual(["recorded", "ready"]);
    await f.t.run(ctx => ctx.db.patch(rows[1].chargeId, { revision: rows[1].expectedChargeRevision + 1 }));
    await expect(f.coach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[1].rowKey })).rejects.toThrow("changed");
    expect(await f.t.run(ctx => ctx.db.query("feePaymentRows").withIndex("by_batchId_and_rowKey", q => q.eq("batchId", batch.batchId).eq("rowKey", rows[1].rowKey)).unique())).toBeNull();
    const tooMuch = [{ ...rows[1], amountCents: 1001, expectedChargeRevision: rows[1].expectedChargeRevision + 1 }];
    expect((await f.coach.query(api.feePayments.previewRows, { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-3", rows: tooMuch }))[0].state).toBe("invalid");
  });

  it("continues the remaining row after a reload without duplicating the first receipt", async () => {
    const f = await fixture();
    const rows = await f.rows();
    const request = { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-resume", rows, method: "cash" as const, reference: "", occurredAt: 1000 };
    const batch = await f.coach.mutation(api.feePayments.beginBatch, request);
    const first = await f.coach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[0].rowKey });
    expect((await f.t.run(ctx => ctx.db.get(first.receiptId)))?.reference).toBe("Fee CSV synthetic-export-resume");
    expect(await f.secondCoach.mutation(api.feePayments.beginBatch, { ...request, rows: [...rows].reverse() })).toEqual({ batchId: batch.batchId, resumed: true });
    const second = await f.secondCoach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[1].rowKey });
    expect(second.replayed).toBe(false);
    expect(await f.t.run(ctx => ctx.db.get(rows[1].chargeId))).toMatchObject({ appliedCents: 600 });
    expect(await f.secondCoach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[0].rowKey })).toEqual({ receiptId: first.receiptId, replayed: true });
    expect(await f.t.run(ctx => ctx.db.query("feePaymentRows").withIndex("by_batchId_and_rowKey", q => q.eq("batchId", batch.batchId)).take(10))).toHaveLength(2);
  });

  it("classifies a partial fee as unpaid and a fully covered fee as paid", async () => {
    const f = await fixture();
    const [first, second] = await f.rows();
    const rows = [{ ...first, amountCents: 1000 }, second];
    const batch = await f.coach.mutation(api.feePayments.beginBatch, { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-filters", rows, ...details });
    await f.coach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: first.rowKey });
    await f.coach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: second.rowKey });
    const paid = await f.coach.query(api.feePayments.exportPage, { feeDefinitionId: f.ids.fee, filter: "paid", paginationOpts: { cursor: null, numItems: 20 } });
    const unpaid = await f.coach.query(api.feePayments.exportPage, { feeDefinitionId: f.ids.fee, filter: "unpaid", paginationOpts: { cursor: null, numItems: 20 } });
    expect(paid.page).toMatchObject([{ studentId: first.studentId, owedCents: 0 }]);
    expect(unpaid.page).toMatchObject([{ studentId: second.studentId, owedCents: 400 }]);
  });

  it("refuses inactive and cross-season targets even with valid-looking imported IDs", async () => {
    const f = await fixture();
    const rows = await f.rows();
    await f.t.run(ctx => ctx.db.patch(rows[0].studentId, { active: false }));
    expect((await f.coach.query(api.feePayments.previewRows, { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-4", rows: [rows[0]] }))[0].state).toBe("invalid");
    const batch = await f.coach.mutation(api.feePayments.beginBatch, { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-4", rows: [rows[0]], ...details });
    await expect(f.coach.mutation(api.feePayments.recordRow, { batchId: batch.batchId, rowKey: rows[0].rowKey })).rejects.toThrow("unavailable");
    const unrelatedSeason = await f.t.run(ctx => ctx.db.insert("seasons", { name: "Other", year: 2028, status: "archived", startsAt: 0, permissionVersion: "draft", createdBy: f.ids.actor }));
    await f.t.run(ctx => ctx.db.patch(rows[1].studentId, { seasonId: unrelatedSeason }));
    expect((await f.coach.query(api.feePayments.previewRows, { feeDefinitionId: f.ids.fee, exportId: "synthetic-export-5", rows: [rows[1]] }))[0].state).toBe("invalid");
  });
});
