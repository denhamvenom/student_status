import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { guardianFor } from "./lib/sheetRows";
import { subteamDisplay } from "../src/lib/subteams";

/**
 * Paged reads shared by several spreadsheet kinds (students, adults). A kind that needs other data adds its own queries in
 * `convex/sheetData/<kind>.ts` instead of growing this file.
 */
const PAGE = 40;
const cursorArg = v.union(v.string(), v.null());

/** Active students of a season, one bounded page at a time, with only the fields the spreadsheets use. */
export const studentPage = internalQuery({
  args: { seasonId: v.id("seasons"), cursor: cursorArg, withParents: v.boolean() },
  returns: v.object({
    rows: v.array(v.object({ preferredName: v.string(), legalName: v.string(), grade: v.union(v.string(), v.null()), subteam: v.string(), secondarySubteam: v.union(v.string(), v.null()), leadership: v.boolean(), travelTeam: v.boolean(), email: v.string(), guardianName: v.union(v.string(), v.null()), guardianRelationship: v.union(v.string(), v.null()), guardianPhone: v.union(v.string(), v.null()), guardianEmail: v.union(v.string(), v.null()), shirtSize: v.union(v.string(), v.null()), parentAccounts: v.array(v.string()) })),
    isDone: v.boolean(), cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", args.seasonId).eq("active", true)).paginate({ numItems: PAGE, cursor: args.cursor });
    const rows = await Promise.all(page.page.map(async student => {
      const guardian = guardianFor(student);
      // Same order as the Coach roster: the grade being set up first, then the confirmed health-and-consent profile.
      const draft = await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
      let parentAccounts: string[] = [];
      if (args.withParents) {
        const links = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(21);
        const names = await Promise.all(links.slice(0, 20).filter(link => link.active && (!link.seasonId || link.seasonId === args.seasonId)).map(async link => (await ctx.db.get(link.parentUserId))?.name ?? ""));
        parentAccounts = names.filter(Boolean);
      }
      return { preferredName: student.preferredName, legalName: student.legalName, grade: draft?.grade ?? student.consentProfileV2?.grade ?? null, subteam: student.subteam, secondarySubteam: student.secondarySubteam ?? null, leadership: student.leadership ?? false, travelTeam: student.travelTeam, email: student.email, guardianName: guardian.name, guardianRelationship: guardian.relationship, guardianPhone: guardian.phone, guardianEmail: guardian.email, shirtSize: student.shirtSize ?? null, parentAccounts };
    }));
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

export const adultSource = v.union(v.literal("coach"), v.literal("mentor"), v.literal("parentMentor"), v.literal("parentTravelLead"));

/**
 * Active adults who count as Mentors for shirt sizes: Coaches, Mentors (including Travel Leads) and Parents with Mentor or Travel Lead
 * access. Plain Parents are never read.
 */
export const adultPage = internalQuery({
  args: { source: adultSource, paginationOpts: paginationOptsValidator },
  returns: v.object({ rows: v.array(v.object({ name: v.string(), subteam: v.string(), shirtSize: v.union(v.string(), v.null()) })), isDone: v.boolean(), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const query = args.source === "coach" || args.source === "mentor"
      ? ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", args.source as "coach" | "mentor"))
      : ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", args.source === "parentMentor" ? "mentor" : "travelLead"));
    const page = await query.paginate(args.paginationOpts);
    const rows = page.page.filter(user => user.active && (args.source === "coach" || args.source === "mentor" ? true : user.role === "parent")).map(user => ({ name: user.name, subteam: (user.subteams ?? []).map(subteamDisplay).join(", "), shirtSize: user.shirtSize ?? null }));
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

export type SheetStudentRow = {
  preferredName: string; legalName: string; grade: string | null; subteam: string; secondarySubteam: string | null; leadership: boolean; travelTeam: boolean; email: string;
  guardianName: string | null; guardianRelationship: string | null; guardianPhone: string | null; guardianEmail: string | null; shirtSize: string | null; parentAccounts: string[];
};

/** Every active student of a season, page by page. Throws rather than silently truncating. */
export async function readAllStudents(ctx: ActionCtx, seasonId: Id<"seasons">, withParents: boolean): Promise<SheetStudentRow[]> {
  const rows: SheetStudentRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 200; page++) {
    const result: { rows: SheetStudentRow[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetExportData.studentPage, { seasonId, cursor, withParents });
    rows.push(...result.rows);
    if (result.isDone) return rows;
    cursor = result.cursor;
  }
  throw new Error("Too many students to read");
}

export type SheetAdultRow = { name: string; subteam: string; shirtSize: string | null };

/** Every active adult who counts as a Mentor (see adultPage), page by page. Throws rather than silently truncating. */
export async function readAllAdults(ctx: ActionCtx): Promise<SheetAdultRow[]> {
  const people: SheetAdultRow[] = [];
  for (const source of ["coach", "mentor", "parentMentor", "parentTravelLead"] as const) {
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const result: { rows: SheetAdultRow[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetExportData.adultPage, { source, paginationOpts: { numItems: 50, cursor } });
      people.push(...result.rows);
      if (result.isDone) break;
      cursor = result.cursor;
      if (page === 99) throw new Error("Too many adults to read");
    }
  }
  return people;
}
