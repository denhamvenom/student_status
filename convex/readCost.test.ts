/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const team = makeFunctionReference<"query">("dashboardReports:team");
const rowsByIds = makeFunctionReference<"query">("coachRoster:rowsByIds");

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "cost-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "cost-coach@example.invalid", name: "Cost Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic cost season", year: 2027, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic competition", type: "Competition", startsAt: 200, endsAt: 300, destination: "Synthetic", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
    const students = [];
    for (let index = 0; index < 12; index++) {
      const studentId = await ctx.db.insert("students", { seasonId: season, legalName: `Synthetic ${index}`, preferredName: `Student ${index}`, email: `cost-${index}@example.invalid`, subteam: "Synthetic", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      students.push(studentId);
      await ctx.db.insert("participants", { eventId: event, studentId, status: "confirmed", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("firstRegistrationStates", { studentId, seasonId: season, status: "verified", revision: 1, teamAccepted: true, consentRelease: true });
      await ctx.db.insert("studentFinanceSummaries", { studentId, seasonId: season, chargedCents: 0, paidCents: 0, dueCents: 0, personalAvailableCents: 0, fundraisingAvailableCents: 0, travelBalanceCents: 0, travelShareCents: 0, transferredInCents: 0, updatedAt: null, version: 4 });
    }
    return { auth, students };
  });
  return { coach: t.withIdentity({ subject: `${ids.auth}|session` }), ids };
}

async function measure(coach: Awaited<ReturnType<typeof fixture>>["coach"], reference: typeof team | typeof rowsByIds, args: Record<string, unknown>) {
  return coach.run(async ctx => {
    const result = await ctx.runQuery(reference, args);
    const metrics = await ctx.meta.getTransactionMetrics();
    return { result, documentsRead: metrics.documentsRead.used, bytesRead: metrics.bytesRead.used, databaseQueries: metrics.databaseQueries.used };
  });
}

describe("synthetic read cost", () => {
  it("measures team report before accounts are ready", async () => {
    const f = await fixture();
    const sample = await measure(f.coach, team, {});
    expect(sample.result).toMatchObject({ state: "updating", activeStudents: 12, finance: null });
    expect(sample.documentsRead).toBeLessThanOrEqual(15);
    console.info("team unready", { documentsRead: sample.documentsRead, bytesRead: sample.bytesRead, databaseQueries: sample.databaseQueries });
  });

  it("measures confirmed competition roster rows", async () => {
    const f = await fixture();
    const sample = await measure(f.coach, rowsByIds, { studentIds: f.ids.students, asOf: 100 });
    expect(sample.result).toHaveLength(12);
    expect(sample.documentsRead).toBeLessThanOrEqual(64);
    console.info("rowsByIds competition", { documentsRead: sample.documentsRead, bytesRead: sample.bytesRead, databaseQueries: sample.databaseQueries });
  });
});
