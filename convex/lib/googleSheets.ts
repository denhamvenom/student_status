import { safeCell, type SheetTab } from "./sheetRows";

/**
 * Narrowest scopes that work (verified against live Google): writing needs Drive (create files in the shared drive); the Sheets API
 * accepts the Drive scope for spreadsheets.get and spreadsheets.batchUpdate, so the separate Sheets scope is not requested. The setup check only reads names,
 * parents and permissions, so it uses the metadata-only scope.
 */
export const WRITE_SCOPE = "https://www.googleapis.com/auth/drive";
export const CHECK_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
const DRIVE = "https://www.googleapis.com/drive/v3";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const SPREADSHEET_TYPE = "application/vnd.google-apps.spreadsheet";
const FOLDER_TYPE = "application/vnd.google-apps.folder";
export const APP_KEY_PROPERTY = "venomStatusKey";
/** Bump when the way tabs are laid out or formatted changes, so every file is rewritten once even if its data is unchanged. */
export const LAYOUT_VERSION = 2;

/** Waits before each retry of a busy or failing Google request, and how long one request may take. Tests shorten both. */
export const googleRetry = { delaysMs: [1000, 2000, 4000], timeoutMs: 30_000 };

export class GoogleRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "GoogleRequestError"; }
}
const retryable = (status: number) => status === 429 || status >= 500;
const sleep = async (ms: number) => { if (ms > 0) await new Promise<void>(resolve => setTimeout(resolve, ms)); };

type Init = { method?: string; body?: unknown; write?: boolean; fn?: string };

/** Google's own reason codes and message from an error answer (never the request, headers or token). */
function googleReasons(data: unknown): { reasons: string[]; googleStatus: string | null; message: string | null } {
  const error = obj(obj(data).error);
  const errors = Array.isArray(error.errors) ? error.errors : [];
  return { reasons: errors.map(item => String(obj(item).reason ?? "")).filter(Boolean), googleStatus: typeof error.status === "string" ? error.status : null, message: typeof error.message === "string" ? error.message.slice(0, 200) : null };
}
/** Logs one failed Google request in the server log: which function, the HTTP status and Google's reason. Nothing secret. */
function warnFailure(fn: string | undefined, status: number, data: unknown) {
  console.warn("Google request failed", { fn: fn ?? "unknown", status, ...googleReasons(data) });
}

/** One attempt with a time limit. A stalled or dropped request ends as null. */
async function once(token: string, url: string, init: Init = {}): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), googleRetry.timeoutMs);
  try {
    return await fetch(url, { method: init.method ?? "GET", headers: { authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "content-type": "application/json" }) }, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: controller.signal });
  } catch { return null; } finally { clearTimeout(timer); }
}

/**
 * One Google request. Reads retry up to three times on a busy (429) or failing (5xx) answer or a dropped connection. A write
 * (`write: true`) is retried only on 429, which proves Google applied nothing; after a timeout, a dropped connection or a 5xx it may
 * have applied, so it is not repeated (the next update re-reads the file and redoes it safely).
 */
export async function googleJson(token: string, url: string, init: Init = {}): Promise<{ status: number; data: unknown }> {
  for (let attempt = 0; ; attempt++) {
    const response = await once(token, url, init);
    let lastData: unknown = null;
    // A 403 that names a rate limit means "busy", not "no access"; Google applied nothing, so it is treated like 429.
    let busy = response?.status === 429;
    if (response?.status === 403) {
      const data: unknown = await response.json().catch(() => null);
      if (!isRateLimited(data)) return { status: 403, data };
      busy = true; lastData = data;
    } else if (response && !retryable(response.status)) {
      const data: unknown = await response.json().catch(() => null);
      return { status: response.status, data };
    }
    const safeToRepeat = !init.write || busy;
    if (!safeToRepeat || attempt >= googleRetry.delaysMs.length) {
      const status = busy ? 429 : response?.status ?? 0;
      warnFailure(init.fn, status, lastData);
      throw new GoogleRequestError(status, `Google request failed (${status || "no answer"})`);
    }
    await sleep(googleRetry.delaysMs[attempt]);
  }
}

