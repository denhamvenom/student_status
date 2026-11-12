import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalAction } from "./_generated/server";
import { hashId } from "./lib/calendarAuth";
import { parseDriveFolderId } from "./lib/driveLinks";
import { GoogleKeyError, GoogleTokenError, googleServiceToken } from "./lib/googleAuth";
import { CHECK_SCOPE, GoogleRequestError, LAYOUT_VERSION, WRITE_SCOPE, batchUpdate, buildBatch, createSpreadsheet, driveAncestors, driveFileState, driveGetFolder, findByKey, getSheets, googleRetry, renameFile, type FileState } from "./lib/googleSheets";
import { TOO_MANY_CHECKS } from "./sheetExports";
import { sheetAppKey } from "./lib/sheetKinds";
import { sheetKind } from "./lib/sheetRegistry";

const ASK_OWNER = "the person who set up Venom Status for your team";
const GENERIC_FAILURE = "Venom Status couldn't update this spreadsheet. Press Update spreadsheets to try again. If it keeps happening, ask a Coach to check the Google Drive setup.";

/** Plain-language reason for a failed file; never a raw Google message. */
export function plainSheetError(error: unknown): string {
  // Loaders throw ConvexError with a plain owner-facing sentence (for example Attendance or Money still updating). Only a ConvexError's string is shown;
  // Google failures are GoogleRequestError and never reach this branch, so no Google text or secret can pass through here.
  if (error instanceof ConvexError && typeof error.data === "string" && error.data.trim()) return error.data;
  if (error instanceof GoogleKeyError) return `The Venom Status Google key can't be read. Ask ${ASK_OWNER} to check it.`;
  if (error instanceof GoogleTokenError) return `Google didn't accept the Venom Status Google account. Ask ${ASK_OWNER} to check its key.`;
  if (error instanceof GoogleRequestError) {
    if (error.status === 403) return "Google Drive didn't let Venom Status save this spreadsheet. A Coach can open Connect Google Drive and press Check access.";
    if (error.status === 429 || error.status >= 500 || error.status === 0) return "Google was busy and didn't finish this spreadsheet. Press Update spreadsheets in a few minutes.";
  }
  return GENERIC_FAILURE;
}

/** This run was replaced or ended while it was working (or its season was archived); it stops without writing anything more. */
class LeaseLost extends Error {}
type SaveFields = { name?: string; spreadsheetId: string; tabs: { title: string; sheetId: number }[]; fingerprint?: string; updatedAt?: number; checkedAt: number; frozen: boolean; recreated: "missing" | "moved" | null };

/** Errors from Google or the key are already logged where they happen; anything else is logged here (names only, never data values). */
const loggedElsewhere = (error: unknown) => error instanceof GoogleRequestError || error instanceof GoogleKeyError || error instanceof GoogleTokenError;

