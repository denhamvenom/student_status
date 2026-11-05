import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireRole, requireSeasonProfileWritable, studentAccess, viewer } from "./lib/access";
import type { AppUser } from "./lib/access";
import { normalizeChangedPhone, normalizeEmail } from "./lib/contactValidation";
import { emailKey } from "./lib/invitationIdentity";
import { isDeveloperEmail } from "./lib/developerSignIn";
import { requireMaintenanceAccess } from "./lib/maintenanceAccess";

/**
 * Coach-only edits to another person's basic profile, including the sign-in email.
 *
 * Where the sign-in email lives:
 * - `appUsers.email` (email-code sign-in finds the account through `by_email`),
 * - `students.email` for the active-season roster row,
 * - the Convex Auth `users` row (`email` + `emailVerificationTime`; Google sign-in links a new Google
 *   login to this row only through a unique verified email),
 * - `parentEmailIdentities` / `adultEmailIdentities` markers that pin email-code sign-ins to one address,
 * - `authAccounts`: Google accounts are keyed by the Google subject of the OLD address, so they are removed;
 *   any email-keyed provider account is moved to the new address.
 * An orphan sign-in already holding the new address (a login with no team account and no pending request) is
 * absorbed: its provider links move to the person's login and its `users` row is deleted.
 * Every session of the person is ended, so nobody stays signed in on the old identity, and every pending
 * Parent or Coach/Mentor invitation addressed to an old email is revoked, so the old mailbox cannot accept one.
 */

const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
const shirtSize = v.union(v.literal("XS"), v.literal("S"), v.literal("M"), v.literal("L"), v.literal("XL"), v.literal("2XL"), v.literal("3XL"));
const editableRole = v.union(v.literal("coach"), v.literal("mentor"), v.literal("parent"));
const signInResult = v.object({ emailChanged: v.boolean(), endedSessions: v.number(), removedGoogleLinks: v.number() });
const STALE = "This profile changed since you opened it. Reload to see the latest, then try again.";
const MAX_LINKS = 20;
const MAX_REASON = 500;
/** Documents one transaction may delete while ending sessions; any remainder continues in a scheduled mutation. */
export const SESSION_DELETE_BUDGET = 400;

function text(value: string, label: string, max: number) {
  const result = value.trim();
  if (!result || result.length > max) throw new ConvexError(`${label} is required and must be ${max} characters or fewer.`);
  return result;
}
function reasonText(value: string | undefined, emailChanged: boolean) {
  const result = value?.trim() ?? "";
  if (result.length > MAX_REASON) throw new ConvexError("Keep the reason to 500 characters or fewer.");
  if (emailChanged && !result) throw new ConvexError("Enter a short reason for changing the sign-in email.");
  return result || undefined;
}
function revisionMatches(expected: number, current: number | undefined) {
  return Number.isSafeInteger(expected) && expected >= 0 && expected === (current ?? 0);
}

function loginEmail(value: string) {
  const email = normalizeEmail(value, "Email");
  if (!email) throw new ConvexError("Email: enter a valid email address.");
  if (isDeveloperEmail(email)) throw new ConvexError("This email domain is reserved for developer sign-in. Use the person's real email.");
  requireMaintenanceAccess(email);
  return email;
}

const OTHER_ACCOUNT = "Another account already uses this email. Use a different email.";
const INACTIVE_ACCOUNT = "An inactive account still uses this email. Change that account's email first, or use a different email.";
const PENDING_JOIN = "Someone has already signed in with this email and is waiting on a join request. Approve or decline it under Join requests → Requests & team code first, or use a different email.";
const PENDING_CONNECTION = "Someone has already signed in with this email and is waiting on an account connection request. Approve or decline it under Join requests → Bulk Invite → Account connection requests first, or use a different email.";
const MAX_REQUESTS = 50;
/** Orphan sign-ins are short-lived; anything past this is ended by a scheduled continuation. */
const ORPHAN_SESSION_BUDGET = 200;

/**
 * A Convex Auth login with no team account, no Parent/Coach/Mentor sign-in marker and no pending request: someone
 * signed in (usually with Google) and never finished joining. Throws, with where to look, for any login that is not one.
 */
