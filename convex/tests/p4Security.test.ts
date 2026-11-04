/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { addDays, weekdayOf } from "../lib/seriesRecurrence";
import { seriesGenerationActor } from "../lib/seriesGenerate";

/**
 * Backend security and "Don't add to Team Calendar" fixes: createEvent { kind: "none" }, Parent Travel Lead series actors,
 * one notice per series per Calendar sync, fail-closed Parent event lists, uncapped participation lookups, eventDetail
 * audience checks, eventCalendar.retry series rules and setup-wizard charge attribution.
 */
const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.useRealTimers());

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id };
    }
    const coach = await account("p4-coach", "coach", { financialEdit: true }), lead = await account("p4-lead", "mentor", { travelLead: true });
    const parent = await account("p4-parent", "parent"), parentLead = await account("p4-parent-lead", "parent", { parentStaffAccess: "travelLead" });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const students: { id: Id<"students">; auth: Id<"users">; userId: Id<"appUsers"> }[] = [];
    for (const [name, subteam] of [["p4-build", "Build"], ["p4-code", "Programming"], ["p4-new", ""]] as const) {
      const user = await account(name, "student");
      students.push({ auth: user.auth, userId: user.id, id: await ctx.db.insert("students", { seasonId: season, userId: user.id, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam, active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }) });
    }
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: students[0].id, seasonId: season, active: true, createdBy: coach.id });
    return { coach, lead, parent, parentLead, season, students };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  const drain = async () => { for (let i = 0; i < 60; i++) { vi.advanceTimersByTime(5_000); await t.finishInProgressScheduledFunctions(); } };
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), parent: as(ids.parent), student: (i: number) => as(ids.students[i]), drain };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const DAY = 86_400_000;
const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false };
const today = () => chicagoDate(Date.now());
function weeklyFrom(offsetDays: number) {
  const startDate = addDays(today(), offsetDays);
  return { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 };
}
function insertEvent(f: Fixture, name: string, extra: Partial<Doc<"events">> = {}) {
  return f.t.run(ctx => ctx.db.insert("events", { seasonId: f.ids.season, name, type: "Team", startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + 3_600_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...extra }));
}
const participate = (f: Fixture, eventId: Id<"events">, studentId: Id<"students">, status: "confirmed" | "withdrawn" = "confirmed") => f.t.run(ctx => ctx.db.insert("participants", { eventId, studentId, status, createdAt: 1, updatedAt: 1 }));
const ids = (rows: { event: { _id: Id<"events"> } }[]) => rows.map(row => row.event._id).sort();
const seriesRows = (f: Fixture, seriesId: Id<"eventSeries">) => f.t.run(ctx => ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId)).take(100));

describe("createEvent: Don't add to Team Calendar", () => {
  const eventArgs = () => ({ ...template, name: "No calendar night", startsAt: Date.now() + 3 * DAY, endsAt: Date.now() + 3 * DAY + 3_600_000, signupMode: "open" as const, requirements: [] });

  it("stores no Calendar link, schedules no push, shows unlinked, and can be connected later", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const eventId = await f.coach.mutation(api.admin.createEvent, { ...eventArgs(), calendarChoice: { kind: "none" } });
    const event = (await f.t.run(ctx => ctx.db.get(eventId)))!;
    expect(event.calendarChoice).toBeUndefined();
    expect(event.calendarEventId).toBeUndefined();
    expect(event.calendarSyncState).toBeUndefined();
    expect(event.calendarRevision).toBeUndefined();
    const scheduled = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").take(100));
    expect(scheduled.some(job => job.name.includes("eventCalendar") && job.name.includes("push"))).toBe(false);
    expect((await f.coach.query(api.eventCalendar.status, { eventId })).state).toBe("unlinked");
    await f.coach.mutation(api.eventCalendar.connect, { eventId, calendarChoice: { kind: "link", eventId: "cal_p4_later" } });
    expect((await f.t.run(ctx => ctx.db.get(eventId)))!).toMatchObject({ calendarChoice: "link", calendarEventId: "cal_p4_later", calendarSyncState: "pending" });
  });

  it("keeps the 'create' choice unchanged", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const eventId = await f.coach.mutation(api.admin.createEvent, { ...eventArgs(), calendarChoice: { kind: "create" } });
    expect((await f.t.run(ctx => ctx.db.get(eventId)))!).toMatchObject({ calendarChoice: "create", calendarSyncState: "pending", calendarRevision: 1 });
    const scheduled = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").take(100));
    expect(scheduled.some(job => job.name.includes("eventCalendar") && job.name.includes("push"))).toBe(true);
  });

  it("eventSeries.create without Team Calendar works while Calendar writes are turned off", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, firstEventId } = await f.coach.mutation(api.eventSeries.create, { name: "Open lab", ...template, audienceKind: "everyone", rule: weeklyFrom(1), addToCalendar: false });
    expect(firstEventId).not.toBeNull();
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))!.calendarSyncState).toBeUndefined();
    await expect(f.coach.mutation(api.eventSeries.create, { name: "Other lab", ...template, audienceKind: "everyone", rule: weeklyFrom(2), addToCalendar: true })).rejects.toThrow("turned off");
  });
});

