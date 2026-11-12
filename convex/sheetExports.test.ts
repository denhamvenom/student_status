/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any -- fake Google payloads are untyped JSON */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { googleRetry } from "./lib/googleSheets";
import { folderVisible } from "./lib/sheetKinds";
import { SHEET_REGISTRY, allSheetKinds } from "./lib/sheetRegistry";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const EMAIL = "reports@synthetic.invalid";
const FOLDERS = { general: "folderGeneral0001", money: "folderMoney000002", health: "folderHealth00003", events: "folderEvents000008" };
const DRIVE = "sharedDrive0000001";

type Fake = ReturnType<typeof fakeGoogle>;
type FolderSpec = { driveId: string | null; canAddChildren?: boolean; mimeType?: string; parents?: string[] };
/** An in-memory stand-in for Google; nothing here reaches a real service. */
function fakeGoogle(folders: Record<string, FolderSpec>) {
  const state = {
    files: new Map<string, { key: string; name: string; trashed: boolean; parents: string[] }>(), creates: 0, ids: 0, calls: [] as string[], batches: [] as { id: string; requests: any[] }[],
    createMode: "ok" as "ok" | "lostAnswer", batchStatuses: [] as number[], batchAttempts: 0, batchDrop: false, missingSheets: new Set<string>(), scopes: [] as string[], onToken: null as null | (() => Promise<void>),
    sheets: new Map<string, { sheetId: number; title: string }[]>(), sheetsNotYet: 0, trashWhenReady: false, driveForbidden: [] as string[], createStatus: 0, renameFail: 0,
    renames: [] as { id: string; name: string }[], onCreate: null as null | (() => Promise<void>),
  };
  const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
  const handler = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    state.calls.push(`${method} ${url.host}${url.pathname}`);
    if (url.host === "oauth2.googleapis.com") {
      const assertion = new URLSearchParams(String(init?.body)).get("assertion")!;
      state.scopes.push(JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString()).scope);
      await state.onToken?.();
      return json(200, { access_token: "synthetic-token" });
    }
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const key = /value='([^']*)'/.exec(q)?.[1];
      const folder = /and '([^']*)' in parents/.exec(q)?.[1];
      return json(200, { files: [...state.files].filter(([, file]) => file.key === key && !file.trashed && (!folder || file.parents.includes(folder))).map(([id]) => ({ id })) });
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      // Live Google refuses a caller-chosen ID for Google Sheets files.
      if (body.id !== undefined) return json(403, { error: { code: 403, message: "Generated IDs are not supported for Docs Editors formats.", errors: [{ reason: "generatedIdNotSupported" }] } });
      if (state.createStatus) return json(state.createStatus, { error: { code: state.createStatus, message: "Forbidden by test", errors: [{ reason: "forbidden" }], status: "PERMISSION_DENIED" } });
      state.creates++;
      const newId = `sheet${++state.ids}`;
      state.files.set(newId, { key: body.appProperties.venomStatusKey, name: body.name, trashed: false, parents: body.parents });
      await state.onCreate?.();
      if (state.createMode === "lostAnswer") { state.createMode = "ok"; return json(500); }
      return json(200, { id: newId });
    }
    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (fileMatch && method === "PATCH") {
      const id = decodeURIComponent(fileMatch[1]);
      const file = state.files.get(id);
      if (!file) return json(404);
      if (state.renameFail > 0) { state.renameFail--; return json(403, { error: { errors: [{ reason: "forbidden" }] } }); }
      const name = JSON.parse(String(init?.body)).name;
      file.name = name;
      state.renames.push({ id, name });
      return json(200, { id, name });
    }
    if (fileMatch && method === "GET") {
      const id = decodeURIComponent(fileMatch[1]);
      if (state.driveForbidden.length) return json(403, { error: { errors: [{ reason: state.driveForbidden.shift() }] } });
      const folder = folders[id];
      if (folder) return json(200, { id, name: `Folder ${id}`, mimeType: folder.mimeType ?? "application/vnd.google-apps.folder", ...(folder.driveId ? { driveId: folder.driveId } : {}), parents: folder.parents ?? (folder.driveId ? [folder.driveId] : []), capabilities: { canAddChildren: folder.canAddChildren ?? true } });
      const file = state.files.get(id);
      return file ? json(200, { id, trashed: file.trashed, parents: file.parents }) : json(404);
    }
    const sheetMatch = /^\/v4\/spreadsheets\/([^/:]+)(:batchUpdate)?$/.exec(url.pathname);
    if (sheetMatch) {
      const id = decodeURIComponent(sheetMatch[1]);
      if (!state.files.has(id) || state.missingSheets.has(id)) return json(404);
      if (!sheetMatch[2] && state.sheetsNotYet > 0) { if (--state.sheetsNotYet === 0 && state.trashWhenReady) state.files.get(id)!.trashed = true; return json(404); }
      if (sheetMatch[2]) {
        state.batchAttempts++;
        if (state.batchDrop) { state.batchDrop = false; throw new TypeError("connection dropped"); }
        const status = state.batchStatuses.shift() ?? 200;
        if (status !== 200) return json(status);
        state.batches.push({ id, requests: JSON.parse(String(init?.body)).requests });
        state.sheets.set(id, [{ sheetId: 0, title: "Done" }]);
        return json(200);
      }
      return json(200, { sheets: (state.sheets.get(id) ?? [{ sheetId: 0, title: "Sheet1" }]).map(properties => ({ properties })) });
    }
    return json(404);
  };
  return { state, handler, googleCalls: () => state.calls.filter(call => !call.includes("oauth2")).length };
}

/** The text and number cells written to each tab in a batch, keyed by tab title. */
function writtenTabs(batch: { requests: any[] }) {
  const titles = new Map<number, string>();
  for (const request of batch.requests) {
    if (request.addSheet) titles.set(request.addSheet.properties.sheetId, request.addSheet.properties.title);
    if (request.updateSheetProperties?.properties.title) titles.set(request.updateSheetProperties.properties.sheetId, request.updateSheetProperties.properties.title);
  }
  const tabs: Record<string, (string | number)[][]> = {};
  for (const request of batch.requests) {
    if (!request.updateCells?.rows) continue;
    tabs[titles.get(request.updateCells.start.sheetId) ?? "?"] = request.updateCells.rows.map((row: any) => row.values.map((cell: any) => cell.userEnteredValue.stringValue ?? cell.userEnteredValue.numberValue));
  }
  return tabs;
}

