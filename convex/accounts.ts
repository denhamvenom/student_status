import { normalizeEmail } from "./lib/contactValidation";
import { internal } from "./_generated/api";
import { parentInviteEmailConfiguration } from "./lib/parentInviteEmail";
import { adminContactError } from "./lib/adminContact";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { audit, requireRole, viewer } from "./lib/access";
import { availableRoles } from "./lib/access";
import { getAuthSessionId } from "@convex-dev/auth/server";
import { newToken, tokenHash, verifiedAdult } from "./lib/invitationIdentity";

const RESEND_COOLDOWN_MS = 60 * 60_000;
const resendAvailableAt = (row: Doc<"adultInvitations">) => Math.max(row.emailQueuedAt ?? row.createdAt, row.emailSentAt ?? row.createdAt) + RESEND_COOLDOWN_MS;
const emailStatus = v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("not_sent"));
const adultRole = v.union(v.literal("coach"), v.literal("mentor"));
const staffAccess = v.union(v.literal("mentor"), v.literal("travelLead"));
const operatingRoleValidator = v.union(v.literal("parent"), staffAccess);

export const parents = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ userId: v.id("appUsers"), name: v.string(), email: v.string(), active: v.boolean(), revision: v.number(), staffAccess: v.union(staffAccess, v.null()) })),
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    const result = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "parent")).paginate(args.paginationOpts);
    return { ...result, page: result.page.map(user => ({ userId: user._id, name: user.name, email: user.email, active: user.active, revision: user.accessRevision ?? 0, staffAccess: user.parentStaffAccess ?? null })) };
  },
});

export const updateParentStaffAccess = mutation({
  args: { userId: v.id("appUsers"), expectedRevision: v.number(), staffAccess: v.union(staffAccess, v.null()), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "parent") throw new ConvexError("This Parent account was not found. Reload the account list, then try again.");
    if ((user.accessRevision ?? 0) !== args.expectedRevision) throw new ConvexError("This account changed since you opened it. Reload to see the latest, then try again.");
    if (!args.reason.trim() || args.reason.trim().length > 1000) throw new ConvexError("Enter a reason (up to 1,000 characters).");
    if (!user.active && args.staffAccess !== null) throw new ConvexError("This Parent account is inactive. Reactivate it before giving staff access.");
    await ctx.db.patch(user._id, { parentStaffAccess: args.staffAccess ?? undefined, accessRevision: (user.accessRevision ?? 0) + 1 });
    await audit(ctx, actor, "appUsers", user._id, "updateParentStaffAccess", { staffAccess: user.parentStaffAccess ?? null }, { staffAccess: args.staffAccess }, args.reason.trim());
    return null;
  },
});

export const selectOperatingRole = mutation({
  args: { role: operatingRoleValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    const user = await ctx.db.get(actor._id);
    if (!user || !availableRoles(user).includes(args.role)) throw new ConvexError("This role is not available for your account. Choose another role, or ask a Coach to update your access.");
    const sessionId = await getAuthSessionId(ctx);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (!session || session.userId !== user.authUserId || session.expirationTime <= Date.now()) throw new ConvexError("Sign in again to choose your role.");
    const prior = await ctx.db.query("operatingRoles").withIndex("by_sessionId", q => q.eq("sessionId", session._id)).unique();
    const selection = { userId: user._id, sessionId: session._id, role: args.role, accessRevision: user.accessRevision ?? 0 };
    if (prior) await ctx.db.replace(prior._id, selection);
    else await ctx.db.insert("operatingRoles", selection);
    return null;
  },
});
const grantFields = { role: adultRole, travelLead: v.boolean(), financialEdit: v.boolean(), healthExport: v.boolean() };
const adultSummary = v.object({ userId: v.id("appUsers"), name: v.string(), email: v.string(), ...grantFields, active: v.boolean(), revision: v.number() });
function grants(value: { role: "coach" | "mentor"; travelLead: boolean; financialEdit: boolean; healthExport: boolean }) {
  if (value.role === "coach" && (value.travelLead || value.financialEdit || value.healthExport)) throw new ConvexError("Coaches already have Travel Lead, Money editing access and Health export access. Turn those options off for a Coach.");
  if (value.role === "mentor" && !value.travelLead && (value.financialEdit || value.healthExport)) throw new ConvexError("Money editing access and Health export access are only for Travel Leads. Turn on Travel Lead, or turn those options off.");
}
function summary(user: Doc<"appUsers">) {
  if (user.role !== "coach" && user.role !== "mentor") throw new ConvexError("This is not a Coach or Mentor account. Reload the account list.");
  return { userId: user._id, name: user.name, email: user.email, role: user.role, travelLead: user.role === "mentor" && user.travelLead, financialEdit: user.role === "mentor" && user.financialEdit, healthExport: user.role === "mentor" && (user.healthExport ?? false), active: user.active, revision: user.accessRevision ?? 0 };
}