describe("series generation actor", () => {
  it("accepts a Parent with a Travel Lead grant for non-required series, like effectiveViewer", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId: optional } = await f.coach.mutation(api.eventSeries.create, { name: "Open lab", ...template, audienceKind: "everyone", rule: weeklyFrom(1) });
    const { seriesId: required } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", mandatory: true, rule: weeklyFrom(2) });
    await f.t.run(async ctx => { await ctx.db.patch(optional, { createdBy: f.ids.parentLead.id }); await ctx.db.patch(required, { createdBy: f.ids.parentLead.id }); });
    const result = await f.t.run(async ctx => {
      const actor = await seriesGenerationActor(ctx, (await ctx.db.get(optional))!);
      const requiredActor = await seriesGenerationActor(ctx, (await ctx.db.get(required))!);
      return { actor, requiredActor, optional: await ctx.db.get(optional), required: await ctx.db.get(required) };
    });
    expect(result.actor).toMatchObject({ _id: f.ids.parentLead.id, travelLead: true, role: "mentor", financialEdit: false });
    expect(result.optional!.status).toBe("active");
    // A required Whole Team series stays Coach-only.
    expect(result.requiredActor).toBeNull();
    expect(result.required!.status).toBe("needsReview");
  });

  it("still rejects a plain Parent", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Open lab", ...template, audienceKind: "everyone", rule: weeklyFrom(1) });
    await f.t.run(ctx => ctx.db.patch(seriesId, { createdBy: f.ids.parent.id }));
    expect(await f.t.run(async ctx => seriesGenerationActor(ctx, (await ctx.db.get(seriesId))!))).toBeNull();
  });
});

describe("Team Calendar series reconcile notices", () => {
  it("sends one notice per series per sync for an all-events edit and for several cancellations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-10T18:00:00Z"));
    const f = await fixture();
    const listed = [f.ids.students[0].id, f.ids.students[1].id];
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "students", audienceStudentIds: listed, mandatory: true, rule: weeklyFrom(1) });
    await f.drain();
    const rows = (await seriesRows(f, seriesId)).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    await f.t.run(async ctx => {
      await ctx.db.patch(seriesId, { calendarMasterId: "srp4master", calendarSyncState: "synced" });
      for (const row of rows) {
        await ctx.db.patch(row._id, { calendarChoice: "link", calendarEventId: `srp4master_${row.seriesOccurrenceKey}`, calendarEtag: "e0", calendarSyncState: "synced", calendarRevision: 1, calendarActorId: f.ids.coach.id, calendarRecurring: true });
        await ctx.db.insert("eventCalendarClaims", { calendarEventId: `srp4master_${row.seriesOccurrenceKey}`, eventId: row._id });
      }
    });
    const keys = rows.map(row => row.seriesOccurrenceKey!);
    const window = { seriesId, fromKey: keys[0], toKey: addDays(keys[keys.length - 1], 1), refreshEtags: false };
    const instance = (row: Doc<"events">, extra: Partial<{ location: string; cancelled: boolean; etag: string; updatedAt: number }>) => ({ id: `srp4master_${row.seriesOccurrenceKey}`, key: row.seriesOccurrenceKey!, startsAt: row.startsAt, endsAt: row.endsAt, cancelled: false, title: row.name, location: row.destination, description: "", ...extra });
    const notices = async (kind: string) => (await f.t.run(ctx => ctx.db.query("notifications").take(1000))).filter(row => row.dedupeKey?.includes(`:${kind}:`));

    // Google "all events" location edit: every meeting changes, each listed student hears once.
    await f.t.mutation(internal.eventSeriesCalendar.linkInstances, { ...window, instances: rows.map(row => instance(row, { location: "New gym", etag: "e1", updatedAt: 1000 })) });
    expect((await seriesRows(f, seriesId)).every(row => row.destination === "New gym")).toBe(true);
    const changed = await notices("changed");
    for (const student of f.ids.students.slice(0, 2)) expect(changed.filter(row => row.userId === student.userId)).toHaveLength(1);
    expect(changed.every(row => row.dedupeKey!.includes(rows[0]._id))).toBe(true);

    // Three single-meeting cancellations in one sync: one cancellation notice per student.
    const fresh = (await seriesRows(f, seriesId)).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
    await f.t.mutation(internal.eventSeriesCalendar.linkInstances, { ...window, instances: fresh.map((row, index) => instance(row, index > 0 && index < 4 ? { cancelled: true, etag: "e2", updatedAt: 2000 } : { etag: "e1", updatedAt: 1000 })) });
    expect((await seriesRows(f, seriesId)).filter(row => row.cancelled)).toHaveLength(3);
    const cancelled = await notices("cancelled");
    for (const student of f.ids.students.slice(0, 2)) expect(cancelled.filter(row => row.userId === student.userId)).toHaveLength(1);
  });
});

