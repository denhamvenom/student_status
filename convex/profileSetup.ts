import { normalizeChangedPhone, normalizeChangedEmail } from "../shared/contact-format";
import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, ownStudent, studentAccess, viewer } from "./lib/access";
import { markRoomCategoryReview } from "./lib/profileCorrections";

const category = v.union(v.literal("Boys"), v.literal("Girls"));
const sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const correctionField = v.union(v.literal("roomCategory"), v.literal("legalName"), v.literal("account"));
export const get = query({
  args: {}, returns: v.object({ studentId: v.id("students"), legalName: v.string(), preferredName: v.string(), email: v.string(), subteam: v.string(), shirtSize: v.union(v.string(), v.null()), roomCategory: v.union(category, v.null()), roomCategoryLocked: v.boolean(), setupRequired: v.boolean(), revision: v.number(), guardianName: v.union(v.string(), v.null()), guardianRelationship: v.union(v.string(), v.null()), guardianPhone: v.union(v.string(), v.null()), guardianEmail: v.union(v.string(), v.null()) }),
  handler: async ctx => {
    const actor = await viewer(ctx); const student = await ownStudent(ctx, actor); const season = await activeSeason(ctx);
    if (student.seasonId !== season._id) throw new Error("Profile is unavailable in the active season.");
    return { studentId: student._id, legalName: student.legalName, preferredName: student.preferredName, email: student.email, subteam: student.subteam, shirtSize: student.shirtSize ?? null, roomCategory: student.roomCategory ?? null, roomCategoryLocked: student.roomCategoryLocked, setupRequired: student.profileCompletedAt === undefined, revision: student.profileRevision ?? 0, guardianName: student.guardianName ?? null, guardianRelationship: student.guardianRelationship ?? null, guardianPhone: student.guardianPhone ?? null, guardianEmail: student.guardianEmail ?? null };
  },
});

export const complete = mutation({
  args: { expectedRevision: v.number(), preferredName: v.optional(v.string()), shirtSize: v.string(), roomCategory: category, guardianName: v.optional(v.string()), guardianRelationship: v.optional(v.string()), guardianPhone: v.optional(v.string()), guardianEmail: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const student = await ownStudent(ctx, actor); const season = await activeSeason(ctx);
    if (student.seasonId !== season._id) throw new Error("Profile is unavailable in the active season.");
    if (student.profileCompletedAt !== undefined) throw new Error("Profile setup is already complete. Use ordinary profile editing.");
    if ((student.profileRevision ?? 0) !== args.expectedRevision) throw new Error("Profile changed. Reload before saving.");
    if (!sizes.includes(args.shirtSize) || (args.preferredName?.trim().length ?? 0) > 80) throw new Error("Choose a valid shirt size and preferred name.");
    if (student.roomCategoryLocked && student.roomCategory !== args.roomCategory) throw new Error("Only a Coach may correct the locked room category.");
    for (const field of [args.guardianName, args.guardianRelationship, args.guardianPhone, args.guardianEmail]) if ((field?.trim().length ?? 0) > 254) throw new Error("Parent contact is too long.");
    const email = args.guardianEmail === undefined ? undefined : normalizeChangedEmail(args.guardianEmail, student.guardianEmail, "Parent contact email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid parent contact email.");
    if (student.roomCategory !== args.roomCategory) await markRoomCategoryReview(ctx, student._id, student.seasonId);
    const preferredName = args.preferredName?.trim() || student.firstName || student.preferredName || student.legalName;
    await ctx.db.patch(student._id, { preferredName, shirtSize: args.shirtSize, roomCategory: args.roomCategory, roomCategoryLocked: true, profileCompletedAt: Date.now(), profileRevision: (student.profileRevision ?? 0) + 1, guardianName: args.guardianName?.trim() || undefined, guardianRelationship: args.guardianRelationship?.trim() || undefined, guardianPhone: args.guardianPhone === undefined ? undefined : normalizeChangedPhone(args.guardianPhone, student.guardianPhone, "Parent contact phone") || undefined, guardianEmail: email || undefined });
    await audit(ctx, actor, "students", student._id, "completeProfileSetup", { revision: student.profileRevision ?? 0 }, { roomCategory: args.roomCategory, shirtSize: args.shirtSize, revision: (student.profileRevision ?? 0) + 1 });
    return null;
  },
});

