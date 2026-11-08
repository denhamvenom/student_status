/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const hour = 3_600_000;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("ab-coach", "coach"), lead = await account("ab-lead", "mentor", true), mentor = await account("ab-mentor", "mentor"), other = await account("ab-other", "mentor"), parent = await account("ab-parent", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    async function student(name: string, subteam: string) {
      const user = await account(name, "student");
      const id = await ctx.db.insert("students", { seasonId: season, userId: user.id, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam, active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
      return { ...user, studentId: id };
    }
    return { coach, lead, mentor, other, parent, build: await student("ab-build", "Build"), elec: await student("ab-elec", "Electrical") };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor), other: as(ids.other), parent: as(ids.parent), build: as(ids.build), elec: as(ids.elec) };
}

const startsAt = Date.now() + 24 * hour;
const base = { name: "Synthetic meeting", type: "Team" as const, startsAt, endsAt: startsAt + 2 * hour, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: true, firstRequired: false, requirements: [] };
const events = (t: Awaited<ReturnType<typeof fixture>>["t"]) => t.run(ctx => ctx.db.query("events").take(20));

describe("secondary subteam, leadership and Mentor subteam permissions", () => {
  it("allows a Coach or Travel Lead to set a student's secondary subteam and Leadership, and nobody else", async () => {
    const f = await fixture();
    const args = { studentId: f.ids.build.studentId, secondarySubteam: "CAD" as const, leadership: true, expectedRevision: 0 };
    for (const who of [f.build, f.mentor, f.parent]) await expect(who.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, args)).rejects.toThrow("Coach or Travel Lead");
    await f.lead.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, args);
    await expect(f.coach.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, args)).rejects.toThrow("changed since");
    const row = await f.t.run(ctx => ctx.db.get(f.ids.build.studentId));
    expect(row).toMatchObject({ secondarySubteam: "CAD", leadership: true, profileRevision: 1 });
  });

  it("lets only a Coach set Mentor subteams, to a Mentor, from the allowed groups", async () => {
    const f = await fixture();
    const args = { userId: f.ids.mentor.id, subteams: ["Build", "CAD"] };
    await expect(f.lead.mutation(api.studentSubteams.setMentorSubteams, args)).rejects.toThrow("Only a Coach");
    await expect(f.mentor.mutation(api.studentSubteams.setMentorSubteams, args)).rejects.toThrow("Only a Coach");
    await expect(f.coach.mutation(api.studentSubteams.setMentorSubteams, { ...args, subteams: ["Leadership"] })).rejects.toThrow("from the list");
    await expect(f.coach.mutation(api.studentSubteams.setMentorSubteams, { userId: f.ids.build.id, subteams: ["Build"] })).rejects.toThrow("active Mentor");
    await f.coach.mutation(api.studentSubteams.setMentorSubteams, args);
    expect(await f.lead.query(api.studentSubteams.listMentorsForInvite, {})).toContainEqual({ id: f.ids.mentor.id, name: "ab-mentor", subteams: ["Build", "CAD"] });
    // A plain stored Mentor may read the minimized list (id, name, subteams only); students and parents may not.
    const asMentor = await f.mentor.query(api.studentSubteams.listMentorsForInvite, {});
    expect(asMentor).toContainEqual({ id: f.ids.mentor.id, name: "ab-mentor", subteams: ["Build", "CAD"] });
    for (const row of asMentor) expect(Object.keys(row).sort()).toEqual(["id", "name", "subteams"]);
    await expect(f.build.query(api.studentSubteams.listMentorsForInvite, {})).rejects.toThrow("Coach or Mentor");
    await expect(f.parent.query(api.studentSubteams.listMentorsForInvite, {})).rejects.toThrow("Coach or Mentor");
  });
});

