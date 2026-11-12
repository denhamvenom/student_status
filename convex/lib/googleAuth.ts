import { SignJWT, importPKCS8 } from "jose";

const tokenEndpoint = "https://oauth2.googleapis.com/token";
const TOKEN_TIMEOUT_MS = 30_000;

/** A failed Google token request. `status` is the HTTP status, or 0 when the response was unusable. */
export class GoogleTokenError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "GoogleTokenError"; }
}

/** The service account's private key could not be read (missing line breaks, truncated or pasted wrongly). Nothing was sent to Google. */
export class GoogleKeyError extends Error {
  constructor() { super("The service account private key could not be read"); this.name = "GoogleKeyError"; }
}

/**
 * Signs a service-account assertion and exchanges it for an access token. Shared by every Google integration
 * (Calendar reading, spreadsheet writing); callers map the neutral errors to their own wording.
 */
export async function googleServiceToken(email: string, privateKey: string, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let assertion: string;
  try {
    const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "RS256");
    assertion = await new SignJWT({ scope }).setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(email).setAudience(tokenEndpoint).setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  } catch { throw new GoogleKeyError(); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const response = await fetch(tokenEndpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: controller.signal });
    if (!response.ok) throw new GoogleTokenError(response.status, `Google token request failed (${response.status})`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("access_token" in body) || typeof body.access_token !== "string") throw new GoogleTokenError(0, "Google token response was invalid");
    return body.access_token;
  } finally { clearTimeout(timer); }
}
