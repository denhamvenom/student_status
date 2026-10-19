import { SignJWT, importPKCS8 } from "jose";

const scope = "https://www.googleapis.com/auth/calendar.readonly";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

export async function serviceToken(email: string, privateKey: string, requestedScope = scope): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: requestedScope }).setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email).setAudience(tokenEndpoint).setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const response = await fetch(tokenEndpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error(`Calendar token request failed (${response.status})`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("access_token" in body) || typeof body.access_token !== "string") throw new Error("Calendar token response was invalid");
  return body.access_token;
}

export async function hashId(id: string) {
  const bytes = new TextEncoder().encode(id);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join("");
}
