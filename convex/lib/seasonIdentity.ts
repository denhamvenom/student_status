import { ConvexError } from 'convex/values';
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { activeSeason, requireRole, viewer } from "./access";

type Ctx = QueryCtx | MutationCtx;

/** Resolve only the signed-in student's active-season profile, even if older profiles share the account. */
export async function currentSeasonOwnStudent(ctx: Ctx): Promise<Doc<"students">> {
  const actor = await viewer(ctx);
  requireRole(actor, "student");
  const season = await activeSeason(ctx);
  const student = await ctx.db.query("students").withIndex("by_seasonId_and_userId", q => q.eq("seasonId", season._id).eq("userId", actor._id)).unique();
  if (!student?.active) throw new ConvexError("No active student profile is linked to this account in the active season.");
  return student;
}
