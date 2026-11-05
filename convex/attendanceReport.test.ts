/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { eventStatus, type StatusInput } from "./lib/attendanceReportView";

const modules = import.meta.glob("./**/*.ts");
const minute = 60_000, hour = 60 * minute;
/** Wall-clock time in Chicago; November 2026 is CST (-06:00), October 31 is still CDT (-05:00). */
const cst = (date: string, time = "18:00") => Date.parse(`${date}T${time}:00-06:00`);
const cdt = (date: string, time = "18:00") => Date.parse(`${date}T${time}:00-05:00`);

describe("eventStatus", () => {
  const start = cst("2026-11-10"), end = start + 2 * hour;
  const base: StatusInput = { sessionState: "closed", needsReview: false, required: true, scheduledStart: start, scheduledEnd: end, intervals: [] };
  const visit = (inAt: number, outAt: number) => [{ inAt, outAt }];
  it.each([
    { name: "no session yet is gray", input: { ...base, sessionState: null }, status: "neutral", reason: "notStarted" },
    { name: "an open session is gray", input: { ...base, sessionState: "open", intervals: visit(start, end) }, status: "neutral", reason: "inProgress" },
    { name: "a cancelled session is gray", input: { ...base, sessionState: "cancelled" }, status: "neutral", reason: "cancelled" },
    { name: "a session waiting for Coach review is gray", input: { ...base, needsReview: true }, status: "neutral", reason: "underReview" },
    { name: "an optional event without a clock-in is gray", input: { ...base, required: false }, status: "neutral", reason: "optional" },
    { name: "a Required meeting without a clock-in is missed", input: base, status: "missed" },
    { name: "on time and stayed is present", input: { ...base, intervals: visit(start, end) }, status: "present" },
    { name: "exactly 15 minutes late is still present", input: { ...base, intervals: visit(start + 15 * minute, end) }, status: "present" },
    { name: "16 minutes late is late", input: { ...base, intervals: visit(start + 16 * minute, end) }, status: "late", late: true },
    { name: "leaving exactly 15 minutes early is still present", input: { ...base, intervals: visit(start, end - 15 * minute) }, status: "present" },
    { name: "leaving 16 minutes early is early", input: { ...base, intervals: visit(start, end - 16 * minute) }, status: "early", early: true },
    { name: "late and early shows late with the early flag", input: { ...base, intervals: visit(start + 30 * minute, end - 30 * minute) }, status: "late", late: true, early: true },
    { name: "an optional event attended late is late", input: { ...base, required: false, intervals: visit(start + 30 * minute, end) }, status: "late", late: true },
    { name: "first clock-in and last clock-out decide across several visits", input: { ...base, intervals: [{ inAt: start + 60 * minute, outAt: end }, { inAt: start, outAt: start + 30 * minute }] }, status: "present" },
    { name: "staying into an extension is not early or late", input: { ...base, intervals: visit(start, end + hour) }, status: "present" },
  ] as { name: string; input: StatusInput; status: string; reason?: string; late?: boolean; early?: boolean }[])("$name", ({ input, status, reason, late, early }) => {
    expect(eventStatus(input)).toEqual({ status, late: late ?? false, early: early ?? false, neutralReason: reason ?? null });
  });
});

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "parent" | "student" | "mentor", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("ar-coach", "coach"), parent = await account("ar-parent", "parent"), stranger = await account("ar-stranger", "parent");
    const student = await account("ar-student", "student"), other = await account("ar-other", "student"), travelLead = await account("ar-lead", "mentor", true);
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const base = { seasonId: season, legalName: "Dev Student", preferredName: "Dev", email: "dev.student@example.invalid", active: true, travelTeam: false, subteam: "Build", roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
    const sid = await ctx.db.insert("students", { ...base, userId: student.id });
    const otherSid = await ctx.db.insert("students", { ...base, legalName: "Jordan Williams", preferredName: "Jordan", email: "jordan@example.invalid", userId: other.id });
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: sid, seasonId: season, active: true, createdBy: coach.id });
    await ctx.db.insert("familyLinks", { parentUserId: stranger.id, studentId: otherSid, seasonId: season, active: true, createdBy: coach.id });
    await ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 2, unresolved: 0, updatedAt: 0, generation: 1, startedBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { coach, parent, stranger, student, other, travelLead, season, sid, otherSid };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, coach: as(ids.coach), parent: as(ids.parent), stranger: as(ids.stranger), student: as(ids.student), other: as(ids.other), travelLead: as(ids.travelLead) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Visit = { inAt: number; outAt: number; correction?: { kind: "replace"; inAt: number; outAt: number } | { kind: "void" } };
