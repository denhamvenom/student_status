import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { activeSeason, audit, identity, requireRole, requireSeasonProfileWritable, viewer } from "./lib/access";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { allocateInvitationCode, codeLimiter as limiter, googleRequiredForStudents, joinAttemptsLocked, normalizedInvitationCode, recordFailedJoinAttempt, usableTeamCode } from "./lib/invitationCodes";
import { emailKey, tokenHash, verifiedGoogle } from "./lib/invitationIdentity";

const nameInput = v.object({ firstName: v.string(), lastName: v.string() });
const entryInput = v.object({ firstName: v.string(), lastName: v.string(), resolution: v.union(v.literal("skip"), v.literal("create"), v.literal("link")), existingStudentId: v.optional(v.id("students")), confirmDuplicate: v.optional(v.boolean()) });
type Ctx = QueryCtx | MutationCtx;
type Entry = { firstName: string; lastName: string; resolution: "skip" | "create" | "link"; existingStudentId?: Id<"students">; confirmDuplicate?: boolean };

function name(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 80 || [...clean].some(character => character.charCodeAt(0) < 32)) throw new ConvexError("Each student needs a first and last name, each under 80 characters. Fix the file, then upload it again.");
  return clean;
}
function key(first: string, last: string) { return `${first} ${last}`.normalize("NFKC").toLocaleLowerCase("en-US"); }
function cleanRows<T extends { firstName: string; lastName: string }>(rows: T[]) {
  if (rows.length < 1 || rows.length > 100) throw new ConvexError("Upload between 1 and 100 students at a time. Split the file, then try again.");
  return rows.map(row => ({ ...row, firstName: name(row.firstName), lastName: name(row.lastName) }));
}
// New individual invitations are six digits from the namespace shared with team codes.
async function newCode(ctx: MutationCtx) {
  const code = await allocateInvitationCode(ctx);
  if (!code) throw new ConvexError("A new invitation code couldn't be created. Try again.");
  // Reservations are never deleted, so a replaced or revoked code is never issued again.
  await ctx.db.insert("bulkInviteCodeReservations", { codeHash: await tokenHash(code) });
  return code;
}
const normalizedCode = normalizedInvitationCode;
// Six digits are current; five digits and DV- codes were issued earlier and still work until they expire or are revoked.
function validCode(value: string) { return /^\d{5,6}$/.test(value) || /^DV-[0-9A-F]{32}$/.test(value); }
function effectiveExpiry(inviteExpiry: number | undefined, seasonExpiry: number | undefined) {
  if (inviteExpiry === undefined) return seasonExpiry ?? null;
  return seasonExpiry === undefined ? inviteExpiry : Math.min(inviteExpiry, seasonExpiry);
}
async function fingerprint(value: unknown) { return tokenHash(JSON.stringify(value)); }
async function roster(ctx: Ctx, seasonId: Id<"seasons">) {
  const rows = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).take(1001);
  if (rows.length > 1000) throw new ConvexError("The roster is too large to check for matching names. Review the roster, then try again.");
  return rows;
}
function matches(rows: Doc<"students">[], first: string, last: string) {
  const target = key(first, last);
  return rows.filter(row => key(row.firstName ?? row.legalName.split(/\s+/)[0] ?? "", row.lastName ?? row.legalName.split(/\s+/).slice(1).join(" ")) === target);
}
async function permittedInvite(ctx: Ctx, inviteId: Id<"bulkStudentInvites">) {
  const actor = await viewer(ctx); requireRole(actor, "coach");
  const invite = await ctx.db.get(inviteId);
  const season = await activeSeason(ctx);
  if (!invite || invite.seasonId !== season._id) throw new ConvexError("This invitation is no longer available. Reload to see the latest.");
  return { actor, invite, season };
}
async function applicant(ctx: MutationCtx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  return { authUserId, who: await verifiedGoogle(ctx) };
}
async function usableCode(ctx: MutationCtx, code: string) {
  const normalized = normalizedCode(code);
  if (!validCode(normalized)) return null;
  const hash = await tokenHash(normalized);
  const row = await ctx.db.query("bulkStudentInvites").withIndex("by_codeHash", q => q.eq("codeHash", hash)).unique();
  if (!row || row.status !== "pending" || (row.expiresAt !== undefined && row.expiresAt <= Date.now())) return null;
  const season = await ctx.db.get(row.seasonId);
  if (!season || season.status !== "active" || (season.endsAt !== undefined && season.endsAt <= Date.now())) return null;
  const student = await ctx.db.get(row.studentId);
  if (!student || !student.active || student.userId || student.seasonId !== season._id) return null;
  return { row, student };
}

