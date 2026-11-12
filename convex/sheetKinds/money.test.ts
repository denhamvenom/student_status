/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../../testUtils";
import schema from "../schema";
import type { Id } from "../_generated/dataModel";
import { ensureFinancialAccount } from "../lib/financialSources";
import { refreshStudentFinance } from "../lib/financeSummaries";
import { chargeExportRow, centsToDollars, feeStatus } from "../lib/financeRows";
import { definition, moneyTabs, type MoneyBalance } from "./money";

const modules = import.meta.glob("../**/*.ts");
const studentPage = makeFunctionReference<"query">("sheetData/money:studentPage");

describe("Money file", () => {
  it("is a Money team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["money", "team", true, "Money - Synthetic 2027"]);
  });

  it("Balances equal the finance export rows for the same fees", () => {
    const account = { personalAvailableCents: 700, fundraisingAvailableCents: 250, generation: 1, revision: 4 };
    const student = { _id: "s1" as Id<"students">, legalName: "Ann Student", preferredName: "Ann" };
    const fee = (id: string, amountCents: number, appliedCents: number, personal: number, fundraising: number, adjustedCents?: number, cancelledCents?: number) => {
      const effective = amountCents + (adjustedCents ?? 0) - (cancelledCents ?? 0);
      return chargeExportRow({ seasonId: "season" as Id<"seasons">, student, charge: { _id: id as Id<"charges">, label: `Fee ${id}`, amountCents, adjustedCents, cancelledCents, appliedCents }, eventName: id === "c1" ? "Regional" : null, effectiveCents: effective, split: { personalAppliedCents: personal, fundraisingAppliedCents: fundraising }, account, collectedAt: 0 });
    };
    const rows = [fee("c1", 10_000, 6_000, 4_000, 2_000), fee("c2", 2_550, 2_550, 2_550, 0, 50, 50), fee("c3", 3_000, 0, 0, 0)];
    const totals = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
    const balance: MoneyBalance = { name: "Ann Student", chargedCents: totals(r => r.effectiveCents), paidCents: totals(r => r.personalAppliedCents + r.fundraisingAppliedCents), personalAppliedCents: totals(r => r.personalAppliedCents), fundraisingAppliedCents: totals(r => r.fundraisingAppliedCents), dueCents: totals(r => r.dueCents), personalAvailableCents: rows[0].personalAvailableCents, fundraisingAvailableCents: rows[0].fundraisingAvailableCents };
    const [balances, fees] = moneyTabs({ balances: [balance], fees: rows.map(r => ({ student: r.studentName, fee: r.label, event: r.eventName ?? "", amountCents: r.effectiveCents, paidCents: r.effectiveCents - r.dueCents, dueCents: r.dueCents, status: "x" })), fundraising: [] });
    expect(balances.rows[0]).toEqual(["Student", "Total fees", "Paid so far", "Paid with payments", "Paid from fundraising credit", "Balance due", "Unused payments", "Fundraising credit", "Available funds"]);
    expect(balances.rows[1]).toEqual(["Ann Student", 155.5, 85.5, 65.5, 20, 70, 7, 2.5, 9.5]);
    expect(balances.rows[2]).toEqual(["Total", 155.5, 85.5, 65.5, 20, 70, 7, 2.5, 9.5]);
    expect(fees.rows.at(-1)).toEqual(["Total", "", "", 155.5, 85.5, 70, ""]);
    expect(typeof balances.rows[1][1]).toBe("number");
  });

  it("sorts by name, lists fees and fundraising, and writes zero totals for an empty season", () => {
    const [, fees, fundraising] = moneyTabs({
      balances: [],
      fees: [{ student: "Zed", fee: "Shirt", event: "", amountCents: 1_500, paidCents: 0, dueCents: 1_500, status: "Unpaid" }, { student: "Amy", fee: "Dues", event: "", amountCents: 100, paidCents: 100, dueCents: 0, status: "Paid" }],
      fundraising: [{ student: "Amy", fundraiser: "Auction", raisedCents: 5_000, teamCents: 3_000, creditCents: 2_000 }],
    });
    expect(fees.rows.map(r => r[0])).toEqual(["Student", "Amy", "Zed", "Total"]);
    expect(fundraising.rows[1]).toEqual(["Amy", "Auction", 50, 30, 20]);
    expect(moneyTabs({ balances: [], fees: [], fundraising: [] })[0].rows[1]).toEqual(["Total", 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("rounds cents to dollars and names fee statuses", () => {
    expect(centsToDollars(1_999)).toBe(19.99);
    expect([feeStatus(100, 100, 0), feeStatus(100, 40, 0), feeStatus(100, 0, 0), feeStatus(0, 0, 100), feeStatus(0, 0, 0)]).toEqual(["Paid", "Partly paid", "Unpaid", "Canceled", "Paid"]);
  });
});

describe("Money loader gate", () => {
  async function fixture() {
    const t = createTest(schema, modules);
    const ids = await t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "money@example.invalid" });
      const actor = await ctx.db.insert("appUsers", { authUserId: auth, name: "Money Coach", email: "money@example.invalid", role: "coach", active: true, travelLead: false, financialEdit: false });
      const season = await ctx.db.insert("seasons", { name: "Synthetic money", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
      const student = await ctx.db.insert("students", { seasonId: season, legalName: "Ann Student", preferredName: "Ann", email: "ann@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      await ensureFinancialAccount(ctx, student); await refreshStudentFinance(ctx, student);
      return { actor, season, student };
    });
    return { t, ids };
  }
  const read = (f: Awaited<ReturnType<typeof fixture>>) => f.t.query(studentPage, { seasonId: f.ids.season, cursor: null } as never) as Promise<{ balances: MoneyBalance[]; fees: unknown[]; isDone: boolean }>;

  it("reads ready accounts", async () => {
    const f = await fixture();
    const page = await read(f);
    expect(page.isDone).toBe(true);
    expect(page.balances).toEqual([{ name: "Ann Student", chargedCents: 0, paidCents: 0, personalAppliedCents: 0, fundraisingAppliedCents: 0, dueCents: 0, personalAvailableCents: 0, fundraisingAvailableCents: 0 }]);
  });

  it("refuses while shared fee maintenance is running, so the previous file stays", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.insert("seasonFinanceControls", { seasonId: f.ids.season, revision: 1, state: "draining", updatedAt: 0 }));
    await expect(read(f)).rejects.toThrow(/Money is updating/);
  });

  it("refuses while a student's money is still updating", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const account = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique(); if (!account) throw new Error("Account missing");
      await ctx.db.patch(account._id, { state: "rebuilding" });
    });
    await expect(read(f)).rejects.toThrow(/Money is updating/);
  });
});
