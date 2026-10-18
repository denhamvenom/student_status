import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireRole, viewer } from "./lib/access";
import { affectedRecordClasses, archiveFingerprint, reviewThreshold } from "./lib/retention";

const subject = v.union(
  v.object({ kind: v.literal("student"), id: v.id("students") }),
  v.object({ kind: v.literal("account"), id: v.id("appUsers") }),
);
const status = v.union(v.literal("review"), v.literal("waiting"), v.literal("active"), v.literal("archiveDateMissing"), v.literal("linkedAccountActive"), v.literal("linkedArchiveDateMissing"));
const candidate = v.object({
  kind: v.union(v.literal("student"), v.literal("account")),
  id: v.union(v.id("students"), v.id("appUsers")),
  label: v.string(),
  role: v.union(v.string(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
  latestRelevantArchiveAt: v.union(v.number(), v.null()),
  reviewAfter: v.union(v.number(), v.null()),
  status,
  held: v.boolean(),
  latestHoldEventId: v.union(v.id("retentionHoldEvents"), v.null()),
  archiveFingerprint: v.union(v.string(), v.null()),
});
const historyRow = v.object({
  id: v.id("retentionHoldEvents"),
  action: v.union(v.literal("hold"), v.literal("release")),
  reason: v.string(),
  archivedAt: v.number(),
  archiveFingerprint: v.string(),
  actorName: v.string(),
  recordedAt: v.number(),
});
type Subject = { kind: "student"; id: Id<"students"> } | { kind: "account"; id: Id<"appUsers"> };
type ReadCtx = QueryCtx | MutationCtx;

function key(item: Subject) { return `${item.kind}:${item.id}`; }

function checkPageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 50) throw new Error("Choose a page size from 1 to 50.");
}

function boundedPage(options: typeof paginationOptsValidator.type) {
  checkPageSize(options.numItems);
  if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new Error("Maximum rows read must be a positive whole number.");
  return { ...options, maximumRowsRead: Math.min(options.maximumRowsRead ?? 51, 51) };
}

export function checkHydrationCount(count: number) {
  if (count > 50) throw new Error("This page is too large to review. Choose a smaller page boundary.");
}

function checkAsOf(asOf: number) {
  if (!Number.isSafeInteger(asOf) || asOf < 0) throw new Error("Review time is invalid.");
}

async function current(ctx: ReadCtx, item: Subject) {
  if (item.kind === "student") {
    const student = await ctx.db.get(item.id);
    if (!student) throw new Error("Student record is unavailable.");
    const account = student.userId ? await ctx.db.get(student.userId) : null;
    const fingerprint = archiveFingerprint("student", student._id, student.active, student.archivedAt ?? null, account);
    const accountBlocked = account?.active === true;
    const missingLinkedDate = !!account && !account.active && account.archivedAt === undefined;
    const latest = student.archivedAt === undefined || accountBlocked || missingLinkedDate ? null : Math.max(student.archivedAt, account?.archivedAt ?? 0);
    return { label: student.legalName, role: null, archivedAt: student.archivedAt ?? null, latest, fingerprint, active: student.active, accountBlocked, missingLinkedDate };
  }
  const account = await ctx.db.get(item.id);
  if (!account) throw new Error("Application account is unavailable.");
  return { label: account.name, role: account.role, archivedAt: account.archivedAt ?? null, latest: account.archivedAt ?? null, fingerprint: archiveFingerprint("account", account._id, account.active, account.archivedAt ?? null), active: account.active, accountBlocked: false, missingLinkedDate: false };
}

async function latestEvent(ctx: ReadCtx, item: Subject) {
  return await ctx.db.query("retentionHoldEvents").withIndex("by_subjectKey_and_recordedAt", q => q.eq("subjectKey", key(item))).order("desc").first();
}

async function row(ctx: ReadCtx, item: Subject, asOf: number) {
  const state = await current(ctx, item);
  const event = await latestEvent(ctx, item);
  const threshold = reviewThreshold(state.active ? undefined : state.latest ?? undefined, asOf);
  const reviewStatus = state.active ? "active" as const : state.archivedAt === null ? "archiveDateMissing" as const : state.accountBlocked ? "linkedAccountActive" as const : state.missingLinkedDate ? "linkedArchiveDateMissing" as const : threshold.reached ? "review" as const : "waiting" as const;
  return { kind: item.kind, id: item.id, label: state.label, role: state.role, archivedAt: state.archivedAt, latestRelevantArchiveAt: state.active ? null : state.latest, reviewAfter: threshold.reviewAfter, status: reviewStatus, held: event?.action === "hold", latestHoldEventId: event?._id ?? null, archiveFingerprint: state.fingerprint };
}

