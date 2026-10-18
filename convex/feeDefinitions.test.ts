/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import schema from "./schema";
import { chargeFeeDefinition, provenMainFee } from "./lib/feeDefinitions";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";
const modules = import.meta.glob("./**/*.ts");

describe("stable shared fee identities", () => {
  it("requires exact originating ledger evidence rather than equal labels", async () => {
    const t = createTest(schema, modules);
    await t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
      const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
      const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
      const user = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const student = await ctx.db.get(user); if (!student) throw new Error("fixture");
      const base = { label: "Same label", amountCents: 100, priority: 1 };
      const first = await chargeFeeDefinition(ctx, actor, student, { ...base, idempotencyKey: "one" });
      const second = await chargeFeeDefinition(ctx, actor, student, { ...base, idempotencyKey: "two" });
      expect(first._id).not.toBe(second._id);
      expect((await chargeFeeDefinition(ctx, actor, student, { ...base, idempotencyKey: "one" }))._id).toBe(first._id);
      const chargeId = await ctx.db.insert("charges", { studentId: user, ...base, appliedCents: 0, createdBy: actor, createdAt: 0 });
      const charge = await ctx.db.get(chargeId); if (!charge) throw new Error("fixture");
      expect(await provenMainFee(ctx, charge)).toBeNull();
    });
  });

  it("fails closed for new commands in every unfinished maintenance state", async () => {
    const t = createTest(schema, modules);
    await t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
      const actor = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
      const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: actor });
      await requireSeasonFinanceReady(ctx, season);
      const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "draining", updatedAt: 0 });
      for (const state of ["draining", "applying", "failed"] as const) {
        await ctx.db.patch(control, { state });
        await expect(requireSeasonFinanceReady(ctx, season)).rejects.toThrow("Season fees");
      }
      await ctx.db.patch(control, { state: "ready" });
      await requireSeasonFinanceReady(ctx, season);
    });
  });
});
