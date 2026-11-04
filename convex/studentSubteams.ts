import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, requireSeasonProfileWritable, viewer } from "./lib/access";
import { AUDIENCE_GROUPS, LEADERSHIP_GROUP } from "./lib/eventAudienceRules";
import { syncSubteamMembership } from "./lib/subteamEnrollment";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";

const MENTOR_SUBTEAMS: readonly string[] = AUDIENCE_GROUPS.filter(group => group !== LEADERSHIP_GROUP);
const MAX_LIST = 300;

/** Secondary subteam (CAD) and Leadership membership: Coach or Travel Lead only. Joins future subteam-mandatory events they now match. */
export const setStudentSecondaryAndLeadership = mutation({
  args: { studentId: v.id("students"), secondarySubteam: v.union(v.literal("CAD"), v.null()), leadership: v.boolean(), expectedRevision: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const season = await activeSeason(ctx);
    await requireSeasonFinanceReady(ctx, season._id);
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can change a student's secondary subteam or Leadership.");
    const student = await ctx.db.get(args.studentId);
    if (!student || student.seasonId !== season._id) throw new ConvexError("This student is not on the current season's roster. Reload to see the current roster.");
    await requireSeasonProfileWritable(ctx, season._id);
    if (args.expectedRevision !== (student.profileRevision ?? 0)) throw new ConvexError("Profile changed since you opened it. Reload to see the latest, then try again.");
    const changes = { secondarySubteam: args.secondarySubteam ?? undefined, leadership: args.leadership, profileRevision: (student.profileRevision ?? 0) + 1 };
    await ctx.db.patch(student._id, changes);
    await audit(ctx, user, "students", student._id, "setSecondaryAndLeadership", { secondarySubteam: student.secondarySubteam ?? null, leadership: student.leadership ?? false, profileRevision: student.profileRevision ?? 0 }, { secondarySubteam: args.secondarySubteam, leadership: args.leadership, profileRevision: changes.profileRevision });
    await syncSubteamMembership(ctx, user, { ...student, ...changes });
    return null;
  },
});

/** Which subteams a Mentor belongs to (used to invite Mentors by subteam). Coach only. */
export const setMentorSubteams = mutation({
  args: { userId: v.id("appUsers"), subteams: v.array(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new ConvexError("Only a Coach can set a Mentor's subteams.");
    const target = await ctx.db.get(args.userId);
    if (!target || target.role !== "mentor" || !target.active) throw new ConvexError("Choose an active Mentor.");
    const subteams = [...new Set(args.subteams)];
    if (subteams.some(group => !MENTOR_SUBTEAMS.includes(group))) throw new ConvexError("Choose subteams from the list.");
    await ctx.db.patch(target._id, { subteams });
    await audit(ctx, user, "appUsers", target._id, "setMentorSubteams", target.subteams ?? [], subteams);
    return null;
  },
});

/** Minimal Mentor list for the invite picker. */
export const listMentorsForInvite = query({
  args: {}, returns: v.array(v.object({ id: v.id("appUsers"), name: v.string(), subteams: v.array(v.string()) })),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can invite Mentors.");
    const mentors = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor")).take(MAX_LIST);
    return mentors.filter(mentor => mentor.active && mentor.archivedAt === undefined).map(mentor => ({ id: mentor._id, name: mentor.name, subteams: mentor.subteams ?? [] }));
  },
});
