import type { SheetKindDefinition } from "../lib/sheetKinds";
import type { SheetTab } from "../lib/sheetRows";
import { centsToDollars } from "../lib/financeRows";

/** One active student's account totals (cents), the same meanings as the finance CSV export. */
export type MoneyBalance = { name: string; chargedCents: number; paidCents: number; personalAppliedCents: number; fundraisingAppliedCents: number; dueCents: number; personalAvailableCents: number; fundraisingAvailableCents: number };
/** One fee on one student's account (cents); `amountCents` is the amount after changes and cancellations. */
export type MoneyFee = { student: string; fee: string; event: string; amountCents: number; paidCents: number; dueCents: number; status: string };
/** A student's share of one fundraiser (cents). */
export type MoneyFundraising = { student: string; fundraiser: string; raisedCents: number; teamCents: number; creditCents: number };
export type Data = { balances: readonly MoneyBalance[]; fees: readonly MoneyFee[]; fundraising: readonly MoneyFundraising[] };

const byText = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
const dollars = centsToDollars;

export function moneyTabs(data: Data): SheetTab[] {
  const balances = [...data.balances].sort((a, b) => byText(a.name, b.name));
  const fees = [...data.fees].sort((a, b) => byText(a.student, b.student) || byText(a.event, b.event) || byText(a.fee, b.fee));
  const fundraising = [...data.fundraising].sort((a, b) => byText(a.student, b.student) || byText(a.fundraiser, b.fundraiser));
  const sum = <T,>(rows: readonly T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return [
    {
      title: "Balances",
      rows: [
        ["Student", "Total fees", "Paid so far", "Paid with payments", "Paid from fundraising credit", "Balance due", "Unused payments", "Fundraising credit", "Available funds"],
        ...balances.map(b => [b.name, dollars(b.chargedCents), dollars(b.paidCents), dollars(b.personalAppliedCents), dollars(b.fundraisingAppliedCents), dollars(b.dueCents), dollars(b.personalAvailableCents), dollars(b.fundraisingAvailableCents), dollars(b.personalAvailableCents + b.fundraisingAvailableCents)]),
        ["Total", dollars(sum(balances, b => b.chargedCents)), dollars(sum(balances, b => b.paidCents)), dollars(sum(balances, b => b.personalAppliedCents)), dollars(sum(balances, b => b.fundraisingAppliedCents)), dollars(sum(balances, b => b.dueCents)), dollars(sum(balances, b => b.personalAvailableCents)), dollars(sum(balances, b => b.fundraisingAvailableCents)), dollars(sum(balances, b => b.personalAvailableCents + b.fundraisingAvailableCents))],
      ],
    },
    {
      title: "Fees",
      rows: [
        ["Student", "Fee", "Event", "Amount", "Paid so far", "Balance due", "Status"],
        ...fees.map(f => [f.student, f.fee, f.event, dollars(f.amountCents), dollars(f.paidCents), dollars(f.dueCents), f.status]),
        ["Total", "", "", dollars(sum(fees, f => f.amountCents)), dollars(sum(fees, f => f.paidCents)), dollars(sum(fees, f => f.dueCents)), ""],
      ],
    },
    {
      title: "Fundraising",
      rows: [
        ["Student", "Fundraiser", "Raised", "Team share", "Fundraising credit"],
        ...fundraising.map(f => [f.student, f.fundraiser, dollars(f.raisedCents), dollars(f.teamCents), dollars(f.creditCents)]),
        ["Total", "", dollars(sum(fundraising, f => f.raisedCents)), dollars(sum(fundraising, f => f.teamCents)), dollars(sum(fundraising, f => f.creditCents))],
      ],
    },
  ];
}

/** Every active student's balance, every fee and every fundraiser share of the season (Money folder). Not built from accounts that are still updating. */
export const definition: SheetKindDefinition<Data> = {
  kind: "money", folder: "money", scope: "team", ready: true, label: "Money",
  title: info => `Money - ${info.seasonName}`,
  build: moneyTabs,
};
