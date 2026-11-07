/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { startFinancialRebuild } from "./financialSources";
import { financialAccount } from "./lib/financialSources";
import { chargeFeeDefinition } from "./lib/feeDefinitions";
import { assignWholeTeamMember } from "./lib/wholeTeam";
import { assignSubteamMember } from "./lib/subteamEnrollment";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture(ambiguous = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, travelLead, financialEdit: false, active: true });
      return { auth, user };
    }
    const coach = await account("coach", "coach"), lead = await account("lead", "mentor", true), mentor = await account("mentor", "mentor"), studentUser = await account("student", "student"), otherUser = await account("other", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.user, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const otherStudent = await ctx.db.insert("students", { seasonId: season, userId: otherUser.user, legalName: "Other Student", preferredName: "Other", email: "other@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic trip", type: "Competition", startsAt: 100, endsAt: 200, destination: "Example", travel: "Vehicles", overnight: true, roomingEnabled: true, feeCents: 10000, signupMode: "open", capacity: 2, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    const participant = await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 0, updatedAt: 0 });
    await ctx.db.insert("participants", { eventId: event, studentId: otherStudent, status: "confirmed", createdAt: 0, updatedAt: 0 });
    const group = await ctx.db.insert("roomGroups", { eventId: event, category: "Boys", name: "Room 1", finalized: true, adultFifthException: false, needsReview: false, createdBy: coach.user });
    await ctx.db.insert("roomMemberships", { eventId: event, studentId: student, groupId: group, joinedAt: 0 });
    await ctx.db.insert("roomMemberships", { eventId: event, studentId: otherStudent, groupId: group, joinedAt: 0 });
    await ctx.db.insert("roomRequests", { eventId: event, studentId: student, requestedAt: 0 });
    await ctx.db.insert("roomInvites", { eventId: event, groupId: group, studentId: student, invitedBy: otherStudent, status: "pending", createdAt: 0 });
    await ctx.db.insert("roomInvites", { eventId: event, groupId: group, studentId: otherStudent, invitedBy: student, status: "pending", createdAt: 0 });
    const main = await ctx.db.insert("charges", { studentId: student, eventId: event, label: "Travel", category: "main", amountCents: 10000, appliedCents: 8000, priority: 1, createdBy: coach.user, createdAt: 1 });
    const extra = await ctx.db.insert("charges", { studentId: student, eventId: event, label: "Lunch", category: "extra", amountCents: 2000, appliedCents: 1000, priority: 2, createdBy: coach.user, createdAt: 2 });
    const other = await ctx.db.insert("charges", { studentId: student, label: "Other balance", amountCents: 5000, appliedCents: 0, priority: 3, createdBy: coach.user, createdAt: 3 });
    const personal = await ctx.db.insert("ledgerEntries", { studentId: student, kind: "payment", amountCents: 6000, previousCents: 0, newCents: 6000, recordedBy: coach.user, recordedAt: 4, idempotencyKey: "pay-source" });
    const fundraiser = await ctx.db.insert("ledgerEntries", { studentId: student, kind: "fundraiser", amountCents: 3000, previousCents: 6000, newCents: 9000, recordedBy: coach.user, recordedAt: 5, idempotencyKey: "fund-source" });
    await ctx.db.insert("ledgerEntries", { studentId: student, chargeId: main, eventId: event, kind: "allocation", amountCents: 6000, previousCents: 0, newCents: 6000, sourceEntryId: personal, sourceKind: "payment", recordedBy: coach.user, recordedAt: 6, idempotencyKey: "alloc-a" });
    await ctx.db.insert("ledgerEntries", { studentId: student, chargeId: main, eventId: event, kind: "allocation", amountCents: 2000, previousCents: 6000, newCents: 8000, ...(ambiguous ? {} : { sourceEntryId: fundraiser, sourceKind: "fundraiser" as const }), recordedBy: coach.user, recordedAt: 7, idempotencyKey: "alloc-b" });
    await ctx.db.insert("ledgerEntries", { studentId: student, chargeId: extra, eventId: event, kind: "allocation", amountCents: 1000, previousCents: 0, newCents: 1000, sourceEntryId: fundraiser, sourceKind: "fundraiser", recordedBy: coach.user, recordedAt: 8, idempotencyKey: "alloc-c" });
    return { coach, lead, mentor, studentUser, otherUser, season, student, otherStudent, event, participant, group, main, extra, other };
  });
  if (!ambiguous) await prepare(t, ids.coach.user, ids.student);
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), lead: as(ids.lead.auth), mentor: as(ids.mentor.auth), student: as(ids.studentUser.auth), other: as(ids.otherUser.auth) };
}

async function prepare(t: ReturnType<typeof convexTest>, actorId: Id<"appUsers">, studentId: Id<"students">) {
  await t.run(ctx => startFinancialRebuild(ctx, studentId, actorId));
  for (let i = 0; i < 120; i++) {
    const account = await t.run(ctx => financialAccount(ctx, studentId));
    if (!account || account.state !== "rebuilding") return;
    await t.mutation(makeFunctionReference<"mutation">("financialSources:processPage"), { accountId: account._id, generation: account.generation, phase: account.phase, cursor: account.cursor });
  }
  throw new Error("Fixture rebuild did not finish");
}
async function finish(f: Awaited<ReturnType<typeof fixture>>) {
  for (let i = 0; i < 120; i++) {
    const account = await f.t.run(ctx => financialAccount(ctx, f.ids.student));
    if (!account) throw new Error("Missing financial account");
    if (account.operationJobId) {
      const job = await f.t.run(ctx => ctx.db.get(account.operationJobId!)); if (!job) throw new Error("Missing disposition job");
      await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), { jobId: job._id, step: job.step });
    } else if (account.allocationJobId) {
      const job = await f.t.run(ctx => ctx.db.get(account.allocationJobId!)); if (!job) throw new Error("Missing allocation job");
      await f.t.mutation(makeFunctionReference<"mutation">("financialAllocation:processPage"), { jobId: job._id, step: job.step });
    } else return;
  }
  throw new Error("Disposition did not finish");
}

