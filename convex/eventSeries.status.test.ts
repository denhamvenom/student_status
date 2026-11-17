/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { chicagoDate } from "./lib/calendarDates";
import { canMoveSeries, seriesGenerationActor } from "./lib/seriesGenerate";
import { addDays, weekdayOf } from "./lib/seriesRecurrence";

// Series status guards: a cancelled or ended series is never moved back to needsReview by a background path.
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());

const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false };

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "ss-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, name: "ss-coach", email: "ss-coach@example.invalid", role: "coach", travelLead: false, financialEdit: false, active: true });
    const parentAuth = await ctx.db.insert("users", { email: "ss-parent@example.invalid" });
    const parent = await ctx.db.insert("appUsers", { authUserId: parentAuth, name: "ss-parent", email: "ss-parent@example.invalid", role: "parent", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { auth, coach, parent, season };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const today = chicagoDate(Date.now());
  const startDate = addDays(today, 1);
  const rule = { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 };
  // A series whose creator can no longer manage it (a plain Parent), in the given status.
  async function seriesIn(status: "active" | "ended" | "cancelled" | "needsReview" | "conflict") {
    vi.useFakeTimers();
    const { seriesId } = await coach.mutation(api.eventSeries.create, { name: `Series ${status}`, ...template, audienceKind: "everyone", rule, addToCalendar: false });
    await t.run(ctx => ctx.db.patch(seriesId, { createdBy: ids.parent, status }));
    return seriesId;
  }
  return { t, seriesIn };
}

describe("series status guards", () => {
  for (const terminal of ["cancelled", "ended"] as const) {
    it(`generation does not move a ${terminal} series to needsReview`, async () => {
      const f = await fixture();
      const seriesId = await f.seriesIn(terminal);
      const actor = await f.t.run(async ctx => seriesGenerationActor(ctx, (await ctx.db.get(seriesId))!));
      expect(actor).toBeNull();
      expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: terminal });
    });

    // linkInstances returns before any write unless the series is active, so this path cannot reach a terminal series.
    it(`Calendar linking does not touch a ${terminal} series`, async () => {
      const f = await fixture();
      const seriesId = await f.seriesIn(terminal);
      await f.t.run(ctx => ctx.db.patch(seriesId, { calendarMasterId: "ssmaster" }));
      const startDate = addDays(chicagoDate(Date.now()), 1);
      const off = (n: number) => addDays(startDate, n);
      // An instance outside the rule would be drift on an active series.
      const instance = { id: "ssmaster_x", key: off(2), startsAt: Date.now() + 3 * 86_400_000, endsAt: Date.now() + 3 * 86_400_000 + 3_600_000, title: "Odd", location: "Lab", etag: "e1", updatedAt: 1, cancelled: false };
      const result = await f.t.mutation(internal.eventSeriesCalendar.linkInstances, { seriesId, instances: [instance], fromKey: startDate, toKey: off(10), refreshEtags: false });
      expect(result).toEqual({ more: false });
      expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: terminal });
    });

    it(`markSeries does not move a ${terminal} series to needsReview`, async () => {
      const f = await fixture();
      const seriesId = await f.seriesIn(terminal);
      await f.t.mutation(internal.eventSeriesCalendar.markSeries, { seriesId, status: "needsReview", error: "x" });
      expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: terminal });
    });
  }

  it("still moves an active series to needsReview when its creator can no longer manage it", async () => {
    const f = await fixture();
    const seriesId = await f.seriesIn("active");
    await f.t.run(async ctx => seriesGenerationActor(ctx, (await ctx.db.get(seriesId))!));
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: "needsReview" });
  });

  it("allows only the moves the app makes today", () => {
    const allowed: [string, string][] = [["active", "ended"], ["active", "cancelled"], ["active", "needsReview"], ["active", "conflict"], ["ended", "active"], ["needsReview", "active"], ["needsReview", "conflict"], ["conflict", "active"], ["conflict", "needsReview"]];
    const all = ["active", "ended", "cancelled", "needsReview", "conflict"] as const;
    for (const from of all) for (const to of all) expect(canMoveSeries(from, to), `${from} -> ${to}`).toBe(from === to || allowed.some(([a, b]) => a === from && b === to));
  });
});

