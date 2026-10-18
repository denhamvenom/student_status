export type RetentionSubjectKind = "student" | "account";

/** Date.UTC normalizes a Feb 29 anniversary in a non-leap year to Mar 1. */
export function fiveCalendarYearsAfter(archivedAt: number): number {
  if (!Number.isFinite(archivedAt) || archivedAt < 0) throw new Error("Archive date is invalid.");
  const date = new Date(archivedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Archive date is invalid.");
  const anniversary = new Date(date.getTime());
  anniversary.setUTCFullYear(date.getUTCFullYear() + 5);
  return anniversary.getTime();
}

export function reviewThreshold(archivedAt: number | undefined, asOf: number) {
  if (archivedAt === undefined || !Number.isFinite(archivedAt) || archivedAt < 0) return { reviewAfter: null, reached: false };
  const reviewAfter = fiveCalendarYearsAfter(archivedAt);
  return { reviewAfter, reached: Number.isFinite(asOf) && asOf >= reviewAfter };
}

export function archiveFingerprint(kind: RetentionSubjectKind, subjectId: string, active: boolean, archivedAt: number | null, linkedAccount?: { _id: string; active: boolean; archivedAt?: number } | null) {
  return JSON.stringify([kind, subjectId, active, archivedAt, linkedAccount === undefined ? "not-applicable" : linkedAccount === null ? "no-linked-account" : [linkedAccount._id, linkedAccount.active, linkedAccount.archivedAt ?? null]]);
}

export const affectedRecordClasses = [
  "Account and profile records",
  "Family links and invitations",
  "Participation, attendance, travel and rooming records",
  "Financial sources, charges, allocations and audit evidence",
  "Permission, health and consent evidence",
] as const;
