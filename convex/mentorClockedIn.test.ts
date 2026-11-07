/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

/** Synthetic data only. Mentor Home: which students of the Mentor's subteams are clocked in at Timeclock right now. */
const modules = import.meta.glob("./**/*.ts");
const HOUR = 3_600_000;

async function fixture() {
  const t = createTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id };
    }
    const coach = await account("ci-coach", "coach");
    const mentor = await account("ci-mentor", "mentor", { subteams: ["Build", "CAD"] });
    const parentMentor = await account("ci-parent-mentor", "parent", { parentStaffAccess: "mentor", subteams: ["Programming"] });
    const parentRevoked = await account("ci-parent-revoked", "parent", { subteams: ["Build"] });
    const parent = await account("ci-parent", "parent");
    const studentUser = await account("ci-student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const student = (preferredName: string, subteam: string, extra: Partial<Doc<"students">> = {}) => ctx.db.insert("students", {
      seasonId: season, legalName: `${preferredName} Example`, preferredName, email: "synthetic@example.invalid", subteam, active: true, travelTeam: false, roomCategoryLocked: false,
      allergies: { state: "unknown" }, medications: { state: "unknown" }, ...extra,
    });
    const students = {
      avery: await student("Avery", "Build"),
      blake: await student("Blake", "Mechanical"), // legacy name for Build
      casey: await student("Casey", "Programming", { secondarySubteam: "CAD" }),
      drew: await student("Drew", "Electrical"),
      emery: await student("Emery", "Build"), // clocked in earlier, now clocked out
      finley: await student("Finley", "Build", { active: false }),
      gray: await student("Gray", "Build"), // not clocked in at all
    };
    const session = async (key: string, state: "open" | "closed", effectiveEnd: number) => {
      const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: season, source: "manual", sourceKey: key, title: key, allDay: false, scheduledStart: now - HOUR, scheduledEnd: effectiveEnd, cancelled: false, observedAt: now - HOUR, revision: 1, needsReview: false });
      return ctx.db.insert("timeclockSessions", { seasonId: season, occurrenceId, state, scheduledStart: now - HOUR, scheduledEnd: effectiveEnd, effectiveEnd, extensionMs: 0, revision: 1, openedAt: now - HOUR, openedBy: coach.id, closedAt: state === "closed" ? effectiveEnd : undefined, needsReview: false });
    };
    const open = await session("open", "open", now + 2 * HOUR);
    const closed = await session("closed", "closed", now - HOUR / 2);
    const visit = (sessionId: Id<"timeclockSessions">, studentId: Id<"students">, inAt: number, outAt?: number) =>
      ctx.db.insert("timeclockIntervals", { sessionId, studentId, inAt, outAt, openedBy: coach.id, openCommandKey: `${sessionId}-${studentId}-${inAt}`, scheduleRevision: 1 });
    await visit(open, students.avery, now - 50 * 60_000);
    await visit(open, students.blake, now - 40 * 60_000);
    await visit(open, students.casey, now - 30 * 60_000);
    await visit(open, students.drew, now - 20 * 60_000);
    await visit(open, students.emery, now - 55 * 60_000, now - 10 * 60_000);
    await visit(open, students.finley, now - 15 * 60_000);
    await visit(closed, students.gray, now - HOUR); // its session closed without a clock-out on this row: not clocked in
    return { mentor, parentMentor, parentRevoked, parent, studentUser, coach, season, students, now };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, ids, as };
}

