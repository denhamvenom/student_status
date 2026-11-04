import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
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

/**
 * Runs the page as a subtransaction: if it fails (for example the student's finances are still updating from the previous
 * page's charges) its writes roll back and the same page is retried later, so no event is enrolled without its charge.
 */
export const continueSync = internalMutation({
  args: { ...pageArgs, attempt: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const { attempt = 0, ...page } = args;
    try {
      const done: null = await ctx.runMutation(internal.membershipSync.runPage, page);
      return done;
    } catch (error) {
      if (attempt + 1 >= MAX_ATTEMPTS) throw error;
      await ctx.scheduler.runAfter(RETRY_DELAY_MS, internal.membershipSync.continueSync, { ...page, attempt: attempt + 1 });
      return null;
    }
  },
});
