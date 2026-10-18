/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const create = makeFunctionReference<"mutation", { expectedCoachEmail: string }, { studentId: Id<"students">; eventId: Id<"events">; created: boolean }>("consentRehearsal:create");
const linkParent = makeFunctionReference<"mutation", { expectedCoachEmail: string; expectedParentEmail: string }, { studentId: Id<"students">; eventId: Id<"events">; created: boolean }>("consentRehearsal:linkParent");
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
  const t = createTest(schema, modules);
  const seasonId = await t.run(async ctx => {
    const authUserId = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId, email: "coach@example.invalid", name: "Fictional Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    return ctx.db.insert("seasons", { name: "Fictional", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
  });
  return { t, seasonId };
}

it("creates only a paper fixture and preserves its IDs on retry", async () => {
  const { t } = await fixture();
  const first = await t.mutation(create, { expectedCoachEmail: "coach@example.invalid" });
  expect(await t.mutation(create, { expectedCoachEmail: "coach@example.invalid" })).toEqual({ ...first, created: false });
  await t.run(async ctx => {
    const registry = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", first.studentId)).take(2);
    expect(registry).toHaveLength(1);
    expect(registry[0].parentId).toBeUndefined();
    expect(await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", first.studentId)).take(1)).toHaveLength(0);
    expect((await ctx.db.get(first.studentId))?.userId).toBeUndefined();
  });
  vi.stubEnv("CONVEX_CLOUD_URL", "https://production.example.invalid");
  await expect(t.mutation(create, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("development-only");
});

it("never adopts a matching identity without a fixture marker", async () => {
  const { t, seasonId } = await fixture();
  await t.run(ctx => ctx.db.insert("students", { seasonId, legalName: "Existing record", preferredName: "Existing", email: "consent.rehearsal@example.invalid", subteam: "Programming", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } }));
  await expect(t.mutation(create, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("without provenance");
  expect(await t.run(ctx => ctx.db.query("syntheticConsentSubjects").take(1))).toHaveLength(0);
});

it("does not reactivate a disabled fixture on retry", async () => {
  const { t } = await fixture();
  const first = await t.mutation(create, { expectedCoachEmail: "coach@example.invalid" });
  await t.run(async ctx => {
    const row = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", first.studentId).eq("parentId", undefined)).unique();
    await ctx.db.patch(row!._id, { enabled: false });
  });
  await expect(t.mutation(create, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("disabled");
});

it("rejects repurposed or archived fixture records on retry", async () => {
  const { t } = await fixture();
  const first = await t.mutation(create, { expectedCoachEmail: "coach@example.invalid" });
  await t.run(async ctx => {
    const coach = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", "coach@example.invalid")).unique();
    await ctx.db.patch(first.studentId, { userId: coach!._id });
  });
  await expect(t.mutation(create, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("student changed");
  await t.run(async ctx => {
    await ctx.db.patch(first.studentId, { userId: undefined });
    await ctx.db.patch(first.eventId, { archived: true });
  });
  await expect(t.mutation(create, { expectedCoachEmail: "coach@example.invalid" })).rejects.toThrow("changed or disabled");
});

it("links only a verified test Parent to the proven fixture and never restores revoked access", async () => {
  const { t } = await fixture();
  const parentId = await t.run(async ctx => {
    const authUserId = await ctx.db.insert("users", { email: "parent@example.invalid", emailVerificationTime: 1 });
    await ctx.db.insert("authAccounts", { userId: authUserId, provider: "google", providerAccountId: "fictional-parent", emailVerified: "parent@example.invalid" });
    return ctx.db.insert("appUsers", { authUserId, email: "parent@example.invalid", name: "Fictional Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
  });
  const args = { expectedCoachEmail: "coach@example.invalid", expectedParentEmail: "parent@example.invalid" };
  const result = await t.mutation(linkParent, args);
  expect(await t.mutation(linkParent, args)).toEqual({ ...result, created: false });
  await t.run(async ctx => {
    expect((await ctx.db.get(parentId))?.role).toBe("parent");
    const links = await ctx.db.query("familyLinks").withIndex("by_parentUserId", q => q.eq("parentUserId", parentId)).take(2);
    expect(links).toHaveLength(1);
    expect(links[0].studentId).toBe(result.studentId);
    await ctx.db.patch(links[0]._id, { active: false });
  });
  await expect(t.mutation(linkParent, args)).rejects.toThrow("revoked");
});

it("rejects unverified or wrong-role accounts before creating any consent fixture", async () => {
  const { t } = await fixture();
  await t.run(async ctx => {
    const authUserId = await ctx.db.insert("users", { email: "unverified@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId, email: "unverified@example.invalid", name: "Fictional Parent", role: "parent", active: true, travelLead: false, financialEdit: false });
  });
  await expect(t.mutation(linkParent, { expectedCoachEmail: "coach@example.invalid", expectedParentEmail: "unverified@example.invalid" })).rejects.toThrow("Verified Google");
  await expect(t.mutation(linkParent, { expectedCoachEmail: "coach@example.invalid", expectedParentEmail: "coach@example.invalid" })).rejects.toThrow("active Parent");
  expect(await t.run(ctx => ctx.db.query("syntheticConsentSubjects").take(1))).toHaveLength(0);
});
