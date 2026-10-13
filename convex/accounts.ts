import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { audit, requireRole, viewer } from "./lib/access";
import { emailKey, newToken, tokenHash, verifiedGoogle } from "./lib/invitationIdentity";

const adultRole = v.union(v.literal("coach"), v.literal("mentor"));
const grantFields = { role: adultRole, travelLead: v.boolean(), financialEdit: v.boolean(), healthExport: v.boolean() };
const adultSummary = v.object({ userId: v.id("appUsers"), name: v.string(), email: v.string(), ...grantFields, active: v.boolean(), revision: v.number() });
function grants(value: { role: "coach" | "mentor"; travelLead: boolean; financialEdit: boolean; healthExport: boolean }) {
  if (value.role === "coach" && (value.travelLead || value.financialEdit || value.healthExport)) throw new Error("Coach access includes these capabilities; separate grants are for Travel Leads.");
  if (value.role === "mentor" && !value.travelLead && (value.financialEdit || value.healthExport)) throw new Error("Separate finance and health export grants require Travel Lead access.");
}
function summary(user: Doc<"appUsers">) {
  if (user.role !== "coach" && user.role !== "mentor") throw new Error("Adult account required.");
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
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(v.object({ invitationId: v.id("adultInvitations"), email: v.string(), ...grantFields, status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("replaced")), createdAt: v.number(), expiresAt: v.number() })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const result = await ctx.db.query("adultInvitations").withIndex("by_email_and_status").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(row => ({ invitationId: row._id, email: row.email, role: row.role, travelLead: row.travelLead, financialEdit: row.financialEdit, healthExport: row.healthExport, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt })) };
  },
});

export const inviteAdult = mutation({
  args: { email: v.string(), ...grantFields }, returns: v.object({ token: v.string(), invitationId: v.id("adultInvitations"), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); grants(args);
    const email = emailKey(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid Google account email.");
    const existing = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(2);
    if (existing.length) throw new Error("This email already has an account. Use account controls instead.");
    const prior = await ctx.db.query("adultInvitations").withIndex("by_email_and_status", q => q.eq("email", email).eq("status", "pending")).take(101);
    if (prior.length > 100) throw new Error("Invitation limit reached; Coach review is required.");
    for (const row of prior) await ctx.db.patch(row._id, { status: "replaced" });
    const token = newToken(); const now = Date.now(); const expiresAt = now + 7 * 86400000;
    const invitationId = await ctx.db.insert("adultInvitations", { email, role: args.role, travelLead: args.travelLead, financialEdit: args.financialEdit, healthExport: args.healthExport, tokenHash: await tokenHash(token), status: "pending", createdBy: actor._id, createdAt: now, expiresAt });
    await audit(ctx, actor, "adultInvitations", invitationId, "create", null, { email, role: args.role, travelLead: args.travelLead, financialEdit: args.financialEdit, healthExport: args.healthExport, expiresAt });
    return { token, invitationId, expiresAt };
  },
});

export const revokeInvitation = mutation({
  args: { invitationId: v.id("adultInvitations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const row = await ctx.db.get(args.invitationId);
    if (!row || row.status !== "pending") throw new Error("Pending invitation not found.");
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
    const who = await verifiedGoogle(ctx);
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
    if (!/^[0-9a-f]{64}$/.test(args.token)) throw new Error("Invitation unavailable.");
    const hash = await tokenHash(args.token);
    const row = await ctx.db.query("adultInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
    if (!row || row.status !== "pending" || row.expiresAt <= Date.now()) throw new Error("Invitation unavailable or expired.");
    const issuer = await ctx.db.get(row.createdBy);
    if (!issuer?.active || issuer.role !== "coach") throw new Error("Inviting Coach access was removed. Ask a Coach for a new invitation.");
    const who = await verifiedGoogle(ctx);
    if (!who || who.email !== row.email) throw new Error("Sign in with the invited verified Google email.");
    if (await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique() || (await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", who.email)).take(2)).length) throw new Error("This account already has access or another role. Ask a Coach for help.");
    grants(row);
    const userId = await ctx.db.insert("appUsers", { authUserId: who.authUserId, email: who.email, name: who.name, role: row.role, travelLead: row.travelLead, financialEdit: row.financialEdit, healthExport: row.healthExport, active: true, accessRevision: 0 });
    await ctx.db.patch(row._id, { status: "accepted", acceptedBy: userId, acceptedAt: Date.now() });
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("New account is unavailable.");
    await audit(ctx, user, "adultInvitations", row._id, "accept", "pending", summary(user));
    const joinRequests = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).take(21);
    if (joinRequests.length > 20) throw new Error("Join request history limit reached; Coach review is required.");
    for (const request of joinRequests) if (request.status === "pending") {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: Date.now(), decidedBy: user._id });
      await audit(ctx, user, "joinRequests", request._id, "supersededByAdultInvite", "pending", "declined");
    }
    return { userId };
  },
});

export const updateAdult = mutation({
  args: { userId: v.id("appUsers"), expectedRevision: v.number(), ...grantFields, active: v.boolean(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); grants(args);
    const user = await ctx.db.get(args.userId);
    if (!user || (user.role !== "coach" && user.role !== "mentor")) throw new Error("Adult account not found. Student and parent roles cannot be converted here.");
    if ((user.accessRevision ?? 0) !== args.expectedRevision) throw new Error("Account changed. Reload before saving access.");
    if (!args.reason.trim() || args.reason.trim().length > 1000) throw new Error("A reason under 1000 characters is required.");
    if (user.active && user.role === "coach" && (!args.active || args.role !== "coach")) {
      const coaches = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "coach")).take(501);
      if (coaches.length > 500) throw new Error("Coach roster limit reached; account review is required.");
      if (!coaches.some(coach => coach._id !== user._id && coach.active)) throw new Error("The last active Coach cannot lose Coach access.");
    }
    const patch = { role: args.role, travelLead: args.travelLead, financialEdit: args.financialEdit, healthExport: args.healthExport, active: args.active, accessRevision: (user.accessRevision ?? 0) + 1, ...(user.active && !args.active ? { archivedAt: Date.now() } : {}) };
    await ctx.db.patch(user._id, patch);
    await audit(ctx, actor, "appUsers", user._id, "updateAdultAccess", { ...summary(user), archivedAt: user.archivedAt ?? null }, { ...patch, archivedAt: patch.archivedAt ?? user.archivedAt ?? null }, args.reason.trim());
    return null;
  },
});