export const preview = query({
  args: { students: v.array(nameInput) },
  returns: v.object({ rows: v.array(v.object({ firstName: v.string(), lastName: v.string(), matches: v.array(v.object({ studentId: v.id("students"), legalName: v.string(), email: v.string(), linked: v.boolean(), active: v.boolean() })), duplicateInUpload: v.boolean() })) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const season = await activeSeason(ctx);
    const inputs = cleanRows(args.students);
    const existing = await roster(ctx, season._id);
    const seen = new Set<string>();
    return { rows: inputs.map(row => {
      const nameKey = key(row.firstName, row.lastName);
      const duplicateInUpload = seen.has(nameKey); seen.add(nameKey);
      const found = matches(existing, row.firstName, row.lastName);
      if (found.length > 20) throw new ConvexError("Too many students match one name. Review the roster, then try again.");
      return { firstName: row.firstName, lastName: row.lastName, duplicateInUpload, matches: found.map(student => ({ studentId: student._id, legalName: student.legalName, email: student.email, linked: !!student.userId, active: student.active })) };
    }) };
  },
});

export const createBatch = mutation({
  args: { entries: v.array(entryInput), idempotencyKey: v.string() },
  returns: v.object({ batchId: v.id("bulkInviteBatches"), created: v.number(), linked: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const season = await activeSeason(ctx);
    await requireSeasonProfileWritable(ctx, season._id);
    const entries: Entry[] = cleanRows(args.entries);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.idempotencyKey)) throw new ConvexError("This upload couldn't be submitted. Reload the page, then upload the file again.");
    const requestHash = await fingerprint(entries);
    const previous = await ctx.db.query("bulkInviteBatches").withIndex("by_createdBy_and_idempotencyKey", q => q.eq("createdBy", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (previous) {
      if (previous.requestHash !== requestHash) throw new ConvexError("This upload was already submitted with different students. Reload the page, then upload the file again.");
      return { batchId: previous._id, created: previous.createdCount, linked: previous.linkedCount, skipped: previous.skippedCount };
    }
    const now = Date.now();
    if (season.endsAt !== undefined && season.endsAt <= now) throw new ConvexError("The current season has ended, so new invitation codes can't be created. Start the next season first.");
    const expiresAt = season.endsAt;
    const existing = await roster(ctx, season._id);
    const chosen = new Set<Id<"students">>();
    const names = new Set<string>();
    let created = 0, linked = 0, skipped = 0;
    for (const entry of entries) {
      const nameKey = key(entry.firstName, entry.lastName);
      const duplicate = matches(existing, entry.firstName, entry.lastName).length > 0 || names.has(nameKey);
      names.add(nameKey);
      if (entry.resolution === "skip") { skipped++; continue; }
      if (entry.resolution === "create") {
        if (entry.existingStudentId) throw new ConvexError("A new student can't also be linked to an existing student. Review the choices, then try again.");
        if (duplicate && !entry.confirmDuplicate) throw new ConvexError(`${entry.firstName} ${entry.lastName} matches an existing student. Confirm a second record, or link the existing student instead.`);
        created++;
      } else {
        if (!entry.existingStudentId) throw new ConvexError("Choose which existing student to link, then try again.");
        const student = existing.find(row => row._id === entry.existingStudentId);
        if (!student || !student.active || student.userId || !matches([student], entry.firstName, entry.lastName).length || chosen.has(student._id)) throw new ConvexError("The chosen student already has an account or doesn't match this name. Reload, then choose again.");
        chosen.add(student._id); linked++;
      }
    }
    if (!created && !linked) throw new ConvexError("Choose at least one student to invite.");
    const batchId = await ctx.db.insert("bulkInviteBatches", { seasonId: season._id, createdBy: actor._id, createdAt: now, expiresAt, idempotencyKey: args.idempotencyKey, requestHash, inviteCount: created + linked, pendingCount: created + linked, connectedCount: 0, createdCount: created, linkedCount: linked, skippedCount: skipped });
    for (const entry of entries) {
      if (entry.resolution === "skip") continue;
      let studentId = entry.existingStudentId;
      if (entry.resolution === "create") {
        studentId = await ctx.db.insert("students", { seasonId: season._id, legalName: `${entry.firstName} ${entry.lastName}`, preferredName: entry.firstName, firstName: entry.firstName, lastName: entry.lastName, structuredNameReviewed: true, email: "", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
        await refreshStudentFinance(ctx, studentId);
      }
      if (!studentId) throw new ConvexError("A student record couldn't be found. Reload, then try again.");
      const previousCodes = await ctx.db.query("bulkStudentInvites").withIndex("by_studentId_and_status", q => q.eq("studentId", studentId).eq("status", "pending")).take(101);
      if (previousCodes.length > 100) throw new ConvexError("A student in this file has too many open invitation codes. Revoke the old codes, then try again.");
      for (const previousCode of previousCodes) {
        await ctx.db.patch(previousCode._id, { status: "replaced", code: "" });
        const oldBatch = await ctx.db.get(previousCode.batchId);
        if (oldBatch) await ctx.db.patch(oldBatch._id, { pendingCount: oldBatch.pendingCount - 1 });
      }
      const code = await newCode(ctx);
      const inviteId = await ctx.db.insert("bulkStudentInvites", { batchId, seasonId: season._id, studentId, code, codeHash: await tokenHash(code), status: "pending", createdBy: actor._id, createdAt: now, expiresAt });
      await audit(ctx, actor, "bulkStudentInvites", inviteId, "create", null, { studentId, batchId, expiresAt });
    }
    await audit(ctx, actor, "bulkInviteBatches", batchId, "create", null, { created, linked, skipped, expiresAt });
    return { batchId, created, linked, skipped };
  },
});

export const listBatches = query({
  args: {}, returns: v.array(v.object({ batchId: v.id("bulkInviteBatches"), createdAt: v.number(), createdByName: v.string(), inviteCount: v.number(), pendingCount: v.number(), connectedCount: v.number(), expiresAt: v.union(v.number(), v.null()) })),
  handler: async ctx => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const season = await activeSeason(ctx);
    const rows = await ctx.db.query("bulkInviteBatches").withIndex("by_seasonId_and_createdAt", q => q.eq("seasonId", season._id)).order("desc").take(100);
    return Promise.all(rows.map(async row => ({ batchId: row._id, createdAt: row.createdAt, createdByName: (await ctx.db.get(row.createdBy))?.name ?? "Coach", inviteCount: row.inviteCount, pendingCount: row.pendingCount, connectedCount: row.connectedCount, expiresAt: effectiveExpiry(row.expiresAt, season.endsAt) })));
  },
});

export const batchDetail = query({
  args: { batchId: v.id("bulkInviteBatches"), asOf: v.number() },
  returns: v.object({ batchId: v.id("bulkInviteBatches"), createdAt: v.number(), expiresAt: v.union(v.number(), v.null()), invites: v.array(v.object({ inviteId: v.id("bulkStudentInvites"), studentId: v.id("students"), studentName: v.string(), firstName: v.string(), lastName: v.string(), status: v.union(v.literal("pending"), v.literal("redeemed"), v.literal("revoked"), v.literal("replaced")), createdAt: v.number(), expiresAt: v.union(v.number(), v.null()), code: v.union(v.string(), v.null()) })) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const season = await activeSeason(ctx);
    if (!Number.isSafeInteger(args.asOf)) throw new ConvexError("This page is out of date. Reload, then try again.");
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.seasonId !== season._id) throw new ConvexError("This upload is no longer available. Reload to see the latest.");
    const rows = await ctx.db.query("bulkStudentInvites").withIndex("by_batchId", q => q.eq("batchId", batch._id)).take(101);
    if (rows.length > 100) throw new ConvexError("This upload has more than 100 invitations, so it can't be shown here.");
    return { batchId: batch._id, createdAt: batch.createdAt, expiresAt: effectiveExpiry(batch.expiresAt, season.endsAt), invites: await Promise.all(rows.map(async row => {
      const student = await ctx.db.get(row.studentId);
      const expiresAt = effectiveExpiry(row.expiresAt, season.endsAt);
      return { inviteId: row._id, studentId: row.studentId, studentName: student?.legalName ?? "Student", firstName: student?.firstName ?? student?.legalName.split(/\s+/)[0] ?? "", lastName: student?.lastName ?? student?.legalName.split(/\s+/).slice(1).join(" ") ?? "", status: row.status, createdAt: row.createdAt, expiresAt, code: row.status === "pending" && student?.active && !student.userId && (expiresAt === null || expiresAt > args.asOf) ? row.code : null };
    })) };
  },
});

export const revoke = mutation({
  args: { inviteId: v.id("bulkStudentInvites"), expectedCode: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, invite } = await permittedInvite(ctx, args.inviteId);
    if (invite.code !== args.expectedCode) throw new ConvexError("This invitation changed since you opened it. Reload to see the latest, then try again.");
    if (invite.status !== "pending") throw new ConvexError("This invitation code was already used, revoked or replaced. Reload to see the latest.");
    await ctx.db.patch(invite._id, { status: "revoked", code: "" });
    const batch = await ctx.db.get(invite.batchId);
    if (batch) await ctx.db.patch(batch._id, { pendingCount: batch.pendingCount - 1 });
    await audit(ctx, actor, "bulkStudentInvites", invite._id, "revoke", "pending", "revoked");
    return null;
  },
});

export const replace = mutation({
  args: { inviteId: v.id("bulkStudentInvites"), expectedCode: v.string() }, returns: v.object({ code: v.string(), inviteId: v.id("bulkStudentInvites"), expiresAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const { actor, invite, season } = await permittedInvite(ctx, args.inviteId);
    if (invite.code !== args.expectedCode) throw new ConvexError("This invitation changed since you opened it. Reload to see the latest, then try again.");
    await requireSeasonProfileWritable(ctx, season._id);
    const student = await ctx.db.get(invite.studentId);
    if (invite.status === "redeemed" || !student || !student.active || student.userId) throw new ConvexError("This student already has an account or is no longer active, so a new code isn't needed.");
    const now = Date.now();
    if (season.endsAt !== undefined && season.endsAt <= now) throw new ConvexError("The current season has ended, so new invitation codes can't be created. Start the next season first.");
    const otherCodes = await ctx.db.query("bulkStudentInvites").withIndex("by_studentId_and_status", q => q.eq("studentId", student._id).eq("status", "pending")).take(101);
    if (otherCodes.length > 100) throw new ConvexError("This student has too many open invitation codes. Revoke the old codes, then try again.");
    for (const other of otherCodes) if (other._id !== invite._id) {
      await ctx.db.patch(other._id, { status: "replaced", code: "" });
      const otherBatch = await ctx.db.get(other.batchId);
      if (otherBatch) await ctx.db.patch(otherBatch._id, { pendingCount: otherBatch.pendingCount - 1 });
    }
    const code = await newCode(ctx); const expiresAt = season.endsAt;
    await ctx.db.patch(invite._id, { code, codeHash: await tokenHash(code), status: "pending", createdBy: actor._id, createdAt: now, expiresAt });
    if (invite.status !== "pending") {
      const batch = await ctx.db.get(invite.batchId);
      if (batch) await ctx.db.patch(batch._id, { pendingCount: batch.pendingCount + 1 });
    }
    await audit(ctx, actor, "bulkStudentInvites", invite._id, "replace", { status: invite.status }, { expiresAt });
    return { code, inviteId: invite._id, expiresAt: expiresAt ?? null };
  },
});

export const previewCode = mutation({
  args: { code: v.string() }, returns: v.object({ status: v.union(v.literal("valid"), v.literal("unavailable"), v.literal("signInRequired"), v.literal("accountConflict")), studentName: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const person = await applicant(ctx);
    if (!person?.who) return { status: "signInRequired" as const, studentName: null };
    const attempt = await limiter.limit(ctx, "studentCodeAttempts", { key: person.authUserId });
    if (!attempt.ok || !(await limiter.limit(ctx, "studentCodeDailyAttempts", { key: person.authUserId })).ok) return { status: "unavailable" as const, studentName: null };
    const found = await usableCode(ctx, args.code);
    if (!found) return { status: "unavailable" as const, studentName: null };
    const who = person.who;
    const account = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", person.authUserId)).unique();
    const emailAccounts = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", who.email)).take(2);
    if (account || emailAccounts.length) return { status: "accountConflict" as const, studentName: null };
    return { status: "valid" as const, studentName: null };
  },
});

// One field accepts every invitation code; the answer tells the join page whether to ask
// for a name (team code) or to request an account connection (individual invitation).
// It reveals no more than requestJoin and previewCode already do: whether this account can
// use the code. Wrong codes count toward the same 15-minute lockout as requestJoin, and every
// check shares the per-account limits used by previewCode and redeem.
export const checkInvitationCode = mutation({
  args: { code: v.string() },
  returns: v.object({ kind: v.union(v.literal("team"), v.literal("individual"), v.literal("unavailable"), v.literal("tooManyAttempts")) }),
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    if (await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique()) throw new ConvexError(googleRequiredForStudents);
    if (await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique()) throw new ConvexError(googleRequiredForStudents);
    const season = await activeSeason(ctx);
    const now = Date.now();
    if (await joinAttemptsLocked(ctx, who.authUserId, now)) return { kind: "tooManyAttempts" as const };
    const attempt = await limiter.limit(ctx, "studentCodeAttempts", { key: who.authUserId });
    if (!attempt.ok || !(await limiter.limit(ctx, "studentCodeDailyAttempts", { key: who.authUserId })).ok) return { kind: "tooManyAttempts" as const };
    if (await usableTeamCode(ctx, args.code, season._id, now)) return { kind: "team" as const };
    const person = await verifiedGoogle(ctx);
    const found = person ? await usableCode(ctx, args.code) : null;
    if (person && found && !(await accountConflict(ctx, person.authUserId, person.email, found.student))) return { kind: "individual" as const };
    await recordFailedJoinAttempt(ctx, who.authUserId, now);
    return { kind: "unavailable" as const };
  },
});

// A code proves possession only. Account access is created exclusively by a Coach decision.
export const redeem = mutation({
  args: { code: v.string() }, returns: v.object({ studentId: v.null(), requestId: v.union(v.id("bulkInviteConnectionRequests"), v.null()) }),
  handler: async (ctx, args) => {
    const refused = { studentId: null, requestId: null };
    const person = await applicant(ctx);
    if (!person?.who) return refused;
    const attempt = await limiter.limit(ctx, "studentCodeAttempts", { key: person.authUserId });
    if (!attempt.ok || !(await limiter.limit(ctx, "studentCodeDailyAttempts", { key: person.authUserId })).ok) return refused;
    const found = await usableCode(ctx, args.code);
    if (!found) return refused;
    const { row, student } = found;
    await requireSeasonProfileWritable(ctx, student.seasonId);
    if (await accountConflict(ctx, person.authUserId, person.who.email, student)) return refused;
    const previous = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_authUserId_and_inviteId_and_codeHash", q => q.eq("authUserId", person.authUserId).eq("inviteId", row._id).eq("codeHash", row.codeHash)).unique();
    // Decline blocks this account/code version. A Coach must replace the code to permit retry.
    if (previous) return previous.status === "pending" ? { studentId: null, requestId: previous._id } : refused;
    const outstanding = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_authUserId_and_status", q => q.eq("authUserId", person.authUserId).eq("status", "pending")).take(4);
    let liveCount = 0;
    for (const pending of outstanding) {
      if (await connectionCurrent(ctx, pending, Date.now())) liveCount++;
      else await ctx.db.patch(pending._id, { status: "declined", decidedAt: Date.now() });
    }
    if (liveCount >= 3) return refused;
    const requestId = await ctx.db.insert("bulkInviteConnectionRequests", {
      authUserId: person.authUserId, inviteId: row._id, codeHash: row.codeHash,
      studentId: student._id, seasonId: student.seasonId, googleName: person.who.name,
      googleEmail: person.who.email, status: "pending", createdAt: Date.now(),
    });
    return { studentId: null, requestId };
  },
});

async function accountConflict(ctx: Ctx, authUserId: Id<"users">, email: string, student: Doc<"students">) {
  const account = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
  const emailAccounts = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", email)).take(1);
  const emailStudents = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", student.seasonId).eq("email", email)).take(2);
  return !!account || emailAccounts.length > 0 || emailStudents.some(other => other._id !== student._id);
}

async function connectionCurrent(ctx: Ctx, request: Doc<"bulkInviteConnectionRequests">, asOf?: number) {
  const invite = await ctx.db.get(request.inviteId);
  const student = await ctx.db.get(request.studentId);
  const season = await ctx.db.get(request.seasonId);
  return !!invite && invite.codeHash === request.codeHash && invite.status === "pending" &&
    invite.studentId === request.studentId && invite.seasonId === request.seasonId &&
    !!student && student.active && !student.userId && student.seasonId === request.seasonId &&
    season?.status === "active" && (asOf === undefined ||
      ((invite.expiresAt === undefined || invite.expiresAt > asOf) && (season.endsAt === undefined || season.endsAt > asOf)));
}

const connectionStatus = v.union(v.literal("pending"), v.literal("approved"), v.literal("declined"));
export const myConnectionRequests = query({
  args: { asOf: v.optional(v.number()) }, returns: v.array(v.object({ requestId: v.id("bulkInviteConnectionRequests"), status: connectionStatus, createdAt: v.number() })),
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return [];
    const rows = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).order("desc").take(20);
    return Promise.all(rows.map(async row => ({ requestId: row._id, status: row.status === "pending" && !(await connectionCurrent(ctx, row, args.asOf)) ? "declined" as const : row.status, createdAt: row.createdAt })));
  },
});

export const listConnectionRequests = query({
  args: {}, returns: v.array(v.object({ requestId: v.id("bulkInviteConnectionRequests"), studentName: v.string(), googleName: v.string(), googleEmail: v.string(), createdAt: v.number() })),
  handler: async ctx => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const season = await activeSeason(ctx);
    const rows = await ctx.db.query("bulkInviteConnectionRequests").withIndex("by_seasonId_and_status", q => q.eq("seasonId", season._id).eq("status", "pending")).take(100);
    return Promise.all(rows.map(async row => ({ requestId: row._id, studentName: (await ctx.db.get(row.studentId))?.legalName ?? "Unavailable student", googleName: row.googleName, googleEmail: row.googleEmail, createdAt: row.createdAt })));
  },
});

