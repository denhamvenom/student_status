import type { Doc } from "../_generated/dataModel";
import { env, type MutationCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { RateLimiter } from "@convex-dev/rate-limiter";

const limiter = new RateLimiter(components.rateLimiter, {
  pinFailures: { kind: "fixed window", rate: 5, period: 60_000 },
});

export type PinResult = { ok: true } | { ok: false; reason: "invalid" | "rate_limited" | "unconfigured" };

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function verifyTimeclockPin(ctx: MutationCtx, actor: Doc<"appUsers">, pin: string): Promise<PinResult> {
  const expected = env.TIMECLOCK_OPERATOR_PIN;
  if (!expected) return { ok: false, reason: "unconfigured" };
  const key = actor._id;
  if (!(await limiter.check(ctx, "pinFailures", { key })).ok) return { ok: false, reason: "rate_limited" };
  // Compare digests in fixed time without echoing either value in errors or logs.
  const [a, b] = await Promise.all([sha256(pin.slice(0, 128)), sha256(expected)]);
  let mismatch = pin.length > 128 ? 1 : 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  if (!mismatch) return { ok: true };
  const failure = await limiter.limit(ctx, "pinFailures", { key });
  return { ok: false, reason: failure.ok ? "invalid" : "rate_limited" };
}