async function fixture(options: { settings?: boolean } = {}) {
  const t = createTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const account = async (key: string, role: Doc<"appUsers">["role"], name: string, extra: Partial<Doc<"appUsers">> = {}) => {
      const email = `${key}@example.invalid`;
      const auth = await ctx.db.insert("users", { email });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email, name, role, active: true, travelLead: false, financialEdit: false, ...extra });
      return { auth, app };
    };
    const coach = await account("coach", "coach", "Casey Coach");
    const lead = await account("lead", "mentor", "Jordan Lead", { travelLead: true });
    const mentor = await account("mentor", "mentor", "Morgan Mentor", { shirtSize: "L", subteams: ["Build"] });
    const parent = await account("parent", "parent", "Pat Parent", { shirtSize: "M" });
    const parentLead = await account("parentlead", "parent", "Riley Parent", { parentStaffAccess: "travelLead", shirtSize: "S" });
    const student = await account("student", "student", "Dev Student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2027", year: 2027, status: "active", startsAt: 0, permissionVersion: "v1", createdBy: coach.app });
    const studentFields = { legalName: "Dev Student", preferredName: "Dev", email: "student@example.invalid", subteam: "Build", travelTeam: false, active: true, roomCategoryLocked: false, allergies: { state: "none" as const }, medications: { state: "none" as const } };
    const studentId = await ctx.db.insert("students", { ...studentFields, seasonId: season, userId: student.app, shirtSize: "M" });
    const leadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    const parentSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    await ctx.db.insert("operatingRoles", { sessionId: leadSession, userId: parentLead.app, role: "travelLead", accessRevision: 0 });
    if (options.settings !== false) await ctx.db.insert("sheetExportSettings", { driveId: DRIVE, generalFolderId: FOLDERS.general, moneyFolderId: FOLDERS.money, healthFolderId: FOLDERS.health, eventsFolderId: FOLDERS.events, setBy: coach.app, setAt: 1 });
    return { coach, lead, mentor, parent, parentLead, student, studentId, season, leadSession, parentSession };
  });
  const as = (user: { auth: Id<"users"> }, session = "session") => t.withIdentity({ subject: `${user.auth}|${session}` });
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor), parent: as(ids.parent), student: as(ids.student), parentAsLead: as(ids.parentLead, ids.leadSession), parentAsParent: as(ids.parentLead, ids.parentSession) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const allFolders = { [FOLDERS.general]: { driveId: DRIVE }, [FOLDERS.money]: { driveId: DRIVE }, [FOLDERS.health]: { driveId: DRIVE }, [FOLDERS.events]: { driveId: DRIVE } };
let google: Fake;
let fetcher: ReturnType<typeof vi.fn>;
const latestRun = (f: Fixture) => f.t.run(ctx => ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first());
const files = (f: Fixture) => f.t.run(ctx => ctx.db.query("sheetExportFiles").collect());
/** Runs every pending file of the latest run, one call per file as the scheduler would. */
async function finishRun(f: Fixture) {
  const run = (await latestRun(f))!;
  for (let i = 0; i < run.total; i++) await f.t.action(internal.sheetExportActions.runOne, { runId: run._id });
  return (await latestRun(f))!;
}

/**
 * These tests are about runs, leases, duplicates, freezing and visibility, not about what each kind contains (each kind has its own tests,
 * and convex/sheetExportsAll.test.ts runs every kind end to end). So only the two simplest team kinds are ready here; a test turns an event kind on when it needs one.
 */
const FOCUSED_KINDS = ["studentRoster", "shirtSizes"];
const readyBefore = allSheetKinds().map(entry => ({ definition: entry.definition, ready: entry.definition.ready }));

