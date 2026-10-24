import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("archive past events", { minutes: 1 }, internal.eventArchive.sweep, {});
crons.cron("refresh team calendar", "0 11,12,20,21 * * *", internal.calendar.scheduledRefresh, {});
crons.cron("sync Zeffy donations", "0 0,1,12,13 * * *", internal.zeffyActions.scheduledRun, {});
export default crons;