describe("withdrawal decisions", () => {
  it("lets a student leave a free Whole Team event immediately and records a dismissible Coach notice", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async ctx => {
      const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Synthetic Coach" });
      const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", travelLead: false, financialEdit: false, active: true });
      const studentAuth = await ctx.db.insert("users", { email: "student@example.invalid", name: "Synthetic Student" });
      const studentUser = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "student@example.invalid", name: "Synthetic Student", role: "student", travelLead: false, financialEdit: false, active: true });
      const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
      const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic Whole Team", type: "Team", startsAt: 100, endsAt: 200, destination: "Example", travel: "Families provide transportation", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", assignmentScope: "wholeTeam", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
      const participant = await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 0, updatedAt: 0 });
      return { coachAuth, studentAuth, event, participant };
    });
    const student=t.withIdentity({subject:`${ids.studentAuth}|session`});
    const coach=t.withIdentity({subject:`${ids.coachAuth}|session`});
    expect(await student.mutation(api.withdrawals.leaveWholeTeam,{eventId:ids.event})).toEqual({moneyReviewPending:false});
    expect(await student.mutation(api.withdrawals.leaveWholeTeam,{eventId:ids.event})).toEqual({moneyReviewPending:false});
    expect((await t.run(ctx=>ctx.db.get(ids.participant)))?.status).toBe("withdrawn");
    const notices=await coach.query(api.withdrawals.wholeTeamLeaveNotices,{});
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({eventId:ids.event,eventName:"Synthetic Whole Team",studentName:"Synthetic Student"});
    await expect(student.mutation(api.withdrawals.dismissWholeTeamLeaveNotice,{noticeId:notices[0].noticeId})).rejects.toThrow("Only a Coach");
    await coach.mutation(api.withdrawals.dismissWholeTeamLeaveNotice,{noticeId:notices[0].noticeId});
    expect(await coach.query(api.withdrawals.wholeTeamLeaveNotices,{})).toEqual([]);
    expect(await coach.query(api.withdrawals.wholeTeamLeaveNotices,{eventId:ids.event})).toEqual([]);
  });

  it("releases a paid Whole Team place before the separate fee decision", async () => {
    const f=await fixture();
    await f.t.run(ctx=>ctx.db.patch(f.ids.event,{signupMode:"assigned",assignmentScope:"wholeTeam",allowWithdrawal:false}));
    expect(await f.student.mutation(api.withdrawals.leaveWholeTeam,{eventId:f.ids.event})).toEqual({moneyReviewPending:true});
    expect((await f.t.run(ctx=>ctx.db.get(f.ids.participant)))?.status).toBe("withdrawn");
    const queue=await f.coach.query(api.withdrawals.pendingWithdrawals,{});
    expect(queue).toHaveLength(1);
    const preview=await f.coach.query(api.withdrawals.withdrawalPreview,{eventId:f.ids.event,studentId:f.ids.student});
    expect(preview).toMatchObject({wholeTeamLeft:true,status:"withdrawn",requestStatus:"pending"});
    await f.coach.mutation(api.withdrawals.reviewWithdrawal,{requestId:queue[0].requestId,decision:"retain",cancelUnpaidMain:true,reason:"Retain paid fee",expectedRevision:preview.revision});
    await finish(f);
    expect((await f.t.run(ctx=>ctx.db.get(f.ids.participant)))?.status).toBe("withdrawn");
    expect((await f.t.run(ctx=>ctx.db.get(queue[0].requestId)))?.status).toBe("approved");
  });
  it("preserves reservation while pending or denied, then releases room and capacity with source-preserving full return", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-one" });
    const revision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    expect(await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-one" })).toBe(requestId);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    await expect(f.mentor.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "other-key" })).rejects.toThrow();
    await expect(f.mentor.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "full", cancelUnpaidMain: false, reason: "Please release", expectedRevision: revision })).rejects.toThrow("can review withdrawal requests");
    await f.lead.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "deny", cancelUnpaidMain: false, reason: "Needs attendance", expectedRevision: revision });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    const request2 = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-two" });
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId: request2, decision: "full", cancelUnpaidMain: false, reason: "Approved travel change", expectedRevision: revision });
    expect((await f.t.run(ctx => ctx.db.get(request2)))?.status).toBe("processing");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    await finish(f);
    const state = await f.t.run(async ctx => ({ participant: await ctx.db.get(f.ids.participant), main: await ctx.db.get(f.ids.main), extra: await ctx.db.get(f.ids.extra), other: await ctx.db.get(f.ids.other), group: await ctx.db.get(f.ids.group), memberships: await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.student)).take(2), requests: await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.student)).take(2), entries: await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.student)).take(100) }));
    expect(state.participant?.status).toBe("withdrawn");
    expect(state.main).toMatchObject({ appliedCents: 0, cancelledCents: 8000 });
    expect(state.extra).toMatchObject({ appliedCents: 0, cancelledCents: 2000 });
    expect(state.other?.appliedCents).toBe(5000);
    expect(state.group).toMatchObject({ finalized: false, needsReview: true });
    expect(state.memberships).toHaveLength(0);
    expect(state.requests).toHaveLength(0);
    expect(state.entries.filter(x => x.kind === "deallocation").reduce((n,x)=>n+x.amountCents,0)).toBe(9000);
    expect(state.entries.filter(x => x.kind === "allocation" && x.chargeId === f.ids.other).every(x => x.sourceKind === "payment")).toBe(true);
    const finances = await f.student.query(api.app.studentFinances, { studentId: f.ids.student });
    expect(finances.summary).toMatchObject({ dueCents: 2000, personalAvailableCents: 1000, fundraisingAvailableCents: 3000 });
    await expect(f.student.mutation(api.participation.signUp, { eventId: f.ids.event })).rejects.toThrow("Ask a Coach to sign you up again");
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "pending" })).rejects.toThrow("Put back on event");
  });

  it("rejects over-return and source ambiguity without changing participation or charges", async () => {
    const f = await fixture(true);
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-ambiguous" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "partial", returnCents: 9001, cancelUnpaidMain: false, reason: "Too many cents", expectedRevision })).rejects.toThrow("amount paid for this event");
    await expect(prepare(f.t, f.ids.coach.user, f.ids.student)).rejects.toThrow("ambiguous funding sources");
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "full", cancelUnpaidMain: false, reason: "Unknown source", expectedRevision })).rejects.toThrow("updating");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.main)))?.cancelledCents).toBeUndefined();
    await expect(f.student.mutation(api.participation.withdraw, { eventId: f.ids.event })).rejects.toThrow("Send a withdrawal request");
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "withdrawn" })).rejects.toThrow("use Withdrawal requests");
  });

  it("is idempotent for the same decision and rejects a contradictory repeat", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-repeat" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    const args = { requestId, decision: "retain" as const, cancelUnpaidMain: true, reason: "Nonrefundable travel", expectedRevision };
    await f.lead.mutation(api.withdrawals.reviewWithdrawal, args);
    await f.lead.mutation(api.withdrawals.reviewWithdrawal, args);
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, { ...args, decision: "full" })).rejects.toThrow("already decided");
    await finish(f);
    const charges = await f.t.run(async ctx => ({ main: await ctx.db.get(f.ids.main), extra: await ctx.db.get(f.ids.extra) }));
    expect(charges.main).toMatchObject({ appliedCents: 8000, cancelledCents: 2000 });
    expect(charges.extra).toMatchObject({ appliedCents: 1000, cancelledCents: 1000 });
  });

  it("returns a partial mixed-source amount and leaves the unpaid main balance owed", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "partial-request" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "partial", returnCents: 7000, cancelUnpaidMain: false, reason: "Approved partial return", expectedRevision });
    await finish(f);
    const finances = await f.student.query(api.app.studentFinances, { studentId: f.ids.student });
    expect(finances.summary).toMatchObject({ dueCents: 2000, personalAvailableCents: 1000, fundraisingAvailableCents: 1000 });
    const state = await f.t.run(async ctx => ({ main: await ctx.db.get(f.ids.main), extra: await ctx.db.get(f.ids.extra), other: await ctx.db.get(f.ids.other), entries: await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.student)).take(100) }));
    expect(state.main).toMatchObject({ appliedCents: 1000, cancelledCents: 7000 });
    expect(state.extra).toMatchObject({ appliedCents: 1000, cancelledCents: 1000 });
    expect(state.other?.appliedCents).toBe(5000);
    const reversed = state.entries.filter(e => e.kind === "deallocation");
    expect(reversed.filter(e => e.sourceKind === "payment").reduce((n,e)=>n+e.amountCents,0)).toBe(6000);
    expect(reversed.filter(e => e.sourceKind === "fundraiser").reduce((n,e)=>n+e.amountCents,0)).toBe(1000);
  });

  it("rejects an archived event or a changed charge without any partial write", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "stale-request" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await f.t.run(ctx => ctx.db.patch(f.ids.main, { amountCents: 11000 }));
    const args = { requestId, decision: "full" as const, cancelUnpaidMain: false, reason: "Stale screen approval", expectedRevision };
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, args)).rejects.toThrow("changed");
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { archived: true }));
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, args)).rejects.toThrow("Past events");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("pending");
  });

  it("finishes a reviewed disposition beyond 500 historical rows without truncation", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "cap-request" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await f.t.run(async ctx => { for (let i=0;i<620;i++) await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "adjustment", amountCents: 0, previousCents: 0, newCents: 0, recordedBy: f.ids.coach.user, recordedAt: 100+i, idempotencyKey: `filler:${i}` }); });
    await prepare(f.t, f.ids.coach.user, f.ids.student);
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "retain", cancelUnpaidMain: true, reason: "Retain and cancel unpaid", expectedRevision });
    await finish(f);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("withdrawn");
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("approved");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.main)))?.cancelledCents).toBe(2000);
  });
});

