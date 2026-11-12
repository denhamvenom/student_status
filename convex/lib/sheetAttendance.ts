import { chicagoParts } from "./reminderSchedule";

/** Pure helpers for the Attendance spreadsheet: Chicago weeks (Monday to Sunday), percentages and hours. */

const isoDay = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);

/** The Monday ("YYYY-MM-DD", Chicago calendar date) of the Chicago week containing `ms`. Works on the local date, so daylight-saving changes never move a meeting to another week. */
export function weekStartKey(ms: number): string {
  const { year, month, day, weekday } = chicagoParts(ms);
  return isoDay(Date.UTC(year, month - 1, day - ((weekday + 6) % 7)));
}

/** Every Monday from `first` to `last` inclusive, so a week with no meetings still gets a column. */
export function weekKeysBetween(first: string, last: string): string[] {
  const keys: string[] = [];
  for (let at = Date.parse(`${first}T00:00:00Z`), end = Date.parse(`${last}T00:00:00Z`); at <= end && keys.length < 120; at += 7 * 86_400_000) keys.push(isoDay(at));
  return keys;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Week of Oct 12, 2026" for the Monday key "2026-10-12". */
export function weekHeader(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return `Week of ${monthNames[month - 1]} ${day}, ${year}`;
}

/** Attended of held as a percent with one decimal (83.3), or blank when nothing was held. */
export function percentCell(attended: number, held: number): number | "" {
  return held > 0 ? Math.round((attended / held) * 1000) / 10 : "";
}

/** Milliseconds as hours with one decimal. */
export function hoursCell(ms: number): number {
  return Math.round((ms / 3_600_000) * 10) / 10;
}
