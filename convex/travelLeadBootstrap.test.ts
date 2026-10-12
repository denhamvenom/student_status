/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const grant = internal.bootstrap.grantDevelopmentTravelLead;
const devUrl = "https://third-bandicoot-18.convex.cloud";
const priorUrl = process.env.CONVEX_CLOUD_URL;
afterEach(() => { if (priorUrl === undefined) delete process.env.CONVEX_CLOUD_URL; else process.env.CONVEX_CLOUD_URL = priorUrl; });
const args = { expectedCoachEmail: "coach@example.invalid", expectedMentorEmail: "mentor@example.invalid" };

async function fixture(options: { verified?: boolean; google?: boolean; mentorRole?: "mentor" | "parent"; mentorActive?: boolean; financialEdit?: boolean; travelLead?: boolean; coachActive?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: args.expectedCoachEmail, name: "Coach" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: args.expectedCoachEmail, name: "Coach", role: "coach", active: options.coachActive ?? true, travelLead: false, financialEdit: true });
    const mentorAuth = await ctx.db.insert("users", { email: args.expectedMentorEmail, name: "Mentor", emailVerificationTime: options.verified === false ? undefined : 1 });
    if (options.google !== false) await ctx.db.insert("authAccounts", { userId: mentorAuth, provider: "google", providerAccountId: "fictional-google-sub" });
    const mentor = await ctx.db.insert("appUsers", { authUserId: mentorAuth, email: args.expectedMentorEmail, name: "Mentor", role: options.mentorRole ?? "mentor", active: options.mentorActive ?? true, travelLead: options.travelLead ?? false, financialEdit: options.financialEdit ?? false });
    const otherAuth = await ctx.db.insert("users", { email: "other@example.invalid", name: "Other" });
    const other = await ctx.db.insert("appUsers", { authUserId: otherAuth, email: "other@example.invalid", name: "Other", role: "mentor", active: true, travelLead: false, financialEdit: false });
    return { coach, mentor, other };
  });
  return { t, ids };
}

describe("development Travel Lead grant", () => {
  it("rejects other deployments before changing an account", async () => {
    const f = await fixture();
    process.env.CONVEX_CLOUD_URL = "https://production.example.invalid";
    await expect(f.t.mutation(grant, args)).rejects.toThrow("development-only");
    expect((await f.t.run(ctx => ctx.db.get(f.ids.mentor)))?.travelLead).toBe(false);
  });

  it("requires an active expected Coach and verified Google Mentor", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    await expect((await fixture({ coachActive: false })).t.mutation(grant, args)).rejects.toThrow("active development Coach");
    await expect((await fixture({ verified: false })).t.mutation(grant, args)).rejects.toThrow("Verified Google");
    await expect((await fixture({ google: false })).t.mutation(grant, args)).rejects.toThrow("Verified Google");
    await expect((await fixture({ mentorActive: false })).t.mutation(grant, args)).rejects.toThrow("active Mentor");
  });

  it("refuses a different role or an existing finance grant", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const parent = await fixture({ mentorRole: "parent" });
    await expect(parent.t.mutation(grant, args)).rejects.toThrow("existing active Mentor");
    expect((await parent.t.run(ctx => ctx.db.get(parent.ids.mentor)))?.role).toBe("parent");
    const finance = await fixture({ financialEdit: true });
    await expect(finance.t.mutation(grant, args)).rejects.toThrow("Financial editing");
    expect((await finance.t.run(ctx => ctx.db.get(finance.ids.mentor)))?.travelLead).toBe(false);
  });

  it("sets only travelLead once and records one Coach audit entry", async () => {
    process.env.CONVEX_CLOUD_URL = devUrl;
    const f = await fixture();
    const beforeOther = await f.t.run(ctx => ctx.db.get(f.ids.other));
    expect(await f.t.mutation(grant, args)).toEqual({ mentorId: f.ids.mentor, changed: true });
    expect(await f.t.mutation(grant, args)).toEqual({ mentorId: f.ids.mentor, changed: false });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.mentor))).toMatchObject({ role: "mentor", active: true, travelLead: true, financialEdit: false });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.other))).toEqual(beforeOther);
    const audit = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "appUsers").eq("entityId", f.ids.mentor)).take(10));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: f.ids.coach, action: "grantDevelopmentTravelLead" });
  });
});
