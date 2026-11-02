/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { notifyEventScheduleChange, notifyPermissionNeedsAttention, notifyRoomUpdate, notifyWithdrawalDecision } from "./lib/notificationTriggers";

const modules = import.meta.glob("./**/*.ts");
// Wed 2026-01-14 16:00 Chicago: outside quiet hours, so pushes are "pending" rather than "deferred".
const NOW = Date.parse("2026-01-14T22:00:00Z");
const DAY = 86_400_000;

/**
 * Students s0..s3 with accounts (s3 is not Travel Team). Parent A is linked to s0 and s1; Parent B to s2.
 * Staff: a Coach, a Travel Lead Mentor and a plain Mentor (not a digest recipient).
 */
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const person = async (name: string, role: "coach" | "mentor" | "parent" | "student", travelLead = false) => {
      const auth = await ctx.db.insert("users", { email: `${name}@synthetic.test`, name });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@synthetic.test`, name, role, travelLead, financialEdit: role === "coach", active: true });
      return { auth, app };
    };
    const coach = await person("coach", "coach");
    const lead = await person("lead", "mentor", true);
    const mentor = await person("mentor", "mentor");
    const parentA = await person("parenta", "parent");
    const parentB = await person("parentb", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.app });
    const studentUsers = [];
    const students: Id<"students">[] = [];
    for (let i = 0; i < 4; i++) {
      const user = await person(`student${i}`, "student");
      studentUsers.push(user);
      students.push(await ctx.db.insert("students", { seasonId: season, userId: user.app, legalName: `Student ${i}`, preferredName: `Student ${i}`, email: `student${i}@synthetic.test`, subteam: "Other", active: true, travelTeam: i < 3, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } }));
    }
    for (const [parent, studentId] of [[parentA, students[0]], [parentA, students[1]], [parentB, students[2]]] as const) {
      await ctx.db.insert("familyLinks", { parentUserId: parent.app, studentId, seasonId: season, active: true, createdBy: coach.app });
    }
    return { coach, lead, mentor, parentA, parentB, season, studentUsers, students };
  });
  const as = (auth: Id<"users">) => t.withIdentity({ subject: `${auth}|session` });
  const addEvent = (fields: Partial<{ signupMode: "assigned" | "open" | "approval"; permissionRequired: boolean; calendarChoice: "create"; overnight: boolean; roomingEnabled: boolean }> = {}) => t.run(ctx => ctx.db.insert("events", {
    seasonId: ids.season, name: "Synthetic Regional", type: "Competition", startsAt: NOW + 30 * DAY, endsAt: NOW + 31 * DAY, destination: "Test City", travel: "Bus", overnight: false, roomingEnabled: false,
    feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...fields,
  }));
  const join = (eventId: Id<"events">, studentIndexes: number[], status: "confirmed" | "pending" = "confirmed") => t.run(async ctx => {
    for (const i of studentIndexes) await ctx.db.insert("participants", { eventId, studentId: ids.students[i], status, createdAt: NOW, updatedAt: NOW });
  });
  const inbox = () => t.run(ctx => ctx.db.query("notifications").take(200));
  const name = (userId: Id<"appUsers">) => {
    if (userId === ids.parentA.app) return "parentA";
    if (userId === ids.parentB.app) return "parentB";
    if (userId === ids.coach.app) return "coach";
    if (userId === ids.lead.app) return "lead";
    if (userId === ids.mentor.app) return "mentor";
    return `s${ids.studentUsers.findIndex(user => user.app === userId)}`;
  };
  /** Recipient names, sorted; a duplicate name means a person got two rows. */
  const recipients = async () => (await inbox()).map(row => name(row.userId)).sort();
  return { t, ids, as, addEvent, join, inbox, recipients, name, coach: as(ids.coach.auth) };
}

const eventInput = { name: "Synthetic Open Day", type: "Outreach" as const, startsAt: NOW + 20 * DAY, endsAt: NOW + 20 * DAY + 3_600_000, destination: "Test City", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("schedule notifications", () => {
  it("a cancellation reaches students on the event and their Parents once each, urgently", async () => {
    const f = await fixture();
    const eventId = await f.addEvent();
    await f.join(eventId, [0, 1, 2]);
    await f.coach.mutation(api.eventCalendar.update, { eventId, cancelled: true });
    expect(await f.recipients()).toEqual(["parentA", "parentB", "s0", "s1", "s2"]);
    for (const row of await f.inbox()) expect(row).toMatchObject({ category: "schedule", urgent: true, pushStatus: "pending", url: `/events/${eventId}`, title: "Canceled: Synthetic Regional" });
  });

  it.each([
    { actor: "coach" as const, urgent: true },
    { actor: "lead" as const, urgent: false },
  ])("a cancellation by the $actor is urgent: $urgent", async ({ actor, urgent }) => {
    const f = await fixture();
    const eventId = await f.addEvent();
    await f.join(eventId, [0]);
    await f.as(f.ids[actor].auth).mutation(api.eventCalendar.update, { eventId, cancelled: true });
    const rows = await f.inbox();
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ category: "schedule", urgent, title: "Canceled: Synthetic Regional" });
  });

  it("a cancellation observed by Calendar sync (no signed-in actor) is urgent", async () => {
    const f = await fixture();
    const eventId = await f.addEvent();
    await f.join(eventId, [0]);
    await f.t.run(async ctx => {
      const before = (await ctx.db.get(eventId))!;
      await ctx.db.patch(eventId, { cancelled: true });
      await notifyEventScheduleChange(ctx, before);
    });
    expect((await f.inbox()).map(row => row.urgent)).toEqual([true, true]);
  });

  it("toggling cancel sends one Canceled and one non-urgent Back on notice per person", async () => {
    const f = await fixture();
    const eventId = await f.addEvent();
    await f.join(eventId, [0, 2]);
    for (const cancelled of [true, false, true, false]) await f.coach.mutation(api.eventCalendar.update, { eventId, cancelled });
    const rows = await f.inbox();
    expect(rows.map(row => [f.name(row.userId), row.title, row.urgent]).sort()).toEqual([
      ["parentA", "Back on: Synthetic Regional", false], ["parentA", "Canceled: Synthetic Regional", true],
      ["parentB", "Back on: Synthetic Regional", false], ["parentB", "Canceled: Synthetic Regional", true],
      ["s0", "Back on: Synthetic Regional", false], ["s0", "Canceled: Synthetic Regional", true],
      ["s2", "Back on: Synthetic Regional", false], ["s2", "Canceled: Synthetic Regional", true],
    ]);
  });

  it("a time change sends students to the event and Parents with a reset permission form to Forms", async () => {
    const f = await fixture();
    const eventId = await f.addEvent({ permissionRequired: true, calendarChoice: "create" });
    await f.join(eventId, [0, 1, 2]);
    await f.t.run(ctx => ctx.db.insert("permissionCoverage", { seasonId: f.ids.season, studentId: f.ids.students[0], eventId, state: "accepted", revision: 1, updatedAt: NOW, updatedBy: f.ids.coach.app }));
    await f.coach.mutation(api.eventCalendar.update, { eventId, expectedRevision: 0, startsAt: NOW + 30 * DAY + 3_600_000, endsAt: NOW + 31 * DAY + 3_600_000 });
    const rows = await f.inbox();
    expect(rows.map(row => [f.name(row.userId), row.url]).sort()).toEqual([
      ["parentA", "/forms"], ["parentB", `/events/${eventId}`], ["s0", `/events/${eventId}`], ["s1", `/events/${eventId}`], ["s2", `/events/${eventId}`],
    ]);
    expect(rows.every(row => row.urgent && row.category === "schedule")).toBe(true);
  });

  it("a media-only edit sends nothing", async () => {
    const f = await fixture();
    const eventId = await f.addEvent({ calendarChoice: "create" });
    await f.join(eventId, [0]);
    await f.coach.mutation(api.eventCalendar.update, { eventId, expectedRevision: 0, mediaSupportRequested: true });
    expect(await f.inbox()).toEqual([]);
  });
});

describe("event notifications", () => {
  it.each([
    { label: "with a signup deadline", signupClosesAt: NOW + 10 * DAY, studentBody: /^Sign up by / },
    { label: "without a signup deadline", signupClosesAt: undefined, studentBody: /^Sign up\. / },
  ])("an open-signup event notifies every eligible student and their Parents once ($label)", async ({ signupClosesAt, studentBody }) => {
    const f = await fixture();
    const eventId = await f.coach.mutation(api.admin.createEvent, { ...eventInput, signupMode: "open", ...(signupClosesAt ? { signupClosesAt } : {}) });
    expect(await f.recipients()).toEqual(["parentA", "parentB", "s0", "s1", "s2", "s3"]);
    const rows = await f.inbox();
    expect(rows.every(row => row.category === "events" && row.url === `/events/${eventId}` && row.title.startsWith("New event: Synthetic Open Day, "))).toBe(true);
    expect(rows.find(row => f.name(row.userId) === "s0")?.body).toMatch(studentBody);
  });

  it.each([
    { scope: "selected" as const, assignedStudentIds: [0], expected: ["parentA", "s0"] },
    { scope: "travelTeam" as const, assignedStudentIds: [], expected: ["parentA", "parentB", "s0", "s1", "s2"] },
  ])("an assigned event ($scope) notifies only the assigned students and their Parents", async ({ scope, assignedStudentIds, expected }) => {
    const f = await fixture();
    await f.coach.mutation(api.admin.createEvent, { ...eventInput, signupMode: "assigned", ...(scope === "travelTeam" ? { assignmentScope: scope } : { assignedStudentIds: assignedStudentIds.map(i => f.ids.students[i]) }) });
    expect(await f.recipients()).toEqual(expected);
    expect((await f.inbox()).find(row => f.name(row.userId) === "s0")?.title).toBe("You're assigned to Synthetic Open Day");
  });

  it("Whole Team enrollment notifies per batch with one row per Parent for the event", async () => {
    const f = await fixture();
    const eventId = await f.coach.mutation(api.admin.createEvent, { ...eventInput, signupMode: "assigned", assignmentScope: "wholeTeam" });
    expect(await f.inbox()).toEqual([]);
    const jobId = (await f.t.run(ctx => ctx.db.get(eventId)))!.enrollmentJobId!;
    for (let i = 0; i < 10 && (await f.t.run(ctx => ctx.db.get(jobId)))!.state === "running"; i++) await f.t.mutation(internal.eventEnrollment.run, { jobId });
    expect((await f.t.run(ctx => ctx.db.get(jobId)))!.state).toBe("complete");
    expect(await f.recipients()).toEqual(["parentA", "parentB", "s0", "s1", "s2", "s3"]);
  });

  it("signup decisions reach the student and their Parents only", async () => {
    const f = await fixture();
    const eventId = await f.addEvent({ signupMode: "approval" });
    await f.join(eventId, [0, 2], "pending");
    await f.as(f.ids.lead.auth).mutation(api.eventOperations.reviewSignup, { eventId, studentId: f.ids.students[0], decision: "approve" });
    await f.as(f.ids.lead.auth).mutation(api.eventOperations.reviewSignup, { eventId, studentId: f.ids.students[2], decision: "decline", reason: "Synthetic reason" });
    const rows = await f.inbox();
    expect(rows.map(row => [f.name(row.userId), row.title]).sort()).toEqual([
      ["parentA", "Signup approved: Synthetic Regional"], ["parentB", "Signup not approved: Synthetic Regional"],
      ["s0", "Signup approved: Synthetic Regional"], ["s2", "Signup not approved: Synthetic Regional"],
    ]);
  });

  it("join approval welcomes only the new student account", async () => {
    const f = await fixture();
    const requestId = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "newstudent@synthetic.test" });
      return ctx.db.insert("joinRequests", { authUserId: auth, email: "newstudent@synthetic.test", firstName: "New", lastName: "Student", seasonId: f.ids.season, status: "pending", createdAt: NOW });
    });
    await f.coach.mutation(api.admin.approveJoin, { requestId, approve: true });
    const rows = await f.inbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "announcements", url: "/", title: "Welcome to the team" });
    expect((await f.t.run(ctx => ctx.db.get(rows[0].userId)))?.email).toBe("newstudent@synthetic.test");
  });
});

describe("audience-specific helpers", () => {
  it.each([
    { label: "permission attention goes to Parents only", run: (ctx: Parameters<typeof notifyRoomUpdate>[0], students: Id<"students">[]) => notifyPermissionNeedsAttention(ctx, { studentId: students[0], reason: "correction", dedupeKey: "synthetic" }), expected: ["parentA"], url: "/forms" },
    { label: "room updates go to students only", run: (ctx: Parameters<typeof notifyRoomUpdate>[0], students: Id<"students">[], eventId: Id<"events">) => notifyRoomUpdate(ctx, { eventId, studentIds: [students[0], students[1]], kind: "finalized" }), expected: ["s0", "s1"], url: "rooming" },
  ])("$label", async ({ run, expected, url }) => {
    const f = await fixture();
    const eventId = await f.addEvent({ overnight: true, roomingEnabled: true });
    await f.t.run(ctx => run(ctx, f.ids.students, eventId));
    expect(await f.recipients()).toEqual(expected);
    for (const row of await f.inbox()) expect(row.url).toContain(url);
  });

  it("a room invitation pushes once per group and teammate, and an inviter over the hourly limit sends no push", async () => {
    const f = await fixture();
    const eventId = await f.addEvent({ overnight: true, roomingEnabled: true });
    await f.join(eventId, [0, 1, 2]);
    const s0 = f.as(f.ids.studentUsers[0].auth);
    const groupId = await s0.mutation(api.rooms.createGroup, { eventId, name: "Synthetic Room" });
    for (let i = 0; i < 3; i++) {
      const inviteId = await s0.mutation(api.rooms.invite, { groupId, studentId: f.ids.students[1] });
      await s0.mutation(api.rooms.cancelInvite, { inviteId });
    }
    expect(await f.recipients()).toEqual(["s1"]);

    await f.t.run(async ctx => {
      for (let i = 0; i < 10; i++) await ctx.db.insert("roomInvites", { eventId, groupId, studentId: f.ids.students[3], invitedBy: f.ids.students[0], status: "cancelled", createdAt: NOW });
    });
    const inviteId = await s0.mutation(api.rooms.invite, { groupId, studentId: f.ids.students[2] });
    expect((await f.t.run(ctx => ctx.db.get(inviteId)))?.status).toBe("pending");
    expect(await f.recipients()).toEqual(["s1"]);
  });

  it("a withdrawal decision reaches the student and their Parents", async () => {
    const f = await fixture();
    const eventId = await f.addEvent();
    await f.join(eventId, [2]);
    const requestId = await f.t.run(async ctx => {
      const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", f.ids.students[2])).unique();
      return ctx.db.insert("withdrawalRequests", { eventId, studentId: f.ids.students[2], participantId: participant!._id, status: "denied", requestedBy: f.ids.studentUsers[2].app, requestedAt: NOW, idempotencyKey: "synthetic-key" });
    });
    await f.t.run(ctx => notifyWithdrawalDecision(ctx, { requestId, approved: false }));
    expect(await f.recipients()).toEqual(["parentB", "s2"]);
  });
});

describe("D3 staff digest", () => {
  it("withdrawal requests and profile corrections are queued for Coaches and Travel Leads, not pushed", async () => {
    const f = await fixture();
    const eventId = await f.addEvent();
    await f.join(eventId, [0]);
    await f.as(f.ids.studentUsers[0].auth).mutation(api.withdrawals.requestWithdrawal, { eventId, idempotencyKey: "synthetic-withdrawal" });
    await f.as(f.ids.parentA.auth).mutation(api.profileSetup.requestCorrection, { studentId: f.ids.students[1], field: "legalName", note: "Synthetic correction", expectedRevision: 0 });
    const rows = await f.inbox();
    expect(rows.map(row => [f.name(row.userId), row.url]).sort()).toEqual([["coach", "/adults"], ["coach", "/withdrawals"], ["lead", "/adults"], ["lead", "/withdrawals"]]);
    expect(rows.every(row => row.category === "staff" && row.pushStatus === "digest" && !row.urgent)).toBe(true);
    const items = await f.t.run(ctx => ctx.db.query("notificationDigestItems").take(20));
    expect(items.map(item => item.kind).sort()).toEqual(["profileCorrection", "profileCorrection", "withdrawalRequest", "withdrawalRequest"]);
  });
});