async function requireOrphanSignIn(ctx: MutationCtx, login: Doc<"users">): Promise<Doc<"users">> {
  const account = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", login._id)).first();
  if (account) throw new ConvexError(account.active ? OTHER_ACCOUNT : INACTIVE_ACCOUNT);
  const marker = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", login._id)).first()
    ?? await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", login._id)).first();
  if (marker) throw new ConvexError(OTHER_ACCOUNT);
  const joins = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", login._id)).order("desc").take(MAX_REQUESTS + 1);
  if (joins.length > MAX_REQUESTS || joins.some(row => row.status === "pending")) throw new ConvexError(PENDING_JOIN);
  const connection = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_authUserId_and_status", q => q.eq("authUserId", login._id).eq("status", "pending")).first();
  if (connection) throw new ConvexError(PENDING_CONNECTION);
  return login;
}

/**
 * The new address must belong to nobody else, or sign-in by email or Google would be ambiguous. Returns the orphan
 * sign-ins (see `requireOrphanSignIn`) that hold the address; the caller absorbs them into the person's login.
 */
async function requireEmailAvailable(ctx: MutationCtx, email: string, own: { appUserId?: Id<"appUsers">; authUserId?: Id<"users">; studentId?: Id<"students">; seasonId: Id<"seasons"> | null }): Promise<Doc<"users">[]> {
  const accounts = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(5);
  const other = accounts.find(row => row._id !== own.appUserId);
  if (other) throw new ConvexError(other.active ? OTHER_ACCOUNT : INACTIVE_ACCOUNT);
  if (own.seasonId) {
    const seasonId = own.seasonId;
    const students = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", seasonId).eq("email", email)).take(5);
    if (students.some(row => row._id !== own.studentId)) throw new ConvexError("Another student on this season's roster uses this email. Use a different email.");
  }
  // Only a person who signs in needs a unique Convex Auth login; an unlinked roster row does not.
  const logins = own.authUserId ? await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).take(5) : [];
  const orphans: Doc<"users">[] = [];
  for (const login of logins) if (login._id !== own.authUserId) orphans.push(await requireOrphanSignIn(ctx, login));
  return orphans;
}

async function deleteVerificationCodes(ctx: MutationCtx, accountId: Id<"authAccounts">) {
  for (const code of await ctx.db.query("authVerificationCodes").withIndex("accountId", q => q.eq("accountId", accountId)).take(10)) await ctx.db.delete(code._id);
}

/**
 * Folds an orphan sign-in into `target`'s login: its provider links move to `target` (so the next Google sign-in
 * with the new email lands in the existing account), its sessions end and its `users` row is deleted. Decided
 * join/connection requests stay as history.
 */
async function absorbOrphanSignIn(ctx: MutationCtx, actor: AppUser, orphan: Doc<"users">, target: Id<"users">, reason: string | undefined) {
  const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", orphan._id)).take(MAX_LINKS + 1);
  if (accounts.length > MAX_LINKS) throw new ConvexError("The earlier sign-in with this email has too many sign-in links to update here. Nothing was saved.");
  const moved: string[] = [], removed: string[] = [];
  for (const account of accounts) {
    await deleteVerificationCodes(ctx, account._id);
    const targetLinks = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", target).eq("provider", account.provider)).take(MAX_LINKS);
    if (targetLinks.some(row => row.providerAccountId === account.providerAccountId)) {
      await ctx.db.delete(account._id);
      removed.push(account.provider);
    } else {
      await ctx.db.patch(account._id, { userId: target });
      moved.push(account.provider);
    }
  }
  const sessions = await endSessions(ctx, orphan._id, null, ORPHAN_SESSION_BUDGET);
  if (!sessions.done) await ctx.scheduler.runAfter(0, internal.coachProfileEdit.endRemainingSessions, { authUserId: orphan._id, before: Date.now() });
  for (const attempt of await ctx.db.query("joinAttempts").withIndex("by_authUserId", q => q.eq("authUserId", orphan._id)).take(10)) await ctx.db.delete(attempt._id);
  await ctx.db.delete(orphan._id);
  await audit(ctx, actor, "users", orphan._id, "absorbOrphanSignIn", { email: orphan.email ?? null, links: accounts.length },
    { intoAuthUserId: target, movedLinks: moved, removedLinks: removed, endedSessions: sessions.ended, sessionSignOutContinues: !sessions.done }, reason);
}

async function activeSeasonId(ctx: MutationCtx) {
  return (await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique())?._id ?? null;
}

type MoveResult = { endedSessions: number; removedGoogleLinks: number; revokedInvitations: number; sessionSignOutContinues: boolean; absorbedSignIns: number };
const NOT_MOVED: MoveResult = { endedSessions: 0, removedGoogleLinks: 0, revokedInvitations: 0, sessionSignOutContinues: false, absorbedSignIns: 0 };

/**
 * Ends the sessions of `authUserId` (only those created at or before `before`, when given), deleting at most
 * `budget` documents. Refresh tokens go first, so no token outlives the session row a later pass finds it by.
 */
