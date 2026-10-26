/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules); rateLimiter.register(t);
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
    return { student, other, event, parent, authCoach, authParent, authMentor, authStudent, authOther };
  });
  const parent = t.withIdentity({ subject: `${ids.authParent}|session1` });
  const mentor = t.withIdentity({ subject: `${ids.authMentor}|session1` });
  const student = t.withIdentity({ subject: `${ids.authStudent}|session1` });
  const other = t.withIdentity({ subject: `${ids.authOther}|session1` });
  const coach = t.withIdentity({ subject: `${ids.authCoach}|session1` });
  return { t, ids, parent, mentor, student, other, coach };
}

describe("server boundaries", () => {
  it("shows role-appropriate setup and permission next steps only for confirmed events", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, {permissionRequired: true}));
    const initialParent = await f.parent.query(api.app.studentDashboard, {studentId: f.ids.student});
    expect(initialParent.todos.map(item => item.label)).toContain("Finish the health and contact profile");
    expect(initialParent.todos.some(item => item.eventId === f.ids.event)).toBe(false);
    const initialStudent = await f.student.query(api.app.studentDashboard, {studentId: f.ids.student});
    expect(initialStudent.todos).toEqual(expect.arrayContaining([expect.objectContaining({eventId: null, responsible: "student", href: "/setup", blocked: false}), expect.objectContaining({eventId: null, responsible: "parent", href: null, blocked: true}), expect.objectContaining({eventId: null, eventName: "FIRST registration and Consent & Release"})]));
    await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileCompletedAt: 1, shirtSize: "M", consentProfileV2CompletedAt: 2, consentProfileV2ConfirmedBy: f.ids.parent, consentProfileV2: {grade:"11",dateOfBirth:"2010-01-01",guardian:{name:"Fictional Parent",relationship:"Parent",phone:"555-0100",email:"parent@example.org"},emergency:{name:"Fictional Emergency",relationship:"Family",phone:"555-0101"},allergies:{state:"none",entries:[]},prescriptions:{state:"none",entries:[]},insurance:{state:"unavailable",provider:null,policy:null},physician:{state:"unavailable",name:null,phone:null}} }));
    await f.coach.mutation(api.firstRegistration.verify, {studentId:f.ids.student,expectedRevision:0,teamAccepted:true,consentRelease:true});
    expect((await f.parent.query(api.app.studentDashboard, {studentId: f.ids.student})).todos).toHaveLength(0);
    await f.coach.mutation(api.participation.setParticipation, {eventId: f.ids.event, studentId: f.ids.student, status: "confirmed"});
    const parent = await f.parent.query(api.app.studentDashboard, {studentId: f.ids.student});
    const permission = parent.todos.find(item => item.eventId === f.ids.event && item.label.includes("Permission"));
    expect(permission).toMatchObject({href: null, responsible: "coach", blocked: true});
    const student = await f.student.query(api.app.studentDashboard, {studentId: f.ids.student});
    expect(student.todos.find(item => item.eventId === f.ids.event && item.label.includes("parent or legal guardian"))).toMatchObject({href: null, responsible: "parent", blocked: true});
    const readiness = await f.coach.query(api.app.eventReadiness, {eventId: f.ids.event});
    expect(readiness.students[0].permissionStatus).toBe("missing");
  });
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

  it("keeps join status across sessions and validates a new code after a decline", async () => {
    const f = await fixture();
    const authJoiner = await f.t.run(ctx => ctx.db.insert("users", { email: "new.joiner@example.invalid", name: "New Joiner" }));
    const joiner = f.t.withIdentity({ subject: `${authJoiner}|first` });
    const secondSession = f.t.withIdentity({ subject: `${authJoiner}|second` });
    expect(await joiner.query(api.app.joinStatus, {})).toEqual({ status: "none" });
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    const requestId = await joiner.mutation(api.app.requestJoin, { code: code.code, firstName: "New", lastName: "Joiner" });
    expect(await secondSession.query(api.app.joinStatus, {})).toEqual({ status: "pending" });
    await f.t.run(ctx => ctx.db.patch(requestId!, { status: "declined", decidedAt: 10 }));
    expect(await secondSession.query(api.app.joinStatus, {})).toEqual({ status: "declined" });
    expect(await secondSession.mutation(api.app.requestJoin, { code: "wrong", firstName: "New", lastName: "Joiner" })).toBeNull();
    expect(await joiner.query(api.app.joinStatus, {})).toEqual({ status: "declined" });
    expect(await secondSession.mutation(api.app.requestJoin, { code: code.code, firstName: "New", lastName: "Joiner" })).toBe(requestId);
    expect(await joiner.query(api.app.joinStatus, {})).toEqual({ status: "pending" });
  });

  it("lists active team codes only to a Coach and removes revoked codes", async () => {
    const f = await fixture();
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    const asOf = Date.now();
    const list = await f.coach.query(api.admin.activeJoinCodes, { asOf });
    expect(list.items).toEqual([expect.objectContaining({ code: code.code })]);
    await expect(f.mentor.query(api.admin.activeJoinCodes, { asOf })).rejects.toThrow("Only a Coach");
    await f.coach.mutation(api.admin.revokeJoinCode, { codeId: list.items[0].codeId });
    expect((await f.coach.query(api.admin.activeJoinCodes, { asOf })).items).toEqual([]);
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

  it("applies the shared per-account code limit to team join requests", async () => {
    const f = await fixture();
    const authJoiner = await f.t.run(ctx => ctx.db.insert("users", { email: "limited@example.org", name: "Limited" }));
    const joiner = f.t.withIdentity({ subject: `${authJoiner}|sessionA` });
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: "1w" });
    for (let i = 0; i < 10; i++) expect(await joiner.mutation(api.bulkInvites.checkInvitationCode, { code: code.code })).toEqual({ kind: "team" });
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
  it("resolves the Student viewer in the current season when an active historical profile shares the account", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const student = await ctx.db.get(f.ids.student); if (!student) throw new Error("Fixture missing");
      const season = await ctx.db.get(student.seasonId); if (!season) throw new Error("Season missing");
      const old = await ctx.db.insert("seasons", { name: "Historical", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: season.createdBy });
      const { _id, _creationTime, ...fields } = student; void _id; void _creationTime;
      await ctx.db.insert("students", { ...fields, seasonId: old, legalName: "Historical profile", preferredName: "Historical" });
    });
    const viewer = await f.student.query(api.app.viewer, {});
    expect(viewer.students).toHaveLength(1); expect(viewer.students[0]._id).toBe(f.ids.student);
    await expect(f.student.query(api.app.listEvents, {})).resolves.toHaveLength(1);
  });
  it("keeps Parent viewer and event listing independent of historical links and pages current children through empty nonfinal results", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const student = await ctx.db.get(f.ids.student); const parent = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.authParent)).unique(); if (!student || !parent) throw new Error("Fixture missing");
      const season = await ctx.db.get(student.seasonId); if (!season) throw new Error("Season missing");
      const old = await ctx.db.insert("seasons", { name: "Historical", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: season.createdBy });
      const { _id, _creationTime, ...fields } = student; void _id; void _creationTime;
      for (let i = 0; i < 120; i++) { const historical = await ctx.db.insert("students", { ...fields, userId: undefined, seasonId: old, preferredName: `Historical ${i}` }); await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: historical, seasonId: old, active: true, createdBy: season.createdBy }); }
      const current = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", student._id)).unique(); if (!current) throw new Error("Link missing"); await ctx.db.patch(current._id, { seasonId: student.seasonId });
      await ctx.db.patch(student._id, { active: false });
      await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: f.ids.other, seasonId: student.seasonId, active: true, createdBy: season.createdBy });
      await ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 244, unresolved: 0, updatedAt: 0, generation: 1, startedBy: season.createdBy });
    });
    expect((await f.parent.query(api.app.viewer, {})).students).toEqual([]);
    await expect(f.parent.query(api.app.listEvents, {})).resolves.toHaveLength(1);
    const first = await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 1, cursor: null } }); expect(first.page).toEqual([]); expect(first.isDone).toBe(false);
    const second = await f.parent.query(api.seasonFamilyLinks.currentSeasonPage, { paginationOpts: { numItems: 20, cursor: first.continueCursor } }); expect(second.page.map(row => row._id)).toEqual([f.ids.other]);
    await f.t.run(async ctx => { const parent = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.authParent)).unique(); if (!parent) throw new Error("Parent missing"); const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", f.ids.other)).unique(); if (!link) throw new Error("Link missing"); await ctx.db.patch(link._id, { active: false }); });
    await expect(f.parent.query(api.app.studentProfile, { studentId: f.ids.other })).rejects.toThrow("permission");
  });});