describe("listEvents for Parents and students", () => {
  it("fails closed for a Parent while Family links are being prepared: legacy events and events a child is on only", async () => {
    const f = await fixture();
    const child = f.ids.students[0].id;
    const legacy = await insertEvent(f, "Legacy open");
    const mentorsOnly = await insertEvent(f, "Mentor meeting", { audienceKind: "mentorsOnly" });
    const subteam = await insertEvent(f, "Build only", { audienceKind: "subteams", audienceSubteams: ["Build"] });
    const listedOther = await insertEvent(f, "Listed other", { audienceKind: "students" });
    const onIt = await insertEvent(f, "Child is on it", { audienceKind: "students" });
    await participate(f, onIt, child);
    const withdrawn = await insertEvent(f, "Child withdrew", { audienceKind: "students" });
    await participate(f, withdrawn, child, "withdrawn");
    // No familyLinkSeasonBackfill row: the season-scoped Family link page throws.
    const rows = await f.parent.query(api.app.listEvents, {});
    expect(ids(rows)).toEqual([legacy, onIt].sort());
    for (const hidden of [mentorsOnly, subteam, listedOther, withdrawn]) expect(ids(rows)).not.toContain(hidden);
    // Once links are ready the audience rules apply again (the Build child sees the Build event).
    await f.t.run(ctx => ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 1, unresolved: 0, updatedAt: 0, generation: 1, startedBy: f.ids.coach.id }));
    expect(ids(await f.parent.query(api.app.listEvents, {}))).toEqual([legacy, subteam, onIt, withdrawn].sort());
  });

  it("finds a participation beyond 200 earlier signups for students and Parents", async () => {
    const f = await fixture();
    const child = f.ids.students[0].id;
    await f.t.run(async ctx => {
      for (let i = 0; i < 230; i++) {
        const old = await ctx.db.insert("events", { seasonId: f.ids.season, name: `Old ${i}`, type: "Team", startsAt: 1, endsAt: 2, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: true });
        await ctx.db.insert("participants", { eventId: old, studentId: child, status: "confirmed", createdAt: 1, updatedAt: 1 });
      }
      await ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 1, unresolved: 0, updatedAt: 0, generation: 1, startedBy: f.ids.coach.id });
    });
    const assigned = await insertEvent(f, "Assigned trip", { signupMode: "assigned", assignmentScope: "selected" });
    const targeted = await insertEvent(f, "Targeted", { audienceKind: "students" });
    await participate(f, assigned, child);
    await participate(f, targeted, child);
    const studentRows = await f.student(0).query(api.app.listEvents, {});
    expect(ids(studentRows)).toEqual([assigned, targeted].sort());
    expect(studentRows.find((row: { event: { _id: Id<"events"> } }) => row.event._id === assigned)?.participation).toBe("confirmed");
    expect(ids(await f.parent.query(api.app.listEvents, {}))).toEqual([assigned, targeted].sort());
  });
});