async function endSessions(ctx: MutationCtx, authUserId: Id<"users">, before: number | null, budget: number): Promise<{ ended: number; done: boolean }> {
  let ended = 0, deleted = 0;
  for (;;) {
    const session = await ctx.db.query("authSessions").withIndex("userId", q => before === null ? q.eq("userId", authUserId) : q.eq("userId", authUserId).lte("_creationTime", before)).first();
    if (!session) return { ended, done: true };
    for (;;) {
      if (deleted >= budget) return { ended, done: false };
      const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", q => q.eq("sessionId", session._id)).take(Math.min(100, budget - deleted));
      if (tokens.length === 0) break;
      for (const token of tokens) await ctx.db.delete(token._id);
      deleted += tokens.length;
    }
    if (deleted + 2 > budget) return { ended, done: false };
    const role = await ctx.db.query("operatingRoles").withIndex("by_sessionId", q => q.eq("sessionId", session._id)).unique();
    if (role) { await ctx.db.delete(role._id); deleted++; }
    await ctx.db.delete(session._id); deleted++;
    ended++;
  }
}

/** Finishes ending the sessions that predate a sign-in email change when the first transaction's budget ran out. */
export const endRemainingSessions = internalMutation({
  args: { authUserId: v.id("users"), before: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const result = await endSessions(ctx, args.authUserId, args.before, SESSION_DELETE_BUDGET);
    if (!result.done) await ctx.scheduler.runAfter(0, internal.coachProfileEdit.endRemainingSessions, args);
    return null;
  },
});

/** Revokes every pending Parent and Coach/Mentor invitation addressed to an old email of the person. */
async function revokePendingInvitations(ctx: MutationCtx, actor: AppUser, emails: string[], newEmail: string, reason: string | undefined): Promise<number> {
  const why = reason ?? "Sign-in email changed";
  let revoked = 0;
  for (const old of new Set(emails.map(emailKey).filter(key => key && key !== newEmail))) {
    // Revoking a row moves it out of the pending range, so each pass reads the next batch.
    for (;;) {
      const rows = await ctx.db.query("parentInvitations").withIndex("by_parentEmail_and_status", q => q.eq("parentEmail", old).eq("status", "pending")).take(100);
      if (rows.length === 0) break;
      for (const row of rows) {
        await ctx.db.patch(row._id, { status: "revoked" });
        await audit(ctx, actor, "parentInvitations", row._id, "revoke", "pending", "revoked", why);
      }
      revoked += rows.length;
    }
    for (;;) {
      const rows = await ctx.db.query("adultInvitations").withIndex("by_email_and_status", q => q.eq("email", old).eq("status", "pending")).take(100);
      if (rows.length === 0) break;
      for (const row of rows) {
        await ctx.db.patch(row._id, { status: "revoked" });
        await audit(ctx, actor, "adultInvitations", row._id, "revoke", "pending", "revoked", why);
      }
      revoked += rows.length;
    }
  }
  return revoked;
}

