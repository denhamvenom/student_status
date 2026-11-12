import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import type { SheetLoader } from "../lib/sheetKinds";
import type { Data, HealthSheetStudent } from "../sheetKinds/health";
import { adultRoleFor, coverageAccepted, healthAdultValidator, healthStudentFor, healthStudentValidator, type HealthAdult } from "../lib/healthRows";

/** Health folder reads. Students and their permission-form counts, and adults' emergency contacts, one bounded page at a time. */
const STUDENT_PAGE = 20;
const ADULT_PAGE = 50;
const MAX_COVERAGE = 50;
const pageEnd = { isDone: v.boolean(), cursor: v.union(v.string(), v.null()) };

/** Active students of the season with health details (confirmed profile first, older fields otherwise, as the app does) and form counts. */
export const studentPage = internalQuery({
  args: { seasonId: v.id("seasons"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ rows: v.array(v.object({ ...healthStudentValidator.fields, formsAccepted: v.number(), formsOpen: v.number() })), ...pageEnd }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", args.seasonId).eq("active", true)).paginate({ numItems: STUDENT_PAGE, cursor: args.cursor });
    const rows = await Promise.all(page.page.map(async student => {
      const draft = await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
      const coverage = await ctx.db.query("permissionCoverage").withIndex("by_studentId_and_eventId", q => q.eq("studentId", student._id)).take(MAX_COVERAGE + 1);
      if (coverage.length > MAX_COVERAGE) throw new Error("Too many permission forms to read for one student");
      const mine = coverage.filter(row => row.seasonId === args.seasonId);
      const formsAccepted = mine.filter(coverageAccepted).length;
      return { ...healthStudentFor(student, draft?.grade ?? null), formsAccepted, formsOpen: mine.length - formsAccepted };
    }));
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

/** Active Coaches, Mentors (Travel Leads included) and Parents with Mentor or Travel Lead access: emergency contact only. */
export const adultPage = internalQuery({
  args: { source: v.union(v.literal("coach"), v.literal("mentor"), v.literal("parentMentor"), v.literal("parentTravelLead")), paginationOpts: paginationOptsValidator },
  returns: v.object({ rows: v.array(healthAdultValidator), ...pageEnd }),
  handler: async (ctx, args) => {
    const query = args.source === "coach" || args.source === "mentor"
      ? ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", args.source as "coach" | "mentor"))
      : ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", args.source === "parentMentor" ? "mentor" : "travelLead"));
    const page = await query.paginate(args.paginationOpts);
    const rows = page.page.filter(user => user.active && (args.source === "coach" || args.source === "mentor" || user.role === "parent")).map(user => ({
      name: user.name, role: adultRoleFor(user), emergencyName: user.emergencyName ?? null, emergencyRelationship: user.emergencyRelationship ?? null, emergencyPhone: user.emergencyPhone ?? null,
    }));
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

export const load: SheetLoader<Data> = async (ctx, args) => {
  const students: HealthSheetStudent[] = [];
  let cursor: string | null = null;
  for (let page = 0; ; page++) {
    if (page >= 200) throw new Error("Too many students to read");
    const result: { rows: HealthSheetStudent[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.health.studentPage, { seasonId: args.seasonId, cursor });
    students.push(...result.rows);
    if (result.isDone) break;
    cursor = result.cursor;
  }
  const adults: HealthAdult[] = [];
  for (const source of ["coach", "mentor", "parentMentor", "parentTravelLead"] as const) {
    let adultCursor: string | null = null;
    for (let page = 0; ; page++) {
      if (page >= 100) throw new Error("Too many adults to read");
      const result: { rows: HealthAdult[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.health.adultPage, { source, paginationOpts: { numItems: ADULT_PAGE, cursor: adultCursor } });
      adults.push(...result.rows);
      if (result.isDone) break;
      adultCursor = result.cursor;
    }
  }
  return { students, adults };
};