export const decideConnection = mutation({
  args: { requestId: v.id("bulkInviteConnectionRequests"), approve: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("This connection request is no longer available. Reload to see the latest.");
    if (request.status !== "pending") {
      if (request.status === (args.approve ? "approved" : "declined")) return null;
      throw new ConvexError("This connection request was already approved or declined. Reload to see the latest.");
    }
    const now = Date.now();
    if (!args.approve) {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: now, decidedBy: actor._id });
      await audit(ctx, actor, "bulkInviteConnectionRequests", request._id, "decline", "pending", "declined");
      return null;
    }
    const adultEmailIdentity = await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    const parentEmailIdentity = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    if (adultEmailIdentity || parentEmailIdentity) throw new ConvexError("This person signed in with an email code, not Google, so they can't be connected as a student. Decline this request.");
    const row = await ctx.db.get(request.inviteId);
    const student = await ctx.db.get(request.studentId);
    const season = await activeSeason(ctx);
    if (!row || row.codeHash !== request.codeHash || row.status !== "pending" || row.studentId !== request.studentId || row.seasonId !== request.seasonId ||
        season._id !== request.seasonId || (season.endsAt !== undefined && season.endsAt <= now) || (row.expiresAt !== undefined && row.expiresAt <= now) ||
        !student || !student.active || student.userId || student.seasonId !== season._id) {
      throw new ConvexError("This invitation code is no longer valid. Decline this request and give the student a new code.");
    }
    await requireSeasonProfileWritable(ctx, season._id);
    const authUser = await ctx.db.get(request.authUserId);
    const googleAccounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", request.authUserId).eq("provider", "google")).take(2);
    if (!authUser?.emailVerificationTime || authUser.isAnonymous || !authUser.email || emailKey(authUser.email) !== request.googleEmail ||
        !googleAccounts.some(account => account.emailVerified && emailKey(account.emailVerified) === request.googleEmail)) {
      throw new ConvexError("This person's Google account changed after they asked to connect. Decline this request and give the student a new code.");
    }
    if (await accountConflict(ctx, request.authUserId, request.googleEmail, student)) throw new ConvexError("This Google account or email is already connected to an account. Decline this request.");
    const userId = await ctx.db.insert("appUsers", { authUserId: request.authUserId, email: request.googleEmail, name: request.googleName, role: "student", travelLead: false, financialEdit: false, active: true });
    await ctx.db.patch(student._id, { userId, email: request.googleEmail });
    await ctx.db.patch(row._id, { status: "redeemed", code: "", redeemedBy: userId, redeemedAt: now });
    await ctx.db.patch(request._id, { status: "approved", decidedAt: now, decidedBy: actor._id });
    const batch = await ctx.db.get(row.batchId);
    if (batch) await ctx.db.patch(batch._id, { pendingCount: batch.pendingCount - 1, connectedCount: batch.connectedCount + 1 });
    const requests = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).take(21);
    if (requests.length > 20) throw new ConvexError("This account has too many join requests to update. Review them in Join requests, then try again.");
    for (const pending of requests) if (pending.status === "pending" && pending.seasonId === student.seasonId) await ctx.db.patch(pending._id, { status: "approved", decidedAt: now, decidedBy: actor._id });
    await audit(ctx, actor, "bulkInviteConnectionRequests", request._id, "approve", "pending", { studentId: student._id, userId });
    return null;
  },
});
