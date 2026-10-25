/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
import { selectedEvents } from "./lib/consentSnapshot";
import { selectedEventsV2 } from "./lib/consentSnapshotV2";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@synthetic.test", name: "Coach" });
    const authLead = await ctx.db.insert("users", { email: "lead@synthetic.test", name: "Travel Lead" });
    const authMentor = await ctx.db.insert("users", { email: "mentor@synthetic.test", name: "Mentor" });
    const coachId = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@synthetic.test", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    await ctx.db.insert("appUsers", { authUserId: authLead, email: "lead@synthetic.test", name: "Travel Lead", role: "mentor", travelLead: true, financialEdit: false, active: true });
    await ctx.db.insert("appUsers", { authUserId: authMentor, email: "mentor@synthetic.test", name: "Mentor", role: "mentor", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coachId });
    const authStudents = [];
    const students = [];
    for (let i = 0; i < 7; i++) {
      const auth = await ctx.db.insert("users", { email: `student${i}@synthetic.test`, name: `Student ${i}` });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email: `student${i}@synthetic.test`, name: `Student ${i}`, role: "student", travelLead: false, financialEdit: false, active: true });
      const student = await ctx.db.insert("students", { seasonId: season, userId: app, legalName: `Student ${i}`, preferredName: `Student ${i}`, email: `student${i}@synthetic.test`, subteam: "Other", active: true, travelTeam: true, roomCategory: i === 6 ? "Girls" : "Boys", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
      authStudents.push(auth); students.push(student);
    }
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic Trip", type: "Competition", startsAt: Date.now() + 30 * 86400_000, endsAt: Date.now() + 31 * 86400_000, destination: "Test City", travel: "Bus", overnight: true, roomingEnabled: true, feeCents: 1000, signupMode: "approval", capacity: 1, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { authCoach, authLead, authMentor, authStudents, students, event };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.authCoach}|one` }), lead: t.withIdentity({ subject: `${ids.authLead}|one` }), mentor: t.withIdentity({ subject: `${ids.authMentor}|one` }), student: ids.authStudents.map(auth => t.withIdentity({ subject: `${auth}|one` })) };
}

