import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import type { SheetLoader } from "../lib/sheetKinds";
import type { Data, DriverRow } from "../sheetKinds/drivers";

export const page = internalQuery({
  args: { seasonId: v.id("seasons"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    rows: v.array(v.object({ name: v.string(), phone: v.string(), email: v.string(), seats: v.number(), vehicle: v.string(), canTow: v.boolean(), approved: v.boolean(), active: v.boolean() })),
    isDone: v.boolean(), cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", args.seasonId)).paginate(args.paginationOpts);
    // An older driver with no saved Active value counts as active (same as the travel screens).
    const rows = result.page.map(driver => ({ name: driver.name, phone: driver.phone, email: driver.email, seats: driver.seats, vehicle: driver.vehicleName ?? "", canTow: driver.towCapable ?? false, approved: driver.approved, active: driver.active !== false }));
    return { rows, isDone: result.isDone, cursor: result.isDone ? null : result.continueCursor };
  },
});

export const load: SheetLoader<Data> = async (ctx, args) => {
  const drivers: DriverRow[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 100; i++) {
    const result: { rows: DriverRow[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.drivers.page, { seasonId: args.seasonId, paginationOpts: { numItems: 50, cursor } });
    drivers.push(...result.rows);
    if (result.isDone) return drivers;
    cursor = result.cursor;
  }
  throw new Error("Too many drivers to read");
};