export const requestCorrection = mutation({
  args: { studentId: v.id("students"), field: correctionField, note: v.string(), expectedRevision: v.number() }, returns: v.id("profileCorrectionRequests"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "student" && actor.role !== "parent") throw new Error("Only the student or linked parent may request a profile correction.");
    const student = await studentAccess(ctx, actor, args.studentId);
    if ((student.profileRevision ?? 0) !== args.expectedRevision) throw new Error("Profile changed. Reload before requesting a correction.");
    if (!args.note.trim() || args.note.trim().length > 1000) throw new Error("A correction note under 1000 characters is required.");
    const pending = await ctx.db.query("profileCorrectionRequests").withIndex("by_studentId_and_field_and_status", q => q.eq("studentId", student._id).eq("field", args.field).eq("status", "pending")).take(2);
    if (pending.length > 1) throw new Error("Multiple pending corrections need Coach review before another request.");
    if (pending[0]) {
      if (pending[0].requestedBy === actor._id && pending[0].note === args.note.trim()) return pending[0]._id;
      throw new Error("A correction for this field is already waiting for the Coach.");
    }
    const id = await ctx.db.insert("profileCorrectionRequests", { studentId: student._id, seasonId: student.seasonId, field: args.field, requestedBy: actor._id, requestedAt: Date.now(), note: args.note.trim(), status: "pending" });
    await audit(ctx, actor, "profileCorrectionRequests", id, "request", null, { field: args.field });
    return id;
  },
});

export const correct = mutation({
  args: { studentId: v.id("students"), expectedRevision: v.number(), roomCategory: v.optional(category), legalName: v.optional(v.string()), reason: v.string(), requestId: v.optional(v.id("profileCorrectionRequests")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may correct profile identity or room category.");
    const student = await studentAccess(ctx, actor, args.studentId);
    if ((student.profileRevision ?? 0) !== args.expectedRevision) throw new Error("Profile changed. Reload before correcting.");
    if (!args.reason.trim() || args.reason.trim().length > 1000 || (args.roomCategory === undefined && args.legalName === undefined)) throw new Error("A correction and reason are required.");
    if (args.legalName !== undefined && (!args.legalName.trim() || args.legalName.trim().length > 160)) throw new Error("Enter a legal name under 160 characters.");
    const request = args.requestId ? await ctx.db.get(args.requestId) : null;
    if (args.requestId && (!request || request.studentId !== student._id || request.status !== "pending" || request.field === "account" || request.field === "roomCategory" && args.roomCategory === undefined || request.field === "legalName" && args.legalName === undefined)) throw new Error("Correction request is unavailable or requires account review.");
    if (args.roomCategory !== undefined && args.roomCategory !== student.roomCategory) await markRoomCategoryReview(ctx, student._id, student.seasonId);
    const changes = { ...(args.roomCategory !== undefined ? { roomCategory: args.roomCategory, roomCategoryLocked: true } : {}), ...(args.legalName !== undefined ? { legalName: args.legalName.trim() } : {}), profileRevision: (student.profileRevision ?? 0) + 1 };
    await ctx.db.patch(student._id, changes);
    if (request) await ctx.db.patch(request._id, { status: "approved", decidedBy: actor._id, decidedAt: Date.now(), reason: args.reason.trim() });
    await audit(ctx, actor, "students", student._id, "correctProfile", { roomCategory: student.roomCategory, legalName: student.legalName, revision: student.profileRevision ?? 0 }, changes, args.reason.trim());
    return null;
  },
});

export const corrections = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(v.object({ requestId: v.id("profileCorrectionRequests"), studentId: v.id("students"), studentName: v.string(), field: correctionField, note: v.string(), requestedAt: v.number(), revision: v.number() })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may review profile corrections.");
    const season = await activeSeason(ctx);
    const page = await ctx.db.query("profileCorrectionRequests").withIndex("by_seasonId_and_status", q => q.eq("seasonId", season._id).eq("status", "pending")).paginate(args.paginationOpts);
    const result = [];
    for (const row of page.page) {
      const student = await ctx.db.get(row.studentId);
      if (student?.active && student.seasonId === season._id) result.push({ requestId: row._id, studentId: student._id, studentName: student.legalName || student.preferredName, field: row.field, note: row.note, requestedAt: row.requestedAt, revision: student.profileRevision ?? 0 });
    }
    return { ...page, page: result };
  },
});

export const denyCorrection = mutation({
  args: { requestId: v.id("profileCorrectionRequests"), expectedRevision: v.number(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may review profile corrections.");
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending") throw new Error("Pending correction request not found.");
    const student = await studentAccess(ctx, actor, request.studentId);
    if ((student.profileRevision ?? 0) !== args.expectedRevision) throw new Error("Profile changed. Reload before deciding.");
    if (!args.reason.trim() || args.reason.trim().length > 1000) throw new Error("A reason under 1000 characters is required.");
    await ctx.db.patch(request._id, { status: "denied", decidedBy: actor._id, decidedAt: Date.now(), reason: args.reason.trim() });
    await audit(ctx, actor, "profileCorrectionRequests", request._id, "deny", "pending", "denied", args.reason.trim());
    return null;
  },
});
