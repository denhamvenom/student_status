import { gradeLabel } from "../../src/lib/rosterSort";

/** A cell is plain text or a number. Writers send text as text, so nothing typed here can become a formula. */
export type SheetCell = string | number;
export type SheetTab = { title: string; rows: SheetCell[][]; note?: string };

/**
 * Text that starts with = + - @ (or a tab or return) would run as a formula if someone downloads the sheet as CSV and opens it in Excel.
 * Such text gets a leading apostrophe: still readable, and never executed.
 * The only exception is text that is entirely a number or phone-like (digits, spaces, parentheses, + - . /), such as "+1 555-0100" or "-5".
 */
export function safeCell(value: SheetCell): SheetCell {
  if (typeof value !== "string" || !/^[=+\-@\t\r]/.test(value)) return value;
  return /^[\d\s()+\-./]+$/.test(value) && /\d/.test(value) && !/^[\t\r]/.test(value) ? value : `'${value}`;
}

const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Apr 5, 2009" for "2009-04-05". Anything that is not a plain ISO date is returned as it is. */
export function dateText(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return iso ?? "";
  return `${monthShort[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

/** Readiness items that are about fees; they live in the Money folder, never in General or Events files. */
export const MONEY_ITEMS: ReadonlySet<string> = new Set(["Required payment", "Season fee maintenance is not complete", "Financial records require review or are updating", "Event financial records require review"]);

/** Guardian details: the confirmed health-and-consent profile wins; otherwise the older fields on the student (same rule as the Coach roster). */
export function guardianFor(student: { consentProfileV2?: { guardian: { name: string; relationship: string; phone: string; email: string } }; consentProfileV2CompletedAt?: number; consentProfileV2ConfirmedBy?: unknown; guardianName?: string; guardianRelationship?: string; guardianPhone?: string; guardianEmail?: string }) {
  const confirmed = student.consentProfileV2CompletedAt !== undefined && student.consentProfileV2ConfirmedBy !== undefined && student.consentProfileV2 !== undefined;
  const profile = confirmed ? student.consentProfileV2 : null;
  return {
    name: profile?.guardian.name ?? student.guardianName ?? null,
    relationship: profile?.guardian.relationship ?? student.guardianRelationship ?? null,
    phone: profile?.guardian.phone ?? student.guardianPhone ?? null,
    email: profile?.guardian.email ?? student.guardianEmail ?? null,
  };
}

/** Grade as the app shows it, or blank when none is saved. */
export const rosterGrade = (grade: string | null | undefined) => (grade?.trim() ? gradeLabel(grade) : "");

/** "Yes" or "No" for a true/false column. */
export const yesNo = (value: boolean) => (value ? "Yes" : "No");
