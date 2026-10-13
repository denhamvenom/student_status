/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@example.org", name: "Coach" });
    const authParent = await ctx.db.insert("users", { email: "parent@example.org", name: "Parent" });
    const authMentor = await ctx.db.insert("users", { email: "mentor@example.org", name: "Mentor" });
    const authStudent = await ctx.db.insert("users", { email: "s@example.org", name: "Student" });
    const authOther = await ctx.db.insert("users", { email: "other@example.org", name: "Other" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@example.org", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const parent = await ctx.db.insert("appUsers", { authUserId: authParent, email: "parent@example.org", name: "Parent", role: "parent", travelLead: false, financialEdit: false, active: true });
    await ctx.db.insert("appUsers", { authUserId: authMentor, email: "mentor@example.org", name: "Mentor", role: "mentor", travelLead: false, financialEdit: false, active: true });
    const studentUser = await ctx.db.insert("appUsers", { authUserId: authStudent, email: "s@example.org", name: "Student", role: "student", travelLead: false, financialEdit: false, active: true });
    const otherUser = await ctx.db.insert("appUsers", { authUserId: authOther, email: "other@example.org", name: "Other", role: "student", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "2026–27", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT-1", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser, legalName: "Student Example", preferredName: "Student", email: "s@example.org", subteam: "Mechanical", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "reported", text: "Peanuts" }, medications: { state: "none" } });
    const other = await ctx.db.insert("students", { seasonId: season, userId: otherUser, legalName: "Other Example", preferredName: "Other", email: "other@example.org", subteam: "Programming", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
    await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: student, active: true, createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Regional", type: "Competition", startsAt: 1000000, endsAt: 2000000, destination: "City", travel: "Vehicles", overnight: false, roomingEnabled: false, feeCents: 45000, signupMode: "approval", capacity: 1, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { student, other, event, authCoach, authParent, authMentor, authStudent, authOther };
  });
  const parent = t.withIdentity({ subject: `${ids.authParent}|session1` });
  const mentor = t.withIdentity({ subject: `${ids.authMentor}|session1` });
  const student = t.withIdentity({ subject: `${ids.authStudent}|session1` });
  const other = t.withIdentity({ subject: `${ids.authOther}|session1` });
  const coach = t.withIdentity({ subject: `${ids.authCoach}|session1` });
  return { t, ids, parent, mentor, student, other, coach };
}

describe("server boundaries", () => {
  it("rejects stale profile edits and invalid required shirt sizes", async () => {
    const f = await fixture();
    await f.parent.mutation(api.app.updateStudentProfile, { studentId: f.ids.student, expectedRevision: 0, emergencyName: "Fictional Guardian" });
    await expect(f.student.mutation(api.app.updateStudentProfile, { studentId: f.ids.student, expectedRevision: 0, preferredName: "Old draft" })).rejects.toThrow("Profile changed");
    await expect(f.student.mutation(api.app.updateStudentProfile, { studentId: f.ids.student, expectedRevision: 1, shirtSize: "" })).rejects.toThrow("valid shirt");
    await f.student.mutation(api.app.updateStudentProfile, { studentId: f.ids.student, expectedRevision: 1, shirtSize: "M" });
    const profile = await f.parent.query(api.app.studentProfile, { studentId: f.ids.student });
    expect(profile).toMatchObject({ preferredName: "Student", emergencyName: "Fictional Guardian", shirtSize: "M", profileRevision: 2 });
  });

  it("limits family records to linked students and excludes mentor private data", async () => {
    const f = await fixture();
    expect((await f.parent.query(api.app.studentProfile, { studentId: f.ids.student })).allergies.state).toBe("reported");
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.other })).rejects.toThrow("permission");
    await expect(f.mentor.query(api.app.studentProfile, { studentId: f.ids.student })).rejects.toThrow("permission");
    const report = await f.mentor.query(api.app.mentorReport, {});
    expect(JSON.stringify(report)).not.toContain("Peanuts");
    expect(JSON.stringify(report)).not.toContain("email");
    expect(JSON.stringify(report)).not.toContain("roomCategory");
  });

  it("reserves pending capacity, charges only upon confirmation, and denies unauthorized finance writes", async () => {
    const f = await fixture();
    expect(await f.student.mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("pending");
    expect(await f.other.mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("waitlist");
    expect((await f.student.query(api.financeDetails.charges, { studentId: f.ids.student, paginationOpts: { cursor: null, numItems: 25 } })).page).toHaveLength(0);
    await expect(f.mentor.mutation(api.finance.recordFunds, { studentId: f.ids.student, kind: "payment", amountCents: 1000, reason: "Cash", idempotencyKey: "pay-123456" })).rejects.toThrow("Financial editing");
    await f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "confirmed" });
    const money = await f.student.query(api.app.studentFinances, { studentId: f.ids.student });
    expect(money.summary!.chargedCents).toBe(45000);
    expect(money.summary!.dueCents).toBe(45000);
  });

  it("blocks draft legal consent in live functions", async () => {
    const f = await fixture();
    await expect(f.parent.mutation(api.permissions.submit, { studentId: f.ids.student, eventIds: [f.ids.event], typedName: "Parent", answersJson: "{}" })).rejects.toThrow("draft");
  });

  it("uses the stable Convex Auth user across sessions and derives join email from the auth user", async () => {
    const f = await fixture();
    const secondSession = f.t.withIdentity({ subject: `${f.ids.authStudent}|session2` });
    expect((await secondSession.query(api.app.viewer, {})).user?.role).toBe("student");
    const authJoiner = await f.t.run(ctx => ctx.db.insert("users", { email: "joiner@example.org", name: "Joiner" }));
    const joiner = f.t.withIdentity({ subject: `${authJoiner}|sessionA` });
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    const requestId = await joiner.mutation(api.app.requestJoin, { code: code.code, firstName: "Jo", lastName: "Iner" });
    expect(requestId).not.toBeNull();
    const request = await f.t.run(ctx => ctx.db.get(requestId!));
    expect(request?.email).toBe("joiner@example.org");
    expect(await f.t.withIdentity({ subject: `${authJoiner}|sessionB` }).mutation(api.app.requestJoin, { code: code.code, firstName: "Jo", lastName: "Iner" })).toBe(requestId);
  });

  it("commits invalid join attempts and locks the account after five failures", async () => {
    const f = await fixture();
    const authJoiner = await f.t.run(ctx => ctx.db.insert("users", { email: "locked@example.org", name: "Locked" }));
    const joiner = f.t.withIdentity({ subject: `${authJoiner}|sessionA` });
    for (let i = 0; i < 5; i++) expect(await joiner.mutation(api.app.requestJoin, { code: "wrong", firstName: "A", lastName: "B" })).toBeNull();
    const attempt = await f.t.run(ctx => ctx.db.query("joinAttempts").withIndex("by_authUserId", q => q.eq("authUserId", authJoiner)).unique());
    expect(attempt?.lockedUntil).toBeGreaterThan(Date.now());
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    expect(await joiner.mutation(api.app.requestJoin, { code: code.code, firstName: "A", lastName: "B" })).toBeNull();
  });

  it("keeps adult rooming open after a student asks for assignment", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { overnight: true, roomingEnabled: true, feeCents: 0, travel: "Families provide transportation" }));
    await f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "confirmed" });
    await f.student.mutation(api.rooms.requestAssignment, { eventId: f.ids.event });
    const readiness = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event });
    expect(readiness.rooming?.state).toBe("open");
    expect(readiness.overall).toBe("open");
    await expect(f.parent.mutation(api.rooms.requestAssignment, { eventId: f.ids.event })).rejects.toThrow("permission");
  });

  it("creates required Travel Team participation and debt in one transaction", async () => {
    const f = await fixture();
    const eventId = await f.coach.mutation(api.admin.createEvent, { name: "Required Regional", type: "Competition", startsAt: 3000000, endsAt: 4000000, destination: "City", travel: "Vehicles", overnight: false, roomingEnabled: false, feeCents: 2500, signupMode: "assigned", assignmentScope: "travelTeam", allowWithdrawal: false, permissionRequired: false, firstRequired: false, requirements: [] });
    const view = await f.student.query(api.app.eventDetail, { eventId, studentId: f.ids.student });
    expect(view.participation).toBe("confirmed");
    const finances = await f.student.query(api.financeDetails.charges, { studentId: f.ids.student, paginationOpts: { cursor: null, numItems: 25 } });
    expect(finances.page.find((x: { eventId?: string }) => x.eventId === eventId)?.amountCents).toBe(2500);
  });

  it("rejects overcapacity pending reservations and confirmed downgrades without changing debt", async () => {
    const f = await fixture();
    expect(await f.student.mutation(api.participation.signUp, { eventId: f.ids.event })).toBe("pending");
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.other, status: "pending" })).rejects.toThrow("capacity");
    await f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "confirmed" });
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "waitlist" })).rejects.toThrow("Reconcile");
    const detail = await f.student.query(api.app.eventDetail, { eventId: f.ids.event, studentId: f.ids.student });
    expect(detail.participation).toBe("confirmed");
    expect((await f.student.query(api.app.studentFinances, { studentId: f.ids.student })).summary!.dueCents).toBe(45000);
  });

  it("rejects withdrawal from an archived event without changing participation", async () => {
    const f = await fixture();
    await f.student.mutation(api.participation.signUp, { eventId: f.ids.event });
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { archived: true }));
    await expect(f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "archived-request-test" })).rejects.toThrow("unavailable");
    const row = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.student)).unique());
    expect(row?.status).toBe("pending");
  });

  it("does not record a payment before historical financial records are prepared", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const coach = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.authCoach)).unique();
      if (!coach) throw new Error("Missing test Coach");
      for (let i = 0; i < 498; i++) await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "adjustment", amountCents: 0, previousCents: 0, newCents: 0, reason: "fixture", recordedBy: coach._id, recordedAt: i, idempotencyKey: `fixture-${i}` });
      for (let i = 0; i < 2; i++) await ctx.db.insert("charges", { studentId: f.ids.student, label: `Charge ${i}`, amountCents: 100, appliedCents: 0, priority: i, createdBy: coach._id, createdAt: 0 });
    });
    await expect(f.coach.mutation(api.finance.recordFunds, { studentId: f.ids.student, kind: "payment", amountCents: 200, reason: "Cash", idempotencyKey: "boundary-payment" })).rejects.toThrow("Coach rebuild");
    const rows = await f.t.run(ctx => ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.student)).take(501));
    expect(rows).toHaveLength(498);
    const finance = await f.student.query(api.app.studentFinances, { studentId: f.ids.student });
    expect(finance).toMatchObject({ state: "updating", summary: null });
  });
});
