import { normalizeEmail } from "./lib/contactValidation";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { emailKey, newToken, tokenHash } from "./lib/invitationIdentity";
import { parentInviteEmailConfiguration } from "./lib/parentInviteEmail";
import { requireMaintenanceAccess } from "./lib/maintenanceAccess";
import { components } from "./_generated/api";
import { RateLimiter } from "@convex-dev/rate-limiter";

const codeValidityMs = 10 * 60_000;
const validEmail = (email: string) => { try { return !!normalizeEmail(email); } catch { return false; } };
const codeLimiter = new RateLimiter(components.rateLimiter, {
  parentCodeMinute: { kind: "fixed window", rate: 1, period: 60_000 },
  parentCodeHour: { kind: "fixed window", rate: 5, period: 60 * 60_000 },
});

async function parentAccount(ctx: MutationCtx, email: string) {
  const matches = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(21);
  if (matches.length > 20 || matches.some(row => row.role !== "parent" || !row.active) || matches.length > 1) return null;
  return matches[0] ?? null;
}

async function adultAccount(ctx: MutationCtx, email: string) {
  const matches = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(2);
  if (matches.length !== 1 || !matches[0].active || !["coach", "mentor"].includes(matches[0].role)) return null;
  const user = await ctx.db.get(matches[0].authUserId);
  const aliases = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).take(2);
  if (!user?.emailVerificationTime || user.isAnonymous || emailKey(user.email ?? "") !== email || aliases.length !== 1 || aliases[0]._id !== user._id) return null;
  return user._id;
}

async function validAdultInvite(ctx: MutationCtx, id: Id<"adultInvitations">, email: string) {
  const invite = await ctx.db.get(id);
  if (!invite || invite.email !== email || invite.status !== "pending" || invite.expiresAt <= Date.now()) return false;
  const issuer = await ctx.db.get(invite.createdBy);
  return issuer?.active === true && issuer.role === "coach";
}

async function invitedAdultUser(ctx: MutationCtx, email: string): Promise<Id<"users"> | null> {
  if ((await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(1)).length) return null;
  const users = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).take(2);
  if (users.length > 1) return null;
  const user = users[0];
  if (user) {
    if (!user.emailVerificationTime || user.isAnonymous) return null;
    if (await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).unique()) return null;
    if (await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).unique()) return null;
    // Pending enrollment is a request, not an assigned student identity. The
    // Coach-issued adult invitation supersedes it only on explicit acceptance.
    const joins = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).take(21);
    const bulk = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).take(21);
    if (joins.length > 20 || bulk.length > 20 || joins.some(row => row.status === "approved") || bulk.some(row => row.status === "approved")) return null;
    return user._id;
  }
  return await ctx.db.insert("users", { email, name: email, emailVerificationTime: Date.now() });
}

async function markAdultIdentity(ctx: MutationCtx, userId: Id<"users">, email: string) {
  const marker = await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", userId)).unique();
  if (marker && marker.email !== email) return false;
  if (await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", userId)).unique()) return false;
  if (!marker) await ctx.db.insert("adultEmailIdentities", { authUserId: userId, email, createdAt: Date.now() });
  return true;
}

async function markParentIdentity(ctx: MutationCtx, userId: Id<"users">, email: string) {
  const marker = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", userId)).unique();
  if (marker && marker.email !== email) return false;
  if (!marker) await ctx.db.insert("parentEmailIdentities", { authUserId: userId, email, createdAt: Date.now() });
  return true;
}

async function eligibleUser(ctx: MutationCtx, email: string): Promise<Id<"users"> | null> {
  const app = await parentAccount(ctx, email);
  if (app) {
    const user = await ctx.db.get(app.authUserId);
    return user?.emailVerificationTime && emailKey(user.email ?? "") === email ? user._id : null;
  }
  const matches = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).take(21);
  if (matches.length > 20) return null;
  for (const user of matches) {
    if (!user.emailVerificationTime || user.isAnonymous) return null;
    if (await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).unique()) return null;
    const existing = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).unique();
    if (existing) return null;
    const joins = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).take(1);
    const bulk = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_authUserId", q => q.eq("authUserId", user._id)).take(1);
    if (joins.length || bulk.length) return null;
  }
  if (matches.length > 1) return null;
  return matches[0]?._id ?? await ctx.db.insert("users", { email, name: email, emailVerificationTime: Date.now() });
}

export const consumeInvite = internalMutation({
  args: { token: v.string() }, returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.token)) return null;
    const hash = await tokenHash(args.token);
    const row = await ctx.db.query("parentInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
    const now = Date.now();
    if (!row || row.loginVersion !== 1 || row.status !== "pending" || row.loginUsedAt || !row.loginExpiresAt || row.loginExpiresAt <= now || row.expiresAt <= now || row.emailStatus !== "sent") return null;
    const student = await ctx.db.get(row.studentId);
    const season = student && await ctx.db.get(student.seasonId);
    if (!student?.active || season?.status !== "active" || emailKey(student.email) === row.parentEmail) return null;
    requireMaintenanceAccess(row.parentEmail);
    const userId = await eligibleUser(ctx, row.parentEmail);
    if (!userId || !await markParentIdentity(ctx, userId, row.parentEmail)) return null;
    await ctx.db.patch(row._id, { loginUsedAt: now });
    return userId;
  },
});

