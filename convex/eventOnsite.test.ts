/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { chicagoMidnight } from "./lib/calendarDates";
import { selectedEvents } from "./lib/consentSnapshot";
import { selectedEventsV2 } from "./lib/consentSnapshotV2";

const modules = import.meta.glob("./**/*.ts");
const start = chicagoMidnight("2026-11-01"), end = chicagoMidnight("2026-11-02");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@synthetic.test", name: "Coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@synthetic.test", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Bake sale", type: "Fundraiser", onsite: true, startsAt: start, endsAt: end, destination: "On site", travel: "On site", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, calendarChoice: "link", calendarEventId: "cal-onsite", calendarSyncState: "synced", calendarEtag: "old", calendarRevision: 1, calendarActorId: coach });
    await ctx.db.insert("eventCalendarClaims", { calendarEventId: "cal-onsite", eventId: event });
    return { authCoach, coach, season, event };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.authCoach}|one` }) };
}

describe("on-site event location", () => {
  it("rejects a new place in Calendar details but still saves other changes", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(api.eventCalendar.update, { eventId: f.ids.event, expectedRevision: 1, destination: "Room 12" })).rejects.toThrow("on site");
    await f.coach.mutation(api.eventCalendar.update, { eventId: f.ids.event, expectedRevision: 1, name: "Fall bake sale", destination: "On site" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.event))).toMatchObject({ name: "Fall bake sale", destination: "On site" });
  });

  it("keeps On site when Team Calendar reports another place", async () => {
    const f = await fixture();
    await f.t.mutation(internal.eventCalendar.applyObserved, { eventId: "cal-onsite", title: "Bake sale table", location: "Room 12", start, end, allDay: false, recurring: false, cancelled: false, etag: "new", providerUpdatedAt: 1000, description: "" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.event))).toMatchObject({ name: "Bake sale table", destination: "On site" });
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { calendarRevision: 5 }));
    await f.t.mutation(internal.eventCalendar.finishPush, { eventId: f.ids.event, revision: 5, calendarEventId: "cal-onsite", etag: "linked", observed: { title: "Bake sale table", location: "Cafeteria", startsAt: start, endsAt: end, cancelled: false, media: false, recurring: false } });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.event))).toMatchObject({ destination: "On site", calendarSyncState: "synced" });
  });

  it.each([
    ["on-site event with a drifted place", { onsite: true, destination: "Room 12" }, "On site"],
    ["off-site event", { destination: "Example arena" }, "Example arena"],
  ])("records the event place in permission snapshots for an %s", async (_label, fields, expected) => {
    const f = await fixture();
    const places = await f.t.run(async ctx => {
      const eventId = await ctx.db.insert("events", { seasonId: f.ids.season, name: "Synthetic event", type: "Team", startsAt: start, endsAt: end, travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false, ...fields });
      const studentId = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@synthetic.test", subteam: "Other", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
      await ctx.db.insert("participants", { eventId, studentId, status: "confirmed", createdAt: 0, updatedAt: 0 });
      const student = (await ctx.db.get(studentId))!;
      return [(await selectedEvents(ctx, student, [eventId]))[0].destination, (await selectedEventsV2(ctx, student, [eventId]))[0].destination];
    });
    expect(places).toEqual([expected, expected]);
  });
});

describe("on-site event creation", () => {
  it("rejects a room deadline", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(api.admin.createEvent, { name: "Synthetic on-site event", type: "Team", onsite: true, startsAt: Date.now() + 86_400_000, endsAt: Date.now() + 2 * 86_400_000, destination: "On site", travel: "On site", overnight: false, roomingEnabled: false, roomDeadline: Date.now() + 3_600_000, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] })).rejects.toThrow("room deadline");
  });
});