/** Moves every stored sign-in identity of `user` to `email`, ends their sessions and revokes invitations to the old email. */
async function moveSignInEmail(ctx: MutationCtx, actor: AppUser, user: Doc<"appUsers">, email: string, seasonId: Id<"seasons"> | null, reason: string | undefined, orphans: Doc<"users">[], alsoPrevious: string[] = []): Promise<MoveResult> {
  const authUser = await ctx.db.get(user.authUserId);
  if (!authUser) throw new ConvexError("This person's sign-in record is missing. Ask the administrator to check the account.");
  const previous = new Set([emailKey(user.email), emailKey(authUser.email ?? "")].filter(Boolean));
  const now = Date.now();
  await ctx.db.patch(user._id, { email });
  await ctx.db.patch(authUser._id, { email, emailVerificationTime: now });

  let removedGoogleLinks = 0;
  const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", authUser._id)).take(MAX_LINKS + 1);
  if (accounts.length > MAX_LINKS) throw new ConvexError("This person has too many sign-in links to update here. Nothing was saved.");
  for (const account of accounts) {
    if (account.provider === "google") {
      await deleteVerificationCodes(ctx, account._id);
      await ctx.db.delete(account._id);
      removedGoogleLinks++;
    } else if (previous.has(emailKey(account.providerAccountId))) {
      const clash = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", account.provider).eq("providerAccountId", email)).first();
      if (clash && clash._id !== account._id) {
        // An orphan sign-in being absorbed loses its duplicate of this link; anyone else's blocks the change.
        if (!orphans.some(orphan => orphan._id === clash.userId)) throw new ConvexError("Another sign-in already uses this email. Use a different email.");
        await deleteVerificationCodes(ctx, clash._id);
        await ctx.db.delete(clash._id);
      }
      await ctx.db.patch(account._id, { providerAccountId: email, ...(account.emailVerified ? { emailVerified: email } : {}) });
    }
  }

  const parentMarker = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", authUser._id)).unique();
  if (parentMarker) await ctx.db.patch(parentMarker._id, { email });
  const adultMarker = await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", authUser._id)).unique();
  if (adultMarker) await ctx.db.patch(adultMarker._id, { email });

  // Unused email sign-in codes for the old address must not outlive the change.
  for (const old of previous) {
    for (const code of await ctx.db.query("parentEmailCodes").withIndex("by_email_and_createdAt", q => q.eq("email", old)).order("desc").take(20)) {
      if (!code.usedAt) await ctx.db.patch(code._id, { usedAt: now });
    }
  }

  const sessions = await endSessions(ctx, authUser._id, null, SESSION_DELETE_BUDGET);
  if (!sessions.done) {
    // The continuation ends only sessions that exist now; a sign-in with the new email after this commit is newer.
    const newest = await ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", authUser._id)).order("desc").first();
    if (newest) await ctx.scheduler.runAfter(0, internal.coachProfileEdit.endRemainingSessions, { authUserId: authUser._id, before: newest._creationTime });
  }
  const revokedInvitations = await revokePendingInvitations(ctx, actor, [...previous, ...alsoPrevious], email, reason);
  // After the person's own old Google links are gone, so the orphan's links are the ones that remain.
  for (const orphan of orphans) await absorbOrphanSignIn(ctx, actor, orphan, authUser._id, reason);

  if (seasonId) {
    const driver = await ctx.db.query("drivers").withIndex("by_seasonId_and_ownerAppUserId", q => q.eq("seasonId", seasonId).eq("ownerAppUserId", user._id)).unique();
    if (driver) await ctx.db.patch(driver._id, { email });
  }
  return { endedSessions: sessions.ended, removedGoogleLinks, revokedInvitations, sessionSignOutContinues: !sessions.done, absorbedSignIns: orphans.length };
}

const parentSummary = v.object({ userId: v.id("appUsers"), name: v.string(), email: v.string(), phone: v.string(), active: v.boolean(), profileRevision: v.number() });

/** Coach-only editable projection of a current-season student and their linked Parent accounts. */
export const studentProfile = query({
  args: { studentId: v.id("students") },
  returns: v.object({
    studentId: v.id("students"), legalName: v.string(), preferredName: v.string(), email: v.string(), shirtSize: v.union(shirtSize, v.null()),
    profileRevision: v.number(), signIn: v.union(v.literal("linked"), v.literal("none")), parents: v.array(parentSummary), parentCoverage: v.union(v.literal("complete"), v.literal("unknown")),
  }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const student = await studentAccess(ctx, actor, args.studentId);
    const account = student.userId ? await ctx.db.get(student.userId) : null;
    const links = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(MAX_LINKS + 1);
    const parents: Array<{ userId: Id<"appUsers">; name: string; email: string; phone: string; active: boolean; profileRevision: number }> = [];
    for (const link of links.slice(0, MAX_LINKS)) {
      if (!link.active || (link.seasonId && link.seasonId !== student.seasonId) || parents.some(row => row.userId === link.parentUserId)) continue;
      const parent = await ctx.db.get(link.parentUserId);
      if (parent?.role === "parent") parents.push({ userId: parent._id, name: parent.name, email: parent.email, phone: parent.phone ?? "", active: parent.active, profileRevision: parent.profileRevision ?? 0 });
    }
    const size = SIZES.find(item => item === student.shirtSize) ?? null;
    return { studentId: student._id, legalName: student.legalName, preferredName: student.preferredName, email: student.email, shirtSize: size, profileRevision: student.profileRevision ?? 0, signIn: account?.role === "student" ? "linked" as const : "none" as const, parents, parentCoverage: links.length > MAX_LINKS ? "unknown" as const : "complete" as const };
  },
});

