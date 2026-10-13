/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const start = makeFunctionReference<"mutation">("familyLinkSeasonMigration:start");
const retry = makeFunctionReference<"mutation">("familyLinkSeasonMigration:retry");
const runStep = makeFunctionReference<"mutation">("familyLinkSeasonMigration:runStep");
const processPage = makeFunctionReference<"mutation">("familyLinkSeasonMigration:processPage");
const page = makeFunctionReference<"query">("seasonFamilyLinks:currentSeasonPage");

async function fixture(oldLinkCount: number) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid" });
    const alternateAuth = await ctx.db.insert("users", { email: "other@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const parent = await ctx.db.insert("appUsers", { authUserId: parentAuth, email: "parent@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
    const alternate = await ctx.db.insert("appUsers", { authUserId: alternateAuth, email: "other@example.invalid", name: "Other", role: "parent", active: true, travelLead: false, financialEdit: false });
    const oldSeason = await ctx.db.insert("seasons", { name: "Old", year: 2026, status: "archived", startsAt: 0, permissionVersion: "draft", createdBy: coach });
    const currentSeason = await ctx.db.insert("seasons", { name: "Current", year: 2027, status: "active", startsAt: 1, permissionVersion: "draft", createdBy: coach });
    const student = async (seasonId: Id<"seasons">, name: string) => ctx.db.insert("students", {
      seasonId, legalName: name, preferredName: name, email: `${name.toLowerCase().replaceAll(" ", ".")}@example.invalid`, subteam: "",
      active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" },
    });
    for (let i = 0; i < oldLinkCount; i++) {
      const historical = await student(oldSeason, `Historical ${i}`);
      await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: historical, active: true, createdBy: coach });
    }
    const current = await student(currentSeason, "Current Child");
    const second = await student(currentSeason, "Second Child");
    const unlinked = await student(currentSeason, "Unlinked Child");
    await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: current, active: true, createdBy: coach });
    await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: second, active: true, createdBy: coach });
    const revoked = await student(currentSeason, "Revoked Child");
    await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: revoked, active: false, createdBy: coach });
    return { coachAuth, parentAuth, alternateAuth, coach, parent, alternate, oldSeason, currentSeason, current, second, unlinked };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), parent: t.withIdentity({ subject: `${ids.parentAuth}|session` }), alternate: t.withIdentity({ subject: `${ids.alternateAuth}|session` }) };
}

async function finish(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  for (let i = 0; i < 20; i++) {
    const state = await t.run(ctx => ctx.db.query("familyLinkSeasonBackfill").withIndex("by_key", q => q.eq("key", "team")).unique());
    if (!state || state.state === "complete") return state;
    if (state.state === "failed") throw new Error(state.lastError);
    await t.mutation(processPage, { generation: state.generation, phase: state.phase, cursor: state.cursor });
  }
  throw new Error("Backfill did not finish within bounded test steps.");
}

