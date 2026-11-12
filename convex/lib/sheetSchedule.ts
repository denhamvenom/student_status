import { chicagoParts } from "./reminderSchedule";

/** Full updates run at 5:00 AM and 6:00 PM Chicago time. The hourly cron acts only in those local hours (DST-safe). */
export const SHEET_UPDATE_HOURS = [5, 18] as const;

export function sheetUpdateDue(nowMs: number): boolean {
  return (SHEET_UPDATE_HOURS as readonly number[]).includes(chicagoParts(nowMs).hour);
}
