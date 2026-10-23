/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
import { ensureFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "parent" | "student", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, travelLead, financialEdit: false, active: true });
      return { auth, user };
    }
    const coach = await account("coach", "coach");
    const lead = await account("lead", "mentor", true);
    const mentor = await account("mentor", "mentor");
    const parent = await account("parent", "parent");
    const studentUser = await account("student", "student");
    const otherUser = await account("other", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const oldSeason = await ctx.db.insert("seasons", { name: "Old Synthetic", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    async function student(userId: typeof studentUser.user, name: string) { return ctx.db.insert("students", { seasonId: season, userId, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }); }
    const studentId = await student(studentUser.user, "student");
    const otherId = await student(otherUser.user, "other");
    await ensureFinancialAccount(ctx, studentId);
    await ensureFinancialAccount(ctx, otherId);
    await ctx.db.insert("familyLinks", { parentUserId: parent.user, studentId, active: true, createdBy: coach.user });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic trip", type: "Competition", startsAt: 100, endsAt: 200, destination: "Example", travel: "Vehicles", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    const oldEvent = await ctx.db.insert("events", { seasonId: oldSeason, name: "Old", type: "Team", startsAt: 1, endsAt: 2, destination: "Example", travel: "Vehicles", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
    const participant = await ctx.db.insert("participants", { eventId: event, studentId, status: "confirmed", createdAt: 0, updatedAt: 0 });
    await ctx.db.insert("participants", { eventId: event, studentId: otherId, status: "confirmed", createdAt: 0, updatedAt: 0 });
    for (const targetStudentId of [studentId,otherId]) await ctx.db.insert("firstRegistrationStates",{studentId:targetStudentId,seasonId:season,status:"verified",revision:1,teamAccepted:true,consentRelease:true,verifiedBy:coach.user,verifiedAt:0});
    return { coach, lead, mentor, parent, studentUser, otherUser, season, studentId, otherId, event, oldEvent, participant };
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), lead: as(ids.lead.auth), mentor: as(ids.mentor.auth), parent: as(ids.parent.auth), student: as(ids.studentUser.auth), other: as(ids.otherUser.auth) };
}

