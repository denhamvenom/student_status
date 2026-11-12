import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import type { SheetLoader } from "../lib/sheetKinds";
import type { AdultRow, Data } from "../sheetKinds/adultRoster";
import { subteamDisplay } from "../../src/lib/subteams";

const source = v.union(v.literal("coach"), v.literal("mentor"), v.literal("parent"));
const rowValidator = v.object({ name: v.string(), role: v.union(v.literal("Coach"), v.literal("Travel Lead"), v.literal("Mentor"), v.literal("Parent")), travelLead: v.boolean(), subteams: v.string(), email: v.string(), phone: v.string(), students: v.array(v.string()) });

/** One bounded page of adults of one role. Parents also get their linked students' names (at most 20 per Parent). */
export const page = internalQuery({
  args: { seasonId: v.id("seasons"), source, paginationOpts: paginationOptsValidator },
  returns: v.object({ rows: v.array(rowValidator), isDone: v.boolean(), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", args.source)).paginate(args.paginationOpts);
    const rows = await Promise.all(result.page.filter(user => user.active && user.archivedAt === undefined).map(async user => {
      const travelLead = user.role === "mentor" ? user.travelLead : user.role === "parent" && user.parentStaffAccess === "travelLead";
      const role: AdultRow["role"] = user.role === "coach" ? "Coach" : travelLead ? "Travel Lead" : user.role === "mentor" || user.parentStaffAccess === "mentor" ? "Mentor" : "Parent";
      let students: string[] = [];
      if (user.role === "parent") {
        const links = await ctx.db.query("familyLinks").withIndex("by_parentUserId", q => q.eq("parentUserId", user._id)).take(21);
        const names = await Promise.all(links.slice(0, 20).filter(link => link.active && (!link.seasonId || link.seasonId === args.seasonId)).map(async link => {
          const student = await ctx.db.get(link.studentId);
          return student && student.seasonId === args.seasonId ? student.legalName || student.preferredName : "";
        }));
        students = names.filter(Boolean);
      }
      return { name: user.name, role, travelLead, subteams: (user.subteams ?? []).map(subteamDisplay).join(", "), email: user.email, phone: user.phone ?? "", students };
    }));
    return { rows, isDone: result.isDone, cursor: result.isDone ? null : result.continueCursor };
  },
});

export const load: SheetLoader<Data> = async (ctx, args) => {
  const adults: AdultRow[] = [];
  for (const role of ["coach", "mentor", "parent"] as const) {
    let cursor: string | null = null;
    for (let i = 0; ; i++) {
      if (i === 100) throw new Error("Too many adults to read");
      const result: { rows: AdultRow[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.adultRoster.page, { seasonId: args.seasonId, source: role, paginationOpts: { numItems: 25, cursor } });
      adults.push(...result.rows);
      if (result.isDone) break;
      cursor = result.cursor;
    }
  }
  return adults;
};
