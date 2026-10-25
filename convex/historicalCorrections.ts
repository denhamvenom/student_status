import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { audit, requireRole, viewer } from "./lib/access";
import { assertIdempotencyKey } from "./lib/timeclock";
import { applyIntervalCorrection, intervalCorrectionArgs } from "./timeclock";

export const sessions = query({
  args: { seasonId: v.id("seasons"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ id: v.id("timeclockSessions"), title: v.string(), start: v.number(), end: v.number(), revision: v.number(), state: v.string() })),
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    if ((await ctx.db.get(args.seasonId))?.status !== "archived") throw new ConvexError("Only past seasons can be corrected here. Choose a past season.");
    if (args.paginationOpts.numItems > 20) throw new ConvexError("Up to 20 meetings can be shown at a time. Reload the list and try again.");
    const page = await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_scheduledStart", q => q.eq("seasonId", args.seasonId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map(async row => ({ id: row._id, title: (await ctx.db.get(row.occurrenceId))?.title ?? "Past meeting", start: row.scheduledStart, end: row.effectiveEnd, revision: row.revision, state: row.state }))) };
  },
});

export const open = mutation({
  args: { seasonId: v.id("seasons"), reason: v.string(), acknowledged: v.boolean() },
  returns: v.object({ id: v.id("historicalCorrectionSessions"), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const season = await ctx.db.get(args.seasonId);
    const reason = args.reason.trim();
    if (season?.status !== "archived" || !args.acknowledged || reason.length < 8 || reason.length > 500) throw new ConvexError("Choose a past season, confirm the correction warning and enter a reason of 8 to 500 characters.");
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000;
    const id = await ctx.db.insert("historicalCorrectionSessions", { seasonId: season._id, actorId: actor._id, reason, openedAt: now, expiresAt });
    await audit(ctx, actor, "season", season._id, "historicalCorrectionOpened", null, { correctionSessionId: id, expiresAt }, reason);
    return { id, expiresAt };
  },
});

export async function requireHistoricalCorrection(ctx: MutationCtx, id: Id<"historicalCorrectionSessions">) {
  const actor = await viewer(ctx); requireRole(actor, "coach");
  const grant = await ctx.db.get(id);
  if (!grant || grant.actorId !== actor._id || grant.closedAt !== undefined || grant.expiresAt <= Date.now()) throw new ConvexError("Correction mode has ended. Choose Open correction mode to start again.");
  const season = await ctx.db.get(grant.seasonId);
  if (season?.status !== "archived") throw new ConvexError("Only past seasons can be corrected here. Choose a past season.");
  return { actor, grant };
}

export const close = mutation({
  args: { correctionSessionId: v.id("historicalCorrectionSessions") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const grant = await ctx.db.get(args.correctionSessionId);
    if (!grant || grant.actorId !== actor._id) throw new ConvexError("Another Coach opened this correction mode. Only they can close it.");
    if (grant.closedAt === undefined) await ctx.db.patch(grant._id, { closedAt: Date.now() });
    return null;
  },
});

export const correctAttendance = mutation({
  args: { ...intervalCorrectionArgs, correctionSessionId: v.id("historicalCorrectionSessions"), expectedRevision: v.number() },
  returns: v.object({ correctionId: v.id("timeclockCorrections") }),
  handler: async (ctx, args) => {
    const { actor, grant } = await requireHistoricalCorrection(ctx, args.correctionSessionId);
    assertIdempotencyKey(args.key);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.seasonId !== grant.seasonId || session.state === "open") throw new ConvexError("Choose a finished meeting from this past season.");
    const fingerprint = JSON.stringify(["historicalAttendance", args]);
    const prior = await ctx.db.query("timeclockCommands").withIndex("by_actorId_and_key", q => q.eq("actorId", actor._id).eq("key", args.key)).unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ConvexError("This correction was already sent with different details. Reload to see the latest, then try again.");
      return JSON.parse(prior.resultJson) as { correctionId: Id<"timeclockCorrections"> };
    }
    if (session.revision !== args.expectedRevision) throw new ConvexError("This meeting changed since you opened it. Reload to see the latest, then try again.");
    await ctx.db.patch(session._id, { revision: session.revision + 1 });
    const result = await applyIntervalCorrection(ctx, actor, args);
    if (!result.ok || !result.correctionId) throw new Error(result.code ?? "Correction could not be saved.");
    const receipt = { correctionId: result.correctionId };
    await ctx.db.insert("timeclockCommands", { actorId: actor._id, key: args.key, fingerprint, resultJson: JSON.stringify(receipt), at: Date.now() });
    await audit(ctx, actor, "timeclockSession", session._id, "historicalAttendanceCorrected", { revision: session.revision }, { ...receipt, correctionSessionId: grant._id, revision: session.revision + 1 }, args.reason);
    return receipt;
  },
});
