const ID = /^[A-Za-z0-9_-]{10,100}$/;

/** Pulls a Drive folder ID out of a pasted folder link, or accepts a bare ID. Returns null when it is neither (or is absurdly long). */
export function parseDriveFolderId(input: string): string | null {
  const text = input.trim();
  if (!text || text.length > 2000) return null;
  if (ID.test(text)) return text;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com") return null;
  const path = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (path) return ID.test(path[1]) ? path[1] : null;
  const open = url.searchParams.get("id");
  if (url.pathname.startsWith("/open") && open && ID.test(open)) return open;
  return null;
}
