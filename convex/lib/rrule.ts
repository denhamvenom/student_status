import { chicagoDate } from "./calendarDates";
import { TEAM_TIME_ZONE, zonedWallTimeToUtc } from "../../shared/chicago-time";
import { addDays, isLocalDate, isLocalTime, validateSeriesRule, weekdayOf, type SeriesRule } from "./seriesRecurrence";

/**
 * SeriesRule <-> RFC 5545 recurrence lines as used by Google Calendar events (`recurrence: string[]`).
 * The master event must use timeZone America/Chicago and start on the series' first occurrence.
 * Only "weekly on chosen days" rules round-trip; anything else is refused with a reason a Coach can read.
 */

const BYDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const SUPPORTED_RRULE_PARTS = new Set(["FREQ", "INTERVAL", "BYDAY", "UNTIL", "COUNT", "WKST"]);
const FREQ_LABELS: Record<string, string> = { SECONDLY: "every second", MINUTELY: "every minute", HOURLY: "hourly", DAILY: "daily", MONTHLY: "monthly", YEARLY: "yearly" };
const PART_LABELS: Record<string, string> = {
  BYSETPOS: "a position within the period (like \"the last weekday\")",
  BYMONTHDAY: "days of the month",
  BYMONTH: "specific months",
  BYYEARDAY: "days of the year",
  BYWEEKNO: "week numbers",
  BYHOUR: "extra hours",
  BYMINUTE: "extra minutes",
  BYSECOND: "extra seconds",
};
const ONLY_WEEKLY = "Only series that repeat weekly on chosen days can be managed here.";

export type GoogleRecurrenceParse = { ok: true; rule: SeriesRule; exdates: string[] } | { ok: false; reason: string };

/** UTC basic format, e.g. 20261103T235959Z. */
export function formatUtcBasic(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

/** Google's id for one instance of a recurring event: masterId + "_" + original start in UTC basic format. */
export function googleInstanceId(masterId: string, startsAtMs: number): string {
  return `${masterId}_${formatUtcBasic(startsAtMs)}`;
}

/**
 * RFC 5545 lines for a series. UNTIL is the last second of the local end date in UTC. WKST=SU is emitted whenever the
 * interval exceeds one week because interval weeks are counted from Sunday-start weeks.
 * `exdates` (local dates) become one EXDATE line in America/Chicago at the series start time.
 */
export function toGoogleRecurrence(rule: SeriesRule, exdates: string[] = []): string[] {
  const parts = ["FREQ=WEEKLY"];
  if (rule.intervalWeeks !== 1) parts.push(`INTERVAL=${rule.intervalWeeks}`);
  parts.push(`BYDAY=${[...new Set(rule.weekdays)].sort((a, b) => a - b).map(day => BYDAY_CODES[day]).join(",")}`);
  if (rule.intervalWeeks !== 1) parts.push("WKST=SU");
  if (rule.endsOnDate !== undefined) parts.push(`UNTIL=${formatUtcBasic(zonedWallTimeToUtc(addDays(rule.endsOnDate, 1), "00:00") - 1000)}`);
  else if (rule.maxOccurrences !== undefined) parts.push(`COUNT=${rule.maxOccurrences}`);
  const lines = [`RRULE:${parts.join(";")}`];
  const excluded = [...new Set(exdates)].sort();
  if (excluded.length > 0) {
    const time = `${rule.startLocalTime.replace(":", "")}00`;
    lines.push(`EXDATE;TZID=${TEAM_TIME_ZONE}:${excluded.map(date => `${date.replace(/-/g, "")}T${time}`).join(",")}`);
  }
  return lines;
}

function basicDate(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function basicTime(value: string): string {
  return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`;
}

function utcFromBasic(value: string): number {
  return Date.parse(`${basicDate(value)}T${basicTime(value.slice(9, 15))}Z`);
}

function fail(reason: string): GoogleRecurrenceParse {
  return { ok: false, reason };
}

type Line = { name: string; params: Map<string, string>; value: string };

function splitLine(raw: string): Line | null {
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const [name, ...paramParts] = raw.slice(0, colon).split(";");
  const params = new Map<string, string>();
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    params.set(part.slice(0, eq).trim().toUpperCase(), part.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1"));
  }
  return { name: name.trim().toUpperCase(), params, value: raw.slice(colon + 1).trim() };
}

/** Local Chicago dates for one EXDATE line, or a reason it can't be read. */
function parseExdateLine(line: Line): string[] | string {
  const tzid = line.params.get("TZID");
  const dates: string[] = [];
  for (const raw of line.value.split(",").map(value => value.trim()).filter(Boolean)) {
    let date: string;
    if (/^\d{8}$/.test(raw)) date = basicDate(raw);
    else if (/^\d{8}T\d{6}Z$/.test(raw)) date = chicagoDate(utcFromBasic(raw));
    else if (/^\d{8}T\d{6}$/.test(raw)) {
      if (!tzid || tzid === TEAM_TIME_ZONE) date = basicDate(raw);
      else {
        try {
          date = chicagoDate(zonedWallTimeToUtc(basicDate(raw), basicTime(raw.slice(9)), tzid));
        } catch {
          return `A skipped date uses an unknown time zone (${tzid}).`;
        }
      }
    } else return `A skipped date (${raw}) couldn't be read.`;
    if (!isLocalDate(date)) return `A skipped date (${raw}) couldn't be read.`;
    dates.push(date);
  }
  return dates;
}

/** Local date of the last allowed occurrence for an UNTIL value, given the series start time. */
function parseUntil(value: string, startTime: string): string | null {
  if (/^\d{8}$/.test(value)) return isLocalDate(basicDate(value)) ? basicDate(value) : null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const until = utcFromBasic(value);
    if (Number.isNaN(until)) return null;
    const date = chicagoDate(until);
    return zonedWallTimeToUtc(date, startTime) > until ? addDays(date, -1) : date;
  }
  if (/^\d{8}T\d{6}$/.test(value)) {
    const date = basicDate(value);
    if (!isLocalDate(date)) return null;
    return value.slice(9) < `${startTime.replace(":", "")}00` ? addDays(date, -1) : date;
  }
  return null;
}

