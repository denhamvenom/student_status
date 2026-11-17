import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { syncSubteamMembership } from "./lib/subteamEnrollment";
import { syncWholeTeamMembership } from "./lib/wholeTeam";

const RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 30;
const pageArgs = { kind: v.union(v.literal("wholeTeam"), v.literal("subteams")), studentId: v.id("students"), actorId: v.id("appUsers"), after: v.object({ startsAt: v.number(), creationTime: v.number() }), notifiedSeriesIds: v.array(v.id("eventSeries")) };

/**
 * One background page of a Whole Team or subteam membership sync (lib/wholeTeam.ts, lib/subteamEnrollment.ts). The student
 * is reloaded, so a roster change made after the first page is respected; `after` is the last event the previous page handled.
 */
export const runPage = internalMutation({
  args: pageArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    const actor = await ctx.db.get(args.actorId);
    if (!student || !student.active || !actor) return null;
    const options = { after: args.after, notifiedSeriesIds: args.notifiedSeriesIds };
    if (args.kind === "wholeTeam") await syncWholeTeamMembership(ctx, actor, student, options);
    else await syncSubteamMembership(ctx, actor, student, options);
    return null;
  },
});

/** What a Coach sees when a sync stopped. No technical words; the raw error goes only to the logs. */
function plainReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/roster limit/i.test(message)) return "Venom Status can't add more than 500 students to one Whole Team event, so this student wasn't added to the rest of the upcoming events. Contact the person who set up Venom Status for your team.";
  return "Venom Status couldn't finish adding this student to every upcoming event. Press Try again. If it keeps happening, contact the person who set up Venom Status for your team.";
}

/** Safe to store: an app-authored message, or just the error's name. Platform text can quote record values (names). */
function safeDetail(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data.slice(0, 200);
  return `${error instanceof Error ? error.name : "Unknown error"} (see logs)`;
}

/**
 * Runs the page as a subtransaction: if it fails (for example the student's finances are still updating from the previous
 * page's charges) its writes roll back and the same page is retried later, so no event is enrolled without its charge.
 * When the last attempt fails, the place reached is saved (membershipSyncStops) instead of being lost, so a Coach can resume.
 */
export const continueSync = internalMutation({
  args: { ...pageArgs, attempt: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const { attempt = 0, ...page } = args;
    try {
      const done: null = await ctx.runMutation(internal.membershipSync.runPage, page);
      return done;
    } catch (error) {
      if (attempt + 1 < MAX_ATTEMPTS) {
        await ctx.scheduler.runAfter(RETRY_DELAY_MS, internal.membershipSync.continueSync, { ...page, attempt: attempt + 1 });
        return null;
      }
      console.error(`Membership sync stopped: kind=${page.kind} studentId=${page.studentId} attempts=${attempt + 1}`, error);
      const row = { ...page, attempts: attempt + 1, reason: plainReason(error), technicalDetail: safeDetail(error), state: "stopped" as const, stoppedAt: Date.now(), resumedAt: undefined };
      // One record per student and kind: a later stop replaces the saved place instead of piling up rows.
      const prior = await ctx.db.query("membershipSyncStops").withIndex("by_studentId_and_kind", q => q.eq("studentId", page.studentId).eq("kind", page.kind)).order("desc").first();
      if (prior) await ctx.db.replace(prior._id, row);
      else await ctx.db.insert("membershipSyncStops", row);
      return null;
    }
  },
});

/** Syncs that gave up and have not been resumed, oldest first (for a future Coach screen). */
export const listStopped = internalQuery({
  args: {}, returns: v.array(v.object({ _id: v.id("membershipSyncStops"), _creationTime: v.number(), studentId: v.id("students"), kind: v.union(v.literal("wholeTeam"), v.literal("subteams")), after: v.object({ startsAt: v.number(), creationTime: v.number() }), attempts: v.number(), reason: v.string(), stoppedAt: v.number() })),
  handler: async ctx => {
    const rows = await ctx.db.query("membershipSyncStops").withIndex("by_state_and_stoppedAt", q => q.eq("state", "stopped")).take(100);
    return rows.map(({ _id, _creationTime, studentId, kind, after, attempts, reason, stoppedAt }) => ({ _id, _creationTime, studentId, kind, after, attempts, reason, stoppedAt }));
  },
});

/**
 * Starts a stopped sync again from the saved place. Safe to repeat: only a stop still marked "stopped" is resumed, and
 * re-processing a page never enrolls or charges twice (existing enrollment and the fee key are checked first).
 */
export const resume = internalMutation({
  args: { stopId: v.id("membershipSyncStops"), actorId: v.id("appUsers") }, returns: v.boolean(),
  handler: async (ctx, { stopId, actorId }) => {
    // Internal only. A future public wrapper must require a Coach and pass that Coach as actorId (never a client-supplied id).
    const actor = await ctx.db.get(actorId);
    if (!actor || !actor.active) return false;
    const stop = await ctx.db.get(stopId);
    if (!stop || stop.state !== "stopped") return false;
    await ctx.db.patch(stopId, { state: "resumed", resumedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.membershipSync.continueSync, { kind: stop.kind, studentId: stop.studentId, actorId, after: stop.after, notifiedSeriesIds: stop.notifiedSeriesIds });
    return true;
  },
});
