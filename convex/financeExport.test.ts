/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference, type ApiFromModules, type FunctionReturnType } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { addCharges } from "./lib/money";
import { ensureFinancialAccount, recordProjectedEntry } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { csvCell } from "./financeExport";
import type * as exportModule from "./financeExport";
type ExportAPI = ApiFromModules<{ financeExport: typeof exportModule }>["financeExport"];
const modules = import.meta.glob("./**/*.ts");
const prepare = makeFunctionReference<"mutation">("financeExport:prepare");
const process = makeFunctionReference<"mutation">("financeExport:processPage");
const members = makeFunctionReference<"mutation">("financeExport:members");
const charges = makeFunctionReference<"mutation">("financeExport:charges");
const verify = makeFunctionReference<"mutation">("financeExport:verify");
const status = makeFunctionReference<"query">("financeExport:status");
async function fixture(count = 1) {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "export@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, name: "Export Coach", email: "export@example.invalid", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic export", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const students = [];
    for (let i = 0; i < count; i++) { const student = await ctx.db.insert("students", { seasonId: season, legalName: i ? `Member ${i}` : "=FORMULA()", preferredName: i ? `Member ${i}` : "=FORMULA()", email: `export-${i}@example.invalid`, subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }); students.push(student); await ensureFinancialAccount(ctx, student); await refreshStudentFinance(ctx, student); }
    return { auth, actor, season, students };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}
