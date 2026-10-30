/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const hour = 3600_000;

async function fixture(event: { signupMode?: "open" | "approval"; maxShiftsPerStudent?: number; minShiftsPerStudent?: number; capacity?: number } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "parent" | "student", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@synthetic.test`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@synthetic.test`, name, role, travelLead, financialEdit: false, active: true });
      return { auth, user };
    }
    const coach = await account("coach", "coach"), mentor = await account("mentor", "mentor"), parent = await account("parent", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const studentAuths = [], students = [];
    for (let i = 0; i < 3; i++) {
      const { auth, user } = await account(`student${i}`, "student");
      students.push(await ctx.db.insert("students", { seasonId: season, userId: user, legalName: `Synthetic Student ${i}`, preferredName: `Student ${i}`, email: `student${i}@synthetic.test`, subteam: "Other", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }));
      studentAuths.push(auth);
    }
    await ctx.db.insert("familyLinks", { parentUserId: parent.user, studentId: students[0], seasonId: season, active: true, createdBy: coach.user });
    const startsAt = Date.now() + 30 * 86400_000;
    const eventId = await ctx.db.insert("events", { seasonId: season, name: "Booth day", type: "Outreach", startsAt, endsAt: startsAt + 8 * hour, destination: "Fair", travel: "Own", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: event.signupMode ?? "open", capacity: event.capacity, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, shiftsEnabled: true, maxShiftsPerStudent: event.maxShiftsPerStudent, minShiftsPerStudent: event.minShiftsPerStudent });
    return { coach, mentor, parent, studentAuths, students, eventId, startsAt };
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  const coach = as(ids.coach.auth);
  // Shifts: morning 0-2h (1 place), midday 2-4h, overlapping 1-3h, afternoon 4-6h.
  const shift = (from: number, to: number, label: string, capacity?: number) => coach.mutation(api.eventShifts.saveShift, { eventId: ids.eventId, label, startsAt: ids.startsAt + from * hour, endsAt: ids.startsAt + to * hour, capacity });
  const shifts = { morning: await shift(0, 2, "Morning", 1), midday: await shift(2, 4, "Midday"), overlap: await shift(1, 3, "Overlap"), afternoon: await shift(4, 6, "Afternoon") };
  const places = (studentId: Id<"students">) => t.run(async ctx => (await ctx.db.query("shiftSignups").withIndex("by_eventId_and_studentId", q => q.eq("eventId", ids.eventId).eq("studentId", studentId)).take(10)).map(x => x.shiftId));
  return { t, ids, shifts, places, coach, mentor: as(ids.mentor.auth), parent: as(ids.parent.auth), student: ids.studentAuths.map(as) };
}

