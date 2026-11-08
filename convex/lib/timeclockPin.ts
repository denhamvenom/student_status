import type { Doc } from "../_generated/dataModel";
import { env, type MutationCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { RateLimiter } from "@convex-dev/rate-limiter";

/** Wrong-PIN limits: per operator account, plus one team-wide limit because every operator shares the same PIN. */
export const PIN_FAILURES_PER_ACCOUNT = 5;
export const PIN_FAILURES_PER_TEAM = 30;
const limiter = new RateLimiter(components.rateLimiter, {
  pinFailures: { kind: "fixed window", rate: PIN_FAILURES_PER_ACCOUNT, period: 60_000 },
  pinFailuresTeam: { kind: "fixed window", rate: PIN_FAILURES_PER_TEAM, period: 60_000 },
});
const TEAM_KEY = "team";

export type PinResult = { ok: true } | { ok: false; reason: "invalid" | "rate_limited" | "unconfigured" };

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Every Timeclock PIN check goes through here, so both limits apply to every PIN-protected action. */
export async function verifyTimeclockPin(ctx: MutationCtx, actor: Doc<"appUsers">, pin: string): Promise<PinResult> {
  const expected = env.TIMECLOCK_OPERATOR_PIN;
  if (!expected) return { ok: false, reason: "unconfigured" };
  const key = actor._id;
  if (!(await limiter.check(ctx, "pinFailures", { key })).ok || !(await limiter.check(ctx, "pinFailuresTeam", { key: TEAM_KEY })).ok) return { ok: false, reason: "rate_limited" };
  // Compare digests in fixed time without echoing either value in errors or logs.
  const [a, b] = await Promise.all([sha256(pin.slice(0, 128)), sha256(expected)]);
  let mismatch = pin.length > 128 ? 1 : 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  if (!mismatch) return { ok: true };
  const account = await limiter.limit(ctx, "pinFailures", { key });
  const team = await limiter.limit(ctx, "pinFailuresTeam", { key: TEAM_KEY });
  return { ok: false, reason: account.ok && team.ok ? "invalid" : "rate_limited" };
}
