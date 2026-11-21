/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "coach", role: "coach", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic trip", type: "Competition", startsAt: Date.now() + 86_400_000, endsAt: Date.now() + 2 * 86_400_000, destination: "Example", travel: "Team Carpool", transportEnabled: true, overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    const driver = await ctx.db.insert("drivers", { seasonId: season, name: "Synthetic Driver", email: "driver@example.invalid", phone: "(202) 555-0100", seats: 4, approved: true, active: true });
    return { auth, season, event, driver };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}

describe("driver no longer approved on an upcoming event", () => {
  it.each([
    ["approval removed", { approved: false }, "approvalRemoved"],
    ["stopped driving", { active: false }, "stoppedDriving"],
  ])("keeps the vehicle assigned and flags it when %s", async (_label, change, reason) => {
    const f = await fixture();
    await f.coach.mutation(api.travel.assignVehicle, { eventId: f.ids.event, driverId: f.ids.driver, seats: 3 });
    const before = await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event });
    expect(before.assignments[0].driverIssue).toBeNull();

    await f.t.run(ctx => ctx.db.patch(f.ids.driver, change));
    const after = await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event });
    expect(after.assignments).toHaveLength(1);
    expect(after.assignments[0]).toMatchObject({ driverId: f.ids.driver, driverNoLongerApproved: true, driverIssue: reason });
    expect(after.summary.vehicleSeats).toBe(0);
  });

  it("flags a vehicle whose driver record is gone", async () => {
    const f = await fixture();
    await f.coach.mutation(api.travel.assignVehicle, { eventId: f.ids.event, driverId: f.ids.driver, seats: 3 });
    await f.t.run(ctx => ctx.db.delete(f.ids.driver));
    const after = await f.coach.query(api.travel.eventTransport, { eventId: f.ids.event });
    expect(after.assignments[0]).toMatchObject({ driverNoLongerApproved: true, driverIssue: "driverMissing" });
  });
});