export const prepareCode = internalMutation({
  args: { email: v.string(), code: v.string(), nonce: v.string(), inviteToken: v.optional(v.string()), adultInviteToken: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const email = emailKey(args.email);
    if (!validEmail(email) || !/^[0-9]{6}$/.test(args.code) || !/^[0-9a-f]{64}$/.test(args.nonce)) return false;
    const app = await parentAccount(ctx, email);
    const adultId = await adultAccount(ctx, email);
    let adultInviteId: Id<"adultInvitations"> | undefined;
    let inviteId: Id<"parentInvitations"> | undefined;
    if (app) {
      const user = await ctx.db.get(app.authUserId);
      if (!user?.emailVerificationTime || emailKey(user.email ?? "") !== email) return false;
    } else if (adultId) {
      // Approved adult account; no role or capability comes from client input.
    } else if (args.adultInviteToken) {
      if (!/^[0-9a-f]{64}$/.test(args.adultInviteToken)) return false;
      const hash = await tokenHash(args.adultInviteToken);
      const invite = await ctx.db.query("adultInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
      if (!invite || !await validAdultInvite(ctx, invite._id, email)) return false;
      if ((await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(1)).length) return false;
      adultInviteId = invite._id;
    } else {
      if (!args.inviteToken || !/^[0-9a-f]{64}$/.test(args.inviteToken)) return false;
      const hash = await tokenHash(args.inviteToken);
      const invite = await ctx.db.query("parentInvitations").withIndex("by_tokenHash", q => q.eq("tokenHash", hash)).unique();
      if (!invite || invite.loginVersion !== 1 || invite.parentEmail !== email || invite.status !== "pending" || invite.expiresAt <= Date.now() || invite.emailStatus !== "sent") return false;
      inviteId = invite._id;
    }
    requireMaintenanceAccess(email);
    const now = Date.now();
    if (!(await codeLimiter.limit(ctx, "parentCodeMinute", { key: email })).ok || !(await codeLimiter.limit(ctx, "parentCodeHour", { key: email })).ok) return false;
    await ctx.db.insert("parentEmailCodes", { email, codeHash: await tokenHash(`${args.nonce}:${args.code}`), nonce: args.nonce, inviteId, adultInviteId, expiresAt: now + codeValidityMs, attempts: 0, createdAt: now });
    return true;
  },
});

export const consumeCode = internalMutation({
  args: { email: v.string(), code: v.string() }, returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    const email = emailKey(args.email);
    if (!validEmail(email) || !/^[0-9]{6}$/.test(args.code)) return null;
    const row = await ctx.db.query("parentEmailCodes").withIndex("by_email_and_createdAt", q => q.eq("email", email)).order("desc").first();
    if (!row || row.usedAt || row.expiresAt <= Date.now() || row.attempts >= 5) return null;
    await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
    if (row.codeHash !== await tokenHash(`${row.nonce}:${args.code}`)) return null;
    let userId: Id<"users"> | null = null;
    const app = await parentAccount(ctx, email);
    const adultId = await adultAccount(ctx, email);
    let adult = false;
    if (adultId) { userId = adultId; adult = true; }
    else if (row.adultInviteId) {
      if (await validAdultInvite(ctx, row.adultInviteId, email)) userId = await invitedAdultUser(ctx, email);
      adult = true;
    } else if (app) {
      const user = await ctx.db.get(app.authUserId);
      userId = user?.emailVerificationTime && emailKey(user.email ?? "") === email ? user._id : null;
    } else if (row.inviteId) {
      const invite = await ctx.db.get(row.inviteId);
      if (invite?.loginVersion === 1 && invite.parentEmail === email && invite.status === "pending" && invite.expiresAt > Date.now() && invite.emailStatus === "sent") userId = await eligibleUser(ctx, email);
    }
    if (!userId) return null;
    requireMaintenanceAccess(email);
    if (!(adult ? await markAdultIdentity(ctx, userId, email) : await markParentIdentity(ctx, userId, email))) return null;
    await ctx.db.patch(row._id, { usedAt: Date.now() });
    return userId;
  },
});

export const requestCode = action({
  args: { email: v.string(), inviteToken: v.optional(v.string()), adultInviteToken: v.optional(v.string()) }, returns: v.object({ sent: v.boolean() }),
  handler: async (ctx, args) => {
    const email = emailKey(args.email);
    const config = parentInviteEmailConfiguration();
    if (!config || !validEmail(email)) return { sent: true };
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const nonce = newToken();
    const prepared: boolean = await ctx.runMutation(internal.parentEmailAuth.prepareCode, { email, code, nonce, inviteToken: args.inviteToken, adultInviteToken: args.adultInviteToken });
    if (!prepared) return { sent: true };
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.from, reply_to: config.replyTo, to: [email], subject: "Your Denham Venom sign-in code", text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`, html: `<p>Your sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>` }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch { /* Generic response avoids disclosing parent membership. */ }
    return { sent: true };
  },
});