/** Coach-only editable projection of a Coach, Mentor or Parent account. */
export const adultProfile = query({
  args: { userId: v.id("appUsers") },
  returns: v.object({ userId: v.id("appUsers"), role: editableRole, name: v.string(), email: v.string(), phone: v.string(), active: v.boolean(), profileRevision: v.number(), isSelf: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const user = await ctx.db.get(args.userId);
    if (!user || user.role === "student") throw new ConvexError("This account was not found. Reload the list, then try again.");
    return { userId: user._id, role: user.role, name: user.name, email: user.email, phone: user.phone ?? "", active: user.active, profileRevision: user.profileRevision ?? 0, isSelf: user._id === actor._id };
  },
});

export const updateStudentProfile = mutation({
  args: { studentId: v.id("students"), expectedRevision: v.number(), legalName: v.string(), preferredName: v.string(), email: v.string(), shirtSize: v.union(shirtSize, v.null()), reason: v.optional(v.string()) },
  returns: signInResult,
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const student = await studentAccess(ctx, actor, args.studentId);
    if (!revisionMatches(args.expectedRevision, student.profileRevision)) throw new ConvexError(STALE);
    const legalName = text(args.legalName, "Legal name", 160);
    const preferredName = text(args.preferredName, "Preferred name", 80);
    const email = loginEmail(args.email);
    const account = student.userId ? await ctx.db.get(student.userId) : null;
    const linked = account?.role === "student" ? account : null;
    const emailChanged = email !== emailKey(student.email) || (linked !== null && email !== emailKey(linked.email));
    const reason = reasonText(args.reason, emailChanged);
    const orphans = emailChanged ? await requireEmailAvailable(ctx, email, { appUserId: linked?._id, authUserId: linked?.authUserId, studentId: student._id, seasonId: student.seasonId }) : [];

    const profileRevision = (student.profileRevision ?? 0) + 1;
    const before = { legalName: student.legalName, preferredName: student.preferredName, email: student.email, shirtSize: student.shirtSize ?? null, profileRevision: student.profileRevision ?? 0 };
    const after = { legalName, preferredName, email, shirtSize: args.shirtSize ?? student.shirtSize ?? null, profileRevision };
    await ctx.db.patch(student._id, { legalName, preferredName, email, ...(args.shirtSize ? { shirtSize: args.shirtSize } : {}), profileRevision });
    let moved = NOT_MOVED;
    if (linked) {
      if (emailChanged) moved = await moveSignInEmail(ctx, actor, linked, email, student.seasonId, reason, orphans, [student.email]);
      await ctx.db.patch(linked._id, { profileRevision: (linked.profileRevision ?? 0) + 1 });
    } else if (emailChanged) {
      moved = { ...NOT_MOVED, revokedInvitations: await revokePendingInvitations(ctx, actor, [student.email], email, reason) };
    }
    await audit(ctx, actor, "students", student._id, "coachEditProfile", before, { ...after, signInMoved: linked !== null && emailChanged, ...moved }, reason);
    return { emailChanged, endedSessions: moved.endedSessions, removedGoogleLinks: moved.removedGoogleLinks };
  },
});

export const updateAdultProfile = mutation({
  args: { userId: v.id("appUsers"), expectedProfileRevision: v.number(), name: v.string(), email: v.string(), phone: v.string(), reason: v.optional(v.string()) },
  returns: signInResult,
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const user = await ctx.db.get(args.userId);
    if (!user || user.role === "student") throw new ConvexError("This account was not found. Student profiles are edited from the student's record.");
    if (!revisionMatches(args.expectedProfileRevision, user.profileRevision)) throw new ConvexError(STALE);
    const name = text(args.name, "Name", 100);
    const phone = normalizeChangedPhone(args.phone, user.phone, "Phone");
    const email = loginEmail(args.email);
    const emailChanged = email !== emailKey(user.email);
    if (emailChanged && user._id === actor._id) throw new ConvexError("You can't change your own sign-in email here. Ask another Coach to change it for you.");
    const reason = reasonText(args.reason, emailChanged);
    const seasonId = await activeSeasonId(ctx);
    if (seasonId) await requireSeasonProfileWritable(ctx, seasonId);
    const orphans = emailChanged ? await requireEmailAvailable(ctx, email, { appUserId: user._id, authUserId: user.authUserId, seasonId }) : [];

    const profileRevision = (user.profileRevision ?? 0) + 1;
    await ctx.db.patch(user._id, { name, phone: phone || undefined, profileRevision });
    const moved = emailChanged ? await moveSignInEmail(ctx, actor, user, email, seasonId, reason, orphans) : NOT_MOVED;
    await audit(ctx, actor, "appUsers", user._id, "coachEditProfile", { name: user.name, email: user.email, phone: user.phone ?? null, profileRevision: user.profileRevision ?? 0 }, { name, email, phone: phone || null, profileRevision, ...moved }, reason);
    return { emailChanged, endedSessions: moved.endedSessions, removedGoogleLinks: moved.removedGoogleLinks };
  },
});
