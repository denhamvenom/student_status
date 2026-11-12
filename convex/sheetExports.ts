import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalMutation, internalQuery, query, mutation, type MutationCtx } from "./_generated/server";
import { audit, isCoachOrTravelLead, requireRole, viewer } from "./lib/access";
import { SHEET_KINDS, folderVisible, sheetFileKind, sheetFolder, sheetKindInfo } from "./lib/sheetKinds";
import { sheetUpdateDue } from "./lib/sheetSchedule";
import { spreadsheetLink } from "./lib/googleSheets";

/** Longer than the 10-minute limit of one action, so a run is never taken over while its last step may still be working. */
export const LEASE_MS = 15 * 60_000;
export const ALREADY_UPDATING = "Spreadsheets are already updating. This takes a few minutes.";
export const NOT_SET_UP = "Google Drive isn't connected yet. A Coach can connect it on this page.";
export const NO_SEASON = "There's no active season yet, so there's nothing to put in the spreadsheets. A Coach can start a season on the Season page.";
export const NOT_TURNED_ON = "Spreadsheet updates aren't turned on yet. Ask the person who set up Venom Status for your team to turn them on.";
export const TOO_MANY = "You've pressed Update spreadsheets several times. Wait a few minutes, then try again.";
export const TOO_MANY_CHECKS = "You've checked access several times. Wait a few minutes, then try again.";

const limiter = new RateLimiter(components.rateLimiter, {
  sheetUpdatePress: { kind: "fixed window", rate: 5, period: 10 * 60_000 },
  sheetAccessCheck: { kind: "fixed window", rate: 10, period: 10 * 60_000 },
});

/** Google writes happen only when the deployment says so. */
export const exportEnabled = () => env.GOOGLE_SHEETS_EXPORT_ENABLED === "true";
export const credentialsConfigured = () => !!(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY);

const startResult = v.union(
  v.object({ status: v.literal("started") }),
  v.object({ status: v.union(v.literal("alreadyUpdating"), v.literal("notSetUp"), v.literal("noSeason"), v.literal("off"), v.literal("tooManyRequests")), message: v.string() }),
);

type Begin = { status: "started"; runId: Id<"sheetExportRuns"> } | { status: "alreadyUpdating" | "notSetUp" | "noSeason" | "off" | "skipped" };

/** Starts a run unless one is in progress (its lease has not expired). An expired lease is taken over. */
async function beginRun(ctx: MutationCtx, trigger: "schedule" | "button", requestedBy: Id<"appUsers"> | undefined, now: number): Promise<Begin> {
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  const settings = await ctx.db.query("sheetExportSettings").first();
  if (!season) return { status: "noSeason" };
  if (!settings) return { status: "notSetUp" };
  if (!exportEnabled() || !credentialsConfigured()) return { status: "off" };
  const latest = await ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first();
  if (latest?.state === "running") {
    if (latest.leaseExpiresAt > now) return { status: "alreadyUpdating" };
    await ctx.db.patch(latest._id, { state: "partial", finishedAt: now });
  } else if (trigger === "schedule" && latest?.trigger === "schedule" && now - latest.startedAt < 50 * 60_000) return { status: "skipped" };
  const pending = SHEET_KINDS.map(item => item.kind);
  const runId = await ctx.db.insert("sheetExportRuns", { seasonId: season._id, trigger, requestedBy, startedAt: now, leaseExpiresAt: now + LEASE_MS, pending, total: pending.length, done: 0, failed: 0, state: "running" });
  await ctx.scheduler.runAfter(0, internal.sheetExportActions.runOne, { runId });
  return { status: "started", runId };
}