beforeEach(async () => {
  for (const entry of allSheetKinds()) entry.definition.ready = FOCUSED_KINDS.includes(entry.definition.kind);
  vi.useFakeTimers();
  googleRetry.delaysMs = [0, 0, 0];
  const keys = await generateKeyPair("RS256", { extractable: true });
  vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL", EMAIL);
  vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
  vi.stubEnv("GOOGLE_SHEETS_EXPORT_ENABLED", "true");
  google = fakeGoogle(allFolders);
  fetcher = vi.fn(google.handler);
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { for (const { definition, ready } of readyBefore) definition.ready = ready; vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("who can press Update spreadsheets", () => {
  it.each(["coach", "lead", "parentAsLead"] as const)("lets %s start a full update", async who => {
    const f = await fixture();
    expect(await f[who].mutation(api.sheetExports.requestUpdate, {})).toEqual({ status: "started" });
    expect((await latestRun(f))!.pending).toEqual(["studentRoster", "shirtSizes"]);
  });
  it.each(["mentor", "parentAsParent", "student"] as const)("refuses %s on the server", async who => {
    const f = await fixture();
    await expect(f[who].mutation(api.sheetExports.requestUpdate, {})).rejects.toThrow("Coach or Travel Lead");
    await expect(f[who].query(api.sheetExports.status, {})).rejects.toThrow("Coach or Travel Lead");
    expect(await latestRun(f)).toBeNull();
  });
  it("limits how often one person can press", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) {
      await f.t.run(async ctx => { for (const run of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(run._id, { state: "done", finishedAt: 1 }); });
      expect((await f.coach.mutation(api.sheetExports.requestUpdate, {})).status).toBe("started");
    }
    await f.t.run(async ctx => { for (const run of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(run._id, { state: "done", finishedAt: 1 }); });
    expect(await f.coach.mutation(api.sheetExports.requestUpdate, {})).toMatchObject({ status: "tooManyRequests" });
    expect((await f.lead.mutation(api.sheetExports.requestUpdate, {})).status).toBe("started");
  });
});

describe("turning updates on and connecting Drive", () => {
  it("makes no Google calls while updates are off", async () => {
    vi.stubEnv("GOOGLE_SHEETS_EXPORT_ENABLED", "false");
    const f = await fixture();
    expect(await f.coach.mutation(api.sheetExports.requestUpdate, {})).toMatchObject({ status: "off", message: expect.stringContaining("aren't turned on") });
    expect(await f.coach.query(api.sheetExports.status, {})).toMatchObject({ enabled: false });
    // A run that was already waiting when updates were turned off stops without touching Google.
    const runId = await f.t.run(ctx => ctx.db.insert("sheetExportRuns", { seasonId: f.ids.season, trigger: "button", startedAt: 1, leaseExpiresAt: Date.now() + 60_000, pending: ["shirtSizes"], total: 1, done: 0, failed: 0, state: "running" }));
    await f.t.action(internal.sheetExportActions.runOne, { runId });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await latestRun(f))!.state).toBe("stopped");
  });
  it("says Drive is not connected until a Coach connects it", async () => {
    const f = await fixture({ settings: false });
    expect(await f.lead.mutation(api.sheetExports.requestUpdate, {})).toMatchObject({ status: "notSetUp", message: expect.stringContaining("A Coach can connect it") });
    expect(await f.lead.query(api.sheetExports.status, {})).toMatchObject({ connected: false, canSetUp: false, serviceAccountEmail: null });
    expect(await f.coach.query(api.sheetExports.status, {})).toMatchObject({ connected: false, canSetUp: true, serviceAccountEmail: EMAIL });
  });
  it("lets only a Coach connect Drive, saving full links as folder IDs", async () => {
    const f = await fixture({ settings: false });
    const links = { general: `https://drive.google.com/drive/folders/${FOLDERS.general}?usp=sharing`, money: `https://drive.google.com/drive/u/0/folders/${FOLDERS.money}`, health: FOLDERS.health, events: `https://drive.google.com/drive/folders/${FOLDERS.events}` };
    for (const who of [f.lead, f.mentor, f.parent, f.student]) await expect(who.action(api.sheetExportActions.checkAccess, links)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await f.coach.action(api.sheetExportActions.checkAccess, links)).toEqual({ ok: true });
    expect(await f.t.run(ctx => ctx.db.query("sheetExportSettings").first())).toMatchObject({ driveId: DRIVE, generalFolderId: FOLDERS.general, moneyFolderId: FOLDERS.money, healthFolderId: FOLDERS.health, eventsFolderId: FOLDERS.events });
  });
  it.each([
    ["a link that is not a Drive folder", { general: "https://example.invalid/x" }, [{ folder: "general", message: expect.stringContaining("doesn't look like a Google Drive folder link") }]],
    ["the same folder twice", { money: FOLDERS.general }, [{ folder: "money", message: expect.stringContaining("same as the General folder") }]],
    ["the Events folder pasted as the Health folder", { events: FOLDERS.health }, [{ folder: "events", message: expect.stringContaining("same as the Health folder") }]],
    ["an Events folder in another shared drive", { events: "folderOther000004" }, [{ folder: "events", message: expect.stringContaining("different shared drive") }]],
    ["an Events folder the account cannot write to", { events: "folderReadOnly005" }, [{ folder: "events", message: expect.stringContaining("Content manager") }]],
    ["a folder in another shared drive", { health: "folderOther000004" }, [{ folder: "health", message: expect.stringContaining("different shared drive") }]],
    ["a folder the account cannot write to", { money: "folderReadOnly005" }, [{ folder: "money", message: expect.stringContaining("Content manager") }]],
    ["a folder the account cannot see", { general: "folderHidden00006" }, [{ folder: "general", message: expect.stringContaining(EMAIL) }]],
  ])("explains %s", async (_name, change, problems) => {
    google = fakeGoogle({ ...allFolders, folderOther000004: { driveId: "otherDrive00000001" }, folderReadOnly005: { driveId: DRIVE, canAddChildren: false } });
    vi.stubGlobal("fetch", vi.fn(google.handler));
    const f = await fixture({ settings: false });
    const result = await f.coach.action(api.sheetExportActions.checkAccess, { ...FOLDERS, ...change });
    expect(result).toEqual({ ok: false, problems });
    expect(await f.t.run(ctx => ctx.db.query("sheetExportSettings").first())).toBeNull();
  });
});

describe("one run at a time", () => {
  const running = (f: Fixture, leaseExpiresAt: number) => f.t.run(ctx => ctx.db.insert("sheetExportRuns", { seasonId: f.ids.season, trigger: "schedule", startedAt: 1, leaseExpiresAt, pending: ["shirtSizes"], total: 2, done: 1, failed: 0, state: "running" }));
  it("refuses a press while a run holds its lease", async () => {
    const f = await fixture();
    await running(f, Date.now() + 60_000);
    expect(await f.coach.mutation(api.sheetExports.requestUpdate, {})).toEqual({ status: "alreadyUpdating", message: "Spreadsheets are already updating. This takes a few minutes." });
    expect(await f.t.run(async ctx => (await ctx.db.query("sheetExportRuns").collect()).length)).toBe(1);
  });
  it("takes over a run whose lease expired", async () => {
    const f = await fixture();
    const old = await running(f, Date.now() - 1000);
    expect(await f.coach.mutation(api.sheetExports.requestUpdate, {})).toEqual({ status: "started" });
    expect((await f.t.run(ctx => ctx.db.get(old)))!.state).toBe("partial");
    expect((await latestRun(f))!.state).toBe("running");
  });
});

describe("a full update", () => {
  it("writes each file once, skips unchanged files, and rewrites when data changes", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const run = await finishRun(f);
    expect(run).toMatchObject({ state: "done", done: 2, failed: 0, pending: [] });
    expect(google.state.creates).toBe(2);
    expect(google.state.batches).toHaveLength(2);
    const roster = writtenTabs(google.state.batches[0]);
    expect(roster.Students[0][0]).toMatch(/^Updated [A-Z][a-z]{2} \d{1,2}, 2026, \d{1,2}:\d{2} [AP]M Central Time by Venom Status\. Don't type changes here\. They're replaced at the next update\. Make changes in Venom Status\.$/);
    expect(roster.Students[2][0]).toBe("Dev");
    const shirts = writtenTabs(google.state.batches[1]);
    expect(shirts.Counts.at(-1)!.slice(1)).toEqual([1, 2, 3]);
    const status = await f.coach.query(api.sheetExports.status, {});
    expect(status.lastSuccessAt).not.toBeNull();
    expect(status.files.map(file => [file.title, file.problem])).toEqual([["Student roster", null], ["Shirt sizes", null]]);
    expect(status.files[0].link).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/sheet1\/edit$/);

    // Unchanged data: each file is only checked (still there, still in its folder); nothing is written.
    google.state.calls.length = 0;
    await f.t.run(async ctx => { for (const r of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(r._id, { state: "done", finishedAt: 1 }); });
    await f.lead.mutation(api.sheetExports.requestUpdate, {});
    await finishRun(f);
    expect(google.state.calls.filter(call => !call.includes("oauth2") && !call.startsWith("GET"))).toEqual([]);
    expect(google.state.calls.filter(call => call === "GET www.googleapis.com/drive/v3/files/sheet1")).toHaveLength(1);
    expect(google.state.batches).toHaveLength(2);
    // The card can tell "checked and unchanged" from "changed": every file carries when it was last confirmed current.
    const confirmed = await f.coach.query(api.sheetExports.status, {});
    expect(confirmed.files.every(file => file.updatedAt !== null && file.checkedAt !== null && file.checkedAt >= file.updatedAt)).toBe(true);

    await f.t.run(ctx => ctx.db.patch(f.ids.studentId, { shirtSize: "XL" }));
    await f.t.run(async ctx => { for (const r of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(r._id, { state: "done", finishedAt: 1 }); });
    await f.lead.mutation(api.sheetExports.requestUpdate, {});
    await finishRun(f);
    expect(google.state.batches).toHaveLength(3);
    expect(google.state.creates).toBe(2);
  });
  it("reports how many files are finished while a run is going", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    await f.t.run(async ctx => { for (const r of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(r._id, { total: 5, done: 2, failed: 1 }); });
    expect((await f.coach.query(api.sheetExports.status, {})).run).toMatchObject({ state: "running", total: 5, finished: 3 });
  });
  it("recovers an ambiguous create without making a duplicate", async () => {
    google.state.createMode = "lostAnswer";
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    await finishRun(f);
    expect(google.state.creates).toBe(2);
    expect([...google.state.files.values()].filter(file => file.key.endsWith(":studentRoster:-"))).toHaveLength(1);
    expect((await files(f)).map(file => file.spreadsheetId).sort()).toEqual(["sheet1", "sheet2"]);
  });
  it("retries a busy answer, then reports a plain problem when Google stays busy", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    google.state.batchStatuses = [429, 429];
    expect((await finishRun(f))).toMatchObject({ state: "done" });
    await f.t.run(async ctx => { for (const r of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(r._id, { state: "done", finishedAt: 1 }); });
    await f.t.run(ctx => ctx.db.patch(f.ids.studentId, { shirtSize: "S", legalName: "Dev Student Two" }));
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    // Busy answers are retried; a failing answer to a write may have been applied, so it is never repeated.
    google.state.batchStatuses = [429, 429, 429, 429, 503];
    google.state.batchAttempts = 0;
    const run = await finishRun(f);
    expect(run).toMatchObject({ state: "partial", failed: 2, done: 0 });
    expect(google.state.batchAttempts).toBe(5);
    const status = await f.coach.query(api.sheetExports.status, {});
    expect(status.files.every(file => file.problem?.includes("Google was busy"))).toBe(true);
    expect(JSON.stringify(status)).not.toMatch(/429|503|sync|API|retry/i);
  });
  it("waits for a file it just made instead of making a second copy when Google cannot read it yet", async () => {
    const f = await fixture();
    google.state.sheetsNotYet = 2;
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    expect(await finishRun(f)).toMatchObject({ state: "done", failed: 0 });
    expect(google.state.creates).toBe(2);
    expect((await files(f)).map(file => file.spreadsheetId).sort()).toEqual(["sheet1", "sheet2"]);
  });
  it("saves the new spreadsheet before writing when a re-create is truly needed", async () => {
    const f = await fixture();
    google.state.sheetsNotYet = 4;
    google.state.trashWhenReady = true;
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const run = (await latestRun(f))!;
    await f.t.action(internal.sheetExportActions.runOne, { runId: run._id });
    // Four unreadable answers outlast the three waits (and the file is gone), so a second file is made and is the one saved and written.
    expect(google.state.creates).toBe(2);
    expect(google.state.batches.map(b => b.id)).toEqual(["sheet2"]);
    expect((await files(f)).map(file => file.spreadsheetId)).toEqual(["sheet2"]);
  });
  it("treats a Drive rate-limit 403 as busy and an ordinary 403 as no access", async () => {
    const f = await fixture();
    google.state.driveForbidden = ["userRateLimitExceeded"];
    expect(await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).toEqual({ ok: true });
    google.state.driveForbidden = Array(30).fill("rateLimitExceeded");
    await expect(f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).rejects.toThrow();
    google.state.driveForbidden = ["forbidden"];
    expect(await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).toMatchObject({ ok: false });
  });
  it("clears the made-again note after a later update that finds nothing to change", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    await finishRun(f);
    google.state.files.get("sheet1")!.trashed = true;
    await press(f);
    expect((await f.coach.query(api.sheetExports.status, {})).files[0].note).toContain("made it again");
    await press(f);
    expect((await f.coach.query(api.sheetExports.status, {})).files[0].note).toBeNull();
  });
  it("makes a missing spreadsheet again and says so", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    await finishRun(f);
    google.state.files.get("sheet1")!.trashed = true;
    // The data has not changed, but the trashed file is still noticed and made again.
    await f.t.run(async ctx => { for (const r of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(r._id, { state: "done", finishedAt: 1 }); });
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    await finishRun(f);
    const status = await f.coach.query(api.sheetExports.status, {});
    expect(status.files[0].note).toContain("made it again");
    expect(status.files[0].link).toContain("/sheet3/");
  });
});

