import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { activeSeason, studentAccess, viewer } from "./lib/access";
import schema from "./schema";

function boundRead(options: { maximumRowsRead?: number }) {
  if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new Error("Invalid finance read budget.");
  options.maximumRowsRead = Math.min(options.maximumRowsRead ?? 26, 26);
}

async function authorize(ctx: QueryCtx, studentId: Id<"students">, size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 25) throw new Error("Finance pages support 1 to 25 records.");
  const actor = await viewer(ctx);
  if (actor.role === "mentor" && !actor.travelLead) throw new Error("Finance access denied.");
  const student = await studentAccess(ctx, actor, studentId);
  if (student.seasonId !== (await activeSeason(ctx))._id) throw new Error("Archived finances are unavailable.");
}

export const charges = query({
  args: { studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("charges")),
  handler: async (ctx, args) => {
    await authorize(ctx, args.studentId, args.paginationOpts.numItems);
    boundRead(args.paginationOpts);
    const result = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", args.studentId)).paginate(args.paginationOpts);
    if (result.page.length > 25) throw new Error("Charge page expanded beyond 25 records; reload the list.");
    return result;
  },
});

export const history = query({
  args: { studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("ledgerEntries")),
  handler: async (ctx, args) => {
    await authorize(ctx, args.studentId, args.paginationOpts.numItems);
    boundRead(args.paginationOpts);
    const result = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", args.studentId)).order("desc").paginate(args.paginationOpts);
    if (result.page.length > 25) throw new Error("History page expanded beyond 25 records; reload the list.");
    return result;
  },
});
