/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { internal } from "./_generated/api";
import { invalidateAttendanceSession } from "./lib/attendanceReports";
import type { Id } from "./_generated/dataModel";
import { makeFunctionReference } from "convex/server";
import schema from "./schema";
import type { ApiFromModules, FunctionArgs, FunctionReturnType } from "convex/server";
import type * as reports from "./dashboardReports";
import { refreshStudentFinance } from "./lib/financeSummaries";

const modules = import.meta.glob("./**/*.ts");
type Reports = ApiFromModules<{ dashboardReports: typeof reports }>["dashboardReports"];
const attendanceRef = makeFunctionReference<"query", FunctionArgs<Reports["familyAttendance"]>, FunctionReturnType<Reports["familyAttendance"]>>("dashboardReports:familyAttendance");
const financeRef = makeFunctionReference<"query", FunctionArgs<Reports["familyFinance"]>, FunctionReturnType<Reports["familyFinance"]>>("dashboardReports:familyFinance");
const teamRef = makeFunctionReference<"query", FunctionArgs<Reports["team"]>, FunctionReturnType<Reports["team"]>>("dashboardReports:team");
const hour = 3600000;
const start = Date.parse("2026-10-13T21:00:00Z");
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "parent" | "student", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("coach", "coach"), mentor = await account("mentor", "mentor"), lead = await account("lead", "mentor", true), parent = await account("parent", "parent"), student = await account("student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, startsAt: 0, status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const base = { seasonId: season, legalName: "Synthetic student", preferredName: "Synthetic", email: "private@example.invalid", active: true, travelTeam: true, subteam: "Build", roomCategoryLocked: false, allergies: { state: "reported" as const, text: "SECRET HEALTH" }, medications: { state: "unknown" as const } };
    const sid = await ctx.db.insert("students", { ...base, userId: student.id });
    const other = await ctx.db.insert("students", { ...base, active: false });
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: sid, active: true, createdBy: coach.id });
    const payment = await ctx.db.insert("ledgerEntries", { studentId: sid, kind: "payment", amountCents: 1000, previousCents: 0, newCents: 1000, recordedBy: coach.id, recordedAt: 1, idempotencyKey: "payment" });
    const fundraiser = await ctx.db.insert("ledgerEntries", { studentId: sid, kind: "fundraiser", amountCents: 2000, previousCents: 0, newCents: 2000, recordedBy: coach.id, recordedAt: 2, idempotencyKey: "fund" });
    const charge = await ctx.db.insert("charges", { studentId: sid, label: "Synthetic fee", amountCents: 1500, cancelledCents: 500, appliedCents: 1000, priority: 0, createdBy: coach.id, createdAt: 1 });
    await ctx.db.insert("ledgerEntries", { studentId: sid, chargeId: charge, kind: "allocation", sourceEntryId: payment, sourceKind: "payment", amountCents: 1000, previousCents: 0, newCents: 1000, recordedBy: coach.id, recordedAt: 3, idempotencyKey: "allocation" });
    await ctx.db.insert("ledgerEntries", { studentId: other, kind: "fundraiser", amountCents: 300, originEntryId: fundraiser, previousCents: 0, newCents: 300, recordedBy: coach.id, recordedAt: 4, idempotencyKey: "incoming" });
    await ctx.db.insert("ledgerEntries", { studentId: sid, kind: "transferOut", amountCents: 300, sourceEntryId: fundraiser, sourceKind: "fundraiser", previousCents: 2000, newCents: 1700, recordedBy: coach.id, recordedAt: 4, idempotencyKey: "outgoing" });
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: season, source: "manual", sourceKey: "session", title: "Synthetic Tuesday", allDay: false, cancelled: false, observedAt: start, revision: 1, needsReview: false });
    const session = await ctx.db.insert("timeclockSessions", { seasonId: season, occurrenceId, state: "closed", scheduledStart: start, scheduledEnd: start + 2 * hour, effectiveEnd: start + 3 * hour, extensionMs: hour, revision: 1, openedAt: start, openedBy: coach.id, closedAt: start + 3 * hour, needsReview: false });
    const interval = await ctx.db.insert("timeclockIntervals", { sessionId: session, studentId: sid, inAt: start, outAt: start + hour / 2, openedBy: coach.id, openCommandKey: "original", scheduleRevision: 1 });
    await ctx.db.insert("timeclockCorrections", { sessionId: session, studentId: sid, originalIntervalId: interval, kind: "replace", inAt: start - hour / 2, outAt: start + hour, reason: "PRIVATE CORRECTION REASON", actorId: coach.id, at: start + 3 * hour, commandKey: "correct" });
    await refreshStudentFinance(ctx, sid);
    await refreshStudentFinance(ctx, other);
    await ctx.db.insert("financeSummaryBackfills", { seasonId: season, state: "complete", cursor: null, processed: 2, updatedAt: 4 });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 1, updatedAt: start+4*hour });
    await invalidateAttendanceSession(ctx,session);
    return { coach, mentor, lead, parent, student, sid, other, session };
  });
  await settleSession(t,ids.session);
  const as = (account: typeof ids.coach) => t.withIdentity({ subject: `${account.auth}|session` });
  return { t, ids, coach: as(ids.coach), mentor: as(ids.mentor), lead: as(ids.lead), parent: as(ids.parent), student: as(ids.student) };
}