describe("hourly schedule", () => {
  // 5:00 AM and 6:00 PM Chicago: CDT is UTC-5, CST is UTC-6; the clocks change on 2026-03-08 and 2026-11-01.
  it.each([
    ["2026-07-15T10:20:00Z", true], ["2026-07-15T11:20:00Z", false], ["2026-07-15T23:05:00Z", true], ["2026-07-15T22:05:00Z", false],
    ["2026-01-15T11:00:00Z", true], ["2026-01-15T10:00:00Z", false], ["2026-01-16T00:00:00Z", true], ["2026-01-15T23:00:00Z", false],
    ["2026-03-08T10:00:00Z", true], ["2026-03-08T11:00:00Z", false], ["2026-11-01T10:00:00Z", false], ["2026-11-01T11:00:00Z", true],
  ])("at %s the hourly check starts a run: %s", async (at, starts) => {
    vi.setSystemTime(new Date(at));
    const f = await fixture();
    await f.t.mutation(internal.sheetExports.hourly, {});
    expect(!!(await latestRun(f))).toBe(starts);
  });
  it("does not start a second scheduled run in the same hour", async () => {
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    const f = await fixture();
    await f.t.mutation(internal.sheetExports.hourly, {});
    await finishRun(f);
    vi.setSystemTime(new Date("2026-07-15T10:30:00Z"));
    await f.t.mutation(internal.sheetExports.hourly, {});
    expect(await f.t.run(async ctx => (await ctx.db.query("sheetExportRuns").collect()).length)).toBe(1);
  });
});

const resetRuns = (f: Fixture) => f.t.run(async ctx => { for (const r of await ctx.db.query("sheetExportRuns").collect()) await ctx.db.patch(r._id, { state: "done", finishedAt: 1 }); });
const press = async (f: Fixture) => { await resetRuns(f); await f.coach.mutation(api.sheetExports.requestUpdate, {}); return await finishRun(f); };

describe("a run whose hold ran out", () => {
  it("stops before writing when its hold expired, even if nobody has replaced it", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const run = (await latestRun(f))!;
    await f.t.run(ctx => ctx.db.patch(run._id, { leaseExpiresAt: Date.now() - 1 }));
    expect(await f.t.query(internal.sheetExports.runCurrent, { runId: run._id })).toBe(false);
    await f.t.run(ctx => ctx.db.patch(run._id, { leaseExpiresAt: Date.now() + 60_000 }));
    expect(await f.t.query(internal.sheetExports.runCurrent, { runId: run._id })).toBe(true);
  });
});

