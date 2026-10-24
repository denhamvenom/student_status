/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { scheduleEventArchive } from "./eventArchive";

const modules = import.meta.glob("./**/*.ts");
const paginationOpts = { cursor: null, numItems: 20 };
afterEach(() => vi.useRealTimers());
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const authParent = await ctx.db.insert("users", { email: "parent@example.invalid" });
    const authStudent = await ctx.db.insert("users", { email: "student@example.invalid" });
    const authLead = await ctx.db.insert("users", { email: "lead@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: true });
    const parent = await ctx.db.insert("appUsers", { authUserId: authParent, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const user = await ctx.db.insert("appUsers", { authUserId: authStudent, email: "student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
    await ctx.db.insert("appUsers", { authUserId: authLead, email: "lead@example.invalid", name: "Lead", role: "mentor", active: true, travelLead: true, financialEdit: false });
    const seasonId = await ctx.db.insert("seasons", { name: "Synthetic season", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const studentId = await ctx.db.insert("students", { seasonId, userId: user, legalName: "Synthetic Student", preferredName: "Student", email: "student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: true, roomCategory: "Boys", allergies: { state: "none" }, medications: { state: "none" } });
    await ctx.db.insert("familyLinks", { studentId, parentUserId: parent, active: true, createdBy: coach });
    const fields = { seasonId, name: "Past outreach", type: "Outreach" as const, startsAt: Date.now() - 2000, endsAt: Date.now() - 1000, destination: "Synthetic venue", travel: "School Bus", overnight: true, roomingEnabled: true, feeCents: 5000, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false };
    const past = await ctx.db.insert("events", fields);
    const future = await ctx.db.insert("events", { ...fields, name: "Future outreach", startsAt: Date.now() + 10000, endsAt: Date.now() + 20000 });
    const participant = await ctx.db.insert("participants", { studentId, eventId: past, status: "confirmed", createdAt: 1, updatedAt: 1 });
    const requirement = await ctx.db.insert("requirements", { eventId: past, key: "packing", label: "Bring safety glasses", dueAt: 1 });
    const charge = await ctx.db.insert("charges", { studentId, eventId: past, label: "Past outreach fee", amountCents: 5000, appliedCents: 1000, priority: 1, createdBy: coach, createdAt: 1 });
    const submission = await ctx.db.insert("permissionSubmissions", { studentId, seasonId, signedBy: parent, typedName: "Synthetic Parent", wordingVersion: "DRAFT", eventIds: [past], answersJson: "{}", signedAt: 1 });
    return { authCoach, authParent, authStudent, authLead, past, future, studentId, participant, requirement, charge, submission };
  });
  const as = (id: typeof ids.authCoach) => t.withIdentity({ subject: `${id}|session` });
  return { t, ids, coach: as(ids.authCoach), parent: as(ids.authParent), student: as(ids.authStudent), lead: as(ids.authLead) };
}

describe("automatic past-event archive", () => {
  it("hides past events and leftover tasks, retains exact financial and historical records, and exposes a staff-only archive", async () => {
    const f = await fixture();
    const before = await f.t.run(async ctx => ({ charge: await ctx.db.get(f.ids.charge), participant: await ctx.db.get(f.ids.participant), requirement: await ctx.db.get(f.ids.requirement), submission: await ctx.db.get(f.ids.submission) }));
    expect((await f.student.query(api.app.studentDashboard, { studentId: f.ids.studentId })).todos.some(row => row.eventId === f.ids.past)).toBe(true);
    expect(await f.t.mutation(internal.eventArchive.sweep, {})).toBe(1);
    expect(await f.t.mutation(internal.eventArchive.sweep, {})).toBe(0);
    for (const actor of [f.parent, f.student]) {
      expect((await actor.query(api.app.listEvents, {})).map(row => row.event._id)).toEqual([f.ids.future]);
      const dashboard = await actor.query(api.app.studentDashboard, { studentId: f.ids.studentId });
      expect(dashboard.events.some(row => row.event._id === f.ids.past)).toBe(false);
      expect(dashboard.todos.some(row => row.eventId === f.ids.past)).toBe(false);
      await expect(actor.query(api.app.eventDetail, { eventId: f.ids.past })).rejects.toThrow("archived");
      await expect(actor.query(api.app.eventReadiness, { eventId: f.ids.past, studentId: f.ids.studentId })).rejects.toThrow();
      await expect(actor.query(api.eventArchive.page, { paginationOpts })).rejects.toThrow("Coaches");
      await expect(actor.query(api.eventArchive.detail, { eventId: f.ids.past, paginationOpts })).rejects.toThrow("Coaches");
      await expect(actor.query(api.withdrawals.withdrawalPreview, { eventId: f.ids.past, studentId: f.ids.studentId })).rejects.toThrow("archived");
      await expect(actor.query(api.travel.ownTravel, { eventId: f.ids.past, studentId: f.ids.studentId })).rejects.toThrow();
      const charges = await actor.query(api.financeDetails.charges, { studentId: f.ids.studentId, paginationOpts });
      expect(JSON.stringify(charges)).toContain("Past outreach fee");
    }
    await expect(f.student.query(api.rooms.mine, { eventId: f.ids.past })).rejects.toThrow();
    await expect(f.student.mutation(api.participation.signUp, { eventId: f.ids.past })).rejects.toThrow();
    await expect(f.student.mutation(api.withdrawals.requestWithdrawal, { eventId: f.ids.past, idempotencyKey: "synthetic-archived" })).rejects.toThrow();
    expect(await f.parent.query(api.permissions.listSubmissions, { studentId: f.ids.studentId })).toEqual([]);
    await expect(f.parent.query(api.permissions.receipt, { submissionId: f.ids.submission })).rejects.toThrow("archived");
    await expect(f.parent.query(api.permissionsV2.receipt, { submissionId: f.ids.submission })).rejects.toThrow("archived");
    await expect(f.parent.query(internal.permissionsV2.pdfAccess, { submissionId: f.ids.submission, rendition: "signed", now: Date.now() })).rejects.toThrow("archived");
    for (const actor of [f.coach, f.lead]) {
      expect((await actor.query(api.eventArchive.page, { paginationOpts })).page.map(event => event._id)).toEqual([f.ids.past]);
      expect((await actor.query(api.eventArchive.detail, { eventId: f.ids.past, paginationOpts })).participants.page[0]).toMatchObject({ studentId: f.ids.studentId, status: "confirmed" });
    }
    const after = await f.t.run(async ctx => ({ charge: await ctx.db.get(f.ids.charge), participant: await ctx.db.get(f.ids.participant), requirement: await ctx.db.get(f.ids.requirement), submission: await ctx.db.get(f.ids.submission) }));
    expect(after).toEqual(before);
    expect(after.charge!.amountCents - after.charge!.appliedCents).toBe(4000);
  });

  it("archives exactly at the scheduled end and ignores stale callbacks after rescheduling", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const original = (await f.t.run(ctx => ctx.db.get(f.ids.future)))!;
    await f.t.mutation(internal.eventArchive.atEnd, { eventId: f.ids.future, endsAt: original.endsAt });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.future)))!.archived).toBe(false);
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.future, { endsAt: original.endsAt + 10000 }); await scheduleEventArchive(ctx, f.ids.future); });
    vi.setSystemTime(original.endsAt);
    await f.t.mutation(internal.eventArchive.atEnd, { eventId: f.ids.future, endsAt: original.endsAt });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.future)))!.archived).toBe(false);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.future)))!.archived).toBe(true);
  });

  it("catches up in bounded batches, pages historical seasons, and keeps archived rows out of the active event limit", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    await f.t.run(async ctx => {
      const original = (await ctx.db.get(f.ids.past))!;
      const { _id: _id, _creationTime: _time, ...fields } = original;
      const season = (await ctx.db.get(original.seasonId))!;
      const oldSeason = await ctx.db.insert("seasons", { name: "Prior synthetic season", year: 2025, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: season.createdBy });
      for (let i = 0; i < 205; i++) await ctx.db.insert("events", { ...fields, name: `Historical event ${i}` });
      await ctx.db.insert("events", { ...fields, name: "Prior season event", seasonId: oldSeason });
    });
    expect(await f.t.mutation(internal.eventArchive.sweep, {})).toBe(100);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await f.student.query(api.app.listEvents, {})).map(row => row.event._id)).toEqual([f.ids.future]);
    let cursor: string | null = null;
    let count = 0;
    let historicalId: typeof f.ids.past | null = null;
    for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
      const result: FunctionReturnType<typeof api.eventArchive.page> = await f.coach.query(api.eventArchive.page, { paginationOpts: { numItems: 20, cursor } });
      count += result.page.length;
      historicalId ??= result.page.find(event => event.seasonName === "Prior synthetic season")?._id ?? null;
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(count).toBe(207);
    expect(historicalId).not.toBeNull();
    expect((await f.lead.query(api.eventArchive.detail, { eventId: historicalId!, paginationOpts })).seasonName).toBe("Prior synthetic season");
  });
});