async function settleSession(t:ReturnType<typeof createTest>,sessionId:Id<"timeclockSessions">){
  for(let step=0;step<100;step++){
    const row=await t.run(ctx=>ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",sessionId)).unique());
    if(!row||row.state!=="rebuilding")return;
    await t.mutation(internal.attendanceReportMaintenance.continueSession,{sessionId,expectedGeneration:row.reportGeneration,expectedSessionRevision:row.sessionRevision,expectedPhase:row.phase,expectedCursor:row.cursor});
  }
  throw new Error("Report did not settle.");
}

describe("role-scoped dashboard reports", () => {
  it("returns honest pending finance states while keeping roster counts readable", async () => {
    const f=await fixture();
    await f.t.run(async ctx=>{const student=await ctx.db.get(f.ids.sid);const state=await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId",q=>q.eq("seasonId",student!.seasonId)).unique();await ctx.db.patch(state!._id,{state:"running",processed:1})});
    expect(await f.coach.query(teamRef,{})).toMatchObject({state:"updating",activeStudents:1,inactiveStudents:1,travelTeamStudents:1,finance:null,processed:1,rebuildRunning:true,canRebuild:false});
    await f.t.run(async ctx=>{const student=await ctx.db.get(f.ids.sid);const state=await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId",q=>q.eq("seasonId",student!.seasonId)).unique();await ctx.db.patch(state!._id,{state:"failed",lastError:"Synthetic source review required"})});
    expect(await f.coach.query(teamRef,{})).toMatchObject({state:"failed",finance:null,canRebuild:true,message:"Synthetic source review required"});
    expect(await f.lead.query(teamRef,{})).toMatchObject({state:"failed",finance:null,canRebuild:false});
  });
  it("denies anonymous, ordinary Mentor, unrelated family and revoked links", async () => {
    const f = await fixture();
    for (const client of [f.t, f.mentor, f.parent, f.student]) await expect(client.query(teamRef, {})).rejects.toThrow();
    await expect(f.mentor.query(financeRef, { studentId: f.ids.sid })).rejects.toThrow();
    await expect(f.lead.query(attendanceRef, { studentId: f.ids.sid, asOf: start + 4 * hour })).rejects.toThrow();
    await expect(f.parent.query(financeRef, { studentId: f.ids.other })).rejects.toThrow();
    await f.t.run(async ctx => { const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", f.ids.parent.id).eq("studentId", f.ids.sid)).unique(); await ctx.db.patch(link!._id, { active: false }); });
    await expect(f.parent.query(financeRef, { studentId: f.ids.sid })).rejects.toThrow();
  });
  it("reconciles cancellation, applied payment and conserved transfer without inventing gross Raised", async () => {
    const f = await fixture();
    const finance = await f.student.query(financeRef, { studentId: f.ids.sid });
    expect(finance).toMatchObject({ chargedCents: 1000, paidCents: 1000, dueCents: 0, personalAvailableCents: 0, fundraisingAvailableCents: 1700, raisedCents: null, travelShareCents: 2000, transferredInCents: 0, updatedAt: 4 });
    const team = await f.coach.query(teamRef, {});
    expect(team).toMatchObject({ activeStudents: 1, inactiveStudents: 1, travelTeamStudents: 1, finance: { travelBalanceCents: 2000, travelShareCents: 2000, transferredInCents: 300 } });
    expect(await f.lead.query(teamRef, {})).toEqual(team);
    expect(JSON.stringify(team)).not.toContain("SECRET HEALTH");
  });
  it("uses corrected uninterrupted scheduled time and keeps legacy separate and evidence minimized", async () => {
    const f = await fixture();
    const report = await f.parent.query(attendanceRef, { studentId: f.ids.sid, asOf: start + 4 * hour });
    expect(report.verified).toMatchObject({ sessionsHeld: 1, sessionsAttended: 1, tuesdayHeld: 1, tuesdayAttended: 1, tuesdayPercent: 100, outreachAttended: null });
    expect(report.sessions[0]).toMatchObject({ totalMs: 1.5 * hour, earlyMs: hour / 2, scheduledMs: hour, qualifies: true, provisional: false });
    expect(report.legacy.tuesdayHeld).toBe(0);
    expect(JSON.stringify(report)).not.toContain("PRIVATE CORRECTION REASON");
    expect(JSON.stringify(report)).not.toContain("SECRET HEALTH");
    await f.t.run(async ctx => {await ctx.db.patch(f.ids.session, { needsReview: true });await invalidateAttendanceSession(ctx,f.ids.session)});
    await settleSession(f.t,f.ids.session);
    expect((await f.student.query(attendanceRef, { studentId: f.ids.sid, asOf: start + 4 * hour })).verified?.sessionsHeld).toBe(0);
  });
  it("does not combine split visits to meet one uninterrupted hour or count open/cancelled sessions", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const corrections = await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", f.ids.session).eq("studentId", f.ids.sid)).take(10);
      await ctx.db.patch(corrections[0]._id, { kind: "void", inAt: undefined, outAt: undefined });
      for (const [index, offset] of [0, hour].entries()) await ctx.db.insert("timeclockCorrections", { sessionId: f.ids.session, studentId: f.ids.sid, kind: "add", inAt: start + offset, outAt: start + offset + hour / 2, reason: "Synthetic split visit", actorId: f.ids.coach.id, at: start + 3 * hour, commandKey: `add-${index}` });
      await invalidateAttendanceSession(ctx,f.ids.session);
    });
    await settleSession(f.t,f.ids.session);
    const result = await f.student.query(attendanceRef, { studentId: f.ids.sid, asOf: start + 4 * hour });
    expect(result.sessions[0]).toMatchObject({ scheduledMs: hour, longestScheduledMs: hour / 2, qualifies: false });
    expect(result.verified?.sessionsAttended).toBe(0);
    await f.t.run(async ctx => {await ctx.db.patch(f.ids.session, { state: "cancelled", closedAt: start + 3 * hour });await invalidateAttendanceSession(ctx,f.ids.session)});
    expect((await f.student.query(attendanceRef,{studentId:f.ids.sid,asOf:start+4*hour})).state).toBe("updating");
    await settleSession(f.t,f.ids.session);
    expect((await f.student.query(attendanceRef, { studentId: f.ids.sid, asOf: start + 4 * hour })).verified?.sessionsHeld).toBe(0);
  });
  it("fails closed instead of returning truncated finance totals", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let index = 0; index < 498; index++) await ctx.db.insert("ledgerEntries", { studentId: f.ids.sid, kind: "payment", amountCents: 1, previousCents: 0, newCents: 1, recordedBy: f.ids.coach.id, recordedAt: 5, idempotencyKey: `limit-${index}` });
    });
    await expect(f.student.query(financeRef, { studentId: f.ids.sid })).rejects.toThrow("Financial record limit reached");
    await expect(f.t.run(ctx => refreshStudentFinance(ctx, f.ids.sid))).rejects.toThrow("Financial record limit reached");
  });
});
