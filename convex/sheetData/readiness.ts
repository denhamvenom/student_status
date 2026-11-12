import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { upcomingEvents, rosterRow } from "../lib/rosterReadiness";
import type { SheetLoader } from "../lib/sheetKinds";
import type { Data, ReadinessStudent } from "../sheetKinds/readiness";

/** Same page size the Team roster uses (each student needs several reads). */
const PAGE = 20;
const studentValidator = v.object({
  studentId: v.string(), name: v.string(), subteam: v.string(), active: v.boolean(),
  firstRegistrationState: v.union(v.literal("needsCompletion"), v.literal("awaitingVerification"), v.literal("verified")),
  balance: v.object({ state: v.string(), dueCents: v.union(v.number(), v.null()) }),
  nextEvent: v.union(v.null(), v.object({ name: v.string(), state: v.union(v.literal("ready"), v.literal("open"), v.literal("unknown")), open: v.array(v.string()), participation: v.union(v.literal("confirmed"), v.literal("pending"), v.literal("waitlist"), v.literal("withdrawn"), v.null()) })),
  missingSummary: v.array(v.string()),
  permission: v.object({ state: v.union(v.literal("closed"), v.literal("noForm"), v.literal("signed"), v.literal("review"), v.literal("notSigned")), eventName: v.union(v.string(), v.null()) }),
});

/** One bounded page of active students, worked out with the Team roster's own row logic. */
export const page = internalQuery({
  args: { seasonId: v.id("seasons"), cursor: v.union(v.string(), v.null()), asOf: v.number() },
  returns: v.object({ rows: v.array(studentValidator), isDone: v.boolean(), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new Error("Season not found");
    const result = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", args.seasonId).eq("active", true)).paginate({ numItems: PAGE, cursor: args.cursor, maximumRowsRead: PAGE + 1 });
    const upcoming = await upcomingEvents(ctx, season, args.asOf);
    const rows = await Promise.all(result.page.map(async student => {
      const row = await rosterRow(ctx, student, upcoming);
      return {
        studentId: row.studentId, name: row.name, subteam: row.subteam, active: row.active, firstRegistrationState: row.firstRegistrationState,
        balance: { state: row.balance.state, dueCents: row.balance.dueCents },
        nextEvent: row.nextEvent && { name: row.nextEvent.name, state: row.nextEvent.state, open: row.nextEvent.open, participation: row.nextEvent.participation },
        missingSummary: row.missingSummary, permission: row.permission,
      };
    }));
    return { rows, isDone: result.isDone, cursor: result.isDone ? null : result.continueCursor };
  },
});

export const load: SheetLoader<Data> = async (ctx, args) => {
  const asOf = Date.now();
  const students: ReadinessStudent[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 200; i++) {
    const result: { rows: ReadinessStudent[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.readiness.page, { seasonId: args.seasonId, cursor, asOf });
    students.push(...result.rows);
    if (result.isDone) return students;
    cursor = result.cursor;
  }
  throw new Error("Too many students to read");
};
