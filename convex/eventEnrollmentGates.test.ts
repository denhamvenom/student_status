/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

async function fixture(state: "running" | "failed") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const studentAuth = await ctx.db.insert("users", { email: "student@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const studentUser = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser, legalName: "Synthetic Student", preferredName: "Student", email: "student@example.invalid", active: true, travelTeam: false, subteam: "A", roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Provisioning", type: "Team", startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, destination: "School", travel: "Bus", overnight: true, roomingEnabled: true, feeCents: 0, signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 1, enrollmentState: state, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 0, updatedAt: 0 });
    const driver = await ctx.db.insert("drivers", { seasonId: season, name: "Driver", phone: "555-0100", email: "driver@example.invalid", seats: 4, approved: true, active: true });
    return { coachAuth, studentAuth, student, event, driver };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), student: t.withIdentity({ subject: `${ids.studentAuth}|session` }) };
}

describe.each(["running", "failed"] as const)("%s Whole Team provisioning gates", state => {
  it("blocks finance, both driver paths, travel, rooms and withdrawal without writes", async () => {
    const f = await fixture(state);
    const eventId = f.ids.event;
    await expect(f.coach.mutation(api.finance.createCharge, { eventId, studentId: f.ids.student, label: "Extra", amountCents: 100, priority: 1, idempotencyKey: "pending-charge" })).rejects.toThrow("must finish");
    await expect(f.coach.mutation(api.admin.assignDriver, { eventId, driverId: f.ids.driver, seats: 3 })).rejects.toThrow("must finish");
    await expect(f.coach.mutation(api.travel.assignVehicle, { eventId, driverId: f.ids.driver, seats: 3 })).rejects.toThrow("must finish");
    await expect(f.coach.mutation(api.travel.setEventTransport, { eventId, transportEnabled: true, busSeats: 5, additionalAdults: 0, trailerRequired: false })).rejects.toThrow("must finish");
    await expect(f.coach.mutation(api.travel.setIndependentTravel, { eventId, studentId: f.ids.student, independentTravel: true })).rejects.toThrow("must finish");
    await expect(f.student.mutation(api.travel.setIndependentTravel, { eventId, studentId: f.ids.student, independentTravel: true })).rejects.toThrow("Only a parent or Coach");
    await expect(f.coach.mutation(api.rooms.adultCreateGroup, { eventId, category: "Boys", name: "Room" })).rejects.toThrow("must finish");
    await expect(f.student.mutation(api.rooms.createGroup, { eventId, name: "Room" })).rejects.toThrow("must finish");
    await expect(f.student.mutation(api.withdrawals.requestWithdrawal, { eventId, idempotencyKey: "pending-withdrawal" })).rejects.toThrow("must finish");
    const writes = await f.t.run(async ctx => ({ charges: await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId)).collect(), vehicles: await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", eventId)).collect(), rooms: await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", eventId)).collect(), withdrawals: await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId)).collect() }));
    expect(writes).toEqual({ charges: [], vehicles: [], rooms: [], withdrawals: [] });
  });

  it("keeps partial workspaces readable and never reports event or student ready", async () => {
    const f = await fixture(state);
    const coach = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event });
    expect(coach).toMatchObject({ overall: "open", enrollmentState: state, students: [] });
    const student = await f.student.query(api.app.eventReadiness, { eventId: f.ids.event, studentId: f.ids.student });
    expect(student.students[0]).toMatchObject({ state: "open", open: ["Whole Team enrollment is not complete."] });
    expect((await f.coach.query(api.eventOperations.workspace, { eventId: f.ids.event })).event.enrollmentState).toBe(state);
  });
});