export const workspace = query({
  args: { role: adultRole, paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(adultSummary),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const result = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", args.role)).paginate(args.paginationOpts);
    return { ...result, page: result.page.map(summary) };
  },
});

export const invitations = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(v.object({ invitationId: v.id("adultInvitations"), email: v.string(), ...grantFields, status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("replaced")), createdAt: v.number(), expiresAt: v.number(), emailStatus, emailError: v.union(v.string(), v.null()), resendAvailableAt: v.number() })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const result = await ctx.db.query("adultInvitations").withIndex("by_email_and_status").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(row => ({ invitationId: row._id, email: row.email, role: row.role, travelLead: row.travelLead, financialEdit: row.financialEdit, healthExport: row.healthExport, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt, emailStatus: row.emailStatus ?? "not_sent" as const, emailError: row.emailError ?? null, resendAvailableAt: resendAvailableAt(row) })) };
  },
});

export const inviteAdult = mutation({
  args: { email: v.string(), ...grantFields }, returns: v.object({ invitationId: v.id("adultInvitations"), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); grants(args);
    if (!parentInviteEmailConfiguration()) throw adminContactError("inviteEmailNotConfigured", "Invitation email is not configured, so nothing was sent.");
    const email = normalizeEmail(args.email, "Account email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ConvexError("Enter a valid email address, like name@example.com.");
    const existing = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(2);
    if (existing.length) throw new ConvexError("This email already has an account. Change its access in the account list instead.");
    const prior = await ctx.db.query("adultInvitations").withIndex("by_email_and_status", q => q.eq("email", email).eq("status", "pending")).take(101);
    if (prior.length > 100) throw new ConvexError("This email has too many open invitations. Revoke them, then send a new one.");
    const latest = await ctx.db.query("adultInvitations").withIndex("by_email_and_createdAt", q => q.eq("email", email)).order("desc").first();
    if (latest && resendAvailableAt(latest) > Date.now()) throw new ConvexError("This invitation was sent less than one hour ago. Wait, then resend it.");
    for (const row of prior) await ctx.db.patch(row._id, { status: "replaced" });
    const token = newToken(); const now = Date.now(); const expiresAt = now + 7 * 86400000;
    const invitationId = await ctx.db.insert("adultInvitations", { email, role: args.role, travelLead: args.travelLead, financialEdit: args.financialEdit, healthExport: args.healthExport, tokenHash: await tokenHash(token), status: "pending", createdBy: actor._id, createdAt: now, expiresAt, emailStatus: "queued", emailQueuedAt: now, emailAttempt: 0 });
    await audit(ctx, actor, "adultInvitations", invitationId, "create", null, { email, role: args.role, travelLead: args.travelLead, financialEdit: args.financialEdit, healthExport: args.healthExport, expiresAt });
    await ctx.scheduler.runAfter(0, internal.adultInviteEmail.send, { inviteId: invitationId, token, attempt: 1 });
    await ctx.scheduler.runAfter(20 * 60_000, internal.adultInviteEmail.markStalled, { inviteId: invitationId, hash: await tokenHash(token) });
    return { invitationId, expiresAt };
  },
});

export const resendInvitation = mutation({
  args: { invitationId: v.id("adultInvitations") }, returns: v.object({ invitationId: v.id("adultInvitations"), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    if (!parentInviteEmailConfiguration()) throw adminContactError("inviteEmailNotConfigured", "Invitation email is not configured, so nothing was sent.");
    const row = await ctx.db.get(args.invitationId); const now = Date.now();
    if (!row || row.status !== "pending" || row.expiresAt <= now) throw new ConvexError("This is no longer an active invitation. It was accepted, revoked or has expired. Reload the list, then send a new invitation if needed.");
    const issuer = await ctx.db.get(row.createdBy);
    if (!issuer?.active || issuer.role !== "coach") throw new ConvexError("The Coach who sent this invitation no longer has Coach access. Send a new invitation.");
    if (resendAvailableAt(row) > now) throw new ConvexError("This invitation was sent less than one hour ago. Wait, then resend it.");
    if ((await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", row.email)).take(1)).length) throw new ConvexError("This email already has an account. Change its access in the account list instead.");
    const token = newToken(); const hash = await tokenHash(token); const expiresAt = now + 7 * 86400000;
    await ctx.db.patch(row._id, { tokenHash: hash, createdBy: actor._id, expiresAt, emailStatus: "queued", emailQueuedAt: now, emailAttempt: 0, emailError: undefined, emailSentAt: undefined });
    await ctx.scheduler.runAfter(0, internal.adultInviteEmail.send, { inviteId: row._id, token, attempt: 1 });
    await ctx.scheduler.runAfter(20 * 60_000, internal.adultInviteEmail.markStalled, { inviteId: row._id, hash });
    await audit(ctx, actor, "adultInvitations", row._id, "resend", null, { email: row.email, expiresAt });
    return { invitationId: row._id, expiresAt };
  },
});

export const revokeInvitation = mutation({
  args: { invitationId: v.id("adultInvitations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const row = await ctx.db.get(args.invitationId);
    if (!row || row.status !== "pending") throw new ConvexError("This invitation was already accepted or revoked. Reload the list.");
    await ctx.db.patch(row._id, { status: "revoked" });
    await audit(ctx, actor, "adultInvitations", row._id, "revoke", "pending", "revoked");
    return null;
  },
});

export const preview = mutation({
  args: { token: v.string() }, returns: v.object({ status: v.union(v.literal("valid"), v.literal("unavailable"), v.literal("verifiedAccountRequired"), v.literal("accountConflict")), email: v.union(v.string(), v.null()), role: v.union(adultRole, v.null()), travelLead: v.boolean(), financialEdit: v.boolean(), healthExport: v.boolean(), expiresAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const hidden = { status: "unavailable" as const, email: null, role: null, travelLead: false, financialEdit: false, healthExport: false, expiresAt: null };
    if (!/^[0-9a-f]{64}$/.test(args.token)) return hidden;
    const hash = await tokenHash(args.token);
    const actual = await ctx.db.query("adultInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
    if (!actual || actual.status !== "pending" || actual.expiresAt <= Date.now()) return hidden;
    const issuer = await ctx.db.get(actual.createdBy);
    if (!issuer?.active || issuer.role !== "coach") return hidden;
    const who = await verifiedAdult(ctx);
    if (!who || who.email !== actual.email) return { ...hidden, status: "verifiedAccountRequired" as const };
    const account = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
    const emailAccounts = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", who.email)).take(2);
    if (account || emailAccounts.length) return { ...hidden, status: "accountConflict" as const };
    return { status: "valid" as const, email: actual.email, role: actual.role, travelLead: actual.travelLead, financialEdit: actual.financialEdit, healthExport: actual.healthExport, expiresAt: actual.expiresAt };
  },
});

export const accept = mutation({
  args: { token: v.string() }, returns: v.object({ userId: v.id("appUsers") }),
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.token)) throw new ConvexError("This invitation link is not valid. Use the full link from the email, or ask a Coach for a new invitation.");
    const hash = await tokenHash(args.token);
    const row = await ctx.db.query("adultInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
    if (!row || row.status !== "pending" || row.expiresAt <= Date.now()) throw new ConvexError("This invitation is unavailable because it expired or was already used. Ask a Coach for a new invitation.");
    const issuer = await ctx.db.get(row.createdBy);
    if (!issuer?.active || issuer.role !== "coach") throw new ConvexError("The Coach who sent this invitation no longer has Coach access. Ask a Coach for a new invitation.");
    const who = await verifiedAdult(ctx);
    if (!who || who.email !== row.email) throw new ConvexError("Sign in with the email address this invitation was sent to, using a verified Google account or an email code.");
    if (await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique() || (await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", who.email)).take(2)).length) throw new ConvexError("This account already has access or another role. Ask a Coach for help.");
    const priorJoins = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).take(21);
    const priorBulk = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).take(21);
    if (priorJoins.length > 20 || priorBulk.length > 20 || priorJoins.some(request => request.status === "approved") || priorBulk.some(request => request.status === "approved")) throw new ConvexError("This sign-in was already used to join the team as a student, so it can't accept this invitation. Ask a Coach for help.");
    grants(row);
    const userId = await ctx.db.insert("appUsers", { authUserId: who.authUserId, email: who.email, name: who.name, role: row.role, travelLead: row.travelLead, financialEdit: row.financialEdit, healthExport: row.healthExport, active: true, accessRevision: 0 });
    await ctx.db.patch(row._id, { status: "accepted", acceptedBy: userId, acceptedAt: Date.now() });
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("Your account could not be created. Open the invitation link again. If it keeps happening, contact a Coach.");
    await audit(ctx, user, "adultInvitations", row._id, "accept", "pending", summary(user));
    for (const request of priorJoins) if (request.status === "pending") {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: Date.now(), decidedBy: user._id });
      await audit(ctx, user, "joinRequests", request._id, "supersededByAdultInvite", "pending", "declined");
    }
    for (const request of priorBulk) if (request.status === "pending") {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: Date.now(), decidedBy: user._id });
      await audit(ctx, user, "bulkInviteConnectionRequests", request._id, "supersededByAdultInvite", "pending", "declined");
    }
    return { userId };
  },
});

export const updateAdult = mutation({
  args: { userId: v.id("appUsers"), expectedRevision: v.number(), ...grantFields, active: v.boolean(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); grants(args);
    const user = await ctx.db.get(args.userId);
    if (!user || (user.role !== "coach" && user.role !== "mentor")) throw new ConvexError("This Coach or Mentor account was not found. Student and Parent accounts cannot be converted here.");
    if ((user.accessRevision ?? 0) !== args.expectedRevision) throw new ConvexError("This account changed since you opened it. Reload to see the latest, then try again.");
    if (!args.reason.trim() || args.reason.trim().length > 1000) throw new ConvexError("Enter a reason (up to 1,000 characters).");
    if (user.active && user.role === "coach" && (!args.active || args.role !== "coach")) {
      const coaches = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "coach")).take(501);
      if (coaches.length > 500) throw adminContactError("tooManyCoaches", "There are too many Coach accounts to check this change.");
      if (!coaches.some(coach => coach._id !== user._id && coach.active)) throw new ConvexError("The last active Coach can't lose Coach access. Give another account Coach access first.");
    }
    const patch = { role: args.role, travelLead: args.travelLead, financialEdit: args.financialEdit, healthExport: args.healthExport, active: args.active, accessRevision: (user.accessRevision ?? 0) + 1, ...(user.active && !args.active ? { archivedAt: Date.now() } : {}) };
    await ctx.db.patch(user._id, patch);
    await audit(ctx, actor, "appUsers", user._id, "updateAdultAccess", { ...summary(user), archivedAt: user.archivedAt ?? null }, { ...patch, archivedAt: patch.archivedAt ?? user.archivedAt ?? null }, args.reason.trim());
    return null;
  },
});
