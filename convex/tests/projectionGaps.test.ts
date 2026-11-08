/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { addDays, weekdayOf } from "../lib/seriesRecurrence";

const modules = import.meta.glob("../**/*.ts");

afterEach(() => { vi.useRealTimers(); });

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("pg-coach", "coach"), lead = await account("pg-lead", "mentor", true), mentor = await account("pg-mentor", "mentor"), parent = await account("pg-parent", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const studentUser = await account("pg-student", "student");
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.id, legalName: "pg-student", preferredName: "pg-student", email: "pg-student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "reported", text: "Synthetic pollen" }, medications: { state: "none" }, secondarySubteam: "CAD", leadership: true, profileRevision: 3 });
    const startsAt = Date.now() + 7 * 86_400_000;
    const event = await ctx.db.insert("events", { seasonId: season, name: "Virtual review", type: "Team", startsAt, endsAt: startsAt + 3_600_000, destination: "Online", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, locationType: "virtual" });
    await ctx.db.insert("eventMentorInvites", { eventId: event, mentorUserId: mentor.id, source: "individual", status: "accepted", invitedBy: coach.id, createdAt: 1, respondedAt: 2 });
    await ctx.db.insert("eventMentorInvites", { eventId: event, mentorUserId: lead.id, source: "subteam", status: "invited", invitedBy: coach.id, createdAt: 1 });
    return { coach, lead, mentor, parent, studentUser, season, student, event };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor), parent: as(ids.parent), student: as(ids.studentUser) };
}

describe("mentorInvites.forEventSummary", () => {
  it("lists invited Mentors for Coach and Travel Lead only", async () => {
    const f = await fixture();
    const rows = (await f.coach.query(api.mentorInvites.forEventSummary, { eventId: f.ids.event })).mentors;
    expect(rows).toEqual([
      { mentorUserId: f.ids.lead.id, name: "pg-lead", status: "invited", source: "subteam", canDriveStudents: null, needsHotelRoom: null, seriesScope: null, seriesCount: null },
      { mentorUserId: f.ids.mentor.id, name: "pg-mentor", status: "accepted", source: "individual", canDriveStudents: null, needsHotelRoom: null, seriesScope: null, seriesCount: null },
    ]);
    expect((await f.lead.query(api.mentorInvites.forEventSummary, { eventId: f.ids.event })).mentors).toHaveLength(2);
    for (const who of [f.student, f.mentor, f.parent]) await expect(who.query(api.mentorInvites.forEventSummary, { eventId: f.ids.event })).rejects.toThrow("Only a Coach or Travel Lead");
  });
});

describe("student group projections", () => {
  it("returns secondary subteam and Leadership to Coach, Travel Lead and the student, never to a plain Mentor", async () => {
    const f = await fixture();
    const detail = await f.coach.query(api.coachRoster.detail, { studentId: f.ids.student, asOf: Date.now() });
    expect(detail).toMatchObject({ secondarySubteam: "CAD", leadership: true, profileRevision: 3 });
    const coachRoster = await f.coach.query(api.app.teamRoster, {});
    expect(coachRoster[0]).toMatchObject({ secondarySubteam: "CAD", leadership: true, profileRevision: 3 });
    const leadRoster = await f.lead.query(api.app.teamRoster, {});
    expect(leadRoster[0]).toMatchObject({ secondarySubteam: "CAD", leadership: true, profileRevision: 3 });
    // Travel Lead roster stays free of contact and health data.
    expect(leadRoster[0]).not.toHaveProperty("email");
    expect(leadRoster[0]).not.toHaveProperty("allergies");
    expect(await f.student.query(api.app.studentProfile, { studentId: f.ids.student })).toMatchObject({ secondarySubteam: "CAD", leadership: true });
    await expect(f.mentor.query(api.app.teamRoster, {})).rejects.toThrow();
    const report = await f.mentor.query(api.app.mentorReport, {});
    expect(report[0].student).not.toHaveProperty("secondarySubteam");
    expect(report[0].student).not.toHaveProperty("leadership");
  });

  it("lets a Travel Lead update groups with the roster revision and rejects a stale one", async () => {
    const f = await fixture();
    const [row] = await f.lead.query(api.app.teamRoster, {});
    await f.lead.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, { studentId: f.ids.student, secondarySubteam: null, leadership: false, expectedRevision: row.profileRevision });
    const [after] = await f.lead.query(api.app.teamRoster, {});
    expect(after).toMatchObject({ secondarySubteam: null, leadership: false, profileRevision: row.profileRevision + 1 });
    await expect(f.lead.mutation(api.studentSubteams.setStudentSecondaryAndLeadership, { studentId: f.ids.student, secondarySubteam: "CAD", leadership: true, expectedRevision: row.profileRevision })).rejects.toThrow("Profile changed");
  });
});

describe("mentor event projection", () => {
  it("includes locationType in the Mentor event views", async () => {
    const f = await fixture();
    const detail = await f.mentor.query(api.app.eventDetail, { eventId: f.ids.event });
    expect(detail.event.locationType).toBe("virtual");
    expect(detail.event).not.toHaveProperty("feeCents");
    const listed = await f.mentor.query(api.app.listEvents, {});
    expect(listed[0].event.locationType).toBe("virtual");
  });
});

describe("series occurrence enrollment retry", () => {
  it("retries a failed occurrence job through the silent series path", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const drain = async () => { for (let i = 0; i < 60; i++) { vi.advanceTimersByTime(5_000); await f.t.finishInProgressScheduledFunctions(); } };
    const startDate = addDays(chicagoDate(Date.now()), 1);
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", type: "Team", destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: "everyone", mandatory: true, rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 } });
    await drain();
    // Simulate a stopped enrollment on a later occurrence: job failed, its participant rows not yet written.
    const eventId = await f.t.run(async ctx => {
      const occurrences = (await ctx.db.query("events").take(100)).filter(row => row.seriesId === seriesId).sort((a, b) => a.startsAt - b.startsAt);
      const target = occurrences[1];
      const job = await ctx.db.query("eventEnrollmentJobs").withIndex("by_eventId", q => q.eq("eventId", target._id)).unique();
      for (const row of await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", target._id)).take(100)) await ctx.db.delete(row._id);
      await ctx.db.patch(job!._id, { state: "failed", cursor: null, processed: 0, lastError: "Synthetic failure" });
      await ctx.db.patch(target._id, { enrollmentState: "failed", wholeTeamParticipantCount: 0 });
      return target._id;
    });
    const before = await f.t.run(ctx => ctx.db.query("notifications").take(1000));
    await f.coach.mutation(api.eventEnrollment.retry, { eventId });
    await drain();
    const after = await f.t.run(async ctx => ({
      notifications: await ctx.db.query("notifications").take(1000),
      participants: await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(100),
      event: await ctx.db.get(eventId),
    }));
    expect(after.event?.enrollmentState).toBe("complete");
    expect(after.participants.map(row => row.studentId)).toContain(f.ids.student);
    expect(after.notifications).toHaveLength(before.length);
  });
});
