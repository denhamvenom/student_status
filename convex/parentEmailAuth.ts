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
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const codeLimiter = new RateLimiter(components.rateLimiter, {
  parentCodeMinute: { kind: "fixed window", rate: 1, period: 60_000 },
  parentCodeHour: { kind: "fixed window", rate: 5, period: 60 * 60_000 },
});

async function parentAccount(ctx: MutationCtx, email: string) {
  const matches = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(21);
  if (matches.length > 20 || matches.some(row => row.role !== "parent" || !row.active) || matches.length > 1) return null;
  return matches[0] ?? null;
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
  args: { email: v.string(), code: v.string(), nonce: v.string(), inviteToken: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const email = emailKey(args.email);
    if (!validEmail(email) || !/^[0-9]{6}$/.test(args.code) || !/^[0-9a-f]{64}$/.test(args.nonce)) return false;
    const app = await parentAccount(ctx, email);
    let inviteId: Id<"parentInvitations"> | undefined;
    if (app) {
      const user = await ctx.db.get(app.authUserId);
      if (!user?.emailVerificationTime || emailKey(user.email ?? "") !== email) return false;
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
    await ctx.db.insert("parentEmailCodes", { email, codeHash: await tokenHash(`${args.nonce}:${args.code}`), nonce: args.nonce, inviteId, expiresAt: now + codeValidityMs, attempts: 0, createdAt: now });
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
    if (app) {
      const user = await ctx.db.get(app.authUserId);
      userId = user?.emailVerificationTime && emailKey(user.email ?? "") === email ? user._id : null;
    } else if (row.inviteId) {
      const invite = await ctx.db.get(row.inviteId);
      if (invite?.loginVersion === 1 && invite.parentEmail === email && invite.status === "pending" && invite.expiresAt > Date.now() && invite.emailStatus === "sent") userId = await eligibleUser(ctx, email);
    }
    if (!userId) return null;
    requireMaintenanceAccess(email);
    if (!await markParentIdentity(ctx, userId, email)) return null;
    await ctx.db.patch(row._id, { usedAt: Date.now() });
    return userId;
  },
});

export const requestCode = action({
  args: { email: v.string(), inviteToken: v.optional(v.string()) }, returns: v.object({ sent: v.boolean() }),
  handler: async (ctx, args) => {
    const email = emailKey(args.email);
    const config = parentInviteEmailConfiguration();
    if (!config || !validEmail(email)) return { sent: true };
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const nonce = newToken();
    const prepared: boolean = await ctx.runMutation(internal.parentEmailAuth.prepareCode, { email, code, nonce, inviteToken: args.inviteToken });
    if (!prepared) return { sent: true };
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.from, reply_to: config.replyTo, to: [email], subject: "Your Denham Venom parent sign-in code", text: `Your parent sign-in code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`, html: `<p>Your parent sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>` }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch { /* Generic response avoids disclosing parent membership. */ }
    return { sent: true };
  },
});
