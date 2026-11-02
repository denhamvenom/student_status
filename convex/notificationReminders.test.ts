/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const hourly = makeFunctionReference<"mutation", Record<string, never>, null>("notificationReminders:hourly");

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const account = async (key: string, role: Doc<"appUsers">["role"]) => {
      const authUserId = await ctx.db.insert("users", { email: `${key}@example.invalid` });
      return ctx.db.insert("appUsers", { authUserId, email: `${key}@example.invalid`, name: key, role, active: true, travelLead: false, financialEdit: false });
    };
    const coach = await account("coach", "coach");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2027, status: "active", startsAt: 0, permissionVersion: "v1", createdBy: coach });
    const student = async (key: string, active = true) => {
      const userId = await account(key, "student");
      const parent = await account(`${key}-parent`, "parent");
      const id = await ctx.db.insert("students", { seasonId: season, userId, legalName: `Synthetic ${key}`, preferredName: key, email: `${key}@example.invalid`, subteam: "Build", active, travelTeam: true, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" }, profileCompletedAt: 1 });
      await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: id, seasonId: season, active: true, createdBy: coach });
      return { id, userId, parent };
    };
    return { coach, season, a: await student("a"), b: await student("b"), c: await student("c"), inactive: await student("gone", false) };
  });
  const event = (fields: Partial<Doc<"events">>) => t.run(ctx => ctx.db.insert("events", { seasonId: ids.season, name: "Synthetic Event", type: "Competition", startsAt: 0, endsAt: 0, destination: "Synthetic Arena", travel: "Charter Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...fields }));
  const join = (eventId: Id<"events">, studentId: Id<"students">, status: Doc<"participants">["status"] = "confirmed") => t.run(ctx => ctx.db.insert("participants", { eventId, studentId, status, createdAt: 0, updatedAt: 0 }));
  const runAt = async (iso: string) => {
    vi.setSystemTime(Date.parse(iso));
    await t.mutation(hourly, {});
    for (let i = 0; i < 6; i++) { vi.runOnlyPendingTimers(); await t.finishInProgressScheduledFunctions(); }
  };
  const titles = (userId: Id<"appUsers">) => t.run(async ctx => (await ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", userId)).take(50)).map(row => row.title));
  return { t, ids, event, join, runAt, titles };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("R1 event tomorrow", () => {
  it("reaches confirmed students and their parents at 6 PM the day before, once", async () => {
    const f = await fixture();
    // Thu 2026-01-15 8:00 AM CST tomorrow; the other event is the day after.
    const tomorrow = await f.event({ name: "Tomorrow Meeting", startsAt: Date.parse("2026-01-15T14:00:00Z"), endsAt: Date.parse("2026-01-15T18:00:00Z") });
    const later = await f.event({ name: "Later Meeting", startsAt: Date.parse("2026-01-16T14:00:00Z"), endsAt: Date.parse("2026-01-16T18:00:00Z") });
    const cancelled = await f.event({ name: "Cancelled Meeting", cancelled: true, startsAt: Date.parse("2026-01-15T15:00:00Z"), endsAt: Date.parse("2026-01-15T18:00:00Z") });
    await f.join(tomorrow, f.ids.a.id); await f.join(tomorrow, f.ids.b.id, "pending"); await f.join(later, f.ids.a.id); await f.join(cancelled, f.ids.c.id);
    await f.runAt("2026-01-14T23:00:00Z"); // 5 PM: not R1's hour
    expect(await f.titles(f.ids.a.userId)).toEqual([]);
    await f.runAt("2026-01-15T00:00:00Z"); // 6 PM CST
    await f.runAt("2026-01-15T00:00:00Z");
    expect(await f.titles(f.ids.a.userId)).toEqual(["Tomorrow: Tomorrow Meeting"]);
    expect(await f.titles(f.ids.a.parent)).toEqual(["Tomorrow: Tomorrow Meeting"]);
    const body = await f.t.run(async ctx => (await ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", f.ids.a.userId)).first())?.body);
    expect(body).toBe("Starts at 8:00 AM at Synthetic Arena.");
    for (const userId of [f.ids.b.userId, f.ids.b.parent, f.ids.c.userId]) expect(await f.titles(userId)).toEqual([]);
  });
});

describe("R3 signup closes soon", () => {
  it("reaches eligible active students with no participant row, 24–48h before close", async () => {
    const f = await fixture();
    const now = Date.parse("2026-01-14T20:00:00Z");
    const open = await f.event({ name: "Open Event", signupClosesAt: now + 36 * HOUR, startsAt: now + 5 * DAY, endsAt: now + 6 * DAY });
    await f.event({ name: "Far Event", signupClosesAt: now + 3 * DAY, startsAt: now + 5 * DAY, endsAt: now + 6 * DAY });
    await f.event({ name: "Assigned Event", signupMode: "assigned", signupClosesAt: now + 36 * HOUR, startsAt: now + 5 * DAY, endsAt: now + 6 * DAY });
    await f.join(open, f.ids.a.id); await f.join(open, f.ids.b.id, "withdrawn");
    await f.runAt("2026-01-14T20:00:00Z");
    expect(await f.titles(f.ids.c.userId)).toEqual(["Sign-up closes soon: Open Event"]);
    for (const userId of [f.ids.a.userId, f.ids.b.userId, f.ids.inactive.userId, f.ids.c.parent]) expect(await f.titles(userId)).toEqual([]);
  });
});

describe("R6 unpaid balance", () => {
  const off = "2026-01-12T23:00:00Z"; // Monday 5 PM CST, off-parity week
  const parity = "2026-01-19T23:00:00Z";

  it.each([
    ["parity Monday reaches every family with an unpaid charge", parity, {}, true],
    ["off-parity Monday skips families with nothing due soon", off, {}, false],
    ["off-parity Monday still sends when the charge is due within 7 days", off, { dueAt: Date.parse(off) + 3 * DAY }, true],
    ["off-parity Monday sends when the fee definition's due date is near", off, { definitionDueAt: Date.parse(off) + 2 * DAY }, true],
    ["a paid charge never triggers", parity, { paid: true }, false],
  ])("%s", async (_label, when, opts: { dueAt?: number; definitionDueAt?: number; paid?: boolean }, expected) => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const feeDefinitionId = opts.definitionDueAt === undefined ? undefined : await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Synthetic fee", defaultAmountCents: 1000, priority: 1, revision: 0, state: "active", createdBy: f.ids.coach, createdAt: 0, updatedAt: 0, dueAt: opts.definitionDueAt });
      await ctx.db.insert("charges", { studentId: f.ids.a.id, label: "Synthetic fee", amountCents: 1000, appliedCents: opts.paid ? 1000 : 0, priority: 1, createdBy: f.ids.coach, createdAt: 0, dueAt: opts.dueAt, feeDefinitionId });
    });
    await f.runAt(when);
    expect(await f.titles(f.ids.a.parent)).toEqual(expected ? ["Balance reminder"] : []);
    expect(await f.titles(f.ids.b.parent)).toEqual([]);
  });

  it("counts an unpaid charge that sits behind more than one page of paid charges", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 120; i++) await ctx.db.insert("charges", { studentId: f.ids.a.id, label: "Synthetic paid fee", amountCents: 1000, appliedCents: 1000, priority: 1, createdBy: f.ids.coach, createdAt: 0 });
      await ctx.db.insert("charges", { studentId: f.ids.a.id, label: "Synthetic unpaid fee", amountCents: 1000, appliedCents: 0, priority: 2, createdBy: f.ids.coach, createdAt: 0 });
    });
    await f.runAt(parity);
    expect(await f.titles(f.ids.a.parent)).toEqual(["Balance reminder"]);
  });
});
