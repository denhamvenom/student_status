import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("refresh team calendar", { minutes: 1 }, internal.calendar.refresh, {});
export default crons;
