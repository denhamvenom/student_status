import aggregate from "@convex-dev/aggregate/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp({ env: {
  SITE_URL: v.optional(v.string()),
  SIGN_IN_MAINTENANCE_COACH_EMAIL: v.optional(v.string()),
  PERMISSION_REAL_SIGNING_ENABLED: v.optional(v.string()),
  PERMISSION_REAL_SIGNING_CLOUD_URL: v.optional(v.string()),
  PRODUCTION_BOOTSTRAP_ENABLED: v.optional(v.string()),
  PRODUCTION_BOOTSTRAP_CLOUD_URL: v.optional(v.string()),
  SYNTHETIC_REHEARSAL_CLEANUP_ENABLED: v.optional(v.string()),
  SYNTHETIC_REHEARSAL_CLEANUP_CLOUD_URL: v.optional(v.string()),
  TIMECLOCK_CALENDAR_ID: v.optional(v.string()),
  TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL: v.optional(v.string()),
  TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY: v.optional(v.string()),
  TIMECLOCK_OPERATOR_PIN: v.optional(v.string()),
  TIMECLOCK_SITE_URL: v.optional(v.string()),
  PARENT_INVITE_EMAIL_ENABLED: v.optional(v.string()),
  RESEND_API_KEY: v.optional(v.string()),
  PARENT_INVITE_EMAIL_FROM: v.optional(v.string()),
  PARENT_INVITE_EMAIL_REPLY_TO: v.optional(v.string()),
  PARENT_INVITE_APP_ORIGIN: v.optional(v.string()),
} });
app.use(rateLimiter);
app.use(aggregate, { name: "reportAggregates" });
export default app;
