import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env, internalAction, type ActionCtx } from "./_generated/server";
import { hashId } from "./lib/calendarAuth";
import { parseDriveFolderId } from "./lib/driveLinks";
import { GoogleKeyError, GoogleTokenError, googleServiceToken } from "./lib/googleAuth";
import { CHECK_SCOPE, GoogleRequestError, LAYOUT_VERSION, WRITE_SCOPE, batchUpdate, buildBatch, createSpreadsheet, driveAncestors, driveFileState, driveGetFolder, findByKey, getSheets, googleRetry, type FileState } from "./lib/googleSheets";
import { TOO_MANY_CHECKS } from "./sheetExports";
import { sheetAppKey, sheetKindInfo, type SheetFileKind } from "./lib/sheetKinds";
import { shirtSizeTabs, studentRosterTabs, type SheetTab, type ShirtPerson } from "./lib/sheetRows";
import { subteamDisplay } from "../src/lib/subteams";

const ASK_OWNER = "the person who set up Venom Status for your team";
const GENERIC_FAILURE = "Venom Status couldn't update this spreadsheet. Press Update spreadsheets to try again. If it keeps happening, check that the Venom Status service account is still a Content manager of the shared drive.";

/** Plain-language reason for a failed file; never a raw Google message. */
export function plainSheetError(error: unknown): string {
  if (error instanceof GoogleKeyError) return `The Venom Status service account's key can't be read. Ask ${ASK_OWNER} to check it.`;
  if (error instanceof GoogleTokenError) return `Google didn't accept the Venom Status service account. Ask ${ASK_OWNER} to check its key.`;
  if (error instanceof GoogleRequestError) {
    if (error.status === 403) return "Google didn't allow Venom Status to change this spreadsheet. Check that the service account is a Content manager of the shared drive, then press Update spreadsheets.";
    if (error.status === 429 || error.status >= 500 || error.status === 0) return "Google was busy and didn't finish this spreadsheet. Press Update spreadsheets in a few minutes.";
  }
  return GENERIC_FAILURE;
}

async function allStudents(ctx: ActionCtx, seasonId: Id<"seasons">, withParents: boolean) {
  const rows = [];
  let cursor: string | null = null;
  for (let page = 0; page < 200; page++) {
    const result: Awaited<ReturnType<typeof readStudents>> = await readStudents(ctx, seasonId, cursor, withParents);
    rows.push(...result.rows);
    if (result.isDone) return rows;
    cursor = result.cursor;
  }
  throw new Error("Too many students to read");
}
const readStudents = (ctx: ActionCtx, seasonId: Id<"seasons">, cursor: string | null, withParents: boolean) => ctx.runQuery(internal.sheetExportData.studentPage, { seasonId, cursor, withParents });

async function allMentors(ctx: ActionCtx): Promise<ShirtPerson[]> {
  const people: ShirtPerson[] = [];
  for (const source of ["coach", "mentor", "parentMentor", "parentTravelLead"] as const) {
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const result: { rows: { name: string; subteam: string; shirtSize: string | null }[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetExportData.adultPage, { source, paginationOpts: { numItems: 50, cursor } });
      people.push(...result.rows.map(row => ({ name: row.name, type: "Adult" as const, subteam: row.subteam, size: row.shirtSize })));
      if (result.isDone) break;
      cursor = result.cursor;
      if (page === 99) throw new Error("Too many adults to read");
    }
  }
  return people;
}

/** The tabs for one kind of spreadsheet. Later steps add their kinds here. */
async function tabsFor(ctx: ActionCtx, kind: SheetFileKind, seasonId: Id<"seasons">): Promise<SheetTab[]> {
  if (kind === "studentRoster") {
    const students = await allStudents(ctx, seasonId, true);
    return studentRosterTabs(students.map(student => ({ ...student })));
  }
  const students = await allStudents(ctx, seasonId, false);
  const people: ShirtPerson[] = [...students.map(student => ({ name: student.preferredName || student.legalName, type: "Student" as const, subteam: subteamDisplay(student.subteam), size: student.shirtSize })), ...await allMentors(ctx)];
  return shirtSizeTabs(people);
}

/** This run was replaced or ended while it was working; it stops without writing anything more. */
class LeaseLost extends Error {}
type SaveFields = { spreadsheetId: string; tabs: { title: string; sheetId: number }[]; fingerprint?: string; updatedAt?: number; checkedAt: number; frozen: boolean; recreated: "missing" | "moved" | null };

