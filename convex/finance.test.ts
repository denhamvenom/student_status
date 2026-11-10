/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "order-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "order-coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    const profile = { seasonId: season, legalName: "Synthetic", preferredName: "Synthetic", email: "order-student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
    return { auth, studentId: await ctx.db.insert("students", profile), otherId: await ctx.db.insert("students", profile) };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) };
}

describe("fee order when none is given", () => {
  it("places a fee added without a payment order after every existing fee, and keeps an explicit order", async () => {
    const f = await fixture();
    const priorityOf = (id: string | null) => f.t.run(async ctx => (await ctx.db.get(id as never) as { priority: number }).priority);
    const first = await f.coach.mutation(api.finance.createCharge, { studentId: f.ids.studentId, label: "Explicit", amountCents: 500, priority: 40, idempotencyKey: "order-explicit" });
    const second = await f.coach.mutation(api.finance.createCharge, { studentId: f.ids.studentId, label: "Blank one", amountCents: 500, idempotencyKey: "order-blank-1" });
    const third = await f.coach.mutation(api.finance.createCharge, { studentId: f.ids.studentId, label: "Blank two", amountCents: 500, idempotencyKey: "order-blank-2" });
    const other = await f.coach.mutation(api.finance.createCharge, { studentId: f.ids.otherId, label: "Other student", amountCents: 500, idempotencyKey: "order-blank-3" });
    expect(await priorityOf(first)).toBe(40);
    expect(await priorityOf(second)).toBeGreaterThan(40);
    expect(await priorityOf(third)).toBeGreaterThan(await priorityOf(second));
    expect(await priorityOf(other)).toBeGreaterThan(await priorityOf(third));
  });
});
