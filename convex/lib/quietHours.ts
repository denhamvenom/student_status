import { TEAM_TIME_ZONE, zonedWallTimeToUtc } from "../../shared/chicago-time";

// Pushes that are not urgent wait until 4:00 PM Central on school days.
export const QUIET_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
export const QUIET_START_MINUTES = 7 * 60 + 30;
export const QUIET_END_MINUTES = 16 * 60;

const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TEAM_TIME_ZONE, weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });

function zonedParts(ms: number) {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(ms))) parts[part.type] = part.value;
  return { weekday: parts.weekday, year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isQuietHours(nowMs: number): boolean {
  const { weekday, minutes } = zonedParts(nowMs);
  return QUIET_DAYS.has(weekday) && minutes >= QUIET_START_MINUTES && minutes < QUIET_END_MINUTES;
}

/** The instant at which wall-clock `minutes` occurs on the given reporting-zone date (handles DST offsets). */
function zonedInstant(year: number, month: number, day: number, minutes: number) {
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return zonedWallTimeToUtc(date, `${Math.floor(minutes / 60)}:${minutes % 60}`);
}

/** When quiet hours end; returns nowMs when it is not currently quiet. */
export function nextQuietHoursEnd(nowMs: number): number {
  if (!isQuietHours(nowMs)) return nowMs;
  const { year, month, day } = zonedParts(nowMs);
  return zonedInstant(year, month, day, QUIET_END_MINUTES);
}
