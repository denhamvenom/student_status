import { getAuthUserId } from "@convex-dev/auth/server";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { activeSeason, audit, requireRole, requireSeasonProfileWritable, viewer } from "./lib/access";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { emailKey, tokenHash, verifiedGoogle } from "./lib/invitationIdentity";

const limiter = new RateLimiter(components.rateLimiter, {
  studentCodeAttempts: { kind: "fixed window", rate: 10, period: 60_000 },
  studentCodeDailyAttempts: { kind: "fixed window", rate: 30, period: 86_400_000 },
});
const nameInput = v.object({ firstName: v.string(), lastName: v.string() });
const entryInput = v.object({ firstName: v.string(), lastName: v.string(), resolution: v.union(v.literal("skip"), v.literal("create"), v.literal("link")), existingStudentId: v.optional(v.id("students")), confirmDuplicate: v.optional(v.boolean()) });
type Ctx = QueryCtx | MutationCtx;
type Entry = { firstName: string; lastName: string; resolution: "skip" | "create" | "link"; existingStudentId?: Id<"students">; confirmDuplicate?: boolean };

function name(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 80 || [...clean].some(character => character.charCodeAt(0) < 32)) throw new Error("Each student needs a first and last name under 80 characters.");
  return clean;
}
function key(first: string, last: string) { return `${first} ${last}`.normalize("NFKC").toLocaleLowerCase("en-US"); }
function cleanRows<T extends { firstName: string; lastName: string }>(rows: T[]) {
  if (rows.length < 1 || rows.length > 100) throw new Error("Upload 1 to 100 students at a time.");
  return rows.map(row => ({ ...row, firstName: name(row.firstName), lastName: name(row.lastName) }));
}
async function newCode(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    // Rejection sampling avoids modulo bias; no leading zero to lose in Excel.
    if (value >= 4_294_890_000) continue;
    const code = String(10_000 + value % 90_000);
    const codeHash = await tokenHash(code);
    const used = await ctx.db.query("bulkInviteCodeReservations").withIndex("by_codeHash", q => q.eq("codeHash", codeHash)).unique();
    if (used) continue;
    await ctx.db.insert("bulkInviteCodeReservations", { codeHash });
    return code;
  }
  throw new Error("Could not allocate an unused invitation code. Try again.");
}
function normalizedCode(value: string) { return value.trim().toUpperCase(); }
function validCode(value: string) { return /^\d{5}$/.test(value) || /^DV-[0-9A-F]{32}$/.test(value); }
function effectiveExpiry(inviteExpiry: number | undefined, seasonExpiry: number | undefined) {
  if (inviteExpiry === undefined) return seasonExpiry ?? null;
  return seasonExpiry === undefined ? inviteExpiry : Math.min(inviteExpiry, seasonExpiry);
}
async function fingerprint(value: unknown) { return tokenHash(JSON.stringify(value)); }
async function roster(ctx: Ctx, seasonId: Id<"seasons">) {
  const rows = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).take(1001);
  if (rows.length > 1000) throw new Error("Roster is too large for name matching; ask a Coach to review the roster.");
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
  if (!invite || invite.seasonId !== season._id) throw new Error("Invitation unavailable.");
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
      if (found.length > 20) throw new Error("Too many matching records for one name; review the roster first.");
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
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.idempotencyKey)) throw new Error("Use a valid batch submission key.");
    const requestHash = await fingerprint(entries);
    const previous = await ctx.db.query("bulkInviteBatches").withIndex("by_createdBy_and_idempotencyKey", q => q.eq("createdBy", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (previous) {
      if (previous.requestHash !== requestHash) throw new Error("This submission key was already used for a different batch.");
      return { batchId: previous._id, created: previous.createdCount, linked: previous.linkedCount, skipped: previous.skippedCount };
    }
    const now = Date.now();
    if (season.endsAt !== undefined && season.endsAt <= now) throw new Error("The active season has ended.");
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
        if (entry.existingStudentId) throw new Error("New records cannot select an existing student.");
        if (duplicate && !entry.confirmDuplicate) throw new Error(`Confirm the duplicate record for ${entry.firstName} ${entry.lastName}.`);
        created++;
      } else {
        if (!entry.existingStudentId) throw new Error("Choose an unlinked student record.");
        const student = existing.find(row => row._id === entry.existingStudentId);
        if (!student || !student.active || student.userId || !matches([student], entry.firstName, entry.lastName).length || chosen.has(student._id)) throw new Error("The selected student is unavailable or does not match this name.");
        chosen.add(student._id); linked++;
      }
    }
    if (!created && !linked) throw new Error("Choose at least one student to invite.");
    const batchId = await ctx.db.insert("bulkInviteBatches", { seasonId: season._id, createdBy: actor._id, createdAt: now, expiresAt, idempotencyKey: args.idempotencyKey, requestHash, inviteCount: created + linked, pendingCount: created + linked, connectedCount: 0, createdCount: created, linkedCount: linked, skippedCount: skipped });
    for (const entry of entries) {
      if (entry.resolution === "skip") continue;
      let studentId = entry.existingStudentId;
      if (entry.resolution === "create") {
        studentId = await ctx.db.insert("students", { seasonId: season._id, legalName: `${entry.firstName} ${entry.lastName}`, preferredName: entry.firstName, firstName: entry.firstName, lastName: entry.lastName, structuredNameReviewed: true, email: "", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
        await refreshStudentFinance(ctx, studentId);
      }
      if (!studentId) throw new Error("Student record unavailable.");
      const previousCodes = await ctx.db.query("bulkStudentInvites").withIndex("by_studentId_and_status", q => q.eq("studentId", studentId).eq("status", "pending")).take(101);
      if (previousCodes.length > 100) throw new Error("Too many prior codes for this student.");
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
    if (!Number.isSafeInteger(args.asOf)) throw new Error("A valid review time is required.");
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.seasonId !== season._id) throw new Error("Batch unavailable.");
    const rows = await ctx.db.query("bulkStudentInvites").withIndex("by_batchId", q => q.eq("batchId", batch._id)).take(101);
    if (rows.length > 100) throw new Error("Batch exceeds its invitation limit.");
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
    if (invite.code !== args.expectedCode) throw new Error("Invitation changed. Reload before managing its code.");
    if (invite.status !== "pending") throw new Error("Pending invitation unavailable.");
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
    if (invite.code !== args.expectedCode) throw new Error("Invitation changed. Reload before managing its code.");
    await requireSeasonProfileWritable(ctx, season._id);
    const student = await ctx.db.get(invite.studentId);
    if (invite.status === "redeemed" || !student || !student.active || student.userId) throw new Error("This student already has an account or is unavailable.");
    const now = Date.now();
    if (season.endsAt !== undefined && season.endsAt <= now) throw new Error("The active season has ended.");
    const otherCodes = await ctx.db.query("bulkStudentInvites").withIndex("by_studentId_and_status", q => q.eq("studentId", student._id).eq("status", "pending")).take(101);
    if (otherCodes.length > 100) throw new Error("Invitation history requires Coach review.");
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
    if (!request) throw new Error("Connection request unavailable.");
    if (request.status !== "pending") {
      if (request.status === (args.approve ? "approved" : "declined")) return null;
      throw new Error("This connection request has already been decided.");
    }
    const now = Date.now();
    if (!args.approve) {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: now, decidedBy: actor._id });
      await audit(ctx, actor, "bulkInviteConnectionRequests", request._id, "decline", "pending", "declined");
      return null;
    }
    const row = await ctx.db.get(request.inviteId);
    const student = await ctx.db.get(request.studentId);
    const season = await activeSeason(ctx);
    if (!row || row.codeHash !== request.codeHash || row.status !== "pending" || row.studentId !== request.studentId || row.seasonId !== request.seasonId ||
        season._id !== request.seasonId || (season.endsAt !== undefined && season.endsAt <= now) || (row.expiresAt !== undefined && row.expiresAt <= now) ||
        !student || !student.active || student.userId || student.seasonId !== season._id) {
      throw new Error("This request is stale. Decline it and ask the student to use a current invitation.");
    }
    await requireSeasonProfileWritable(ctx, season._id);
    const authUser = await ctx.db.get(request.authUserId);
    const googleAccounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", request.authUserId).eq("provider", "google")).take(2);
    if (!authUser?.emailVerificationTime || authUser.isAnonymous || !authUser.email || emailKey(authUser.email) !== request.googleEmail ||
        !googleAccounts.some(account => account.emailVerified && emailKey(account.emailVerified) === request.googleEmail)) {
      throw new Error("The verified Google identity has changed. Decline this request and issue a new invitation.");
    }
    if (await accountConflict(ctx, request.authUserId, request.googleEmail, student)) throw new Error("This Google account or email is already connected. Decline this request.");
    const userId = await ctx.db.insert("appUsers", { authUserId: request.authUserId, email: request.googleEmail, name: request.googleName, role: "student", travelLead: false, financialEdit: false, active: true });
    await ctx.db.patch(student._id, { userId, email: request.googleEmail });
    await ctx.db.patch(row._id, { status: "redeemed", code: "", redeemedBy: userId, redeemedAt: now });
    await ctx.db.patch(request._id, { status: "approved", decidedAt: now, decidedBy: actor._id });
    const batch = await ctx.db.get(row.batchId);
    if (batch) await ctx.db.patch(batch._id, { pendingCount: batch.pendingCount - 1, connectedCount: batch.connectedCount + 1 });
    const requests = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).take(21);
    if (requests.length > 20) throw new Error("Join request history requires Coach review.");
    for (const pending of requests) if (pending.status === "pending" && pending.seasonId === student.seasonId) await ctx.db.patch(pending._id, { status: "approved", decidedAt: now, decidedBy: actor._id });
    await audit(ctx, actor, "bulkInviteConnectionRequests", request._id, "approve", "pending", { studentId: student._id, userId });
    return null;
  },
});
