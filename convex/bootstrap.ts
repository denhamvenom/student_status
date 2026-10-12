import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";

// This is intentionally bound to the first development deployment. It cannot
// be reused for another project or a production deployment by changing args.
const EXPECTED_DEV_URL = "https://third-bandicoot-18.convex.cloud";

/** Integration-owner-only setup after the test account completes Google sign-in. */
export const provisionDevelopmentMentor = internalMutation({
  args: { expectedEmail: v.string() },
  returns: v.object({ mentorId: v.id("appUsers") }),
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== EXPECTED_DEV_URL) throw new Error("Mentor setup is development-only.");
    const email = args.expectedEmail.trim().toLowerCase();
    const authUser = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).unique();
    if (!authUser?.emailVerificationTime || authUser.isAnonymous) throw new Error("Complete verified Google sign-in first.");
    const google = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", authUser._id).eq("provider", "google")).first();
    if (!google) throw new Error("Google identity required.");
    const existing = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUser._id)).unique();
    if (existing) {
      if (existing.active && existing.role === "mentor") return { mentorId: existing._id };
      throw new Error("Existing account role must not be changed by development setup.");
    }
    let coach = null;
    for await (const candidate of ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "coach"))) {
      if (candidate.active) { coach = candidate; break; }
    }
    if (!coach?.active) throw new Error("Active development Coach required.");
    const mentorId = await ctx.db.insert("appUsers", { authUserId: authUser._id, email, name: authUser.name?.trim() || "Development Mentor", role: "mentor", travelLead: false, financialEdit: false, active: true });
    await ctx.db.insert("audit", { actorId: coach._id, entity: "appUsers", entityId: mentorId, action: "provisionDevelopmentMentor", afterJson: JSON.stringify({ role: "mentor", active: true }), reason: "Owner-authorized development tester; existing roles preserved", at: Date.now() });
    return { mentorId };
  },
});

/** Owner-authorized capability grant for an existing, verified development Mentor. */
export const grantDevelopmentTravelLead = internalMutation({
  args: { expectedCoachEmail: v.string(), expectedMentorEmail: v.string() },
  returns: v.object({ mentorId: v.id("appUsers"), changed: v.boolean() }),
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== EXPECTED_DEV_URL) throw new Error("Travel Lead grant is development-only.");
    const coachEmail = args.expectedCoachEmail.trim().toLowerCase();
    const mentorEmail = args.expectedMentorEmail.trim().toLowerCase();
    if (!coachEmail || !mentorEmail || coachEmail === mentorEmail) throw new Error("Distinct Coach and Mentor emails are required.");
    const coach = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", coachEmail)).unique();
    if (!coach?.active || coach.role !== "coach") throw new Error("Expected active development Coach not found.");
    const authUser = await ctx.db.query("users").withIndex("email", q => q.eq("email", mentorEmail)).unique();
    if (!authUser?.emailVerificationTime || authUser.isAnonymous) throw new Error("Verified Google Mentor sign-in required.");
    const google = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", authUser._id).eq("provider", "google")).first();
    if (!google) throw new Error("Verified Google Mentor sign-in required.");
    const mentor = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUser._id)).unique();
    if (!mentor?.active || mentor.role !== "mentor" || mentor.email.toLowerCase() !== mentorEmail) throw new Error("Expected existing active Mentor not found; no account or role will be changed.");
    if (mentor.financialEdit) throw new Error("Financial editing is already enabled; Travel Lead grant refused.");
    if (mentor.travelLead) return { mentorId: mentor._id, changed: false };
    await ctx.db.patch(mentor._id, { travelLead: true });
    await ctx.db.insert("audit", { actorId: coach._id, entity: "appUsers", entityId: mentor._id, action: "grantDevelopmentTravelLead", beforeJson: JSON.stringify({ role: "mentor", travelLead: false, financialEdit: false }), afterJson: JSON.stringify({ role: "mentor", travelLead: true, financialEdit: false }), reason: "Owner-authorized development Travel Lead test; financial editing remains disabled", at: Date.now() });
    return { mentorId: mentor._id, changed: true };
  },
});

