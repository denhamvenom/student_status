import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureFolder, googleRetry, moveFile, renameFile } from "./googleSheets";

type Call = { method: string; url: URL; body: unknown };
/** A stand-in for Drive's folder endpoints; nothing here reaches Google. */
function fakeDrive(options: { existing?: string[]; createStatus?: number[] } = {}) {
  const calls: Call[] = [];
  const folders = [...(options.existing ?? [])];
  const createStatus = [...(options.createStatus ?? [])];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (method === "GET") return new Response(JSON.stringify({ files: folders.map(id => ({ id })) }), { status: 200 });
    if (method === "POST") {
      folders.push(`folder${folders.length + 1}`);
      const status = createStatus.shift() ?? 200;
      return new Response(status === 200 ? JSON.stringify({ id: folders.at(-1) }) : "{}", { status });
    }
    return new Response(JSON.stringify({ id: "file1" }), { status: 200 });
  });
  return { calls, folders, fetcher };
}

beforeEach(() => { googleRetry.delaysMs = [0, 0, 0]; });
afterEach(() => { vi.unstubAllGlobals(); googleRetry.delaysMs = [1000, 2000, 4000]; });

describe("ensureFolder", () => {
  it("returns the folder that is already there without making another", async () => {
    const drive = fakeDrive({ existing: ["archive2027"] });
    vi.stubGlobal("fetch", drive.fetcher);
    expect(await ensureFolder("t", { driveId: "drive1", parentId: "archiveRoot", name: "2027" })).toBe("archive2027");
    expect(drive.calls.map(call => call.method)).toEqual(["GET"]);
    const q = drive.calls[0].url.searchParams.get("q")!;
    expect(q).toContain("name='2027'");
    expect(q).toContain("'archiveRoot' in parents");
    expect(q).toContain("trashed=false");
    expect(q).toContain("mimeType='application/vnd.google-apps.folder'");
    expect(drive.calls[0].url.searchParams.get("supportsAllDrives")).toBe("true");
  });
  it("makes the folder in the parent when there is none", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", drive.fetcher);
    expect(await ensureFolder("t", { driveId: "drive1", parentId: "archiveRoot", name: "O'Neil 2027" })).toBe("folder1");
    const create = drive.calls.find(call => call.method === "POST")!;
    expect(create.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(create.body).toEqual({ name: "O'Neil 2027", mimeType: "application/vnd.google-apps.folder", parents: ["archiveRoot"] });
    expect(drive.calls[0].url.searchParams.get("q")).toContain("name='O\\'Neil 2027'");
  });
  it("finds the folder a failed create made instead of making a second one", async () => {
    const drive = fakeDrive({ createStatus: [503] });
    vi.stubGlobal("fetch", drive.fetcher);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await ensureFolder("t", { driveId: "drive1", parentId: "archiveRoot", name: "2027" })).toBe("folder1");
    expect(drive.calls.filter(call => call.method === "POST")).toHaveLength(1);
  });
});

describe("moveFile", () => {
  it("adds the new parent and removes the old one in the shared drive", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", drive.fetcher);
    await moveFile("t", { fileId: "sheet1", fromParentId: "general1", toParentId: "archive2027" });
    expect(drive.calls).toHaveLength(1);
    const [call] = drive.calls;
    expect(call.method).toBe("PATCH");
    expect(call.url.pathname).toBe("/drive/v3/files/sheet1");
    expect([call.url.searchParams.get("addParents"), call.url.searchParams.get("removeParents"), call.url.searchParams.get("supportsAllDrives")]).toEqual(["archive2027", "general1", "true"]);
  });
});

describe("renameFile", () => {
  it("sets only the name, in the shared drive", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", drive.fetcher);
    await renameFile("t", { fileId: "sheet1", name: "2027-03-06 Synthetic Regional" });
    expect(drive.calls).toHaveLength(1);
    const [call] = drive.calls;
    expect([call.method, call.url.pathname, call.url.searchParams.get("supportsAllDrives"), call.url.searchParams.get("addParents")]).toEqual(["PATCH", "/drive/v3/files/sheet1", "true", null]);
    expect(call.body).toEqual({ name: "2027-03-06 Synthetic Regional" });
  });
});