/** Does exactly one spreadsheet of a run, then hands over to the next call. */
export const runOne = internalAction({
  args: { runId: v.id("sheetExportRuns") }, returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.sheetExports.claimNext, { runId: args.runId });
    if (!claim) return null;
    try {
      const email = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL!, key = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY!;
      const info = sheetKindInfo(claim.kind);
      const name = `${info.title} - ${claim.seasonName}`;
      const tabs = await tabsFor(ctx, claim.kind, claim.seasonId);
      const fingerprint = await hashId(JSON.stringify([LAYOUT_VERSION, name, tabs]));
      const base = { runId: args.runId, seasonId: claim.seasonId, kind: claim.kind, folder: claim.folder, folderId: claim.folderId, name };
      const now = Date.now();
      const token = await googleServiceToken(email, key, WRITE_SCOPE);
      const stillMine = async () => { if (!(await ctx.runQuery(internal.sheetExports.runCurrent, { runId: args.runId }))) throw new LeaseLost(); };
      const save = async (fields: SaveFields) => {
        if (!(await ctx.runMutation(internal.sheetExports.saveFile, { ...base, ...fields }))) throw new LeaseLost();
      };
      const appKey = sheetAppKey(claim.seasonId, claim.kind);
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
        const make = async () => {
          await stillMine();
          return (await findByKey(token, claim.driveId, claim.folderId, appKey)) ?? await createSpreadsheet(token, { name, folderId: claim.folderId, key: appKey });
        };
        const madeNow = !spreadsheetId;
        spreadsheetId ??= await make();
        // Save the file at once so a failure later never leaves an untracked spreadsheet. This save clears the stored fingerprint, so an interrupted write is redone.
        await save({ spreadsheetId, tabs: recreated ? [] : claim.file?.tabs ?? [], checkedAt: now, frozen: false, recreated });
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
          await save({ spreadsheetId, tabs: [], checkedAt: now, frozen: false, recreated });
          sheets = await getSheets(token, spreadsheetId) ?? [];
        }
        const batch = buildBatch(tabs, sheets, now);
        await stillMine();
        await batchUpdate(token, spreadsheetId, batch.requests);
        await save({ spreadsheetId, tabs: batch.tabs, fingerprint, updatedAt: now, checkedAt: now, frozen: true, recreated });
      }
      await ctx.runMutation(internal.sheetExports.completeOne, { runId: args.runId, kind: claim.kind });
    } catch (error) {
      if (error instanceof LeaseLost) return null;
      await ctx.runMutation(internal.sheetExports.completeOne, { runId: args.runId, kind: claim.kind, error: plainSheetError(error) });
    }
    return null;
  },
});

const folderLabels = { general: "General", money: "Money", health: "Health", events: "Events", archive: "Archive" } as const;
type FolderName = keyof typeof folderLabels;
const problemValidator = v.object({ folder: v.union(v.literal("general"), v.literal("money"), v.literal("health"), v.literal("events"), v.literal("archive")), message: v.string() });

/**
 * Coach only. Checks the folder links with read-only Google calls (they work before updates are turned on), then saves them.
 * All folders must be distinct, in one shared drive, and writable by the service account.
 */
export const checkAccess = action({
  args: { general: v.string(), money: v.string(), health: v.string(), events: v.string(), archive: v.optional(v.string()) },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), problems: v.array(problemValidator) })),
  handler: async (ctx, args) => {
    const actorId = await ctx.runQuery(internal.sheetExports.setupActor, {});
    const email = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL, key = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!email || !key) throw new ConvexError(`The Venom Status service account isn't set up yet. Ask ${ASK_OWNER} to finish the Google setup, then try again.`);
    if (!(await ctx.runMutation(internal.sheetExports.takeCheckAttempt, { actorId }))) throw new ConvexError(TOO_MANY_CHECKS);
    const inputs: [FolderName, string | undefined][] = [["general", args.general], ["money", args.money], ["health", args.health], ["events", args.events], ["archive", args.archive?.trim() ? args.archive : undefined]];
    const problems: { folder: FolderName; message: string }[] = [];
    const ids: Partial<Record<FolderName, string>> = {};
    for (const [folder, input] of inputs) {
      if (input === undefined) continue;
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
      throw new ConvexError(error instanceof GoogleKeyError ? `The Venom Status service account's key can't be read. Ask ${ASK_OWNER} to check it.` : error instanceof GoogleTokenError ? `Google didn't accept the Venom Status service account. Ask ${ASK_OWNER} to check its key.` : "Google didn't answer. Wait a minute, then check access again.");
    }
    if (problems.length || !driveId) return { ok: false as const, problems };
    await ctx.runMutation(internal.sheetExports.saveSettings, { driveId, generalFolderId: ids.general!, moneyFolderId: ids.money!, healthFolderId: ids.health!, eventsFolderId: ids.events!, archiveFolderId: ids.archive, setBy: actorId, now: Date.now() });
    return { ok: true as const };
  },
});
