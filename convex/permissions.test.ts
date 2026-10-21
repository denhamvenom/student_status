/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Coach" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid", name: "Parent" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const parent = await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "COACH-APPROVED-LOOKING-1", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Student", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const other = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Other", preferredName: "Other", email: "other@example.invalid", subteam: "B", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: student, active: true, createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic consent trip", type: "Team", startsAt: 100, endsAt: 200, destination: "School", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false });
    await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 1, updatedAt: 1 });
    return { coachAuth, parentAuth, student, other, event };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }) };
}

describe("permission draft gate", () => {
  it("blocks event-bearing draft legal consent even when the season version has no draft marker, without writes", async () => {
    const f = await fixture();
    const snapshot = () => f.t.run(async ctx => ({
      submissions: await ctx.db.query("permissionSubmissions").take(10),
      coverage: await ctx.db.query("permissionCoverage").take(10),
      audit: await ctx.db.query("audit").take(10),
      student: await ctx.db.get(f.ids.student),
      participants: await ctx.db.query("participants").take(10),
    }));
    const before = await snapshot();
    for (const eventIds of [[], [f.ids.event]]) {
      await expect(f.parent.mutation(api.permissions.submit, { studentId: f.ids.student, eventIds, typedName: "Parent", answersJson: "{}" })).rejects.toThrow("draft");
      expect(await snapshot()).toEqual(before);
    }
  });

  it("retains role and student-scope checks while submission is closed", async () => {
    const f = await fixture();
    const args = { studentId: f.ids.other, eventIds: [], typedName: "Parent", answersJson: "{}" };
    await expect(f.parent.mutation(api.permissions.submit, args)).rejects.toThrow("permission");
    await expect(f.parent.query(api.permissions.listSubmissions, { studentId: f.ids.other })).rejects.toThrow("permission");
    await expect(f.coach.mutation(api.permissions.submit, { ...args, studentId: f.ids.student })).rejects.toThrow("Only a linked parent");
    expect(await f.parent.query(api.permissions.listSubmissions, { studentId: f.ids.student })).toEqual([]);
  });
});

it("allows Coach and Travel Lead to request a new signature, but not an ordinary Mentor", async () => {
  const f = await fixture();
  const ids = await f.t.run(async ctx => {
    const season = await ctx.db.query("seasons").take(1).then(rows => rows[0]);
    const leadAuth = await ctx.db.insert("users", {email: "lead@example.invalid", name: "Travel Lead"});
    const mentorAuth = await ctx.db.insert("users", {email: "mentor@example.invalid", name: "Mentor"});
    await ctx.db.insert("appUsers", {authUserId: leadAuth, email: "lead@example.invalid", name: "Travel Lead", role: "mentor", active: true, travelLead: true, financialEdit: false});
    await ctx.db.insert("appUsers", {authUserId: mentorAuth, email: "mentor@example.invalid", name: "Mentor", role: "mentor", active: true, travelLead: false, financialEdit: false});
    const eventId = await ctx.db.insert("events", {seasonId: season._id, name: "Fictional trip", type: "Team", startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, destination: "School", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false});
    await ctx.db.insert("participants", {eventId, studentId: f.ids.student, status: "confirmed", createdAt: 1, updatedAt: 1});
    return {leadAuth, mentorAuth, eventId};
  });
  const lead = f.t.withIdentity({subject: `${ids.leadAuth}|session`});
  const mentor = f.t.withIdentity({subject: `${ids.mentorAuth}|session`});
  const request = (revision:number) => ({studentId: f.ids.student, eventIds: [ids.eventId], expectedCoverage: [{eventId: ids.eventId, revision}], reason: "Fictional updated details"});
  await expect(mentor.mutation(api.permissions.requestNewSignature, request(0))).rejects.toThrow("Coach or Travel Lead");
  await expect(f.coach.mutation(api.permissions.requestNewSignature, request(0))).resolves.toBeNull();
  await expect(lead.mutation(api.permissions.requestNewSignature, request(1))).resolves.toBeNull();
  const requests = await f.t.run(ctx => ctx.db.query("permissionSignatureRequests").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).take(3));
  expect(requests).toHaveLength(2);
});
