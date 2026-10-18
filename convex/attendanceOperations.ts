import { v } from "convex/values";
import { query } from "./_generated/server";
import { activeSeason, requireRole, viewer } from "./lib/access";

// Coach workspace selectors only; clock commands remain in the separate app.
export const workspace = query({
  args: {},
  returns: v.object({
    students: v.array(v.object({ studentId: v.id("students"), name: v.string(), active: v.boolean() })),
    sessions: v.array(v.object({ sessionId: v.id("timeclockSessions"), title: v.string(), state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")), scheduledStart: v.number(), scheduledEnd: v.number(), effectiveEnd: v.number(), needsReview: v.boolean() })),
  }),
  handler: async ctx => {
    requireRole(await viewer(ctx), "coach");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    const sessions = await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id)).take(501);
    if (students.length > 500 || sessions.length > 500) throw new Error("Attendance workspace exceeds the supported review size.");
    return {
      students: students.map(s => ({ studentId: s._id, name: s.legalName, active: s.active })).sort((a,b) => a.name.localeCompare(b.name)),
      sessions: await Promise.all(sessions.sort((a,b) => b.scheduledStart-a.scheduledStart).map(async s => ({ sessionId: s._id, title: (await ctx.db.get(s.occurrenceId))?.title ?? "Unavailable event", state: s.state, scheduledStart: s.scheduledStart, scheduledEnd: s.scheduledEnd, effectiveEnd: s.effectiveEnd, needsReview: s.needsReview }))),
    };
  },
});
