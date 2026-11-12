import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { credentialsConfigured, exportEnabled } from "./sheetExports";

export const ARCHIVE_OFF_NOTE = "Spreadsheet updates are turned off, so last season's spreadsheets were not moved to the Archive.";
export const NO_ARCHIVE_FOLDER_NOTE = "No Archive folder is connected, so last season's spreadsheets stayed where they are.";
/** A running job untouched for longer than this is taken over by a new start. */
const STALE_MS = 15 * 60_000;

const folderIdsValidator = v.object({ season: v.string(), general: v.string(), money: v.string(), health: v.string(), events: v.string() });
export const archiveStartResult = v.union(v.literal("started"), v.literal("alreadyRunning"), v.literal("notSetUp"), v.literal("noSeason"), v.literal("skipped"));

/**
 * Starts (or restarts) archiving a season's spreadsheets into Archive/<season name>. Only schedules; Google is called by the action.
 * Nothing happens when Drive was never connected. Off or no Archive folder: a plain note is kept and nothing is scheduled.
 */
export async function startSeasonArchive(ctx: MutationCtx, seasonId: Id<"seasons">): Promise<"started" | "alreadyRunning" | "notSetUp" | "noSeason" | "skipped"> {
  const season = await ctx.db.get(seasonId);
  if (!season) return "noSeason";
  const settings = await ctx.db.query("sheetExportSettings").first();
  if (!settings) return "notSetUp";
  const now = Date.now();
  const existing = await ctx.db.query("sheetArchives").withIndex("by_seasonId", q => q.eq("seasonId", seasonId)).first();
  if (existing?.state === "running" && now - existing.updatedAt < STALE_MS) return "alreadyRunning";
  const note = !exportEnabled() || !credentialsConfigured() ? ARCHIVE_OFF_NOTE : !settings.archiveFolderId ? NO_ARCHIVE_FOLDER_NOTE : undefined;
  const fields = { state: note ? "skipped" as const : "running" as const, note, updatedAt: now, finishedAt: note ? now : undefined };
  let archiveId: Id<"sheetArchives">;
  if (existing) { archiveId = existing._id; await ctx.db.patch(existing._id, { ...fields, label: season.name }); }
  else archiveId = await ctx.db.insert("sheetArchives", { seasonId, label: season.name, moved: 0, startedAt: now, ...fields });
  if (note) return "skipped";
  await ctx.scheduler.runAfter(0, internal.sheetArchiveActions.archiveStep, { archiveId });
  return "started";
}

/** Owner or operator use: `bunx convex run sheetArchive:archiveSeasonNow '{"seasonId":"..."}'`. Safe to run again; files already moved are skipped. */
export const archiveSeasonNow = internalMutation({
  args: { seasonId: v.id("seasons") }, returns: archiveStartResult,
  handler: async (ctx, args) => startSeasonArchive(ctx, args.seasonId),
});

const work = v.union(
  v.object({ kind: v.literal("stop") }),
  v.object({ kind: v.literal("done") }),
  v.object({
    kind: v.literal("file"), fileId: v.id("sheetExportFiles"), spreadsheetId: v.string(), folder: v.union(v.literal("general"), v.literal("money"), v.literal("health"), v.literal("events")),
    driveId: v.string(), archiveFolderId: v.string(), label: v.string(), folderIds: v.union(v.null(), folderIdsValidator),
  }),
);

/** The next unarchived file of the season, or "done" when none is left. "stop": the job is not running, or Google writes are off. */
export const nextArchiveWork = internalMutation({
  args: { archiveId: v.id("sheetArchives") }, returns: work,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.archiveId);
    if (!row || row.state !== "running") return { kind: "stop" as const };
    const now = Date.now();
    const settings = await ctx.db.query("sheetExportSettings").first();
    const note = !exportEnabled() || !credentialsConfigured() ? ARCHIVE_OFF_NOTE : !settings?.archiveFolderId ? NO_ARCHIVE_FOLDER_NOTE : null;
    if (!settings?.archiveFolderId || note) { await ctx.db.patch(row._id, { state: "skipped", note: note ?? NO_ARCHIVE_FOLDER_NOTE, updatedAt: now, finishedAt: now }); return { kind: "stop" as const }; }
    // Bounded: a few hundred files per season.
    const files = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", row.seasonId)).take(1000);
    const file = files.find(item => !item.archivedAt);
    if (!file) { await ctx.db.patch(row._id, { state: "done", note: undefined, updatedAt: now, finishedAt: now }); return { kind: "done" as const }; }
    await ctx.db.patch(row._id, { updatedAt: now });
    return { kind: "file" as const, fileId: file._id, spreadsheetId: file.spreadsheetId, folder: file.folder, driveId: settings.driveId, archiveFolderId: settings.archiveFolderId, label: row.label, folderIds: row.folderIds ?? null };
  },
});

export const saveArchiveFolders = internalMutation({
  args: { archiveId: v.id("sheetArchives"), folderIds: folderIdsValidator }, returns: v.null(),
  handler: async (ctx, args) => { await ctx.db.patch(args.archiveId, { folderIds: args.folderIds, updatedAt: Date.now() }); return null; },
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
  handler: async (ctx, args) => { const now = Date.now(); await ctx.db.patch(args.archiveId, { state: "partial", note: args.note, updatedAt: now, finishedAt: now }); return null; },
});
