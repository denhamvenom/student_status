import { gradeLabel } from "../../src/lib/rosterSort";
import { subteamDisplay } from "../../src/lib/subteams";

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

export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;

export type ShirtPerson = { name: string; type: "Student" | "Adult"; subteam: string; size: string | null | undefined };

const byTypeThenName = (a: ShirtPerson, b: ShirtPerson) =>
  (a.type === b.type ? 0 : a.type === "Adult" ? -1 : 1) || a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

/** Shirt size workbook: Counts, Details and Missing size (adults are Coaches, Mentors and Parents with Mentor or Travel Lead access). Sizes outside the app's list are counted as "Other" and shown as entered. */
export function shirtSizeTabs(people: readonly ShirtPerson[]): SheetTab[] {
  const sorted = [...people].sort(byTypeThenName);
  const sized = sorted.filter(person => person.size?.trim());
  const missing = sorted.filter(person => !person.size?.trim());
  const known: readonly string[] = SHIRT_SIZES;
  const bucket = (size: string) => (known.includes(size.trim()) ? size.trim() : "Other");
  const tally = (label: string) => {
    const group = sized.filter(person => bucket(person.size!) === label);
    const students = group.filter(person => person.type === "Student").length;
    const mentors = group.length - students;
    return [label, students, mentors, group.length] as SheetCell[];
  };
  const counts = [...SHIRT_SIZES, "Other"].map(tally);
  const totals: SheetCell[] = ["Total", 0, 0, 0];
  for (const row of counts) for (let index = 1; index < 4; index++) totals[index] = (totals[index] as number) + (row[index] as number);
  return [
    { title: "Counts", rows: [["Size", "Students", "Adults", "Total"], ...counts, totals] },
    { title: "Details", rows: [["Name", "Student or adult", "Subteam", "Size"], ...sized.map(person => [person.name, person.type, person.subteam, person.size!.trim()])] },
    { title: "Missing size", rows: [["Name", "Student or adult", "Subteam"], ...missing.map(person => [person.name, person.type, person.subteam])] },
  ];
}

export type RosterStudent = {
  preferredName: string; legalName: string; grade: string | null | undefined; subteam: string; secondarySubteam: string | null | undefined;
  leadership: boolean; travelTeam: boolean; email: string; guardianName: string | null; guardianRelationship: string | null; guardianPhone: string | null; guardianEmail: string | null;
  parentAccounts: string[];
};

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

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export function studentRosterTabs(students: readonly RosterStudent[]): SheetTab[] {
  const sorted = [...students].sort((a, b) => (a.legalName || a.preferredName).localeCompare(b.legalName || b.preferredName, "en", { sensitivity: "base", numeric: true }));
  return [{
    title: "Students",
    rows: [
      ["Preferred name", "Legal name", "Grade", "Subteam", "Second subteam", "Leadership role", "Travel Team", "Student email", "Parent or guardian name", "Parent or guardian relationship", "Parent or guardian phone", "Parent or guardian email", "Parent accounts (linked)"],
      ...sorted.map(student => [student.preferredName, student.legalName, rosterGrade(student.grade), subteamDisplay(student.subteam), student.secondarySubteam ? subteamDisplay(student.secondarySubteam) : "", yesNo(student.leadership), yesNo(student.travelTeam), student.email, student.guardianName ?? "", student.guardianRelationship ?? "", student.guardianPhone ?? "", student.guardianEmail ?? "", student.parentAccounts.join("; ")]),
    ],
  }];
}
