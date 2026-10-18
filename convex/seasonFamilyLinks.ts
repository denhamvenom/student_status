import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { publicStudent } from "./lib/access";
import { currentSeasonLinkedStudentsPage } from "./lib/seasonFamilyLinks";

const studentSummary = v.object({
  _id: v.id("students"), legalName: v.string(), preferredName: v.string(), subteam: v.string(),
  travelTeam: v.boolean(), active: v.boolean(), roomCategory: v.union(v.literal("Boys"), v.literal("Girls"), v.null()),
  profileSetupRequired: v.boolean(), profileRevision: v.number(),
});

/** Indexed, authorized Parent roster page; never returns unlinked students or a misleading total. */
export const currentSeasonPage = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(studentSummary),
  handler: async (ctx, args) => {
    const result = await currentSeasonLinkedStudentsPage(ctx, args.paginationOpts);
    return { ...result, page: result.page.map(student => ({
      ...publicStudent(student),
      profileSetupRequired: student.profileCompletedAt === undefined,
      profileRevision: student.profileRevision ?? 0,
    })) };
  },
});
