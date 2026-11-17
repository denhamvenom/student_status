import { env } from "../_generated/server";
import { newToken, tokenHash } from "./invitationIdentity";

// Adult and parent invite links are derived, not stored:
//   token = hex(HMAC-SHA256(INVITE_TOKEN_SECRET, "kind:inviteId:issuedAt:tokenNonce")).
// tokenNonce is 128 random bits kept only on the invite row and never returned by a query, so the inviter (who can
// see the id and times) cannot compute the link even if the secret leaks.
// The row keeps only tokenHash (as before) and the email job carries only the invite id and that hash, so no raw
// token sits in _scheduled_functions args. The send action re-derives the token to build the link.
// Hex (64 chars) keeps the link format the accept/preview checks and the frontend already expect.
//
// Without INVITE_TOKEN_SECRET (or with one shorter than 32 characters) everything falls back to the earlier behaviour:
// a random token, passed raw to the email job. Each call that hits the fallback logs a warning.
// Changing the secret invalidates links whose email has not been sent yet (the job fails safely and the invite can be
// resent); links already emailed keep working because acceptance only compares the stored hash. After a secret leak,
// rotate the secret and revoke or resend every pending invite.
export type InviteTokenKind = "adult" | "parent";
const MIN_SECRET_LENGTH = 32;

// Declared optional in convex.config.ts. The widened type only covers _generated/server.d.ts until the next codegen.
const appEnv: typeof env & { readonly INVITE_TOKEN_SECRET?: string } = env;
export function inviteTokenSecret(): string | null {
  const secret = appEnv.INVITE_TOKEN_SECRET?.trim();
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  console.warn(secret
    ? `INVITE_TOKEN_SECRET is shorter than ${MIN_SECRET_LENGTH} characters, so invite links fall back to random tokens passed to the email job.`
    : "INVITE_TOKEN_SECRET is not set, so invite links fall back to random tokens passed to the email job.");
  return null;
}

export async function deriveInviteToken(secret: string, kind: InviteTokenKind, inviteId: string, version: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${kind}:${inviteId}:${version}`));
  return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, "0")).join("");
}

// The version must change exactly when a new link is issued and never on retries of the same issue.
// Adult resend rewrites emailQueuedAt and tokenNonce, so it rotates the link; parent resend makes a new row.
const tokenVersion = (issuedAt: number, tokenNonce: string | undefined) => `${issuedAt}:${tokenNonce ?? ""}`;
export const adultInviteTokenVersion = (row: { emailQueuedAt?: number; createdAt: number; tokenNonce?: string }) => tokenVersion(row.emailQueuedAt ?? row.createdAt, row.tokenNonce);
export const parentInviteTokenVersion = (row: { createdAt: number; tokenNonce?: string }) => tokenVersion(row.createdAt, row.tokenNonce);
function newTokenNonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

// Stored briefly before the real hash is known (the derived token needs the row id); never a valid SHA-256 hex.
export const pendingTokenHash = () => `pending:${crypto.randomUUID()}`;

export type InviteJobRef = { token: string } | { hash: string };
/** Issues a link for a saved invite: the fields to store on the row and what the email job may carry. */
export async function issueInviteToken(secret: string | null, kind: InviteTokenKind, inviteId: string, issuedAt: number): Promise<{ stored: { tokenHash: string; tokenNonce: string | undefined }; job: InviteJobRef }> {
  if (!secret) {
    const token = newToken();
    return { stored: { tokenHash: await tokenHash(token), tokenNonce: undefined }, job: { token } };
  }
  const tokenNonce = newTokenNonce();
  const hash = await tokenHash(await deriveInviteToken(secret, kind, inviteId, tokenVersion(issuedAt, tokenNonce)));
  return { stored: { tokenHash: hash, tokenNonce }, job: { hash } };
}

/** The issue hash an email job refers to: legacy jobs carry the raw token, new ones only its hash. */
export async function jobHash(args: { token?: string; hash?: string }) {
  return args.token !== undefined ? await tokenHash(args.token) : args.hash ?? null;
}

/** The raw token for the link: the legacy arg, or re-derived and checked against the issue hash. */
export async function jobToken(args: { token?: string }, kind: InviteTokenKind, inviteId: string, version: string, hash: string) {
  if (args.token !== undefined) return args.token;
  const secret = inviteTokenSecret();
  if (!secret) return null;
  const token = await deriveInviteToken(secret, kind, inviteId, version);
  if (await tokenHash(token) === hash) return token;
  console.error(`The ${kind} invite link could not be rebuilt because INVITE_TOKEN_SECRET changed after it was queued. Resend the invitation.`);
  return null;
}
