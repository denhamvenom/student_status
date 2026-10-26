import { v } from "convex/values";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit } from "./lib/access";
import { DEVELOPER_PERSONAS, developerEmail, developerKeyMatches, developerSignInEnabled, findPersona } from "./lib/developerSignIn";
import type { DeveloperPersona } from "./lib/developerSignIn";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { requireMaintenanceAccess } from "./lib/maintenanceAccess";
import { syncWholeTeamMembership } from "./lib/wholeTeam";

const limiter = new RateLimiter(components.rateLimiter, {
  developerSignIn: { kind: "fixed window", rate: 30, period: 60_000 },
});
const REASON = "Owner-authorized fictional developer account on the development deployment; no real person, money or signature.";
const persona = v.object({ id: v.string(), label: v.string(), description: v.string() });

/** Lets a local development build decide whether to show the panel. Reveals nothing beyond the fixed fictional list. */
export const available = query({
  args: {}, returns: v.union(v.null(), v.array(persona)),
  handler: async () => developerSignInEnabled() ? DEVELOPER_PERSONAS.map(({ id, label, description }) => ({ id, label, description })) : null,
});

/** Authorize step for the `developer` provider. Only ever returns an existing reserved-domain fictional account. */
export const consume = internalMutation({
  args: { persona: v.string(), key: v.string() }, returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    if (!developerSignInEnabled()) return null;
    const chosen = findPersona(args.persona);
    if (!chosen) return null;
    if (!(await limiter.limit(ctx, "developerSignIn", { key: "all" })).ok) return null;
    if (!await developerKeyMatches(args.key)) return null;
    const email = developerEmail(chosen.id);
    requireMaintenanceAccess(email);
    const users = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).take(2);
    if (users.length !== 1) return null;
    const app = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", users[0]._id)).unique();
    if (!app?.active || app.email !== email || app.role !== chosen.role) return null;
    return users[0]._id;
  },
});

type Counts = { created: number; restored: number };

async function ensureAccount(ctx: MutationCtx, chosen: DeveloperPersona, counts: Counts): Promise<Doc<"appUsers">> {
  const email = developerEmail(chosen.id);
  const users = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).take(2);
  if (users.length > 1) throw new Error(`Duplicate sign-in records for ${email}; manual review required.`);
  const authUserId: Id<"users"> = users[0]?._id ?? await ctx.db.insert("users", { email, name: chosen.name, emailVerificationTime: Date.now() });
  const sameEmail = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(2);
  if (sameEmail.some(row => row.authUserId !== authUserId)) throw new Error(`Another account uses ${email}; manual review required.`);
  const desired = { email, name: chosen.name, role: chosen.role, travelLead: chosen.travelLead, financialEdit: chosen.financialEdit, healthExport: chosen.healthExport, parentStaffAccess: chosen.parentStaffAccess, active: true };
  const existing = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
  if (!existing) {
    counts.created++;
    const id = await ctx.db.insert("appUsers", { authUserId, ...desired, accessRevision: 0 });
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Developer account was not created.");
    return row;
  }
  const changed = (Object.keys(desired) as (keyof typeof desired)[]).some(key => existing[key] !== desired[key]) || existing.archivedAt !== undefined;
  if (!changed) return existing;
  counts.restored++;
  await ctx.db.patch(existing._id, { ...desired, archivedAt: undefined, accessRevision: (existing.accessRevision ?? 0) + 1 });
  const row = await ctx.db.get(existing._id);
  if (!row) throw new Error("Developer account disappeared.");
  return row;
}

/**
 * Owner-invoked: create or restore the fixed fictional accounts after the development switch and key are set.
 * Run with `bunx convex run --deployment dev developerSignIn:ensurePersonas`. Restores grants, the Student
 * profile link and both family links if testing changed them; never touches any other account or record.
 */
export const ensurePersonas = internalMutation({
  args: {}, returns: v.object({ studentId: v.id("students"), created: v.number(), restored: v.number() }),
  handler: async ctx => {
    if (!developerSignInEnabled()) throw new Error("Developer sign-in is disabled. Set DEVELOPER_SIGN_IN_ENABLED and DEVELOPER_SIGN_IN_KEY on the development deployment first.");
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season) throw new Error("An active season is required.");
    const counts: Counts = { created: 0, restored: 0 };
    const accounts = new Map<DeveloperPersona["id"], Doc<"appUsers">>();
    for (const chosen of DEVELOPER_PERSONAS) accounts.set(chosen.id, await ensureAccount(ctx, chosen, counts));
    const coach = accounts.get("coach")!, studentAccount = accounts.get("student")!;

    const email = developerEmail("student");
    const matches = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", email)).take(2);
    if (matches.length > 1 || matches.some(row => row.userId && row.userId !== studentAccount._id)) throw new Error("Developer student record changed; manual review required.");
    let student = matches[0];
    if (!student) {
      const linked = await ctx.db.query("students").withIndex("by_seasonId_and_userId", q => q.eq("seasonId", season._id).eq("userId", studentAccount._id)).take(1);
      if (linked.length) throw new Error("Developer student account is linked to another profile; manual review required.");
      counts.created++;
      const id = await ctx.db.insert("students", { seasonId: season._id, userId: studentAccount._id, legalName: "Dev Student Example", preferredName: "Dev Student", firstName: "Dev", lastName: "Student", structuredNameReviewed: true, email, subteam: "Programming", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      student = (await ctx.db.get(id))!;
      await syncWholeTeamMembership(ctx, coach, student);
      await refreshStudentFinance(ctx, student._id);
    } else if (!student.active || student.userId !== studentAccount._id || student.archivedAt !== undefined) {
      counts.restored++;
      await ctx.db.patch(student._id, { active: true, userId: studentAccount._id, archivedAt: undefined });
      student = (await ctx.db.get(student._id))!;
      await syncWholeTeamMembership(ctx, coach, student);
    }

    for (const id of ["parent", "parentStaff"] as const) {
      const parent = accounts.get(id)!;
      const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", student._id)).unique();
      if (!link) { counts.created++; await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: student._id, seasonId: season._id, active: true, createdBy: coach._id }); }
      else if (!link.active || link.seasonId !== season._id) { counts.restored++; await ctx.db.patch(link._id, { active: true, seasonId: season._id, revokedAt: undefined, revokedBy: undefined }); }
      // Parent-only pages (Profile, Permission forms) require a verified parent, as a real email-code Parent has.
      const marker = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", parent.authUserId)).unique();
      if (!marker) { counts.created++; await ctx.db.insert("parentEmailIdentities", { authUserId: parent.authUserId, email: developerEmail(id), createdAt: Date.now() }); }
      else if (marker.email !== developerEmail(id)) throw new Error("Developer parent sign-in record changed; manual review required.");
    }
    await audit(ctx, coach, "developerSignIn", season._id, "ensureDeveloperPersonas", null, { studentId: student._id, ...counts }, REASON);
    return { studentId: student._id, ...counts };
  },
});
