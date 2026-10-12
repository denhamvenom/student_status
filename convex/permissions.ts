import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, studentAccess, viewer } from "./lib/access";

export const listSubmissions = query({
  args: { studentId: v.id("students") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role === "mentor" && !user.travelLead) throw new Error("Form access denied.");
    await studentAccess(ctx, user, args.studentId);
    const submissions = await ctx.db.query("permissionSubmissions").withIndex("by_studentId_and_signedAt", q => q.eq("studentId", args.studentId)).order("desc").take(30);
    return await Promise.all(submissions.map(async submission => ({ submission, reviews: await ctx.db.query("permissionReviews").withIndex("by_submissionId", q => q.eq("submissionId", submission._id)).order("desc").take(10) })));
  },
});

export const submit = mutation({
  args: { studentId: v.id("students"), eventIds: v.array(v.id("events")), typedName: v.string(), answersJson: v.string() }, returns: v.id("permissionSubmissions"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "parent") throw new Error("Only a linked parent may sign.");
    await studentAccess(ctx, user, args.studentId);
    await activeSeason(ctx);
    // A season label alone cannot authorize live consent. Reopen this endpoint
    // only with approved wording, versioned answers, and a tested signing flow.
    throw new Error("Permission wording is still draft. Signing is unavailable.");
  },
});

export const review = mutation({
  args: { submissionId: v.id("permissionSubmissions"), status: v.union(v.literal("accepted"), v.literal("correction")), note: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new Error("Review access denied.");
    const submission = await ctx.db.get(args.submissionId); const season = await activeSeason(ctx);
    if (!submission || submission.seasonId !== season._id) throw new Error("Submission not found.");
    if (args.status === "correction" && !args.note?.trim()) throw new Error("A correction note is required.");
    await ctx.db.insert("permissionReviews", { submissionId: submission._id, status: args.status, note: args.note?.trim(), reviewedBy: user._id, reviewedAt: Date.now() });
    await audit(ctx, user, "permissionSubmissions", submission._id, "review", null, { status: args.status, note: args.note });
    return null;
  },
});