describe("createEvent audiences", () => {
  it("keeps Coach-only mandatory group events away from Travel Leads", async () => {
    const f = await fixture();
    await expect(f.lead.mutation(api.admin.createEvent, { ...base, audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true })).rejects.toThrow("Only Coaches");
    await expect(f.lead.mutation(api.admin.createEvent, { ...base, audienceKind: "everyone", mandatory: true })).rejects.toThrow("Only Coaches");
    expect(await events(f.t)).toEqual([]);
    await f.lead.mutation(api.admin.createEvent, { ...base, audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: false });
    expect(await events(f.t)).toHaveLength(1);
  });

  it("clears travel details for a virtual event", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, { ...base, locationType: "virtual", overnight: true, roomingEnabled: true, travel: "Bus" });
    expect(await f.t.run(ctx => ctx.db.get(id))).toMatchObject({ locationType: "virtual", permissionRequired: false, overnight: false, roomingEnabled: false, transportEnabled: false });
  });

  it("only lets students in the audience sign up or see signup", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, { ...base, audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: false });
    await expect(f.elec.mutation(api.participation.signUp, { eventId: id })).rejects.toThrow("isn't open to your group");
    await expect(f.elec.query(api.participation.signupAvailability, { eventId: id })).rejects.toThrow("no longer available");
    expect(await f.build.mutation(api.participation.signUp, { eventId: id })).toBe("confirmed");
    const listed = await f.coach.mutation(api.admin.createEvent, { ...base, name: "Listed", audienceKind: "students", audienceStudentIds: [f.ids.elec.studentId] });
    await expect(f.build.mutation(api.participation.signUp, { eventId: listed })).rejects.toThrow("isn't open to your group");
    expect(await f.elec.mutation(api.participation.signUp, { eventId: listed })).toBe("confirmed");
  });

  it("leaves legacy events open to everyone", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, base);
    expect(await f.t.run(ctx => ctx.db.get(id))).not.toHaveProperty("audienceKind");
    expect(await f.elec.mutation(api.participation.signUp, { eventId: id })).toBe("confirmed");
  });

  it("enrolls matching students into a mandatory subteam event, and later joiners through secondary subteam", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, { ...base, audienceKind: "subteams", audienceSubteams: ["Build", "CAD"], mandatory: true });
    const job = await f.t.run(ctx => ctx.db.query("eventEnrollmentJobs").first());
    for (let i = 0; i < 3; i++) await f.t.mutation(internal.eventEnrollment.run, { jobId: job!._id });
    const on = () => f.t.run(async ctx => (await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", id)).take(10)).map(p => p.studentId));
    expect(await on()).toEqual([f.ids.build.studentId]);
    await f.coach.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, { studentId: f.ids.elec.studentId, secondarySubteam: "CAD", leadership: false, expectedRevision: 0 });
    expect((await on()).sort()).toEqual([f.ids.build.studentId, f.ids.elec.studentId].sort());
  });
});

describe("Mentor invitations", () => {
  it("invites once with one notification, and only the invited Mentor can answer", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, { ...base, mentorInviteUserIds: [f.ids.mentor.id, f.ids.mentor.id] });
    const invites = await f.t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", id)).take(10));
    expect(invites.map(i => [i.mentorUserId, i.status])).toEqual([[f.ids.mentor.id, "invited"]]);
    const notified = await f.t.run(async ctx => (await ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", f.ids.mentor.id)).take(5)).length);
    expect(notified).toBe(1);
    await expect(f.other.mutation(api.mentorInvites.respond, { eventId: id, status: "accepted" })).rejects.toThrow("no longer available");
    await expect(f.build.mutation(api.mentorInvites.respond, { eventId: id, status: "accepted" })).rejects.toThrow("Only a Mentor");
    await f.mentor.mutation(api.mentorInvites.respond, { eventId: id, status: "accepted" });
    expect((await f.t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", id)).take(10))).map(i => [i.mentorUserId, i.status])).toEqual([[f.ids.mentor.id, "accepted"]]);
  });

  it("adds only new Mentors later, lets a Travel Lead manage them, and rejects a Mentor doing so", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, { ...base, mentorInviteUserIds: [f.ids.mentor.id] });
    await expect(f.mentor.mutation(api.mentorInvites.addMentorInvites, { eventId: id, mentorUserIds: [f.ids.other.id] })).rejects.toThrow("Coach or Travel Lead");
    expect(await f.lead.mutation(api.mentorInvites.addMentorInvites, { eventId: id, mentorUserIds: [f.ids.mentor.id, f.ids.other.id] })).toBe(1);
    await expect(f.lead.mutation(api.mentorInvites.addMentorInvites, { eventId: id, mentorUserIds: [f.ids.build.id] })).rejects.toThrow("Mentors from the list");
    await f.lead.mutation(api.mentorInvites.removeMentorInvite, { eventId: id, mentorUserId: f.ids.other.id });
    expect((await f.t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", id)).take(10))).map(i => i.mentorUserId)).toEqual([f.ids.mentor.id]);
  });

  it("invites Mentors by subteam and requires a Mentor for mentor-only events", async () => {
    const f = await fixture();
    await f.coach.mutation(api.studentSubteams.setMentorSubteams, { userId: f.ids.mentor.id, subteams: ["Build"] });
    await expect(f.coach.mutation(api.admin.createEvent, { ...base, audienceKind: "mentorsOnly" })).rejects.toThrow("Invite at least one Mentor");
    const id = await f.coach.mutation(api.admin.createEvent, { ...base, audienceKind: "subteams", audienceSubteams: ["Build"], inviteSubteamMentors: true });
    const invites = await f.t.run(ctx => ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", id)).take(10));
    expect(invites.map(i => [i.mentorUserId, i.source])).toEqual([[f.ids.mentor.id, "subteam"]]);
  });
});
