/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createFinancialAccount } from "./lib/financialSources";
import { chicagoDate } from "./lib/calendarDates";
import { addDays, weekdayOf } from "./lib/seriesRecurrence";

const modules = import.meta.glob("./**/*.ts");
// Wed 2026-01-14 16:00 Chicago: outside quiet hours.
const NOW = Date.parse("2026-01-14T22:00:00Z");
const DAY = 86_400_000;
const prepareBulk = makeFunctionReference<"mutation">("feeDefinitions:prepareBulk");
const commitBulk = makeFunctionReference<"mutation">("feeDefinitions:commitBulk");
const processBulk = makeFunctionReference<"mutation">("feeBulkWorker:processPage");

/** Students s0..s2 with accounts; Parent A is linked to s0 and s1, Parent B to s2. Staff: a Coach, a Travel Lead and a plain Mentor. */
async function fixture() {
  const t = createTest(schema, modules); rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const person = async (name: string, role: "coach" | "mentor" | "parent" | "student", travelLead = false) => {
      const auth = await ctx.db.insert("users", { email: `${name}@synthetic.test`, name, emailVerificationTime: 1 });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@synthetic.test`, name, role, travelLead, financialEdit: role === "coach", active: true });
      return { auth, app };
    };
    const coach = await person("coach", "coach");
    const lead = await person("lead", "mentor", true);
    const mentor = await person("mentor", "mentor");
    const parentA = await person("parenta", "parent");
    const parentB = await person("parentb", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.app });
    const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "ready", mappingInitialized: true, orderReady: true, unmappedCount: 0, updatedAt: 0 });
    const studentUsers = [];
    const students: Id<"students">[] = [];
    for (let i = 0; i < 3; i++) {
      const user = await person(`student${i}`, "student");
      studentUsers.push(user);
      const id = await ctx.db.insert("students", { seasonId: season, userId: user.app, legalName: `Student ${i}`, preferredName: `Student ${i}`, email: `student${i}@synthetic.test`, subteam: "Other", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
      await createFinancialAccount(ctx, id, "ready");
      students.push(id);
    }
    for (const [parent, studentId] of [[parentA, students[0]], [parentA, students[1]], [parentB, students[2]]] as const) {
      await ctx.db.insert("familyLinks", { parentUserId: parent.app, studentId, seasonId: season, active: true, createdBy: coach.app });
    }
    return { coach, lead, mentor, parentA, parentB, season, control, studentUsers, students };
  });
  const as = (auth: Id<"users">) => t.withIdentity({ subject: `${auth}|session` });
  const addEvent = (fields: Partial<{ signupMode: "assigned" | "open" | "approval"; assignmentScope: "wholeTeam"; wholeTeamParticipantCount: number }> = {}) => t.run(ctx => ctx.db.insert("events", {
    seasonId: ids.season, name: "Synthetic Regional", type: "Competition", startsAt: NOW + 30 * DAY, endsAt: NOW + 31 * DAY, destination: "Test City", travel: "Bus", overnight: false, roomingEnabled: false,
    feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...fields,
  }));
  const name = (userId: Id<"appUsers">) => {
    for (const key of ["coach", "lead", "mentor", "parentA", "parentB"] as const) if (ids[key].app === userId) return key;
    return `s${ids.studentUsers.findIndex(user => user.app === userId)}`;
  };
  /** Recipient names of instant notifications, sorted; a repeated name means a person got two rows. */
  const instant = async () => (await t.run(ctx => ctx.db.query("notifications").take(200))).filter(row => row.pushStatus !== "digest").map(row => name(row.userId)).sort();
  /** "recipient:kind" for each queued digest item, sorted. */
  const digests = async () => (await t.run(ctx => ctx.db.query("notificationDigestItems").take(200))).map(row => `${name(row.userId)}:${row.kind}`).sort();
  /** An optional Team meeting for Everyone created by `createdBy` (as mentorMeetings.createMeeting stores it). */
  const addMeeting = (createdBy: Id<"appUsers">, fields: Partial<{ signupMode: "open" | "approval" }> = {}) => t.run(ctx => ctx.db.insert("events", {
    seasonId: ids.season, name: "Synthetic build night", type: "Team", startsAt: NOW + 2 * DAY, endsAt: NOW + 2 * DAY + 7_200_000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false,
    feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false, createdBy, ...fields,
  }));
  /** "recipient:kind" for queued Mentor meeting digest items (M4/M5) only. */
  const meetingDigests = async () => (await digests()).filter(row => row.includes(":mentorMeeting"));
  return { t, ids, as, addEvent, addMeeting, instant, digests, meetingDigests, coach: as(ids.coach.auth) };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("notification hook-ups", () => {
  it("a signup waiting for approval queues one staff digest item for Coaches and Travel Leads; an open signup queues none", async () => {
    const f = await fixture();
    const approval = await f.addEvent({ signupMode: "approval" });
    const open = await f.addEvent({ signupMode: "open" });
    expect(await f.as(f.ids.studentUsers[0].auth).mutation(api.participation.signUp, { eventId: approval })).toBe("pending");
    // Repeating the signup returns the existing status and queues nothing more.
    expect(await f.as(f.ids.studentUsers[0].auth).mutation(api.participation.signUp, { eventId: approval })).toBe("pending");
    expect(await f.as(f.ids.studentUsers[1].auth).mutation(api.participation.signUp, { eventId: open })).toBe("confirmed");
    expect(await f.digests()).toEqual(["coach:signupPending", "lead:signupPending"]);
    const rows = await f.t.run(ctx => ctx.db.query("notificationDigestItems").take(10));
    expect(rows.every(row => row.url === `/events/${approval}`)).toBe(true);
  });

  it("M4: a Mentor's new meeting, or new series (once, for its first meeting), is queued for the other Mentors who can join", async () => {
    const f = await fixture();
    const asMentor = f.as(f.ids.mentor.auth);
    await asMentor.mutation(api.mentorMeetings.createMeeting, { name: "Synthetic pit prep", startsAt: NOW + DAY, endsAt: NOW + DAY + 3_600_000, destination: "Lab", audienceKind: "everyone" });
    // The Travel Lead is a Mentor who can sign up; the creator and the Coach are not told.
    expect(await f.meetingDigests()).toEqual(["lead:mentorMeetingOpen"]);
    const startDate = addDays(chicagoDate(NOW), 1);
    const { firstEventId } = await asMentor.mutation(api.eventSeries.create, {
      name: "Synthetic weekly build", type: "Team", destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
      audienceKind: "everyone", rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 },
    });
    vi.runOnlyPendingTimers();
    await f.t.finishInProgressScheduledFunctions(); // later meetings in the series are generated quietly
    expect(await f.meetingDigests()).toEqual(["lead:mentorMeetingOpen", "lead:mentorMeetingOpen"]);
    const rows = await f.t.run(ctx => ctx.db.query("notificationDigestItems").take(20));
    expect(rows.filter(row => row.kind === "mentorMeetingOpen").map(row => row.url)).toContain(`/events/${firstEventId}`);
  });

  it("M5: Mentor sign-ups and drop-outs reach the meeting's Mentor creator only when the Mentor's status actually changes", async () => {
    const f = await fixture();
    const eventId = await f.addMeeting(f.ids.mentor.app);
    const joiner = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "joiner@synthetic.test", name: "joiner", emailVerificationTime: 1 });
      await ctx.db.insert("appUsers", { authUserId: auth, email: "joiner@synthetic.test", name: "joiner", role: "mentor", travelLead: false, financialEdit: false, active: true });
      await ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.lead.app, source: "individual", status: "invited", invitedBy: f.ids.mentor.app, createdAt: NOW });
      return auth;
    });
    const asJoiner = f.as(joiner), asLead = f.as(f.ids.lead.auth);
    const kinds = async () => (await f.meetingDigests()).filter(row => row.startsWith("mentor:")).map(row => row.slice("mentor:".length));
    await asJoiner.mutation(api.mentorMeetings.signUp, { eventId });
    await asJoiner.mutation(api.mentorMeetings.signUp, { eventId }); // already signed up: nothing new
    expect(await kinds()).toEqual(["mentorMeetingMentorJoined"]);
    await asJoiner.mutation(api.mentorMeetings.withdraw, { eventId });
    expect(await kinds()).toEqual(["mentorMeetingMentorJoined", "mentorMeetingMentorLeft"]);
    // An invited Mentor answering: accept counts once; declining after accepting is a drop-out; declining again is not.
    await asLead.mutation(api.mentorInvites.respond, { eventId, status: "accepted" });
    await asLead.mutation(api.mentorInvites.respond, { eventId, status: "accepted" });
    await asLead.mutation(api.mentorInvites.respond, { eventId, status: "declined" });
    await asLead.mutation(api.mentorInvites.respond, { eventId, status: "declined" });
    expect(await kinds()).toEqual(["mentorMeetingMentorJoined", "mentorMeetingMentorJoined", "mentorMeetingMentorLeft", "mentorMeetingMentorLeft"]);
    // Only the creator hears about it.
    expect((await f.meetingDigests()).every(row => row.startsWith("mentor:"))).toBe(true);
  });

  it("M5: a student signing up for a Mentor's meeting tells its creator; approval-mode meetings aren't Mentor meetings, so no M5", async () => {
    const f = await fixture();
    const open = await f.addMeeting(f.ids.mentor.app);
    const approval = await f.addMeeting(f.ids.mentor.app, { signupMode: "approval" });
    const coachMeeting = await f.addMeeting(f.ids.coach.app);
    expect(await f.as(f.ids.studentUsers[0].auth).mutation(api.participation.signUp, { eventId: open })).toBe("confirmed");
    expect(await f.as(f.ids.studentUsers[1].auth).mutation(api.participation.signUp, { eventId: approval })).toBe("pending");
    expect(await f.as(f.ids.studentUsers[2].auth).mutation(api.participation.signUp, { eventId: coachMeeting })).toBe("confirmed");
    expect(await f.meetingDigests()).toEqual(["mentor:mentorMeetingStudentJoined"]);
    // The existing staff review digest for the pending signup is unchanged.
    expect((await f.digests()).filter(row => row.endsWith(":signupPending"))).toEqual(["coach:signupPending", "lead:signupPending"]);
  });

  it("M5: a student's automatic withdrawal from a Mentor's meeting and their Undo tell its creator once a day; Waitlisted and Coach meetings don't", async () => {
    const f = await fixture();
    const meeting = await f.addMeeting(f.ids.mentor.app);
    const coachMeeting = await f.addMeeting(f.ids.coach.app);
    await f.t.run(async ctx => {
      for (const [eventId, studentId, status] of [[meeting, f.ids.students[0], "confirmed"], [meeting, f.ids.students[1], "waitlist"], [coachMeeting, f.ids.students[2], "confirmed"]] as const) {
        await ctx.db.insert("participants", { eventId, studentId, status, createdAt: NOW, updatedAt: NOW });
      }
    });
    const [s0, s1, s2] = f.ids.studentUsers.map(user => f.as(user.auth));
    // The Waitlisted student leaves first (so nobody waits ahead of an Undo); they were never on the meeting, so no M5.
    await s1.mutation(api.withdrawals.requestWithdrawal, { eventId: meeting, idempotencyKey: "m5-waitlist-leaves" });
    await s2.mutation(api.withdrawals.requestWithdrawal, { eventId: coachMeeting, idempotencyKey: "m5-coach-meeting-leaves" });
    expect(await f.meetingDigests()).toEqual([]);
    await s0.mutation(api.withdrawals.requestWithdrawal, { eventId: meeting, idempotencyKey: "m5-leaves-once" });
    expect((await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", meeting).eq("studentId", f.ids.students[0])).unique()))?.status).toBe("withdrawn");
    expect(await f.meetingDigests()).toEqual(["mentor:mentorMeetingStudentLeft"]);
    expect(await s0.mutation(api.withdrawals.undoWithdrawal, { eventId: meeting })).toBe("confirmed");
    expect(await f.meetingDigests()).toEqual(["mentor:mentorMeetingStudentJoined", "mentor:mentorMeetingStudentLeft"]);
    // Leaving and undoing again the same day doesn't repeat either item.
    await s0.mutation(api.withdrawals.requestWithdrawal, { eventId: meeting, idempotencyKey: "m5-leaves-twice" });
    expect(await s0.mutation(api.withdrawals.undoWithdrawal, { eventId: meeting })).toBe("confirmed");
    expect(await f.meetingDigests()).toEqual(["mentor:mentorMeetingStudentJoined", "mentor:mentorMeetingStudentLeft"]);
    const rows = await f.t.run(ctx => ctx.db.query("notificationDigestItems").take(10));
    expect(rows.every(row => row.url === `/events/${meeting}`)).toBe(true);
  });

  it("M5: a Coach-approved withdrawal from a Mentor's meeting and Put back on event tell its creator", async () => {
    const f = await fixture();
    const meeting = await f.addMeeting(f.ids.mentor.app);
    const studentId = f.ids.students[0];
    await f.t.run(async ctx => {
      await ctx.db.insert("participants", { eventId: meeting, studentId, status: "confirmed", createdAt: NOW, updatedAt: NOW });
      // A room request is a logistics commitment, so this withdrawal needs Coach review.
      await ctx.db.insert("roomRequests", { eventId: meeting, studentId, requestedAt: NOW });
    });
    const requestId = await f.as(f.ids.studentUsers[0].auth).mutation(api.withdrawals.requestWithdrawal, { eventId: meeting, idempotencyKey: "m5-reviewed-leave" });
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("pending");
    expect(await f.meetingDigests()).toEqual([]);
    const { revision } = await f.coach.query(api.withdrawals.withdrawalPreview, { eventId: meeting, studentId });
    await f.coach.mutation(api.withdrawals.reviewWithdrawal, { requestId, decision: "retain", cancelUnpaidMain: false, reason: "Approved schedule change", expectedRevision: revision });
    for (let i = 0; i < 20 && (await f.t.run(ctx => ctx.db.get(requestId)))?.status === "processing"; i++) {
      const jobId = (await f.t.run(ctx => ctx.db.get(requestId)))!.jobId!;
      const job = (await f.t.run(ctx => ctx.db.get(jobId)))!;
      await f.t.mutation(makeFunctionReference<"mutation">("financialOperationsWorker:processPage"), { jobId, step: job.step });
    }
    expect((await f.t.run(ctx => ctx.db.get(requestId)))?.status).toBe("approved");
    expect(await f.meetingDigests()).toEqual(["mentor:mentorMeetingStudentLeft"]);
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: meeting, studentId });
    expect(await f.meetingDigests()).toEqual(["mentor:mentorMeetingStudentJoined", "mentor:mentorMeetingStudentLeft"]);
  });

  it("a student newly signed up by staff is notified with their Parents once; pending, waitlist and repeat changes notify no one", async () => {
    const f = await fixture();
    const eventId = await f.addEvent({ signupMode: "approval" });
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[2], status: "pending" });
    expect(await f.instant()).toEqual([]);
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[0], status: "confirmed" });
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[0], status: "confirmed" });
    expect(await f.instant()).toEqual(["parentA", "s0"]);
    const rows = await f.t.run(ctx => ctx.db.query("notifications").take(10));
    expect(rows.every(row => row.category === "events" && row.url === `/events/${eventId}`)).toBe(true);
    // Parent A's second student on the same event: the per-event dedupe keeps Parent A at one notice.
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[1], status: "confirmed" });
    expect(await f.instant()).toEqual(["parentA", "s0", "s1"]);
  });

  it("reactivating a student notifies them for Whole Team events they were newly added to, not ones they were already on", async () => {
    const f = await fixture();
    const added = await f.addEvent({ signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 0 });
    const already = await f.addEvent({ signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 1 });
    await f.t.run(async ctx => {
      await ctx.db.insert("participants", { eventId: already, studentId: f.ids.students[2], status: "confirmed", createdAt: NOW, updatedAt: NOW });
      await ctx.db.patch(f.ids.students[2], { active: false });
    });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[2], active: true, expectedRevision: 0, reason: "Synthetic student returned" });
    expect(await f.instant()).toEqual([]);
    vi.runOnlyPendingTimers();
    await f.t.finishInProgressScheduledFunctions();
    const rows = await f.t.run(ctx => ctx.db.query("notifications").take(10));
    expect(rows.map(row => row.url)).toEqual([`/events/${added}`, `/events/${added}`]);
    expect(await f.instant()).toEqual(["parentB", "s2"]);
  });

  it("a join request queues a staff digest when created and when a declined request is sent again", async () => {
    const f = await fixture();
    const applicant = await f.t.run(ctx => ctx.db.insert("users", { email: "applicant@synthetic.test", name: "Applicant", emailVerificationTime: 1 }));
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: "24h" });
    const login = f.as(applicant);
    const requestId = await login.mutation(api.app.requestJoin, { code: code.code, firstName: "Synthetic", lastName: "Applicant" });
    expect(requestId).not.toBeNull();
    // Still pending: asking again returns the same request without another digest item.
    expect(await login.mutation(api.app.requestJoin, { code: code.code, firstName: "Synthetic", lastName: "Applicant" })).toBe(requestId);
    expect(await f.digests()).toEqual(["coach:joinRequest", "lead:joinRequest"]);
    await f.t.run(ctx => ctx.db.patch(requestId!, { status: "declined" }));
    expect(await login.mutation(api.app.requestJoin, { code: code.code, firstName: "Synthetic", lastName: "Applicant" })).toBe(requestId);
    expect(await f.digests()).toEqual(["coach:joinRequest", "coach:joinRequest", "lead:joinRequest", "lead:joinRequest"]);
  });

  it("a bulk fee that creates new charges queues one Money digest item per student; re-running the finished job adds none", async () => {
    const f = await fixture();
    const step = async (jobId: Id<"feeBulkJobs">) => {
      for (let i = 0; i < 200; i++) {
        const job = await f.t.run(ctx => ctx.db.get(jobId));
        if (!job || ["prepared", "held", "complete", "failed", "cancelled"].includes(job.state)) return job;
        await f.t.mutation(processBulk, { jobId, step: job.step });
      }
      throw new Error("Bulk fee job did not finish.");
    };
    const jobId = await f.coach.mutation(prepareBulk, { kind: "create", label: "Synthetic shirt", targetAmountCents: 1500, scope: "selected", studentIds: [f.ids.students[0], f.ids.students[2]], reason: "Synthetic shirt order for two", idempotencyKey: "synthetic-shirt" }) as Id<"feeBulkJobs">;
    expect(await step(jobId)).toMatchObject({ state: "prepared" });
    expect(await f.digests()).toEqual([]);
    const job = await f.t.run(ctx => ctx.db.get(jobId)); const control = await f.t.run(ctx => ctx.db.get(f.ids.control));
    await f.coach.mutation(commitBulk, { jobId, expectedScopeHash: job!.snapshotHash, expectedOrderRevision: control!.revision, expectedDefinitionRevision: job!.expectedDefinitionRevision, reason: "Coach confirmed the synthetic scope" });
    expect(await step(jobId)).toMatchObject({ state: "complete", committed: 2 });
    expect(await f.digests()).toEqual(["parentA:charge", "parentB:charge"]);
    const finished = await f.t.run(ctx => ctx.db.get(jobId));
    await f.t.mutation(processBulk, { jobId, step: finished!.step });
    expect(await f.digests()).toEqual(["parentA:charge", "parentB:charge"]);
  });

  it("family and staff charge lists return the effective due date: the charge's own, else its fee's", async () => {
    const f = await fixture();
    const dueAt = NOW + 10 * DAY, ownDueAt = NOW + 3 * DAY;
    await f.t.run(async ctx => {
      const fee = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Synthetic fee", defaultAmountCents: 100, priority: 1, revision: 0, state: "active", createdBy: f.ids.coach.app, createdAt: 0, updatedAt: 0, dueAt });
      const base = { studentId: f.ids.students[0], amountCents: 100, appliedCents: 0, createdBy: f.ids.coach.app, createdAt: 1 };
      await ctx.db.insert("charges", { ...base, label: "Inherits", feeDefinitionId: fee, priority: 1 });
      await ctx.db.insert("charges", { ...base, label: "Own date", feeDefinitionId: fee, priority: 2, dueAt: ownDueAt });
      await ctx.db.insert("charges", { ...base, label: "No date", priority: 3 });
    });
    const args = { studentId: f.ids.students[0], paginationOpts: { cursor: null, numItems: 25 } };
    for (const reader of [f.as(f.ids.parentA.auth), f.coach]) {
      const result = await reader.query(api.financeDetails.charges, args);
      expect(result.page.map(row => [row.label, row.dueAt ?? null])).toEqual([["Inherits", dueAt], ["Own date", ownDueAt], ["No date", null]]);
    }
  });
});
