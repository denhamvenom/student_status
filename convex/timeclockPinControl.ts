import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole, viewer } from "./lib/access";
import { verifyTimeclockPin } from "./lib/timeclockPin";

/** Gate only the app's sign-out control; auth token revocation remains available. */
export const authorizeSignOutControl = mutation({
  args: { pin: v.string() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), code: v.union(v.literal("PIN_INVALID"), v.literal("PIN_RATE_LIMITED"), v.literal("PIN_UNCONFIGURED")) })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    requireRole(actor, "coach", "mentor");
    const result = await verifyTimeclockPin(ctx, actor, args.pin);
    if (result.ok) return { ok: true as const };
    return { ok: false as const, code: result.reason === "unconfigured" ? "PIN_UNCONFIGURED" as const : result.reason === "rate_limited" ? "PIN_RATE_LIMITED" as const : "PIN_INVALID" as const };
  },
});