describe("folders and files that change", () => {
  it("makes a new file in the new folder when a folder changes, leaving the old one in Drive", async () => {
    google = fakeGoogle({ ...allFolders, folderGeneral0002: { driveId: DRIVE } });
    vi.stubGlobal("fetch", vi.fn(google.handler));
    const f = await fixture();
    await press(f);
    expect(google.state.creates).toBe(2);
    const links = { general: "folderGeneral0002", money: FOLDERS.money, health: FOLDERS.health, events: FOLDERS.events };
    expect(await f.coach.action(api.sheetExportActions.checkAccess, links)).toEqual({ ok: true });
    await press(f);
    expect(google.state.creates).toBe(4);
    expect([...google.state.files.values()].map(file => file.parents[0])).toEqual([FOLDERS.general, FOLDERS.general, "folderGeneral0002", "folderGeneral0002"]);
    expect((await files(f)).map(file => file.spreadsheetId).sort()).toEqual(["sheet3", "sheet4"]);
  });
  it("makes a file again, in the right folder, when someone moved it out", async () => {
    const f = await fixture();
    await press(f);
    google.state.files.get("sheet1")!.parents = ["someOtherFolder0001"];
    await press(f);
    expect(google.state.creates).toBe(3);
    const status = await f.coach.query(api.sheetExports.status, {});
    expect(status.files[0].note).toContain("no longer in its folder");
    expect(status.files[0].note).toContain("old one is still in Google Drive");
    expect(google.state.files.get("sheet3")!.parents).toEqual([FOLDERS.general]);
    // The note goes away after a later update that did not need to remake anything.
    await f.t.run(ctx => ctx.db.patch(f.ids.studentId, { preferredName: "Devon" }));
    await press(f);
    expect((await f.coach.query(api.sheetExports.status, {})).files.map(file => file.note)).toEqual([null, null]);
  });
  it("rewrites a first write that was interrupted, then does not repeat a write that may have been applied", async () => {
    const f = await fixture();
    google.state.batchDrop = true;
    expect(await press(f)).toMatchObject({ state: "partial", failed: 1, done: 1 });
    expect(google.state.batchAttempts).toBe(2);
    const afterDrop = await files(f);
    expect(afterDrop.find(file => file.kind === "studentRoster")!.spreadsheetId).toBe("sheet1");
    expect(afterDrop.find(file => file.kind === "studentRoster")!.fingerprint).toBeUndefined();
    expect(afterDrop.find(file => file.kind === "shirtSizes")!.fingerprint).toEqual(expect.any(String));
    await press(f);
    expect(google.state.batches.map(batch => batch.id)).toEqual(["sheet2", "sheet1"]);
    expect(google.state.creates).toBe(2);
  });
  it("tells the file apart from a stale save after a data change that is then interrupted", async () => {
    const f = await fixture();
    await press(f);
    await f.t.run(ctx => ctx.db.patch(f.ids.studentId, { shirtSize: "XL" }));
    google.state.batchDrop = true;
    await press(f);
    expect((await files(f)).find(file => file.kind === "studentRoster")!.fingerprint).toEqual(expect.any(String));
    expect((await files(f)).find(file => file.kind === "shirtSizes")!.fingerprint).toBeUndefined();
    const batches = google.state.batches.length;
    await press(f);
    expect(google.state.batches.length).toBe(batches + 1);
  });
  it("stops without writing when the run was replaced while it worked", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const run = (await latestRun(f))!;
    google.state.onToken = async () => { await f.t.run(ctx => ctx.db.patch(run._id, { state: "partial", finishedAt: 1 })); };
    await f.t.action(internal.sheetExportActions.runOne, { runId: run._id });
    expect(google.state.creates).toBe(0);
    expect(google.state.batches).toEqual([]);
    expect(await files(f)).toEqual([]);
  });
  it("creates without a pre-chosen ID, and shows a plain message (with the Google reason only in the log) when Drive refuses", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    google.state.createStatus = 403;
    const f = await fixture();
    await press(f);
    expect(google.state.creates).toBe(0);
    const status = await f.coach.query(api.sheetExports.status, {});
    for (const file of status.files) {
      expect(file.problem).toBe("Google Drive didn't let Venom Status save this spreadsheet. A Coach can open Connect Google Drive and press Check access.");
      expect(file.problem).not.toMatch(/service account/i);
    }
    expect(status.lastTriedAt).not.toBeNull();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("createSpreadsheet");
    expect(logged).toContain("403");
    expect(logged).toContain("forbidden");
    expect(logged).not.toContain("synthetic-token");
    warn.mockRestore();
    google.state.createStatus = 0;
    await press(f);
    expect(google.state.creates).toBe(2);
    expect([...google.state.files.values()].every(file => file.key)).toBe(true);
  });
  it("never makes two copies when the answer to a create is lost", async () => {
    google.state.createMode = "lostAnswer";
    const f = await fixture();
    await press(f);
    expect([...google.state.files.values()].filter(file => file.key.endsWith(":studentRoster:-"))).toHaveLength(1);
    expect(google.state.creates).toBe(2);
  });
  it("uses the narrow Drive permission for writing and the read-only one for the setup check", async () => {
    const f = await fixture({ settings: false });
    await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS);
    expect(new Set(google.state.scopes)).toEqual(new Set(["https://www.googleapis.com/auth/drive.metadata.readonly"]));
    google.state.scopes.length = 0;
    await press(f);
    expect(new Set(google.state.scopes)).toEqual(new Set(["https://www.googleapis.com/auth/drive"]));
  });
});

describe("a Google request that stalls", () => {
  it("gives up after the time limit, and repeats a read but not a write", async () => {
    vi.useRealTimers();
    googleRetry.timeoutMs = 20;
    const stalled = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    vi.stubGlobal("fetch", stalled);
    const { batchUpdate, getSheets } = await import("./lib/googleSheets");
    await expect(batchUpdate("t", "x", [])).rejects.toMatchObject({ status: 0 });
    expect(stalled).toHaveBeenCalledTimes(1);
    stalled.mockClear();
    await expect(getSheets("t", "x")).rejects.toMatchObject({ status: 0 });
    expect(stalled).toHaveBeenCalledTimes(4);
    googleRetry.timeoutMs = 30_000;
  });
});