describe("event operations", () => {

  it("keeps canceled events visible while blocking new signup, approval and roster charges", async () => {
    const f = await fixture();
    await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event });
    await f.lead.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.students[0], decision: "approve" });
    await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.event });
    const before = await f.t.run(async ctx => ({ participants: await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", f.ids.event)).take(20), charges: await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event)).take(20) }));
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { cancelled: true }));
    await expect(f.student[2].mutation(api.participation.signUp, { eventId: f.ids.event })).rejects.toThrow("unavailable");
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.students[2], status: "confirmed" })).rejects.toThrow("not found");
    await expect(f.lead.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.students[1], decision: "promote" })).rejects.toThrow("canceled");
    expect((await f.coach.query(api.eventOperations.workspace, { eventId: f.ids.event })).event.cancelled).toBe(true);
    expect((await f.student[0].query(api.app.eventDetail, { eventId: f.ids.event })).event.cancelled).toBe(true);
    const after = await f.t.run(async ctx => ({ participants: await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", f.ids.event)).take(20), charges: await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event)).take(20) }));
    expect(after).toEqual(before);
    const readiness = await f.student[0].query(api.app.eventReadiness, { eventId: f.ids.event, studentId: f.ids.students[0] });
    expect(readiness.students[0]).toMatchObject({ state: "open", open: ["This event is canceled."] });

    for (const select of [selectedEvents, selectedEventsV2]) {
      await expect(f.t.run(async ctx => select(ctx, (await ctx.db.get(f.ids.students[0]))!, [f.ids.event]))).rejects.toThrow("unavailable");
    }

  });

  it("approves a pending reserved seat at capacity, then manually promotes waitlist in signup order", async () => {
    const f = await fixture();
    expect(await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("pending");
    expect(await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("waitlist");
    expect(await f.student[2].mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("waitlist");
    await f.t.run(async ctx => {
      for (const [i, studentId] of f.ids.students.entries()) {
        if (i > 2) break;
        const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", studentId)).unique();
        await ctx.db.patch(p!._id, { createdAt: 1000 + i });
      }
    });
    await f.lead.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.students[0], decision: "approve" });
    await expect(f.lead.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.students[2], decision: "promote" })).rejects.toThrow("earliest");
    await f.coach.mutation(api.eventOperations.updateSettings, { eventId: f.ids.event, capacity: 2 });
    await expect(f.student[3].mutation(api.participation.signUp, { eventId: f.ids.event })).resolves.toBe("waitlist");
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.students[2], status: "confirmed" })).rejects.toThrow("waitlist");
    await f.lead.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.event, studentId: f.ids.students[1], decision: "promote" });
    const view = await f.coach.query(api.eventOperations.workspace, { eventId: f.ids.event });
    expect(view.waitlist.map((x: { studentId: string }) => x.studentId)).toEqual([f.ids.students[2], f.ids.students[3]]);
    const charges = await f.t.run(ctx => ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.students[1])).take(5));
    expect(charges).toHaveLength(1);
  });

  it("keeps room selection private and requires explicit leave and adult reasons after deadline", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { capacity: 6, signupMode: "open", feeCents: 0 }));
    for (let i = 0; i < 6; i++) await f.student[i].mutation(api.participation.signUp, { eventId: f.ids.event });
    const groupA = await f.student[0].mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "Alpha" });
    const groupB = await f.student[1].mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "Beta" });
    const inviteId = await f.student[0].mutation(api.rooms.invite, { groupId: groupA, studentId: f.ids.students[1] }).catch(() => null);
    expect(inviteId).toBeNull();
    const invite = await f.student[0].mutation(api.rooms.invite, { groupId: groupA, studentId: f.ids.students[2] });
    await f.t.run(ctx => ctx.db.patch(f.ids.students[0], { legalName: "Synthetic Full Student", preferredName: "Synthetic" }));
    const peerView = await f.student[2].query(api.rooms.eligiblePeers, { eventId: f.ids.event });
    expect(JSON.stringify(peerView)).not.toContain("groupId");
    expect(peerView.find(row => row.studentId === f.ids.students[0])).toMatchObject({ legalName: "Synthetic Full Student", preferredName: "Synthetic" });
    const groupView = await f.student[0].query(api.rooms.mine, { eventId: f.ids.event });
    expect(groupView.group?.members[0]).toMatchObject({ legalName: "Synthetic Full Student", preferredName: "Synthetic" });
    const mine = await f.student[2].query(api.rooms.mine, { eventId: f.ids.event });
    expect(mine.invites[0].groupName).toBe("Alpha");
    await f.student[2].mutation(api.rooms.respond, { inviteId: invite, accept: true });
    const cross = await f.student[1].mutation(api.rooms.invite, { groupId: groupB, studentId: f.ids.students[2] }).catch(() => null);
    expect(cross).toBeNull();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { roomDeadline: Date.now() - 1000 }));
    await expect(f.student[2].mutation(api.rooms.leave, { eventId: f.ids.event })).rejects.toThrow("unavailable");
    await expect(f.coach.mutation(api.rooms.adultAssign, { groupId: groupB, studentId: f.ids.students[2], allowFifth: false })).rejects.toThrow("reason");
    await f.coach.mutation(api.rooms.adultAssign, { groupId: groupB, studentId: f.ids.students[2], allowFifth: false, reason: "Coach correction" });
    await expect(f.lead.mutation(api.rooms.finalize, { groupId: groupB, allowFifth: false })).rejects.toThrow("reason");
    await f.lead.mutation(api.rooms.finalize, { groupId: groupB, allowFifth: false, reason: "Reviewed roster" });
  });

  it("keeps adult assignments role scoped and enforces category and five-person ceiling", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { capacity: 7, signupMode: "open", feeCents: 0 }));
    for (const student of f.student) await student.mutation(api.participation.signUp, { eventId: f.ids.event });
    const group = await f.student[0].mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "Test room" });
    await expect(f.student[1].mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[1], allowFifth: false })).rejects.toThrow("denied");
    await expect(f.mentor.mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[1], allowFifth: false })).rejects.toThrow("denied");
    await expect(f.coach.mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[6], allowFifth: false })).rejects.toThrow("category");
    for (let i = 1; i < 4; i++) await f.lead.mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[i], allowFifth: false });
    await expect(f.coach.mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[4], allowFifth: false })).rejects.toThrow("fifth");
    await expect(f.coach.mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[4], allowFifth: true })).rejects.toThrow("fifth");
    await f.coach.mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[4], allowFifth: true, reason: "Approved five-person room" });
    await expect(f.coach.mutation(api.rooms.adultAssign, { groupId: group, studentId: f.ids.students[5], allowFifth: true, reason: "Try sixth" })).rejects.toThrow("six");
    await expect(f.lead.mutation(api.rooms.finalize, { groupId: group, allowFifth: false, reason: "Reviewed" })).rejects.toThrow("fifth");
    await f.lead.mutation(api.rooms.finalize, { groupId: group, allowFifth: true, reason: "Approved five-person room" });
    const state = await f.coach.query(api.rooms.workspace, { eventId: f.ids.event });
    expect(state.groups.find((g: { _id: string }) => g._id === group)?.adultFifthException).toBe(true);
  });

  it("refuses silent singleton replacement and closes every student write after deadline", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { capacity: 7, signupMode: "open", feeCents: 0 }));
    for (const student of f.student) await student.mutation(api.participation.signUp, { eventId: f.ids.event });
    const first = await f.student[0].mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "First" });
    await f.student[1].mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "Second" });
    const staleInvite = await f.t.run(ctx => ctx.db.insert("roomInvites", { eventId: f.ids.event, groupId: first, studentId: f.ids.students[1], invitedBy: f.ids.students[0], status: "pending", createdAt: Date.now() }));
    await expect(f.student[1].mutation(api.rooms.respond, { inviteId: staleInvite, accept: true })).rejects.toThrow("Leave your current group");
    const liveInvite = await f.student[0].mutation(api.rooms.invite, { groupId: first, studentId: f.ids.students[2] });
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { roomDeadline: Date.now() - 1000 }));
    await expect(f.student[2].mutation(api.rooms.respond, { inviteId: liveInvite, accept: true })).rejects.toThrow("unavailable");
    await expect(f.student[2].mutation(api.rooms.respond, { inviteId: liveInvite, accept: false })).rejects.toThrow("unavailable");
    await expect(f.student[0].mutation(api.rooms.cancelInvite, { inviteId: liveInvite })).rejects.toThrow("unavailable");
    await expect(f.student[2].mutation(api.rooms.requestAssignment, { eventId: f.ids.event })).rejects.toThrow("unavailable");
    await expect(f.student[2].mutation(api.rooms.createGroup, { eventId: f.ids.event, name: "Too late" })).rejects.toThrow("unavailable");
    await expect(f.student[0].mutation(api.rooms.invite, { groupId: first, studentId: f.ids.students[3] })).rejects.toThrow("unavailable");
    await expect(f.student[0].mutation(api.rooms.leave, { eventId: f.ids.event })).rejects.toThrow("unavailable");
    const request = await f.t.run(ctx => ctx.db.insert("roomRequests", { eventId: f.ids.event, studentId: f.ids.students[3], requestedAt: Date.now() }));
    await expect(f.student[3].mutation(api.rooms.cancelAssignmentRequest, { eventId: f.ids.event })).rejects.toThrow("unavailable");
    expect(await f.t.run(ctx => ctx.db.get(request))).not.toBeNull();
  });
});