const RATE_REASONS = ["userRateLimitExceeded", "rateLimitExceeded", "sharingRateLimitExceeded"];
function isRateLimited(data: unknown): boolean {
  const error = obj(obj(data).error);
  const errors = Array.isArray(error.errors) ? error.errors : [];
  return errors.some(item => RATE_REASONS.includes(String(obj(item).reason))) || error.status === "RESOURCE_EXHAUSTED";
}

function ok(result: { status: number; data: unknown }, fn: string): unknown {
  if (result.status < 200 || result.status >= 300) {
    warnFailure(fn, result.status, result.data);
    throw new GoogleRequestError(result.status, `Google request failed (${result.status})`);
  }
  return result.data;
}
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export type FolderCheck = { id: string; name: string; isFolder: boolean; driveId: string | null; canAddChildren: boolean; parents: string[] };

/** Reads one folder for the setup check. A folder the service account cannot see answers 404. */
export async function driveGetFolder(token: string, id: string): Promise<FolderCheck | null> {
  const url = `${DRIVE}/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${encodeURIComponent("id,name,mimeType,driveId,parents,capabilities(canAddChildren)")}`;
  const result = await googleJson(token, url, { fn: "driveGetFolder" });
  if (result.status === 404 || result.status === 403) return null;
  const data = obj(ok(result, "driveGetFolder"));
  return { id: String(data.id ?? id), name: String(data.name ?? ""), isFolder: data.mimeType === FOLDER_TYPE, driveId: typeof data.driveId === "string" ? data.driveId : null, canAddChildren: obj(data.capabilities).canAddChildren === true, parents: strings(data.parents) };
}

const MAX_DEPTH = 30;
/** The folders above this one, nearest first, up to (not including) the shared drive itself. A folder that cannot be read ends the chain. */
export async function driveAncestors(token: string, folder: FolderCheck): Promise<string[]> {
  const chain: string[] = [];
  let current: FolderCheck | null = folder;
  for (let depth = 0; depth < MAX_DEPTH && current; depth++) {
    const parent: string | undefined = current.parents[0];
    if (!parent || parent === folder.driveId || chain.includes(parent)) break;
    chain.push(parent);
    current = await driveGetFolder(token, parent);
  }
  return chain;
}

const quote = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Finds the spreadsheet already made for this key inside this folder (a save may have been lost after the file was made). */
export async function findByKey(token: string, driveId: string, folderId: string, key: string): Promise<string | null> {
  const q = `appProperties has { key='${APP_KEY_PROPERTY}' and value='${quote(key)}' } and '${quote(folderId)}' in parents and trashed=false and mimeType='${SPREADSHEET_TYPE}'`;
  const params = new URLSearchParams({ q, corpora: "drive", driveId, includeItemsFromAllDrives: "true", supportsAllDrives: "true", fields: "files(id)", pageSize: "10" });
  const data = obj(ok(await googleJson(token, `${DRIVE}/files?${params}`, { fn: "findByKey" }), "findByKey"));
  const files = Array.isArray(data.files) ? data.files : [];
  const first = obj(files[0]).id;
  return typeof first === "string" ? first : null;
}

export type FileState = "ok" | "missing" | "moved";

/** Whether the stored file still exists, is not in the trash, and is still in the configured folder. */
export async function driveFileState(token: string, id: string, folderId: string): Promise<FileState> {
  const result = await googleJson(token, `${DRIVE}/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,trashed,parents`, { fn: "driveFileState" });
  if (result.status === 404) return "missing";
  const data = obj(ok(result, "driveFileState"));
  if (data.trashed === true) return "missing";
  return strings(data.parents).includes(folderId) ? "ok" : "moved";
}

/**
 * Makes the spreadsheet in its folder, tagged with its stable key. Drive refuses a caller-chosen file ID for Google Sheets files
 * (`generatedIdNotSupported`, verified against live Google), so Google picks the ID. A create that failed without a clear answer
 * (timeout, dropped connection, 5xx) may still have made the file, so before each repeat the folder is searched by key, with short
 * waits for Drive's search to catch up; only when nothing turns up is another create sent.
 */
