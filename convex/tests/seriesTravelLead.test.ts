/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { addDays, weekdayOf } from "../lib/seriesRecurrence";

/**
 * Recurring series accept a Coach, a Mentor with Travel Lead, or a Parent whose session selected the Travel Lead staff role.
 * A Travel Lead flag stored on any other account (a Student, a Parent without that role) grants nothing, including when the
 * series is generated in the background as its creator.
 */
const modules = import.meta.glob("../**/*.ts");
const DAY = 86_400_000;
const REFUSAL = "Only a Coach or Travel Lead can manage recurring events.";

afterEach(() => vi.useRealTimers());

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id, session: "session" as string };
    }
    const coach = await account("st-coach", "coach");
    const mentorLead = await account("st-mentor-lead", "mentor", { travelLead: true });
    const parentLead = await account("st-parent-lead", "parent", { parentStaffAccess: "travelLead" });
    const studentFlagged = await account("st-student", "student", { travelLead: true });
    const parentFlagged = await account("st-parent", "parent", { travelLead: true });
    const leadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    await ctx.db.insert("operatingRoles", { sessionId: leadSession, userId: parentLead.id, role: "travelLead", accessRevision: 0 });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    await ctx.db.insert("students", { seasonId: season, userId: studentFlagged.id, legalName: "st-student", preferredName: "st-student", email: "st-student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    return { coach, mentorLead, parentLead: { ...parentLead, session: leadSession as string }, parentInParentMode: parentLead, studentFlagged, parentFlagged };
  });
  const as = (who: { auth: Id<"users">; session: string }) => t.withIdentity({ subject: `${who.auth}|${who.session}` });
  const seriesRows = (seriesId: Id<"eventSeries">) => t.run(async ctx => await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId)).take(100));
  return { t, ids, as, seriesRows };
}
type Caller = "coach" | "mentorLead" | "parentLead" | "studentFlagged" | "parentFlagged" | "parentInParentMode";

const today = () => chicagoDate(Date.now());
function seriesArgs(name: string, offsetDays = 1) {
  const startDate = addDays(today(), offsetDays);
  return {
    name, type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
    audienceKind: "everyone" as const, rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 },
  };
}

const allowed: Caller[] = ["coach", "mentorLead", "parentLead"];
const refused: Caller[] = ["studentFlagged", "parentFlagged", "parentInParentMode"];

describe("Travel Lead checks for recurring series", () => {
  it.each(refused)("refuses %s for create, list and editOccurrence", async caller => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, firstEventId } = await f.as(f.ids.coach).mutation(api.eventSeries.create, seriesArgs("Coach meeting"));
    const before = await f.seriesRows(seriesId);
    const who = f.as(f.ids[caller]);
    await expect(who.mutation(api.eventSeries.create, seriesArgs("Blocked"))).rejects.toThrow(REFUSAL);
    await expect(who.query(api.eventSeries.list, {})).rejects.toThrow(REFUSAL);
    await expect(who.mutation(api.eventSeries.editOccurrence, { eventId: firstEventId!, name: "Hijacked" })).rejects.toThrow(REFUSAL);
    expect(await f.t.run(async ctx => (await ctx.db.query("eventSeries").take(10)).length)).toBe(1);
    expect((await f.t.run(ctx => ctx.db.get(firstEventId!)))?.name).toBe("Coach meeting");
    expect(await f.seriesRows(seriesId)).toHaveLength(before.length);
  });

  it.each(allowed)("accepts %s for create, list and editOccurrence", async caller => {
    vi.useFakeTimers();
    const f = await fixture();
    const who = f.as(f.ids[caller]);
    const { seriesId, firstEventId } = await who.mutation(api.eventSeries.create, seriesArgs("Build night"));
    expect(firstEventId).not.toBeNull();
    expect(await who.query(api.eventSeries.list, {})).toEqual([expect.objectContaining({ seriesId, name: "Build night", status: "active" })]);
    await who.mutation(api.eventSeries.editOccurrence, { eventId: firstEventId!, name: "Build night (moved)" });
    expect((await f.t.run(ctx => ctx.db.get(firstEventId!)))?.name).toBe("Build night (moved)");
  });

  it("keeps generating meetings for a series created by a Parent with Travel Lead staff access", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.as(f.ids.parentLead).mutation(api.eventSeries.create, seriesArgs("Parent-led meeting"));
    const initial = (await f.seriesRows(seriesId)).length;
    expect(initial).toBeGreaterThan(0);
    // Background generation runs without a session: the stored Parent is re-validated through the current Travel Lead grant.
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 120) });
    expect((await f.seriesRows(seriesId)).length).toBeGreaterThan(initial);
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.status).toBe("active");
  });

  it("stops generating when the creator keeps only a stored Travel Lead flag without a Travel Lead role", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.as(f.ids.parentLead).mutation(api.eventSeries.create, seriesArgs("Parent-led meeting"));
    const initial = (await f.seriesRows(seriesId)).length;
    await f.t.run(ctx => ctx.db.patch(f.ids.parentLead.id, { parentStaffAccess: undefined, travelLead: true }));
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 120) });
    expect(await f.seriesRows(seriesId)).toHaveLength(initial);
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.status).toBe("needsReview");
  });
});
