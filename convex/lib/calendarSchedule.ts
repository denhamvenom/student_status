/** Chicago's 06:00 and 15:00 slots use these UTC candidates across DST. */
export const CALENDAR_REFRESH_UTC_HOURS = [11, 12, 20, 21] as const;
export const CALENDAR_REFRESH_GRACE_MS = 5 * 60_000;
const chicagoClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Accept delayed cron execution within its intended local hour. */
export function isCalendarRefreshSlot(now: number): boolean {
  const parts = chicagoClock.formatToParts(new Date(now));
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  return hour === 6 || hour === 15;
}

/** Most recent scheduled instant, including a slot exactly at now. */
export function latestCalendarRefreshSlot(now: number): number {
  const date = new Date(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  let latest = -Infinity;
  for (let day = 0; day >= -2; day--) {
    for (const hour of CALENDAR_REFRESH_UTC_HOURS) {
      const candidate = midnight + day * 86_400_000 + hour * 3_600_000;
      if (candidate <= now && candidate > latest && isCalendarRefreshSlot(candidate)) latest = candidate;
    }
  }
  return latest;
}

export function calendarSyncStale({ now, configured, lastSuccessAt, error }: {
  now: number; configured: boolean; lastSuccessAt: number | null | undefined; error: unknown;
}): boolean {
  return !configured || !!error || lastSuccessAt == null || lastSuccessAt < latestCalendarRefreshSlot(now - CALENDAR_REFRESH_GRACE_MS);
}
