/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { googleRetry } from "./lib/googleSheets";
import { ARCHIVE_OFF_NOTE } from "./sheetArchive";

const modules = import.meta.glob("./**/*.ts");
const FOLDERS = { general: "folderGeneral0001", money: "folderMoney000002", health: "folderHealth00003", events: "folderEvents000008" };
const DRIVE = "sharedDrive0000001";

/** In-memory stand-in for Google Drive: files and folders with parents. Counts folder creations and moves. Nothing reaches a real service. */
function fakeDrive() {
  const items = new Map<string, { name: string; folder: boolean; parents: string[] }>();
  const stats = { folderCreates: 0, moves: 0 };
  const handler = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
    if (url.host === "oauth2.googleapis.com") return json(200, { access_token: "synthetic-token" });
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const name = /name='([^']*)'/.exec(q)?.[1], parent = /'([^']*)' in parents/.exec(q)?.[1];
      return json(200, { files: [...items].filter(([, item]) => item.folder && item.name === name && item.parents.includes(parent!)).map(([id]) => ({ id })) });
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const id = `made${items.size + 1}`;
      items.set(id, { name: body.name, folder: true, parents: body.parents });
      stats.folderCreates++;
      return json(200, { id });
    }
    const match = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const item = items.get(match[1]);
      if (!item) return json(404);
      if (method === "PATCH") {
        const from = url.searchParams.get("removeParents"), to = url.searchParams.get("addParents");
        item.parents = [...item.parents.filter(parent => parent !== from), to!];
        stats.moves++;
        return json(200, { id: match[1], parents: item.parents });
      }
      return json(200, { id: match[1], trashed: false, parents: item.parents });
    }
    return json(404);
  };
  return { items, stats, handler };
}

