import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { RateLimiter } from "@convex-dev/rate-limiter";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, ownStudent, requireRole, requireSeasonProfileWritable, viewer } from "./lib/access";
import { emailKey, tokenHash, newToken, verifiedGoogle } from "./lib/invitationIdentity";
import { parentInviteEmailConfiguration } from "./lib/parentInviteEmail";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 60 * 1000;
const resendAvailableAt = (row: Doc<"parentInvitations">) => Math.max(row.createdAt, row.emailSentAt ?? row.createdAt) + RESEND_COOLDOWN_MS;
const ATTESTATION_VERSION = "parent-relationship-1";
const ATTESTATION_TEXT = "I attest that I am this student's parent or legal guardian, that I have legal authority to access this student's information, and that the relationship I entered is accurate. Linking my account does not sign travel or medication consent.";
type Ctx = QueryCtx | MutationCtx;
const emailLimiter = new RateLimiter(components.rateLimiter, {
  parentInviteEmailHourly: { kind: "fixed window", rate: 3, period: 60 * 60 * 1000 },
  parentInviteEmailDaily: { kind: "fixed window", rate: 10, period: 24 * 60 * 60 * 1000 },
});

async function setting(ctx: Ctx) {
  return ctx.db.query("parentInvitationSettings").withIndex("by_key", q => q.eq("key", "team")).unique();
}
async function eligibleStudent(ctx: Ctx, studentId: Id<"students">) {
  const season = await activeSeason(ctx);
  const student = await ctx.db.get(studentId);
  if (!student || !student.active || student.seasonId !== season._id) throw new Error("Student is unavailable in the active season.");
  return student;
}
async function existingParent(ctx: Ctx, authUserId: Id<"users">) {
  return ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
}
async function emailAccountConflict(ctx: Ctx, email: string, authUserId: Id<"users">) {
  const users = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(20);
  return users.some(user => user.authUserId !== authUserId || !user.active || user.role !== "parent");
}
async function revokedLinkForEmail(ctx: Ctx, studentId: Id<"students">, email: string) {
  const users = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(20);
  for (const user of users) {
    const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", user._id).eq("studentId", studentId)).unique();
    if (link && !link.active) return true;
  }
  return false;
}

async function queueParentInvite(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">, parentEmail: string, previous: Doc<"parentInvitations">[]) {
  const emailConfiguration = parentInviteEmailConfiguration();
  if (emailConfiguration) {
    const key = `${student._id}:${parentEmail}`;
    if (!(await emailLimiter.limit(ctx, "parentInviteEmailHourly", { key })).ok ||
        !(await emailLimiter.limit(ctx, "parentInviteEmailDaily", { key: actor._id })).ok) {
      throw new Error("Too many email invitations. Wait before creating another link.");
    }
  }
  for (const row of previous) await ctx.db.patch(row._id, { status: "replaced" });
  const token = newToken();
  const now = Date.now();
  const expiresAt = now + WEEK_MS;
  const inviteId = await ctx.db.insert("parentInvitations", { studentId: student._id, parentEmail, tokenHash: await tokenHash(token), status: "pending", emailStatus: emailConfiguration ? "queued" : "not_sent", emailError: emailConfiguration ? undefined : "Automatic email is not configured. Share the link directly.", createdBy: actor._id, createdAt: now, expiresAt });
  if (emailConfiguration) {
    await ctx.scheduler.runAfter(0, internal.parentInviteEmail.send, { inviteId, token, attempt: 1 });
    await ctx.scheduler.runAfter(20 * 60_000, internal.parentInviteEmail.markStalled, { inviteId });
  }
  return { token, expiresAt, inviteId };
}

export const invitationSettings = query({
  args: {}, returns: v.object({ enabled: v.boolean() }),
  handler: async ctx => { await viewer(ctx); return { enabled: (await setting(ctx))?.enabled ?? true }; },
});

