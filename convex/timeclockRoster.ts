import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, maybeViewer, viewer } from "./lib/access";

export const operatorStatus = query({
  args: {},
  returns: v.object({ allowed: v.boolean(), role: v.union(v.literal("coach"), v.literal("mentor"), v.null()) }),
  handler: async ctx => {
    const user = await maybeViewer(ctx);
    const role = user?.role === "coach" || user?.role === "mentor" ? user.role : null;
    return { allowed: role !== null, role };
  },
});

export const list = query({
  args: {},
  returns: v.object({ students: v.array(v.object({ studentId: v.id("students"), displayName: v.string(), subteam: v.union(v.string(), v.null()), collision: v.boolean() })), unreviewedCount: v.number() }),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && user.role !== "mentor") throw new Error("Timeclock operator access required.");
    const season = await activeSeason(ctx);
    const all = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    if (all.length > 500) throw new Error("Roster exceeds the supported 500-record season; narrow the roster before operating.");
    const active = all.filter(s => s.active);
    const reviewed = active.filter(s => s.structuredNameReviewed && s.firstName?.trim() && s.lastName?.trim());
    reviewed.sort((a, b) => a.lastName!.localeCompare(b.lastName!, "en") || a.firstName!.localeCompare(b.firstName!, "en") || a._id.localeCompare(b._id));
    const display = (s: typeof reviewed[number]) => `${s.preferredName.trim() || s.firstName!.trim()} ${Array.from(s.lastName!.trim())[0]}.`;
    const key = (name: string) => name.toLocaleLowerCase("en");
    const counts = new Map<string, number>();
    for (const s of reviewed) counts.set(key(display(s)), (counts.get(key(display(s))) ?? 0) + 1);
    const distinguish = new Map<string, number>();
    for (const s of reviewed) { const k = key(`${display(s)}|${s.subteam.trim()}`); distinguish.set(k, (distinguish.get(k) ?? 0) + 1); }
    return {
      unreviewedCount: active.length - reviewed.length,
      students: reviewed.map(s => {
        const displayName = display(s);
        const duplicate = counts.get(key(displayName))! > 1;
        return { studentId: s._id, displayName, subteam: duplicate && s.subteam.trim() ? s.subteam.trim() : null, collision: duplicate && (!s.subteam.trim() || distinguish.get(key(`${displayName}|${s.subteam.trim()}`))! > 1) };
      }),
    };
  },
});

export const clockStatus = query({
  args: { sessionId: v.id("timeclockSessions") },
  returns: v.object({
    sessionId: v.id("timeclockSessions"),
    state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")),
    revision: v.number(),
    students: v.array(v.object({
      studentId: v.id("students"),
      status: v.union(v.literal("in"), v.literal("out"), v.literal("no_activity")),
      activeSessionId: v.union(v.id("timeclockSessions"), v.null()),
      activeIntervalId: v.union(v.id("timeclockIntervals"), v.null()),
      hasConflict: v.boolean(),
    })),
  }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && user.role !== "mentor") throw new Error("Timeclock operator access required.");
    const season = await activeSeason(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.seasonId !== season._id) throw new Error("Timeclock session unavailable in active season.");
    const all = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    if (all.length > 500) throw new Error("Roster exceeds the supported 500-record season; narrow the roster before operating.");
    const reviewed = all.filter(s => s.active && s.structuredNameReviewed && s.firstName?.trim() && s.lastName?.trim());
    const students = await Promise.all(reviewed.map(async student => {
      const [lock, selectedHistory] = await Promise.all([
        ctx.db.query("timeclockStudentLocks").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique(),
        ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", student._id)).first(),
      ]);
      let activeSessionId = null;
      let activeIntervalId = null;
      if (lock?.sessionId && lock.intervalId) {
        const [activeSession, activeInterval] = await Promise.all([ctx.db.get(lock.sessionId), ctx.db.get(lock.intervalId)]);
        if (activeSession?.state === "open" && activeSession.seasonId === season._id && activeInterval?.outAt === undefined && activeInterval?.studentId === student._id && activeInterval?.sessionId === activeSession._id) {
          activeSessionId = activeSession._id;
          activeIntervalId = activeInterval._id;
        }
      }
      // Console status reflects original operational visits. Corrections affect
      // Coach attendance summaries, not the current clock button state.
      const inSelected = session.state === "open" && activeSessionId === session._id;
      return { studentId: student._id, status: inSelected ? "in" as const : selectedHistory ? "out" as const : "no_activity" as const, activeSessionId, activeIntervalId, hasConflict: activeSessionId !== null && activeSessionId !== session._id };
    }));
    return { sessionId: session._id, state: session.state, revision: session.revision, students };
  },
});

export const namesForReview = query({
  args: {},
  returns: v.array(v.object({ studentId: v.id("students"), legalName: v.string(), firstName: v.union(v.string(), v.null()), lastName: v.union(v.string(), v.null()), reviewed: v.boolean() })),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new Error("Name review is Coach-only.");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    if (students.length > 500) throw new Error("Name review exceeds the supported season size.");
    return students.filter(s => s.active).map(s => ({ studentId: s._id, legalName: s.legalName, firstName: s.firstName ?? null, lastName: s.lastName ?? null, reviewed: s.structuredNameReviewed ?? false }));
  },
});

export const reviewNames = mutation({
  args: { studentId: v.id("students"), firstName: v.string(), lastName: v.string(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach") throw new Error("Name review is Coach-only.");
    const season = await activeSeason(ctx);
    const student = await ctx.db.get(args.studentId);
    if (!student?.active || student.seasonId !== season._id) throw new Error("Student unavailable in active season.");
    const firstName = args.firstName.trim(), lastName = args.lastName.trim(), reason = args.reason.trim();
    if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100 || !reason || reason.length > 500) throw new Error("Reviewed names and a short reason are required.");
    const after = { firstName, lastName, structuredNameReviewed: true };
    await ctx.db.patch(student._id, after);
    await audit(ctx, actor, "students", student._id, "reviewStructuredName", { firstName: student.firstName ?? null, lastName: student.lastName ?? null, structuredNameReviewed: student.structuredNameReviewed ?? false }, after, reason);
    return null;
  },
});
