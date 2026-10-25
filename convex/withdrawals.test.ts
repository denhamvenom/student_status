/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { startFinancialRebuild } from "./financialSources";
import { financialAccount } from "./lib/financialSources";
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
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "pending" })).rejects.toThrow("Only a Coach can sign them up again");
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
