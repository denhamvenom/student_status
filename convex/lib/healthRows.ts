import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { rosterGrade, type SheetCell } from "./sheetRows";

/**
 * Pure helpers for the Health spreadsheets (the team Health file and each event's Travel emergency file). The data is assembled
 * the way the app does it: `privateStudent` (convex/lib/access.ts) picks the confirmed health-and-consent profile when there is one and the
 * older fields otherwise; the Health export adds date of birth, insurance and physician from that same profile. Nothing else is included.
 */

const report = v.object({ state: v.union(v.literal("unknown"), v.literal("none"), v.literal("reported")), text: v.union(v.string(), v.null()) });
const availability = v.union(v.literal("provided"), v.literal("none"), v.literal("unavailable"));

/** One student's health details as the sheets show them (before wording). */
export const healthStudentValidator = v.object({
  legalName: v.string(), preferredName: v.string(), grade: v.union(v.string(), v.null()), dateOfBirth: v.union(v.string(), v.null()),
  emergencyName: v.union(v.string(), v.null()), emergencyRelationship: v.union(v.string(), v.null()), emergencyPhone: v.union(v.string(), v.null()),
  allergies: report, medications: report, otcAuthorization: v.union(v.literal("yes"), v.literal("contact"), v.literal("no"), v.null()),
  insurance: v.union(v.object({ state: availability, provider: v.union(v.string(), v.null()), policy: v.union(v.string(), v.null()) }), v.null()),
  physician: v.union(v.object({ state: availability, name: v.union(v.string(), v.null()), phone: v.union(v.string(), v.null()) }), v.null()),
});
export type HealthStudent = Infer<typeof healthStudentValidator>;

/** An adult's emergency contact. The app stores no health information for adults, so there is nothing else to show. */
export const healthAdultValidator = v.object({
  name: v.string(), role: v.union(v.literal("Coach"), v.literal("Travel Lead"), v.literal("Mentor")),
  emergencyName: v.union(v.string(), v.null()), emergencyRelationship: v.union(v.string(), v.null()), emergencyPhone: v.union(v.string(), v.null()),
});
export type HealthAdult = Infer<typeof healthAdultValidator>;

type StudentSource = Pick<Doc<"students">, "legalName" | "preferredName" | "emergencyName" | "emergencyRelationship" | "emergencyPhone" | "allergies" | "medications" | "otcAuthorization" | "consentProfileV2" | "consentProfileV2CompletedAt" | "consentProfileV2ConfirmedBy">;

/**
 * Same rule as `privateStudent`: a confirmed health-and-consent profile wins for emergency contact, allergies and medications
 * (medicine permissions are not asked then); otherwise the older fields on the student are used. Date of birth, insurance and physician
 * exist only in the confirmed profile, so they are blank for a student on the older fields.
 */
export function healthStudentFor(student: StudentSource, draftGrade: string | null): HealthStudent {
  const confirmed = student.consentProfileV2CompletedAt !== undefined && student.consentProfileV2ConfirmedBy !== undefined && student.consentProfileV2 !== undefined;
  const profile = confirmed ? student.consentProfileV2! : null;
  const allergies = profile
    ? profile.allergies.state === "none" ? { state: "none" as const, text: null } : { state: "reported" as const, text: profile.allergies.entries.map(item => `${item.allergen}: ${item.severity}; ${item.reaction}; response: ${item.response}`).join("\n") }
    : { state: student.allergies.state, text: student.allergies.text ?? null };
  const medications = profile
    ? profile.prescriptions.state === "none" ? { state: "none" as const, text: null } : { state: "reported" as const, text: profile.prescriptions.entries.map(item => `${item.name} ${item.dose}; ${item.timing}; ${item.reason}; carried by ${item.carriedBy}`).join("\n") }
    : { state: student.medications.state, text: student.medications.text ?? null };
  return {
    legalName: student.legalName, preferredName: student.preferredName, grade: draftGrade ?? profile?.grade ?? null, dateOfBirth: profile?.dateOfBirth ?? null,
    emergencyName: profile?.emergency.name ?? student.emergencyName ?? null, emergencyRelationship: profile?.emergency.relationship ?? student.emergencyRelationship ?? null, emergencyPhone: profile?.emergency.phone ?? student.emergencyPhone ?? null,
    allergies, medications, otcAuthorization: profile ? null : student.otcAuthorization ?? null,
    insurance: profile ? { ...profile.insurance } : null, physician: profile ? { ...profile.physician } : null,
  };
}

