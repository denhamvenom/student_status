import { gradeLabel } from "../../src/lib/rosterSort";

/** A cell is plain text or a number. Writers send text as text, so nothing typed here can become a formula. */
export type SheetCell = string | number;
export type SheetTab = { title: string; rows: SheetCell[][]; note?: string };

/**
 * Text that starts with = or @ (or a tab or return) would run as a formula if someone downloads the sheet as CSV and opens it in Excel.
 * So would text starting with + or - unless the next character is a digit, a space or "(" (phone numbers such as +1 555... and plain numbers stay clean).
 * Such text gets a leading apostrophe: still readable, and never executed. Numbers and other text are unchanged.
 */
export function safeCell(value: SheetCell): SheetCell {
  return typeof value === "string" && /^(?:[=@\t\r]|[+-](?![\d (]))/.test(value) ? `'${value}` : value;
}

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
