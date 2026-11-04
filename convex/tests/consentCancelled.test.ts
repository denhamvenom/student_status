/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../_generated/api";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { addDays, weekdayOf } from "../lib/seriesRecurrence";

const modules = import.meta.glob("../**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const choices = { pain: "allow" as const, allergy: "contact" as const, cold: "deny" as const };
const wording = { version: "SYNTHETIC-DRAFT-1", title: "Synthetic permission", wording: "Denham Springs High School and FIRST Team 8044, Denham Venom: participation, travel and minor first aid. Synthetic unapproved wording only.", schoolName: "Denham Springs High School", teamName: "FIRST Team 8044, Denham Venom", medications: (["pain", "allergy", "cold"] as const).map(key => ({ key, label: `${key[0].toUpperCase()}${key.slice(1)} Medication`, productsText: "Unapproved synthetic products", exceptionsText: "Unapproved exceptions" })), administrationText: "Synthetic administration only; Coach approval pending.", acknowledgmentText: "I authorize the options selected for these listed events." };

async function fixture() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function user(name: string, role: "coach" | "parent" | "student") {
      const email = `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid`;
      const auth = await ctx.db.insert("users", { email, name, emailVerificationTime: 1 });
      await ctx.db.insert("authAccounts", { userId: auth, provider: "google", providerAccountId: name, emailVerified: email });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email, role, active: true, travelLead: false, healthExport: false, financialEdit: false });
      return { id, auth };
    }
    const coach = await user("Coach", "coach"), parent = await user("Parent Example", "parent"), studentUser = await user("Student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "Draft", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.id, legalName: "Fictional Student", preferredName: "Fictional", email: "fictional@example.invalid", subteam: "Mechanical", active: true, travelTeam: false, roomCategory: "Boys", roomCategoryLocked: true, shirtSize: "M", profileCompletedAt: 1, profileRevision: 0, emergencyName: "Emergency Person", emergencyRelationship: "Guardian", emergencyPhone: "555-0100", allergies: { state: "none" }, medications: { state: "none" } });
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: student, active: true, createdBy: coach.id });
    await ctx.db.insert("syntheticConsentSubjects", { studentId: student, parentId: parent.id, enabled: true, createdBy: coach.id, createdAt: 1 });
    await ctx.db.insert("syntheticConsentSubjects", { studentId: student, enabled: true, createdBy: coach.id, createdAt: 1 });
    const events = [];
    for (let i = 0; i < 2; i++) {
      const event = await ctx.db.insert("events", { seasonId: season, name: `Synthetic Event ${i}`, type: "Team", startsAt: Date.now() + 86400000 * (i + 1), endsAt: Date.now() + 86400000 * (i + 1) + 3600000, destination: "School", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false });
      await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 1, updatedAt: 1 });
      events.push(event);
    }
    return { coach, parent, student, events };
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  const f = { t, ids, coach: as(ids.coach.auth), parent: as(ids.parent.auth) };
  await f.coach.mutation(api.permissionVersions.createVersion, wording);
  await f.coach.mutation(api.permissions.setSigningPaused, { paused: false });
  return f;
}

describe("Forms page with cancelled events", () => {
  it("covers only active events when a participant event is cancelled, and a signed form still lists", async () => {
    const f = await fixture();
    const [active, cancelled] = f.ids.events;
    const draft = await f.parent.mutation(api.permissions.prepare, { studentId: f.ids.student, eventIds: [active, cancelled] });
    await f.parent.mutation(api.permissions.submitDraft, { draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices });
    await f.t.run(ctx => ctx.db.patch(cancelled, { cancelled: true }));

    const view = await f.parent.query(api.permissions.workspace, { studentId: f.ids.student });
    expect(view.events.map(event => event.eventId)).toEqual([active]);
    expect(view.coverage.map(row => row.eventId)).toEqual([active]);
    expect(view.receipts).toHaveLength(1);
    // Signing a cancelled event stays refused.
    await expect(f.parent.mutation(api.permissions.prepare, { studentId: f.ids.student, eventIds: [cancelled] })).rejects.toThrow("A covered event is unavailable.");
  });

  it("loads when a recurring series is cancelled with cancelFuture", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const startDate = addDays(chicagoDate(Date.now()), 1);
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Prep", type: "Team", destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: "students", audienceStudentIds: [f.ids.student], mandatory: true, rule: { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 } });
    for (let i = 0; i < 60; i++) { vi.advanceTimersByTime(5_000); await f.t.finishInProgressScheduledFunctions(); }
    const series = (await f.t.run(ctx => ctx.db.query("events").take(500))).filter(row => row.seriesId === seriesId).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
    await f.coach.mutation(api.eventSeries.cancelFuture, { seriesId, fromKey: series[2].seriesOccurrenceKey! });
    const view = await f.parent.query(api.permissions.workspace, { studentId: f.ids.student });
    const ids = view.events.map(event => event.eventId);
    expect(ids).toEqual(expect.arrayContaining([...f.ids.events, series[0]._id, series[1]._id]));
    expect(ids).toHaveLength(f.ids.events.length + 2);
    expect(ids).not.toContain(series[2]._id);
  });
});