describe('Batch 4 workflow summaries and confirmation checks', () => {
  it('counts only pending signups and rejects family access to staff counts', async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.insert('participants', {eventId:f.ids.event,studentId:f.ids.student,status:'pending',createdAt:1,updatedAt:1});
      await ctx.db.insert('participants', {eventId:f.ids.event,studentId:f.ids.other,status:'waitlist',createdAt:2,updatedAt:2});
    });
    expect(await f.coach.query(api.workflowSummaries.waitingSignups,{eventId:f.ids.event})).toEqual({count:1,more:false});
    await expect(f.student.query(api.workflowSummaries.waitingSignups,{eventId:f.ids.event})).rejects.toThrow('Staff access');
    await f.t.run(ctx=>ctx.db.patch(f.ids.event,{archived:true}));
    await expect(f.coach.query(api.workflowSummaries.waitingSignups,{eventId:f.ids.event})).rejects.toThrow('unavailable');
  });
  it('distinguishes unconfirmed health entries without exposing them to a student', async () => {
    const f = await fixture();
    expect(await f.coach.query(api.workflowSummaries.healthStatus,{studentId:f.ids.student})).toBe('entered');
    await f.t.run(ctx=>ctx.db.patch(f.ids.student,{allergies:{state:'unknown'},medications:{state:'unknown'}}));
    expect(await f.coach.query(api.workflowSummaries.healthStatus,{studentId:f.ids.student})).toBe('missing');
    await expect(f.student.query(api.workflowSummaries.healthStatus,{studentId:f.ids.student})).rejects.toThrow();
  });
  it('rejects a room confirmation whose reviewed membership has changed', async () => {
    const f = await fixture();
    const groupId = await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event,{overnight:true,roomingEnabled:true});
      const groupId=await ctx.db.insert('roomGroups',{eventId:f.ids.event,name:'Reviewed room',category:'Boys',finalized:false,needsReview:false,adultFifthException:false,createdBy:(await ctx.db.get(f.ids.student))!.userId!});
      await ctx.db.insert('roomMemberships',{eventId:f.ids.event,groupId,studentId:f.ids.student,joinedAt:1});
      await ctx.db.insert('participants',{eventId:f.ids.event,studentId:f.ids.student,status:'confirmed',createdAt:1,updatedAt:1});
      return groupId;
    });
    await expect(f.coach.mutation(api.rooms.finalize,{groupId,allowFifth:false,expectedMembers:[f.ids.other]})).rejects.toThrow('Room members changed');
    expect((await f.t.run(ctx=>ctx.db.get(groupId)))?.finalized).toBe(false);
    await f.coach.mutation(api.rooms.finalize,{groupId,allowFifth:false,expectedMembers:[f.ids.student]});
    expect((await f.t.run(ctx=>ctx.db.get(groupId)))?.finalized).toBe(true);
  });
});
