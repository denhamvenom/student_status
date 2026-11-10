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

describe("Add a fee helpers", () => {
  it("lists only events the student is confirmed for, and reports what a new fee paid at once", async () => {
    const f = await fixture();
    const { eventIn, eventOut } = await f.t.run(async ctx => {
      const season = (await ctx.db.query("seasons").first())!._id;
      const make = async (name: string) => await ctx.db.insert("events", { seasonId: season, name, type: "Team", startsAt: 1, endsAt: 2, destination: "Synthetic", travel: "none", overnight: false, roomingEnabled: false, feeCents: 25, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
      const eventIn = await make("Signed up"); const eventOut = await make("Waitlisted");
      await ctx.db.insert("participants", { eventId: eventIn, studentId: f.ids.studentId, status: "confirmed", createdAt: 1, updatedAt: 1 } as never);
      await ctx.db.insert("participants", { eventId: eventOut, studentId: f.ids.studentId, status: "waitlist", createdAt: 1, updatedAt: 1 } as never);
      return { eventIn, eventOut };
    });
    const ids = await f.coach.query(api.finance.signedUpEventIds, { studentId: f.ids.studentId });
    expect(ids).toContain(eventIn);
    expect(ids).not.toContain(eventOut);
    await f.coach.mutation(api.finance.recordFunds, { studentId: f.ids.studentId, kind: "payment", amountCents: 300, reason: "Synthetic", idempotencyKey: "helper-funds-1" });
    const chargeId = await f.coach.mutation(api.finance.createCharge, { studentId: f.ids.studentId, label: "Paid at once", amountCents: 500, idempotencyKey: "helper-charge-1" });
    expect(await f.coach.query(api.finance.feePaidSoFar, { chargeId: chargeId! })).toBe(300);
  });
});
