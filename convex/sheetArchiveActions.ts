import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { GoogleKeyError, GoogleTokenError, googleServiceToken } from "./lib/googleAuth";
import { GoogleRequestError, WRITE_SCOPE, driveParents, ensureFolder, moveFile } from "./lib/googleSheets";

/** The folder made inside each live folder (General, Money, Health, Events) to hold past seasons. */
export const ARCHIVE_FOLDER_NAME = "Archive";
const FAILED = "Some spreadsheets couldn't be moved to the Archive folders. Starting the move again continues with the ones left.";

/**
 * Moves one spreadsheet of an old season into <its folder>/Archive/<season name>, then hands over to the next step. Re-running is safe:
 * folders are found by name, and a file already in its archive folder is only marked. Sharing never changes, because the file stays inside
 * the folder it was shared through.
 */
export const archiveStep = internalAction({
  args: { archiveId: v.id("sheetArchives") }, returns: v.null(),
  handler: async (ctx, args) => {
    const next = await ctx.runMutation(internal.sheetArchive.nextArchiveWork, { archiveId: args.archiveId });
    if (next.kind !== "file") return null;
    try {
      const token = await googleServiceToken(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL!, env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY!, WRITE_SCOPE);
      let target = next.target;
      if (!target) {
        const archive = await ensureFolder(token, { driveId: next.driveId, parentId: next.liveFolderId, name: ARCHIVE_FOLDER_NAME });
        target = await ensureFolder(token, { driveId: next.driveId, parentId: archive, name: next.label });
        await ctx.runMutation(internal.sheetArchive.saveArchiveFolder, { archiveId: args.archiveId, parentId: next.liveFolderId, folderId: target });
      }
      const parents = await driveParents(token, next.spreadsheetId);
      // A missing or trashed file has nothing to move; it is only marked so the job can finish.
      if (parents && !parents.includes(target)) await moveFile(token, { fileId: next.spreadsheetId, fromParentId: parents[0] ?? next.liveFolderId, toParentId: target });
      await ctx.runMutation(internal.sheetArchive.markArchived, { archiveId: args.archiveId, fileId: next.fileId, folderId: target });
    } catch (error) {
      // Google failures are logged where they happen; this adds which step stopped (no IDs or data).
      console.warn("Archive step failed", { folder: next.folder, google: error instanceof GoogleRequestError, credentials: error instanceof GoogleKeyError || error instanceof GoogleTokenError, name: error instanceof Error ? error.name : typeof error });
      await ctx.runMutation(internal.sheetArchive.failArchive, { archiveId: args.archiveId, note: FAILED });
    }
    return null;
  },
});