/**
 * Read a Google Calendar event's recurrence lines into a SeriesRule. `start` is the master event's local Chicago start
 * (the first occurrence). Supports FREQ=WEEKLY with INTERVAL, BYDAY (plain days), UNTIL, COUNT and WKST plus EXDATE lines.
 */
export function parseGoogleRecurrence(lines: string[], start: { date: string; time: string }, durationMinutes: number): GoogleRecurrenceParse {
  if (!isLocalDate(start.date) || !isLocalTime(start.time)) return fail("The series start date or time couldn't be read.");
  let rrule: Line | null = null;
  const exdates = new Set<string>();
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const line = splitLine(raw.trim());
    if (!line) return fail(`The repeat rule "${raw.trim()}" couldn't be read.`);
    if (line.name === "RRULE") {
      if (rrule) return fail(`This series combines more than one repeat rule. ${ONLY_WEEKLY}`);
      rrule = line;
    } else if (line.name === "EXDATE") {
      const parsed = parseExdateLine(line);
      if (typeof parsed === "string") return fail(parsed);
      parsed.forEach(date => exdates.add(date));
    } else if (line.name === "RDATE") return fail(`This series adds extra one-off dates. ${ONLY_WEEKLY}`);
    else if (line.name === "EXRULE") return fail(`This series skips dates by a rule. ${ONLY_WEEKLY}`);
    else return fail(`This series uses an unsupported recurrence setting (${line.name}). ${ONLY_WEEKLY}`);
  }
  if (!rrule) return fail("This event has no repeat rule.");

  const parts = new Map<string, string>();
  for (const part of rrule.value.split(";").filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq <= 0) return fail(`The repeat rule "${rrule.value}" couldn't be read.`);
    const key = part.slice(0, eq).trim().toUpperCase();
    if (parts.has(key)) return fail(`The repeat rule repeats ${key}.`);
    parts.set(key, part.slice(eq + 1).trim().toUpperCase());
  }
  const freq = parts.get("FREQ");
  if (!freq) return fail("The repeat rule has no frequency.");
  if (freq !== "WEEKLY") return fail(`This series repeats ${FREQ_LABELS[freq] ?? freq.toLowerCase()}. ${ONLY_WEEKLY}`);
  for (const key of parts.keys()) {
    if (!SUPPORTED_RRULE_PARTS.has(key)) return fail(`This series repeats by ${PART_LABELS[key] ?? key}. ${ONLY_WEEKLY}`);
  }

  const intervalText = parts.get("INTERVAL") ?? "1";
  if (!/^\d+$/.test(intervalText)) return fail("The repeat interval couldn't be read.");
  const intervalWeeks = Number(intervalText);

  let weekdays: number[];
  const byday = parts.get("BYDAY");
  if (byday === undefined) weekdays = [weekdayOf(start.date)];
  else {
    const codes = byday.split(",").map(code => code.trim());
    if (codes.some(code => /^[+-]?\d+[A-Z]{2}$/.test(code))) return fail(`This series repeats on numbered weekdays (like "the first Tuesday"). ${ONLY_WEEKLY}`);
    const days = codes.map(code => BYDAY_CODES.indexOf(code as (typeof BYDAY_CODES)[number]));
    if (codes.length === 0 || days.some(day => day < 0)) return fail("The repeat days couldn't be read.");
    weekdays = [...new Set(days)].sort((a, b) => a - b);
  }
  if (!weekdays.includes(weekdayOf(start.date))) return fail("The series' first meeting isn't on one of its repeat days.");

  const wkstText = parts.get("WKST") ?? "MO";
  const wkst = BYDAY_CODES.indexOf(wkstText as (typeof BYDAY_CODES)[number]);
  if (wkst < 0) return fail("The repeat rule's week start couldn't be read.");
  if (intervalWeeks > 1 && !weekdays.every(day => day >= wkst) && !weekdays.every(day => day < wkst)) {
    return fail("This every-few-weeks series groups its days into weeks differently from this app (its weeks don't start on Sunday). Edit it in Google Calendar or recreate it here.");
  }

  const rule: SeriesRule = { anchorDate: start.date, weekdays, intervalWeeks, startLocalTime: start.time, durationMinutes };
  const until = parts.get("UNTIL");
  const count = parts.get("COUNT");
  if (until !== undefined && count !== undefined) return fail("The repeat rule has both an end date and a meeting count.");
  if (until !== undefined) {
    const endsOnDate = parseUntil(until, start.time);
    if (!endsOnDate) return fail("The series end date couldn't be read.");
    rule.endsOnDate = endsOnDate;
  }
  if (count !== undefined) {
    if (!/^\d+$/.test(count)) return fail("The series meeting count couldn't be read.");
    rule.maxOccurrences = Number(count);
  }
  const errors = validateSeriesRule(rule);
  if (errors.length > 0) return fail(errors.join(" "));
  return { ok: true, rule, exdates: [...exdates].sort() };
}
