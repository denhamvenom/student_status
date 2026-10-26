import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { tokenHash } from "./invitationIdentity";

// Team join codes (joinCodes) and individual student invitations (bulkStudentInvites)
// share one six-digit namespace. Older five-digit and prefixed codes stay readable
// until they expire or are revoked, but are never issued again.

export const codeLimiter = new RateLimiter(components.rateLimiter, {
  studentCodeAttempts: { kind: "fixed window", rate: 10, period: 60_000 },
  studentCodeDailyAttempts: { kind: "fixed window", rate: 30, period: 86_400_000 },
});

export const googleRequiredForStudents = "Students join with a Google account. Sign out, then sign in with Google.";

const LOCK_AFTER_FAILURES = 5;
const LOCK_MS = 15 * 60_000;

/** True when the value was ever issued as a team code or an individual invitation. */
export async function invitationCodeTaken(ctx: MutationCtx, code: string) {
  if (await ctx.db.query("joinCodes").withIndex("by_code", q => q.eq("code", code)).first()) return true;
  // Every issued numeric individual code has a permanent reservation, so this covers bulkStudentInvites too.
  const codeHash = await tokenHash(code);
  return !!await ctx.db.query("bulkInviteCodeReservations").withIndex("by_codeHash", q => q.eq("codeHash", codeHash)).first();
}

/** A random unused six-digit code (100000–999999; no leading zero to lose in a spreadsheet), or null. */
export async function allocateInvitationCode(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    // Rejection sampling avoids modulo bias.
    if (value >= 4_294_800_000) continue;
    const code = String(100_000 + value % 900_000);
    if (!(await invitationCodeTaken(ctx, code))) return code;
  }
  return null;
}

export function normalizedInvitationCode(value: string) { return value.trim().toUpperCase(); }

/** The team code row when it can be used to request to join this season, else null. */
export async function usableTeamCode(ctx: MutationCtx, code: string, seasonId: Id<"seasons">, now: number): Promise<Doc<"joinCodes"> | null> {
  const row = await ctx.db.query("joinCodes").withIndex("by_code", q => q.eq("code", normalizedInvitationCode(code))).unique();
  if (!row || row.seasonId !== seasonId || row.revoked || row.expiresAt < now) return null;
  return row;
}

/** Whether this account is locked out after repeated wrong codes. */
export async function joinAttemptsLocked(ctx: MutationCtx, authUserId: Id<"users">, now: number) {
  const attempts = await ctx.db.query("joinAttempts").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
  return !!attempts && attempts.lockedUntil > now;
}

/** Count a wrong code; the fifth in a row locks the account for 15 minutes. */
export async function recordFailedJoinAttempt(ctx: MutationCtx, authUserId: Id<"users">, now: number) {
  const attempts = await ctx.db.query("joinAttempts").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
  const failed = (attempts?.failed ?? 0) + 1;
  const next = { failed: failed >= LOCK_AFTER_FAILURES ? 0 : failed, lockedUntil: failed >= LOCK_AFTER_FAILURES ? now + LOCK_MS : 0 };
  if (attempts) await ctx.db.patch(attempts._id, next);
  else await ctx.db.insert("joinAttempts", { authUserId, ...next });
}

export async function clearJoinAttempts(ctx: MutationCtx, authUserId: Id<"users">) {
  const attempts = await ctx.db.query("joinAttempts").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
  if (attempts) await ctx.db.patch(attempts._id, { failed: 0, lockedUntil: 0 });
}