/** Does exactly one spreadsheet of a run, then hands over to the next call. */
export const runOne = internalAction({
  args: { runId: v.id("sheetExportRuns") }, returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.sheetExports.claimNext, { runId: args.runId });
    if (!claim) return null;
    const item = claim.eventId ? { eventId: claim.eventId } : {};
    // A spreadsheet made by this step that has not been saved yet; recorded if the step loses its hold, so it is never left untracked.
    const unsaved: { file: { spreadsheetId: string; name: string; checkedAt: number } | null } = { file: null };
    try {
      const email = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL!, key = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY!;
      const entry = sheetKind(claim.kind);
      const name = entry.definition.title({ seasonName: claim.seasonName, event: claim.event });
      const tabs = await entry.tabs(ctx, { seasonId: claim.seasonId, eventId: claim.eventId });
      // A file must have at least one tab; a kind that builds none is a mistake, never an empty spreadsheet.
      if (!tabs.length) throw new Error("A spreadsheet kind built no tabs");
      const fingerprint = await hashId(JSON.stringify([LAYOUT_VERSION, name, tabs]));
      const base = { runId: args.runId, seasonId: claim.seasonId, kind: claim.kind, ...(claim.eventId ? { eventId: claim.eventId } : {}), folder: claim.folder, folderId: claim.folderId, name };
      const now = Date.now();
      const token = await googleServiceToken(email, key, WRITE_SCOPE);
      const stillMine = async () => { if (!(await ctx.runQuery(internal.sheetExports.runCurrent, { runId: args.runId }))) throw new LeaseLost(); };
      const save = async (fields: SaveFields) => {
        if (!(await ctx.runMutation(internal.sheetExports.saveFile, { ...base, ...fields }))) throw new LeaseLost();
        unsaved.file = null;
      };
      const appKey = sheetAppKey(claim.seasonId, claim.kind, claim.eventId ?? undefined);
      let spreadsheetId = claim.file?.spreadsheetId;
      let recreated: "missing" | "moved" | null = null;
      // Every update checks the stored file is still there, not in the trash, and in the configured folder; otherwise it is made again.
      if (spreadsheetId) {
        const state: FileState = await driveFileState(token, spreadsheetId, claim.folderId);
        if (state !== "ok") { spreadsheetId = undefined; recreated = state; }
      }
      if (spreadsheetId && claim.file && claim.file.fingerprint === fingerprint && !claim.file.hadError) {
        // Nothing changed since the last update: no writes to Google.
        await save({ spreadsheetId, tabs: claim.file.tabs, fingerprint, checkedAt: now, frozen: true, recreated: null });
      } else {
        // The Drive name each file had when this step began: the stored one, or the new name for a file this step makes. A file found by its key may
        // carry an older name, so it is treated as unknown and renamed.
        const knownNames = new Map<string, string>(spreadsheetId && claim.file ? [[spreadsheetId, claim.file.name]] : []);
        const make = async () => {
          await stillMine();
          const found = await findByKey(token, claim.driveId, claim.folderId, appKey);
          if (found) { unsaved.file = { spreadsheetId: found, name, checkedAt: now }; return found; }
          const made = await createSpreadsheet(token, { name, driveId: claim.driveId, folderId: claim.folderId, key: appKey });
          unsaved.file = { spreadsheetId: made, name, checkedAt: now };
          knownNames.set(made, name);
          return made;
        };
        const madeNow = !spreadsheetId;
        spreadsheetId ??= await make();
        // Save the file at once so a failure later never leaves an untracked spreadsheet. This save clears the stored fingerprint, so an interrupted write is redone.
        // The stored name is only the new one once Drive has confirmed it, so a failed rename is tried again on the next update.
        const driveName = (id: string) => knownNames.get(id) ?? name;
        await save({ name: driveName(spreadsheetId), spreadsheetId, tabs: recreated ? [] : claim.file?.tabs ?? [], checkedAt: now, frozen: false, recreated });
        let sheets = await getSheets(token, spreadsheetId);
        // A file made a moment ago may not be readable yet: wait and read again instead of making a second copy.
        if (!sheets && madeNow) {
          for (const delay of googleRetry.delaysMs) {
            if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
            sheets = await getSheets(token, spreadsheetId);
            if (sheets) break;
          }
        }
        if (!sheets) {
          spreadsheetId = await make();
          recreated ??= "missing";
          // Save the new file at once, before anything is written to it.
          await save({ name: driveName(spreadsheetId), spreadsheetId, tabs: [], checkedAt: now, frozen: false, recreated });
          sheets = await getSheets(token, spreadsheetId) ?? [];
        }
        const batch = buildBatch(tabs, sheets, now);
        await stillMine();
        // A changed title (an event renamed or moved to another day, a season renamed, a new naming rule) renames the Drive file too.
        if (knownNames.get(spreadsheetId) !== name) {
          await renameFile(token, { fileId: spreadsheetId, name });
          knownNames.set(spreadsheetId, name);
        }
        await batchUpdate(token, spreadsheetId, batch.requests);
        await save({ spreadsheetId, tabs: batch.tabs, fingerprint, updatedAt: now, checkedAt: now, frozen: true, recreated });
      }
      await ctx.runMutation(internal.sheetExports.completeOne, { runId: args.runId, kind: claim.kind, ...item });
    } catch (error) {
      if (error instanceof LeaseLost) {
        // Close the step out now (no 15-minute hold), and record a file this step made but could not save.
        const made = unsaved.file;
        await ctx.runMutation(internal.sheetExports.abandonStep, { runId: args.runId, kind: claim.kind, ...item, ...(made ? { made: { ...made, seasonId: claim.seasonId, folder: claim.folder, folderId: claim.folderId } } : {}) });
        return null;
      }
      if (!loggedElsewhere(error)) {
        // Only an app-written ConvexError sentence is logged as text; any other message (a validator's, for one) can carry data values, so only its name is kept.
        const detail = error instanceof ConvexError ? { name: "ConvexError", message: typeof error.data === "string" ? error.data.slice(0, 200) : "(structured)" } : { name: error instanceof Error ? error.name : typeof error, message: "" };
        console.warn("Spreadsheet step failed", { kind: claim.kind, eventId: claim.eventId ?? null, ...detail });
      }
      await ctx.runMutation(internal.sheetExports.completeOne, { runId: args.runId, kind: claim.kind, ...item, error: plainSheetError(error) });
    }
    return null;
  },
});

