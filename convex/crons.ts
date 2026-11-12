import { cronJobs, makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("archive past events", { minutes: 1 }, internal.eventArchive.sweep, {});
crons.cron("refresh team calendar", "0 11,12,20,21 * * *", internal.calendar.scheduledRefresh, {});
crons.cron("sync Zeffy donations", "0 0,1,12,13 * * *", internal.zeffyActions.scheduledRun, {});
crons.cron("extend recurring meetings", "15 10 * * *", internal.eventSeries.tick, { cursor: null });
crons.cron("delete old notifications", "30 9 * * *", internal.notifications.purgeOld, {});
// Hourly; each handler acts only at its America/Chicago local hour (DST-safe): digest flush 17:00 (incl. Mentor M4/M5), R1 + Mentor M2 18:00, R2 + Mentor M3 17:00, R6 Mon 17:00, R7 Sat 10:00; R3–R5 every hour.
crons.cron("notification digest", "0 * * * *", makeFunctionReference<"mutation", Record<string, never>, null>("notificationDigest:hourly"), {});
crons.cron("notification reminders", "0 * * * *", makeFunctionReference<"mutation", Record<string, never>, null>("notificationReminders:hourly"), {});
// Hourly; acts only at 5:00 AM and 6:00 PM America/Chicago (DST-safe): the full team spreadsheet update.
crons.cron("update team spreadsheets", "0 * * * *", makeFunctionReference<"mutation", Record<string, never>, null>("sheetExports:hourly"), {});
export default crons;
