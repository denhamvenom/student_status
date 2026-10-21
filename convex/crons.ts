import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.cron("refresh team calendar", "0 11,12,20,21 * * *", internal.calendar.scheduledRefresh, {});
export default crons;