describe("travel operations", () => {
  it.each(["Charter Bus", "School Bus", "Team Carpool", "Provide your Own"])("creates an event with %s transportation", async travel => {
    const f = await fixture();
    const eventId = await f.coach.mutation(api.admin.createEvent, { name: "Synthetic transport event", type: "Team", startsAt: 100, endsAt: 200, destination: "Test venue", travel, overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] });
    expect(await f.t.run(ctx => ctx.db.get(eventId))).toMatchObject({ travel, transportEnabled: travel !== "Provide your Own" });
    expect((await f.coach.query(api.travel.eventTransport, { eventId })).summary.state).toBe(travel === "Provide your Own" ? "notApplicable" : "ready");
  });

  it("disables ride management for own transportation and preserves prior records", async () => {
    const f = await fixture();
    const driver = await f.coach.mutation(api.travel.saveDriver, { name: "Test Driver", email: "transport@example.invalid", phone: "(202) 555-0100", vehicleName: "Van", seats: 3, approved: true, towCapable: false, active: true });
    await f.coach.mutation(api.travel.assignVehicle, { eventId: f.ids.event, driverId: driver, seats: 3 });
    const settings = { eventId: f.ids.event, transportEnabled: true, busSeats: 0, additionalAdults: 0, trailerRequired: false };
    await f.coach.mutation(api.travel.setEventTransport, { ...settings, travel: "Provide your Own" });
    const data = await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event });
    expect(data).toMatchObject({ event: { travel: "Provide your Own", transportEnabled: false }, drivers: [], assignments: [], riders: [], summary: { state: "notApplicable", demand: 0, open: [] } });
    const linked = { eventId: f.ids.event, studentId: f.ids.studentId };
    expect(await f.parent.query(api.travel.ownTravel, linked)).toMatchObject({ transportEnabled: false });
    await expect(f.coach.mutation(api.travel.assignVehicle, { eventId: f.ids.event, driverId: driver, seats: 2 })).rejects.toThrow("does not manage");
    await expect(f.coach.mutation(api.travel.removeVehicle, { eventId: f.ids.event, driverId: driver })).rejects.toThrow("does not manage");
    await expect(f.parent.mutation(api.travel.setIndependentTravel, { ...linked, independentTravel: true })).rejects.toThrow("does not manage");
    await expect(f.coach.mutation(api.travel.setEventTransport, settings)).rejects.toThrow("Choose team transportation");
    for (const travel of ["Charter Bus", "School Bus", "Team Carpool"] as const) {
      await f.coach.mutation(api.travel.setEventTransport, { ...settings, travel });
      const managed = await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event });
      expect(managed.event.transportEnabled).toBe(true);
      expect(managed.assignments).toHaveLength(1);
      expect(managed.riders).toHaveLength(2);
    }
  });

  it("restricts parent travel reads and writes to current linked children without rejected writes", async () => {
    const f = await fixture();
    const linked = { eventId: f.ids.event, studentId: f.ids.studentId };
    expect(await f.parent.query(api.travel.ownTravel, linked)).toEqual({ independentTravel: false, eligible: true, transportEnabled: true });
    await f.parent.mutation(api.travel.setIndependentTravel, { ...linked, independentTravel: true });
    expect(await f.parent.query(api.travel.ownTravel, linked)).toEqual({ independentTravel: true, eligible: true, transportEnabled: true });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.participant))).toMatchObject({ independentTravel: true });
    const snapshot = () => f.t.run(async ctx => ({ participants: await ctx.db.query("participants").take(10), audit: await ctx.db.query("audit").take(10) }));
    const deny = async (studentId: typeof f.ids.studentId) => {
      const before = await snapshot();
      await expect(f.parent.query(api.travel.ownTravel, { eventId: f.ids.event, studentId })).rejects.toThrow("permission");
      await expect(f.parent.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId, independentTravel: false })).rejects.toThrow("permission");
      expect(await snapshot()).toEqual(before);
    };
    await deny(f.ids.otherId);
    await f.t.run(async ctx => {
      const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", f.ids.parent.user).eq("studentId", f.ids.studentId)).unique();
      if (!link) throw new Error("Missing synthetic family link");
      await ctx.db.patch(link._id, { active: false });
    });
    await deny(f.ids.studentId);
  });
  it("enforces operator roles, active event and season, and valid seat counts", async () => {
    const f = await fixture();
    const settings = { eventId: f.ids.event, transportEnabled: true, busSeats: 2, additionalAdults: 0, trailerRequired: false };
    await expect(f.t.mutation(api.travel.setEventTransport, settings)).rejects.toThrow();
    await expect(f.mentor.mutation(api.travel.setEventTransport, settings)).rejects.toThrow("Travel operations");
    await expect(f.parent.mutation(api.travel.setEventTransport, settings)).rejects.toThrow("Travel operations");
    await expect(f.coach.mutation(api.travel.setEventTransport, { ...settings, eventId: f.ids.oldEvent })).rejects.toThrow("active season");
    await expect(f.coach.mutation(api.travel.setEventTransport, { ...settings, busSeats: 1.5 })).rejects.toThrow("whole number");
    await expect(f.coach.mutation(api.travel.setEventTransport, { ...settings, additionalAdults: -1 })).rejects.toThrow("whole number");
    await f.lead.mutation(api.travel.setEventTransport, settings);
    expect((await f.lead.query(api.travel.eventTransport, { eventId: f.ids.event })).summary.state).toBe("ready");
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { archived: true }));
    await expect(f.lead.query(api.travel.eventTransport, { eventId: f.ids.event })).rejects.toThrow("unavailable");
  });

  it("counts current riders and adults, excludes independent students and withdrawn participation", async () => {
    const f = await fixture();
    await f.coach.mutation(api.travel.setEventTransport, { eventId: f.ids.event, transportEnabled: true, busSeats: 2, additionalAdults: 1, trailerRequired: false });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary).toMatchObject({ state: "open", seats: 2, demand: 3, ridingStudents: 2 });
    await expect(f.other.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId: f.ids.studentId, independentTravel: true })).rejects.toThrow("Only a parent or Coach");
    await expect(f.student.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId: f.ids.studentId, independentTravel: true })).rejects.toThrow("Only a parent or Coach");
    await f.parent.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId: f.ids.studentId, independentTravel: true });
    const overview = await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event });
    expect(overview.summary).toMatchObject({ state: "ready", demand: 2, ridingStudents: 1 });
    expect(overview.riders).toEqual(expect.arrayContaining([{ studentId: f.ids.studentId, name: "student", independentTravel: true }]));
    expect(overview.riders[0]).not.toHaveProperty("email");
    await expect(f.lead.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId: f.ids.studentId, independentTravel: false })).rejects.toThrow("Only a parent or Coach");
    await f.coach.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId: f.ids.studentId, independentTravel: false });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary.demand).toBe(3);
    await f.coach.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId: f.ids.studentId, independentTravel: true });
    await f.t.run(ctx => ctx.db.patch(f.ids.participant, { status: "withdrawn" }));
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary.demand).toBe(2);
    await f.t.run(async ctx => { const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.otherId)).unique(); if (p) await ctx.db.patch(p._id, { status: "withdrawn" }); });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary).toMatchObject({ demand: 1, ridingStudents: 0 });
    await expect(f.parent.mutation(api.travel.setIndependentTravel, { eventId: f.ids.event, studentId: f.ids.studentId, independentTravel: false })).rejects.toThrow("confirmed");
  });

  it("requires approved assigned tow driver and reacts to driver downgrade or removal", async () => {
    const f = await fixture();
    const driverArgs = { name: "Synthetic Driver", email: "driver@example.invalid", phone: "(202) 555-0100", vehicleName: "Van", seats: 3, approved: true, towCapable: true, active: true };
    const driver = await f.coach.mutation(api.travel.saveDriver, driverArgs);
    await f.coach.mutation(api.travel.setEventTransport, { eventId: f.ids.event, transportEnabled: true, busSeats: 0, additionalAdults: 0, trailerRequired: true });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary.state).toBe("open");
    await expect(f.coach.mutation(api.travel.assignVehicle, { eventId: f.ids.event, driverId: driver, seats: 4 })).rejects.toThrow("exceed");
    await f.coach.mutation(api.travel.saveDriver, { ...driverArgs, driverId: driver, active: false });
    await expect(f.coach.mutation(api.travel.assignVehicle, { eventId: f.ids.event, driverId: driver, seats: 2 })).rejects.toThrow("active driver");
    await f.coach.mutation(api.travel.saveDriver, { ...driverArgs, driverId: driver });
    await f.coach.mutation(api.travel.assignVehicle, { eventId: f.ids.event, driverId: driver, seats: 2 });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary.state).toBe("ready");
    await f.coach.mutation(api.travel.saveDriver, { ...driverArgs, driverId: driver, seats: 1 });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary).toMatchObject({ state: "open", seats: 1 });
    await f.coach.mutation(api.travel.saveDriver, { ...driverArgs, driverId: driver, seats: 3, approved: false });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary).toMatchObject({ state: "open", seats: 0 });
    await f.coach.mutation(api.travel.saveDriver, { ...driverArgs, driverId: driver });
    await f.coach.mutation(api.travel.removeVehicle, { eventId: f.ids.event, driverId: driver });
    expect((await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event })).summary.open).toEqual(expect.arrayContaining([expect.stringContaining("tow-capable")]));
  });

  it("includes transport in ordinary mentor overall readiness without exposing transport details", async () => {
    const f = await fixture();
    const data = await f.mentor.query(api.app.eventReadiness, { eventId: f.ids.event });
    expect(data.overall).toBe("open");
    expect(data.transportation).toBeNull();
    expect(data.students).toEqual([]);
    await f.coach.mutation(api.travel.setEventTransport, { eventId: f.ids.event, transportEnabled: false, busSeats: 0, additionalAdults: 0, trailerRequired: false });
    const withoutTransport = await f.mentor.query(api.app.eventReadiness, { eventId: f.ids.event });
    expect(withoutTransport.overall).toBe("ready");
    expect(withoutTransport.transportation).toBeNull();
  });

  it("rejects a driver beyond the bounded list without changing existing records", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 200; i++) await ctx.db.insert("drivers", { seasonId: f.ids.season, name: `Driver ${i}`, email: `driver${i}@example.invalid`, phone: "(202) 555-0100", seats: 2, approved: true });
    });
    const args = { name: "Overflow", email: "overflow@example.invalid", phone: "(202) 555-0100", vehicleName: "Van", seats: 2, approved: true, towCapable: false, active: true };
    await expect(f.coach.mutation(api.travel.saveDriver, args)).rejects.toThrow("Driver limit");
    const records = await f.coach.query(api.travel.listDrivers, {});
    expect(records).toHaveLength(200);
    expect(records.some((d: { name: string }) => d.name === "Overflow")).toBe(false);
  });

  it("keeps readiness open when financial or requirement evidence exceeds its supported bound", async () => {
    const f = await fixture();
    await f.coach.mutation(api.travel.setEventTransport, { eventId: f.ids.event, transportEnabled: false, busSeats: 0, additionalAdults: 0, trailerRequired: false });
    expect((await f.mentor.query(api.app.eventReadiness, { eventId: f.ids.event })).overall).toBe("ready");
    const charges = await f.t.run(async ctx => {
      const ids = [];
      for (let i = 0; i < 101; i++) ids.push(await ctx.db.insert("charges", { studentId: f.ids.studentId, eventId: f.ids.event, label: "Synthetic settled charge", amountCents: 1, appliedCents: 1, priority: i, createdBy: f.ids.coach.user, createdAt: i }));
      return ids;
    });
    expect((await f.mentor.query(api.app.eventReadiness, { eventId: f.ids.event })).overall).toBe("open");
    await f.t.run(async ctx => {
      for (const id of charges) await ctx.db.delete(id);
      for (let i = 0; i < 101; i++) {
        await ctx.db.insert("requirements", { eventId: f.ids.event, key: `synthetic-${i}`, label: "Synthetic requirement" });
        await ctx.db.insert("requirementCompletions", { eventId: f.ids.event, studentId: f.ids.studentId, key: `synthetic-${i}`, completedBy: f.ids.coach.user, completedAt: i });
        await ctx.db.insert("requirementCompletions", { eventId: f.ids.event, studentId: f.ids.otherId, key: `synthetic-${i}`, completedBy: f.ids.coach.user, completedAt: i });
      }
    });
    expect((await f.mentor.query(api.app.eventReadiness, { eventId: f.ids.event })).overall).toBe("open");
  });
});
