/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const devUrl = "https://third-bandicoot-18.convex.cloud";
const priorUrl = process.env.CONVEX_CLOUD_URL;
afterEach(() => { if (priorUrl === undefined) delete process.env.CONVEX_CLOUD_URL; else process.env.CONVEX_CLOUD_URL = priorUrl; });

async function fixture(verified = true, google = true, existingRole?: "parent" | "student") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid", name: "Coach", emailVerificationTime: 1 });
    await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: false, travelLead: false, financialEdit: false });
    const secondCoachAuth = await ctx.db.insert("users", { email: "second.coach@example.invalid", name: "Second Coach", emailVerificationTime: 1 });
    await ctx.db.insert("appUsers", { authUserId: secondCoachAuth, email: "second.coach@example.invalid", name: "Second Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const mentorAuth = await ctx.db.insert("users", { email: "mentor@example.invalid", name: "Mentor", emailVerificationTime: verified ? 1 : undefined });
    if (google) await ctx.db.insert("authAccounts", { userId: mentorAuth, provider: "google", providerAccountId: "synthetic-google-sub" });
    const existingId = existingRole ? await ctx.db.insert("appUsers", { authUserId: mentorAuth, email: "mentor@example.invalid", name: "Prior Role", role: existingRole, active: true, travelLead: false, financialEdit: false }) : null;
    return { mentorAuth, existingId };
  });
  return { t, ids };
}

describe("development Mentor provisioning", () => {
  it("rejects a different deployment", async () => {
    process.env.CONVEX_CLOUD_URL = "https://production.example.invalid";
    const f = await fixture();
    await expect(f.t.mutation(internal.bootstrap.provisionDevelopmentMentor, { expectedEmail: "mentor@example.invalid" })).rejects.toThrow("development-only");
  });
  it("requires verified Google sign-in", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const unverified = await fixture(false, true);
    await expect(unverified.t.mutation(internal.bootstrap.provisionDevelopmentMentor, { expectedEmail: "mentor@example.invalid" })).rejects.toThrow("verified Google");
    const noGoogle = await fixture(true, false);
    await expect(noGoogle.t.mutation(internal.bootstrap.provisionDevelopmentMentor, { expectedEmail: "mentor@example.invalid" })).rejects.toThrow("Google identity");
  });
  it("provisions once and preserves existing non-Mentor roles", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const f = await fixture();
    const args = { expectedEmail: "mentor@example.invalid" };
    const first = await f.t.mutation(internal.bootstrap.provisionDevelopmentMentor, args);
    const second = await f.t.mutation(internal.bootstrap.provisionDevelopmentMentor, args);
    expect(second.mentorId).toBe(first.mentorId);
    const row = await f.t.run(ctx => ctx.db.get(first.mentorId));
    expect(row).toMatchObject({ role: "mentor", active: true, travelLead: false, financialEdit: false });
    const existing = await fixture(true, true, "parent");
    await expect(existing.t.mutation(internal.bootstrap.provisionDevelopmentMentor, args)).rejects.toThrow("role must not be changed");
    expect((await existing.t.run(ctx => ctx.db.get(existing.ids.existingId!)))?.role).toBe("parent");
  });
});
