/// <reference types="vite/client" />
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ensure = internal.developmentRehearsal.ensure;
const devUrl = "https://third-bandicoot-18.convex.cloud";
const priorUrl = process.env.CONVEX_CLOUD_URL;
afterEach(() => { if (priorUrl === undefined) delete process.env.CONVEX_CLOUD_URL; else process.env.CONVEX_CLOUD_URL = priorUrl; });

async function fixture(coachOwnsSeason = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const authCoach = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: authCoach, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const authOther = await ctx.db.insert("users", { email: "other@example.invalid", name: "Other" });
    const other = await ctx.db.insert("appUsers", { authUserId: authOther, email: "other@example.invalid", name: "Other", role: "mentor", travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coachOwnsSeason ? coach : other });
    const oldStudent = await ctx.db.insert("students", { seasonId: season, legalName: "Existing Synthetic", preferredName: "Existing", email: "existing@example.invalid", subteam: "Outreach", active: true, travelTeam: false, roomCategory: "Girls", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
    const oldEvent = await ctx.db.insert("events", { seasonId: season, name: "Existing Synthetic Event", type: "Team", startsAt: 1_000_000, endsAt: 2_000_000, destination: "Existing City", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
    return { coach, season, oldStudent, oldEvent };
  });
  return { t, ids };
}

describe("development rehearsal fixture", () => {
  it("refuses any deployment except the hard-bound development URL", async () => {
    const f = await fixture();
    process.env.CONVEX_CLOUD_URL = "https://production.example.invalid";
    await expect(f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("development-only");
    expect(await f.t.run(ctx => ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).take(10))).toHaveLength(1);
  });

  it("requires the expected active Coach and Coach-owned active season", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const wrongCoach = await fixture();
    await expect(wrongCoach.t.mutation(ensure, { expectedCoachEmail: "someone@example.invalid" })).rejects.toThrow("Coach");
    const wrongOwner = await fixture(false);
    await expect(wrongOwner.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("Coach-owned");
  });

  it("creates only two unbound fictional students and one event, then returns the same ids without rewriting old records", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const f = await fixture();
    const before = await f.t.run(async ctx => ({ student: await ctx.db.get(f.ids.oldStudent), event: await ctx.db.get(f.ids.oldEvent) }));
    const first = await f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" });
    const second = await f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" });
    expect(first.created).toBe(true);
    expect(second).toEqual({ ...first, created: false });
    expect(first.studentIds).toHaveLength(2);
    await f.t.run(async ctx => {
      const rows = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).take(10);
      const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", f.ids.season)).take(10);
      expect(rows).toHaveLength(3);
      expect(events).toHaveLength(2);
      expect(await ctx.db.get(f.ids.oldStudent)).toEqual(before.student);
      expect(await ctx.db.get(f.ids.oldEvent)).toEqual(before.event);
      for (const id of first.studentIds) {
        const student = await ctx.db.get(id);
        expect(student?.userId).toBeUndefined();
        expect(student?.structuredNameReviewed).toBe(false);
        expect(student?.roomCategory).toBe("Boys");
        expect(student?.email.endsWith("@example.invalid")).toBe(true);
        const funding = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", id)).take(10);
        expect(funding.map(entry => entry.kind)).toEqual(["payment", "fundraiser"]);
      }
      const event = await ctx.db.get(first.eventId);
      expect(event?.name).toContain("REHEARSAL ONLY");
      expect(event?.permissionRequired).toBe(false);
      expect(event?.overnight && event.roomingEnabled && event.signupMode === "approval").toBe(true);
      const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", first.eventId)).take(10);
      expect(participants.map(p => p.status).sort()).toEqual(["pending", "waitlist"]);
      expect(await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "student")).take(10)).toHaveLength(0);
    });
  });

  it("fails closed on a partial fixture collision without changing any rows", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const f = await fixture();
    await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Collision", preferredName: "Collision", email: "rehearsal.alex@example.invalid", subteam: "Other", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
    await expect(f.t.mutation(ensure, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("already exists without marker");
    expect(await f.t.run(ctx => ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", f.ids.season)).take(10))).toHaveLength(2);
    expect(await f.t.run(ctx => ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", f.ids.season)).take(10))).toHaveLength(1);
  });
  it("guards and creates an idempotent isolated archived charge fixture without touching existing season records", async () => {
    const reference = makeFunctionReference<"mutation", { expectedCoachEmail: string }, { seasonId: import("./_generated/dataModel").Id<"seasons">; studentId: import("./_generated/dataModel").Id<"students">; chargeId: import("./_generated/dataModel").Id<"charges">; paymentId: import("./_generated/dataModel").Id<"ledgerEntries">; created: boolean }>("developmentRehearsal:ensureHistoricalChargeFixture");
    const f = await fixture();
    process.env.CONVEX_CLOUD_URL = "https://unapproved.convex.cloud";
    await expect(f.t.mutation(reference, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("development-only");
    process.env.CONVEX_CLOUD_URL = devUrl;
    const before = await f.t.run(async ctx => ({ season: await ctx.db.get(f.ids.season), student: await ctx.db.get(f.ids.oldStudent), event: await ctx.db.get(f.ids.oldEvent) }));
    const first = await f.t.mutation(reference, { expectedCoachEmail: "coach@example.invalid" });
    expect(await f.t.mutation(reference, { expectedCoachEmail: "coach@example.invalid" })).toEqual({ ...first, created: false });
    await f.t.run(async ctx => {
      expect(await ctx.db.get(f.ids.season)).toEqual(before.season); expect(await ctx.db.get(f.ids.oldStudent)).toEqual(before.student); expect(await ctx.db.get(f.ids.oldEvent)).toEqual(before.event);
      expect(await ctx.db.get(first.seasonId)).toMatchObject({ status: "archived" });
      expect(await ctx.db.get(first.studentId)).toMatchObject({ active: false, email: "rehearsal.historical-charge@example.invalid" });
      expect((await ctx.db.get(first.studentId))?.userId).toBeUndefined();
      const summary = await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", first.studentId)).unique();
      expect(summary).toMatchObject({ chargedCents: 100, paidCents: 100, dueCents: 0, personalAvailableCents: 0, fundraisingAvailableCents: 0, version: 4 });
      expect(await ctx.db.get(first.chargeId)).toMatchObject({ amountCents: 100, appliedCents: 100 });
    });
  });

});
