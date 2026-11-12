import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/access";
import { sheetFolder } from "./lib/sheetKinds";
import { credentialsConfigured, exportEnabled } from "./sheetExports";

export const ARCHIVE_OFF_NOTE = "Spreadsheet updates are turned off, so last season's spreadsheets were not moved to the Archive folders.";
/** A running job untouched for longer than this is taken over by a new start. */
const STALE_MS = 15 * 60_000;
/** Longest wait between checks while an update of the same season still holds its files. */
const WAIT_MS = 60_000;

export type ArchiveStart = "started" | "alreadyRunning" | "notSetUp" | "noSeason" | "notArchived" | "skipped";
export const archiveStartResult = v.union(v.literal("started"), v.literal("alreadyRunning"), v.literal("notSetUp"), v.literal("noSeason"), v.literal("notArchived"), v.literal("skipped"));

/** An update of this season that is still running, or was stopped while one of its steps may still be working (its hold has not been released). */
async function liveRun(ctx: MutationCtx, seasonId: Id<"seasons">, now: number): Promise<Doc<"sheetExportRuns"> | null> {
  for (const state of ["running", "stopped"] as const) {
    // Bounded: only one update runs at a time; a few recent rows are enough.
    const rows = await ctx.db.query("sheetExportRuns").withIndex("by_state_and_startedAt", q => q.eq("state", state)).order("desc").take(10);
    const found = rows.find(run => run.seasonId === seasonId && run.leaseExpiresAt > now);
    if (found) return found;
  }
  return null;
}

/** Who an archive is recorded under in the audit trail: the person who started it, else the Coach who connected Google Drive. */
async function auditActor(ctx: MutationCtx, row: Doc<"sheetArchives">): Promise<Doc<"appUsers"> | null> {
  if (row.actorId) return await ctx.db.get(row.actorId);
  const settings = await ctx.db.query("sheetExportSettings").first();
  return settings ? await ctx.db.get(settings.setBy) : null;
}

/** Ends the job and writes one audit row with what happened (counts only; no file or folder IDs). */
async function finishArchive(ctx: MutationCtx, row: Doc<"sheetArchives">, state: "done" | "partial" | "skipped", note: string | undefined, now: number) {
  await ctx.db.patch(row._id, { state, note, updatedAt: now, finishedAt: now });
  const actor = await auditActor(ctx, row);
  if (actor) await audit(ctx, actor, "sheetArchives", row._id, "archiveFinish", { state: "running" }, { state, moved: row.moved, trigger: row.trigger ?? "auto" });
}

/**
 * Starts (or restarts) archiving a season's spreadsheets: each file moves into an Archive folder inside its own folder, named for the
 * season (General/Archive/<season>, Money/Archive/<season>, Health/Archive/<season>, Events/Archive/<season>), so who can see it never
 * changes. Only for a season that is no longer active. Only schedules; Google is called by the action, with the folder settings current at
 * each step. An update of that season still running is stopped first; the moves wait until its last step has let go.
 */
export async function startSeasonArchive(ctx: MutationCtx, seasonId: Id<"seasons">, start: { trigger: "auto" | "manual"; actor: Doc<"appUsers"> | null }): Promise<ArchiveStart> {
  const season = await ctx.db.get(seasonId);
  if (!season) return "noSeason";
  if (season.status !== "archived") return "notArchived";
  const settings = await ctx.db.query("sheetExportSettings").first();
  if (!settings) return "notSetUp";
  const now = Date.now();
  // A run of the archived season never writes again; one of its steps may still be working, so its hold is kept until that step lets go.
  const running = await ctx.db.query("sheetExportRuns").withIndex("by_state_and_startedAt", q => q.eq("state", "running")).order("desc").take(10);
  for (const run of running) if (run.seasonId === seasonId) await ctx.db.patch(run._id, { state: "stopped", finishedAt: now });
  const existing = await ctx.db.query("sheetArchives").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).first();
  if (existing?.state === "running" && now - existing.updatedAt < STALE_MS) return "alreadyRunning";
  const note = !exportEnabled() || !credentialsConfigured() ? ARCHIVE_OFF_NOTE : undefined;
  const actor = start.actor ?? await ctx.db.get(settings.setBy);
  const fields = { state: note ? "skipped" as const : "running" as const, note, updatedAt: now, finishedAt: note ? now : undefined, trigger: start.trigger, actorId: actor?._id };
  let archiveId: Id<"sheetArchives">;
  if (existing) { archiveId = existing._id; await ctx.db.patch(existing._id, { ...fields, label: season.name }); }
  else archiveId = await ctx.db.insert("sheetArchives", { seasonId, label: season.name, moved: 0, startedAt: now, ...fields });
  if (actor) await audit(ctx, actor, "sheetArchives", archiveId, start.trigger === "auto" ? "archiveStartAuto" : "archiveStartManual", existing ? { state: existing.state, moved: existing.moved } : null, { state: fields.state, season: season.name }, start.actor ? undefined : "Started from the server");
  if (note) return "skipped";
  await ctx.scheduler.runAfter(0, internal.sheetArchiveActions.archiveStep, { archiveId });
  return "started";
}

