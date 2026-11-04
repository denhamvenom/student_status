/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

// Staff-only event fields: sync internals, staff settings and anything naming other people.
const staffOnly = ["audienceStudentIds", "mentorInviteIds", "mediaSupportRequested", "createdBy", "seasonId", "capacity", "signupClosesAt", "enrollmentJobId", "wholeTeamParticipantCount", "busSeats", "additionalAdults", "calendarEventId", "calendarSyncState", "calendarSyncError", "calendarEtag", "calendarActorId", "calendarRevision", "calendarChoice"];
// The all-day dates are what families see as the schedule of an all-day event; every other calendar* field is sync state.
const familyCalendarFields = new Set(["calendarAllDayStartDate", "calendarAllDayEndDate"]);

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("fp-coach", "coach"), lead = await account("fp-lead", "mentor", true), parent = await account("fp-parent", "parent"), studentUser = await account("fp-student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.id, legalName: "fp-student", preferredName: "fp-student", email: "fp-student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: student, seasonId: season, active: true, createdBy: coach.id });
    const startsAt = Date.now() + 7 * 86_400_000;
    const event = await ctx.db.insert("events", {
      seasonId: season, name: "Synthetic regional", type: "Competition", startsAt, endsAt: startsAt + 86_400_000, destination: "Synthetic Arena", travel: "Bus",
      overnight: true, roomingEnabled: true, feeCents: 2500, signupMode: "open", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false,
      audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true, capacity: 20, signupClosesAt: startsAt - 86_400_000, mediaSupportRequested: true, busSeats: 40,
      calendarEventId: "synthetic-calendar-id", calendarEtag: "\"synthetic-etag\"", calendarSyncState: "failed", calendarSyncError: "Synthetic sync failure", calendarActorId: coach.id, calendarRevision: 4, calendarChoice: "create",
      calendarAllDayStartDate: "2026-11-10", calendarAllDayEndDate: "2026-11-12",
    });
    await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 1, updatedAt: 1 });
    return { coach, lead, parent, studentUser, student, event };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { ids, coach: as(ids.coach), lead: as(ids.lead), parent: as(ids.parent), student: as(ids.studentUser) };
}

function expectFamilyEvent(event: Record<string, unknown>) {
  for (const key of staffOnly) expect(event, key).not.toHaveProperty(key);
  expect(Object.keys(event).filter(key => key.startsWith("calendar") && !familyCalendarFields.has(key))).toEqual([]);
  // What family screens read is still there: schedule, place, transport, cost and the audience badges.
  expect(event).toMatchObject({ name: "Synthetic regional", type: "Competition", destination: "Synthetic Arena", travel: "Bus", feeCents: 2500, signupMode: "open", audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true, overnight: true, roomingEnabled: true, cancelled: false, archived: false, calendarAllDayStartDate: "2026-11-10", calendarAllDayEndDate: "2026-11-12" });
}

describe("family event projection", () => {
  it.each(["student", "parent"] as const)("%s gets the family projection from listEvents and eventDetail", async role => {
    const f = await fixture();
    const viewer = f[role];
    const listed = await viewer.query(api.app.listEvents, {});
    expect(listed).toHaveLength(1);
    expectFamilyEvent(listed[0].event);
    const detail = await viewer.query(api.app.eventDetail, { eventId: f.ids.event, studentId: f.ids.student });
    expectFamilyEvent(detail.event);
    expect(detail.participation).toBe("confirmed");
    expectFamilyEvent((await viewer.query(api.app.eventDetail, { eventId: f.ids.event })).event);
  });

  it.each(["coach", "lead"] as const)("%s still gets the full event", async role => {
    const f = await fixture();
    const viewer = f[role];
    for (const event of [(await viewer.query(api.app.listEvents, {}))[0].event, (await viewer.query(api.app.eventDetail, { eventId: f.ids.event })).event]) {
      expect(event).toMatchObject({ calendarEventId: "synthetic-calendar-id", calendarSyncError: "Synthetic sync failure", mediaSupportRequested: true, capacity: 20, busSeats: 40 });
    }
  });
});
