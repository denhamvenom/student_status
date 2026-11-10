/// <reference types="vite/client" />
import { expect, it, vi } from "vitest";
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
  await expect(f.actor.mutation(post, { ...row, amountCents: 201 })).rejects.toThrow("different details");
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
  expect(matches[0]).toMatchObject({ studentId: f.ids.student, error: null }); expect(matches[1].error).toContain("appears twice"); expect(matches[2].studentId).toBeNull();
  await expect(f.parent.query(batchPreview, { rows: [data] })).rejects.toThrow("Money editing access");
  const receipt: Id<"ledgerEntries"> = await f.actor.mutation(post, { amountCents: data.amountCents, method: data.method, reference: data.reference, occurredAt: data.occurredAt, rowReference: data.rowReference, studentId: f.ids.student, batchReference: "permission-batch", reason: "Synthetic authorized entry", expectedGeneration: 1 });
  await expect(f.parent.query(preview, { sourceEntryId: receipt, targetAmountCents: 80 })).rejects.toThrow("Only a Coach");
  const review = await f.actor.query(preview, { sourceEntryId: receipt, targetAmountCents: 80 });
  await expect(f.actor.mutation(correct, { sourceEntryId: receipt, targetAmountCents: 80, expectedSourceRevision: review.expectedSourceRevision, expectedFinancialRevision: review.expectedFinancialRevision - 1, reason: "Synthetic stale correction", idempotencyKey: "synthetic-stale-key" })).rejects.toThrow("changed");
});