/**
 * Owner or operator use: `bunx convex run sheetArchive:archiveSeasonNow '{"seasonId":"..."}'`. Refused (`notArchived`) while the season is
 * still active or a draft. Safe to run again; files already moved are skipped. Recorded in the audit trail under the Coach who connected Drive.
 */
export const archiveSeasonNow = internalMutation({
  args: { seasonId: v.id("seasons") }, returns: archiveStartResult,
  handler: async (ctx, args) => startSeasonArchive(ctx, args.seasonId, { trigger: "manual", actor: null }),
});

const work = v.union(
  v.object({ kind: v.literal("stop") }),
  v.object({ kind: v.literal("wait") }),
  v.object({ kind: v.literal("done") }),
  v.object({
    kind: v.literal("file"), fileId: v.id("sheetExportFiles"), spreadsheetId: v.string(), folder: sheetFolder,
    driveId: v.string(), liveFolderId: v.string(), label: v.string(), target: v.union(v.string(), v.null()),
  }),
);

/**
 * The next unarchived file of the season, or "done" when none is left. "stop": the job is not running, or Google writes are off. "wait": an
 * update of this season still holds its files; the step is tried again shortly.
 */
export const nextArchiveWork = internalMutation({
  args: { archiveId: v.id("sheetArchives") }, returns: work,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.archiveId);
    if (!row || row.state !== "running") return { kind: "stop" as const };
    const now = Date.now();
    const settings = await ctx.db.query("sheetExportSettings").first();
    if (!exportEnabled() || !credentialsConfigured() || !settings) { await finishArchive(ctx, row, "skipped", ARCHIVE_OFF_NOTE, now); return { kind: "stop" as const }; }
    const run = await liveRun(ctx, row.seasonId, now);
    if (run) {
      await ctx.db.patch(row._id, { updatedAt: now });
      await ctx.scheduler.runAfter(Math.min(Math.max(run.leaseExpiresAt - now, 1000), WAIT_MS), internal.sheetArchiveActions.archiveStep, { archiveId: row._id });
      return { kind: "wait" as const };
    }
    // Bounded: a few hundred files per season.
    const files = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", row.seasonId)).take(1000);
    const file = files.find(item => !item.archivedAt);
    if (!file) { await finishArchive(ctx, row, "done", undefined, now); return { kind: "done" as const }; }
    const liveFolderId = { general: settings.generalFolderId, money: settings.moneyFolderId, health: settings.healthFolderId, events: settings.eventsFolderId }[file.folder] ?? file.folderId;
    await ctx.db.patch(row._id, { updatedAt: now });
    const target = row.archiveFolders?.find(item => item.parentId === liveFolderId)?.folderId ?? null;
    return { kind: "file" as const, fileId: file._id, spreadsheetId: file.spreadsheetId, folder: file.folder, driveId: settings.driveId, liveFolderId, label: row.label, target };
  },
});

/** Remembers the <folder>/Archive/<season> folder made under one live folder, so later steps don't look it up again. */
export const saveArchiveFolder = internalMutation({
  args: { archiveId: v.id("sheetArchives"), parentId: v.string(), folderId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.archiveId);
    if (!row) return null;
    const others = (row.archiveFolders ?? []).filter(item => item.parentId !== args.parentId);
    await ctx.db.patch(row._id, { archiveFolders: [...others, { parentId: args.parentId, folderId: args.folderId }], updatedAt: Date.now() });
    return null;
  },
});

/** Marks one file archived and frozen, then schedules the next step. */
export const markArchived = internalMutation({
  args: { archiveId: v.id("sheetArchives"), fileId: v.id("sheetExportFiles"), folderId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.archiveId);
    const file = await ctx.db.get(args.fileId);
    if (!row || !file) return null;
    const now = Date.now();
    if (!file.archivedAt) await ctx.db.patch(file._id, { archivedAt: now, archiveFolderId: args.folderId, frozen: true, lastError: undefined });
    await ctx.db.patch(row._id, { moved: row.moved + (file.archivedAt ? 0 : 1), updatedAt: now });
    await ctx.scheduler.runAfter(1000, internal.sheetArchiveActions.archiveStep, { archiveId: row._id });
    return null;
  },
});

/** Stops the job with a plain note; starting it again continues with the files not yet moved. */
export const failArchive = internalMutation({
  args: { archiveId: v.id("sheetArchives"), note: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.archiveId);
    if (row?.state === "running") await finishArchive(ctx, row, "partial", args.note, Date.now());
    return null;
  },
});