describe("checking access", () => {
  const nested = {
    ...allFolders,
    [FOLDERS.money]: { driveId: DRIVE, parents: [FOLDERS.general] },
    folderMiddle00007: { driveId: DRIVE, parents: [FOLDERS.general] },
    [FOLDERS.health]: { driveId: DRIVE, parents: ["folderMiddle00007"] },
  };
  it("refuses a folder inside another configured folder, however deep", async () => {
    google = fakeGoogle(nested);
    vi.stubGlobal("fetch", vi.fn(google.handler));
    const f = await fixture({ settings: false });
    const result = await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS);
    expect(result).toEqual({ ok: false, problems: [
      { folder: "money", message: "The Money folder is inside the General folder. Use folders that aren't inside each other." },
      { folder: "health", message: "The Health folder is inside the General folder. Use folders that aren't inside each other." },
    ] });
    expect(await f.t.run(ctx => ctx.db.query("sheetExportSettings").first())).toBeNull();
  });
  it("refuses an Events folder inside another configured folder, and a Health folder inside Events", async () => {
    google = fakeGoogle({ ...allFolders, [FOLDERS.events]: { driveId: DRIVE, parents: [FOLDERS.money] } });
    vi.stubGlobal("fetch", vi.fn(google.handler));
    const f = await fixture({ settings: false });
    expect(await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).toEqual({ ok: false, problems: [{ folder: "events", message: "The Events folder is inside the Money folder. Use folders that aren't inside each other." }] });
    google = fakeGoogle({ ...allFolders, [FOLDERS.health]: { driveId: DRIVE, parents: [FOLDERS.events] } });
    vi.stubGlobal("fetch", vi.fn(google.handler));
    expect(await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).toMatchObject({ ok: false, problems: [{ folder: "health", message: expect.stringContaining("inside the Events folder") }] });
  });
  it("requires an Events link and keeps Archive optional", async () => {
    const f = await fixture({ settings: false });
    const { events: _events, ...withoutEvents } = FOLDERS;
    await expect(f.coach.action(api.sheetExportActions.checkAccess, withoutEvents as never)).rejects.toThrow();
    expect(await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).toEqual({ ok: true });
    expect(await f.t.query(internal.sheetExports.getSettings, {})).toMatchObject({ eventsFolderId: FOLDERS.events });
  });
  it("refuses a General folder that holds the Money folder (the outer folder is the one named last)", async () => {
    google = fakeGoogle({ ...allFolders, [FOLDERS.general]: { driveId: DRIVE, parents: [FOLDERS.money] } });
    vi.stubGlobal("fetch", vi.fn(google.handler));
    const f = await fixture({ settings: false });
    expect(await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).toMatchObject({ ok: false, problems: [{ folder: "general", message: expect.stringContaining("inside the Money folder") }] });
  });
  it("records who connected Drive and which folders changed, without the folder links", async () => {
    const f = await fixture({ settings: false });
    await f.coach.action(api.sheetExportActions.checkAccess, FOLDERS);
    const rows = await f.t.run(ctx => ctx.db.query("audit").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: f.ids.coach.app, entity: "sheetExportSettings", action: "connect" });
    expect(JSON.parse(rows[0].afterJson!)).toEqual({ connected: true, foldersChanged: ["general", "money", "health", "events"], driveChanged: true });
    expect(JSON.stringify(rows)).not.toContain(FOLDERS.general);
  });
  it("limits how often a Coach can check", async () => {
    const f = await fixture({ settings: false });
    for (let i = 0; i < 10; i++) expect(await f.coach.action(api.sheetExportActions.checkAccess, { general: "nope", money: "nope", health: "nope", events: "nope" })).toMatchObject({ ok: false });
    await expect(f.coach.action(api.sheetExportActions.checkAccess, { general: "nope", money: "nope", health: "nope", events: "nope" })).rejects.toThrow("You've checked access several times. Wait a few minutes, then try again.");
  });
  it("says the key is unreadable when the private key is malformed, without calling Google", async () => {
    vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY", "not a key");
    const f = await fixture({ settings: false });
    await expect(f.coach.action(api.sheetExportActions.checkAccess, FOLDERS)).rejects.toThrow("key can't be read");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("other update messages", () => {
  it("says there is no active season instead of saying Drive is not connected", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.season, { status: "archived" }));
    expect(await f.coach.mutation(api.sheetExports.requestUpdate, {})).toMatchObject({ status: "noSeason", message: expect.stringContaining("no active season") });
  });
  it("uses the approved wording for a missing connection and for too many presses", async () => {
    const f = await fixture({ settings: false });
    expect(await f.coach.mutation(api.sheetExports.requestUpdate, {})).toEqual({ status: "notSetUp", message: "Google Drive isn't connected yet. A Coach can connect it on this page." });
  });
});

describe("grade in the roster", () => {
  it("uses the grade being set up first, then the confirmed profile, like the Coach roster", async () => {
    const f = await fixture();
    const page = () => f.t.query(internal.sheetExportData.studentPage, { seasonId: f.ids.season, cursor: null, withParents: false });
    expect((await page()).rows[0].grade).toBeNull();
    await f.t.run(ctx => ctx.db.insert("setupDrafts", { studentId: f.ids.studentId, seasonId: f.ids.season, grade: "11th", updatedBy: f.ids.coach.app, updatedAt: 1 }));
    expect((await page()).rows[0].grade).toBe("11th");
  });
});

describe("who sees links to the Events folder", () => {
  const who = (role: "coach" | "mentor" | "parent" | "student", travelLead = false, healthExport = false) => ({ role, travelLead, healthExport });
  it("shows Events to any Coach or Travel Lead, like General, and to nobody else", () => {
    for (const user of [who("coach"), who("mentor", true), who("mentor", true, true)]) expect(folderVisible("events", user)).toBe(true);
    for (const user of [who("mentor"), who("parent"), who("student")]) expect([folderVisible("events", user), folderVisible("general", user)]).toEqual([false, false]);
  });
  it("still keeps Health to a Coach or a Travel Lead with Health export access", () => {
    expect([folderVisible("health", who("mentor", true)), folderVisible("health", who("mentor", true, true)), folderVisible("health", who("coach"))]).toEqual([false, true, true]);
  });
});

