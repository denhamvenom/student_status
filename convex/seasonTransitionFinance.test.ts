/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { createTest } from "../testUtils";
import schema from "./schema";
import { ensureFinancialAccount, financialAccount, recordProjectedEntry, projectMovement } from "./lib/financialSources";
import { applySeasonChargeDecision, applySeasonSourceDecision, verifySeasonChargeDecision, verifySeasonSourceDecision, continueSeasonTargetAllocation } from "./lib/seasonTransitionFinance";
import { requireSeasonFinanceReady, requireSeasonTransitionFinancialAccess } from "./lib/seasonFinance";
const modules = import.meta.glob("./**/*.ts");

it("pairs personal/fundraising carry and debt once, preserves roots, and fences writes", async () => {
  const t = createTest(schema, modules);
  await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "season@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "season@example.invalid", name: "Synthetic Coach", role: "coach", financialEdit: true, travelLead: false, active: true });
    const old = await ctx.db.insert("seasons", { name: "Old", year: 2026, status: "active", startsAt: 0, permissionVersion: "draft", createdBy: coach });
    const next = await ctx.db.insert("seasons", { name: "Next", year: 2027, status: "draft", startsAt: 1, permissionVersion: "draft", createdBy: coach });
    const profile = { legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
    const student = await ctx.db.insert("students", { ...profile, seasonId: old });
    const target = await ctx.db.insert("students", { ...profile, seasonId: next });
    const plan = await ctx.db.insert("seasonTransitionPlans", { sourceSeasonId: old, targetSeasonId: next, targetName: "Next", targetCompetitionYear: 2027, targetStartDate: "2027-01-01", targetEndDate: "2027-12-31", state: "draining", open: true, revision: 1, createdBy: coach, updatedBy: coach, createdAt: 0, updatedAt: 0, idempotencyKey: "synthetic-plan", requestHash: "synthetic" });
    await ctx.db.insert("seasonTransitionRosterDecisions", { planId: plan, sourceStudentId: student, targetStudentId: target, choice: "return", studentFingerprint: "synthetic", revision: 1, decidedBy: coach, decidedAt: 0 });
    await expect(requireSeasonFinanceReady(ctx, old)).rejects.toThrow("season change");
    await requireSeasonTransitionFinancialAccess(ctx, old, true);
    const account = await ensureFinancialAccount(ctx, student);
    const decisions = [];
    for (const kind of ["payment", "fundraiser"] as const) {
      const root = await ctx.db.insert("ledgerEntries", { studentId: student, kind, amountCents: 123, previousCents: 0, newCents: 123, recordedBy: coach, recordedAt: 1, idempotencyKey: kind });
      await recordProjectedEntry(ctx, root, account);
      decisions.push(await ctx.db.insert("seasonTransitionSourceDecisions", { planId: plan, sourceStudentId: student, sourceEntryId: root, kind, choice: "carry", amountCents: 123, sourceRevision: 0, financialGeneration: account.generation, financialRevision: account.revision, reason: "", revision: 1, decidedBy: coach, decidedAt: 1 }));
    }
    const charge = await ctx.db.insert("charges", { studentId: student, label: "Opening obligation", amountCents: 99, appliedCents: 0, priority: 1, createdBy: coach, createdAt: 0, revision: 0 });
    // Project the initial obligation through the same authoritative charge path.
    const { recordChargeChange } = await import("./lib/financialSources");
    const original = await ctx.db.get(charge);
    await recordChargeChange(ctx, account, original!, 0, 0, true);
    const debt = await ctx.db.insert("seasonTransitionChargeDecisions", { planId: plan, sourceStudentId: student, chargeId: charge, choice: "carry", outstandingCents: 99, chargeRevision: 1, financialGeneration: account.generation, financialRevision: account.revision, reason: "", revision: 1, decidedBy: coach, decidedAt: 1 });
    await ctx.db.patch(plan, { state: "applying" });
    await expect(requireSeasonTransitionFinancialAccess(ctx, old, true)).rejects.toThrow("season change");
    for (const id of decisions) { await applySeasonSourceDecision(ctx, plan, id, target); await applySeasonSourceDecision(ctx, plan, id, target); }
    await applySeasonChargeDecision(ctx, plan, debt, target); await applySeasonChargeDecision(ctx, plan, debt, target);
    const before = await financialAccount(ctx, student); const after = await financialAccount(ctx, target);
    expect([before?.personalAvailableCents, before?.fundraisingAvailableCents, before?.chargedCents]).toEqual([0, 0, 0]);
    expect([after?.personalAvailableCents, after?.fundraisingAvailableCents, after?.chargedCents, after?.knownRaisedCents, after?.unknownGrossSourceCount]).toEqual([123, 123, 99, 0, 0]);
    const sources = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation", q => q.eq("studentId", target).eq("generation", 1)).take(3);
    expect(sources).toHaveLength(2);
    for (const source of sources) { const root = await ctx.db.get(source.rootOriginEntryId); expect(root?.studentId).toBe(student); expect(root?.kind).toBe(source.kind); }
    const fundSource = sources.find(source => source.kind === "fundraiser")!;
    const fundEntry = await ctx.db.get(fundSource.sourceEntryId);
    await expect(projectMovement(ctx, after!, { ...fundEntry!, kind: "payout", sourceEntryId: fundSource.sourceEntryId, sourceKind: "fundraiser", amountCents: 1 })).rejects.toThrow("source history");
    const departing = await ctx.db.insert("students", { ...profile, seasonId: old, email: "departing@example.invalid" });
    await ctx.db.insert("seasonTransitionRosterDecisions", { planId: plan, sourceStudentId: departing, choice: "depart", studentFingerprint: "synthetic", revision: 1, decidedBy: coach, decidedAt: 0 });
    const departingAccount = await ensureFinancialAccount(ctx, departing);
    const personal = await ctx.db.insert("ledgerEntries", { studentId: departing, kind: "payment", amountCents: 51, previousCents: 0, newCents: 51, recordedBy: coach, recordedAt: 1, idempotencyKey: "departing-payment" });
    await recordProjectedEntry(ctx, personal, departingAccount);
    const team = await ctx.db.insert("seasonTransitionSourceDecisions", { planId: plan, sourceStudentId: departing, sourceEntryId: personal, kind: "payment", choice: "team", amountCents: 51, sourceRevision: 0, financialGeneration: 1, financialRevision: departingAccount.revision, reason: "Coach reviewed team transfer", revision: 1, decidedBy: coach, decidedAt: 1 });
    await applySeasonSourceDecision(ctx, plan, team); await applySeasonSourceDecision(ctx, plan, team);
    const teamDecision = await ctx.db.get(team);
    const teamEntry = await ctx.db.get(teamDecision!.outgoingEntryId!);
    expect([teamEntry?.destination, teamEntry?.sourceKind, teamEntry?.recordedBy, teamEntry?.amountCents]).toEqual(["team", "payment", coach, 51]);
    expect((await financialAccount(ctx, departing))?.personalAvailableCents).toBe(0);
    expect(await continueSeasonTargetAllocation(ctx, plan, target)).toBe(true);
    expect(await continueSeasonTargetAllocation(ctx, plan, target)).toBe(true);
    const allocated = await financialAccount(ctx, target);
    expect([allocated?.paidCents, allocated?.chargedCents, allocated?.personalAvailableCents, allocated?.fundraisingAvailableCents]).toEqual([99, 99, 24, 123]);
    const appliedPlan = await ctx.db.get(plan);
    for (const id of [...decisions, team]) await verifySeasonSourceDecision(ctx, appliedPlan!, (await ctx.db.get(id))!);
    await verifySeasonChargeDecision(ctx, appliedPlan!, (await ctx.db.get(debt))!);
    await ctx.db.patch(coach, { role: "mentor" });
    await expect(applySeasonSourceDecision(ctx, plan, team)).rejects.toThrow("active Coach");
    const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", target)).take(2);
    expect(charges).toHaveLength(1); expect(charges[0].originChargeId).toBe(charge);
  });
});
