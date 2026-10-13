import aggregate from "@convex-dev/aggregate/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp({ env: {
  SITE_URL: v.optional(v.string()),
  TIMECLOCK_CALENDAR_ID: v.optional(v.string()),
  TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL: v.optional(v.string()),
  TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY: v.optional(v.string()),
  TIMECLOCK_OPERATOR_PIN: v.optional(v.string()),
  TIMECLOCK_SITE_URL: v.optional(v.string()),
} });
app.use(rateLimiter);
app.use(aggregate, { name: "reportAggregates" });
export default app;