const folderLabels = { general: "General", money: "Money", health: "Health", events: "Events" } as const;
type FolderName = keyof typeof folderLabels;
const problemValidator = v.object({ folder: v.union(v.literal("general"), v.literal("money"), v.literal("health"), v.literal("events")), message: v.string() });

/**
 * Coach only. Checks the folder links with read-only Google calls (they work before updates are turned on), then saves them.
 * All folders must be distinct, in one shared drive, and writable by Venom Status's Google account.
 */
export const checkAccess = action({
  args: { general: v.string(), money: v.string(), health: v.string(), events: v.string() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), problems: v.array(problemValidator) })),
  handler: async (ctx, args) => {
    const actorId = await ctx.runQuery(internal.sheetExports.setupActor, {});
    const email = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL, key = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!email || !key) throw new ConvexError(`The Venom Status Google account isn't set up yet. Ask ${ASK_OWNER} to finish the Google setup, then try again.`);
    if (!(await ctx.runMutation(internal.sheetExports.takeCheckAttempt, { actorId }))) throw new ConvexError(TOO_MANY_CHECKS);
    const inputs: [FolderName, string][] = [["general", args.general], ["money", args.money], ["health", args.health], ["events", args.events]];
    const problems: { folder: FolderName; message: string }[] = [];
    const ids: Partial<Record<FolderName, string>> = {};
    for (const [folder, input] of inputs) {
      const id = parseDriveFolderId(input);
      if (!id) problems.push({ folder, message: "This doesn't look like a Google Drive folder link. Open the folder in Google Drive, copy the link from the address bar and paste it here." });
      else ids[folder] = id;
    }
    const seen = new Map<string, FolderName>();
    for (const [folder, id] of Object.entries(ids) as [FolderName, string][]) {
      const earlier = seen.get(id);
      if (earlier) problems.push({ folder, message: `The ${folderLabels[folder]} folder is the same as the ${folderLabels[earlier]} folder. Each folder must be different.` });
      else seen.set(id, folder);
    }
    if (problems.length) return { ok: false as const, problems };
    let driveId: string | null = null;
    try {
      const token = await googleServiceToken(email, key, CHECK_SCOPE);
      const good: [FolderName, string, Awaited<ReturnType<typeof driveGetFolder>> & object][] = [];
      for (const [folder, id] of Object.entries(ids) as [FolderName, string][]) {
        const found = await driveGetFolder(token, id);
        if (!found) problems.push({ folder, message: `Venom Status can't open this folder. Add ${email} as a Content manager of the shared drive, then check again.` });
        else if (!found.isFolder) problems.push({ folder, message: "This link is a file, not a folder. Open the folder itself and copy its link." });
        else if (!found.driveId) problems.push({ folder, message: "This folder isn't in a shared drive. Move it into the team's shared drive, then check again." });
        else if (driveId && found.driveId !== driveId) problems.push({ folder, message: "This folder is in a different shared drive from the others. Use folders from one shared drive." });
        else if (!found.canAddChildren) problems.push({ folder, message: `Venom Status can't add files here. Make ${email} a Content manager of the shared drive, then check again.` });
        else { driveId ??= found.driveId; good.push([folder, id, found]); }
      }
      // No folder may sit inside another configured folder: a person with access to the outer folder would also see the inner one.
      const owner = new Map(good.map(([folder, id]) => [id, folder] as const));
      for (const [folder, , found] of good) {
        const outer = (await driveAncestors(token, found)).map(id => owner.get(id)).find(Boolean);
        if (outer) problems.push({ folder, message: `The ${folderLabels[folder]} folder is inside the ${folderLabels[outer]} folder. Use folders that aren't inside each other.` });
      }
    } catch (error) {
      throw new ConvexError(error instanceof GoogleKeyError ? `The Venom Status Google key can't be read. Ask ${ASK_OWNER} to check it.` : error instanceof GoogleTokenError ? `Google didn't accept the Venom Status Google account. Ask ${ASK_OWNER} to check its key.` : "Google didn't answer. Wait a minute, then check access again.");
    }
    if (problems.length || !driveId) return { ok: false as const, problems };
    await ctx.runMutation(internal.sheetExports.saveSettings, { driveId, generalFolderId: ids.general!, moneyFolderId: ids.money!, healthFolderId: ids.health!, eventsFolderId: ids.events!, setBy: actorId, now: Date.now() });
    return { ok: true as const };
  },
});
