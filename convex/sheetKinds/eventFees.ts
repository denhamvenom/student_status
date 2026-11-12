import type { SheetKindDefinition } from "../lib/sheetKinds";
import type { SheetTab } from "../lib/sheetRows";
import { eventKindTitle } from "../lib/sheetEvents";
import { centsToDollars } from "../lib/financeRows";

/** A fee set up for the event (what it costs per student). */
export type EventFeeDefinition = { id: string; fee: string; kind: "eventMain" | "eventExtra" | "custom"; amountCents: number; canceled: boolean };
/** One fee on one student's account for this event (cents); `amountCents` is after changes and cancellations. */
export type EventFeeCharge = { studentId: string; student: string; feeId: string | null; amountCents: number; paidCents: number };
export type EventFeeParticipant = { studentId: string; student: string; status: "pending" | "confirmed" | "waitlist" | "withdrawn" };
export type Data = { definitions: readonly EventFeeDefinition[]; charges: readonly EventFeeCharge[]; participants: readonly EventFeeParticipant[] };

const byText = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
const dollars = centsToDollars;
const KIND = { eventMain: "Main fee", eventExtra: "Extra fee", custom: "Other fee" } as const;
const STATUS = { confirmed: "Confirmed", pending: "Pending", waitlist: "Waitlist", withdrawn: "Withdrawn" } as const;
const sum = <T,>(rows: readonly T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

export function eventFeeTabs(data: Data): SheetTab[] {
  const fees = [...data.definitions].sort((a, b) => Number(a.canceled) - Number(b.canceled) || byText(a.fee, b.fee));
  const people = new Map<string, { student: string; status: string; charged: number; paid: number }>();
  for (const p of data.participants) people.set(p.studentId, { student: p.student, status: STATUS[p.status], charged: 0, paid: 0 });
  for (const c of data.charges) {
    const row = people.get(c.studentId) ?? { student: c.student, status: "", charged: 0, paid: 0 };
    row.charged += c.amountCents; row.paid += c.paidCents; people.set(c.studentId, row);
  }
  const students = [...people.values()].sort((a, b) => byText(a.student, b.student));
  return [
    {
      title: "Fees",
      rows: [
        ["Fee", "Type", "Amount per student", "Status", "Students charged", "Total charged", "Paid so far", "Balance due"],
        ...fees.map(f => {
          const own = data.charges.filter(c => c.feeId === f.id);
          const charged = sum(own, c => c.amountCents), paid = sum(own, c => c.paidCents);
          return [f.fee, KIND[f.kind], dollars(f.amountCents), f.canceled ? "Canceled" : "Active", own.length, dollars(charged), dollars(paid), dollars(charged - paid)];
        }),
        ["Total", "", "", "", data.charges.length, dollars(sum(data.charges, c => c.amountCents)), dollars(sum(data.charges, c => c.paidCents)), dollars(sum(data.charges, c => c.amountCents - c.paidCents))],
      ],
    },
    {
      title: "Students",
      rows: [
        ["Student", "Status", "Total fees", "Paid so far", "Balance due"],
        ...students.map(s => [s.student, s.status, dollars(s.charged), dollars(s.paid), dollars(s.charged - s.paid)]),
        ["Total", "", dollars(sum(students, s => s.charged)), dollars(sum(students, s => s.paid)), dollars(sum(students, s => s.charged - s.paid))],
      ],
    },
  ];
}

/** What each student owes and has paid for one event, and the fees set up for it (Money folder). */
export const definition: SheetKindDefinition<Data> = {
  kind: "eventFees", folder: "money", scope: "event", ready: true, label: "Event fees",
  title: info => eventKindTitle(info, "Fees"),
  build: eventFeeTabs,
};