describe("eventDetail audience checks", () => {
  it("hides Mentors-only and out-of-audience targeted events from students and Parents", async () => {
    const f = await fixture();
    const child = f.ids.students[0].id;
    // Family links ready (the incomplete-backfill case is covered in p4FollowUp.test.ts).
    await f.t.run(ctx => ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 1, unresolved: 0, updatedAt: 0, generation: 1, startedBy: f.ids.coach.id }));
    const mentorsOnly = await insertEvent(f, "Mentor meeting", { audienceKind: "mentorsOnly" });
    const other = await insertEvent(f, "Programming only", { audienceKind: "subteams", audienceSubteams: ["Programming"] });
    const listed = await insertEvent(f, "Listed", { audienceKind: "students" });
    await f.t.run(ctx => ctx.db.insert("eventAudienceStudents", { eventId: listed, studentId: child }));
    const onIt = await insertEvent(f, "On it", { audienceKind: "students" });
    await participate(f, onIt, child);
    const legacy = await insertEvent(f, "Legacy");
    const message = "no longer available";
    for (const eventId of [mentorsOnly, other]) {
      await expect(f.student(0).query(api.app.eventDetail, { eventId })).rejects.toThrow(message);
      await expect(f.student(0).query(api.app.eventDetail, { eventId, studentId: child })).rejects.toThrow(message);
      await expect(f.parent.query(api.app.eventDetail, { eventId })).rejects.toThrow(message);
      await expect(f.parent.query(api.app.eventDetail, { eventId, studentId: child })).rejects.toThrow(message);
    }
    for (const eventId of [listed, onIt, legacy]) {
      expect((await f.student(0).query(api.app.eventDetail, { eventId })).event._id).toBe(eventId);
      expect((await f.parent.query(api.app.eventDetail, { eventId, studentId: child })).event._id).toBe(eventId);
    }
    // The Programming student is in that audience; staff still see everything.
    expect((await f.student(1).query(api.app.eventDetail, { eventId: other })).event._id).toBe(other);
    expect((await f.coach.query(api.app.eventDetail, { eventId: mentorsOnly })).event._id).toBe(mentorsOnly);
  });
});

describe("eventCalendar.retry series rules", () => {
  it("a Travel Lead can't retry a required Whole Team series meeting", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId: required } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", mandatory: true, rule: weeklyFrom(1) });
    const { seriesId: optional } = await f.lead.mutation(api.eventSeries.create, { name: "Open lab", ...template, audienceKind: "everyone", rule: weeklyFrom(2) });
    await f.drain();
    const [requiredRow] = await seriesRows(f, required), [optionalRow] = await seriesRows(f, optional);
    await f.t.run(async ctx => {
      for (const row of [requiredRow, optionalRow]) await ctx.db.patch(row._id, { calendarChoice: "create", calendarSyncState: "failed", calendarRevision: 1, calendarActorId: f.ids.coach.id });
    });
    await expect(f.lead.mutation(api.eventCalendar.retry, { eventId: requiredRow._id })).rejects.toThrow("Only a Coach");
    await f.lead.mutation(api.eventCalendar.retry, { eventId: optionalRow._id });
    await f.coach.mutation(api.eventCalendar.retry, { eventId: requiredRow._id });
    expect((await f.t.run(ctx => ctx.db.get(requiredRow._id)))!.calendarSyncState).toBe("pending");
  });
});

describe("setup wizard subteam charges", () => {
  it("attributes charges from a student's own subteam choice to the season Coach", async () => {
    const f = await fixture();
    const required = await insertEvent(f, "Programming sprint", { signupMode: "assigned", assignmentScope: "selected", audienceKind: "subteams", audienceSubteams: ["Programming"], mandatory: true, feeCents: 2500 });
    const student = f.ids.students[2];
    await f.student(2).mutation(api.setupWizard.saveStudentTeam, { studentId: student.id, expectedRevision: 0, shirtSize: "M", roomCategory: "Boys", subteam: "Programming" });
    const charges = await f.t.run(ctx => ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", required).eq("studentId", student.id)).take(5));
    expect(charges).toHaveLength(1);
    expect(charges[0].createdBy).toBe(f.ids.coach.id);
    expect(charges[0].createdBy).not.toBe(student.userId);
  });
});
