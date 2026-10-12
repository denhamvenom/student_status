import { env, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { viewer } from "./lib/access";

const stateResult = v.union(v.null(), v.object({ syncToken: v.optional(v.string()), generation: v.number() }));

export const begin = internalMutation({
  args: { calendarIdHash: v.string(), now: v.number() }, returns: stateResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
    if (existing && existing.calendarIdHash !== args.calendarIdHash) {
      await ctx.db.patch(existing._id, { lastError: "Calendar source changed; review required before synchronization", lastAttemptAt: args.now });
      return null;
    }
    if (existing && existing.lastAttemptAt && args.now - existing.lastAttemptAt < 50_000) return null;
    const generation = (existing?.generation ?? 0) + 1;
    if (existing) {
      await ctx.db.patch(existing._id, { generation, lastAttemptAt: args.now });
      return { syncToken: existing.syncToken, generation };
    }
    await ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash: args.calendarIdHash, timezone: "America/Chicago", generation, lastAttemptAt: args.now });
    return { generation };
  },
});

export const finish = internalMutation({
  args: { generation: v.number(), now: v.number(), syncToken: v.optional(v.string()), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
    if (!row || row.generation !== args.generation) return null;
    await ctx.db.patch(row._id, args.error
      ? { lastError: args.error }
      : { lastSuccessAt: args.now, lastError: undefined, syncToken: args.syncToken });
    return null;
  },
});

export const status = query({
  args: { now: v.number() },
  returns: v.object({ configured: v.boolean(), lastSuccessAt: v.union(v.number(), v.null()), lastAttemptAt: v.union(v.number(), v.null()), stale: v.boolean(), error: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && actor.role !== "mentor") throw new Error("Access denied");
    const row = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
    const configured = !!(env.TIMECLOCK_CALENDAR_ID && env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL && env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY);
    return { configured, lastSuccessAt: row?.lastSuccessAt ?? null, lastAttemptAt: row?.lastAttemptAt ?? null, stale: !configured || !!row?.lastError || !row?.lastSuccessAt || args.now - row.lastSuccessAt > 180_000, error: row?.lastError ?? null };
  },
});