export const setInvitationEnabled = mutation({
  args: { enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const old = await setting(ctx);
    if (old) await ctx.db.patch(old._id, { enabled: args.enabled, updatedBy: actor._id, updatedAt: Date.now() });
    else await ctx.db.insert("parentInvitationSettings", { key: "team", enabled: args.enabled, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor, "parentInvitationSettings", "team", "setEnabled", old?.enabled ?? true, args.enabled);
    return null;
  },
});

export const createParentInvite = mutation({
  args: { studentId: v.id("students"), parentEmail: v.string() },
  returns: v.object({ token: v.string(), expiresAt: v.number(), inviteId: v.id("parentInvitations") }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "student");
    const own = await ownStudent(ctx, actor);
    if (own._id !== args.studentId) throw new Error("You can invite a parent for your own student record only.");
    if ((await setting(ctx))?.enabled === false) throw new Error("Parent invitations are disabled. Ask a Coach for help.");
    const student = await eligibleStudent(ctx, args.studentId);
    const parentEmail = emailKey(args.parentEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail) || parentEmail.length > 254) throw new Error("Enter a valid parent email.");
    if (parentEmail === emailKey(actor.email) || parentEmail === emailKey(student.email)) throw new Error("A student cannot invite their own identity as a parent.");
    if (await revokedLinkForEmail(ctx, student._id, parentEmail)) throw new Error("A Coach must resolve this revoked family link.");
    const revoked = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail_and_status", q => q.eq("studentId", student._id).eq("parentEmail", parentEmail).eq("status", "revoked")).first();
    if (revoked) throw new Error("A Coach must resolve this revoked invitation.");
    const previous = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail_and_status", q => q.eq("studentId", student._id).eq("parentEmail", parentEmail).eq("status", "pending")).take(101);
    if (previous.length > 100) throw new Error("Too many pending invitations. Ask a Coach for help.");
    const now = Date.now();
    if (previous.some(row => row.expiresAt > now && resendAvailableAt(row) > now)) {
      throw new Error("Wait one hour before sending another invitation to this parent.");
    }
    const result = await queueParentInvite(ctx, actor, student, parentEmail, previous);
    await audit(ctx, actor, "parentInvitations", result.inviteId, "create", null, { studentId: student._id, parentEmail, expiresAt: result.expiresAt });
    return result;
  },
});

export const resendParentInvite = mutation({
  args: { inviteId: v.id("parentInvitations") },
  returns: v.object({ token: v.string(), expiresAt: v.number(), inviteId: v.id("parentInvitations") }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "student");
    const own = await ownStudent(ctx, actor);
    if ((await setting(ctx))?.enabled === false) throw new Error("Parent invitations are disabled. Ask a Coach for help.");
    const old = await ctx.db.get(args.inviteId);
    if (!old || old.studentId !== own._id || old.status !== "pending" || old.expiresAt <= Date.now()) throw new Error("Pending invitation unavailable.");
    const student = await eligibleStudent(ctx, own._id);
    const latest = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail", q => q.eq("studentId", own._id).eq("parentEmail", old.parentEmail)).order("desc").first();
    if (latest?._id !== old._id) throw new Error("Only the latest pending invitation can be resent.");
    const now = Date.now();
    if (resendAvailableAt(old) > now) throw new Error("Wait one hour before resending this invitation.");
    if (await revokedLinkForEmail(ctx, student._id, old.parentEmail)) throw new Error("A Coach must resolve this revoked family link.");
    const revoked = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_parentEmail_and_status", q => q.eq("studentId", student._id).eq("parentEmail", old.parentEmail).eq("status", "revoked")).first();
    if (revoked) throw new Error("A Coach must resolve this revoked invitation.");
    const result = await queueParentInvite(ctx, actor, student, old.parentEmail, [old]);
    await audit(ctx, actor, "parentInvitations", result.inviteId, "resend", { replacedInviteId: old._id }, { studentId: student._id, parentEmail: old.parentEmail, expiresAt: result.expiresAt });
    return result;
  },
});