/** Any Coach or Travel Lead (a Parent acting as Travel Lead included) refreshes every file, even ones they cannot open. */
export const requestUpdate = mutation({
  args: {}, returns: startResult,
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (!isCoachOrTravelLead(actor)) throw new ConvexError("Only a Coach or Travel Lead can update the team spreadsheets.");
    if (!(await limiter.check(ctx, "sheetUpdatePress", { key: actor._id })).ok) return { status: "tooManyRequests" as const, message: TOO_MANY };
    const begun = await beginRun(ctx, "button", actor._id, Date.now());
    if (begun.status === "alreadyUpdating") return { status: "alreadyUpdating" as const, message: ALREADY_UPDATING };
    if (begun.status === "noSeason") return { status: "noSeason" as const, message: NO_SEASON };
    if (begun.status === "notSetUp" || begun.status === "skipped") return { status: "notSetUp" as const, message: NOT_SET_UP };
    if (begun.status === "off") return { status: "off" as const, message: NOT_TURNED_ON };
    await limiter.limit(ctx, "sheetUpdatePress", { key: actor._id });
    return { status: "started" as const };
  },
});

/** Hourly cron: starts a full update only in the 5:00 AM and 6:00 PM Chicago hours (DST-safe). */
export const hourly = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const now = Date.now();
    if (sheetUpdateDue(now)) await beginRun(ctx, "schedule", undefined, now);
    return null;
  },
});

export const requireCoach = internalQuery({
  args: {}, returns: v.null(),
  handler: async ctx => { requireRole(await viewer(ctx), "coach"); return null; },
});

export const getSettings = internalQuery({
  args: {}, returns: v.union(v.null(), v.object({ driveId: v.string(), generalFolderId: v.string(), moneyFolderId: v.string(), healthFolderId: v.string(), eventsFolderId: v.union(v.string(), v.null()), archiveFolderId: v.union(v.string(), v.null()) })),
  handler: async ctx => {
    const row = await ctx.db.query("sheetExportSettings").first();
    return row ? { driveId: row.driveId, generalFolderId: row.generalFolderId, moneyFolderId: row.moneyFolderId, healthFolderId: row.healthFolderId, eventsFolderId: row.eventsFolderId ?? null, archiveFolderId: row.archiveFolderId ?? null } : null;
  },
});

