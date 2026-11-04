/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { addDays, weekdayOf } from "../lib/seriesRecurrence";

/**
 * Event Calendar changes (update, connect, retry) and the staff-only `series` block of app.eventDetail follow the canonical
 * Travel Lead rule: a Coach, or a Mentor with Travel Lead (a Parent whose session selected the Travel Lead staff role counts
 * as one). A Travel Lead flag stored on a Student or Parent row grants nothing.
 */
const modules = import.meta.glob("../**/*.ts");
const DAY = 86_400_000;
const REFUSAL = "Only a Coach or Travel Lead can manage Calendar events.";

afterEach(() => vi.useRealTimers());

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id, session: "session" as string };
    }
    const coach = await account("ct-coach", "coach");
    const mentorLead = await account("ct-mentor-lead", "mentor", { travelLead: true });
    const parentLead = await account("ct-parent-lead", "parent", { parentStaffAccess: "travelLead" });
    const studentFlagged = await account("ct-student", "student", { travelLead: true });
    const parentFlagged = await account("ct-parent", "parent", { travelLead: true });
    const leadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    await ctx.db.insert("operatingRoles", { sessionId: leadSession, userId: parentLead.id, role: "travelLead", accessRevision: 0 });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentFlagged.id, legalName: "ct-student", preferredName: "ct-student", email: "ct-student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    for (const parent of [parentFlagged.id, parentLead.id]) await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: student, seasonId: season, active: true, createdBy: coach.id });
    await ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 1, unresolved: 0, updatedAt: 0, generation: 1, startedBy: coach.id });
    return { coach, mentorLead, parentLead: { ...parentLead, session: leadSession as string }, parentInParentMode: parentLead, studentFlagged, parentFlagged, student };
  });
  const as = (who: { auth: Id<"users">; session: string }) => t.withIdentity({ subject: `${who.auth}|${who.session}` });
  return { t, ids, as };
}
type Caller = "coach" | "mentorLead" | "parentLead" | "studentFlagged" | "parentFlagged" | "parentInParentMode";

function seriesArgs(name: string) {
  const startDate = addDays(chicagoDate(Date.now()), 1);
  return {
    name, type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
    audienceKind: "everyone" as const, rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 },
  };
}

const cases: { caller: Caller; allowed: boolean }[] = [
  { caller: "studentFlagged", allowed: false },
  { caller: "parentFlagged", allowed: false },
  { caller: "parentInParentMode", allowed: false },
  { caller: "coach", allowed: true },
  { caller: "mentorLead", allowed: true },
  { caller: "parentLead", allowed: true },
];

describe("Travel Lead rule for event Calendar changes and series detail", () => {
  it.each(cases)("$caller: allowed=$allowed", async ({ caller, allowed }) => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, firstEventId } = await f.as(f.ids.coach).mutation(api.eventSeries.create, seriesArgs("Build night"));
    const eventId = firstEventId!;
    const who = f.as(f.ids[caller]);
    const studentId = caller === "coach" || caller === "mentorLead" ? undefined : f.ids.student;
    const detail = await who.query(api.app.eventDetail, { eventId, studentId });
    const read = () => f.t.run(ctx => ctx.db.get(eventId));
    if (!allowed) {
      expect(detail).not.toHaveProperty("series");
      await expect(who.mutation(api.eventCalendar.update, { eventId, name: "Hijacked" })).rejects.toThrow(REFUSAL);
      await expect(who.mutation(api.eventCalendar.connect, { eventId, calendarChoice: { kind: "create" } })).rejects.toThrow(REFUSAL);
      await expect(who.mutation(api.eventCalendar.retry, { eventId })).rejects.toThrow(REFUSAL);
      const event = await read();
      expect(event?.name).toBe("Build night");
      expect(event?.calendarChoice).toBeUndefined();
      return;
    }
    expect(detail).toMatchObject({ series: { seriesId, name: "Build night", status: "active" } });
    await who.mutation(api.eventCalendar.update, { eventId, name: "Build night (moved)" });
    await who.mutation(api.eventCalendar.connect, { eventId, calendarChoice: { kind: "create" } });
    await who.mutation(api.eventCalendar.retry, { eventId });
    expect(await read()).toMatchObject({ name: "Build night (moved)", calendarChoice: "create", calendarSyncState: "pending" });
  });
});