export const previewParentInvite = mutation({
  args: { token: v.string() },
  returns: v.object({ status: v.union(v.literal("valid"), v.literal("unavailable"), v.literal("signInRequired"), v.literal("emailMismatch"), v.literal("accountConflict"), v.literal("coachReviewRequired")), studentName: v.union(v.string(), v.null()), parentEmail: v.union(v.string(), v.null()), expiresAt: v.union(v.number(), v.null()), attestationText: v.union(v.string(), v.null()), attestationVersion: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const hidden = { status: "unavailable" as const, studentName: null, parentEmail: null, expiresAt: null, attestationText: null, attestationVersion: null };
    if (!/^[0-9a-f]{64}$/.test(args.token)) return hidden;
    const hash = await tokenHash(args.token);
    const row = await ctx.db.query("parentInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
    if (!row || row.status !== "pending" || row.expiresAt <= Date.now()) return hidden;
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return { ...hidden, status: "signInRequired" as const };
    const who = await verifiedGoogle(ctx);
    if (!who || who.email !== row.parentEmail) return { ...hidden, status: "emailMismatch" as const };
    const student = await ctx.db.get(row.studentId);
    const season = await activeSeason(ctx);
    if (!student || !student.active || student.seasonId !== season._id || emailKey(student.email) === who.email) return hidden;
    const parent = await existingParent(ctx, who.authUserId);
    if ((parent && (!parent.active || parent.role !== "parent")) || await emailAccountConflict(ctx, who.email, who.authUserId)) return { ...hidden, status: "accountConflict" as const };
    if (parent) {
      const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", student._id)).unique();
      if (link && !link.active) return { ...hidden, status: "coachReviewRequired" as const };
    }
    return { status: "valid" as const, studentName: student.preferredName, parentEmail: row.parentEmail, expiresAt: row.expiresAt, attestationText: ATTESTATION_TEXT, attestationVersion: ATTESTATION_VERSION };
  },
});

export const acceptParentInvite = mutation({
  args: { token: v.string(), relationship: v.string(), authorityAttested: v.boolean(), attestationVersion: v.string() },
  returns: v.object({ studentId: v.id("students") }),
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.token)) throw new Error("Invitation unavailable.");
    const hash = await tokenHash(args.token);
    const row = await ctx.db.query("parentInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
    if (!row || row.status !== "pending" || row.expiresAt <= Date.now()) throw new Error("Invitation unavailable or expired.");
    const who = await verifiedGoogle(ctx);
    if (!who || who.email !== row.parentEmail) throw new Error("Sign in with the invited verified Google email.");
    const relationship = args.relationship.trim();
    if (!relationship || relationship.length > 80 || !args.authorityAttested || args.attestationVersion !== ATTESTATION_VERSION) throw new Error("Current relationship and legal guardian authority attestation are required.");
    const student = await eligibleStudent(ctx, row.studentId);
    await requireSeasonProfileWritable(ctx, student.seasonId);
    if (who.email === emailKey(student.email)) throw new Error("A student cannot link their own identity as a parent.");
    let parent = await existingParent(ctx, who.authUserId);
    if ((parent && (!parent.active || parent.role !== "parent")) || await emailAccountConflict(ctx, who.email, who.authUserId)) throw new Error("This account has another role or is inactive. Ask a Coach for help.");
    if (await revokedLinkForEmail(ctx, student._id, who.email)) throw new Error("A Coach must resolve this revoked family link.");
    if (!parent) {
      const parentId = await ctx.db.insert("appUsers", { authUserId: who.authUserId, email: who.email, name: who.name, role: "parent", travelLead: false, financialEdit: false, active: true });
      parent = await ctx.db.get(parentId) as Doc<"appUsers">;
    }
    const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", student._id)).unique();
    if (link && !link.active) throw new Error("A Coach must resolve this revoked family link.");
    if (link?.seasonId && link.seasonId !== student.seasonId) throw new Error("Family link season changed; a Coach must review it.");
    if (link && !link.seasonId) await ctx.db.patch(link._id, { seasonId: student.seasonId });
    if (!link) await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: student._id, seasonId: student.seasonId, active: true, createdBy: parent._id });
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "accepted", acceptedBy: parent._id, acceptedAt: now, relationship, attestationVersion: ATTESTATION_VERSION, attestationText: ATTESTATION_TEXT, attestedAt: now });
    await audit(ctx, parent, "parentInvitations", row._id, "accept", { status: "pending" }, { studentId: student._id, parentEmail: row.parentEmail, relationship, attestationVersion: ATTESTATION_VERSION, attestationText: ATTESTATION_TEXT, attestedAt: now });
    const joinRequests = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).take(20);
    for (const request of joinRequests) if (request.status === "pending") {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: now, decidedBy: parent._id });
      await audit(ctx, parent, "joinRequests", request._id, "supersededByParentInvite", "pending", "declined");
    }
    return { studentId: student._id };
  },
});

async function studentManager(ctx: Ctx, studentId: Id<"students">) {
  const actor = await viewer(ctx);
  if (actor.role === "coach") { await eligibleStudent(ctx, studentId); return actor; }
  requireRole(actor, "student");
  const own = await ownStudent(ctx, actor);
  if (own._id !== studentId) throw new Error("You do not have permission for this student.");
  await eligibleStudent(ctx, studentId);
  return actor;
}

