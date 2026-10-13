/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { createTest } from "../testUtils";
import schema from "./schema";
import { createFinancialAccount, financialAccount } from "./lib/financialSources";
const modules = import.meta.glob("./**/*.ts");

it("repairs a failed upstream enrollment through its fee/allocation continuation while a failed parent remains draining", async () => {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await createFinancialAccount(ctx, student, "ready");
    const event = await ctx.db.insert("events", { seasonId: season, name: "Whole Team", type: "Team", startsAt: 100, endsAt: 200, destination: "School", travel: "None", overnight: false, roomingEnabled: false, feeCents: 100, signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 0, enrollmentState: "failed", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    const enrollment = await ctx.db.insert("eventEnrollmentJobs", { eventId: event, actorId: actor, state: "failed", cursor: null, processed: 0, startedAt: 0, updatedAt: 0 });
    await ctx.db.patch(event, { enrollmentJobId: enrollment }); await ctx.db.insert("eventEnrollmentMembers", { jobId: enrollment, studentId: student });
    return { auth, season, student, event, enrollment };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const mapping = await coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:prepareMapping"), { reason: "Prepare historical fee order after enrollment", idempotencyKey: "failed-upstream-mapping" }) as Id<"feeMappingJobs">;
  const run = makeFunctionReference<"mutation">("feeMappingWorker:run");
  await t.mutation(run, { jobId: mapping });
  expect(await t.run(ctx => ctx.db.get(mapping))).toMatchObject({ state: "failed", phase: "drain" });
  await coach.mutation(makeFunctionReference<"mutation">("eventEnrollment:retry"), { eventId: ids.event });
  await t.mutation(makeFunctionReference<"mutation">("eventEnrollment:run"), { jobId: ids.enrollment });
  expect(await t.run(ctx => ctx.db.get(ids.enrollment))).toMatchObject({ state: "complete", processed: 1 });
  expect(await t.run(ctx => financialAccount(ctx, ids.student))).toMatchObject({ state: "ready", chargedCents: 100, paidCents: 0 });
  expect(await t.run(ctx => ctx.db.get(mapping))).toMatchObject({ state: "failed", phase: "drain" });
  await coach.mutation(makeFunctionReference<"mutation">("feeDefinitions:retryMapping"), { jobId: mapping, reason: "Coach verified upstream enrollment completion" });
  for (let i = 0; i < 20; i++) { if ((await t.run(ctx => ctx.db.get(mapping)))?.state === "complete") break; await t.mutation(run, { jobId: mapping }); }
  expect(await t.run(ctx => ctx.db.get(mapping))).toMatchObject({ state: "complete" });
  expect(await t.run(ctx => ctx.db.query("charges").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("participants").collect())).toHaveLength(1);
  await t.run(async ctx => {
    await ctx.db.patch(ids.event, { archived: true, enrollmentState: "failed" });
    await ctx.db.patch(ids.enrollment, { state: "failed" });
  });
  expect(await coach.query(makeFunctionReference<"query">("eventEnrollment:status"), { eventId: ids.event })).toMatchObject({ state: "failed", canRetry: false });
  await expect(coach.mutation(makeFunctionReference<"mutation">("eventEnrollment:retry"), { eventId: ids.event })).rejects.toThrow("unavailable");
});
