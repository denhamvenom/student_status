/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from "vitest";
import { createTest } from "../testUtils";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
  const t = createTest(schema, modules);
  const seasonId = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", {email: "coach@example.invalid"});
    const coach = await ctx.db.insert("appUsers", {authUserId: coachAuth, email: "coach@example.invalid", name: "Fictional Coach", role: "coach", active: true, travelLead: false, financialEdit: false});
    const parentAuth = await ctx.db.insert("users", {email: "parent@example.invalid", emailVerificationTime: 1});
    await ctx.db.insert("authAccounts", {userId: parentAuth, provider: "google", providerAccountId: "fictional", emailVerified: "parent@example.invalid"});
    await ctx.db.insert("appUsers", {authUserId: parentAuth, email: "parent@example.invalid", name: "Fictional Parent", role: "parent", active: true, travelLead: false, financialEdit: false});
    return ctx.db.insert("seasons", {name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach});
  });
  return {t, seasonId};
}
const args = {expectedCoachEmail: "coach@example.invalid", expectedParentEmail: "parent@example.invalid"};
it("creates one isolated fictional PDF subject and preserves its provenance on retry", async () => {
  const f = await fixture();
  const first = await f.t.mutation(internal.consentPdfRehearsal.createAndLink, args);
  expect(await f.t.mutation(internal.consentPdfRehearsal.createAndLink, args)).toEqual({...first, created: false});
  await f.t.run(async ctx => {
    const student = await ctx.db.get(first.studentId), event = await ctx.db.get(first.eventId);
    expect(student).toMatchObject({email: "consent.pdf.rehearsal@example.invalid", profileCompletedAt: expect.any(Number)});
    expect(student?.consentProfileV2).toBeUndefined();
    expect(event?.feeCents).toBe(0);
    expect(await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", first.studentId)).take(2)).toHaveLength(1);
  });
  vi.stubEnv("CONVEX_CLOUD_URL", "https://production.example.invalid");
  await expect(f.t.mutation(internal.consentPdfRehearsal.createAndLink, args)).rejects.toThrow("development-only");
});
it("never adopts a matching unmarked student", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.insert("students", {seasonId: f.seasonId, legalName: "Existing Fictional", preferredName: "Existing", email: "consent.pdf.rehearsal@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: {state: "unknown"}, medications: {state: "unknown"}}));
  await expect(f.t.mutation(internal.consentPdfRehearsal.createAndLink, args)).rejects.toThrow("without provenance");
});