describe("per-event spreadsheets", () => {
  const NOW = Date.parse("2026-11-12T18:00:00Z");
  const kinds = [SHEET_REGISTRY.event.definition, SHEET_REGISTRY.eventFees.definition, SHEET_REGISTRY.eventTravelEmergency.definition];
  const saved = kinds.map(definition => ({ ready: definition.ready, build: definition.build }));
  /** Turns event kinds on for one test with a tiny synthetic tab (their real builders run in sheetExportsAll.test.ts). */
  const enable = (...which: typeof kinds) => { for (const definition of which) Object.assign(definition, { ready: true, build: () => [{ title: "People", rows: [["Name"], ["Dev"]] }] }); };
  afterEach(() => { kinds.forEach((definition, index) => Object.assign(definition, saved[index])); });
  beforeEach(() => { vi.setSystemTime(NOW); });

  const addEvent = (f: Fixture, name: string, startDays: number, over: Partial<Doc<"events">> = {}) => f.t.run(ctx => ctx.db.insert("events", {
    seasonId: f.ids.season, name, type: "Competition", startsAt: NOW + startDays * DAY, endsAt: NOW + (startDays + 2) * DAY, destination: "Synthetic Arena", travel: "Charter Bus",
    overnight: true, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...over,
  }));
  const template = { type: "Outreach" as const, destination: "Shop", travel: "", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false };
  const eventFiles = (status: { events: { eventId: Id<"events">; eventName: string; current: boolean; files: { kind: string; name: string | null; link: string | null }[] }[] }) =>
    status.events.flatMap(event => event.files.map(file => ({ ...file, eventId: event.eventId, eventName: event.eventName, current: event.current })));

  it("writes one file per qualifying event into the Events folder, named date first, and nothing for other events", async () => {
    enable(SHEET_REGISTRY.event.definition);
    const f = await fixture();
    const regional = await addEvent(f, "Synthetic Regional", 20);
    await addEvent(f, "Tuesday meeting", 1, { type: "Team" });
    await addEvent(f, "Canceled scrimmage", 3, { cancelled: true });
    await addEvent(f, "Far-off championship", 90);
    await addEvent(f, "Old outreach", -20, { type: "Outreach" });
    const series = await f.t.run(ctx => ctx.db.insert("eventSeries", { seasonId: f.ids.season, createdBy: f.ids.coach.app, createdAt: 1, name: "Build nights", status: "active", origin: "created", template, localStartTime: "18:00", durationMinutes: 120, weekdays: [2], intervalWeeks: 1, startDate: "2026-11-01", timeZone: "America/Chicago", templateRevision: 1 }));
    await addEvent(f, "Build night", 2, { type: "Outreach", seriesId: series });
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    expect((await latestRun(f))!.pending).toEqual(["studentRoster", "shirtSizes", { kind: "event", eventId: regional }]);
    expect(await finishRun(f)).toMatchObject({ state: "done", done: 3 });
    const eventFile = (await files(f)).find(file => file.eventId === regional)!;
    expect(eventFile).toMatchObject({ kind: "event", folder: "events", folderId: FOLDERS.events, name: "2026-12-02 Synthetic Regional" });
    expect([...google.state.files.values()].find(file => file.name === "2026-12-02 Synthetic Regional")!.key).toBe(`${f.ids.season}:event:${regional}`);
    const status = await f.lead.query(api.sheetExports.status, {});
    expect(status.files.map(file => file.kind)).toEqual(["studentRoster", "shirtSizes"]);
    expect(status.events).toEqual([expect.objectContaining({ eventId: regional, eventName: "Synthetic Regional", current: true, files: [expect.objectContaining({ kind: "event", name: "2026-12-02 Synthetic Regional", link: expect.stringContaining("docs.google.com") })] })]);
  });

  it("renames the Drive file when the event's name or date changes, without making a new one", async () => {
    enable(SHEET_REGISTRY.event.definition);
    const f = await fixture();
    const regional = await addEvent(f, "Synthetic Regional", 20);
    await press(f);
    const sheet = (await files(f)).find(file => file.eventId === regional)!.spreadsheetId;
    const creates = google.state.creates;
    await f.t.run(ctx => ctx.db.patch(regional, { name: "Synthetic District", startsAt: NOW + 21 * DAY }));
    await press(f);
    expect(google.state.creates).toBe(creates);
    expect(google.state.renames).toEqual([{ id: sheet, name: "2026-12-03 Synthetic District" }]);
    expect(google.state.files.get(sheet)!.name).toBe("2026-12-03 Synthetic District");
    expect((await files(f)).find(file => file.eventId === regional)).toMatchObject({ spreadsheetId: sheet, name: "2026-12-03 Synthetic District" });
    // Nothing changed: no rename and no write.
    await press(f);
    expect(google.state.renames).toHaveLength(1);
  });

  it("tries a failed Drive rename again on the next update", async () => {
    enable(SHEET_REGISTRY.event.definition);
    const f = await fixture();
    const regional = await addEvent(f, "Synthetic Regional", 20);
    await press(f);
    const sheet = (await files(f)).find(file => file.eventId === regional)!.spreadsheetId;
    await f.t.run(ctx => ctx.db.patch(regional, { name: "Synthetic District" }));
    google.state.renameFail = 1;
    await press(f);
    expect(google.state.renames).toEqual([]);
    expect((await files(f)).find(file => file.eventId === regional)!.name).not.toBe("2026-12-02 Synthetic District");
    await press(f);
    expect(google.state.renames).toEqual([{ id: sheet, name: "2026-12-02 Synthetic District" }]);
    expect((await files(f)).find(file => file.eventId === regional)).toMatchObject({ spreadsheetId: sheet, name: "2026-12-02 Synthetic District" });
  });

  it("freezes an event's file after the event ends: no more writes, still listed and still in Drive", async () => {
    enable(SHEET_REGISTRY.event.definition);
    const f = await fixture();
    const regional = await addEvent(f, "Synthetic Regional", 1);
    await press(f);
    expect(google.state.creates).toBe(3);
    const eventSheet = (await files(f)).find(file => file.eventId === regional)!.spreadsheetId;
    // Eight days after it ended (it ends two days after it starts), the event is out of the window.
    vi.setSystemTime(NOW + 11 * DAY);
    await f.t.run(ctx => ctx.db.patch(regional, { name: "Renamed Regional" }));
    google.state.calls.length = 0;
    const batches = google.state.batches.length;
    const run = await press(f);
    expect([run.pending, run.total]).toEqual([[], 2]);
    expect(google.state.batches.length).toBe(batches);
    expect(google.state.calls.some(call => call.includes(eventSheet))).toBe(false);
    const status = await f.coach.query(api.sheetExports.status, {});
    expect(eventFiles(status)).toEqual([expect.objectContaining({ eventId: regional, eventName: "Renamed Regional", current: false, name: "2026-11-13 Synthetic Regional" })]);
    expect(google.state.files.get(eventSheet)!.trashed).toBe(false);
  });

  it("drops an event file from a run when the event is canceled while the run is under way", async () => {
    enable(SHEET_REGISTRY.event.definition);
    const f = await fixture();
    const regional = await addEvent(f, "Synthetic Regional", 5);
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    await f.t.run(ctx => ctx.db.patch(regional, { cancelled: true }));
    expect(await finishRun(f)).toMatchObject({ state: "done", done: 2, total: 2, pending: [] });
    expect((await files(f)).some(file => file.eventId === regional)).toBe(false);
  });

  it("groups each event's files on one row and shows Fees to any Coach or Travel Lead, travel emergency only with Health access", async () => {
    enable(...kinds);
    const f = await fixture();
    const regional = await addEvent(f, "Synthetic Regional", 10);
    await press(f);
    expect((await files(f)).filter(file => file.eventId === regional).map(file => [file.kind, file.folderId, file.name])).toEqual([
      ["event", FOLDERS.events, "2026-11-22 Synthetic Regional"],
      ["eventFees", FOLDERS.money, "2026-11-22 Synthetic Regional - Fees"],
      ["eventTravelEmergency", FOLDERS.health, "2026-11-22 Synthetic Regional - Travel emergency"],
    ]);
    const seen = async (who: Fixture["coach"]) => (await who.query(api.sheetExports.status, {})).events.map(event => event.files.map(file => file.kind));
    expect(await seen(f.coach)).toEqual([["event", "eventFees", "eventTravelEmergency"]]);
    expect(await seen(f.lead)).toEqual([["event", "eventFees"]]);
    expect(await seen(f.parentAsLead)).toEqual([["event", "eventFees"]]);
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.app, { healthExport: true }));
    expect(await seen(f.lead)).toEqual([["event", "eventFees", "eventTravelEmergency"]]);
  });

  it("makes a travel emergency file only for events with team travel, an overnight stay or a permission form", async () => {
    enable(...kinds);
    const f = await fixture();
    const plain = { travel: "Provide your Own", overnight: false, permissionRequired: false };
    const local = await addEvent(f, "Local demo", 4, { ...plain, type: "Outreach" });
    const permission = await addEvent(f, "Museum visit", 5, { ...plain, type: "Outreach", permissionRequired: true });
    const bus = await addEvent(f, "Day competition", 6, { ...plain, travel: "Charter Bus" });
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const pending = (await latestRun(f))!.pending.filter(item => typeof item !== "string").map(item => [item.eventId, item.kind]);
    expect(pending).toEqual([
      [local, "event"], [local, "eventFees"],
      [permission, "event"], [permission, "eventFees"], [permission, "eventTravelEmergency"],
      [bus, "event"], [bus, "eventFees"], [bus, "eventTravelEmergency"],
    ]);
    await finishRun(f);
    expect((await f.coach.query(api.sheetExports.status, {})).events.map(event => event.files.length)).toEqual([2, 3, 3]);
    // The bus is canceled for a later update: the travel emergency file made already is frozen (kept, no longer written) and still listed.
    await f.t.run(ctx => ctx.db.patch(bus, { travel: "Provide your Own" }));
    const batches = google.state.batches.length;
    await press(f);
    expect(google.state.batches.length).toBe(batches);
    expect((await f.coach.query(api.sheetExports.status, {})).events.find(event => event.eventId === bus)!.files.map(file => file.kind)).toEqual(["event", "eventFees", "eventTravelEmergency"]);
  });

  it("lists an upcoming event before its first update as not made yet", async () => {
    enable(SHEET_REGISTRY.event.definition);
    const f = await fixture();
    await addEvent(f, "Synthetic Regional", 10);
    expect(eventFiles(await f.coach.query(api.sheetExports.status, {}))).toEqual([expect.objectContaining({ eventName: "Synthetic Regional", link: null, name: null, current: true })]);
  });

  it("writes at most 150 files in one update, soonest events first, and says how many were left", async () => {
    enable(SHEET_REGISTRY.event.definition);
    const f = await fixture();
    // 160 events, all within the next 60 days; the 12 furthest out don't fit (2 team files + 148 events = 150).
    await f.t.run(async ctx => {
      for (let index = 0; index < 160; index++) await ctx.db.insert("events", {
        seasonId: f.ids.season, name: `Event ${index}`, type: "Competition", startsAt: NOW + DAY + index * 3600_000 * 8, endsAt: NOW + DAY + index * 3600_000 * 8 + 3600_000, destination: "Synthetic Arena", travel: "Charter Bus",
        overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false,
      });
    });
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const run = (await latestRun(f))!;
    expect(run.pending).toHaveLength(150);
    expect(run.pending.slice(0, 2)).toEqual(["studentRoster", "shirtSizes"]);
    const names = await f.t.run(async ctx => Promise.all(run.pending.slice(2).map(async item => (await ctx.db.get((item as { eventId: Id<"events"> }).eventId))!.name)));
    expect([names[0], names.at(-1)]).toEqual(["Event 0", "Event 147"]);
    expect([run.total, run.skipped]).toEqual([150, 12]);
    expect((await f.coach.query(api.sheetExports.status, {})).run).toMatchObject({ total: 150, skipped: 12 });
  });
});