export const listStudentInvites = query({
  args: { studentId: v.id("students") },
  returns: v.array(v.object({ _id: v.id("parentInvitations"), parentEmail: v.string(), status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("replaced")), emailStatus: v.union(v.literal("not_sent"), v.literal("queued"), v.literal("sent"), v.literal("failed")), emailError: v.union(v.string(), v.null()), createdAt: v.number(), resendAvailableAt: v.number(), expiresAt: v.number(), acceptedAt: v.union(v.number(), v.null()) })),
  handler: async (ctx, args) => {
    await studentManager(ctx, args.studentId);
    const recent = await ctx.db.query("parentInvitations").withIndex("by_studentId", q => q.eq("studentId", args.studentId)).order("desc").take(100);
    const pending = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_status", q => q.eq("studentId", args.studentId).eq("status", "pending")).take(101);
    const revoked = await ctx.db.query("parentInvitations").withIndex("by_studentId_and_status", q => q.eq("studentId", args.studentId).eq("status", "revoked")).take(101);
    if (pending.length > 100 || revoked.length > 100) throw new Error("Too many actionable invitations. Ask a Coach for help.");
    const byId = new Map([...recent, ...pending, ...revoked].map(row => [row._id, row]));
    const rows = [...byId.values()].sort((a, b) => b._creationTime - a._creationTime);
    return rows.map(row => ({ _id: row._id, parentEmail: row.parentEmail, status: row.status, emailStatus: row.emailStatus ?? "not_sent" as const, emailError: row.emailError ?? null, createdAt: row.createdAt, resendAvailableAt: resendAvailableAt(row), expiresAt: row.expiresAt, acceptedAt: row.acceptedAt ?? null }));
  },
});

export const listFamilyLinks = query({
  args: { studentId: v.id("students") },
  returns: v.array(v.object({ _id: v.id("familyLinks"), parentName: v.string(), parentEmail: v.string(), active: v.boolean(), revokedAt: v.union(v.number(), v.null()) })),
  handler: async (ctx, args) => {
    await studentManager(ctx, args.studentId);
    const rows = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", args.studentId)).take(100);
    const parents = await Promise.all(rows.map(row => ctx.db.get(row.parentUserId)));
    return rows.map((row, i) => ({ _id: row._id, parentName: parents[i]?.name ?? "Parent", parentEmail: parents[i]?.email ?? "", active: row.active, revokedAt: row.revokedAt ?? null }));
  },
});

export const revokeParentInvite = mutation({
  args: { inviteId: v.id("parentInvitations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const row = await ctx.db.get(args.inviteId);
    if (!row || row.status !== "pending") throw new Error("Pending invitation not found.");
    await ctx.db.patch(row._id, { status: "revoked" });
    await audit(ctx, actor, "parentInvitations", row._id, "revoke", "pending", "revoked");
    return null;
  },
});

export const allowParentReinvite = mutation({
  args: { inviteId: v.id("parentInvitations"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const row = await ctx.db.get(args.inviteId);
    if (!row || row.status !== "revoked" || !args.reason.trim()) throw new Error("Revoked invitation and reason are required.");
    await ctx.db.patch(row._id, { status: "replaced" });
    await audit(ctx, actor, "parentInvitations", row._id, "allowReinvite", "revoked", "replaced", args.reason.trim());
    return null;
  },
});

export const revokeFamilyLink = mutation({
  args: { linkId: v.id("familyLinks") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const link = await ctx.db.get(args.linkId);
    if (!link || !link.active) throw new Error("Active family link not found.");
    await ctx.db.patch(link._id, { active: false, revokedAt: Date.now(), revokedBy: actor._id });
    const source = await ctx.db.get(link.studentId);
    if (source) {
      const plan = await ctx.db.query("seasonTransitionPlans").withIndex("by_sourceSeasonId_and_open", q => q.eq("sourceSeasonId", source.seasonId).eq("open", true)).unique();
      if (plan) {
        const mapping = await ctx.db.query("seasonTransitionRosterDecisions").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", plan._id).eq("sourceStudentId", source._id)).unique();
        if (mapping?.targetStudentId) {
          const target = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", link.parentUserId).eq("studentId", mapping.targetStudentId!)).unique();
          if (target?.active) {
            await ctx.db.patch(target._id, { active: false, revokedAt: Date.now(), revokedBy: actor._id });
            await audit(ctx, actor, "familyLinks", target._id, "revokeDuringTransition", true, false);
          }
        }
      }
    }
    await audit(ctx, actor, "familyLinks", link._id, "revoke", true, false);
    return null;
  },
});

export const restoreFamilyLink = mutation({
  args: { linkId: v.id("familyLinks"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const link = await ctx.db.get(args.linkId);
    if (!link || link.active || !args.reason.trim()) throw new Error("Revoked family link and reason are required.");
    const student = await eligibleStudent(ctx, link.studentId);
    await requireSeasonProfileWritable(ctx, student.seasonId);
    const parent = await ctx.db.get(link.parentUserId);
    if (!parent || !parent.active || parent.role !== "parent" || parent.email === student.email) throw new Error("This family link cannot be restored.");
    if (link.seasonId && link.seasonId !== student.seasonId) throw new Error("Family link season changed; a Coach must review it.");
    await ctx.db.patch(link._id, { active: true, seasonId: student.seasonId, revokedAt: undefined, revokedBy: undefined });
    await audit(ctx, actor, "familyLinks", link._id, "restore", false, true, args.reason.trim());
    return null;
  },
});
