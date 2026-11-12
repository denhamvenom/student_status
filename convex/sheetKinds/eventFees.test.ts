import { describe, expect, it } from "vitest";
import { definition, eventFeeTabs, type Data } from "./eventFees";

const data: Data = {
  definitions: [
    { id: "f2", fee: "Hotel", kind: "eventExtra", amountCents: 5_000, canceled: false },
    { id: "f1", fee: "Registration", kind: "eventMain", amountCents: 10_000, canceled: false },
    { id: "f3", fee: "Old shirt", kind: "custom", amountCents: 1_000, canceled: true },
  ],
  charges: [
    { studentId: "b", student: "Bo Student", feeId: "f1", amountCents: 10_000, paidCents: 10_000 },
    { studentId: "a", student: "Ann Student", feeId: "f1", amountCents: 10_000, paidCents: 2_500 },
    { studentId: "a", student: "Ann Student", feeId: "f2", amountCents: 5_000, paidCents: 0 },
    { studentId: "x", student: "Gone Student", feeId: null, amountCents: 1_999, paidCents: 0 },
  ],
  participants: [{ studentId: "a", student: "Ann Student", status: "confirmed" }, { studentId: "b", student: "Bo Student", status: "withdrawn" }, { studentId: "c", student: "Cy Student", status: "waitlist" }],
};

describe("event fees rows", () => {
  const [fees, students] = eventFeeTabs(data);
  it("lists fee settings with what was charged under each, active first, and a totals row", () => {
    expect(fees.title).toBe("Fees");
    expect(fees.rows[0]).toEqual(["Fee", "Type", "Amount per student", "Status", "Students charged", "Total charged", "Paid so far", "Balance due"]);
    expect(fees.rows.slice(1, 4)).toEqual([
      ["Hotel", "Extra fee", 50, "Active", 1, 50, 0, 50],
      ["Registration", "Main fee", 100, "Active", 2, 200, 125, 75],
      ["Old shirt", "Other fee", 10, "Canceled", 0, 0, 0, 0],
    ]);
    expect(fees.rows[4]).toEqual(["Total", "", "", "", 3, 269.99, 125, 144.99]);
  });
  it("adds up each student's fees, includes students without fees and fees without a setting, and totals match", () => {
    expect(students.rows[0]).toEqual(["Student", "Status", "Total fees", "Paid so far", "Balance due"]);
    expect(students.rows.slice(1)).toEqual([
      ["Ann Student", "Confirmed", 150, 25, 125],
      ["Bo Student", "Withdrawn", 100, 100, 0],
      ["Cy Student", "Waitlist", 0, 0, 0],
      ["Gone Student", "", 19.99, 0, 19.99],
      ["Total", "", 269.99, 125, 144.99],
    ]);
  });
  it("still builds both tabs with no data", () => {
    expect(eventFeeTabs({ definitions: [], charges: [], participants: [] }).map(tab => tab.rows.length)).toEqual([2, 2]);
  });
});

describe("event fees file", () => {
  it("is a Money event file named after the event", () => {
    const event = { name: "Synthetic Regional", startsAt: Date.UTC(2027, 2, 5, 18) };
    expect([definition.folder, definition.scope, definition.ready]).toEqual(["money", "event", true]);
    expect(definition.title({ seasonName: "Synthetic 2027", event })).toContain("Synthetic Regional");
    expect(definition.title({ seasonName: "Synthetic 2027", event })).toMatch(/ - Fees$/);
  });
});
