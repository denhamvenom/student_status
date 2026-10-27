/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const hour = 3_600_000;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("of-coach", "coach"), lead = await account("of-lead", "mentor", true), mentor = await account("of-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { coach, lead, mentor, season };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const eventArgs = (name: string, isOutreach?: boolean) => ({ name, type: "Team" as const, startsAt: Date.now() + 24 * hour, endsAt: Date.now() + 26 * hour, destination: "Synthetic hall", travel: "Walk", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [], ...(isOutreach === undefined ? {} : { isOutreach }) });

/** A calendar occurrence claimed by an Event, optionally with a session already opened for it. */
async function linked(f: Fixture, opts: { isOutreach?: boolean; opened?: boolean }) {
  return f.t.run(async ctx => {
    const start = Date.now() + hour, end = start + 2 * hour;
    const eventId = await ctx.db.insert("events", { seasonId: f.ids.season, name: "Synthetic fair", type: "Team", startsAt: start, endsAt: end, destination: "Hall", travel: "Walk", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, calendarEventId: "cal-fair", ...(opts.isOutreach === undefined ? {} : { isOutreach: opts.isOutreach }) });
    await ctx.db.insert("eventCalendarClaims", { calendarEventId: "cal-fair", eventId });
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: "calendar", sourceKey: "cal-fair", title: "Fair", allDay: false, scheduledStart: start, scheduledEnd: end, cancelled: false, observedAt: Date.now(), revision: 1, needsReview: false });
    return { eventId, occurrenceId };
  });
}
const sessionFor = (f: Fixture, occurrenceId: Id<"timeclockOccurrences">) => f.t.run(async ctx => {
  const session = await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrenceId)).unique();
  const report = session ? await ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId", q => q.eq("sessionId", session._id)).unique() : null;
  return { override: session?.outreachOverride, outreach: report?.outreach, generation: report?.reportGeneration };
});

describe("Outreach flag on events", () => {
  it.each([
    { name: "marked Outreach", flag: true as boolean | undefined },
    { name: "marked not Outreach", flag: false },
    { name: "left unmarked", flag: undefined },
  ])("a Coach can create an event $name", async ({ flag }) => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, eventArgs("Synthetic day", flag));
    expect((await f.t.run(ctx => ctx.db.get(id)))?.isOutreach).toBe(flag);
  });

  it.each([
    { name: "marked Outreach before the session opens", flag: true, expectOutreach: true },
    { name: "marked not Outreach before the session opens", flag: false, expectOutreach: false },
    { name: "never marked", flag: undefined, expectOutreach: false },
  ])("a session opened from a calendar event $name", async ({ flag, expectOutreach }) => {
    const f = await fixture();
    const { occurrenceId } = await linked(f, { isOutreach: flag });
    const result = await f.coach.mutation(api.timeclock.openOccurrence, { occurrenceId, key: "of-open-device-001" });
    expect(result.ok).toBe(true);
    expect(await sessionFor(f, occurrenceId)).toEqual({ override: flag, outreach: expectOutreach, generation: 1 });
  });

  it("changing the flag later sets and clears the session override and recalculates it", async () => {
    const f = await fixture();
    const { eventId, occurrenceId } = await linked(f, {});
    await f.coach.mutation(api.timeclock.openOccurrence, { occurrenceId, key: "of-open-device-002" });
    const before = await sessionFor(f, occurrenceId);
    expect(before).toEqual({ override: undefined, outreach: false, generation: 1 });
    await f.coach.mutation(api.eventOperations.updateSettings, { eventId, isOutreach: true });
    const marked = await sessionFor(f, occurrenceId);
    expect(marked).toMatchObject({ override: true, outreach: true });
    expect(marked.generation).toBeGreaterThan(before.generation!);
    await f.coach.mutation(api.eventOperations.updateSettings, { eventId, isOutreach: false });
    const cleared = await sessionFor(f, occurrenceId);
    expect(cleared).toEqual({ override: false, outreach: false, generation: cleared.generation });
    expect(cleared.generation).toBeGreaterThan(marked.generation!);
    // Saving the same value again changes nothing.
    await f.coach.mutation(api.eventOperations.updateSettings, { eventId, isOutreach: false });
    expect((await sessionFor(f, occurrenceId)).generation).toBe(cleared.generation);
  });

  it.each([
    { name: "a Travel Lead can create an Outreach-marked event", run: (f: Fixture) => f.lead.mutation(api.admin.createEvent, eventArgs("Lead day", true)), allowed: true },
    { name: "a Travel Lead can mark an event Outreach", run: async (f: Fixture) => { const { eventId } = await linked(f, {}); return f.lead.mutation(api.eventOperations.updateSettings, { eventId, isOutreach: true }); }, allowed: true },
    { name: "a Travel Lead still cannot edit other event settings", run: async (f: Fixture) => { const { eventId } = await linked(f, {}); return f.lead.mutation(api.eventOperations.updateSettings, { eventId, isOutreach: true, capacity: 5 }); }, allowed: false, message: /Only a Coach can edit/ },
    { name: "a Mentor cannot create an Outreach-marked event", run: (f: Fixture) => f.mentor.mutation(api.admin.createEvent, eventArgs("Mentor day", true)), allowed: false, message: /Only a Coach or Travel Lead/ },
    { name: "a Mentor cannot change the flag", run: async (f: Fixture) => { const { eventId } = await linked(f, {}); return f.mentor.mutation(api.eventOperations.updateSettings, { eventId, isOutreach: true }); }, allowed: false, message: /Only a Coach or Travel Lead/ },
  ])("$name", async ({ run, allowed, message }) => {
    const f = await fixture();
    if (allowed) await expect(run(f)).resolves.not.toThrow();
    else await expect(run(f)).rejects.toThrow(message);
  });
});
