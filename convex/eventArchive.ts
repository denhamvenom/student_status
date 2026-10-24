import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { viewer } from "./lib/access";

/** Mutate only event visibility. Participation, requirements and money remain intact. */
export const sweep = internalMutation({
  args: {}, returns: v.number(),
  handler: async ctx => {
    const rows = await ctx.db.query("events").withIndex("by_archived_and_endsAt", q => q.eq("archived", false).lte("endsAt", Date.now())).take(100);
    for (const event of rows) await ctx.db.patch(event._id, { archived: true });
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.eventArchive.sweep, {});
    return rows.length;
  },
});

export const atEnd = internalMutation({
  args: { eventId: v.id("events"), endsAt: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    // A Calendar change can leave an earlier scheduled callback behind.
    if (event && !event.archived && event.endsAt === args.endsAt && event.endsAt <= Date.now()) await ctx.db.patch(event._id, { archived: true });
    return null;
  },
});

export async function scheduleEventArchive(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event || event.archived) return;
  await ctx.scheduler.runAt(Math.max(Date.now(), event.endsAt), internal.eventArchive.atEnd, { eventId, endsAt: event.endsAt });
}

function staff(user: Awaited<ReturnType<typeof viewer>>) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Archived events are available to Coaches and Travel Leads only.");
}

export const page = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("events").extend({ seasonName: v.string() })),
  handler: async (ctx, args) => {
    staff(await viewer(ctx));
    const result = await ctx.db.query("events").withIndex("by_archived_and_endsAt", q => q.eq("archived", true)).order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async event => ({ ...event, seasonName: (await ctx.db.get(event.seasonId))?.name ?? "Prior season" })));
    return { ...result, page };
  },
});

const participant = v.object({ studentId: v.id("students"), name: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")) });
export const detail = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: v.object({ event: schema.doc("events"), seasonName: v.string(), requirements: v.array(schema.doc("requirements")), participants: paginationResultValidator(participant) }),
  handler: async (ctx, args) => {
    staff(await viewer(ctx));
    const event = await ctx.db.get(args.eventId);
    if (!event || !event.archived) throw new ConvexError("Archived event not found.");
    const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
    const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).paginate(args.paginationOpts);
    const page = await Promise.all(rows.page.map(async row => {
      const student = await ctx.db.get(row.studentId);
      return { studentId: row.studentId, name: student?.legalName || student?.preferredName || "Former student", status: row.status };
    }));
    return { event, seasonName: (await ctx.db.get(event.seasonId))?.name ?? "Prior season", requirements, participants: { ...rows, page } };
  },
});
