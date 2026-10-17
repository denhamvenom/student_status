import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";
import { audit } from "./lib/access";
import { refreshStudentFinance } from "./lib/financeSummaries";

const DEV_URL = "https://third-bandicoot-18.convex.cloud";
const EMAIL = "consent.pdf.rehearsal@example.invalid";
const MARKER = "syntheticPdfConsentFixture";

/** Creates and links only a new fictional development subject; no existing profile is adopted. */
export const createAndLink = internalMutation({
  args: {expectedCoachEmail: v.string(), expectedParentEmail: v.string()},
  returns: v.object({studentId: v.id("students"), eventId: v.id("events"), created: v.boolean()}),
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== DEV_URL) throw new Error("PDF consent rehearsal is development-only.");
    const coachEmail = args.expectedCoachEmail.trim().toLowerCase(), parentEmail = args.expectedParentEmail.trim().toLowerCase();
    const coach = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", coachEmail)).unique();
    const parent = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", parentEmail)).unique();
    if (!coach?.active || coach.role !== "coach" || !parent?.active || parent.role !== "parent") throw new Error("Expected active Coach and Parent accounts are required.");
    const auth = await ctx.db.get(parent.authUserId);
    const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", parent.authUserId).eq("provider", "google")).take(2);
    if (!auth?.emailVerificationTime || auth.isAnonymous || auth.email?.trim().toLowerCase() !== parent.email || !accounts.some(account => account.emailVerified?.trim().toLowerCase() === parent.email)) throw new Error("A verified Google Parent is required.");
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season || season.createdBy !== coach._id) throw new Error("Expected Coach-owned active season not found.");
    const marker = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", MARKER).eq("entityId", season._id)).unique();
    if (marker) {
      const stored: unknown = marker.afterJson ? JSON.parse(marker.afterJson) : null;
      if (!stored || typeof stored !== "object" || !("studentId" in stored) || !("eventId" in stored) || !("parentId" in stored) || typeof stored.studentId !== "string" || typeof stored.eventId !== "string" || typeof stored.parentId !== "string") throw new Error("PDF fixture marker requires manual review.");
      const studentId = ctx.db.normalizeId("students", stored.studentId), eventId = ctx.db.normalizeId("events", stored.eventId), parentId = ctx.db.normalizeId("appUsers", stored.parentId);
      const student = studentId ? await ctx.db.get(studentId) : null, event = eventId ? await ctx.db.get(eventId) : null;
      if (!student || !event || parentId !== parent._id || student.email !== EMAIL || student.seasonId !== season._id || !student.active || student.userId !== undefined || student.profileCompletedAt === undefined || event.seasonId !== season._id || event.archived || event.feeCents !== 0) throw new Error("PDF fixture changed; manual review required.");
      const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", student._id)).unique();
      const parentRegistry = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", student._id).eq("parentId", parent._id)).unique();
      const paperRegistry = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", student._id).eq("parentId", undefined)).unique();
      if (!link?.active || !parentRegistry?.enabled || !paperRegistry?.enabled) throw new Error("PDF fixture access changed or was revoked; manual review required.");
      return {studentId: student._id, eventId: event._id, created: false};
    }
    const collision = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", EMAIL)).first();
    if (collision) throw new Error("Reserved PDF fixture identity exists without provenance; no records adopted.");
    const now = Date.now();
    const studentId = await ctx.db.insert("students", {seasonId: season._id, legalName: "Fictional PDF Consent Student", preferredName: "Fictional PDF Student", email: EMAIL, subteam: "Programming", active: true, travelTeam: false, roomCategory: "Girls", roomCategoryLocked: true, shirtSize: "M", profileRevision: 1, profileCompletedAt: now, allergies: {state: "unknown"}, medications: {state: "unknown"}});
    const eventId = await ctx.db.insert("events", {seasonId: season._id, name: "REHEARSAL ONLY — Fictional PDF field trip", type: "Team", startsAt: now + 14 * 86_400_000, endsAt: now + 14 * 86_400_000 + 3_600_000, destination: "Fictional consent venue", travel: "Fictional transport", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false});
    await ctx.db.insert("participants", {eventId, studentId, status: "confirmed", createdAt: now, updatedAt: now});
    await ctx.db.insert("familyLinks", {parentUserId: parent._id, studentId, seasonId: season._id, active: true, createdBy: coach._id});
    await ctx.db.insert("syntheticConsentSubjects", {studentId, enabled: true, createdBy: coach._id, createdAt: now});
    await ctx.db.insert("syntheticConsentSubjects", {studentId, parentId: parent._id, enabled: true, createdBy: coach._id, createdAt: now});
    await refreshStudentFinance(ctx, studentId);
    await audit(ctx, coach, MARKER, season._id, "create", null, {studentId, eventId, parentId: parent._id}, "Isolated fictional PDF consent subject and verified test Parent; parent must enter structured profile.");
    return {studentId, eventId, created: true};
  },
});
