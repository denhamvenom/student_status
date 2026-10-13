import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";
import { audit } from "./lib/access";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const DEV_URL = "https://third-bandicoot-18.convex.cloud";
const EMAIL = "consent.rehearsal@example.invalid";
const MARKER = "syntheticConsentFixture";

/** Creates its own fictional subject. It never adopts an existing student by name or email. */
export const create = internalMutation({
  args: { expectedCoachEmail: v.string() },
  returns: v.object({ studentId: v.id("students"), eventId: v.id("events"), created: v.boolean() }),
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== DEV_URL) throw new Error("Consent rehearsal is development-only.");
    const coach = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", args.expectedCoachEmail.trim().toLowerCase())).unique();
    if (!coach?.active || coach.role !== "coach") throw new Error("Expected active Coach not found.");
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season || season.createdBy !== coach._id) throw new Error("Expected Coach-owned active season not found.");
    const marker = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", MARKER).eq("entityId", season._id)).unique();
    if (marker) {
      if (!marker.afterJson) throw new Error("Fixture marker requires manual review.");
      const original: unknown = JSON.parse(marker.afterJson);
      if (!original || typeof original !== "object" || !("studentId" in original) || typeof original.studentId !== "string" || !("eventId" in original) || typeof original.eventId !== "string") throw new Error("Fixture provenance does not match.");
      const studentId = ctx.db.normalizeId("students", original.studentId);
      const registered = studentId ? await ctx.db.get(studentId) : null;
      if (!registered || registered.seasonId !== season._id || registered.email !== EMAIL || !registered.active || registered.userId !== undefined) throw new Error("Fixture student changed; manual review required.");
      const eventId = ctx.db.normalizeId("events", original.eventId);
      const event = eventId ? await ctx.db.get(eventId) : null;
      const registry = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", registered._id).eq("parentId", undefined)).unique();
      if (!event || event.seasonId !== season._id || event.archived || !registry?.enabled) throw new Error("Fixture changed or disabled; manual review required.");
      return { studentId: registered._id, eventId: event._id, created: false };
    }
    const collision = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", EMAIL)).first();
    if (collision) throw new Error("Reserved fixture identity exists without provenance; no records adopted.");
    const now = Date.now();
    const studentId = await ctx.db.insert("students", {
      seasonId: season._id, legalName: "Consent Rehearsal Example", preferredName: "Consent rehearsal", email: EMAIL,
      subteam: "Programming", active: true, travelTeam: false, roomCategory: "Girls", roomCategoryLocked: true,
      shirtSize: "M", profileRevision: 1, profileCompletedAt: now,
      emergencyName: "Fictional Guardian", emergencyRelationship: "Guardian", emergencyPhone: "202-555-0100", allergies: { state: "none" }, medications: { state: "none" },
    });
    const eventId = await ctx.db.insert("events", {
      seasonId: season._id, name: "REHEARSAL ONLY — Permission workflow", type: "Team", startsAt: now + 14 * 86_400_000,
      endsAt: now + 14 * 86_400_000 + 3_600_000, destination: "Fictional consent venue", travel: "Fictional travel arrangement",
      overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true,
      permissionRequired: true, firstRequired: false, archived: false,
    });
    await ctx.db.insert("participants", { eventId, studentId, status: "confirmed", createdAt: now, updatedAt: now });
    await ctx.db.insert("syntheticConsentSubjects", { studentId, enabled: true, createdBy: coach._id, createdAt: now });
    await refreshStudentFinance(ctx, studentId);
    await audit(ctx, coach, MARKER, season._id, "create", null, { studentId, eventId }, "New fictional consent subject; paper rehearsal only; no real signing.");
    return { studentId, eventId, created: true };
  },
});

/** Explicit test-account linkage, restricted to the fixture this module created. */
export const linkParent = internalMutation({
  args: { expectedCoachEmail: v.string(), expectedParentEmail: v.string() },
  returns: v.object({ studentId: v.id("students"), eventId: v.id("events"), created: v.boolean() }),
  handler: async (ctx, args): Promise<{ studentId: Id<"students">; eventId: Id<"events">; created: boolean }> => {
    if (env.CONVEX_CLOUD_URL !== DEV_URL) throw new Error("Consent rehearsal is development-only.");
    const parent = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", args.expectedParentEmail.trim().toLowerCase())).unique();
    if (!parent?.active || parent.role !== "parent") throw new Error("Expected active Parent not found.");
    const auth = await ctx.db.get(parent.authUserId);
    const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", parent.authUserId).eq("provider", "google")).take(2);
    if (!auth?.emailVerificationTime || auth.isAnonymous || auth.email?.trim().toLowerCase() !== parent.email || !accounts.some(account => account.emailVerified?.trim().toLowerCase() === parent.email)) throw new Error("Verified Google Parent required.");
    const fixture: { studentId: Id<"students">; eventId: Id<"events">; created: boolean } = await ctx.runMutation(internal.consentRehearsal.create, { expectedCoachEmail: args.expectedCoachEmail });
    const coach = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", args.expectedCoachEmail.trim().toLowerCase())).unique();
    if (!coach?.active || coach.role !== "coach") throw new Error("Expected active Coach not found.");
    const registry = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", fixture.studentId).eq("parentId", parent._id)).unique();
    const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", fixture.studentId)).unique();
    const student = await ctx.db.get(fixture.studentId);
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!student || !season || student.seasonId !== season._id) throw new Error("Rehearsal student season changed; manual review required.");
    if (registry && !registry.enabled || link && !link.active) throw new Error("Rehearsal access was revoked; manual review required.");
    if (registry && !link) throw new Error("Rehearsal linkage changed; manual review required.");
    if (link?.seasonId && link.seasonId !== student.seasonId) throw new Error("Rehearsal family link season changed; manual review required.");
    if (link && !link.seasonId) await ctx.db.patch(link._id, { seasonId: student.seasonId });
    if (!link) await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: fixture.studentId, seasonId: student.seasonId, active: true, createdBy: coach._id });
    if (!registry) {
      await ctx.db.insert("syntheticConsentSubjects", { studentId: fixture.studentId, parentId: parent._id, enabled: true, createdBy: coach._id, createdAt: Date.now() });
      await audit(ctx, coach, MARKER, fixture.studentId, "linkParent", null, { parentId: parent._id }, "Explicit test Parent linked to module-created fictional subject only; no account role changes.");
    }
    return fixture;
  },
});