// Owner decision 2026-11-06: no money and no logistics commitment means the withdrawal takes effect right away.
async function freeFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@example.invalid`, name, role, travelLead, financialEdit: false, active: true });
      return { auth, user };
    }
    const coach = await account("coach", "coach"), mentor = await account("mentor", "mentor"), lead = await account("lead", "mentor", true), parent = await account("parent", "parent"), studentUser = await account("student", "student"), otherUser = await account("other", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const addStudent = (userId: typeof coach.user, name: string) => ctx.db.insert("students", { seasonId: season, userId, legalName: `${name} Student`, preferredName: name, email: `${name}@example.invalid`, subteam: "A", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const student = await addStudent(studentUser.user, "Synthetic"), otherStudent = await addStudent(otherUser.user, "Other");
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic outreach", type: "Outreach", startsAt: 100, endsAt: 200, destination: "Example", travel: "Families provide transportation", overnight: true, roomingEnabled: true, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    const participant = await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 0, updatedAt: 0 });
    const otherParticipant = await ctx.db.insert("participants", { eventId: event, studentId: otherStudent, status: "confirmed", createdAt: 0, updatedAt: 0 });
    const shift = await ctx.db.insert("eventShifts", { eventId: event, startsAt: 100, endsAt: 150 });
    await ctx.db.insert("shiftSignups", { eventId: event, shiftId: shift, studentId: student, createdAt: 0 });
    return { coach, mentor, lead, parent, studentUser, otherUser, season, student, otherStudent, event, participant, otherParticipant };
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), mentor: as(ids.mentor.auth), lead: as(ids.lead.auth), parent: as(ids.parent.auth), student: as(ids.studentUser.auth), other: as(ids.otherUser.auth) };
}
type FreeFixture = Awaited<ReturnType<typeof freeFixture>>;
const digestCount = (f: FreeFixture) => f.t.run(async ctx => (await ctx.db.query("notificationDigestItems").take(50)).filter(item => item.kind === "withdrawalRequest").length);

describe("automatic withdrawal without money or commitments", () => {
  it("withdraws a free, commitment-free signup right away and keeps an approved record", async () => {
    const f = await freeFixture();
    expect(await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).toMatchObject({ reviewRequired: false, withdrawnImmediately: false });
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "auto-withdraw-one" });
    expect(await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "auto-withdraw-one" })).toBe(requestId);
    const state = await f.t.run(async ctx => ({
      participant: await ctx.db.get(f.ids.participant), request: await ctx.db.get(requestId),
      shifts: await ctx.db.query("shiftSignups").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.student)).take(5),
      audits: (await ctx.db.query("audit").take(50)).filter(row => row.entityId === requestId).map(row => ({ action: row.action, after: JSON.parse(row.afterJson ?? "null") as unknown })),
    }));
    expect(state.participant?.status).toBe("withdrawn");
    expect(state.request).toMatchObject({ status: "approved", decision: "full", returnCents: 0, retainedCents: 0, cancelUnpaidMain: false, decidedBy: f.ids.studentUser.user });
    expect(state.request?.jobId).toBeUndefined();
    expect(state.shifts).toHaveLength(0);
    expect(state.audits).toEqual([{ action: "autoWithdraw", after: expect.objectContaining({ participation: "withdrawn", shiftSignupsCleared: 1 }) }]);
    expect(await f.coach.query(api.withdrawals.pendingWithdrawals, {})).toEqual([]);
    expect(await digestCount(f)).toBe(0);
    expect(await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).toMatchObject({ status: "withdrawn", requestStatus: "approved", withdrawnImmediately: true });
    await expect(f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "auto-withdraw-two" })).rejects.toThrow("can't withdraw");
    await expect(f.student.mutation(api.participation.signUp, { eventId: f.ids.event })).rejects.toThrow("Ask a Coach to sign you up again");
  });

  const reviewCases: { name: string; setup: (f: FreeFixture) => Promise<unknown> }[] = [
    { name: "an event fee", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { feeCents: 500 })) },
    { name: "an event charge owed", setup: f => f.t.run(ctx => ctx.db.insert("charges", { studentId: f.ids.student, eventId: f.ids.event, label: "Lunch", category: "extra", amountCents: 700, appliedCents: 0, priority: 1, createdBy: f.ids.coach.user, createdAt: 1 })) },
    { name: "money applied to an event charge", setup: f => f.t.run(ctx => ctx.db.insert("charges", { studentId: f.ids.student, eventId: f.ids.event, label: "Shirt", category: "extra", amountCents: 700, appliedCents: 700, priority: 1, createdBy: f.ids.coach.user, createdAt: 1 })) },
    { name: "a room membership", setup: f => f.t.run(async ctx => { const groupId = await ctx.db.insert("roomGroups", { eventId: f.ids.event, category: "Boys", name: "Room 1", finalized: false, adultFifthException: false, needsReview: false, createdBy: f.ids.coach.user }); await ctx.db.insert("roomMemberships", { eventId: f.ids.event, groupId, studentId: f.ids.student, joinedAt: 0 }); }) },
    { name: "a room request", setup: f => f.t.run(ctx => ctx.db.insert("roomRequests", { eventId: f.ids.event, studentId: f.ids.student, requestedAt: 0 })) },
    { name: "a team transport seat", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { travel: "Charter Bus" })) },
    // Leaving a Whole Team event must go through leaveWholeTeam so the Coach notice is recorded.
    { name: "a free Whole Team event", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { signupMode: "assigned", assignmentScope: "wholeTeam" })) },
    // Owner decision 2026-11-06: every Coach-assigned event keeps Coach/Travel Lead review, even when free.
    { name: "a free Coach-assigned event", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { signupMode: "assigned" })) },
  ];
  it.each(reviewCases)("keeps Coach review for $name", async ({ setup }) => {
    const f = await freeFixture();
    await setup(f);
    expect((await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).reviewRequired).toBe(true);
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "review-needed" });
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("pending");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect(await f.coach.query(api.withdrawals.pendingWithdrawals, {})).toHaveLength(1);
    expect(await digestCount(f)).toBeGreaterThan(0);
  });

  it("does not count independent travel as a team transport seat", async () => {
    const f = await freeFixture();
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.event, { travel: "Charter Bus" }); await ctx.db.patch(f.ids.participant, { independentTravel: true }); });
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "independent-travel" });
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("approved");
  });

  const blockedCases: { name: string; patch: { archived?: boolean; allowWithdrawal?: boolean } }[] = [
    { name: "a past (archived) event", patch: { archived: true } },
    { name: "an event that does not allow withdrawal", patch: { allowWithdrawal: false } },
  ];
  it.each(blockedCases)("still rejects $name", async ({ patch }) => {
    const f = await freeFixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, patch));
    await expect(f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "blocked-withdrawal" })).rejects.toThrow();
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
  });

  it("only ever withdraws the caller's own signup", async () => {
    const f = await freeFixture();
    await expect(f.mentor.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "mentor-withdrawal" })).rejects.toThrow();
    await f.other.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "other-withdrawal" });
    const state = await f.t.run(async ctx => ({ mine: await ctx.db.get(f.ids.participant), theirs: await ctx.db.get(f.ids.otherParticipant) }));
    expect(state.mine?.status).toBe("confirmed");
    expect(state.theirs?.status).toBe("withdrawn");
  });
});

// Owner decision 2026-11-06: a Coach may put a withdrawn student back; a student may undo their own automatic withdrawal.
const DAY = 24 * 60 * 60 * 1000;
const auditsFor = (t: FreeFixture["t"], entityId: string) => t.run(async ctx => (await ctx.db.query("audit").take(100)).filter(row => row.entityId === entityId).map(row => ({ action: row.action, before: JSON.parse(row.beforeJson ?? "null") as unknown, after: JSON.parse(row.afterJson ?? "null") as unknown })));
async function autoWithdrawn() {
  const f = await freeFixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.event, { startsAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY }));
  const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "auto-before-undo" });
  return { ...f, requestId };
}
type AutoWithdrawn = Awaited<ReturnType<typeof autoWithdrawn>>;

describe("putting a withdrawn student back on an event", () => {
  const cases = [
    {
      name: "an automatic withdrawal",
      setup: async () => { const f = await autoWithdrawn(); return { t: f.t, coach: f.coach, student: f.student, eventId: f.ids.event, studentId: f.ids.student, participantId: f.ids.participant, requestId: f.requestId, coachUser: f.ids.coach.user, main: null }; },
      moneyDecision: false, again: "approved" as const,
    },
    {
      name: "a Coach-reviewed withdrawal that moved money",
      setup: async () => {
        const f = await fixture();
        const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "reviewed-before-put-back" });
        const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
        await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "full", cancelUnpaidMain: false, reason: "Approved travel change", expectedRevision });
        await finish(f);
        return { t: f.t, coach: f.coach, student: f.student, eventId: f.ids.event, studentId: f.ids.student, participantId: f.ids.participant, requestId, coachUser: f.ids.coach.user, main: f.ids.main };
      },
      moneyDecision: true, again: "pending" as const,
    },
  ];
  it.each(cases)("puts the student back after $name, keeps the history and lets them withdraw again", async ({ setup, moneyDecision, again }) => {
    const f = await setup();
    const main = f.main;
    const before = main ? await f.t.run(ctx => ctx.db.get(main)) : null;
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.eventId, studentId: f.studentId });
    const state = await f.t.run(async ctx => ({ participant: await ctx.db.get(f.participantId), request: await ctx.db.get(f.requestId) }));
    expect(state.participant?.status).toBe("confirmed");
    expect(state.request).toMatchObject({ status: "approved", reinstatedBy: f.coachUser });
    expect(state.request?.reinstatedAt).toBeTypeOf("number");
    expect(await auditsFor(f.t, f.participantId)).toContainEqual({ action: "putBackOnEvent", before: { status: "withdrawn", withdrawalRequestId: f.requestId, moneyDecision }, after: expect.objectContaining({ status: "confirmed" }) });
    // The put back never reverses the withdrawal's cancellation (a fee added back may take returned money, so applied can change).
    if (main && before) expect(await f.t.run(ctx => ctx.db.get(main))).toMatchObject({ cancelledCents: before.cancelledCents });
    await expect(f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.eventId, studentId: f.studentId })).rejects.toThrow("already on this event");
    const second = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.eventId, idempotencyKey: "withdraw-again" });
    expect((await f.t.run(ctx => ctx.db.get(second)))?.status).toBe(again);
  });

  const blocked: { name: string; as: (f: AutoWithdrawn) => FreeFixture["coach"]; setup?: (f: AutoWithdrawn) => Promise<unknown>; error: string }[] = [
    { name: "a Travel Lead on a Coach-assigned event", as: f => f.lead, setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { signupMode: "assigned" })), error: "Only a Coach can change signups for a required event" },
    { name: "a Mentor", as: f => f.mentor, error: "Only a Coach or Travel Lead" },
    { name: "a Parent", as: f => f.parent, error: "Only a Coach or Travel Lead" },
    { name: "a Student", as: f => f.student, error: "Only a Coach or Travel Lead" },
    { name: "a Coach when the event is full", as: f => f.coach, setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { capacity: 1 })), error: "This event is full" },
    { name: "a Coach when the event is canceled", as: f => f.coach, setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { cancelled: true })), error: "canceled" },
    { name: "a Coach on a Mentors-only event", as: f => f.coach, setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { audienceKind: "mentorsOnly" })), error: "Mentors only" },
  ];
  it.each(blocked)("rejects $name without changing anything", async ({ as, setup, error }) => {
    const f = await autoWithdrawn();
    await setup?.(f);
    await expect(as(f).mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student })).rejects.toThrow(error);
    const state = await f.t.run(async ctx => ({ participant: await ctx.db.get(f.ids.participant), request: await ctx.db.get(f.requestId) }));
    expect(state.participant?.status).toBe("withdrawn");
    expect(state.request?.reinstatedAt).toBeUndefined();
  });

  it("lets a Travel Lead put a student back on an optional event; leaving again blocks rejoining again", async () => {
    const f = await autoWithdrawn();
    await f.lead.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    // Only the latest, unreinstated approval blocks rejoining.
    await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "leave-again" });
    await expect(f.student.mutation(api.participation.signUp, { eventId: f.ids.event })).rejects.toThrow("Ask a Coach to sign you up again");
  });
});

describe("automatic enrollment after a withdrawal", () => {
  const cases = [
    { kind: "Whole Team", reinstated: false, enrolled: false },
    { kind: "Whole Team", reinstated: true, enrolled: true },
    { kind: "subteam", reinstated: false, enrolled: false },
    { kind: "subteam", reinstated: true, enrolled: true },
  ];
  it.each(cases)("$kind enrollment with reinstated=$reinstated enrolls: $enrolled", async ({ kind, reinstated, enrolled }) => {
    const f = await freeFixture();
    const joined = await f.t.run(async ctx => {
      const eventId = await ctx.db.insert("events", { seasonId: f.ids.season, name: "Synthetic required", type: "Team", startsAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY, destination: "Example", travel: "Families provide transportation", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false, ...(kind === "Whole Team" ? { assignmentScope: "wholeTeam" as const, wholeTeamParticipantCount: 0 } : { audienceKind: "subteams" as const, audienceSubteams: ["A"], mandatory: true }) });
      // A withdrawal whose signup row is gone: only the withdrawal history decides whether enrollment adds the student back.
      const participantId = await ctx.db.insert("participants", { eventId, studentId: f.ids.student, status: "withdrawn", createdAt: 0, updatedAt: 0 });
      await ctx.db.insert("withdrawalRequests", { eventId, studentId: f.ids.student, participantId, status: "approved", requestedBy: f.ids.studentUser.user, requestedAt: 1, idempotencyKey: `enroll-${kind}`, ...(reinstated ? { reinstatedAt: 2, reinstatedBy: f.ids.coach.user } : {}) });
      await ctx.db.delete(participantId);
      const [actor, event, student] = [await ctx.db.get(f.ids.coach.user), await ctx.db.get(eventId), await ctx.db.get(f.ids.student)];
      if (kind === "Whole Team") await assignWholeTeamMember(ctx, actor!, event!, student!);
      else await assignSubteamMember(ctx, actor!, event!, student!);
      return ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", f.ids.student)).unique();
    });
    expect(joined?.status ?? null).toBe(enrolled ? "confirmed" : null);
  });
});

describe("a student undoing their own automatic withdrawal", () => {
  const restores = [
    { prior: "confirmed" as const, mode: "open" as const },
    { prior: "pending" as const, mode: "approval" as const },
    { prior: "waitlist" as const, mode: "open" as const },
  ];
  it.each(restores)("restores $prior (never a higher status) before the event starts", async ({ prior, mode }) => {
    const f = await freeFixture();
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.event, { signupMode: mode, startsAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY }); await ctx.db.patch(f.ids.participant, { status: prior }); });
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: `undo-${prior}` });
    expect(await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).toMatchObject({ status: "withdrawn", withdrawnImmediately: true, canUndo: true });
    expect(await f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).toBe(prior);
    const state = await f.t.run(async ctx => ({ participant: await ctx.db.get(f.ids.participant), request: await ctx.db.get(requestId) }));
    expect(state.participant?.status).toBe(prior);
    expect(state.request).toMatchObject({ status: "approved", reinstatedBy: f.ids.studentUser.user, reinstatedByStudent: true });
    expect((await auditsFor(f.t, requestId)).map(row => row.action)).toEqual(["autoWithdraw", "undoWithdrawal"]);
    expect(await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).toMatchObject({ status: prior, canUndo: false, requestStatus: null });
    expect(await f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).toBe(prior);
  });

  const rejected: { name: string; setup?: (f: AutoWithdrawn) => Promise<unknown>; as: (f: AutoWithdrawn) => FreeFixture["student"] }[] = [
    { name: "after the event starts", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { startsAt: Date.now() - 1000 })), as: f => f.student },
    { name: "when the event is full", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { capacity: 1 })), as: f => f.student },
    { name: "for another student", as: f => f.other },
    { name: "for a Parent", as: f => f.parent },
    { name: "for a Coach (Coaches use Put back on event)", as: f => f.coach },
    // Security review 2026-11-06: the undo window ends at signup close when that comes first, and needs audience access.
    { name: "after signup closes, before the event starts", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { signupClosesAt: Date.now() - 1000 })), as: f => f.student },
    { name: "when the student is no longer in the event's audience", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { audienceKind: "subteams", audienceSubteams: ["B"], mandatory: false })), as: f => f.student },
  ];
  it.each(rejected)("is rejected $name", async ({ setup, as }) => {
    const f = await autoWithdrawn();
    await setup?.(f);
    // Whatever blocks the student's own undo also hides the Undo button.
    if (setup) expect((await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).canUndo).toBe(false);
    await expect(as(f).mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).rejects.toThrow();
    const state = await f.t.run(async ctx => ({ mine: await ctx.db.get(f.ids.participant), theirs: await ctx.db.get(f.ids.otherParticipant), request: await ctx.db.get(f.requestId) }));
    expect(state.mine?.status).toBe("withdrawn");
    expect(state.theirs?.status).toBe("confirmed");
    expect(state.request?.reinstatedAt).toBeUndefined();
  });

  it("is rejected for a Coach-reviewed withdrawal", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { startsAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY }));
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "reviewed-no-undo" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "retain", cancelUnpaidMain: true, reason: "Nonrefundable travel", expectedRevision });
    await finish(f);
    expect((await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).canUndo).toBe(false);
    await expect(f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).rejects.toThrow("can't undo");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("withdrawn");
  });

  const deadlines = [
    { name: "no signup close time", closesIn: undefined, expected: "start" as const },
    { name: "signup closing before the start", closesIn: DAY / 2, expected: "close" as const },
    { name: "signup closing after the start", closesIn: 3 * DAY, expected: "start" as const },
  ];
  it.each(deadlines)("shows the undo deadline for $name", async ({ closesIn, expected }) => {
    const f = await autoWithdrawn();
    const now = Date.now();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { startsAt: now + DAY, endsAt: now + 2 * DAY, signupClosesAt: closesIn === undefined ? undefined : now + closesIn }));
    const preview = await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student });
    expect(preview.undoUntil).toBe(expected === "close" ? now + closesIn! : now + DAY);
    expect(preview.canUndo).toBe(true);
  });

  it("allows three undos per event, then sends the student to a Coach", async () => {
    const f = await autoWithdrawn();
    for (let i = 1; i <= 3; i++) {
      expect(await f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).toBe("confirmed");
      await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: `withdraw-cycle-${i}` });
    }
    expect((await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).canUndo).toBe(false);
    await expect(f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).rejects.toThrow("Ask a Coach");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("withdrawn");
    // A Coach can still put them back.
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
  });
});

// Security review 2026-11-07: Undo follows signUp's rules for approval, shifts and questions.
describe("undo following the event's signup rules", () => {
  const addQuestion = (f: AutoWithdrawn, answered: boolean) => f.t.run(async ctx => {
    const questionId = await ctx.db.insert("eventQuestions", { eventId: f.ids.event, order: 0, kind: "shortText", prompt: "T-shirt size?", required: true });
    if (answered) await ctx.db.insert("eventQuestionAnswers", { eventId: f.ids.event, studentId: f.ids.student, questionId, value: "M", answeredBy: f.ids.studentUser.user, updatedAt: 0 });
  });
  const cases: { name: string; setup: (f: AutoWithdrawn) => Promise<unknown>; restored?: "pending" | "confirmed" | "waitlist"; blocked?: string }[] = [
    { name: "an event that now needs approval", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { signupMode: "approval" })), restored: "pending" },
    { name: "an event that now needs shifts", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { shiftsEnabled: true })), blocked: "pick shifts" },
    { name: "a shifts event with no minimum", setup: f => f.t.run(ctx => ctx.db.patch(f.ids.event, { shiftsEnabled: true, minShiftsPerStudent: 0 })), restored: "confirmed" },
    { name: "a new required question", setup: f => addQuestion(f, false), blocked: "questions you haven't answered" },
    { name: "a required question already answered", setup: f => addQuestion(f, true), restored: "confirmed" },
  ];
  it.each(cases)("handles $name", async ({ setup, restored, blocked }) => {
    const f = await autoWithdrawn();
    await setup(f);
    const preview = await f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student });
    expect(preview).toMatchObject({ canUndo: !blocked, undoBlocked: blocked ? expect.stringContaining(blocked) : null });
    if (blocked) {
      await expect(f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).rejects.toThrow(blocked);
      expect((await f.t.run(ctx => ctx.db.get(f.requestId)))?.reinstatedAt).toBeUndefined();
    } else expect(await f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).toBe(restored);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe(restored ?? "withdrawn");
  });

  it("lets a Waitlisted student back on the waitlist without shifts", async () => {
    const f = await freeFixture();
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.event, { startsAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY }); await ctx.db.patch(f.ids.participant, { status: "waitlist" }); });
    await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "waitlist-shifts" });
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { shiftsEnabled: true }));
    expect(await f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).toBe("waitlist");
  });
});

// Security review 2026-11-07: a returning student owes the current fee unless an active main charge for the event remains.
describe("the event fee when a student comes back", () => {
  const mainCharges = (f: { t: FreeFixture["t"] }, eventId: Id<"events">, studentId: Id<"students">) => f.t.run(async ctx => (await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(20)).filter(c => (c.category ?? "main") === "main"));
  const active = (c: { amountCents: number; adjustedCents?: number; cancelledCents?: number }) => c.amountCents + (c.adjustedCents ?? 0) - (c.cancelledCents ?? 0) > 0;

  // Security review 2026-11-07 (M-1): a returning student gets back only the main fee that withdrawal cancelled. The fixture's fee is
  // $100.00 with $80.00 paid; the $20.00 extra never counts.
  const dispositions = [
    { name: "retained money and cancelled the unpaid balance", decision: "retain" as const, cancelUnpaidMain: true, returnCents: undefined, added: 2000 },
    { name: "refunded the paid money without cancelling the unpaid balance", decision: "full" as const, cancelUnpaidMain: false, returnCents: undefined, added: 8000 },
    { name: "refunded part of the money", decision: "partial" as const, cancelUnpaidMain: false, returnCents: 3000, added: 3000 },
    { name: "refunded everything and cancelled the unpaid balance", decision: "full" as const, cancelUnpaidMain: true, returnCents: undefined, added: 10000 },
    { name: "kept the unpaid fee and retained the money", decision: "retain" as const, cancelUnpaidMain: false, returnCents: undefined, added: 0 },
  ];
  async function reviewedWithdrawal(d: { decision: "full" | "retain" | "partial"; cancelUnpaidMain: boolean; returnCents: number | undefined }) {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: `fee-${d.decision}-${d.cancelUnpaidMain}` });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: d.decision, returnCents: d.returnCents, cancelUnpaidMain: d.cancelUnpaidMain, reason: "Synthetic decision", expectedRevision });
    await finish(f);
    return { f, requestId };
  }

  it.each(dispositions)("Put back on event after a withdrawal that $name adds back $added cents", async d => {
    const { f } = await reviewedWithdrawal(d);
    const before = await mainCharges(f, f.ids.event, f.ids.student);
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    const after = await mainCharges(f, f.ids.event, f.ids.student);
    const added = after.filter(c => !before.some(b => b._id === c._id));
    expect(added.map(c => c.amountCents)).toEqual(d.added ? [d.added] : []);
  });

  it("does not add the fee again when the same withdrawal is put back twice", async () => {
    const { f, requestId } = await reviewedWithdrawal(dispositions[1]);
    // Production events already have their main fee definition from the first signup.
    await f.t.run(async ctx => { const student = await ctx.db.get(f.ids.student); await chargeFeeDefinition(ctx, f.ids.coach.user, student!, { eventId: f.ids.event, category: "main", idempotencyKey: `eventFee:${f.ids.event}:${f.ids.student}`, label: "Travel", amountCents: 10000, priority: 1 }); });
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.participant, { status: "withdrawn" }); await ctx.db.patch(requestId, { reinstatedAt: undefined, reinstatedBy: undefined }); });
    const first = await mainCharges(f, f.ids.event, f.ids.student);
    expect(first.some(c => c.amountCents === 8000)).toBe(true);
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    expect(await mainCharges(f, f.ids.event, f.ids.student)).toHaveLength(first.length);
  });

  // Security review 2026-11-07 (M-A): a Coach who already re-charged the fee by hand while the student was withdrawn is not charged twice.
  describe("when a Coach already re-charged the fee by hand", () => {
    const fullCancel = dispositions[3];
    const putBack = async (f: Awaited<ReturnType<typeof reviewedWithdrawal>>["f"]) => {
      const before = await mainCharges(f, f.ids.event, f.ids.student);
      await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
      const after = await mainCharges(f, f.ids.event, f.ids.student);
      return after.filter(c => !before.some(b => b._id === c._id)).map(c => c.amountCents);
    };
    it("adds nothing after a correction raised the charge back to $100", async () => {
      const { f } = await reviewedWithdrawal(fullCancel);
      await f.t.run(ctx => ctx.db.patch(f.ids.main, { cancelledCents: 0 }));
      expect(await putBack(f)).toEqual([]);
      expect(await auditsFor(f.t, f.ids.participant)).toContainEqual(expect.objectContaining({ action: "putBackOnEvent", after: { status: "confirmed", restoredCents: 0, chargeId: null } }));
    });
    it("adds nothing after a Coach added a separate main charge", async () => {
      const { f } = await reviewedWithdrawal(fullCancel);
      await f.t.run(ctx => ctx.db.insert("charges", { studentId: f.ids.student, eventId: f.ids.event, label: "Travel again", category: "main", amountCents: 10000, appliedCents: 0, priority: 4, createdBy: f.ids.coach.user, createdAt: Date.now() }));
      expect(await putBack(f)).toEqual([]);
    });
    it("adds only the rest after a partial re-charge of $40 and records it in the audit row", async () => {
      const { f } = await reviewedWithdrawal(fullCancel);
      await f.t.run(ctx => ctx.db.patch(f.ids.main, { cancelledCents: 6000 }));
      expect(await putBack(f)).toEqual([6000]);
      const audits = await auditsFor(f.t, f.ids.participant);
      expect(audits).toContainEqual(expect.objectContaining({ action: "putBackOnEvent", after: expect.objectContaining({ restoredCents: 6000, chargeId: expect.any(String) }) }));
    });
  });

  it("keeps a waived fee waived", async () => {
    const { f } = await reviewedWithdrawal(dispositions[4]);
    await f.t.run(ctx => ctx.db.patch(f.ids.main, { adjustedCents: -10000, appliedCents: 0, outstanding: false }));
    const before = await mainCharges(f, f.ids.event, f.ids.student);
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    expect(await mainCharges(f, f.ids.event, f.ids.student)).toHaveLength(before.length);
  });

  it("adds nothing on Undo for a fee a Coach cancelled, and never adds a second fee", async () => {
    const f = await autoWithdrawn();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { feeCents: 5000 }));
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    const [first] = await mainCharges(f, f.ids.event, f.ids.student);
    expect(first).toMatchObject({ amountCents: 5000 });
    // A Coach cancels that fee and makes the event free; the student then leaves without review.
    await f.t.run(async ctx => { await ctx.db.patch(first._id, { cancelledCents: 5000, outstanding: false }); await ctx.db.patch(f.ids.event, { feeCents: 0 }); });
    await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "leave-after-cancel" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("withdrawn");
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { feeCents: 6000 }));
    expect(await f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).toBe("confirmed");
    expect(await f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event })).toBe("confirmed");
    const charges = await mainCharges(f, f.ids.event, f.ids.student);
    expect(charges).toHaveLength(1);
    expect(charges.filter(active)).toEqual([]);
  });

  it("adds nothing, and does not fail, when the event's main fee was canceled", async () => {
    const f = await autoWithdrawn();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { feeCents: 5000 }));
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    const [first] = await mainCharges(f, f.ids.event, f.ids.student);
    await f.t.run(async ctx => {
      await ctx.db.patch(first._id, { cancelledCents: 5000, outstanding: false });
      await ctx.db.patch(f.ids.event, { feeCents: 0 });
    });
    await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "leave-before-definition-cancel" });
    await f.t.run(async ctx => { await ctx.db.patch(first.feeDefinitionId!, { state: "cancelled" }); await ctx.db.patch(f.ids.event, { feeCents: 6000 }); });
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect(await mainCharges(f, f.ids.event, f.ids.student)).toHaveLength(1);
  });
});

describe("Whole Team leave notice after Put back on event", () => {
  it("dismisses the student's open leave notice with an audit entry", async () => {
    const f = await freeFixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { signupMode: "assigned", assignmentScope: "wholeTeam", allowWithdrawal: false, startsAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY }));
    await f.student.mutation(api.withdrawals.leaveWholeTeam, { eventId: f.ids.event });
    const [notice] = await f.coach.query(api.withdrawals.wholeTeamLeaveNotices, { eventId: f.ids.event });
    expect(notice).toBeDefined();
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect(await f.coach.query(api.withdrawals.wholeTeamLeaveNotices, { eventId: f.ids.event })).toEqual([]);
    expect(await f.t.run(ctx => ctx.db.get(notice.noticeId))).toMatchObject({ dismissedBy: f.ids.coach.user });
    expect((await auditsFor(f.t, notice.noticeId)).map(row => row.action)).toEqual(["dismiss"]);
  });
});

// Security review 2026-11-06: more than 100 withdrawal rows for one event and student fails closed everywhere.
describe("withdrawal history beyond the read limit", () => {
  const reads: { name: string; run: (f: FreeFixture) => Promise<unknown> }[] = [
    { name: "student signup", run: f => f.student.mutation(api.participation.signUp, { eventId: f.ids.event }) },
    { name: "signup availability", run: f => f.student.query(api.participation.signupAvailability, { eventId: f.ids.event }) },
    { name: "Coach setParticipation", run: f => f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "confirmed" }) },
    { name: "student Home open signups", run: f => f.student.query(api.studentHome.summary, { asOfDay: "2026-11-06" }) },
    { name: "withdrawal preview", run: f => f.student.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student }) },
    { name: "student undo", run: f => f.student.mutation(api.withdrawals.undoWithdrawal, { eventId: f.ids.event }) },
    { name: "Coach Put back on event", run: f => f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.event, studentId: f.ids.student }) },
    { name: "Whole Team auto-enrollment", run: f => f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 1 });
      await ctx.db.delete(f.ids.participant);
      const [actor, event, student] = [await ctx.db.get(f.ids.coach.user), await ctx.db.get(f.ids.event), await ctx.db.get(f.ids.student)];
      await assignWholeTeamMember(ctx, actor!, event!, student!);
    }) },
  ];
  it.each(reads)("refuses $name", async ({ run }) => {
    const f = await freeFixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { startsAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY });
      await ctx.db.patch(f.ids.participant, { status: "withdrawn" });
      for (let i = 0; i < 101; i++) await ctx.db.insert("withdrawalRequests", { eventId: f.ids.event, studentId: f.ids.student, participantId: f.ids.participant, status: "approved", requestedBy: f.ids.studentUser.user, requestedAt: i, reinstatedAt: i, reinstatedBy: f.ids.coach.user, idempotencyKey: `history-${i}` });
    });
    await expect(run(f)).rejects.toThrow("too many withdrawal records");
  });

  // Security review 2026-11-07: the Coach's event signups read only each withdrawn student's newest rows.
  it("still shows Coach event signups from the newest rows", async () => {
    const f = await freeFixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.participant, { status: "withdrawn" });
      for (let i = 0; i < 101; i++) await ctx.db.insert("withdrawalRequests", { eventId: f.ids.event, studentId: f.ids.student, participantId: f.ids.participant, status: "approved", requestedBy: f.ids.studentUser.user, requestedAt: i, reinstatedAt: i, reinstatedBy: f.ids.coach.user, idempotencyKey: `history-${i}` });
      await ctx.db.insert("withdrawalRequests", { eventId: f.ids.event, studentId: f.ids.student, participantId: f.ids.participant, status: "pending", requestedBy: f.ids.studentUser.user, requestedAt: 200, idempotencyKey: "history-open" });
    });
    const workspace = await f.coach.query(api.eventOperations.workspace, { eventId: f.ids.event });
    expect(workspace.withdrawn).toEqual([expect.objectContaining({ studentId: f.ids.student, inReview: true, moneyDecision: false })]);
  });
});
