/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
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
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), lead: as(ids.lead.auth), mentor: as(ids.mentor.auth), student: as(ids.studentUser.auth), other: as(ids.otherUser.auth) };
}

describe("withdrawal decisions", () => {
  it("preserves reservation while pending or denied, then releases room and capacity with source-preserving full return", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-one" });
    const revision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    expect(await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-one" })).toBe(requestId);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    await expect(f.mentor.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "other-key" })).rejects.toThrow();
    await expect(f.mentor.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "full", cancelUnpaidMain: false, reason: "Please release", expectedRevision: revision })).rejects.toThrow("denied");
    await f.lead.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "deny", cancelUnpaidMain: false, reason: "Needs attendance", expectedRevision: revision });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    const request2 = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-two" });
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId: request2, decision: "full", cancelUnpaidMain: false, reason: "Approved travel change", expectedRevision: revision });
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
    await expect(f.student.mutation(api.participation.signUp, { eventId: f.ids.event })).rejects.toThrow("Coach must review reenrollment");
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "pending" })).rejects.toThrow("Coach must review reenrollment");
  });

  it("rejects over-return and source ambiguity without changing participation or charges", async () => {
    const f = await fixture(true);
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-ambiguous" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "partial", returnCents: 9001, cancelUnpaidMain: false, reason: "Too many cents", expectedRevision })).rejects.toThrow("eligible paid");
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "full", cancelUnpaidMain: false, reason: "Unknown source", expectedRevision })).rejects.toThrow("ambiguous funding sources");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.main)))?.cancelledCents).toBeUndefined();
    await expect(f.student.mutation(api.participation.withdraw, { eventId: f.ids.event })).rejects.toThrow("Submit a withdrawal request");
    await expect(f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.event, studentId: f.ids.student, status: "withdrawn" })).rejects.toThrow("reviewed withdrawal");
  });

  it("is idempotent for the same decision and rejects a contradictory repeat", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "request-repeat" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    const args = { requestId, decision: "retain" as const, cancelUnpaidMain: true, reason: "Nonrefundable travel", expectedRevision };
    await f.lead.mutation(api.withdrawals.reviewWithdrawal, args);
    await f.lead.mutation(api.withdrawals.reviewWithdrawal, args);
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, { ...args, decision: "full" })).rejects.toThrow("already decided differently");
    const charges = await f.t.run(async ctx => ({ main: await ctx.db.get(f.ids.main), extra: await ctx.db.get(f.ids.extra) }));
    expect(charges.main).toMatchObject({ appliedCents: 8000, cancelledCents: 2000 });
    expect(charges.extra).toMatchObject({ appliedCents: 1000, cancelledCents: 1000 });
  });

  it("returns a partial mixed-source amount and leaves the unpaid main balance owed", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "partial-request" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "partial", returnCents: 7000, cancelUnpaidMain: false, reason: "Approved partial return", expectedRevision });
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
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, args)).rejects.toThrow("archived");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("pending");
  });

  it("rolls back cancellation when it would exceed the ledger limit", async () => {
    const f = await fixture();
    const requestId = await f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.event, idempotencyKey: "cap-request" });
    const expectedRevision = (await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.event, studentId: f.ids.student })).revision;
    await f.t.run(async ctx => { for (let i=0;i<494;i++) await ctx.db.insert("ledgerEntries", { studentId: f.ids.student, kind: "adjustment", amountCents: 0, previousCents: 0, newCents: 0, recordedBy: f.ids.coach.user, recordedAt: 100+i, idempotencyKey: `filler:${i}` }); });
    await expect(f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "retain", cancelUnpaidMain: true, reason: "Retain and cancel unpaid", expectedRevision })).rejects.toThrow("Financial record limit");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.participant)))?.status).toBe("confirmed");
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("pending");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.main)))?.cancelledCents).toBeUndefined();
  });
});