// Edit payment (owner decision November 9, 2026).
async function editFixture() {
  const f = await fixture();
  const more = await f.t.run(async ctx => {
    const account = async (name: string, role: "mentor" | "parent" | "student", travelLead: boolean, financialEdit: boolean) => { const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` }); await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, active: true, travelLead, financialEdit }); return auth; };
    const other = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Second Synthetic", preferredName: "Second", email: "second-student@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ensureFinancialAccount(ctx, other);
    await addCharge(ctx, (await ctx.db.get(f.ids.coach))!, other, "Second synthetic fee", 100, 0, "synthetic-second-fee");
    return { other, tlMoney: await account("synthetic-tl-money", "mentor", true, true), tlPlain: await account("synthetic-tl", "mentor", true, false), mentor: await account("synthetic-mentor", "mentor", false, false), student: await account("synthetic-student-user", "student", false, false) };
  });
  const as = (auth: Id<"users">) => f.t.withIdentity({ subject: `${auth}|session` });
  const receipt: Id<"ledgerEntries"> = await f.actor.mutation(api.paymentAdministration.recordPayment, { studentId: f.ids.student, amountCents: 200, method: "check", reference: "1001", occurredAt: 1, note: "", idempotencyKey: "synthetic-edit-receipt" });
  const expected = async (sourceEntryId: Id<"ledgerEntries"> = receipt) => { const context = await f.actor.query(api.paymentAdministration.editContext, { sourceEntryId }); return { expectedSourceRevision: context.expectedSourceRevision!, expectedEditId: context.expectedEditId }; };
  return { ...f, ...more, as, receipt, expected };
}
it.each([
  ["Coach", "coach", true], ["Travel Lead with Money editing access", "tlMoney", true],
  ["Travel Lead without Money editing access", "tlPlain", false], ["Mentor", "mentor", false], ["Parent", "parent", false], ["Student", "student", false],
] as const)("Edit payment permission: %s", async (_label, who, allowed) => {
  const f = await editFixture();
  const caller = who === "coach" ? f.actor : who === "parent" ? f.parent : f.as(f[who]);
  const edit = caller.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 200, method: "cash", reference: "", reason: "Family paid cash, not check", ...(await f.expected()), idempotencyKey: `perm-${who}` });
  if (allowed) await expect(edit).resolves.toBeTruthy(); else await expect(edit).rejects.toThrow();
  if (!allowed && who !== "student") await expect(edit).rejects.toThrow("Only a Coach or a Travel Lead with Money editing access");
  await f.t.run(async ctx => { const edits = await ctx.db.query("paymentEdits").withIndex("by_sourceEntryId_and_at", q => q.eq("sourceEntryId", f.receipt)).take(5); expect(edits).toHaveLength(allowed ? 1 : 0); });
});
it("Edit payment amount releases and reapplies money, keeps the original receipt and records who, when and why", async () => {
  const f = await editFixture();
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ paidCents: 120, personalAvailableCents: 80 });
  await f.as(f.tlMoney).mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 50, method: "check", reference: "1001", reason: "Check was for fifty cents", ...(await f.expected()), idempotencyKey: "edit-amount" });
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", paidCents: 50, chargedCents: 120, personalAvailableCents: 0 });
  await f.t.run(async ctx => {
    expect((await ctx.db.get(f.receipt))?.amountCents).toBe(200);
    const [edit] = await ctx.db.query("paymentEdits").withIndex("by_sourceEntryId_and_at", q => q.eq("sourceEntryId", f.receipt)).take(5);
    expect(edit).toMatchObject({ reason: "Check was for fifty cents", before: { amountCents: 200 }, after: { amountCents: 50 } });
    expect(edit.summary).toContain("$2.00 → $0.50");
    const audits = await ctx.db.query("audit").take(200); expect(audits.find(row => row.action === "editPayment" && row.entityId === edit._id)).toMatchObject({ reason: "Check was for fifty cents" });
    // One receipt line per edit: the correction's own line carries the summary and reason; no extra paymentEdit line.
    const changes = await ctx.db.query("financeChangeEvents").take(200);
    expect(changes.filter(row => row.kind === "paymentEdit")).toHaveLength(0);
    const corrections = changes.filter(row => row.kind === "paymentCorrection");
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ beforeCents: 200, afterCents: 50, studentId: f.ids.student, meaning: "receipt" });
    expect(corrections[0].reason).toContain("Check was for fifty cents"); expect(corrections[0].reason).toContain("$2.00 → $0.50");
  });
  const list = await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 10, cursor: null } });
  expect(list.page[0]).toMatchObject({ currentAmountCents: 50, originalAmountCents: 200, method: "check", reference: "1001" });
  expect(list.page[0].edits[0]).toMatchObject({ reason: "Check was for fifty cents" });
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 50, method: "check", reference: "1001", reason: "Same details again", ...(await f.expected()), idempotencyKey: "edit-nothing" })).rejects.toThrow("Nothing changed");
});
it("Edit payment moves a payment to another student and balances follow it", async () => {
  const f = await editFixture();
  await f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.other, amountCents: 200, method: "check", reference: "1001", reason: "Entered on the wrong sibling", ...(await f.expected()), idempotencyKey: "edit-move" });
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", paidCents: 0, personalAvailableCents: 0 });
  expect(await f.t.run(ctx => financialAccount(ctx, f.other))).toMatchObject({ state: "ready", paidCents: 100, personalAvailableCents: 100 });
  const list = await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 10, cursor: null } });
  expect(list.page[0]).toMatchObject({ currentAmountCents: 0, movedToName: "Second Synthetic" });
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 100, method: "check", reference: "1001", reason: "Trying to edit the moved one", ...(await f.expected()), idempotencyKey: "edit-moved" })).rejects.toThrow("moved to Second Synthetic");
});
it("a list row keeps its own save id: after removing a saved row, an identical payment that failed is still saved on retry", async () => {
  const f = await fixture();
  const row = { studentId: f.ids.student, amountCents: 200, method: "cash", reference: "", occurredAt: 1, batchReference: "synthetic-list", reason: "Synthetic list of payments", expectedGeneration: 1 };
  const first = await f.actor.mutation(post, { ...row, rowReference: "row-id-a" });
  // Row 2 (identical details) failed, row 1 was removed from the list, and row 2 is now shown first: it keeps its own id.
  const second = await f.actor.mutation(post, { ...row, rowReference: "row-id-b" });
  expect(second).not.toBe(first);
  expect(await f.actor.mutation(post, { ...row, rowReference: "row-id-b" })).toBe(second);
  const payments = await f.t.run(async ctx => (await ctx.db.query("ledgerEntries").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).take(50)).filter(entry => entry.kind === "payment"));
  expect(payments).toHaveLength(2);
});
it("records cash without a check or receipt number, but not checks", async () => {
  const f = await fixture();
  const base = { studentId: f.ids.student, amountCents: 200, occurredAt: 1, note: "", reference: "" };
  await expect(f.actor.mutation(api.paymentAdministration.recordPayment, { ...base, method: "cash", idempotencyKey: "cash-no-number" })).resolves.toBeTruthy();
  await expect(f.actor.mutation(api.paymentAdministration.recordPayment, { ...base, method: "check", idempotencyKey: "check-no-number" })).rejects.toThrow("Enter the check number");
  await expect(f.actor.mutation(api.financeOperations.recordPayout, { studentId: f.ids.student, amountCents: 10, method: "cash", reference: "", occurredAt: 1, reason: "Synthetic cash back", idempotencyKey: "cash-payout-no-number" })).resolves.toBeTruthy();
});

const receiptLines = (f: Awaited<ReturnType<typeof editFixture>>) => f.t.run(async ctx => (await ctx.db.query("financeChangeEvents").take(500)).filter(row => row.meaning === "receipt").map(row => ({ kind: row.kind, studentId: row.studentId })));
it.each([
  ["detail-only edit", "detail", [{ kind: "paymentEdit", on: "student" }]],
  ["amount edit", "amount", [{ kind: "paymentCorrection", on: "student" }]],
  ["move", "move", [{ kind: "paymentCorrection", on: "student" }, { kind: "payment", on: "other" }]],
] as const)("Edit payment adds one Recent changes line per student touched: %s", async (_label, kind, expected) => {
  const f = await editFixture();
  const before = (await receiptLines(f)).length;
  const change = kind === "detail" ? { studentId: f.ids.student, amountCents: 200, method: "cash" as const, reference: "" } : kind === "amount" ? { studentId: f.ids.student, amountCents: 150, method: "check" as const, reference: "1001" } : { studentId: f.other, amountCents: 200, method: "check" as const, reference: "1001" };
  await f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, ...change, reason: "Synthetic edit reason", ...(await f.expected()), idempotencyKey: `lines-${kind}` });
  const added = (await receiptLines(f)).slice(before);
  expect(added).toEqual(expected.map(item => ({ kind: item.kind, studentId: item.on === "student" ? f.ids.student : f.other })));
});
it("Edit payment moves only after the original is zeroed; a stopped move shows on the list and a Travel Lead with Money editing access can try again", async () => {
  vi.useFakeTimers();
  try {
    const f = await editFixture();
    // 45 small fees so zeroing the payment takes more than one background step.
    await f.t.run(async ctx => { const coach = (await ctx.db.get(f.ids.coach))!; for (let index = 0; index < 45; index++) await addCharge(ctx, coach, f.ids.student, `Synthetic small fee ${index}`, 10, index + 1, `synthetic-small-${index}`); });
    const receipt: Id<"ledgerEntries"> = await f.actor.mutation(api.paymentAdministration.recordPayment, { studentId: f.ids.student, amountCents: 450, method: "check", reference: "2002", occurredAt: 1, note: "", idempotencyKey: "synthetic-many-fees" });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    const otherPaymentsBefore = await f.t.run(async ctx => (await ctx.db.query("ledgerEntries").withIndex("by_studentId", q => q.eq("studentId", f.other)).take(50)).filter(row => row.kind === "payment").length);
    await f.as(f.tlMoney).mutation(api.paymentAdministration.editPayment, { sourceEntryId: receipt, studentId: f.other, amountCents: 450, method: "check", reference: "2002", reason: "Entered on the wrong sibling", ...(await f.expected(receipt)), idempotencyKey: "move-many" });
    const otherPayments = () => f.t.run(async ctx => (await ctx.db.query("ledgerEntries").withIndex("by_studentId", q => q.eq("studentId", f.other)).take(50)).filter(row => row.kind === "payment").length);
    // Still zeroing the original: nothing is on the other student yet.
    expect(await otherPayments()).toBe(otherPaymentsBefore);
    // The other student's account can't take the payment when the last step runs, so the move stops.
    await f.t.run(async ctx => { const account = (await financialAccount(ctx, f.other))!; await ctx.db.patch(account._id, { state: "rebuilding" }); });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await otherPayments()).toBe(otherPaymentsBefore);
    const list = async () => (await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 25, cursor: null } })).page.find(row => row.sourceEntryId === receipt)!;
    expect(await list()).toMatchObject({ movedToName: null, pending: { state: "failed", movingToName: "Second Synthetic" } });
    expect((await f.actor.query(api.paymentAdministration.editContext, { sourceEntryId: receipt })).lockedMessage).toContain("Try again");
    await f.t.run(async ctx => { const account = (await financialAccount(ctx, f.other))!; await ctx.db.patch(account._id, { state: "ready" }); });
    await expect(f.as(f.tlPlain).mutation(api.paymentAdministration.retryEdit, { sourceEntryId: receipt })).rejects.toThrow("Only a Coach");
    await f.as(f.tlMoney).mutation(api.paymentAdministration.retryEdit, { sourceEntryId: receipt });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await otherPayments()).toBe(otherPaymentsBefore + 1);
    expect(await list()).toMatchObject({ currentAmountCents: 0, movedToName: "Second Synthetic", pending: null });
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready" });
  } finally { vi.useRealTimers(); }
}, 30_000);
it("Edit payment says what to do when the other student's account isn't prepared, and saves nothing", async () => {
  const f = await editFixture();
  const third = await f.t.run(async ctx => {
    const id = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Third Synthetic", preferredName: "Third", email: "third-student@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ensureFinancialAccount(ctx, id); await addCharge(ctx, (await ctx.db.get(f.ids.coach))!, id, "Third synthetic fee", 100, 0, "synthetic-third-fee");
    await ctx.db.delete((await financialAccount(ctx, id))!._id);
    return id;
  });
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: third, amountCents: 200, method: "check", reference: "1001", reason: "Entered on the wrong student", ...(await f.expected()), idempotencyKey: "move-unprepared" })).rejects.toMatchObject({ data: expect.stringContaining("Third Synthetic's account needs preparing first") });
  await f.t.run(async ctx => { expect(await ctx.db.query("paymentEdits").withIndex("by_sourceEntryId_and_at", q => q.eq("sourceEntryId", f.receipt)).take(5)).toHaveLength(0); });
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", paidCents: 120, personalAvailableCents: 80 });
});
it("shows a payment's check or receipt number only when there is one", async () => {
  const f = await fixture();
  await f.actor.mutation(api.paymentAdministration.recordPayment, { studentId: f.ids.student, amountCents: 200, method: "cash", reference: "", occurredAt: 1, note: "", idempotencyKey: "cash-list" });
  const list = await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 10, cursor: null } });
  expect(list.page[0]).toMatchObject({ method: "cash", reference: "" });
});
it("Edit payment replays a repeated save key only when the details match", async () => {
  const f = await editFixture();
  const command = { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 200, method: "cash" as const, reference: "", reason: "Family paid cash, not check", ...(await f.expected()), idempotencyKey: "replay-key" };
  const first = await f.actor.mutation(api.paymentAdministration.editPayment, command);
  expect(await f.actor.mutation(api.paymentAdministration.editPayment, command)).toBe(first);
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { ...command, amountCents: 100 })).rejects.toThrow("already submitted with different details");
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { ...command, reason: "A different reason entirely" })).rejects.toThrow("already submitted with different details");
});

/** A move whose last step can't finish because the new student's account is busy; the original student is left stopped. */
async function stuckMove(f: Awaited<ReturnType<typeof editFixture>>, change: { method: "cash" | "check" | "other"; reference: string } = { method: "check", reference: "2002" }) {
  await f.t.run(async ctx => { const coach = (await ctx.db.get(f.ids.coach))!; for (let index = 0; index < 45; index++) await addCharge(ctx, coach, f.ids.student, `Synthetic small fee ${index}`, 10, index + 1, `synthetic-small-${index}`); });
  const receipt: Id<"ledgerEntries"> = await f.actor.mutation(api.paymentAdministration.recordPayment, { studentId: f.ids.student, amountCents: 450, method: "check", reference: "2002", occurredAt: 1, note: "", idempotencyKey: "synthetic-many-fees" });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const before = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
  await f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: receipt, studentId: f.other, amountCents: 450, ...change, reason: "Entered on the wrong sibling", ...(await f.expected(receipt)), idempotencyKey: "stuck-move" });
  await f.t.run(async ctx => { const account = (await financialAccount(ctx, f.other))!; await ctx.db.patch(account._id, { state: "rebuilding" }); });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "failed" });
  return { receipt, before: before! };
}
const otherPaymentCount = (f: Awaited<ReturnType<typeof editFixture>>) => f.t.run(async ctx => (await ctx.db.query("ledgerEntries").withIndex("by_studentId", q => q.eq("studentId", f.other)).take(50)).filter(row => row.kind === "payment").length);
it.each(["coach", "tlMoney"] as const)("Cancel this move on a stuck move restores the original student's balance and unblocks the account (%s)", async who => {
  vi.useFakeTimers();
  try {
    const f = await editFixture();
    const { receipt, before } = await stuckMove(f);
    const otherBefore = await otherPaymentCount(f);
    for (const caller of [f.as(f.tlPlain), f.as(f.mentor), f.parent]) await expect(caller.mutation(api.paymentAdministration.cancelEdit, { sourceEntryId: receipt, reason: "Keep it on the first student" })).rejects.toThrow("Only a Coach");
    const caller = who === "coach" ? f.actor : f.as(f.tlMoney);
    await expect(caller.mutation(api.paymentAdministration.cancelEdit, { sourceEntryId: receipt, reason: "short" })).rejects.toThrow("at least 8 characters");
    const cancelId = await caller.mutation(api.paymentAdministration.cancelEdit, { sourceEntryId: receipt, reason: "Second student left the team" });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await f.t.run(ctx => financialAccount(ctx, f.ids.student))).toMatchObject({ state: "ready", paidCents: before.paidCents, chargedCents: before.chargedCents, personalAvailableCents: before.personalAvailableCents });
    expect(await otherPaymentCount(f)).toBe(otherBefore);
    const row = (await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 25, cursor: null } })).page.find(item => item.sourceEntryId === receipt)!;
    expect(row).toMatchObject({ currentAmountCents: 450, movedToName: null, pending: null, method: "check", reference: "2002" });
    expect(row.edits[0]).toMatchObject({ reason: "Second student left the team" }); expect(row.edits[0].summary).toContain("Cancelled the move to Second Synthetic");
    await f.t.run(async ctx => {
      expect((await ctx.db.query("audit").take(500)).find(item => item.action === "cancelPaymentEdit" && item.entityId === cancelId)).toMatchObject({ reason: "Second student left the team" });
      const line = (await ctx.db.query("financeChangeEvents").take(500)).find(item => item.sourceKey === `paymentEdit:${cancelId}`);
      expect(line).toMatchObject({ studentId: f.ids.student, kind: "paymentEdit", deltaCents: 0 }); expect(line?.reason).toContain("Second student left the team");
    });
    // Unblocked: Try again and a second cancel are refused, and the payment can be edited and money returned again.
    await expect(caller.mutation(api.paymentAdministration.retryEdit, { sourceEntryId: receipt })).rejects.toThrow("can't be tried again");
    await expect(caller.mutation(api.paymentAdministration.cancelEdit, { sourceEntryId: receipt, reason: "Cancelling a second time" })).rejects.toThrow("can't be cancelled");
    expect((await f.actor.query(api.paymentAdministration.editContext, { sourceEntryId: receipt })).lockedMessage).toBeNull();
    await expect(f.actor.mutation(api.financeOperations.recordPayout, { studentId: f.ids.student, amountCents: 10, method: "cash", reference: "", occurredAt: 1, reason: "Synthetic cash back", idempotencyKey: "after-cancel-payout" })).resolves.toBeTruthy();
  } finally { vi.useRealTimers(); }
}, 30_000);
it("a stopped edit's new method and number don't show until it finishes", async () => {
  vi.useFakeTimers();
  try {
    const f = await editFixture();
    const { receipt } = await stuckMove(f, { method: "other", reference: "R-9" });
    const row = async () => (await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 25, cursor: null } })).page.find(item => item.sourceEntryId === receipt)!;
    expect(await row()).toMatchObject({ method: "check", reference: "2002", pending: { state: "failed" } });
    expect(await f.actor.query(api.paymentAdministration.editContext, { sourceEntryId: receipt })).toMatchObject({ method: "check", reference: "2002" });
  } finally { vi.useRealTimers(); }
}, 30_000);
it("refuses a method or number change when someone else saved this payment first", async () => {
  const f = await editFixture();
  const opened = await f.expected();
  await f.as(f.tlMoney).mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 200, method: "cash", reference: "", reason: "Family paid cash, not check", ...opened, idempotencyKey: "first-editor" });
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 200, method: "other", reference: "R-1", reason: "Paid by money order instead", ...opened, idempotencyKey: "second-editor" })).rejects.toMatchObject({ data: "Someone else changed this payment. Reload to see the latest, then try again." });
  const list = await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 10, cursor: null } });
  expect(list.page[0]).toMatchObject({ method: "cash", reference: "" });
});
it.each([
  ["an amount change", { amountCents: 150, method: "check", reference: "1001" }, { currentAmountCents: 150, method: "check", reference: "1001" }],
  ["a method change", { amountCents: 200, method: "cash", reference: "" }, { currentAmountCents: 200, method: "cash", reference: "" }],
] as const)("a stale Edit payment form is refused after someone else saves %s", async (_label, change, kept) => {
  const f = await editFixture();
  // Editor A opens the form and keeps what it showed then; editor B saves first.
  const shown = await f.actor.query(api.paymentAdministration.editContext, { sourceEntryId: f.receipt });
  const opened = { expectedSourceRevision: shown.expectedSourceRevision!, expectedEditId: shown.expectedEditId, expectedBefore: { studentId: shown.studentId, amountCents: shown.amountCents, method: shown.method, reference: shown.reference } };
  await f.as(f.tlMoney).mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, ...change, reason: "Editor B fixes the payment", ...(await f.expected()), idempotencyKey: "editor-b" });
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 180, method: "other", reference: "R-1", reason: "Editor A saves an old form", ...opened, idempotencyKey: "editor-a" })).rejects.toMatchObject({ data: expect.stringMatching(/changed this payment|changed since you opened it/) });
  const list = await f.actor.query(api.paymentAdministration.receipts, { studentId: f.ids.student, paginationOpts: { numItems: 10, cursor: null } });
  expect(list.page[0]).toMatchObject(kept);
});
it("refuses an edit whose shown details no longer match the payment", async () => {
  const f = await editFixture();
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 200, method: "cash", reference: "", reason: "Family paid cash, not check", ...(await f.expected()), expectedBefore: { studentId: f.ids.student, amountCents: 250, method: "check", reference: "1001" }, idempotencyKey: "shown-mismatch" })).rejects.toMatchObject({ data: "Someone else changed this payment. Reload to see the latest, then try again." });
});
it("says there is nothing to move when the payment is already $0", async () => {
  const f = await editFixture();
  await f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.ids.student, amountCents: 0, method: "check", reference: "1001", reason: "Recorded by mistake", ...(await f.expected()), idempotencyKey: "zero-first" });
  await expect(f.actor.mutation(api.paymentAdministration.editPayment, { sourceEntryId: f.receipt, studentId: f.other, amountCents: 200, method: "check", reference: "1001", reason: "Move it to the sibling", ...(await f.expected()), idempotencyKey: "zero-move" })).rejects.toMatchObject({ data: "This payment is $0, so there is nothing to move." });
});