/** Coach only (checked by the setup action). Files made in a folder that has changed are forgotten; the next update makes new ones. */
export const saveSettings = internalMutation({
  args: { driveId: v.string(), generalFolderId: v.string(), moneyFolderId: v.string(), healthFolderId: v.string(), eventsFolderId: v.string(), archiveFolderId: v.optional(v.string()), setBy: v.id("appUsers"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { now, ...fields } = args;
    const actor = await ctx.db.get(args.setBy);
    const existing = await ctx.db.query("sheetExportSettings").first();
    // Which folders changed (names only; folder links are not written to the audit trail).
    const keys = { general: "generalFolderId", money: "moneyFolderId", health: "healthFolderId", events: "eventsFolderId", archive: "archiveFolderId" } as const;
    const changed = (Object.keys(keys) as (keyof typeof keys)[]).filter(name => existing?.[keys[name]] !== fields[keys[name]]);
    if (existing) await ctx.db.replace(existing._id, { ...fields, setAt: now });
    else await ctx.db.insert("sheetExportSettings", { ...fields, setAt: now });
    const folderIds = { general: args.generalFolderId, money: args.moneyFolderId, health: args.healthFolderId, events: args.eventsFolderId };
    // Bounded: a handful of files per season. Files made in a folder that is no longer configured are forgotten (they stay in Drive).
    for (const file of await ctx.db.query("sheetExportFiles").take(500)) if (file.folderId !== folderIds[file.folder]) await ctx.db.delete(file._id);
    if (actor) await audit(ctx, actor, "sheetExportSettings", existing?._id ?? "new", existing ? "update" : "connect", existing ? { connected: true } : null, { connected: true, foldersChanged: changed, driveChanged: existing ? existing.driveId !== args.driveId : true });
    return null;
  },
});

/** One check-access attempt per call; false once a Coach has tried too often in a short time. */
export const takeCheckAttempt = internalMutation({
  args: { actorId: v.id("appUsers") }, returns: v.boolean(),
  handler: async (ctx, args) => (await limiter.limit(ctx, "sheetAccessCheck", { key: args.actorId })).ok,
});

/** True while this run still holds the update (it has not finished and was not taken over). Checked before every Google write. */
export const runCurrent = internalQuery({
  args: { runId: v.id("sheetExportRuns") }, returns: v.boolean(),
  handler: async (ctx, args) => { const run = await ctx.db.get(args.runId); return run?.state === "running" && run.leaseExpiresAt > Date.now(); },
});

export const setupActor = internalQuery({
  args: {}, returns: v.id("appUsers"),
  handler: async ctx => { const actor = await viewer(ctx); requireRole(actor, "coach"); return actor._id; },
});

const claimValidator = v.union(v.null(), v.object({
  kind: sheetFileKind, seasonId: v.id("seasons"), seasonName: v.string(), driveId: v.string(), folder: sheetFolder, folderId: v.string(),
  file: v.union(v.null(), v.object({ spreadsheetId: v.string(), tabs: v.array(v.object({ title: v.string(), sheetId: v.number() })), fingerprint: v.union(v.string(), v.null()), folderId: v.string(), hadError: v.boolean() })),
}));

/** The next file of a run, with its lease extended. Null when the run is over, replaced, or Google writes are off. */
export const claimNext = internalMutation({
  args: { runId: v.id("sheetExportRuns") }, returns: claimValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const now = Date.now();
    if (!run || run.state !== "running" || !run.pending.length) return null;
    if (!exportEnabled() || !credentialsConfigured()) { await ctx.db.patch(run._id, { state: "stopped", finishedAt: now }); return null; }
    const settings = await ctx.db.query("sheetExportSettings").first();
    const season = await ctx.db.get(run.seasonId);
    if (!settings || !season) { await ctx.db.patch(run._id, { state: "stopped", finishedAt: now }); return null; }
    await ctx.db.patch(run._id, { leaseExpiresAt: now + LEASE_MS });
    const kind = run.pending[0];
    const info = sheetKindInfo(kind);
    const folderId = { general: settings.generalFolderId, money: settings.moneyFolderId, health: settings.healthFolderId, events: settings.eventsFolderId }[info.folder];
    if (!folderId) { await ctx.db.patch(run._id, { state: "stopped", finishedAt: now }); return null; }
    const file = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", run.seasonId).eq("kind", kind).eq("eventId", undefined)).first();
    return { kind, seasonId: run.seasonId, seasonName: season.name, driveId: settings.driveId, folder: info.folder, folderId, file: file ? { spreadsheetId: file.spreadsheetId, tabs: file.tabs, fingerprint: file.fingerprint ?? null, folderId: file.folderId, hadError: file.lastError !== undefined } : null };
  },
});

/**
 * Saves what is known about a file. Refuses (false) when the run no longer holds the update. A save without a fingerprint also clears the stored
 * one, so a write that was interrupted is redone at the next update. Any successful check (frozen: a real write or an unchanged file) clears the "made again" note left by an earlier update.
 */
export const saveFile = internalMutation({
  args: { runId: v.id("sheetExportRuns"), seasonId: v.id("seasons"), kind: sheetFileKind, folder: sheetFolder, folderId: v.string(), name: v.string(), spreadsheetId: v.string(), tabs: v.array(v.object({ title: v.string(), sheetId: v.number() })), fingerprint: v.optional(v.string()), updatedAt: v.optional(v.number()), checkedAt: v.number(), frozen: v.boolean(), recreated: v.union(v.null(), v.literal("missing"), v.literal("moved")) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { runId, recreated, ...fields } = args;
    if ((await ctx.db.get(runId))?.state !== "running") return false;
    const existing = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", args.seasonId).eq("kind", args.kind).eq("eventId", undefined)).first();
    const note = recreated ? { recreatedAt: args.checkedAt, recreatedWhy: recreated } : args.frozen ? { recreatedAt: undefined, recreatedWhy: undefined } : {};
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, fingerprint: args.fingerprint, updatedAt: args.updatedAt ?? existing.updatedAt, lastError: undefined, ...note });
    } else await ctx.db.insert("sheetExportFiles", { ...fields, ...(recreated ? { recreatedAt: args.checkedAt, recreatedWhy: recreated } : {}) });
    return true;
  },
});