describe("a season switch while an update runs", () => {
  const archiveSeason = (f: Fixture) => f.t.run(async ctx => {
    await ctx.db.patch(f.ids.season, { status: "archived" });
    const run = await ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first();
    if (run?.state === "running") await ctx.db.patch(run._id, { state: "stopped", finishedAt: Date.now() });
  });

  it("stops a run whose season is no longer active at its next step and lets go of the hold", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    await f.t.run(ctx => ctx.db.patch(f.ids.season, { status: "archived" }));
    const run = (await latestRun(f))!;
    expect(await f.t.mutation(internal.sheetExports.claimNext, { runId: run._id })).toBeNull();
    const after = (await latestRun(f))!;
    expect(after.state).toBe("stopped");
    expect(after.leaseExpiresAt).toBeLessThanOrEqual(Date.now());
    expect(await f.t.query(internal.sheetExports.runCurrent, { runId: run._id })).toBe(false);
    expect(google.state.creates).toBe(0);
  });

  it("makes nothing when the season is archived just before a step would create its file, and closes the step at once", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    google.state.onToken = async () => { google.state.onToken = null; await archiveSeason(f); };
    await f.t.action(internal.sheetExportActions.runOne, { runId: (await latestRun(f))!._id });
    expect(google.state.creates).toBe(0);
    expect(await files(f)).toEqual([]);
    const run = (await latestRun(f))!;
    expect(run.state).toBe("stopped");
    expect(run.leaseExpiresAt).toBeLessThanOrEqual(Date.now());
  });

  it("records a file made just as the season was archived, so it is never left untracked in a live folder", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    google.state.onCreate = async () => { google.state.onCreate = null; await archiveSeason(f); };
    await f.t.action(internal.sheetExportActions.runOne, { runId: (await latestRun(f))!._id });
    expect(google.state.creates).toBe(1);
    const [made] = [...google.state.files.keys()];
    expect(await files(f)).toEqual([expect.objectContaining({ kind: "studentRoster", spreadsheetId: made, folderId: FOLDERS.general, frozen: false })]);
    expect(google.state.batches).toHaveLength(0);
    expect((await latestRun(f))!.leaseExpiresAt).toBeLessThanOrEqual(Date.now());
  });

  it("drops a file archived during a run and goes on with the next without waiting for the hold to run out", async () => {
    const f = await fixture();
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const run = (await latestRun(f))!;
    await f.t.mutation(internal.sheetExports.abandonStep, { runId: run._id, kind: "studentRoster" });
    expect(await latestRun(f)).toMatchObject({ state: "running", pending: ["shirtSizes"], total: 1 });
    await f.t.mutation(internal.sheetExports.abandonStep, { runId: run._id, kind: "shirtSizes" });
    expect(await latestRun(f)).toMatchObject({ state: "done", pending: [], total: 0 });
  });
});

describe("starting an update from the server", () => {
  it("starts a full update without a signed-in person, and refuses a second while it runs", async () => {
    const f = await fixture();
    expect(await f.t.mutation(internal.sheetExports.startNow, {})).toEqual({ status: "started" });
    expect(await latestRun(f)).toMatchObject({ trigger: "server", pending: ["studentRoster", "shirtSizes"] });
    expect((await latestRun(f))!.requestedBy).toBeUndefined();
    expect(await f.t.mutation(internal.sheetExports.startNow, {})).toEqual({ status: "alreadyUpdating" });
    expect(await finishRun(f)).toMatchObject({ state: "done", done: 2 });
  });
  it.each([["off", true], ["notSetUp", false]] as const)("answers %s with the same checks as the button", async (expected, settings) => {
    if (expected === "off") vi.stubEnv("GOOGLE_SHEETS_EXPORT_ENABLED", "false");
    const f = await fixture({ settings });
    expect(await f.t.mutation(internal.sheetExports.startNow, {})).toEqual({ status: expected });
    expect(await latestRun(f)).toBeNull();
  });
});
