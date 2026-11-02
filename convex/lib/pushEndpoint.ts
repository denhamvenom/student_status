/** Web Push endpoints are fetched by the server, so only the known push services over HTTPS are allowed (SSRF guard). */
const EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const SUFFIX_HOSTS = [".push.apple.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some(suffix => host.length > suffix.length && host.endsWith(suffix));
}
