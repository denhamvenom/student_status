import { REPORTING_TIME_ZONE } from "./seasonCalendar";

/** Pure timing rules for scheduled reminders and the daily digest. All wall-clock rules use America/Chicago. */
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const DIGEST_HOUR = 17;
export const R1_HOUR = 18;
export const R2_HOUR = 17;
export const R2_DAYS_BEFORE = [3, 1] as const;
export const R6_HOUR = 17;
export const R7_HOUR = 10;
/** R3/R4/R5 fire on the first hourly run when the deadline is at most this far away… */
export const DEADLINE_LEAD_MS = 48 * HOUR_MS;
/** …unless less than this was left when first seen (no last-minute "48 hours left" message). */
export const DEADLINE_MIN_LEAD_MS = 24 * HOUR_MS;
/** R6 biweekly parity counts whole weeks from this Monday (Chicago date). */
export const R6_ANCHOR_MONDAY = "2026-01-05";
export const R6_DUE_SOON_MS = 7 * DAY_MS;

export type ReminderKind = "r1EventTomorrow" | "r2PermissionMissing" | "r3SignupCloses" | "r4RoomingDeadline" | "r5RequirementDue" | "r6UnpaidBalance" | "r7SetupUnfinished";

const formatter = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TIME_ZONE, weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function chicagoParts(ms: number) {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(ms))) parts[part.type] = part.value;
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday: WEEKDAYS.indexOf(parts.weekday) };
}

/** "YYYY-MM-DD" for the Chicago calendar date `offsetDays` after the date containing `ms`. */
export function chicagoDateKey(ms: number, offsetDays = 0): string {
  const { year, month, day } = chicagoParts(ms);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

/** The instant of local midnight starting a Chicago calendar date (DST-safe). */
export function chicagoMidnight(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day);
  let guess = wall + 6 * HOUR_MS;
  for (let i = 0; i < 3; i++) {
    const p = chicagoParts(guess);
    guess += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return guess;
}

/** [start, end) of the Chicago calendar date `offsetDays` after today; 23 or 25 hours long across DST changes. */
export function chicagoDayWindow(nowMs: number, offsetDays: number): { start: number; end: number; dateKey: string } {
  const dateKey = chicagoDateKey(nowMs, offsetDays);
  return { start: chicagoMidnight(dateKey), end: chicagoMidnight(chicagoDateKey(chicagoMidnight(dateKey) + 12 * HOUR_MS, 1)), dateKey };
}

export function digestDue(nowMs: number): boolean {
  return chicagoParts(nowMs).hour === DIGEST_HOUR;
}

/** Which reminders the hourly cron starts at `nowMs`. */
export function remindersDue(nowMs: number): ReminderKind[] {
  const { hour, weekday } = chicagoParts(nowMs);
  const due: ReminderKind[] = ["r3SignupCloses", "r4RoomingDeadline", "r5RequirementDue"];
  if (hour === R1_HOUR) due.push("r1EventTomorrow");
  if (hour === R2_HOUR) due.push("r2PermissionMissing");
  if (weekday === 1 && hour === R6_HOUR) due.push("r6UnpaidBalance");
  if (weekday === 6 && hour === R7_HOUR) due.push("r7SetupUnfinished");
  return due;
}

/** Deadline reminders (R3/R4/R5): true while the deadline is more than 24h and at most 48h away. */
export function deadlineReminderDue(nowMs: number, deadlineMs: number): boolean {
  const left = deadlineMs - nowMs;
  return left > DEADLINE_MIN_LEAD_MS && left <= DEADLINE_LEAD_MS;
}

/** Whole weeks between the anchor Monday and the Chicago date of `nowMs` is even. */
export function isR6ParityMonday(nowMs: number): boolean {
  const days = Math.round((Date.parse(`${chicagoDateKey(nowMs)}T00:00:00Z`) - Date.parse(`${R6_ANCHOR_MONDAY}T00:00:00Z`)) / DAY_MS);
  return Math.floor(days / 7) % 2 === 0;
}

/** R6: every other Monday, or any Monday when an unpaid charge is due within the next seven days. */
export function shouldSendUnpaidReminder(nowMs: number, unpaidDueAts: (number | undefined)[]): boolean {
  return isR6ParityMonday(nowMs) || unpaidDueAts.some(dueAt => dueAt !== undefined && dueAt >= nowMs && dueAt <= nowMs + R6_DUE_SOON_MS);
}

const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });

export function formatChicagoTime(ms: number): string {
  return timeFormatter.format(new Date(ms));
}

export function formatChicagoDay(ms: number): string {
  return dayFormatter.format(new Date(ms));
}
