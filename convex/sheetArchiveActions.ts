import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { GoogleKeyError, GoogleTokenError, googleServiceToken } from "./lib/googleAuth";
import { WRITE_SCOPE, driveParents, ensureFolder, moveFile } from "./lib/googleSheets";

const SUBFOLDERS = { general: "General", money: "Money", health: "Health", events: "Events" } as const;
const FAILED = "Some spreadsheets couldn't be moved to the Archive. Starting the move again continues with the ones left.";

/**
 * Moves one spreadsheet of an old season into Archive/<season name>/<General|Money|Health|Events>, then hands over to the next step.
 * Re-running is safe: folders are found by name, and a file already in its archive folder is only marked.
 */
export const archiveStep = internalAction({
  args: { archiveId: v.id("sheetArchives") }, returns: v.null(),
  handler: async (ctx, args) => {
    const next = await ctx.runMutation(internal.sheetArchive.nextArchiveWork, { archiveId: args.archiveId });
    if (next.kind !== "file") return null;
    try {
      const token = await googleServiceToken(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL!, env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY!, WRITE_SCOPE);
      let folderIds = next.folderIds;
      if (!folderIds) {
        const season = await ensureFolder(token, { driveId: next.driveId, parentId: next.archiveFolderId, name: next.label });
        const sub = (name: string) => ensureFolder(token, { driveId: next.driveId, parentId: season, name });
        folderIds = { season, general: await sub(SUBFOLDERS.general), money: await sub(SUBFOLDERS.money), health: await sub(SUBFOLDERS.health), events: await sub(SUBFOLDERS.events) };
        await ctx.runMutation(internal.sheetArchive.saveArchiveFolders, { archiveId: args.archiveId, folderIds });
      }
      const target = folderIds[next.folder];
      const parents = await driveParents(token, next.spreadsheetId);
      // A missing or trashed file has nothing to move; it is only marked so the job can finish.
      if (parents && !parents.includes(target)) await moveFile(token, { fileId: next.spreadsheetId, fromParentId: parents[0] ?? next.archiveFolderId, toParentId: target });
      await ctx.runMutation(internal.sheetArchive.markArchived, { archiveId: args.archiveId, fileId: next.fileId, folderId: target });
    } catch (error) {
      console.warn("Archive step failed", { credentials: error instanceof GoogleKeyError || error instanceof GoogleTokenError });
      await ctx.runMutation(internal.sheetArchive.failArchive, { archiveId: args.archiveId, note: FAILED });
    }
    return null;
  },
});
