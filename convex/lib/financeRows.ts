import type { Doc, Id } from "../_generated/dataModel";

/** Columns of the finance CSV export (cents). The Money spreadsheet's Balances tab carries the same amounts, in dollars. */
export const CSV_COLUMNS = ["Season ID", "Student ID", "Student", "Charge ID", "Charge", "Event", "Original cents", "Adjusted cents", "Canceled cents", "Effective cents", "Personal applied cents", "Fundraising applied cents", "Due cents", "Personal available cents (non-additive)", "Fundraising available cents (non-additive)", "Financial generation", "Financial revision", "Collected at"];

/** Quote every cell and neutralize spreadsheet formulas in text, preserving numeric cents. */
export function csvCell(value: string | number) {
  const text = String(value); let start = 0;
  while (start < text.length && (text.charCodeAt(start) <= 32 || /\s/u.test(text[start]))) start++;
  const safe = typeof value === "string" && /^[=+@-]/u.test(text.slice(start)) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Whole cents as dollars with two decimals, as a number (spreadsheets sum numbers, not text). */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

type ChargeRowInput = {
  seasonId: Id<"seasons">;
  student: Pick<Doc<"students">, "_id" | "legalName" | "preferredName">;
  charge: Pick<Doc<"charges">, "_id" | "label" | "amountCents" | "adjustedCents" | "cancelledCents" | "appliedCents">;
  eventName: string | null;
  effectiveCents: number;
  split: { personalAppliedCents: number; fundraisingAppliedCents: number };
  account: Pick<Doc<"financialAccounts">, "personalAvailableCents" | "fundraisingAvailableCents" | "generation" | "revision">;
  collectedAt: number;
};

/** One fee of one student as the finance CSV export reports it (cents). */
export function chargeExportRow(input: ChargeRowInput) {
  const { charge, student, account } = input;
  return { seasonId: input.seasonId, studentId: student._id, studentName: student.legalName || student.preferredName, chargeId: charge._id, label: charge.label, eventName: input.eventName, originalCents: charge.amountCents, adjustedCents: charge.adjustedCents ?? 0, cancelledCents: charge.cancelledCents ?? 0, effectiveCents: input.effectiveCents, ...input.split, dueCents: input.effectiveCents - charge.appliedCents, personalAvailableCents: account.personalAvailableCents, fundraisingAvailableCents: account.fundraisingAvailableCents, generation: account.generation, financialRevision: account.revision, collectedAt: input.collectedAt };
}
export type ChargeExportRow = ReturnType<typeof chargeExportRow>;

/** The CSV cells of one export row, in CSV_COLUMNS order. */
export function chargeExportCells(row: ChargeExportRow): (string | number)[] {
  return [row.seasonId, row.studentId, row.studentName, row.chargeId, row.label, row.eventName ?? "", row.originalCents, row.adjustedCents, row.cancelledCents, row.effectiveCents, row.personalAppliedCents, row.fundraisingAppliedCents, row.dueCents, row.personalAvailableCents, row.fundraisingAvailableCents, row.generation, row.financialRevision, row.collectedAt];
}

/** Plain status of one fee for the Money spreadsheets: Paid, Partly paid, Unpaid, or Canceled (everything was canceled). */
export function feeStatus(effectiveCents: number, appliedCents: number, cancelledCents: number): "Paid" | "Partly paid" | "Unpaid" | "Canceled" {
  if (effectiveCents <= 0) return cancelledCents > 0 ? "Canceled" : "Paid";
  if (appliedCents >= effectiveCents) return "Paid";
  return appliedCents > 0 ? "Partly paid" : "Unpaid";
}