let drive: ReturnType<typeof fakeDrive>;
beforeEach(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  googleRetry.delaysMs = [0, 0, 0];
  vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL", "reports@synthetic.invalid");
  vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
  vi.stubEnv("GOOGLE_SHEETS_EXPORT_ENABLED", "true");
  drive = fakeDrive();
  vi.stubGlobal("fetch", vi.fn(drive.handler));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/** An old (archived) season with one file per folder (the Events file belongs to an event), a new active season with a General file, and Drive set up. */
async function seed() {
  const t = createTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Casey Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const leadAuth = await ctx.db.insert("users", { email: "lead@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId: leadAuth, email: "lead@example.invalid", name: "Jordan Lead", role: "mentor", active: true, travelLead: true, financialEdit: false });
    const oldSeason = await ctx.db.insert("seasons", { name: "2026–27", year: 2026, status: "archived", startsAt: 0, permissionVersion: "v1", createdBy: coach });
    const newSeason = await ctx.db.insert("seasons", { name: "2027–28", year: 2027, status: "active", startsAt: 1, permissionVersion: "v1", createdBy: coach });
    await ctx.db.insert("sheetExportSettings", { driveId: DRIVE, generalFolderId: FOLDERS.general, moneyFolderId: FOLDERS.money, healthFolderId: FOLDERS.health, eventsFolderId: FOLDERS.events, setBy: coach, setAt: 1 });
    const event = await ctx.db.insert("events", { seasonId: oldSeason, name: "Synthetic Regional", type: "Competition", startsAt: 1, endsAt: 2, destination: "Synthetic Arena", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { auth, leadAuth, coach, oldSeason, newSeason, event };
  });
  const file = async (seasonId: Id<"seasons">, kind: "studentRoster" | "money" | "health" | "event", folder: "general" | "money" | "health" | "events", eventId?: Id<"events">) => {
    const spreadsheetId = `file-${kind}-${seasonId}`;
    drive.items.set(spreadsheetId, { name: kind, folder: false, parents: [FOLDERS[folder]] });
    return t.run(ctx => ctx.db.insert("sheetExportFiles", { seasonId, kind, ...(eventId ? { eventId } : {}), folder, folderId: FOLDERS[folder], name: kind, spreadsheetId, tabs: [], fingerprint: "x", checkedAt: 1, frozen: true }));
  };
  const old = { roster: await file(ids.oldSeason, "studentRoster", "general"), money: await file(ids.oldSeason, "money", "money"), health: await file(ids.oldSeason, "health", "health"), event: await file(ids.oldSeason, "event", "events", ids.event) };
  const current = await file(ids.newSeason, "studentRoster", "general");
  return { t, ids, old, current, coach: t.withIdentity({ subject: `${ids.auth}|session` }), lead: t.withIdentity({ subject: `${ids.leadAuth}|session` }) };
}
type Seed = Awaited<ReturnType<typeof seed>>;

/** Runs archive steps by hand until the job stops (each step does one file). */
async function runJob(f: Seed) {
  const archive = (await f.t.run(ctx => ctx.db.query("sheetArchives").first()))!;
  for (let i = 0; i < 12; i++) {
    await f.t.action(internal.sheetArchiveActions.archiveStep, { archiveId: archive._id });
    if ((await f.t.run(ctx => ctx.db.get(archive._id)))?.state !== "running") break;
  }
  return (await f.t.run(ctx => ctx.db.get(archive._id)))!;
}
const named = (name: string, parent: string) => [...drive.items].find(([, item]) => item.folder && item.name === name && item.parents.includes(parent))?.[0];
/** The <folder>/Archive/<season> folder in the fake drive. */
const archiveOf = (liveFolder: string, season = "2026–27") => { const archive = named("Archive", liveFolder); return archive ? named(season, archive) : undefined; };

describe("archiving a season's spreadsheets", () => {
  it("moves every old file into an Archive folder inside its own folder once, and a second run does nothing", async () => {
    const f = await seed();
    expect(await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason })).toBe("started");
    const row = await runJob(f);
    expect(row).toMatchObject({ state: "done", moved: 4, label: "2026–27" });
    // One Archive folder and one season folder inside each of the four folders.
    expect(drive.stats.folderCreates).toBe(8);
    const expected = { roster: FOLDERS.general, money: FOLDERS.money, health: FOLDERS.health, event: FOLDERS.events } as const;
    for (const [name, id] of Object.entries(f.old) as [keyof typeof expected, Id<"sheetExportFiles">][]) {
      const stored = (await f.t.run(ctx => ctx.db.get(id)))!;
      const folder = archiveOf(expected[name])!;
      expect(folder).toBeTruthy();
      expect(drive.items.get(stored.spreadsheetId)!.parents).toEqual([folder]);
      expect(stored).toMatchObject({ archiveFolderId: folder, frozen: true });
      expect(stored.archivedAt).toBeTypeOf("number");
    }
    // The new season's file stays where it is and is not marked.
    const current = (await f.t.run(ctx => ctx.db.get(f.current)))!;
    expect(drive.items.get(current.spreadsheetId)!.parents).toEqual([FOLDERS.general]);
    expect(current.archivedAt).toBeUndefined();

    const before = { ...drive.stats };
    expect(await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason })).toBe("started");
    expect(await runJob(f)).toMatchObject({ state: "done", moved: 4 });
    expect(drive.stats).toEqual(before);
  });

  it("refuses to archive a season that is still active", async () => {
    const f = await seed();
    expect(await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.newSeason })).toBe("notArchived");
    expect(await f.t.run(ctx => ctx.db.query("sheetArchives").first())).toBeNull();
    expect(drive.stats).toEqual({ folderCreates: 0, moves: 0 });
  });

  it("records the start and the finish with counts in the audit trail", async () => {
    const f = await seed();
    await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason });
    await runJob(f);
    const rows = await f.t.run(ctx => ctx.db.query("audit").collect());
    expect(rows.map(row => [row.entity, row.action, row.actorId])).toEqual([["sheetArchives", "archiveStartManual", f.ids.coach], ["sheetArchives", "archiveFinish", f.ids.coach]]);
    expect(JSON.parse(rows[1].afterJson!)).toEqual({ state: "done", moved: 4, trigger: "manual" });
    expect(JSON.stringify(rows)).not.toContain(FOLDERS.general);
  });

  it("continues after a failure without making folders again, and tells only a Coach it stopped partway", async () => {
    const f = await seed();
    await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason });
    const archive = (await f.t.run(ctx => ctx.db.query("sheetArchives").first()))!;
    await f.t.action(internal.sheetArchiveActions.archiveStep, { archiveId: archive._id });
    // Google stops answering well for the next file: the job stops as partial with a plain note.
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => String(input).includes("oauth2") ? new Response(JSON.stringify({ access_token: "t" })) : new Response("{}", { status: 400 })));
    await f.t.action(internal.sheetArchiveActions.archiveStep, { archiveId: archive._id });
    expect(await f.t.run(ctx => ctx.db.get(archive._id))).toMatchObject({ state: "partial", moved: 1 });
    expect((await f.coach.query(api.sheetExports.status, {})).archive).toEqual({ label: "2026–27", state: "partial" });
    expect((await f.lead.query(api.sheetExports.status, {})).archive).toBeNull();
    vi.stubGlobal("fetch", vi.fn(drive.handler));
    const folders = drive.stats.folderCreates;
    await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason });
    expect(await runJob(f)).toMatchObject({ state: "done", moved: 4 });
    // Only the three folders not reached before the failure get their Archive and season folders.
    expect(drive.stats.folderCreates).toBe(folders + 6);
    expect(drive.stats.moves).toBe(4);
    expect((await f.lead.query(api.sheetExports.status, {})).archive).toEqual({ label: "2026–27", state: "done" });
  });

  it("uses the folders set now when the move is started again", async () => {
    const f = await seed();
    await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason });
    const archive = (await f.t.run(ctx => ctx.db.query("sheetArchives").first()))!;
    await f.t.run(ctx => ctx.db.patch(archive._id, { state: "partial" }));
    const newMoney = "folderMoneyNew0010";
    await f.t.run(async ctx => { const settings = (await ctx.db.query("sheetExportSettings").first())!; await ctx.db.patch(settings._id, { moneyFolderId: newMoney }); });
    await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason });
    await runJob(f);
    const money = (await f.t.run(ctx => ctx.db.get(f.old.money)))!;
    expect(drive.items.get(money.spreadsheetId)!.parents).toEqual([archiveOf(newMoney)]);
    expect(archiveOf(FOLDERS.money)).toBeUndefined();
  });

  it("does nothing but leave a note when updates are off, shown only to a Coach", async () => {
    const off = await seed();
    vi.stubEnv("GOOGLE_SHEETS_EXPORT_ENABLED", "false");
    expect(await off.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: off.ids.oldSeason })).toBe("skipped");
    expect(await off.t.run(ctx => ctx.db.query("sheetArchives").first())).toMatchObject({ state: "skipped", note: ARCHIVE_OFF_NOTE });
    expect(drive.stats).toEqual({ folderCreates: 0, moves: 0 });
    expect((await off.t.run(ctx => ctx.db.get(off.old.roster)))?.archivedAt).toBeUndefined();
    expect((await off.coach.query(api.sheetExports.status, {})).archive).toEqual({ label: "2026–27", state: "skipped" });
    expect((await off.lead.query(api.sheetExports.status, {})).archive).toBeNull();
  });

  it("stops an update of the old season and waits until its last step lets go before moving anything", async () => {
    const f = await seed();
    const now = Date.now();
    const run = await f.t.run(ctx => ctx.db.insert("sheetExportRuns", { seasonId: f.ids.oldSeason, trigger: "server", startedAt: now, leaseExpiresAt: now + 10 * 60_000, pending: ["studentRoster", "money"], total: 2, done: 0, failed: 0, state: "running" }));
    expect(await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason })).toBe("started");
    expect(await f.t.run(ctx => ctx.db.get(run))).toMatchObject({ state: "stopped" });
    const archive = (await f.t.run(ctx => ctx.db.query("sheetArchives").first()))!;
    // A step of the stopped run may still be working: the archive waits and moves nothing.
    await f.t.action(internal.sheetArchiveActions.archiveStep, { archiveId: archive._id });
    expect(drive.stats).toEqual({ folderCreates: 0, moves: 0 });
    expect(await f.t.run(ctx => ctx.db.get(archive._id))).toMatchObject({ state: "running", moved: 0 });
    // That step ends (it finds its run stopped) and lets go at once; the archive then goes on.
    await f.t.mutation(internal.sheetExports.completeOne, { runId: run, kind: "studentRoster" });
    expect(await runJob(f)).toMatchObject({ state: "done", moved: 4 });
  });

  it("keeps archived files out of later runs and the current lists, and tells the card where they went", async () => {
    const f = await seed();
    await f.t.mutation(internal.sheetArchive.archiveSeasonNow, { seasonId: f.ids.oldSeason });
    await runJob(f);
    const now = Date.now();
    // A run of the old season (left over from before the switch) stops without any Google call; saving is refused.
    const run = await f.t.run(ctx => ctx.db.insert("sheetExportRuns", { seasonId: f.ids.oldSeason, trigger: "server", startedAt: now, leaseExpiresAt: now + 60_000, pending: ["studentRoster"], total: 1, done: 0, failed: 0, state: "running" }));
    expect(await f.t.mutation(internal.sheetExports.claimNext, { runId: run })).toBeNull();
    expect(await f.t.run(ctx => ctx.db.get(run))).toMatchObject({ state: "stopped" });
    const old = (await f.t.run(ctx => ctx.db.get(f.old.roster)))!;
    expect(await f.t.mutation(internal.sheetExports.saveFile, { runId: run, seasonId: f.ids.oldSeason, kind: "studentRoster", folder: "general", folderId: FOLDERS.general, name: "x", spreadsheetId: old.spreadsheetId, tabs: [], checkedAt: 5, frozen: false, recreated: null })).toBe(false);
    // Changing the Drive folders does not forget archived files.
    await f.t.mutation(internal.sheetExports.saveSettings, { driveId: DRIVE, generalFolderId: "otherGeneral00001", moneyFolderId: FOLDERS.money, healthFolderId: FOLDERS.health, eventsFolderId: FOLDERS.events, setBy: f.ids.coach, now: 9 });
    expect((await f.t.run(ctx => ctx.db.get(f.old.roster)))?.archivedAt).toBeTypeOf("number");
    const status = await f.coach.query(api.sheetExports.status, {});
    expect(status.archive).toEqual({ label: "2026–27", state: "done" });
    expect(status.events).toEqual([]);
  });
});