export async function createSpreadsheet(token: string, args: { name: string; driveId: string; folderId: string; key: string }): Promise<string> {
  const body = { name: args.name, mimeType: SPREADSHEET_TYPE, parents: [args.folderId], appProperties: { [APP_KEY_PROPERTY]: args.key } };
  let last: GoogleRequestError | null = null;
  for (let attempt = 0; attempt <= googleRetry.delaysMs.length; attempt++) {
    if (attempt > 0) {
      for (const delay of [...googleRetry.delaysMs, 0]) {
        await sleep(delay);
        const found = await findByKey(token, args.driveId, args.folderId, args.key);
        if (found) return found;
      }
    }
    const response = await once(token, `${DRIVE}/files?supportsAllDrives=true&fields=id`, { method: "POST", body });
    if (response?.ok) {
      const id = obj(await response.json().catch(() => null)).id;
      if (typeof id === "string" && id) return id;
      // An answer without an ID: the file may exist, so look for it by key before anything else.
      last = new GoogleRequestError(0, "Google request failed (no id)");
      continue;
    }
    if (response && !retryable(response.status)) {
      warnFailure("createSpreadsheet", response.status, await response.json().catch(() => null));
      throw new GoogleRequestError(response.status, `Google request failed (${response.status})`);
    }
    last = new GoogleRequestError(response?.status ?? 0, `Google request failed (${response?.status ?? "no answer"})`);
  }
  warnFailure("createSpreadsheet", last?.status ?? 0, null);
  throw last ?? new GoogleRequestError(0, "Google request failed");
}

export type SheetInfo = { sheetId: number; title: string; protected: boolean };

/** The tabs of a spreadsheet, or null when it no longer exists. */
export async function getSheets(token: string, id: string): Promise<SheetInfo[] | null> {
  const fields = encodeURIComponent("sheets(properties(sheetId,title),protectedRanges(protectedRangeId))");
  const result = await googleJson(token, `${SHEETS}/${encodeURIComponent(id)}?fields=${fields}`, { fn: "getSheets" });
  if (result.status === 404) return null;
  const sheets = obj(ok(result, "getSheets")).sheets;
  return (Array.isArray(sheets) ? sheets : []).map(sheet => {
    const properties = obj(obj(sheet).properties);
    const ranges = obj(sheet).protectedRanges;
    return { sheetId: Number(properties.sheetId ?? 0), title: String(properties.title ?? ""), protected: Array.isArray(ranges) && ranges.length > 0 };
  });
}

export const HEADER_ROW = 1;
const cell = (value: string | number) => { const safe = safeCell(value); return { userEnteredValue: typeof safe === "number" ? { numberValue: safe } : { stringValue: safe } }; };
const stamp = (at: number) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(at).replace(/\s+/g, " ");
export const updateNote = (at: number) => `Updated ${stamp(at)} Central Time by Venom Status. Don't type changes here. They're replaced at the next update. Make changes in Venom Status.`;

/**
 * One batchUpdate for a whole file: add or rename tabs, clear and rewrite every tab, freeze the note and header rows, add a
 * warning-only protection once, and delete tabs Venom Status no longer produces. Built from what the file holds right now, so
 * it never adds a tab or protection that is already there. Text is always sent as text, never as a formula.
 */