describe("event shifts", () => {
  it("lets only a Coach or Travel Lead manage shifts and read the roster", async () => {
    const f = await fixture();
    for (const caller of [f.mentor, f.student[0], f.parent]) {
      await expect(caller.mutation(api.eventShifts.saveShift, { eventId: f.ids.eventId, startsAt: f.ids.startsAt, endsAt: f.ids.startsAt + hour })).rejects.toThrow("Only a Coach or Travel Lead");
      await expect(caller.mutation(api.eventShifts.updateShiftSettings, { eventId: f.ids.eventId, shiftsEnabled: false })).rejects.toThrow("Only a Coach or Travel Lead");
      await expect(caller.query(api.eventShifts.roster, { eventId: f.ids.eventId })).rejects.toThrow("Only a Coach or Travel Lead");
    }
    await expect(f.coach.mutation(api.eventShifts.saveShift, { eventId: f.ids.eventId, startsAt: f.ids.startsAt - hour, endsAt: f.ids.startsAt + hour })).rejects.toThrow("within the event");
    await expect(f.coach.mutation(api.eventShifts.saveShift, { eventId: f.ids.eventId, startsAt: f.ids.startsAt + hour, endsAt: f.ids.startsAt + hour })).rejects.toThrow("end after it starts");
  });

  it.each([
    { name: "requires a shift when shifts are on", shiftIds: (_s: Shifts) => [], error: "at least 1 shift" },
    { name: "enforces the maximum", shiftIds: (s: Shifts) => [s.morning, s.midday, s.afternoon], error: "up to 2 shifts" },
    { name: "rejects overlapping shifts", shiftIds: (s: Shifts) => [s.midday, s.overlap], error: "overlap" },
    { name: "rejects repeated shifts", shiftIds: (s: Shifts) => [s.midday, s.midday], error: "chosen twice" },
  ])("signup $name before any write", async ({ shiftIds, error }) => {
    const f = await fixture({ maxShiftsPerStudent: 2 });
    await expect(f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: shiftIds(f.shifts) })).rejects.toThrow(error);
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", f.ids.eventId)).take(5))).toEqual([]);
    expect(await f.places(f.ids.students[0])).toEqual([]);
  });

  it("fills shift places, then lets a Coach override capacity but never overlap", async () => {
    const f = await fixture();
    expect((await f.student[0].query(api.participation.signupAvailability, { eventId: f.ids.eventId })).shiftsEnabled).toBe(true);
    expect(await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning, f.shifts.afternoon] })).toBe("confirmed");
    await expect(f.student[1].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] })).rejects.toThrow('"Morning" shift is full');
    await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.midday] });
    await expect(f.student[1].mutation(api.eventShifts.setMyShifts, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] })).rejects.toThrow("is full");
    // Re-saving a choice that includes your own place in a full shift is fine.
    await f.student[0].mutation(api.eventShifts.setMyShifts, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] });
    await f.coach.mutation(api.eventShifts.setStudentShifts, { eventId: f.ids.eventId, studentId: f.ids.students[1], shiftIds: [f.shifts.morning, f.shifts.midday] });
    await expect(f.coach.mutation(api.eventShifts.setStudentShifts, { eventId: f.ids.eventId, studentId: f.ids.students[1], shiftIds: [f.shifts.morning, f.shifts.overlap] })).rejects.toThrow("overlap");
    const view = await f.student[1].query(api.eventShifts.forEvent, { eventId: f.ids.eventId });
    expect(view.shifts.find(s => s.shiftId === f.shifts.morning)).toMatchObject({ capacity: 1, taken: 2, spotsLeft: 0 });
    expect(view.selectedShiftIds.sort()).toEqual([f.shifts.morning, f.shifts.midday].sort());
    await expect(f.coach.mutation(api.eventShifts.removeShift, { shiftId: f.shifts.morning })).rejects.toThrow("2 students have chosen");
    expect(await f.coach.mutation(api.eventShifts.removeShift, { shiftId: f.shifts.morning, force: true })).toEqual({ removedPlaces: 2 });
    expect(await f.places(f.ids.students[0])).toEqual([]);
  });

  it("never shows other students' names to students or parents", async () => {
    const f = await fixture();
    await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.midday] });
    await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.midday] });
    const own = await f.student[1].query(api.eventShifts.forEvent, { eventId: f.ids.eventId });
    expect(JSON.stringify(own)).not.toContain("Synthetic Student");
    expect(own.selectedShiftIds).toEqual([f.shifts.midday]);
    await expect(f.student[1].query(api.eventShifts.forEvent, { eventId: f.ids.eventId, studentId: f.ids.students[0] })).rejects.toThrow("only your own");
    expect((await f.parent.query(api.eventShifts.forEvent, { eventId: f.ids.eventId, studentId: f.ids.students[0] })).selectedShiftIds).toEqual([f.shifts.midday]);
    await expect(f.parent.query(api.eventShifts.forEvent, { eventId: f.ids.eventId, studentId: f.ids.students[1] })).rejects.toThrow("don't have permission");
    const roster = await f.coach.query(api.eventShifts.roster, { eventId: f.ids.eventId });
    expect(roster.shifts.find(s => s.shiftId === f.shifts.midday)?.students.map(s => s.name)).toEqual(["Synthetic Student 0", "Synthetic Student 1"]);
  });

  it("stores no shift places for a waitlisted signup", async () => {
    const f = await fixture({ capacity: 1 });
    await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.midday] });
    expect(await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.midday] })).toBe("waitlist");
    expect(await f.places(f.ids.students[1])).toEqual([]);
    await expect(f.student[1].mutation(api.eventShifts.setMyShifts, { eventId: f.ids.eventId, shiftIds: [f.shifts.midday] })).rejects.toThrow("Sign up for this event before choosing shifts");
  });

  it("frees shift places when a signup is declined or a student leaves a Whole Team event", async () => {
    const f = await fixture({ signupMode: "approval" });
    expect(await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] })).toBe("pending");
    await f.coach.mutation(api.eventOperations.reviewSignup, { eventId: f.ids.eventId, studentId: f.ids.students[0], decision: "decline", reason: "Not this time" });
    expect(await f.places(f.ids.students[0])).toEqual([]);
    expect(await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] })).toBe("pending");

    await f.t.run(ctx => ctx.db.patch(f.ids.eventId, { signupMode: "assigned", assignmentScope: "wholeTeam", enrollmentState: "complete", wholeTeamParticipantCount: 1 }));
    await f.t.run(async ctx => { const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.eventId).eq("studentId", f.ids.students[1])).unique(); await ctx.db.patch(p!._id, { status: "confirmed" }); });
    await f.student[1].mutation(api.withdrawals.leaveWholeTeam, { eventId: f.ids.eventId });
    expect(await f.places(f.ids.students[1])).toEqual([]);
  });

  it("frees shift places when a Coach moves a signup to the waitlist", async () => {
    const f = await fixture({ signupMode: "approval" });
    expect(await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] })).toBe("pending");
    await f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.eventId, studentId: f.ids.students[0], status: "waitlist" });
    expect(await f.places(f.ids.students[0])).toEqual([]);
    expect(await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] })).toBe("waitlist");
  });

  it("locks a student's shifts once the event starts and flags shifts left outside moved event times", async () => {
    const f = await fixture();
    await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] });
    await f.t.run(ctx => ctx.db.patch(f.ids.eventId, { startsAt: Date.now() - hour }));
    await expect(f.student[0].mutation(api.eventShifts.setMyShifts, { eventId: f.ids.eventId, shiftIds: [f.shifts.midday] })).rejects.toThrow("This event has started. Ask a Coach to change your shifts.");
    expect(await f.places(f.ids.students[0])).toEqual([f.shifts.morning]);
    await f.coach.mutation(api.eventShifts.setStudentShifts, { eventId: f.ids.eventId, studentId: f.ids.students[0], shiftIds: [f.shifts.midday] });
    // A Team Calendar edit moves the start an hour later, so the morning shift now begins before the event.
    await f.t.run(ctx => ctx.db.patch(f.ids.eventId, { startsAt: f.ids.startsAt + hour }));
    const roster = await f.coach.query(api.eventShifts.roster, { eventId: f.ids.eventId });
    expect(roster.shifts.filter(s => s.outsideEvent).map(s => s.shiftId)).toEqual([f.shifts.morning]);
  });

  it("leaves inactive students out of shift counts, open places and the roster", async () => {
    const f = await fixture();
    await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] });
    await f.t.run(ctx => ctx.db.patch(f.ids.students[0], { active: false }));
    const view = await f.student[1].query(api.eventShifts.forEvent, { eventId: f.ids.eventId });
    expect(view.shifts.find(s => s.shiftId === f.shifts.morning)).toMatchObject({ capacity: 1, taken: 0, spotsLeft: 1 });
    expect(await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: [f.shifts.morning] })).toBe("confirmed");
    const roster = await f.coach.query(api.eventShifts.roster, { eventId: f.ids.eventId });
    expect(roster.shifts.find(s => s.shiftId === f.shifts.morning)?.students.map(s => s.name)).toEqual(["Synthetic Student 1"]);
    expect(JSON.stringify(roster)).not.toContain("Synthetic Student 0");
  });

  it.each([
    { name: "setMyShifts with over 100 shifts", call: (f: Fixture) => f.student[0].mutation(api.eventShifts.setMyShifts, { eventId: f.ids.eventId, shiftIds: Array(101).fill(f.shifts.midday) }), error: "Too many shifts" },
    { name: "signUp with over 100 shifts", call: (f: Fixture) => f.student[0].mutation(api.participation.signUp, { eventId: f.ids.eventId, shiftIds: Array(101).fill(f.shifts.midday) }), error: "Too many shifts" },
    { name: "setStudentShifts with over 100 shifts", call: (f: Fixture) => f.coach.mutation(api.eventShifts.setStudentShifts, { eventId: f.ids.eventId, studentId: f.ids.students[0], shiftIds: Array(101).fill(f.shifts.midday) }), error: "Too many shifts" },
    { name: "setStudentShifts with a reason over 500 characters", call: (f: Fixture) => f.coach.mutation(api.eventShifts.setStudentShifts, { eventId: f.ids.eventId, studentId: f.ids.students[0], shiftIds: [f.shifts.midday], reason: "x".repeat(501) }), error: "500 characters" },
  ])("rejects $name", async ({ call, error }) => {
    const f = await fixture();
    await expect(call(f)).rejects.toThrow(error);
  });

  it("refuses shift changes on a canceled event", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.eventId, { cancelled: true }));
    await expect(f.coach.mutation(api.eventShifts.saveShift, { eventId: f.ids.eventId, startsAt: f.ids.startsAt, endsAt: f.ids.startsAt + hour })).rejects.toThrow("canceled");
    await expect(f.coach.mutation(api.eventShifts.updateShiftSettings, { eventId: f.ids.eventId, shiftsEnabled: false })).rejects.toThrow("canceled");
    await expect(f.coach.mutation(api.eventShifts.setStudentShifts, { eventId: f.ids.eventId, studentId: f.ids.students[0], shiftIds: [] })).rejects.toThrow("canceled");
  });
});

type Fixture = Awaited<ReturnType<typeof fixture>>;

type Shifts = Record<"morning" | "midday" | "overlap" | "afternoon", Id<"eventShifts">>;
