/**
 * Pure weekly meeting-series math in America/Chicago. No ctx, no db, no schema types.
 *
 * Interval weeks are counted from the Sunday-start week containing `anchorDate`: week 0 is that week, and only weeks whose
 * index is a multiple of `intervalWeeks` repeat. Occurrences never fall before `anchorDate`. Start times follow local wall
 * time, so a 6:00 PM meeting stays at 6:00 PM across DST changes; `endsAt` is `startsAt + durationMinutes`.
 */
import { zonedWallTimeToUtc } from "../../shared/chicago-time";

export type SeriesRule = {
  /** YYYY-MM-DD local date the series starts on (occurrences begin on the first matching weekday on or after it). */
  anchorDate: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** 1..8 */
  intervalWeeks: number;
  /** HH:mm local wall time. */
  startLocalTime: string;
  durationMinutes: number;
  /** Inclusive last local date (UNTIL). */
  endsOnDate?: string;
  /** Total occurrence count from the series start (COUNT). */
  maxOccurrences?: number;
};

export type SeriesOccurrence = {
  /** Local date of the occurrence, YYYY-MM-DD. Stable identity of the occurrence within its series. */
  occurrenceKey: string;
  startsAt: number;
  endsAt: number;
  /** 0-based ordinal from the series start. */
  index: number;
};

export const MAX_OCCURRENCES_PER_QUERY = 200;
export const MAX_SERIES_OCCURRENCES = 104;
export const MAX_INTERVAL_WEEKS = 8;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 720;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------- local date helpers ----------

export function isLocalDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function isLocalTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Days since 1970-01-01 for a YYYY-MM-DD date (calendar arithmetic, no time zone). */
export function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function dateFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

function weekdayOfDay(day: number): number {
  return (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return weekdayOfDay(dayNumber(date));
}

// ---------- validation ----------

export function validateSeriesRule(rule: SeriesRule): string[] {
  const errors: string[] = [];
  const anchorOk = isLocalDate(rule.anchorDate);
  if (!anchorOk) errors.push("Choose a valid start date.");
  if (!Array.isArray(rule.weekdays) || rule.weekdays.length === 0) errors.push("Choose at least one day of the week.");
  else if (rule.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) errors.push("Days of the week must be Sunday through Saturday.");
  else if (new Set(rule.weekdays).size !== rule.weekdays.length) errors.push("Each day of the week can only be chosen once.");
  if (!Number.isInteger(rule.intervalWeeks) || rule.intervalWeeks < 1 || rule.intervalWeeks > MAX_INTERVAL_WEEKS) errors.push(`Repeat every 1 to ${MAX_INTERVAL_WEEKS} weeks.`);
  if (!isLocalTime(rule.startLocalTime)) errors.push("Choose a valid start time.");
  if (!Number.isInteger(rule.durationMinutes) || rule.durationMinutes < MIN_DURATION_MINUTES || rule.durationMinutes > MAX_DURATION_MINUTES) errors.push(`Meetings must last ${MIN_DURATION_MINUTES} minutes to ${MAX_DURATION_MINUTES / 60} hours.`);
  if (rule.endsOnDate !== undefined && rule.maxOccurrences !== undefined) errors.push("End the series on a date or after a number of meetings, not both.");
  if (rule.maxOccurrences !== undefined && (!Number.isInteger(rule.maxOccurrences) || rule.maxOccurrences < 1 || rule.maxOccurrences > MAX_SERIES_OCCURRENCES)) errors.push(`A series can have 1 to ${MAX_SERIES_OCCURRENCES} meetings.`);
  if (rule.endsOnDate !== undefined) {
    if (!isLocalDate(rule.endsOnDate)) errors.push("Choose a valid end date.");
    else if (anchorOk) {
      if (rule.endsOnDate < rule.anchorDate) errors.push("The end date can't be before the start date.");
      else if (rule.endsOnDate > addYears(rule.anchorDate, 1)) errors.push("A series can run for at most one year.");
    }
  }
  return errors;
}

function addYears(date: string, years: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year + years, month - 1, day)).toISOString().slice(0, 10);
}

// ---------- occurrences ----------

type Prepared = { anchor: number; weekStart: number; days: number[]; interval: number; anchorDaysBefore: number };

function prepare(rule: SeriesRule): Prepared | null {
  if (!isLocalDate(rule.anchorDate) || !Number.isInteger(rule.intervalWeeks) || rule.intervalWeeks < 1) return null;
  const days = [...new Set(rule.weekdays)].filter(day => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b);
  if (days.length === 0) return null;
  const anchor = dayNumber(rule.anchorDate);
  const anchorWeekday = weekdayOfDay(anchor);
  return { anchor, weekStart: anchor - anchorWeekday, days, interval: rule.intervalWeeks, anchorDaysBefore: days.filter(day => day < anchorWeekday).length };
}