/** An adult's role as the app names it (a Parent with Mentor or Travel Lead access counts as that). */
export function adultRoleFor(user: Pick<Doc<"appUsers">, "role" | "travelLead" | "parentStaffAccess">): HealthAdult["role"] {
  if (user.role === "coach") return "Coach";
  return user.travelLead || user.parentStaffAccess === "travelLead" ? "Travel Lead" : "Mentor";
}

type CoverageRow = Pick<Doc<"permissionCoverage">, "state" | "signatureRequestedAt" | "latestSubmissionId" | "latestReviewId" | "sealedSnapshotFormat" | "sealedSnapshotHash" | "versionId" | "source">;

/** The quick part of the app's "permission accepted" test (convex/lib/permissionCoverage.ts): sealed, reviewed, accepted, and no new signature asked. */
export function coverageAccepted(row: CoverageRow): boolean {
  return row.state === "accepted" && row.signatureRequestedAt === undefined && !!row.latestSubmissionId && !!row.latestReviewId
    && (row.sealedSnapshotFormat === 1 || row.sealedSnapshotFormat === 2) && !!row.sealedSnapshotHash && !!row.versionId && !!row.source;
}

/** Wording for one event's permission form. `accepted` should come from the app's full check when the caller has it. */
export function permissionStatusText(row: Pick<CoverageRow, "state" | "signatureRequestedAt"> | null, accepted: boolean, permissionRequired: boolean): string {
  if (!permissionRequired) return "Not required";
  if (accepted) return "Accepted";
  if (row?.signatureRequestedAt !== undefined) return "New signature requested";
  if (row?.state === "pending") return "Waiting for review";
  if (row?.state === "correction") return "Needs correction";
  return "Not signed";
}

const oneLine = (text: string | null) => (text ?? "").replace(/\s*\n\s*/g, "; ").trim();

/** "None reported", "Not provided" or the entries, on one line. */
export function reportText(entry: HealthStudent["allergies"]): string {
  if (entry.state === "none") return "None reported";
  if (entry.state === "unknown") return "Not provided";
  return oneLine(entry.text);
}

export function medicinePermissionText(value: HealthStudent["otcAuthorization"]): string {
  return value === "yes" ? "Yes" : value === "contact" ? "Contact a parent first" : value === "no" ? "No" : "";
}

function availabilityText(state: "provided" | "none" | "unavailable", provided: string | null): string {
  return state === "provided" ? provided ?? "" : state === "none" ? "None reported" : "Information unavailable";
}

export const STUDENT_HEALTH_HEADERS = ["Name", "Grade", "Date of birth", "Emergency contact name", "Emergency contact relationship", "Emergency contact phone", "Allergies", "Medications", "Medicine permissions", "Insurance provider", "Insurance policy number", "Physician name", "Physician phone"];

/** The health columns of one student row (each file adds its permission-form columns after these). */
export function studentHealthCells(student: HealthStudent): SheetCell[] {
  return [
    student.legalName || student.preferredName, rosterGrade(student.grade), student.dateOfBirth ?? "",
    student.emergencyName ?? "", student.emergencyRelationship ?? "", student.emergencyPhone ?? "",
    reportText(student.allergies), reportText(student.medications), medicinePermissionText(student.otcAuthorization),
    student.insurance ? availabilityText(student.insurance.state, student.insurance.provider) : "", student.insurance?.state === "provided" ? student.insurance.policy ?? "" : "",
    student.physician ? availabilityText(student.physician.state, student.physician.name) : "", student.physician?.state === "provided" ? student.physician.phone ?? "" : "",
  ];
}

export const ADULT_HEALTH_HEADERS = ["Name", "Role", "Emergency contact name", "Emergency contact relationship", "Emergency contact phone"];

export function adultHealthCells(adult: HealthAdult): SheetCell[] {
  return [adult.name, adult.role, adult.emergencyName ?? "", adult.emergencyRelationship ?? "", adult.emergencyPhone ?? ""];
}

const byText = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
export const sortStudents = <T extends HealthStudent>(rows: readonly T[]): T[] => [...rows].sort((a, b) => byText(a.legalName || a.preferredName, b.legalName || b.preferredName));
export const sortAdults = (rows: readonly HealthAdult[]): HealthAdult[] => [...rows].sort((a, b) => byText(a.name, b.name));

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
/** "Nov 12, 2026" or "Nov 12, 2026 to Nov 14, 2026" in team time. */
export function eventDateText(startsAt: number, endsAt: number): string {
  const start = dateFormat.format(startsAt).replace(/\s+/g, " "); const end = dateFormat.format(endsAt).replace(/\s+/g, " ");
  return start === end ? start : `${start} to ${end}`;
}