describe("mentorClockedIn.mySubteamClockedIn", () => {
  it("lists only the Mentor's subteams' students with an open clock-in, minimized", async () => {
    const f = await fixture();
    const result = await f.as(f.ids.mentor).query(api.mentorClockedIn.mySubteamClockedIn, { asOf: f.ids.now });
    // Build: Avery and Blake (legacy Mechanical); CAD: Casey (secondary). Drew (Electrical) isn't the Mentor's; Emery clocked
    // out; Finley is inactive; Gray's only clock-in belongs to a closed session.
    expect(result.subteams).toEqual([
      { subteam: "Build", count: 2, students: [
        { displayName: "Avery", subteam: "Build", clockedInAt: f.ids.now - 50 * 60_000 },
        { displayName: "Blake", subteam: "Build", clockedInAt: f.ids.now - 40 * 60_000 },
      ] },
      { subteam: "CAD", count: 1, students: [{ displayName: "Casey", subteam: "Programming", clockedInAt: f.ids.now - 30 * 60_000 }] },
    ]);
    expect(result.totalCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("excludes a student from another season even when clocked in on a stale open session", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const old = await ctx.db.insert("seasons", { name: "Synthetic 2025–26", year: 2026, startsAt: 1, status: "archived", permissionVersion: "DRAFT", createdBy: f.ids.coach.id });
      const studentId = await ctx.db.insert("students", { seasonId: old, legalName: "Zed Example", preferredName: "Zed", email: "synthetic@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const open = (await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state", q => q.eq("seasonId", f.ids.season).eq("state", "open")).first())!;
      await ctx.db.insert("timeclockIntervals", { sessionId: open._id, studentId, inAt: f.ids.now - 5 * 60_000, openedBy: f.ids.coach.id, openCommandKey: "other-season", scheduleRevision: 1 });
    });
    const result = await f.as(f.ids.mentor).query(api.mentorClockedIn.mySubteamClockedIn, { asOf: f.ids.now });
    expect(result.totalCount).toBe(3);
    expect(result.subteams.flatMap(group => group.students.map(row => row.displayName))).not.toContain("Zed");
  });

  it.each([
    ["Leadership", ["Leadership"]],
    ["an unknown name", ["Underwater Basket Weaving"]],
    ["only unknown names alongside nothing valid", ["Leadership", "Nope"]],
  ])("gives a Mentor whose stored subteams are %s no students", async (_label, subteams) => {
    const f = await fixture();
    const odd = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "ci-odd@example.invalid" });
      await ctx.db.insert("appUsers", { authUserId: auth, name: "ci-odd", email: "ci-odd@example.invalid", role: "mentor", travelLead: false, financialEdit: false, active: true, subteams });
      return { auth };
    });
    const result = await f.as(odd).query(api.mentorClockedIn.mySubteamClockedIn, { asOf: f.ids.now });
    expect(result).toEqual({ subteams: [], totalCount: 0, truncated: false });
  });

  it("allows a Parent with a Mentor grant (their subteams only)", async () => {
    const f = await fixture();
    const result = await f.as(f.ids.parentMentor).query(api.mentorClockedIn.mySubteamClockedIn, { asOf: f.ids.now });
    expect(result.subteams).toEqual([{ subteam: "Programming", count: 1, students: [expect.objectContaining({ displayName: "Casey" })] }]);
    expect(result.totalCount).toBe(1);
  });

  it("treats an open session past its effective end as closed", async () => {
    const f = await fixture();
    const result = await f.as(f.ids.mentor).query(api.mentorClockedIn.mySubteamClockedIn, { asOf: f.ids.now + 3 * HOUR });
    expect(result.totalCount).toBe(0);
    expect(result.subteams.map(group => group.count)).toEqual([0, 0]);
  });

  it.each([
    ["a Student", "studentUser"],
    ["a Parent without staff access", "parent"],
    ["a Parent whose Mentor grant was removed", "parentRevoked"],
    ["a Coach", "coach"],
  ] as const)("refuses %s", async (_label, who) => {
    const f = await fixture();
    await expect(f.as(f.ids[who]).query(api.mentorClockedIn.mySubteamClockedIn, { asOf: f.ids.now })).rejects.toThrow("Only a Mentor");
  });

  it("refuses a non-finite asOf", async () => {
    const f = await fixture();
    await expect(f.as(f.ids.mentor).query(api.mentorClockedIn.mySubteamClockedIn, { asOf: Number.NaN })).rejects.toThrow("could not load");
  });
});
