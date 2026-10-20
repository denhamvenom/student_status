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
const basicFields = { expectedProfileRevision: 0, name: " Staff Updated ", phone: " +1 555-0100 ", shirtSize: "L" as const, emergencyName: " Contact ", emergencyRelationship: " Family ", emergencyPhone: " 555-0111 ext 5 " };

describe("staff basic setup", () => {
  it("recognizes complete legacy profiles and missing, whitespace or invalid-size profiles without writes", async () => {
    const f = await fixture();
    expect(await f.coach.query(api.adultProfile.ownBasics, {})).toMatchObject({ needsSetup: true, dismissed: false, role: "coach", profileRevision: 0 });
    expect(await f.lead.query(api.adultProfile.ownBasics, {})).toMatchObject({ needsSetup: true, role: "mentor" });
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor, { name: "Existing Mentor", phone: "555-0100", shirtSize: "M", emergencyName: "Contact", emergencyRelationship: "Family", emergencyPhone: "555-0111" }));
    expect(await f.mentor.query(api.adultProfile.ownBasics, {})).toMatchObject({ needsSetup: false, dismissed: false, profileRevision: 0 });
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor, { emergencyPhone: "   " }));
    expect((await f.mentor.query(api.adultProfile.ownBasics, {})).needsSetup).toBe(true);
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor, { emergencyPhone: "555-0111", shirtSize: "unknown" }));
    expect((await f.mentor.query(api.adultProfile.ownBasics, {})).needsSetup).toBe(true);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor))).not.toHaveProperty("profileRevision");
  });

  it("saves trimmed staff basics without changing drivers, email or privileges and fences stale updates", async () => {
    const f = await fixture();
    const driverId = await f.t.run(ctx => ctx.db.insert("drivers", { seasonId: f.ids.season, ownerAppUserId: f.ids.lead, name: "Approved Driver", email: "lead@example.invalid", phone: "555-0000", seats: 4, approved: true, active: true }));
    const driverBefore = await f.t.run(ctx => ctx.db.get(driverId));
    expect(await f.lead.mutation(api.adultProfile.saveBasics, basicFields)).toEqual({ profileRevision: 1 });
    expect(await f.lead.query(api.adultProfile.ownBasics, {})).toMatchObject({ name: "Staff Updated", phone: "+1 555-0100", emergencyName: "Contact", emergencyRelationship: "Family", emergencyPhone: "555-0111 ext 5", needsSetup: false });
    expect(await f.t.run(ctx => ctx.db.get(driverId))).toEqual(driverBefore);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.lead))).toMatchObject({ role: "mentor", travelLead: true, financialEdit: false, email: "lead@example.invalid", active: true });
    await expect(f.lead.mutation(api.adultProfile.saveBasics, basicFields)).rejects.toThrow("Profile changed");
    await f.coach.mutation(api.adultProfile.saveBasics, basicFields);
    expect(await f.coach.query(api.adultProfile.ownBasics, {})).toMatchObject({ needsSetup: false, role: "coach" });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor))).toMatchObject({ name: "Mentor" });
    expect(await f.t.run(ctx => ctx.db.query("drivers").take(10))).toEqual([driverBefore]);
  });

  it("rejects unauthenticated, student, parent and inactive accounts for reads, saves and dismissal", async () => {
    const f = await fixture();
    const studentAuth = await f.t.run(async ctx => {
      const authUserId = await ctx.db.insert("users", { email: "student@example.invalid" });
      await ctx.db.insert("appUsers", { authUserId, email: "student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
      return authUserId;
    });
    const student = f.t.withIdentity({ subject: `${studentAuth}|session` });
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor, { active: false }));
    for (const client of [f.t, f.parent, student, f.mentor]) {
      await expect(client.query(api.adultProfile.ownBasics, {})).rejects.toThrow();
      await expect(client.mutation(api.adultProfile.saveBasics, basicFields)).rejects.toThrow();
      await expect(client.mutation(api.adultProfile.dismissSetup, { expectedProfileRevision: 0 })).rejects.toThrow();
      await expect(client.query(api.adultProfile.own, {})).rejects.toThrow();
      await expect(client.mutation(api.adultProfile.saveOwn, fields)).rejects.toThrow();
    }
  });

  it("requires every basic field, valid size and bounded values without partial saves", async () => {
    const f = await fixture();
    for (const field of ["name", "phone", "emergencyName", "emergencyRelationship", "emergencyPhone"]) {
      await expect(f.mentor.mutation(api.adultProfile.saveBasics, { ...basicFields, [field]: "   " })).rejects.toThrow("provided");
      await expect(f.mentor.mutation(api.adultProfile.saveBasics, { ...basicFields, [field]: "x".repeat(101) })).rejects.toThrow("characters");
    }
    await expect(f.mentor.mutation(api.adultProfile.saveBasics, { ...basicFields, shirtSize: "invalid" as "L" })).rejects.toThrow();
    await expect(f.mentor.mutation(api.adultProfile.saveBasics, { ...basicFields, expectedProfileRevision: 0.5 })).rejects.toThrow("Profile changed");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor))).not.toHaveProperty("profileRevision");
  });

  it("persists a self-only dismissal across sessions and seasons, preserves it after saves and rejects stale dismissal", async () => {
    const f = await fixture();
    expect(await f.mentor.mutation(api.adultProfile.dismissSetup, { expectedProfileRevision: 0 })).toEqual({ profileRevision: 1 });
    const dismissed = await f.t.run(ctx => ctx.db.get(f.ids.mentor));
    expect(dismissed?.staffSetupDismissedAt).toBeTypeOf("number");
    expect(dismissed).toMatchObject({ role: "mentor", active: true, travelLead: false, financialEdit: false, email: "mentor@example.invalid" });
    expect(dismissed).not.toHaveProperty("phone");
    await f.t.run(ctx => ctx.db.patch(f.ids.season, { status: "archived" }));
    const newSession = f.t.withIdentity({ subject: `${f.ids.mentorAuth}|new-session` });
    expect(await newSession.query(api.adultProfile.ownBasics, {})).toMatchObject({ needsSetup: false, dismissed: true, profileRevision: 1 });
    await expect(newSession.mutation(api.adultProfile.dismissSetup, { expectedProfileRevision: 0 })).rejects.toThrow("Profile changed");
    await newSession.mutation(api.adultProfile.saveBasics, { ...basicFields, expectedProfileRevision: 1 });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.mentor)))?.staffSetupDismissedAt).toBe(dismissed?.staffSetupDismissedAt);
    expect((await f.coach.query(api.adultProfile.ownBasics, {})).needsSetup).toBe(true);
    expect(await f.t.run(ctx => ctx.db.query("drivers").take(10))).toEqual([]);
    await f.coach.mutation(api.adultProfile.dismissSetup, { expectedProfileRevision: 0 });
    expect(await f.coach.query(api.adultProfile.ownBasics, {})).toMatchObject({ needsSetup: false, dismissed: true });
  });

  it("allows coaches to maintain their own profile and driving details without self-approval", async () => {
    const f = await fixture();
    await f.coach.mutation(api.adultProfile.saveOwn, { ...fields, canDrive: true, vehicleName: "Coach car", passengerSeats: 3 });
    expect(await f.coach.query(api.adultProfile.own, {})).toMatchObject({ role: "coach", driverState: "owned", approved: false });
    expect(await f.coach.query(api.adultProfile.ownBasics, {})).toMatchObject({ needsSetup: false });
  });
});

describe("adult own profile", () => {
  it("shows only auth-derived personal fields and allows staff and denies Parent route access", async () => {
    const f = await fixture();
    expect(await f.mentor.query(api.adultProfile.own, {})).toMatchObject({ name: "Mentor", email: "mentor@example.invalid", role: "mentor", travelLead: false, driverState: "none", profileRevision: 0 });
    expect(await f.lead.query(api.adultProfile.own, {})).toMatchObject({ name: "Travel Lead", travelLead: true });
    expect(await f.coach.query(api.adultProfile.own, {})).toMatchObject({ role: "coach", name: "Coach" });
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
