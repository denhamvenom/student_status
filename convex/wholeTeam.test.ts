/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { syncWholeTeamMembership } from "./lib/wholeTeam";

const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, financialEdit: true, travelLead: false });
    const season = await ctx.db.insert("seasons", { name: "Test", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    const students = [];
    for (let i = 0; i < 3; i++) students.push(await ctx.db.insert("students", { seasonId: season, legalName: `Member ${i}`, preferredName: `Member ${i}`, email: `${i}@example.invalid`, active: i < 2, travelTeam: false, subteam: "", roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
    return { auth, coach, season, students };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|one` }) };
}
const details = () => ({ name: "Whole Team", type: "Team" as const, startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, destination: "School", travel: "None", overnight: false, roomingEnabled: false, feeCents: 100, signupMode: "assigned" as const, assignmentScope: "wholeTeam" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] });

async function createComplete(f: Awaited<ReturnType<typeof fixture>>, fields = details()) {
  vi.useFakeTimers();
  try {
    const event = await f.coach.mutation(api.admin.createEvent, fields);
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers(), 1000);
    return event;
  } finally { vi.useRealTimers(); }
}

describe("Whole Team enrollment", () => {
  it("assigns every active member independently of Travel Team and bills once", async () => {
    const f = await fixture();
    const event = await createComplete(f);
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[2], active: true });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[2], active: true });
    const rows = await f.t.run(async ctx => ({ participants: await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event)).collect(), charges: await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event)).collect() }));
    expect(rows.participants).toHaveLength(3);
    expect(rows.participants.every(p => p.status === "confirmed")).toBe(true);
    expect(rows.charges).toHaveLength(3);
  });

  it("does not reenroll withdrawn members or add new members to started or archived events", async () => {
    const f = await fixture();
    const upcoming = await createComplete(f);
    const started = await createComplete(f, { ...details(), startsAt: Date.now() - 10000 });
    const archived = await createComplete(f);
    await f.t.run(async ctx => {
      await ctx.db.patch(archived, { archived: true });
      const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", upcoming).eq("studentId", f.ids.students[0])).unique();
      await ctx.db.patch(participant!._id, { status: "withdrawn" });
    });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[0], active: false });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[0], active: true });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[2], active: true });
    const rows = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", f.ids.students[2])).collect());
    expect(rows.map(p => p.eventId)).toEqual([upcoming]);
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", upcoming).eq("studentId", f.ids.students[0])).unique())).toMatchObject({ status: "withdrawn" });
    expect(rows.some(p => p.eventId === started)).toBe(false);
  });

  it("adds approved new and linked members to upcoming Whole Team events", async () => {
    const f = await fixture();
    const event = await createComplete(f);
    const requests = await f.t.run(async ctx => {
      const first = await ctx.db.insert("users", { email: "new@example.invalid" });
      const linked = await ctx.db.insert("users", { email: "2@example.invalid" });
      const request = (authUserId: typeof first, email: string) => ctx.db.insert("joinRequests", { authUserId, email, firstName: "New", lastName: "Member", seasonId: f.ids.season, status: "pending", createdAt: Date.now() });
      return { first: await request(first, "new@example.invalid"), linked: await request(linked, "2@example.invalid") };
    });
    await f.coach.mutation(api.admin.approveJoin, { requestId: requests.first, approve: true });
    await f.coach.mutation(api.admin.approveJoin, { requestId: requests.linked, approve: true, existingStudentId: f.ids.students[2] });
    const rows = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event)).collect());
    expect(rows).toHaveLength(4);
    expect(rows.some(p => p.studentId === f.ids.students[2])).toBe(true);
  });

  it("creates the supported 500-member Whole Team roster", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 498; i++) await ctx.db.insert("students", { seasonId: f.ids.season, legalName: `Scale ${i}`, preferredName: `Scale ${i}`, email: `scale${i}@example.invalid`, active: true, travelTeam: false, subteam: "", roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      // Retire the unused inactive fixture member to keep this season at its supported 500 rows.
      await ctx.db.delete(f.ids.students[2]);
    });
    const event = await createComplete(f, { ...details(), feeCents: 0 });
    const rows = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event)).collect());
    expect(rows).toHaveLength(500);
    expect(new Set(rows.map(p => p.studentId)).size).toBe(500);
  });

  it("ignores more than 100 historical or archived events when enrolling a later member", async () => {
    const f = await fixture();
    const upcoming = await createComplete(f);
    await f.t.run(async ctx => {
      for (let i = 0; i < 120; i++) {
        const { requirements: _requirements, ...eventFields } = details();
        await ctx.db.insert("events", { ...eventFields, seasonId: f.ids.season, startsAt: i < 60 ? Date.now() - 10000 : Date.now() + 86400000, archived: i >= 60 });
      }
    });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[2], active: true });
    const rows = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", f.ids.students[2])).collect());
    expect(rows.map(p => p.eventId)).toEqual([upcoming]);
  });

  it("enrolls in 100 upcoming events using one financial history read per table", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 100; i++) {
        const { requirements: _requirements, ...eventFields } = details();
        await ctx.db.insert("events", { ...eventFields, seasonId: f.ids.season, archived: false, wholeTeamParticipantCount: 0 });
      }
      await ctx.db.insert("ledgerEntries", { studentId: f.ids.students[2], kind: "payment", amountCents: 5000, previousCents: 0, newCents: 5000, recordedBy: f.ids.coach, recordedAt: Date.now(), idempotencyKey: "scale-payment" });
      await ctx.db.insert("ledgerEntries", { studentId: f.ids.students[2], kind: "fundraiser", amountCents: 5000, previousCents: 0, newCents: 5000, recordedBy: f.ids.coach, recordedAt: Date.now(), idempotencyKey: "scale-fundraiser" });
    });
    const queries = await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.students[2], { active: true });
      const student = await ctx.db.get(f.ids.students[2]); const actor = await ctx.db.get(f.ids.coach);
      const counts = { charges: 0, ledgerEntries: 0, participants: 0 };
      const db = new Proxy(ctx.db, { get(target, key, receiver) {
        if (key !== "query") return Reflect.get(target, key, receiver);
        return (table: Parameters<typeof ctx.db.query>[0]) => {
          if (table === "charges" || table === "ledgerEntries" || table === "participants") counts[table]++;
          return target.query(table);
        };
      } });
      await syncWholeTeamMembership({ ...ctx, db }, actor!, student!);
      return counts;
    });
    expect(queries).toEqual({ charges: 1, ledgerEntries: 101, participants: 100 });
    const rows = await f.t.run(async ctx => ({ participants: await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", f.ids.students[2])).collect(), entries: await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", f.ids.students[2])).collect() }));
    expect(rows.participants).toHaveLength(100);
    expect(rows.entries.filter(e => e.kind === "charge")).toHaveLength(100);
    const allocations = rows.entries.filter(e => e.kind === "allocation");
    expect(allocations.reduce((total, e) => total + e.amountCents, 0)).toBe(10000);
    expect(new Set(allocations.map(e => e.sourceKind))).toEqual(new Set(["payment", "fundraiser"]));
  });

  it("keeps provisioning pending until the stable snapshot finishes and guards duplicate progress", async () => {
    const f = await fixture();
    vi.useFakeTimers();
    try {
      const event = await f.coach.mutation(api.admin.createEvent, details());
      const job = await f.t.run(ctx => ctx.db.query("eventEnrollmentJobs").withIndex("by_eventId", q => q.eq("eventId", event)).unique());
      expect(await f.coach.query(api.eventEnrollment.status, { eventId: event })).toMatchObject({ state: "running", assigned: 0, processed: 0 });
      await expect(f.coach.mutation(api.participation.setParticipation, { eventId: event, studentId: f.ids.students[0], status: "confirmed" })).rejects.toThrow("must finish");
      await f.t.mutation(internal.eventEnrollment.processPage, { jobId: job!._id, expectedCursor: null });
      await f.t.mutation(internal.eventEnrollment.processPage, { jobId: job!._id, expectedCursor: null });
      expect(await f.coach.query(api.eventEnrollment.status, { eventId: event })).toMatchObject({ state: "running", assigned: 1, processed: 1 });
      // Later activation enrolls independently; it does not extend the original two-member snapshot.
      await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[2], active: true });
      await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(await f.coach.query(api.eventEnrollment.status, { eventId: event })).toMatchObject({ state: "complete", assigned: 3, processed: 2 });
      await f.t.mutation(internal.eventEnrollment.run, { jobId: job!._id });
      const charges = await f.t.run(ctx => ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event)).collect());
      expect(charges).toHaveLength(3);
    } finally { vi.useRealTimers(); }
  });

  it("rolls back one member's failed fee and resumes once after Coach retry", async () => {
    const f = await fixture();
    vi.useFakeTimers();
    try {
      const event = await f.coach.mutation(api.admin.createEvent, details());
      const conflict = await f.t.run(async ctx => {
        const chargeId = await ctx.db.insert("charges", { studentId: f.ids.students[0], eventId: event, label: "Wrong fee", amountCents: 1, appliedCents: 0, priority: 0, createdBy: f.ids.coach, createdAt: Date.now() });
        const entryId = await ctx.db.insert("ledgerEntries", { studentId: f.ids.students[0], eventId: event, chargeId, kind: "charge", amountCents: 1, previousCents: 0, newCents: 1, recordedBy: f.ids.coach, recordedAt: Date.now(), idempotencyKey: `eventFee:${event}:${f.ids.students[0]}` });
        return { chargeId, entryId };
      });
      await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(await f.coach.query(api.eventEnrollment.status, { eventId: event })).toMatchObject({ state: "failed", assigned: 0, processed: 0 });
      expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event)).collect())).toHaveLength(0);
      await f.t.run(async ctx => { await ctx.db.delete(conflict.entryId); await ctx.db.delete(conflict.chargeId); });
      await f.coach.mutation(api.eventEnrollment.retry, { eventId: event });
      await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(await f.coach.query(api.eventEnrollment.status, { eventId: event })).toMatchObject({ state: "complete", assigned: 2, processed: 2 });
      expect(await f.t.run(ctx => ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event)).collect())).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it("stops provisioning after Coach access is revoked", async () => {
    const f = await fixture();
    vi.useFakeTimers();
    try {
      const event = await f.coach.mutation(api.admin.createEvent, details());
      await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role: "mentor", travelLead: false }));
      await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(await f.t.run(ctx => ctx.db.get(event))).toMatchObject({ enrollmentState: "failed", wholeTeamParticipantCount: 0 });
      await expect(f.coach.mutation(api.eventEnrollment.retry, { eventId: event })).rejects.toThrow("Only a Coach");
    } finally { vi.useRealTimers(); }
  });

  it("rejects capacity and selected subsets for automatic Whole Team events", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(api.admin.createEvent, { ...details(), capacity: 1 })).rejects.toThrow("cannot use capacity");
    await expect(f.coach.mutation(api.admin.createEvent, { ...details(), assignedStudentIds: [f.ids.students[0]] })).rejects.toThrow("cannot use capacity");
  });
});
