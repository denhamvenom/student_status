/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

/**
 * Mentor invitations and event creation accept a Coach, a Mentor with Travel Lead, or a Parent whose session selected
 * the Travel Lead staff role. A Travel Lead flag stored on any other account (a Student, an unselected Parent) grants nothing.
 */
const modules = import.meta.glob("../**/*.ts");
const DAY = 86_400_000;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id, session: "session" as string };
    }
    const coach = await account("tl-coach", "coach");
    const mentorLead = await account("tl-mentor-lead", "mentor", { travelLead: true });
    const parentLead = await account("tl-parent-lead", "parent", { parentStaffAccess: "travelLead" });
    const studentFlagged = await account("tl-student", "student", { travelLead: true });
    const parentFlagged = await account("tl-parent", "parent", { travelLead: true });
    const target = await account("tl-target-mentor", "mentor");
    const leadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    await ctx.db.insert("operatingRoles", { sessionId: leadSession, userId: parentLead.id, role: "travelLead", accessRevision: 0 });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Open lab", type: "Team", startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + 3_600_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    await ctx.db.insert("students", { seasonId: season, userId: studentFlagged.id, legalName: "tl-student", preferredName: "tl-student", email: "tl-student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    return { coach, mentorLead, parentLead: { ...parentLead, session: leadSession as string }, parentInParentMode: parentLead, studentFlagged, parentFlagged, target, event };
  });
  const as = (who: { auth: Id<"users">; session: string }) => t.withIdentity({ subject: `${who.auth}|${who.session}` });
  const inviteCount = async () => (await t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", ids.event)).take(10))).length;
  return { t, ids, as, inviteCount };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Caller = "coach" | "mentorLead" | "parentLead" | "studentFlagged" | "parentFlagged" | "parentInParentMode";

const eventArgs = () => ({ type: "Team" as const, name: "Build night", startsAt: Date.now() + 3 * DAY, endsAt: Date.now() + 3 * DAY + 3_600_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [], calendarChoice: { kind: "none" as const } });

const allowed: Caller[] = ["coach", "mentorLead", "parentLead"];
const refused: Caller[] = ["studentFlagged", "parentFlagged", "parentInParentMode"];

describe("Travel Lead checks for Mentor invitations and event creation", () => {
  it.each(refused)("refuses %s for forEventSummary, addMentorInvites, removeMentorInvite and createEvent", async caller => {
    const f: Fixture = await fixture();
    await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId: f.ids.event, mentorUserId: f.ids.target.id, source: "individual", status: "invited", invitedBy: f.ids.coach.id, createdAt: 1 }));
    const who = f.as(f.ids[caller]);
    await expect(who.query(api.mentorInvites.forEventSummary, { eventId: f.ids.event })).rejects.toThrow("Only a Coach or Travel Lead can manage Mentor invitations.");
    await expect(who.mutation(api.mentorInvites.addMentorInvites, { eventId: f.ids.event, mentorUserIds: [f.ids.target.id] })).rejects.toThrow("Only a Coach or Travel Lead can manage Mentor invitations.");
    await expect(who.mutation(api.mentorInvites.removeMentorInvite, { eventId: f.ids.event, mentorUserId: f.ids.target.id })).rejects.toThrow("Only a Coach or Travel Lead can manage Mentor invitations.");
    await expect(who.mutation(api.admin.createEvent, eventArgs())).rejects.toThrow("Only a Coach or Travel Lead can create events.");
    expect(await f.inviteCount()).toBe(1);
    expect((await f.t.run(ctx => ctx.db.query("events").take(10))).length).toBe(1);
  });

  it.each(allowed)("accepts %s for forEventSummary, addMentorInvites, removeMentorInvite and createEvent", async caller => {
    const f: Fixture = await fixture();
    const who = f.as(f.ids[caller]);
    expect(await who.mutation(api.mentorInvites.addMentorInvites, { eventId: f.ids.event, mentorUserIds: [f.ids.target.id] })).toBe(1);
    // Mentor sign-ups and answers (forEventSummary) are for a Coach or any Travel Lead, including a Parent acting as
    // one: Parents with a Mentor/Travel Lead grant are Mentors first, Parents second (owner decision, Nov 6 2026).
    const summary = await who.query(api.mentorInvites.forEventSummary, { eventId: f.ids.event });
    expect(summary.mentors).toEqual([expect.objectContaining({ mentorUserId: f.ids.target.id, status: "invited" })]);
    expect(summary.counts).toMatchObject({ invited: 1, accepted: 0 });
    await who.mutation(api.mentorInvites.removeMentorInvite, { eventId: f.ids.event, mentorUserId: f.ids.target.id });
    expect(await f.inviteCount()).toBe(0);
    const eventId = await who.mutation(api.admin.createEvent, eventArgs());
    expect((await f.t.run(ctx => ctx.db.get(eventId)))?.name).toBe("Build night");
  });
});