async function finish(f: Awaited<ReturnType<typeof fixture>>, jobId: Id<"financeExportJobs">) {
  for (let i = 0; i < 50; i++) { const job = await f.t.run(ctx => ctx.db.get(jobId)); if (!job || job.state !== "preparing") return; const args = { jobId, cursor: job.cursor }; await f.t.mutation(process, args); await f.t.mutation(process, args); }
  throw new Error("Export fixture did not finish.");
}
describe("scoped financial CSV export", () => {
  it("collects all roster and charge pages with exact source cents and zero-charge member metadata", async () => {
    const f = await fixture(25);
    await f.t.run(async ctx => {
      const actor = await ctx.db.get(f.ids.actor); if (!actor) throw new Error("Actor missing");
      const account = await ensureFinancialAccount(ctx, f.ids.students[0]);
      for (const [kind, amount] of [["payment", 29], ["fundraiser", 16]] as const) { const id = await ctx.db.insert("ledgerEntries", { studentId: account.studentId, kind, amountCents: amount, previousCents: 0, newCents: amount, idempotencyKey: `source:${kind}`, recordedBy: actor._id, recordedAt: Date.now() }); await recordProjectedEntry(ctx, id, account); }
      await addCharges(ctx, actor, account.studentId, Array.from({ length: 45 }, (_, i) => ({ label: i ? `Fee ${i}` : "\t=UNSAFE,\"cell\"\nnext", amountCents: 1, priority: i, idempotencyKey: `export-charge:${i}` })), "export-allocate");
    });
    for (let i = 0; i < 60; i++) {
      const account = await f.t.run(ctx => ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", f.ids.students[0])).unique()); if (!account?.allocationJobId) break;
      const job = await f.t.run(ctx => ctx.db.get(account.allocationJobId!)); if (!job) throw new Error("Missing allocation");
      await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:processPage"), { jobId: job._id, step: job.step });
    }
    const jobId = await f.coach.mutation(prepare, { scope: "allActive", idempotencyKey: "all-active-export" }) as Id<"financeExportJobs">; await finish(f, jobId);
    expect(await f.coach.query(status, { jobId })).toMatchObject({ state: "ready", memberCount: 25, schemaVersion: 1 });
    const allMembers = []; let cursor: string | null = null;
    do { const page: FunctionReturnType<ExportAPI["members"]> = await f.coach.mutation(members, { jobId, paginationOpts: { numItems: 20, cursor } }); allMembers.push(...page.page); cursor = page.isDone ? null : page.continueCursor; } while (cursor);
    expect(allMembers).toHaveLength(25); expect(allMembers.filter(member => member.chargeCount === 0)).toHaveLength(24);
    const allCharges = []; cursor = null;
    do { const page: FunctionReturnType<ExportAPI["charges"]> = await f.coach.mutation(charges, { jobId, studentId: f.ids.students[0], paginationOpts: { numItems: 20, cursor } }); allCharges.push(...page.page); cursor = page.isDone ? null : page.continueCursor; } while (cursor);
    expect(allCharges).toHaveLength(45); expect(allCharges.reduce((sum, row) => sum + row.personalAppliedCents, 0)).toBe(29); expect(allCharges.reduce((sum, row) => sum + row.fundraisingAppliedCents, 0)).toBe(16);
    expect(allCharges[0].csvLine).toContain("'=FORMULA()"); expect(allCharges[0].csvLine).toContain("'\t=UNSAFE,\"\"cell\"\"");
    expect(Object.keys(allCharges[0])).not.toContain("email"); expect(Object.keys(allCharges[0])).not.toContain("allergies");
    expect((await f.coach.mutation(charges, { jobId, studentId: f.ids.students[24], paginationOpts: { numItems: 20, cursor: null } })).page).toEqual([]);
    expect(await f.coach.mutation(prepare, { scope: "allActive", idempotencyKey: "all-active-export" })).toBe(jobId);
  });
  it("rejects foreign scope, changed financial revisions and revoked permission on the final verification page", async () => {
    const f = await fixture(25); const jobId = await f.coach.mutation(prepare, { scope: "selected", studentIds: f.ids.students.slice(0, 24), idempotencyKey: "selected-export" }) as Id<"financeExportJobs">; await finish(f, jobId);
    await expect(f.coach.mutation(charges, { jobId, studentId: f.ids.students[24], paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow("isn't in this export");
    const first = await f.coach.mutation(verify, { jobId, paginationOpts: { numItems: 20, cursor: null } });
    await f.t.run(async ctx => { const account = await ensureFinancialAccount(ctx, f.ids.students[23]); await ctx.db.patch(account._id, { revision: account.revision + 1 }); });
    await expect(f.coach.mutation(verify, { jobId, paginationOpts: { numItems: 20, cursor: first.continueCursor } })).rejects.toThrow("changed after");
    await f.t.run(ctx => ctx.db.patch(f.ids.actor, { active: false }));
    await expect(f.coach.mutation(verify, { jobId, paginationOpts: { numItems: 20, cursor: first.continueCursor } })).rejects.toThrow("inactive");
  });
  it("checks authenticated role, creator and season scope on every endpoint", async () => {
    const f = await fixture(); const jobId = await f.coach.mutation(prepare, { scope: "allActive", idempotencyKey: "role-export" }) as Id<"financeExportJobs">; await finish(f, jobId);
    for (const [role, travelLead, canPrepare] of [["parent", false, false], ["mentor", false, false], ["mentor", true, true], ["coach", false, true]] as const) {
      const auth = await f.t.run(async ctx => { const auth = await ctx.db.insert("users", { email: `${role}-${travelLead}@example.invalid` }); await ctx.db.insert("appUsers", { authUserId: auth, name: "Other", email: `${role}-${travelLead}@example.invalid`, role, travelLead, financialEdit: false, active: true }); return auth; }); const user = f.t.withIdentity({ subject: `${auth}|session` });
      await expect(user.query(status, { jobId })).rejects.toThrow();
      const call = user.mutation(prepare, { scope: "selected", studentIds: f.ids.students, idempotencyKey: "own-export" }); if (canPrepare) expect(await call).toBeTruthy(); else await expect(call).rejects.toThrow("access");
    }
    await f.t.run(ctx => ctx.db.patch(f.ids.season, { status: "archived" })); await expect(f.coach.mutation(members, { jobId, paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow();
  });
  it("preserves native row budgets/split metadata and blocks expanded charge pages before hydration", async () => {
    const f = await fixture(); await f.t.run(async ctx => { const actor = await ctx.db.get(f.ids.actor); if (!actor) throw new Error("Actor"); await addCharges(ctx, actor, f.ids.students[0], Array.from({ length: 45 }, (_, i) => ({ label: `Fee ${i}`, amountCents: 1, priority: i, idempotencyKey: `budget:${i}` })), "budget-allocation"); });
    const jobId = await f.coach.mutation(prepare, { scope: "allActive", idempotencyKey: "budget-export" }) as Id<"financeExportJobs">; await finish(f, jobId); const args = { jobId, studentId: f.ids.students[0] };
    const first = await f.coach.mutation(charges, { ...args, paginationOpts: { numItems: 20, cursor: null } }); const second = await f.coach.mutation(charges, { ...args, paginationOpts: { numItems: 20, cursor: first.continueCursor } });
    await expect(f.coach.mutation(charges, { ...args, paginationOpts: { numItems: 1, cursor: null, endCursor: second.continueCursor, maximumRowsRead: 10000 } })).rejects.toThrow("list couldn't load");
    await expect(f.coach.mutation(charges, { ...args, paginationOpts: { numItems: 20, cursor: null, maximumRowsRead: Number.NaN } })).rejects.toThrow("list couldn't load");
    const small = await f.coach.mutation(charges, { ...args, paginationOpts: { numItems: 20, cursor: null, maximumRowsRead: 2 } }); expect(small.page.length).toBeLessThanOrEqual(2); expect(small).toHaveProperty("pageStatus"); expect(small).toHaveProperty("splitCursor");
    expect(csvCell(" =1+1")).toBe('"\' =1+1"'); expect(csvCell(-1)).toBe('"-1"'); expect(csvCell('a,"b"\n')).toBe('"a,""b""\n"');
  });
});