/** Native pagination over archived student records; a row is always a review candidate, never deletion authority. */
export const students = query({
  args: { paginationOpts: paginationOptsValidator, asOf: v.number() },
  returns: paginationResultValidator(candidate),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); checkAsOf(args.asOf);
    const page = await ctx.db.query("students").withIndex("by_active_and_archivedAt", q => q.eq("active", false)).paginate(boundedPage(args.paginationOpts));
    checkHydrationCount(page.page.length);
    return { ...page, page: await Promise.all(page.page.map((student) => row(ctx, { kind: "student", id: student._id }, args.asOf))) };
  },
});

/** Includes adult accounts and linked student logins, with role shown for context. */
export const accounts = query({
  args: { paginationOpts: paginationOptsValidator, asOf: v.number() },
  returns: paginationResultValidator(candidate),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); checkAsOf(args.asOf);
    const page = await ctx.db.query("appUsers").withIndex("by_active_and_archivedAt", q => q.eq("active", false)).paginate(boundedPage(args.paginationOpts));
    checkHydrationCount(page.page.length);
    return { ...page, page: await Promise.all(page.page.map((account) => row(ctx, { kind: "account", id: account._id }, args.asOf))) };
  },
});

/** The policy inventory is intentionally qualitative: no incomplete record counts or export promises. */
export const preview = query({
  args: { subject, asOf: v.number() },
  returns: v.object({ candidate, affectedRecordClasses: v.array(v.string()), deletionEnabled: v.boolean(), coverage: v.literal("unresolved"), backupsAndExports: v.literal("unresolved") }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach"); checkAsOf(args.asOf);
    const candidateRow = await row(ctx, args.subject, args.asOf);
    return { candidate: candidateRow, affectedRecordClasses: [...affectedRecordClasses], deletionEnabled: false, coverage: "unresolved" as const, backupsAndExports: "unresolved" as const };
  },
});

export const history = query({
  args: { subject, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(historyRow),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    await current(ctx, args.subject);
    const page = await ctx.db.query("retentionHoldEvents").withIndex("by_subjectKey_and_recordedAt", q => q.eq("subjectKey", key(args.subject))).order("desc").paginate(boundedPage(args.paginationOpts));
    checkHydrationCount(page.page.length);
    return { ...page, page: await Promise.all(page.page.map(async event => {
      const author = await ctx.db.get(event.actorId);
      return { id: event._id, action: event.action, reason: event.reason, archivedAt: event.archivedAt, archiveFingerprint: event.archiveFingerprint, actorName: author?.name ?? "Former Coach", recordedAt: event.recordedAt };
    })) };
  },
});

/** Every transition is a new row. The expected event and fingerprint reject stale tabs. */
export const setHold = mutation({
  args: { subject, expectedArchiveFingerprint: v.string(), expectedLatestHoldEventId: v.union(v.id("retentionHoldEvents"), v.null()), action: v.union(v.literal("hold"), v.literal("release")), reason: v.string() },
  returns: v.id("retentionHoldEvents"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const reason = args.reason.trim();
    if (!reason || reason.length > 1000) throw new Error("A reason under 1000 characters is required.");
    const state = await current(ctx, args.subject);
    if (args.action === "hold" && (state.active || state.archivedAt === null)) throw new Error("This account is active or has no archive date. Reload Archived records.");
    if (state.fingerprint !== args.expectedArchiveFingerprint) throw new Error("Archive status changed. Reload Archived records before recording a decision.");
    const previous = await latestEvent(ctx, args.subject);
    if ((previous?._id ?? null) !== args.expectedLatestHoldEventId) throw new Error("Hold history changed. Reload before recording a decision.");
    if (args.action === "hold" && previous?.action === "hold") throw new Error("A hold is already active for this archive instance.");
    if (args.action === "release" && previous?.action !== "hold") throw new Error("There is no active hold to release for this archive instance.");
    return await ctx.db.insert("retentionHoldEvents", { subjectKind: args.subject.kind, subjectId: args.subject.id, subjectKey: key(args.subject), archiveFingerprint: state.fingerprint, archivedAt: state.archivedAt ?? previous!.archivedAt, action: args.action, reason, actorId: actor._id, recordedAt: Date.now() });
  },
});