/** `calendar`: the occurrence comes from the team calendar; a team event with that audience claims it, or none when "unclaimed". */
type Spec = { title: string; at: number; state?: "open" | "closed" | "cancelled"; visits?: Visit[]; session?: boolean; calendar?: "everyone" | "mentorsOnly" | "unclaimed" };

/** A 2-hour Timeclock event; `session: false` leaves only the calendar entry. Corrections carry a staff-only reason. */
async function event(f: Fixture, spec: Spec) {
  return f.t.run(async ctx => {
    const end = spec.at + 2 * hour;
    const sourceKey = `ar-${spec.at}-${spec.title}`;
    if (spec.calendar && spec.calendar !== "unclaimed") {
      const eventId = await ctx.db.insert("events", { seasonId: f.ids.season, name: spec.title, type: "Team", startsAt: spec.at, endsAt: end, destination: "School", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", capacity: 100, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: spec.calendar });
      await ctx.db.insert("eventCalendarClaims", { calendarEventId: sourceKey, eventId });
    }
    const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: spec.calendar ? "calendar" : "manual", sourceKey, title: spec.title, allDay: false, scheduledStart: spec.at, scheduledEnd: end, cancelled: false, observedAt: spec.at, revision: 1, needsReview: false });
    if (spec.session === false) return null;
    const state = spec.state ?? "closed";
    const sessionId = await ctx.db.insert("timeclockSessions", { seasonId: f.ids.season, occurrenceId, state, scheduledStart: spec.at, scheduledEnd: end, effectiveEnd: end, extensionMs: 0, revision: 1, openedAt: spec.at, openedBy: f.ids.coach.id, ...(state === "closed" ? { closedAt: end } : {}), needsReview: false });
    for (const [index, visit] of (spec.visits ?? []).entries()) {
      const intervalId = await ctx.db.insert("timeclockIntervals", { sessionId, studentId: f.ids.sid, inAt: visit.inAt, outAt: visit.outAt, openedBy: f.ids.coach.id, openCommandKey: `ar-${spec.at}-${index}`, scheduleRevision: 1 });
      if (visit.correction) await ctx.db.insert("timeclockCorrections", { sessionId, studentId: f.ids.sid, originalIntervalId: intervalId, ...visit.correction, reason: "Synthetic staff note", actorId: f.ids.coach.id, at: end + hour, commandKey: `ar-fix-${spec.at}-${index}` });
    }
    return sessionId;
  });
}

const november = { year: 2026, month: 11 };

describe("attendanceReport.month access", () => {
  it("lets a Student read their own month with or without their id", async () => {
    const f = await fixture();
    await expect(f.student.query(api.attendanceReport.month, november)).resolves.toMatchObject(november);
    await expect(f.student.query(api.attendanceReport.month, { ...november, studentId: f.ids.sid })).resolves.toMatchObject(november);
  });

  it("lets a Parent read a linked Student and a Coach read any active Student", async () => {
    const f = await fixture();
    await expect(f.parent.query(api.attendanceReport.month, { ...november, studentId: f.ids.sid })).resolves.toMatchObject(november);
    await expect(f.coach.query(api.attendanceReport.month, { ...november, studentId: f.ids.sid })).resolves.toMatchObject(november);
  });

  it.each([
    { name: "another Student", who: "other" as const, studentId: "sid" as const },
    { name: "a Parent of another Student", who: "stranger" as const, studentId: "sid" as const },
    { name: "a Parent who names no Student", who: "parent" as const, studentId: null },
    { name: "a Parent naming an unlinked Student", who: "parent" as const, studentId: "otherSid" as const },
    { name: "a Travel Lead", who: "travelLead" as const, studentId: "sid" as const },
  ])("refuses $name", async ({ who, studentId }) => {
    const f = await fixture();
    await expect(f[who].query(api.attendanceReport.month, { ...november, ...(studentId ? { studentId: f.ids[studentId] } : {}) })).rejects.toThrow();
  });

  it("refuses a signed-out caller", async () => {
    const f = await fixture();
    await expect(f.t.query(api.attendanceReport.month, { ...november, studentId: f.ids.sid })).rejects.toThrow(/not signed in/);
  });

  it("refuses an impossible month", async () => {
    const f = await fixture();
    await expect(f.student.query(api.attendanceReport.month, { year: 2026, month: 13 })).rejects.toThrow(/not available/);
  });
});

