/// <reference types="vite/client" />
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { studentSetupCompleteFor } from "./setupWizard";

const modules = import.meta.glob("./**/*.ts");
const ensure = makeFunctionReference<"mutation", { expectedCoachEmail: string }, {
  created: boolean;
  studentIds: Id<"students">[];
  eventIds: Id<"events">[];
}>("reviewerRehearsal:ensure");
const devUrl = "https://third-bandicoot-18.convex.cloud";
const priorUrl = process.env.CONVEX_CLOUD_URL;
afterEach(() => {
  if (priorUrl === undefined) delete process.env.CONVEX_CLOUD_URL;
  else process.env.CONVEX_CLOUD_URL = priorUrl;
});

async function fixture(coachOwnsSeason = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const authOther = await ctx.db.insert("users", { email: "other@example.invalid", name: "Other" });
    const other = await ctx.db.insert("appUsers", { authUserId: authOther, email: "other@example.invalid", name: "Other", role: "mentor", travelLead: false, financialEdit: false, active: true });
    const seasonStart = Date.now() + 240 * 86_400_000;
    const season = await ctx.db.insert("seasons", { name: "Existing Synthetic Season", year: 2027, status: "active", startsAt: seasonStart, permissionVersion: "DRAFT", createdBy: coachOwnsSeason ? coach : other });
    const oldStudent = await ctx.db.insert("students", { seasonId: season, legalName: "Existing Synthetic", preferredName: "Existing", email: "existing@example.invalid", subteam: "Outreach", active: true, travelTeam: false, roomCategory: "Girls", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
    const oldEvent = await ctx.db.insert("events", { seasonId: season, name: "Existing Whole Team Event", type: "Team", startsAt: seasonStart + 60 * 86_400_000, endsAt: seasonStart + 60 * 86_400_000 + 3_600_000, destination: "Existing City", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 1, enrollmentState: "complete", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
    await ctx.db.insert("participants", { eventId: oldEvent, studentId: oldStudent, status: "confirmed", createdAt: 1, updatedAt: 1 });
    return { season, oldStudent, oldEvent };
  });
  return { t, ids };
}

describe("reviewer rehearsal fixture", () => {
  it("requires the bound development deployment and expected Coach-owned active season", async () => {
    const f = await fixture();
    process.env.CONVEX_CLOUD_URL = "https://production.example.invalid";
    await expect(f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("development-only");
    process.env.CONVEX_CLOUD_URL = devUrl;
    await expect(f.t.mutation(ensure, { expectedCoachEmail: "someone@example.invalid" })).rejects.toThrow("Coach");
    const wrongOwner = await fixture(false);
    await expect(wrongOwner.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("Coach-owned");
    expect(await f.t.run(ctx => ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).take(10))).toHaveLength(1);
  });

  it("adds the review scenarios and projections once while preserving existing records and access boundaries", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const f = await fixture();
    const before = await f.t.run(async ctx => ({ student: await ctx.db.get(f.ids.oldStudent), event: await ctx.db.get(f.ids.oldEvent) }));
    const first = await f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" });
    expect(first.created).toBe(true);
    expect(first.studentIds).toHaveLength(6);
    expect(first.eventIds).toHaveLength(2);
    const second = await f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" });
    expect(second).toEqual({ ...first, created: false });

    await f.t.run(async ctx => {
      expect(await ctx.db.get(f.ids.oldStudent)).toEqual(before.student);
      expect(await ctx.db.get(f.ids.oldEvent)).toMatchObject({ ...before.event, wholeTeamParticipantCount: 6 });
      const students = await Promise.all(first.studentIds.map(id => ctx.db.get(id)));
      expect(students.map(s => s?.preferredName)).toEqual(["Avery Partial", "Blake Unpaid", "Casey Credit", "Drew Pending", "Ellis Waitlist", "Finley Inactive"]);
      expect(students.every(s => s?.legalName.startsWith("REVIEW 2026-10-18") && s.userId === undefined && s.email.endsWith("@example.invalid"))).toBe(true);
      expect(students.map(s => s?.active)).toEqual([true, true, true, true, true, false]);
      expect(students[0]?.subteam).toBe("Build");
      expect(students[2]?.subteam).toBe("Build");
      for (const i of [0, 2]) {
        const student = students[i];
        if (!student) throw new Error("Fixture student unavailable.");
        expect(await studentSetupCompleteFor(ctx, student)).toBe(true);
        expect(await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique()).toMatchObject({ grade: "10", dateOfBirth: "2011-01-15" });
      }
      expect(students.every(s => s?.consentProfileV2ConfirmedBy === undefined && s?.consentProfileV2CompletedAt === undefined)).toBe(true);
      expect(await ctx.db.query("appUsers").take(10)).toHaveLength(2);
      expect(await ctx.db.query("users").take(10)).toHaveLength(2);
      expect(await ctx.db.query("familyLinks").take(10)).toHaveLength(0);
      expect(await ctx.db.query("parentInvitations").take(10)).toHaveLength(0);
      expect(await ctx.db.query("permissionSubmissions").take(10)).toHaveLength(0);

      const wholeTeam = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", f.ids.oldEvent)).take(10);
      expect(wholeTeam.map(p => p.studentId).sort()).toEqual([f.ids.oldStudent, ...first.studentIds.slice(0, 5)].sort());
      const trip = await ctx.db.get(first.eventIds[0]);
      const outreach = await ctx.db.get(first.eventIds[1]);
      const season = await ctx.db.get(f.ids.season);
      expect(trip).toMatchObject({ overnight: true, roomingEnabled: true, signupMode: "approval", feeCents: 0, firstRequired: true, capacity: 4 });
      expect(outreach).toMatchObject({ type: "Outreach", overnight: false, transportEnabled: false });
      expect(trip?.startsAt).toBeGreaterThan(season?.startsAt ?? Number.POSITIVE_INFINITY);
      expect(outreach?.startsAt).toBeGreaterThan(season?.startsAt ?? Number.POSITIVE_INFINITY);
      expect(outreach?.startsAt).toBeLessThan(trip?.startsAt ?? 0);
      const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", first.eventIds[0])).take(10);
      expect(participants.map(p => p.status).sort()).toEqual(["confirmed", "confirmed", "confirmed", "pending", "waitlist"]);
      expect(trip?.capacity).toBeGreaterThanOrEqual(participants.filter(p => p.status === "confirmed" || p.status === "pending").length);
      expect(participants.find(p => p.studentId === first.studentIds[2])?.independentTravel).toBe(true);
      const rooms = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", first.eventIds[0])).take(10);
      expect(rooms).toHaveLength(1);
      expect(rooms[0]).toMatchObject({ category: "Boys", finalized: true });
      const memberships = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", first.eventIds[0])).take(10);
      expect(memberships.map(m => m.studentId).sort()).toEqual(first.studentIds.slice(0, 2).sort());
      const requests = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", first.eventIds[0])).take(10);
      expect(requests.map(r => r.studentId)).toEqual([first.studentIds[2]]);

      for (const [i, expected] of [{ chargedCents: 10000, paidCents: 6000, dueCents: 4000 }, { chargedCents: 10000, paidCents: 0, dueCents: 10000 }, { chargedCents: 0, paidCents: 0, dueCents: 0, personalAvailableCents: 2500, fundraisingAvailableCents: 1500 }].entries()) {
        const summary = await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", first.studentIds[i])).unique();
        expect(summary).toMatchObject({ ...expected, version: 4 });
      }
      const averyEntries = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", first.studentIds[0])).take(20);
      expect(averyEntries.filter(e => e.kind === "payment").map(e => e.amountCents)).toEqual([4000]);
      expect(averyEntries.filter(e => e.kind === "fundraiser").map(e => e.amountCents)).toEqual([2000]);
      expect(await ctx.db.query("attendanceMeetings").take(10)).toHaveLength(0);
      expect(await ctx.db.query("attendanceRecords").take(10)).toHaveLength(0);
      expect(await ctx.db.query("timeclockSessions").take(10)).toHaveLength(0);
      expect(await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).take(10)).toHaveLength(7);
      expect(await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", f.ids.season)).take(10)).toHaveLength(3);
    });
  });

  it("fails closed when a marked fixture identity changes", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const f = await fixture();
    const first = await f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" });
    await f.t.run(ctx => ctx.db.patch(first.studentIds[0], { email: "changed@example.invalid" }));
    await expect(f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("manual review");
    expect(await f.t.run(ctx => ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).take(10))).toHaveLength(7);
  });
});