export function buildBatch(tabs: readonly SheetTab[], existing: readonly SheetInfo[], at: number): { requests: unknown[]; tabs: { title: string; sheetId: number }[] } {
  const requests: unknown[] = [];
  const result: { title: string; sheetId: number }[] = [];
  const wanted = new Set(tabs.map(tab => tab.title));
  let spare = existing.length === 1 && !wanted.has(existing[0].title) && /^Sheet\d+$/.test(existing[0].title) ? existing[0] : null;
  const keep = new Set<number>();
  let nextId = Math.max(0, ...existing.map(sheet => sheet.sheetId)) + 1;
  for (const tab of tabs) {
    const found = existing.find(sheet => sheet.title === tab.title);
    let sheetId: number;
    let alreadyProtected = false;
    if (found) { sheetId = found.sheetId; alreadyProtected = found.protected; }
    else if (spare) {
      sheetId = spare.sheetId; alreadyProtected = spare.protected; spare = null;
      requests.push({ updateSheetProperties: { properties: { sheetId, title: tab.title }, fields: "title" } });
    } else {
      sheetId = nextId++;
      requests.push({ addSheet: { properties: { sheetId, title: tab.title } } });
    }
    keep.add(sheetId);
    result.push({ title: tab.title, sheetId });
    const columns = Math.max(1, ...tab.rows.map(row => row.length));
    const all = [[updateNote(at)], ...tab.rows];
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: Math.max(all.length + 10, 30), columnCount: Math.max(columns, 4), frozenRowCount: HEADER_ROW + 1 } }, fields: "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount" } });
    requests.push({ updateCells: { range: { sheetId }, fields: "userEnteredValue,userEnteredFormat" } });
    requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, fields: "userEnteredValue,userEnteredFormat.textFormat", rows: all.map((row, index) => ({ values: row.map(value => ({ ...cell(value), ...(index === 0 ? { userEnteredFormat: { textFormat: { italic: true } } } : index === HEADER_ROW ? { userEnteredFormat: { textFormat: { bold: true } } } : {}) })) })) } });
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: Math.max(columns, 4) }, properties: { pixelSize: 170 }, fields: "pixelSize" } });
    if (!alreadyProtected) requests.push({ addProtectedRange: { protectedRange: { range: { sheetId }, description: "Venom Status replaces this tab at every update.", warningOnly: true } } });
  }
  // Tabs Venom Status no longer produces go last, so the file never has zero tabs.
  for (const sheet of existing) if (!keep.has(sheet.sheetId)) requests.push({ deleteSheet: { sheetId: sheet.sheetId } });
  return { requests, tabs: result };
}

export async function batchUpdate(token: string, id: string, requests: unknown[]): Promise<void> {
  ok(await googleJson(token, `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, { method: "POST", body: { requests }, write: true, fn: "batchUpdate" }), "batchUpdate");
}

export const spreadsheetLink = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

/**
 * The non-trashed folder called `name` directly inside `parentId`, made when there is none (for the season archive, e.g. Archive/2027).
 * When Drive holds several with that name, the first one found is used. A create that ends without a clear answer is looked up again
 * before it is repeated, so no second folder is made. Returns the folder ID.
 */
export async function ensureFolder(token: string, args: { driveId: string; parentId: string; name: string }): Promise<string> {
  const find = async () => {
    const q = `name='${quote(args.name)}' and '${quote(args.parentId)}' in parents and trashed=false and mimeType='${FOLDER_TYPE}'`;
    const params = new URLSearchParams({ q, corpora: "drive", driveId: args.driveId, includeItemsFromAllDrives: "true", supportsAllDrives: "true", fields: "files(id)", pageSize: "10" });
    const data = obj(ok(await googleJson(token, `${DRIVE}/files?${params}`, { fn: "ensureFolder" }), "ensureFolder"));
    const first = obj((Array.isArray(data.files) ? data.files : [])[0]).id;
    return typeof first === "string" ? first : null;
  };
  const found = await find();
  if (found) return found;
  const result = await googleJson(token, `${DRIVE}/files?supportsAllDrives=true&fields=id`, { method: "POST", body: { name: args.name, mimeType: FOLDER_TYPE, parents: [args.parentId] }, write: true, fn: "ensureFolder" }).catch(async (error: unknown) => {
    // The create may have been applied before the answer was lost: look again before giving up.
    const again = await find();
    if (again) return { status: 200, data: { id: again } };
    throw error;
  });
  const id = obj(ok(result, "ensureFolder")).id;
  if (typeof id === "string" && id) return id;
  const again = await find();
  if (again) return again;
  throw new GoogleRequestError(0, "Google request failed (no id)");
}

/** Moves a file (or folder) from one folder to another inside the shared drive. Treated as a write: repeated only on a busy (429) answer. */
export async function moveFile(token: string, args: { fileId: string; fromParentId: string; toParentId: string }): Promise<void> {
  const params = new URLSearchParams({ addParents: args.toParentId, removeParents: args.fromParentId, supportsAllDrives: "true", fields: "id,parents" });
  ok(await googleJson(token, `${DRIVE}/files/${encodeURIComponent(args.fileId)}?${params}`, { method: "PATCH", body: {}, write: true, fn: "moveFile" }), "moveFile");
}