export const firstCoach = internalMutation({
  args: {
    authUserId: v.id("users"),
    expectedEmail: v.string(),
    seasonName: v.string(),
    seasonYear: v.number(),
    startsAt: v.number(),
  },
  returns: v.object({ coachId: v.id("appUsers"), seasonId: v.id("seasons") }),
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== EXPECTED_DEV_URL) throw new Error("Bootstrap is restricted to the approved development deployment.");
    const authUser = await ctx.db.get(args.authUserId);
    if (!authUser?.email || authUser.isAnonymous || !authUser.emailVerificationTime || authUser.email.toLowerCase() !== args.expectedEmail.trim().toLowerCase()) throw new Error("A verified Google account matching expectedEmail is required.");
    const google = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", authUser._id).eq("provider", "google")).first();
    if (!google) throw new Error("This account has not completed Google sign-in.");
    if (!args.seasonName.trim() || !Number.isSafeInteger(args.seasonYear) || args.seasonYear < 2026 || !Number.isSafeInteger(args.startsAt)) throw new Error("Invalid season details.");
    const priorCoach = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "coach")).first();
    const priorSeason = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).first();
    if (priorCoach || priorSeason) {
      if (priorCoach?.authUserId === authUser._id && priorSeason && priorSeason.createdBy === priorCoach._id) return { coachId: priorCoach._id, seasonId: priorSeason._id };
      throw new Error("A Coach or active season already exists; bootstrap will not change it.");
    }
    const coachId = await ctx.db.insert("appUsers", { authUserId: authUser._id, email: authUser.email.toLowerCase(), name: authUser.name?.trim() || authUser.email, role: "coach", travelLead: false, financialEdit: true, active: true });
    const seasonId = await ctx.db.insert("seasons", { name: args.seasonName.trim(), year: args.seasonYear, status: "active", startsAt: args.startsAt, permissionVersion: "DRAFT-1", createdBy: coachId });
    await ctx.db.insert("audit", { actorId: coachId, entity: "seasons", entityId: seasonId, action: "bootstrapDevelopment", afterJson: JSON.stringify({ name: args.seasonName.trim(), year: args.seasonYear }), at: Date.now() });
    return { coachId, seasonId };
  },
});

export const seedSynthetic = internalMutation({
  args: { expectedCoachEmail: v.string() },
  returns: v.object({ studentCount: v.number(), eventCount: v.number() }),
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== EXPECTED_DEV_URL) throw new Error("Synthetic seed is restricted to the approved development deployment.");
    const coach = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "coach")).first();
    if (!coach || !coach.active || coach.email !== args.expectedCoachEmail.trim().toLowerCase()) throw new Error("Expected development Coach not found.");
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season || season.createdBy !== coach._id) throw new Error("Expected Coach-owned development season not found.");
    const existingStudents = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(1);
    const existingEvents = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(1);
    if (existingStudents.length || existingEvents.length) throw new Error("Seed requires an empty season; it will not mix with existing records.");
    const students = [];
    for (const [suffix, subteam, category] of [["A", "Mechanical", "Girls"], ["B", "Programming", "Boys"]] as const) {
      students.push(await ctx.db.insert("students", { seasonId: season._id, legalName: `Student ${suffix} Example`, preferredName: `Student ${suffix}`, email: `synthetic.student.${suffix.toLowerCase()}@example.invalid`, subteam, active: true, travelTeam: true, roomCategory: category, roomCategoryLocked: true, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
    }
    const now = Date.now();
    const eventId = await ctx.db.insert("events", { seasonId: season._id, name: "Synthetic Regional", type: "Competition", startsAt: now + 30 * 86_400_000, endsAt: now + 33 * 86_400_000, destination: "Example City", travel: "Vehicles", overnight: true, roomingEnabled: true, feeCents: 0, signupMode: "assigned", assignmentScope: "travelTeam", allowWithdrawal: false, permissionRequired: true, firstRequired: true, archived: false });
    for (const studentId of students) await ctx.db.insert("participants", { eventId, studentId, status: "confirmed", createdAt: now, updatedAt: now });
    await ctx.db.insert("audit", { actorId: coach._id, entity: "seasons", entityId: season._id, action: "seedSyntheticDevelopment", afterJson: JSON.stringify({ studentCount: students.length, eventCount: 1 }), at: now });
    return { studentCount: students.length, eventCount: 1 };
  },
});
