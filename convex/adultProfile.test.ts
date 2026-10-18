/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const mentorAuth = await ctx.db.insert("users", { email: "mentor@example.invalid" });
    const leadAuth = await ctx.db.insert("users", { email: "lead@example.invalid" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const mentor = await ctx.db.insert("appUsers", { authUserId: mentorAuth, email: "mentor@example.invalid", name: "Mentor", role: "mentor", active: true, travelLead: false, financialEdit: false });
    const lead = await ctx.db.insert("appUsers", { authUserId: leadAuth, email: "lead@example.invalid", name: "Travel Lead", role: "mentor", active: true, travelLead: true, financialEdit: false });
    await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic season", year: 2026, status: "active", startsAt: 0, permissionVersion: "draft", createdBy: coach });
    return { coachAuth, mentorAuth, leadAuth, parentAuth, coach, mentor, lead, season };
  });
  const as = (auth: typeof ids.coachAuth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coachAuth), mentor: as(ids.mentorAuth), lead: as(ids.leadAuth), parent: as(ids.parentAuth) };
}
const fields = { expectedProfileRevision: 0, expectedDriverFingerprint: null, name: "Mentor Updated", phone: "555-0100", shirtSize: "L" as const, emergencyName: "Contact", emergencyRelationship: "Family", emergencyPhone: "555-0111", canDrive: false, vehicleName: "", passengerSeats: null, towCapable: false };

