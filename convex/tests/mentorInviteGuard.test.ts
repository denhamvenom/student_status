/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

/**
 * removeMentorInvite applies the same event guard as addMentorInvites: an invitation on an event that is gone, from
 * another season, archived or cancelled can't be removed (the invite rows are left untouched).
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
    const coach = await account("mig-coach", "coach"), mentor = await account("mig-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Open lab", type: "Team", startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + 3_600_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    await ctx.db.insert("eventMentorInvites", { eventId: event, mentorUserId: mentor.id, source: "individual", status: "invited", invitedBy: coach.id, createdAt: 1 });
    return { coach, mentor, season, event };
  });
  const coach = t.withIdentity({ subject: `${ids.coach.auth}|session` });
  const inviteCount = async () => (await t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", ids.event)).take(10))).length;
  return { t, ids, coach, inviteCount };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const unavailable: [string, (f: Fixture) => Promise<unknown>][] = [
  ["deleted", f => f.t.run(ctx => ctx.db.delete(f.ids.event))],
  ["archived", f => f.t.run(ctx => ctx.db.patch(f.ids.event, { archived: true }))],
  ["cancelled", f => f.t.run(ctx => ctx.db.patch(f.ids.event, { cancelled: true }))],
  ["in another season", f => f.t.run(async ctx => {
    const other: Id<"seasons"> = await ctx.db.insert("seasons", { name: "Synthetic 2025–26", year: 2026, startsAt: Date.parse("2025-08-01T05:00:00Z"), status: "archived", permissionVersion: "DRAFT", createdBy: f.ids.coach.id });
    await ctx.db.patch(f.ids.event, { seasonId: other });
  })],
];

describe("removeMentorInvite event guard", () => {
  it.each(unavailable)("refuses when the event is %s and keeps the invite", async (_label, makeUnavailable) => {
    const f = await fixture();
    await makeUnavailable(f);
    await expect(f.coach.mutation(api.mentorInvites.removeMentorInvite, { eventId: f.ids.event, mentorUserId: f.ids.mentor.id })).rejects.toThrow("This event is no longer available");
    expect(await f.inviteCount()).toBe(1);
  });

  it("removes the invite on a current event in the active season", async () => {
    const f = await fixture();
    await f.coach.mutation(api.mentorInvites.removeMentorInvite, { eventId: f.ids.event, mentorUserId: f.ids.mentor.id });
    expect(await f.inviteCount()).toBe(0);
  });
});
