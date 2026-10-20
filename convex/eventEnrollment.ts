import { savedPublicError, publicErrorResult } from './lib/publicErrors';
import { requireSeasonFinancialRetry, seasonFinancialRetryAvailable } from "./lib/seasonFinance";
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { activeSeason, audit, viewer } from "./lib/access";
import { assignWholeTeamMember } from "./lib/wholeTeam";

export const status = query({
  args: { eventId: v.id("events") },
  returns: v.union(v.null(), v.object({ state: v.union(v.literal("running"), v.literal("failed"), v.literal("complete"), v.literal("cancelled")), processed: v.number(), assigned: v.number(), canRetry: v.boolean(), lastError: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && !actor.travelLead) throw new ConvexError("Enrollment status access denied.");
    const event = await ctx.db.get(args.eventId); const season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id) throw new ConvexError("Event not found.");
    const job = await ctx.db.query("eventEnrollmentJobs").withIndex("by_eventId", q => q.eq("eventId", event._id)).unique();
    return publicErrorResult(job ? { state: job.state, processed: job.processed, assigned: event.wholeTeamParticipantCount ?? 0, canRetry: actor.role === "coach" && job.state === "failed" && !event.archived && !event.cancelled && await seasonFinancialRetryAvailable(ctx, event.seasonId, job._id), lastError: job.lastError ?? null } : null);
  },
});

/** Cancellation terminates pending assignment, preserving every already-posted row. */
async function stopCancelled(ctx: MutationCtx, event: Doc<"events">) {
  if (!event.cancelled) return null;
  const job = await ctx.db.query("eventEnrollmentJobs").withIndex("by_eventId", q => q.eq("eventId", event._id)).unique();
  if (job && (job.state === "running" || job.state === "failed")) {
    await ctx.db.patch(job._id, { state: "cancelled", updatedAt: Date.now(), lastError: undefined });
    await ctx.db.patch(event._id, { enrollmentState: "cancelled" });
  }
  return null;
}
export const stopCancelledEnrollment = internalMutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => { const event = await ctx.db.get(args.eventId); return event ? stopCancelled(ctx, event) : null; },
});

/** Cursor progress, participation and fee commit together for exactly one roster row. */
export const processPage = internalMutation({
  args: { jobId: v.id("eventEnrollmentJobs"), expectedCursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running" || job.cursor !== args.expectedCursor) return null;
    const event = await ctx.db.get(job.eventId); const actor = await ctx.db.get(job.actorId); const season = await activeSeason(ctx);
    if (event?.cancelled) return stopCancelled(ctx, event);
    if (!event || event.archived || event.cancelled || event.seasonId !== season._id || event.assignmentScope !== "wholeTeam" || event.signupMode !== "assigned") throw new Error("Whole Team event is unavailable; Coach review is required.");
    if (!actor?.active || actor.role !== "coach") throw new Error("Enrollment actor is unavailable; a Coach must retry.");
    const page = await ctx.db.query("eventEnrollmentMembers").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ cursor: job.cursor, numItems: 1 });
    for (const member of page.page) {
      const student = await ctx.db.get(member.studentId);
      if (student) await assignWholeTeamMember(ctx, actor, event, student, job._id);
    }
    const state = page.isDone ? "complete" as const : "running" as const;
    await ctx.db.patch(job._id, { cursor: page.continueCursor, processed: job.processed + page.page.length, state, updatedAt: Date.now(), lastError: undefined });
    if (page.isDone) {
      await ctx.db.patch(event._id, { enrollmentState: "complete" });
      await audit(ctx, actor, "events", event._id, "completeWholeTeamEnrollment", "running", "complete");
    } else await ctx.scheduler.runAfter(0, internal.eventEnrollment.run, { jobId: job._id });
    return null;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("eventEnrollmentJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running") return null;
    try {
      await ctx.runMutation(internal.eventEnrollment.processPage, { jobId: job._id, expectedCursor: job.cursor });
    } catch (error) {
      // The failed nested mutation rolls back this student's participation and fee.
      await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "Enrollment failed; Coach review is required."), updatedAt: Date.now() });
      const event = await ctx.db.get(job.eventId);
      if (event) await ctx.db.patch(event._id, { enrollmentState: "failed" });
    }
    return null;
  },
});

export const retry = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach") throw new ConvexError("Only a Coach may retry Whole Team enrollment.");
    const event = await ctx.db.get(args.eventId); const season = await activeSeason(ctx);
    if (!event || event.archived || event.cancelled || event.seasonId !== season._id) throw new ConvexError("Event is unavailable.");
    const job = await ctx.db.query("eventEnrollmentJobs").withIndex("by_eventId", q => q.eq("eventId", event._id)).unique();
    if (!job || job.state !== "failed") throw new ConvexError("No failed enrollment is available to retry.");
    await requireSeasonFinancialRetry(ctx, season._id, job._id);
    await ctx.db.patch(job._id, { actorId: actor._id, state: "running", lastError: undefined, updatedAt: Date.now() });
    await ctx.db.patch(event._id, { enrollmentState: "running" });
    await ctx.scheduler.runAfter(0, internal.eventEnrollment.run, { jobId: job._id });
    await audit(ctx, actor, "events", event._id, "retryWholeTeamEnrollment", "failed", "running");
    return null;
  },
});
