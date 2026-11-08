import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, requireSeasonProfileWritable, viewer, isCoachOrTravelLead } from "./lib/access";
import { AUDIENCE_GROUPS, LEADERSHIP_GROUP } from "./lib/eventAudienceRules";
import { isMentorCapable } from "./lib/mentorMeetings";
import { syncSubteamMembership } from "./lib/subteamEnrollment";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";

const MENTOR_SUBTEAMS: readonly string[] = AUDIENCE_GROUPS.filter(group => group !== LEADERSHIP_GROUP);
/** Accounts read per Mentor source list for the invite picker (the same bound as inviting by subteam). */
export const MAX_MENTOR_LIST = 500;
export const MENTOR_LIST_TOO_LONG_MESSAGE = "There are more than 500 Mentor accounts in one list, so the full Mentor list can't be shown. Ask the app administrator for help.";

/** Secondary subteam (CAD) and Leadership membership: Coach or Travel Lead only. Joins future subteam-mandatory events they now match. */
export const setStudentSecondaryAndLeadership = mutation({
  args: { studentId: v.id("students"), secondarySubteam: v.union(v.literal("CAD"), v.null()), leadership: v.boolean(), expectedRevision: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const season = await activeSeason(ctx);
    await requireSeasonFinanceReady(ctx, season._id);
    const user = await viewer(ctx);
    if (!isCoachOrTravelLead(user)) throw new ConvexError("Only a Coach or Travel Lead can change a student's secondary subteam or Leadership.");
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

/**
 * Which subteams a Mentor belongs to (used to invite Mentors by subteam and to decide which subteam events a Mentor may sign
 * up for). Coach only. A Parent with Mentor staff access counts as a Mentor here.
 */
export const setMentorSubteams = mutation({
  args: { userId: v.id("appUsers"), subteams: v.array(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new ConvexError("Only a Coach can set a Mentor's subteams.");
    const target = await ctx.db.get(args.userId);
    if (!isMentorCapable(target)) throw new ConvexError("Choose an active Mentor.");
    const subteams = [...new Set(args.subteams)];
    if (subteams.some(group => !MENTOR_SUBTEAMS.includes(group))) throw new ConvexError("Choose subteams from the list.");
    await ctx.db.patch(target._id, { subteams });
    await audit(ctx, user, "appUsers", target._id, "setMentorSubteams", target.subteams ?? [], subteams);
    return null;
  },
});

/**
 * Minimal Mentor list for the invite picker: id, display name and subteams only (no email, phone or other account data).
 * Lists Mentor accounts and Parents with Mentor or Travel Lead staff access (they count as Mentors for meetings).
 * A Coach, a Travel Lead, or any Mentor (including a Parent with Mentor or Travel Lead staff access) may read it, so they can
 * invite Mentors to their own meetings. Each source list (Mentor accounts, Parents with Mentor access, Parents with Travel Lead
 * access) is read up to MAX_MENTOR_LIST; a longer list is refused with a clear message instead of being silently cut short.
 */
export const listMentorsForInvite = query({
  args: {}, returns: v.array(v.object({ id: v.id("appUsers"), name: v.string(), subteams: v.array(v.string()) })),
  handler: async ctx => {
    const user = await viewer(ctx); // active accounts only; a Parent's selected Travel Lead role resolves to a Mentor here
    // Coach, Travel Lead (as before), or a Mentor (a Mentor account, or a Parent with Mentor staff access).
    if (!isCoachOrTravelLead(user) && !isMentorCapable(await ctx.db.get(user._id))) throw new ConvexError("Only a Coach or Mentor can invite Mentors.");
    const lists = [
      await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor")).take(MAX_MENTOR_LIST + 1),
      await ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", "mentor")).take(MAX_MENTOR_LIST + 1),
      await ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", "travelLead")).take(MAX_MENTOR_LIST + 1),
    ];
    if (lists.some(list => list.length > MAX_MENTOR_LIST)) throw new ConvexError(MENTOR_LIST_TOO_LONG_MESSAGE);
    return lists.flat().filter(isMentorCapable).map(mentor => ({ id: mentor._id, name: mentor.name, subteams: mentor.subteams ?? [] }));
  },
});
