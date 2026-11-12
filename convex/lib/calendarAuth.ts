import { GoogleTokenError, googleServiceToken } from "./googleAuth";

const scope = "https://www.googleapis.com/auth/calendar.readonly";

/** Calendar's service token; keeps the Calendar-specific error wording that refreshCalendar recognizes. */
export async function serviceToken(email: string, privateKey: string, requestedScope = scope): Promise<string> {
  try {
    return await googleServiceToken(email, privateKey, requestedScope);
  } catch (error) {
    if (error instanceof GoogleTokenError) throw new Error(error.status ? `Calendar token request failed (${error.status})` : "Calendar token response was invalid", { cause: error });
    throw error;
  }
}

export async function hashId(id: string) {
  const bytes = new TextEncoder().encode(id);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join("");
}