/** Records one finished file; schedules the next, or ends the run (partly done when any file failed). */
export const completeOne = internalMutation({
  args: { runId: v.id("sheetExportRuns"), kind: sheetFileKind, error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.state !== "running" || run.pending[0] !== args.kind) return null;
    const pending = run.pending.slice(1);
    const failed = run.failed + (args.error ? 1 : 0);
    const problems = args.error ? [...(run.problems ?? []), { kind: args.kind, message: args.error }] : run.problems;
    const now = Date.now();
    if (args.error) {
      const file = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", run.seasonId).eq("kind", args.kind).eq("eventId", undefined)).first();
      if (file) await ctx.db.patch(file._id, { lastError: args.error });
    }
    await ctx.db.patch(run._id, { pending, done: run.done + (args.error ? 0 : 1), failed, problems, leaseExpiresAt: now + LEASE_MS, ...(pending.length ? {} : { state: failed ? "partial" as const : "done" as const, finishedAt: now }) });
    if (pending.length) await ctx.scheduler.runAfter(1000, internal.sheetExportActions.runOne, { runId: run._id });
    return null;
  },
});

const fileStatus = v.object({ kind: sheetFileKind, title: v.string(), folder: sheetFolder, name: v.union(v.string(), v.null()), link: v.union(v.string(), v.null()), updatedAt: v.union(v.number(), v.null()), problem: v.union(v.string(), v.null()), note: v.union(v.string(), v.null()) });

/** What the Reports card shows. Money and Health files are omitted entirely for people without matching access. */
export const status = query({
  args: {},
  returns: v.object({
    canUpdate: v.boolean(), canSetUp: v.boolean(), enabled: v.boolean(), connected: v.boolean(),
    serviceAccountEmail: v.union(v.string(), v.null()), credentialsReady: v.boolean(),
    folders: v.union(v.null(), v.object({ general: v.string(), money: v.string(), health: v.string(), events: v.union(v.string(), v.null()), archive: v.union(v.string(), v.null()) })),
    run: v.union(v.null(), v.object({ state: v.union(v.literal("running"), v.literal("done"), v.literal("partial"), v.literal("stopped")), total: v.number(), finished: v.number(), leaseExpiresAt: v.number() })),
    lastSuccessAt: v.union(v.number(), v.null()), files: v.array(fileStatus),
  }),
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (!isCoachOrTravelLead(actor)) throw new ConvexError("Only a Coach or Travel Lead can see the team spreadsheets.");
    const canSetUp = actor.role === "coach";
    const settings = await ctx.db.query("sheetExportSettings").first();
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    const latest = await ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first();
    const lastDone = await ctx.db.query("sheetExportRuns").withIndex("by_state_and_startedAt", q => q.eq("state", "done")).order("desc").first();
    const files = season ? await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", season._id)).take(50) : [];
    const items = SHEET_KINDS.filter(info => folderVisible(info.folder, actor)).map(info => {
      const file = files.find(item => item.kind === info.kind && item.eventId === undefined);
      const runProblem = latest?.problems?.find(item => item.kind === info.kind)?.message ?? null;
      return { kind: info.kind, title: info.title, folder: info.folder, name: file?.name ?? null, link: file ? spreadsheetLink(file.spreadsheetId) : null, updatedAt: file?.updatedAt ?? null, problem: file?.lastError ?? runProblem, note: file?.recreatedAt ? (file.recreatedWhy === "moved" ? "This spreadsheet was no longer in its folder, so Venom Status made a new one there. The old one is still in Google Drive." : "This spreadsheet was missing in Google Drive, so Venom Status made it again.") : null };
    });
    return {
      canUpdate: true, canSetUp, enabled: exportEnabled(), connected: !!settings,
      serviceAccountEmail: canSetUp ? env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ?? null : null, credentialsReady: credentialsConfigured(),
      folders: canSetUp && settings ? { general: settings.generalFolderId, money: settings.moneyFolderId, health: settings.healthFolderId, events: settings.eventsFolderId ?? null, archive: settings.archiveFolderId ?? null } : null,
      run: latest ? { state: latest.state, total: latest.total, finished: latest.done + latest.failed, leaseExpiresAt: latest.leaseExpiresAt } : null,
      lastSuccessAt: lastDone?.finishedAt ?? null, files: items,
    };
  },
});
