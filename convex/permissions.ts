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
    const student = await studentAccess(ctx, user, args.studentId); const season = await activeSeason(ctx);
    if (student.seasonId !== season._id) throw new Error("Archived forms cannot be signed.");
    if (season.permissionVersion.toLowerCase().includes("draft") || season.permissionVersion.toLowerCase().includes("placeholder")) throw new Error("Permission wording is still draft. Signing is unavailable.");
    if (args.typedName.trim().toLocaleLowerCase() !== user.name.trim().toLocaleLowerCase()) throw new Error("Typed signature must match your verified account name.");
    if (args.answersJson.length > 20000) throw new Error("Submission is too large.");
    let answers: unknown;
    try { answers = JSON.parse(args.answersJson); } catch { throw new Error("Invalid form answers."); }
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("Invalid form answers.");
    const eventIds = [...new Set(args.eventIds)];
    for (const eventId of eventIds) {
      const event = await ctx.db.get(eventId);
      if (!event || event.seasonId !== season._id) throw new Error("Selected event not found.");
    }
    const snapshot = JSON.stringify({ answers, student: { legalName: student.legalName, emergencyName: student.emergencyName, emergencyPhone: student.emergencyPhone, allergies: student.allergies, medications: student.medications, otcAuthorization: student.otcAuthorization }, wordingVersion: season.permissionVersion });
    const id = await ctx.db.insert("permissionSubmissions", { studentId: student._id, seasonId: season._id, signedBy: user._id, typedName: args.typedName.trim(), wordingVersion: season.permissionVersion, eventIds, answersJson: snapshot, signedAt: Date.now() });
    await audit(ctx, user, "permissionSubmissions", id, "submit", null, { studentId: student._id, eventIds, wordingVersion: season.permissionVersion });
    return id;
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