/** Ordinal of `day` ignoring end conditions, or null when `day` is not on the pattern. */
function patternIndex(prepared: Prepared, day: number): number | null {
  if (day < prepared.anchor) return null;
  const weekday = weekdayOfDay(day);
  if (!prepared.days.includes(weekday)) return null;
  const week = Math.floor((day - prepared.weekStart) / 7);
  if (week % prepared.interval !== 0) return null;
  return (week / prepared.interval) * prepared.days.length - prepared.anchorDaysBefore + prepared.days.filter(d => d < weekday).length;
}

function occurrenceAt(rule: SeriesRule, key: string, index: number): SeriesOccurrence {
  const startsAt = zonedWallTimeToUtc(key, rule.startLocalTime);
  return { occurrenceKey: key, startsAt, endsAt: startsAt + rule.durationMinutes * MINUTE_MS, index };
}

/** 0-based ordinal of the occurrence on `occurrenceKey`, or null when the series has no occurrence that day. */
export function occurrenceIndex(rule: SeriesRule, occurrenceKey: string): number | null {
  const prepared = prepare(rule);
  if (!prepared || !isLocalDate(occurrenceKey)) return null;
  if (rule.endsOnDate !== undefined && occurrenceKey > rule.endsOnDate) return null;
  const index = patternIndex(prepared, dayNumber(occurrenceKey));
  if (index === null || (rule.maxOccurrences !== undefined && index >= rule.maxOccurrences)) return null;
  return index;
}

/**
 * Occurrences whose local date is in [fromDate, toDateExclusive), in order, honoring endsOnDate/maxOccurrences.
 * Returns at most `limit` (capped at 200) occurrences; page by passing the day after the last key as the next `fromDate`.
 */
export function occurrencesBetween(rule: SeriesRule, fromDate: string, toDateExclusive: string, limit: number = MAX_OCCURRENCES_PER_QUERY): SeriesOccurrence[] {
  const prepared = prepare(rule);
  if (!prepared || !isLocalDate(fromDate) || !isLocalDate(toDateExclusive)) return [];
  const cap = Math.max(0, Math.min(limit, MAX_OCCURRENCES_PER_QUERY));
  let end = dayNumber(toDateExclusive);
  if (rule.endsOnDate !== undefined && isLocalDate(rule.endsOnDate)) end = Math.min(end, dayNumber(rule.endsOnDate) + 1);
  const out: SeriesOccurrence[] = [];
  for (let day = Math.max(dayNumber(fromDate), prepared.anchor); day < end && out.length < cap; day++) {
    const index = patternIndex(prepared, day);
    if (index === null) continue;
    if (rule.maxOccurrences !== undefined && index >= rule.maxOccurrences) break;
    out.push(occurrenceAt(rule, dateFromDayNumber(day), index));
  }
  return out;
}

/** The first occurrence of the series (what a Google master event's start should be), or null for an empty series. */
export function firstOccurrence(rule: SeriesRule): SeriesOccurrence | null {
  if (!isLocalDate(rule.anchorDate)) return null;
  const interval = Number.isInteger(rule.intervalWeeks) && rule.intervalWeeks > 0 ? rule.intervalWeeks : 1;
  return occurrencesBetween(rule, rule.anchorDate, addDays(rule.anchorDate, 7 * interval + 7), 1)[0] ?? null;
}

/**
 * Split a series at one of its occurrences ("this and following").
 * `before` ends the day before the split (null when the split is the first occurrence); `after` is anchored on the split
 * date and keeps the original end date, or the remaining meeting count for COUNT series. The interval phase is preserved
 * because the split date's week is always a repeating week.
 */
export function splitRuleAt(rule: SeriesRule, occurrenceKey: string): { before: SeriesRule | null; after: SeriesRule } {
  const index = occurrenceIndex(rule, occurrenceKey);
  if (index === null) throw new Error("That date isn't a meeting in this series.");
  const { endsOnDate, maxOccurrences, ...base } = rule;
  const before: SeriesRule | null = index === 0 ? null : { ...base, endsOnDate: addDays(occurrenceKey, -1) };
  const after: SeriesRule = { ...base, anchorDate: occurrenceKey };
  if (endsOnDate !== undefined) after.endsOnDate = endsOnDate;
  if (maxOccurrences !== undefined) after.maxOccurrences = maxOccurrences - index;
  return { before, after };
}
