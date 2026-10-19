import { v } from "convex/values";
import { env, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { financeMetrics, financeNamespace, reportAggregate } from "./lib/reportAggregates";

// This one-time operation deliberately has no public endpoint. Every row to be
// removed must appear by exact ID in the operator-reviewed manifest.
const manifestValidator = v.object({
  seasonId: v.id("seasons"),
  coachId: v.id("appUsers"),
  accounts: v.array(v.object({ id: v.id("appUsers"), authUserId: v.id("users"), email: v.string(), name: v.string(), role: v.union(v.literal("mentor"), v.literal("parent"), v.literal("student")) })),
  students: v.array(v.object({ id: v.id("students"), userId: v.id("appUsers"), email: v.string(), legalName: v.string() })),
  authUsersToDelete: v.array(v.object({ id: v.id("users"), email: v.string() })),
  ids: v.object({
    adultInvitations: v.array(v.id("adultInvitations")), parentInvitations: v.array(v.id("parentInvitations")),
    familyLinks: v.array(v.id("familyLinks")), joinRequests: v.array(v.id("joinRequests")),
    joinAttempts: v.array(v.id("joinAttempts")), setupDrafts: v.array(v.id("setupDrafts")),
    studentFinanceSummaries: v.array(v.id("studentFinanceSummaries")), financialAccounts: v.array(v.id("financialAccounts")),
    authAccounts: v.array(v.id("authAccounts")), authSessions: v.array(v.id("authSessions")),
    authRefreshTokens: v.array(v.id("authRefreshTokens")), authVerificationCodes: v.array(v.id("authVerificationCodes")),
    authVerifiers: v.array(v.id("authVerifiers")), joinCodes: v.array(v.id("joinCodes")),
    audit: v.array(v.id("audit")),
  }),
});
type Manifest = typeof manifestValidator.type;
type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type AllowedTable = keyof Manifest["ids"] | "appUsers" | "students" | "users";
const MAX_TARGETS = 4;
const MAX_ROWS_PER_TABLE = 100;
const MAX_DELETE_ROWS = 100;
const targetPattern = /^https:\/\/[a-z0-9-]+\.convex\.cloud$/;

function guardTarget(targetUrl: string) {
  if (env.SYNTHETIC_REHEARSAL_CLEANUP_ENABLED !== "true" ||
      !targetPattern.test(targetUrl) ||
      targetUrl !== env.SYNTHETIC_REHEARSAL_CLEANUP_CLOUD_URL ||
      targetUrl !== env.CONVEX_CLOUD_URL ||
      targetUrl.includes("third-bandicoot-18")) {
    throw new Error("Synthetic cleanup is disabled or bound to a different production deployment.");
  }
}

function exactUnique(ids: readonly string[], label: string, max = MAX_DELETE_ROWS) {
  if (ids.length > max || new Set(ids).size !== ids.length) throw new Error(`Invalid ${label} manifest count or duplicate ID.`);
}

function expectedIds(manifest: Manifest): Map<string, AllowedTable> {
  const expected = new Map<string, AllowedTable>();
  const add = (table: AllowedTable, id: string) => {
    if (expected.has(id)) throw new Error("A manifest ID appears more than once.");
    expected.set(id, table);
  };
  for (const row of manifest.accounts) add("appUsers", row.id);
  for (const row of manifest.students) add("students", row.id);
  for (const row of manifest.authUsersToDelete) add("users", row.id);
  for (const [table, ids] of Object.entries(manifest.ids) as [keyof Manifest["ids"], string[]][]) {
    exactUnique(ids, table);
    for (const id of ids) add(table, id);
  }
  if (expected.size > MAX_DELETE_ROWS) throw new Error("Synthetic cleanup manifest exceeds the single-transaction limit.");
  return expected;
}

// A compact deterministic fingerprint protects the reviewed preview from any
// account or dependency change before the atomic commit. It contains no PII.
async function fingerprint(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function inspect(ctx: QueryCtx | MutationCtx, manifest: Manifest) {
  if (manifest.accounts.length < 1 || manifest.accounts.length > MAX_TARGETS ||
      manifest.students.length > 1 || manifest.authUsersToDelete.length > MAX_TARGETS) {
    throw new Error("Cleanup is limited to the four rehearsal accounts and one student.");
  }
  exactUnique(manifest.accounts.map(row => row.id), "account", MAX_TARGETS);
  exactUnique(manifest.students.map(row => row.id), "student", 1);
  exactUnique(manifest.authUsersToDelete.map(row => row.id), "auth user", MAX_TARGETS);
  const expected = expectedIds(manifest);
  if (expected.has(manifest.coachId) || expected.has(manifest.seasonId)) throw new Error("Real Coach and season must be preserved.");
  const season = await ctx.db.get(manifest.seasonId);
  const coach = await ctx.db.get(manifest.coachId);
  if (!season || !coach || season.createdBy !== coach._id || coach.role !== "coach" || !coach.active || season.status !== "active") {
    throw new Error("Expected active Coach and season were not found.");
  }
  const coachAuth = await ctx.db.get(coach.authUserId);
  if (!coachAuth || coachAuth.email !== coach.email || !coachAuth.emailVerificationTime || coachAuth.isAnonymous) {
    throw new Error("The active Coach's verified auth identity changed.");
  }
  const coachGoogleAccounts = await ctx.db.query("authAccounts")
    .withIndex("userIdAndProvider", q => q.eq("userId", coach.authUserId).eq("provider", "google")).take(2);
  if (coachGoogleAccounts.length !== 1 || coachGoogleAccounts[0].emailVerified !== coach.email || coachGoogleAccounts[0].secret) {
    throw new Error("The active Coach's verified Google account changed.");
  }
  const coachSessions = await ctx.db.query("authSessions")
    .withIndex("userId", q => q.eq("userId", coach.authUserId)).take(MAX_ROWS_PER_TABLE + 1);
  if (coachSessions.length > MAX_ROWS_PER_TABLE) throw new Error("Coach session inventory limit exceeded.");
  const coachSessionIds = new Set(coachSessions.map(row => row._id));
  if (expected.has(coach.authUserId) || expected.has(coachGoogleAccounts[0]._id) ||
      coachSessions.some(row => expected.has(row._id))) {
    throw new Error("The Coach auth identity and sessions must be preserved.");
  }

  const documents: Array<{ table: string; row: Row }> = [];
  const found = new Set<string>();
  const protectedIds = new Set<string>([...expected.keys()]);
  const targetEmails = new Set<string>();
  const targetJoinCodes = new Set<string>();
  const retainedAuthIds = new Set(manifest.accounts.map(a => a.authUserId).filter(id => !manifest.authUsersToDelete.some(u => u.id === id)));
  for (const account of manifest.accounts) {
    const row = await ctx.db.get(account.id);
    if (!row || row.role !== account.role || row.authUserId !== account.authUserId ||
        row.email !== account.email || row.name !== account.name ||
        !row.active || row.financialEdit || row.healthExport) {
      throw new Error("A rehearsal account no longer matches its exact identity and limited permissions.");
    }
    targetEmails.add(account.email);
    if (row.role === "student" && !manifest.students.some(s => s.userId === row._id)) throw new Error("Student profile is missing from manifest.");
  }
  for (const student of manifest.students) {
    const row = await ctx.db.get(student.id);
    if (!row || row.seasonId !== manifest.seasonId || row.userId !== student.userId ||
        row.email !== student.email || row.legalName !== student.legalName ||
        !manifest.accounts.some(a => a.id === student.userId && a.role === "student" && a.email === student.email) ||
        row.consentProfileV2ConfirmedBy && !manifest.accounts.some(a => a.id === row.consentProfileV2ConfirmedBy && a.role === "parent")) {
      throw new Error("Student no longer matches the account-only rehearsal profile.");
    }
    targetEmails.add(student.email);
  }
  for (const user of manifest.authUsersToDelete) {
    const row = await ctx.db.get(user.id);
    if (!row || row.email !== user.email || !manifest.accounts.some(a => a.authUserId === row._id)) {
      throw new Error("Auth identity is missing, changed, or outside the account manifest.");
    }
    targetEmails.add(user.email);
  }
  for (const codeId of manifest.ids.joinCodes) {
    const row = await ctx.db.get(codeId);
    if (!row || row.seasonId !== manifest.seasonId || row.createdBy !== manifest.coachId || !row.revoked) {
      throw new Error("Join code is missing, active, or outside the rehearsal scope.");
    }
    targetJoinCodes.add(row.code);
  }

  // This bounded scan is intentionally conservative. It catches unexpected
  // cross-table references, including tables without a useful account index.
  // A busy deployment must be reviewed with a dedicated migration instead.
  for (const table of Object.keys(schema.tables).sort() as TableNames[]) {
    const rows = await ctx.db.query(table).take(MAX_ROWS_PER_TABLE + 1);
    if (rows.length > MAX_ROWS_PER_TABLE) throw new Error(`Dependency inventory limit exceeded for ${table}.`);
    for (const candidate of rows) {
      const row = candidate as unknown as Row;
      const owner = expected.get(row._id);
      if (owner !== undefined && owner !== table) throw new Error("Manifest ID belongs to a different table.");
      const serialized = JSON.stringify(row);
      const referencesTarget = [...protectedIds].some(id => serialized.includes(id)) ||
        table === "audit" && row.entity === "joinCodes" && targetJoinCodes.has(row.entityId as string);
      const referencesEmail = [...targetEmails].some(email => email.length > 0 && serialized.includes(email));
      const retainedAuthRow = owner === undefined && (
        table === "users" && retainedAuthIds.has(row._id as Id<"users">) ||
        table === "authAccounts" && retainedAuthIds.has(row.userId as Id<"users">) ||
        table === "authSessions" && retainedAuthIds.has(row.userId as Id<"users">)
      );
      if (owner === undefined && !retainedAuthRow && (referencesTarget || referencesEmail)) {
        // Audit evidence about the real Coach/season must remain. Such evidence
        // requires a human dependency decision before any account removal.
        throw new Error(`Unexpected ${table} reference to a rehearsal identity.`);
      }
      if (owner !== undefined) {
        found.add(row._id);
        documents.push({ table, row });
      }
    }
  }
  if (found.size !== expected.size) throw new Error("Manifest contains missing or unscanned records.");
  const accountIds = new Set<string>(manifest.accounts.map(a => a.id));
  const studentIds = new Set<string>(manifest.students.map(s => s.id));
  const authIds = new Set<string>(manifest.authUsersToDelete.map(u => u.id));
  const sessionIds = new Set<string>(manifest.ids.authSessions);
  const authAccountIds = new Set<string>(manifest.ids.authAccounts);
  const check = (ok: unknown) => { if (!ok) throw new Error("Manifest contains a record outside the account-only rehearsal scope."); };
  for (const { table, row } of documents) {
    switch (table) {
      case "appUsers": case "students": case "users": break;
      case "familyLinks": check(accountIds.has(row.parentUserId as string) && studentIds.has(row.studentId as string)); break;
      case "adultInvitations": check(row.createdBy === manifest.coachId && manifest.accounts.some(a => a.role === "mentor" && a.email === row.email && (!row.acceptedBy || row.acceptedBy === a.id))); break;
      case "parentInvitations": check(studentIds.has(row.studentId as string) && manifest.students.some(s => s.userId === row.createdBy) && manifest.accounts.some(a => a.role === "parent" && a.email === row.parentEmail && (!row.acceptedBy || row.acceptedBy === a.id))); break;
      case "joinRequests": check(manifest.accounts.some(a => a.authUserId === row.authUserId) && row.seasonId === manifest.seasonId); break;
      case "joinAttempts": check(manifest.accounts.some(a => a.authUserId === row.authUserId)); break;
      case "joinCodes": check(row.seasonId === manifest.seasonId && row.createdBy === manifest.coachId && row.revoked === true); break;
      case "setupDrafts": check(studentIds.has(row.studentId as string) && row.seasonId === manifest.seasonId); break;
      case "studentFinanceSummaries": check(studentIds.has(row.studentId as string) && row.seasonId === manifest.seasonId &&
        row.raisedComplete === true && ["chargedCents", "paidCents", "dueCents", "personalAvailableCents", "fundraisingAvailableCents", "travelBalanceCents", "travelShareCents", "transferredInCents", "knownRaisedCents", "personalAppliedCents", "fundraisingAppliedCents"].every(key => row[key] === undefined || row[key] === 0)); break;
      case "financialAccounts": check(studentIds.has(row.studentId as string) && row.seasonId === manifest.seasonId && row.state === "ready" &&
        ["chargedCents", "paidCents", "personalAvailableCents", "fundraisingAvailableCents", "personalAppliedCents", "fundraisingAppliedCents", "travelShareCents", "transferredInCents", "knownRaisedCents", "unknownGrossSourceCount", "ledgerCount", "sourceCount", "chargeCount", "processed"].every(key => row[key] === 0 || row[key] === undefined) &&
        row.lastLedgerAt === null && (row.lastFinancialChangeAt === null || row.lastFinancialChangeAt === undefined) &&
        !row.allocationJobId && !row.operationJobId && !row.fundraiserJobId && !row.fundraiserRowId && !row.rebuildActorId); break;
      case "authAccounts": check(authIds.has(row.userId as string) && row.provider === "google" && !row.secret); break;
      case "authSessions": check(authIds.has(row.userId as string)); break;
      case "authRefreshTokens": check(sessionIds.has(row.sessionId as string) && !coachSessionIds.has(row.sessionId as Id<"authSessions">)); break;
      case "authVerificationCodes": check(authAccountIds.has(row.accountId as string)); break;
      case "authVerifiers": check(sessionIds.has(row.sessionId as string) ||
        (row.sessionId === undefined && typeof row.signature === "string" && row.signature.length > 0)); break;
      case "audit": check((protectedIds.has(row.entityId as string) || row.entity === "joinCodes" && targetJoinCodes.has(row.entityId as string)) && row.entity !== "seasons" && (row.actorId === manifest.coachId || accountIds.has(row.actorId as string))); break;
      default: throw new Error("Unexpected cleanup table.");
    }
  }
  for (const account of manifest.accounts) {
    const auth = await ctx.db.get(account.authUserId);
    if (!auth || auth.email !== account.email || !auth.emailVerificationTime || auth.isAnonymous) throw new Error("Verified rehearsal login changed.");
    const sameAuth = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", account.authUserId)).take(2);
    if (sameAuth.length !== 1 || sameAuth[0]._id !== account.id) throw new Error("Auth identity is shared with another profile.");
  }
  const counts: Record<string, number> = {};
  for (const { table } of documents) counts[table] = (counts[table] ?? 0) + 1;
  documents.sort((a, b) => a.table.localeCompare(b.table) || a.row._id.localeCompare(b.row._id));
  return { documents, counts, fingerprint: await fingerprint(documents) };
}

export const preview = internalQuery({
  args: { targetUrl: v.string(), manifest: manifestValidator },
  returns: v.object({ fingerprint: v.string(), counts: v.record(v.string(), v.number()) }),
  handler: async (ctx, args) => {
    guardTarget(args.targetUrl);
    const result = await inspect(ctx, args.manifest);
    return { fingerprint: result.fingerprint, counts: result.counts };
  },
});

export const commit = internalMutation({
  args: { targetUrl: v.string(), manifest: manifestValidator, reviewedFingerprint: v.string(), reviewedCounts: v.record(v.string(), v.number()) },
  returns: v.object({ deleted: v.record(v.string(), v.number()), receiptId: v.id("audit") }),
  handler: async (ctx, args) => {
    guardTarget(args.targetUrl);
    const result = await inspect(ctx, args.manifest);
    if (result.fingerprint !== args.reviewedFingerprint || JSON.stringify(result.counts) !== JSON.stringify(args.reviewedCounts)) {
      throw new Error("Rehearsal dependency inventory changed after preview; review a fresh manifest.");
    }
    const financialSummaries = result.documents.filter(row => row.table === "studentFinanceSummaries");
    for (const { row } of financialSummaries) {
      for (const metric of financeMetrics) await reportAggregate.deleteIfExists(ctx, {
        namespace: financeNamespace(args.manifest.seasonId, metric), key: 0, id: row.studentId as Id<"students">,
      });
    }
    // Remove children before parents. The entire mutation rolls back on any failure.
    const order = ["authRefreshTokens", "authVerificationCodes", "authVerifiers", "authSessions", "authAccounts", "familyLinks", "adultInvitations", "parentInvitations", "joinRequests", "joinAttempts", "joinCodes", "setupDrafts", "studentFinanceSummaries", "financialAccounts", "audit", "students", "appUsers", "users"];
    for (const table of order) for (const { row } of result.documents.filter(entry => entry.table === table)) await ctx.db.delete(row._id as Id<"users">);
    const receiptId = await ctx.db.insert("audit", {
      actorId: args.manifest.coachId, entity: "syntheticRehearsalCleanup", entityId: args.manifest.seasonId,
      action: "exactIdCleanup", afterJson: JSON.stringify({ counts: result.counts, fingerprint: result.fingerprint }),
      reason: "Owner-approved synthetic account rehearsal cleanup; real Coach, season, and unrelated audit evidence preserved", at: Date.now(),
    });
    return { deleted: result.counts, receiptId };
  },
});