describe("attendanceReport.month contents", () => {
  it("uses Chicago month boundaries, not UTC", async () => {
    const f = await fixture();
    // 11:30 p.m. Oct 31 in Chicago is already November in UTC; 11 p.m. Nov 30 in Chicago is December in UTC.
    await event(f, { title: "Halloween build", at: cdt("2026-10-31", "23:30") });
    await event(f, { title: "Late night build", at: cst("2026-11-30", "23:00") });
    const titles = async (year: number, month: number) => (await f.student.query(api.attendanceReport.month, { year, month })).events.map(row => row.title);
    expect(await titles(2026, 10)).toEqual(["Halloween build"]);
    expect(await titles(2026, 11)).toEqual(["Late night build"]);
    expect(await titles(2026, 12)).toEqual([]);
  });

  it("reports each event's status, corrected clock times and the month totals", async () => {
    const f = await fixture();
    const tue = (day: string) => cst(`2026-11-${day}`);
    await event(f, { title: "Team meeting", at: tue("03"), visits: [{ inAt: tue("03"), outAt: tue("03") + 2 * hour }] });
    await event(f, { title: "Team meeting", at: tue("10") });
    await event(f, { title: "Team meeting", at: tue("17"), visits: [{ inAt: tue("17") + 20 * minute, outAt: tue("17") + 2 * hour }] });
    await event(f, { title: "Team meeting", at: tue("24"), visits: [{ inAt: tue("24"), outAt: tue("24") + 90 * minute }] });
    await event(f, { title: "Thursday shop", at: tue("05") });
    await event(f, { title: "Thursday shop", at: tue("12"), visits: [{ inAt: tue("12") + 30 * minute, outAt: tue("12") + 90 * minute }] });
    // The Coach fixed a late clock-in to the real arrival time; the family sees the corrected time and a flag.
    await event(f, { title: "Thursday shop", at: tue("19"), visits: [{ inAt: tue("19") + 40 * minute, outAt: tue("19") + 2 * hour, correction: { kind: "replace", inAt: tue("19"), outAt: tue("19") + 2 * hour } }] });
    await event(f, { title: "Library Outreach", at: cst("2026-11-07", "10:00"), visits: [{ inAt: cst("2026-11-07", "10:00"), outAt: cst("2026-11-07", "12:00"), correction: { kind: "void" } }] });
    await event(f, { title: "Thursday shop", at: tue("26"), state: "open", visits: [{ inAt: tue("26"), outAt: tue("26") + hour }] });
    await event(f, { title: "Team meeting", at: cst("2026-11-28"), session: false, calendar: "everyone" });
    // Not shown: a Mentors-only meeting, a calendar item no team event claims, and a manual entry.
    await event(f, { title: "Mentor planning", at: cst("2026-11-29"), session: false, calendar: "mentorsOnly" });
    await event(f, { title: "Staff dinner", at: cst("2026-11-30"), session: false, calendar: "unclaimed" });
    await event(f, { title: "Manual placeholder", at: cst("2026-11-30", "10:00"), session: false });

    const report = await f.parent.query(api.attendanceReport.month, { ...november, studentId: f.ids.sid });
    const rows = report.events.map(row => ({ day: new Date(row.scheduledStart).toISOString().slice(0, 10), kind: row.kind, status: row.status, late: row.late, early: row.early, reason: row.neutralReason, minutes: row.minutes, adjusted: row.adjustedByCoach, counts: row.countsAsAttended }));
    expect(rows).toEqual([
      { day: "2026-11-04", kind: "required", status: "present", late: false, early: false, reason: null, minutes: 120, adjusted: false, counts: true },
      { day: "2026-11-06", kind: "other", status: "neutral", late: false, early: false, reason: "optional", minutes: 0, adjusted: false, counts: false },
      { day: "2026-11-07", kind: "outreach", status: "neutral", late: false, early: false, reason: "optional", minutes: 0, adjusted: true, counts: false },
      { day: "2026-11-11", kind: "required", status: "missed", late: false, early: false, reason: null, minutes: 0, adjusted: false, counts: false },
      { day: "2026-11-13", kind: "other", status: "late", late: true, early: true, reason: null, minutes: 60, adjusted: false, counts: false },
      { day: "2026-11-18", kind: "required", status: "late", late: true, early: false, reason: null, minutes: 100, adjusted: false, counts: true },
      { day: "2026-11-20", kind: "other", status: "present", late: false, early: false, reason: null, minutes: 120, adjusted: true, counts: false },
      { day: "2026-11-25", kind: "required", status: "early", late: false, early: true, reason: null, minutes: 90, adjusted: false, counts: true },
      { day: "2026-11-27", kind: "other", status: "neutral", late: false, early: false, reason: "inProgress", minutes: 0, adjusted: false, counts: false },
      { day: "2026-11-29", kind: "other", status: "neutral", late: false, early: false, reason: "notStarted", minutes: 0, adjusted: false, counts: false },
    ]);
    const corrected = report.events.find(row => row.adjustedByCoach && row.status === "present");
    expect(corrected?.intervals).toEqual([{ inAt: tue("19"), outAt: tue("19") + 2 * hour }]);
    expect(JSON.stringify(report)).not.toContain("Synthetic staff note");
    // November is before kickoff, so there are no Build minutes yet.
    expect(report.summary).toEqual({ requiredAttended: 3, requiredHeld: 4, buildMinutes: 0, late: 2, early: 2 });
  });

  it("keeps staff-only calendar items out for Students, Parents and Coaches", async () => {
    const f = await fixture();
    await event(f, { title: "Team meeting", at: cst("2026-11-10"), session: false, calendar: "everyone" });
    await event(f, { title: "Mentor planning", at: cst("2026-11-12"), session: false, calendar: "mentorsOnly" });
    for (const who of [f.student, f.parent, f.coach]) {
      const report = await who.query(api.attendanceReport.month, { ...november, studentId: f.ids.sid });
      expect(report.events.map(row => row.title)).toEqual(["Team meeting"]);
    }
  });

  it("grays out one event whose corrected clock times overlap and keeps the rest of the month", async () => {
    const f = await fixture();
    const tue = (day: string) => cst(`2026-11-${day}`);
    await event(f, { title: "Team meeting", at: tue("03"), visits: [{ inAt: tue("03"), outAt: tue("03") + 2 * hour }] });
    // The Coach's fix stretches the first visit over the second one, so the times can't be shown.
    await event(f, { title: "Team meeting", at: tue("10"), visits: [
      { inAt: tue("10"), outAt: tue("10") + 30 * minute, correction: { kind: "replace", inAt: tue("10"), outAt: tue("10") + 90 * minute } },
      { inAt: tue("10") + 60 * minute, outAt: tue("10") + 2 * hour },
    ] });
    const report = await f.student.query(api.attendanceReport.month, november);
    expect(report.events.map(row => ({ status: row.status, reason: row.neutralReason, intervals: row.intervals.length, adjusted: row.adjustedByCoach }))).toEqual([
      { status: "present", reason: null, intervals: 1, adjusted: false },
      { status: "neutral", reason: "underReview", intervals: 0, adjusted: false },
    ]);
    expect(report.summary).toMatchObject({ requiredAttended: 1, requiredHeld: 1 });
  });
});