describe("adult own profile", () => {
  it("shows only auth-derived personal fields and denies Coach and Parent route access", async () => {
    const f = await fixture();
    expect(await f.mentor.query(api.adultProfile.own, {})).toMatchObject({ name: "Mentor", email: "mentor@example.invalid", role: "mentor", travelLead: false, driverState: "none", profileRevision: 0 });
    expect(await f.lead.query(api.adultProfile.own, {})).toMatchObject({ name: "Travel Lead", travelLead: true });
    await expect(f.coach.query(api.adultProfile.own, {})).rejects.toThrow("permission");
    await expect(f.parent.mutation(api.adultProfile.saveOwn, fields)).rejects.toThrow("permission");
    const saved = await f.mentor.mutation(api.adultProfile.saveOwn, fields);
    expect(saved).toEqual({ profileRevision: 1, driverState: "none" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor))).toMatchObject({ name: "Mentor Updated", phone: "555-0100", shirtSize: "L", emergencyName: "Contact", emergencyRelationship: "Family", emergencyPhone: "555-0111", profileRevision: 1, role: "mentor", travelLead: false });
    await expect(f.mentor.mutation(api.adultProfile.saveOwn, fields)).rejects.toThrow("Profile changed");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.lead))).toMatchObject({ name: "Travel Lead" });
  });

  it("creates an unapproved owned driver and resets approval after self-edits or disabling", async () => {
    const f = await fixture();
    const drive = { ...fields, canDrive: true, vehicleName: "Minivan", passengerSeats: 6 };
    expect(await f.mentor.mutation(api.adultProfile.saveOwn, drive)).toEqual({ profileRevision: 1, driverState: "owned" });
    const own = await f.mentor.query(api.adultProfile.own, {});
    expect(own).toMatchObject({ canDrive: true, approved: false, vehicleName: "Minivan", passengerSeats: 6 });
    const driver = await f.t.run(ctx => ctx.db.query("drivers").withIndex("by_seasonId_and_ownerAppUserId", q => q.eq("seasonId", f.ids.season).eq("ownerAppUserId", f.ids.mentor)).unique());
    if (!driver) throw new Error("Owned driver missing");
    await f.coach.mutation(api.travel.saveDriver, { driverId: driver._id, name: driver.name, email: driver.email, phone: driver.phone, vehicleName: driver.vehicleName!, seats: driver.seats, approved: true, towCapable: false, active: true });
    const approved = await f.mentor.query(api.adultProfile.own, {});
    expect(approved.approved).toBe(true);
    await expect(f.mentor.mutation(api.adultProfile.saveOwn, { ...drive, expectedProfileRevision: 1, expectedDriverFingerprint: own.driverFingerprint, vehicleName: "Van" })).rejects.toThrow("Driving details changed");
    await f.mentor.mutation(api.adultProfile.saveOwn, { ...drive, expectedProfileRevision: 1, expectedDriverFingerprint: approved.driverFingerprint, vehicleName: "Van" });
    expect(await f.t.run(ctx => ctx.db.get(driver._id))).toMatchObject({ ownerAppUserId: f.ids.mentor, vehicleName: "Van", approved: false, active: true });
    await f.coach.mutation(api.travel.saveDriver, { driverId: driver._id, name: "Mentor Updated", email: "mentor@example.invalid", phone: "555-0100", vehicleName: "Van", seats: 6, approved: true, towCapable: false, active: true });
    const current = await f.mentor.query(api.adultProfile.own, {});
    await f.mentor.mutation(api.adultProfile.saveOwn, { ...drive, expectedProfileRevision: 2, expectedDriverFingerprint: current.driverFingerprint, canDrive: false });
    expect(await f.t.run(ctx => ctx.db.get(driver._id))).toMatchObject({ active: false, approved: false });
    const history = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "drivers").eq("entityId", driver._id)).take(10));
    expect(history.map(row => row.action)).toEqual(["selfCreate", "update", "selfUpdate", "update", "selfDisable"]);
    expect(history[2].beforeJson).toContain('"approved":true');
    expect(history[2].afterJson).toContain('"approved":false');
  });

  it("keeps an unowned same-email driver for Coach reconciliation while saving unrelated profile fields", async () => {
    const f = await fixture();
    const unowned = await f.t.run(ctx => ctx.db.insert("drivers", { seasonId: f.ids.season, name: "Existing", email: "mentor@example.invalid", phone: "555-9999", seats: 4, approved: true, active: true }));
    expect((await f.mentor.query(api.adultProfile.own, {})).driverState).toBe("coachReviewRequired");
    const result = await f.mentor.mutation(api.adultProfile.saveOwn, { ...fields, canDrive: true, vehicleName: "Car", passengerSeats: 2 });
    expect(result).toEqual({ profileRevision: 1, driverState: "coachReviewRequired" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor))).toMatchObject({ name: "Mentor Updated", shirtSize: "L" });
    const unchanged = await f.t.run(ctx => ctx.db.get(unowned));
    expect(unchanged).toMatchObject({ name: "Existing", approved: true });
    expect(unchanged).not.toHaveProperty("ownerAppUserId");
    const seasonDrivers = await f.t.run(ctx => ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).collect());
    expect(seasonDrivers).toHaveLength(1);
  });

  it("allows only a Coach to link a verified exact match with stale fences, reason and approval reset", async () => {
    const f = await fixture();
    const driverId = await f.t.run(ctx => ctx.db.insert("drivers", { seasonId: f.ids.season, name: "Existing", email: "MENTOR@example.invalid", phone: "555-9999", seats: 4, approved: true, active: true }));
    const [candidate] = await f.coach.query(api.adultProfile.ownerReconciliationCandidates, {});
    expect(candidate).toMatchObject({ driverId, mentorId: f.ids.mentor, profileRevision: 0 });
    await expect(f.lead.query(api.adultProfile.ownerReconciliationCandidates, {})).rejects.toThrow("permission");
    const request = { driverId, mentorId: f.ids.mentor, expectedDriverFingerprint: candidate.driverFingerprint, expectedProfileRevision: 0, reason: "Verified Google email and existing driver history" };
    await expect(f.lead.mutation(api.adultProfile.linkDriverOwner, request)).rejects.toThrow("permission");
    await expect(f.coach.mutation(api.adultProfile.linkDriverOwner, { ...request, reason: "short" })).rejects.toThrow("at least 10");
    await f.mentor.mutation(api.adultProfile.saveOwn, fields);
    await expect(f.coach.mutation(api.adultProfile.linkDriverOwner, request)).rejects.toThrow("Review again");
    const refreshed = (await f.coach.query(api.adultProfile.ownerReconciliationCandidates, {}))[0];
    await f.coach.mutation(api.travel.saveDriver, { driverId, name: "Existing", email: "MENTOR@example.invalid", phone: "555-9999", vehicleName: "Van", seats: 4, approved: true, towCapable: false, active: true });
    await expect(f.coach.mutation(api.adultProfile.linkDriverOwner, { ...request, expectedProfileRevision: 1, expectedDriverFingerprint: refreshed.driverFingerprint })).rejects.toThrow("Review again");
    const latest = (await f.coach.query(api.adultProfile.ownerReconciliationCandidates, {}))[0];
    await f.coach.mutation(api.adultProfile.linkDriverOwner, { ...request, expectedProfileRevision: 1, expectedDriverFingerprint: latest.driverFingerprint });
    expect(await f.t.run(ctx => ctx.db.get(driverId))).toMatchObject({ ownerAppUserId: f.ids.mentor, approved: false, active: true, name: "Existing" });
    expect((await f.mentor.query(api.adultProfile.own, {})).driverState).toBe("owned");
    await expect(f.coach.mutation(api.adultProfile.linkDriverOwner, { ...request, expectedProfileRevision: 1, expectedDriverFingerprint: latest.driverFingerprint })).rejects.toThrow("unowned driver");
    const audits = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "drivers").eq("entityId", driverId)).take(10));
    expect(audits.some(row => row.action === "linkDriverOwner" && row.reason === request.reason && row.beforeJson?.includes('"approved":true') && row.afterJson?.includes('"approved":false'))).toBe(true);
  });

  it("lets a reactivated active Mentor reconcile while retaining historical archivedAt", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor, { active: true, archivedAt: Date.parse("2025-08-01T00:00:00Z") }));
    const driverId = await f.t.run(ctx => ctx.db.insert("drivers", { seasonId: f.ids.season, name: "Existing", email: "mentor@example.invalid", phone: "555-9999", seats: 4, approved: true, active: true }));
    const [candidate] = await f.coach.query(api.adultProfile.ownerReconciliationCandidates, {});
    expect(candidate).toMatchObject({ driverId, mentorId: f.ids.mentor });
    await f.coach.mutation(api.adultProfile.linkDriverOwner, { driverId, mentorId: f.ids.mentor, expectedDriverFingerprint: candidate.driverFingerprint, expectedProfileRevision: candidate.profileRevision, reason: "Reactivated Mentor verified by Google email" });
    expect(await f.t.run(ctx => ctx.db.get(driverId))).toMatchObject({ ownerAppUserId: f.ids.mentor, approved: false });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor))).toMatchObject({ active: true, archivedAt: Date.parse("2025-08-01T00:00:00Z") });
  });

  it("rejects mismatched identity, owned duplicates and operational duplicate-email writes", async () => {
    const f = await fixture();
    const unowned = await f.t.run(ctx => ctx.db.insert("drivers", { seasonId: f.ids.season, name: "Existing", email: "not-mentor@example.invalid", phone: "555-9999", seats: 4, approved: false, active: true }));
    await expect(f.coach.mutation(api.adultProfile.linkDriverOwner, { driverId: unowned, mentorId: f.ids.mentor, expectedDriverFingerprint: "stale", expectedProfileRevision: 0, reason: "Claimed match with no matching email" })).rejects.toThrow("emails must match");
    await f.t.run(ctx => ctx.db.patch(unowned, { email: "mentor@example.invalid" }));
    const candidate = (await f.coach.query(api.adultProfile.ownerReconciliationCandidates, {}))[0];
    const driverFields = { name: "Another", email: "MENTOR@example.invalid", phone: "555-0000", vehicleName: "Car", seats: 3, approved: true, towCapable: false, active: true };
    await expect(f.coach.mutation(api.travel.saveDriver, driverFields)).rejects.toThrow("already uses this email");
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.lead, { email: "MENTOR@example.invalid" }); await ctx.db.patch(f.ids.leadAuth, { email: "MENTOR@example.invalid" }); });
    await expect(f.coach.mutation(api.adultProfile.linkDriverOwner, { driverId: unowned, mentorId: f.ids.mentor, expectedDriverFingerprint: candidate.driverFingerprint, expectedProfileRevision: 0, reason: "Verified driver identity but duplicate Mentor" })).rejects.toThrow("Duplicate Mentor identity");
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.lead, { email: "lead@example.invalid" }); await ctx.db.patch(f.ids.leadAuth, { email: "lead@example.invalid" }); });
    const ownedId = await f.t.run(ctx => ctx.db.insert("drivers", { seasonId: f.ids.season, ownerAppUserId: f.ids.mentor, name: "Mentor", email: "mentor@example.invalid", phone: "555-1111", seats: 2, approved: false, active: true }));
    await expect(f.coach.mutation(api.adultProfile.linkDriverOwner, { driverId: unowned, mentorId: f.ids.mentor, expectedDriverFingerprint: candidate.driverFingerprint, expectedProfileRevision: 0, reason: "Verified duplicated ownership needs review" })).rejects.toThrow("already has a driver");
    await expect(f.coach.mutation(api.travel.saveDriver, { ...driverFields, driverId: ownedId, email: "changed@example.invalid" })).rejects.toThrow("must match its Mentor account");
    expect(await f.t.run(ctx => ctx.db.get(unowned))).not.toHaveProperty("ownerAppUserId");
  });
});