describe("season-indexed family links", () => {
  it("withholds pages before verification and finds current children after more than 100 historical links", async () => {
    const f = await fixture(105);
    await expect(f.parent.query(page, { paginationOpts: { numItems: 1, cursor: null } })).rejects.toThrow("being prepared");
    await expect(f.parent.mutation(start, {})).rejects.toThrow("permission");
    await f.coach.mutation(start, {});
    await finish(f.t);
    const first = await f.parent.query(page, { paginationOpts: { numItems: 1, cursor: null } }) as { page: { _id: string }[]; continueCursor: string; isDone: boolean };
    expect(first.page.map(row => row._id)).toEqual([f.ids.current]);
    expect(first.isDone).toBe(false);
    const second = await f.parent.query(page, { paginationOpts: { numItems: 1, cursor: first.continueCursor } }) as { page: { _id: string }[]; isDone: boolean };
    expect(second.page.map(row => row._id)).toEqual([f.ids.second]);
    expect(second.isDone).toBe(true);
    await f.t.run(ctx => ctx.db.patch(f.ids.current, { active: false }));
    const archivedPage = await f.parent.query(page, { paginationOpts: { numItems: 1, cursor: null } }) as { page: { _id: string }[]; continueCursor: string; isDone: boolean };
    expect(archivedPage.page).toEqual([]);
    expect(archivedPage.isDone).toBe(false);
    const activeSibling = await f.parent.query(page, { paginationOpts: { numItems: 1, cursor: archivedPage.continueCursor } }) as { page: { _id: string }[] };
    expect(activeSibling.page.map(row => row._id)).toEqual([f.ids.second]);
    expect(await f.alternate.query(page, { paginationOpts: { numItems: 20, cursor: null } })).toMatchObject({ page: [] });
    await expect(f.coach.query(page, { paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow("permission");
    await expect(f.parent.query(page, { paginationOpts: { numItems: 0, cursor: null } })).rejects.toThrow("page size");
  });

  it("records a broken source link, retries from the same cursor, and ignores stale scheduled work", async () => {
    const f = await fixture(0);
    const orphan = await f.t.run(async ctx => {
      const student = await ctx.db.insert("students", { seasonId: f.ids.currentSeason, legalName: "Orphan", preferredName: "Orphan", email: "orphan@example.invalid", subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const link = await ctx.db.insert("familyLinks", { parentUserId: f.ids.parent, studentId: student, active: true, createdBy: f.ids.coach });
      await ctx.db.delete(student);
      return link;
    });
    await f.coach.mutation(start, {});
    let state = await f.t.run(ctx => ctx.db.query("familyLinkSeasonBackfill").withIndex("by_key", q => q.eq("key", "team")).unique());
    if (!state) throw new Error("Missing job");
    await f.t.mutation(runStep, { generation: state.generation, phase: state.phase, cursor: state.cursor });
    state = await f.t.run(ctx => ctx.db.query("familyLinkSeasonBackfill").withIndex("by_key", q => q.eq("key", "team")).unique());
    expect(state).toMatchObject({ state: "failed", phase: "backfill", cursor: null, unresolved: 1 });
    expect(state?.lastError).toContain("Family link");
    await expect(f.parent.query(page, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("being prepared");
    await f.t.run(ctx => ctx.db.patch(orphan, { studentId: f.ids.unlinked }));
    await f.coach.mutation(retry, { reason: "Coach reconciled the dangling test link." });
    const resumed = await f.t.run(ctx => ctx.db.query("familyLinkSeasonBackfill").withIndex("by_key", q => q.eq("key", "team")).unique());
    if (!resumed || !state) throw new Error("Missing job");
    await f.t.mutation(runStep, { generation: state.generation, phase: state.phase, cursor: state.cursor });
    expect((await f.t.run(ctx => ctx.db.get(resumed._id)))?.generation).toBe(resumed.generation);
    expect((await finish(f.t))?.state).toBe("complete");
  });

  it("stops before writes when the initiating Coach loses access and permits active Coach takeover", async () => {
    const f = await fixture(1);
    await f.coach.mutation(start, {});
    const before = await f.t.run(ctx => ctx.db.query("familyLinkSeasonBackfill").withIndex("by_key", q => q.eq("key", "team")).unique());
    if (!before) throw new Error("Missing job");
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: false }));
    await f.t.mutation(runStep, { generation: before.generation, phase: before.phase, cursor: before.cursor });
    const failed = await f.t.run(ctx => ctx.db.get(before._id));
    expect(failed).toMatchObject({ state: "failed", cursor: null, scanned: 0, unresolved: 0 });
    expect(failed?.lastError).toContain("Coach access changed");
    const unstamped = await f.t.run(ctx => ctx.db.query("familyLinks").withIndex("by_parentUserId", q => q.eq("parentUserId", f.ids.parent)).first());
    expect(unstamped?.seasonId).toBeUndefined();
    const secondCoachAuth = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "second.coach@example.invalid" });
      await ctx.db.insert("appUsers", { authUserId: auth, email: "second.coach@example.invalid", name: "Second Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
      return auth;
    });
    await f.t.withIdentity({ subject: `${secondCoachAuth}|session` }).mutation(retry, { reason: "Active Coach reviewed revoked starter access." });
    expect((await finish(f.t))?.state).toBe("complete");
  });
});
