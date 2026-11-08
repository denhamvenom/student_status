/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

/**
 * Review fixes: a duplicate Mentor invite row can't break the Mentor's invitations, and two staff editing an event that
 * isn't on Team Calendar can't silently overwrite each other.
 */
const modules = import.meta.glob("../**/*.ts");
const DAY = 86_400_000;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor", extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id };
    }
    const coach = await account("sf-coach", "coach"), lead = await account("sf-lead", "mentor", { travelLead: true }), mentor = await account("sf-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Open lab", type: "Team", startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + 3_600_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { coach, lead, mentor, season, event };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor) };
}

describe("duplicate Mentor invite rows", () => {
  it("still list, answer and remove cleanly", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 2; i++) await ctx.db.insert("eventMentorInvites", { eventId: f.ids.event, mentorUserId: f.ids.mentor.id, source: "individual", status: "invited", invitedBy: f.ids.coach.id, createdAt: i });
    });
    expect((await f.coach.query(api.mentorInvites.forEventSummary, { eventId: f.ids.event })).mentors).toMatchObject([{ mentorUserId: f.ids.mentor.id, status: "invited" }]);
    await f.mentor.mutation(api.mentorInvites.respond, { eventId: f.ids.event, status: "accepted" });
    const rows = await f.t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", f.ids.event)).take(10));
    expect(rows.map(row => row.status)).toEqual(["accepted", "accepted"]);
    // Adding the same Mentor again doesn't add a row.
    expect(await f.coach.mutation(api.mentorInvites.addMentorInvites, { eventId: f.ids.event, mentorUserIds: [f.ids.mentor.id, f.ids.mentor.id] })).toBe(0);
    await f.coach.mutation(api.mentorInvites.removeMentorInvite, { eventId: f.ids.event, mentorUserId: f.ids.mentor.id });
    expect(await f.t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", f.ids.event)).take(10))).toEqual([]);
  });
});

describe("editing an event that isn't on Team Calendar", () => {
  it("refuses a save made from a form opened before someone else's change", async () => {
    const f = await fixture();
    const opened = (await f.t.run(ctx => ctx.db.get(f.ids.event)))!.calendarRevision ?? 0;
    // Both staff opened the form at the same revision; the Coach saves first.
    await f.coach.mutation(api.eventCalendar.update, { eventId: f.ids.event, expectedRevision: opened, name: "Open lab (Coach)" });
    await expect(f.lead.mutation(api.eventCalendar.update, { eventId: f.ids.event, expectedRevision: opened, destination: "Room 12" })).rejects.toThrow("Someone else saved a change");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.event))).toMatchObject({ name: "Open lab (Coach)", destination: "Lab", calendarRevision: opened + 1 });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.event)))?.calendarSyncState).toBeUndefined();
    // After reloading, the Travel Lead's save goes through.
    await f.lead.mutation(api.eventCalendar.update, { eventId: f.ids.event, expectedRevision: opened + 1, destination: "Room 12" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.event))).toMatchObject({ name: "Open lab (Coach)", destination: "Room 12" });
  });
});
