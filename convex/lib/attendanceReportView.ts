/*
 * Pure rules for the Student/Parent monthly attendance report (convex/attendanceReport.ts).
 * No database access and no clock: the query passes everything in, and the browser may reuse these
 * helpers to label rows. Keep the wording out of here; src/features/attendance-report/copy.ts owns it.
 */

/** How far past the scheduled start a first clock-in can be before it counts as late. */
export const LATE_GRACE_MS = 15 * 60 * 1000;
/** How far before the scheduled end a last clock-out can be before it counts as leaving early. */
export const EARLY_GRACE_MS = 15 * 60 * 1000;

export type ReportStatus = "neutral" | "missed" | "late" | "early" | "present";
export const REPORT_STATUSES: readonly ReportStatus[] = ["present", "late", "early", "missed", "neutral"];

/**
 * Why a row is gray. `notStarted`: the calendar has the event but no Timeclock session was opened yet
 * (upcoming, or never held). `inProgress`: the session is still open. `cancelled`: the session was
 * cancelled. `underReview`: a Coach must review the session before it counts (Home leaves it out too).
 * `optional`: an optional, Outreach or Build event the Student did not clock in to.
 */
export type NeutralReason = "notStarted" | "inProgress" | "cancelled" | "underReview" | "optional";

export type ReportInterval = { inAt: number; outAt: number };

export type StatusInput = {
  /** null when no Timeclock session exists for the calendar event. */
  sessionState: "open" | "closed" | "cancelled" | null;
  needsReview: boolean;
  required: boolean;
  scheduledStart: number;
  scheduledEnd: number;
  /** Clock intervals after Coach corrections, in any order. */
  intervals: readonly ReportInterval[];
};

export type StatusResult = {
  status: ReportStatus;
  /** Both flags are set when a Student arrived late and left early; status is then "late". */
  late: boolean;
  early: boolean;
  neutralReason: NeutralReason | null;
};

const neutral = (neutralReason: NeutralReason): StatusResult => ({ status: "neutral", late: false, early: false, neutralReason });

/**
 * One event's status. Only closed sessions that are not waiting for Coach review are judged, matching
 * the sessions Home counts as held. Lateness compares the first clock-in with the scheduled start;
 * leaving early compares the last clock-out with the scheduled end, ignoring any extension.
 */
export function eventStatus(input: StatusInput): StatusResult {
  if (input.sessionState === null) return neutral("notStarted");
  if (input.sessionState === "open") return neutral("inProgress");
  if (input.sessionState === "cancelled") return neutral("cancelled");
  if (input.needsReview) return neutral("underReview");
  if (input.intervals.length === 0) return input.required ? { status: "missed", late: false, early: false, neutralReason: null } : neutral("optional");
  const firstIn = Math.min(...input.intervals.map(interval => interval.inAt));
  const lastOut = Math.max(...input.intervals.map(interval => interval.outAt));
  const late = firstIn > input.scheduledStart + LATE_GRACE_MS;
  const early = lastOut < input.scheduledEnd - EARLY_GRACE_MS;
  return { status: late ? "late" : early ? "early" : "present", late, early, neutralReason: null };
}

/** Whole minutes clocked across the intervals; the same flooring Home uses for Build hours. */
export function intervalMinutes(intervals: readonly ReportInterval[]) {
  const totalMs = intervals.reduce((sum, interval) => sum + Math.max(0, interval.outAt - interval.inAt), 0);
  return Math.max(0, Math.floor(totalMs / 60000));
}

export type EventKind = "required" | "build" | "outreach" | "other";

/** Required wins (a Required Build meeting is Required), then Outreach, then Build; everything else is Other. */
export function eventKind(flags: { required: boolean; outreach: boolean; build: boolean }): EventKind {
  return flags.required ? "required" : flags.outreach ? "outreach" : flags.build ? "build" : "other";
}

/** The month a report covers, validated: month is 1–12. */
export function validMonth(year: number, month: number) {
  return Number.isInteger(year) && Number.isInteger(month) && year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

/** The next calendar month. */
export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** The previous calendar month. */
export function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Compare two months: negative when a is earlier. */
export function compareMonths(a: { year: number; month: number }, b: { year: number; month: number }) {
  return a.year === b.year ? a.month - b.month : a.year - b.year;
}
