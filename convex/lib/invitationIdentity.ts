import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireMaintenanceAccess } from "./maintenanceAccess";
type Ctx = QueryCtx | MutationCtx;

export function emailKey(value: string) { return value.trim().toLowerCase(); }
export async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function verifiedGoogle(ctx: Ctx) {
  const id = await getAuthUserId(ctx);
  if (!id) return null;
  const user = await ctx.db.get(id as Id<"users">);
  if (!user?.email || user.isAnonymous || !user.emailVerificationTime) return null;
  requireMaintenanceAccess(user.email);
  const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", user._id).eq("provider", "google")).take(2);
  const verifiedEmail = emailKey(user.email);
  if (!accounts.some(account => account.emailVerified && emailKey(account.emailVerified) === verifiedEmail)) return null;
  return { authUserId: user._id, email: emailKey(user.email), name: user.name?.trim() || user.email };
}
