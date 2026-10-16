/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const targetUrl = "https://synthetic-production.convex.cloud";
const envNames = ["CONVEX_CLOUD_URL", "PRODUCTION_BOOTSTRAP_ENABLED", "PRODUCTION_BOOTSTRAP_CLOUD_URL"] as const;
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
afterEach(() => { for (const name of envNames) { const value = originalEnv[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

function configure(enabled = true, cloudUrl = targetUrl, boundUrl = targetUrl) {
  process.env.PRODUCTION_BOOTSTRAP_ENABLED = enabled ? "true" : "false";
  process.env.PRODUCTION_BOOTSTRAP_CLOUD_URL = boundUrl;
  process.env.CONVEX_CLOUD_URL = cloudUrl;
}

async function fixture(email = "coach@team8044.org", verified = true, google = true) {
  const t = convexTest(schema, modules);
  const authUserId = await t.run(async ctx => {
    const id = await ctx.db.insert("users", { email, name: "First Coach", emailVerificationTime: verified ? 1 : undefined });
    if (google) await ctx.db.insert("authAccounts", { userId: id, provider: "google", providerAccountId: "synthetic-google-sub" });
    return id;
  });
  return { t, authUserId };
}

const args = { seasonName: "2026–27", seasonYear: 2026, startsAt: 1_780_000_000_000 };

describe("first production Coach setup", () => {
  it("fails closed unless explicitly enabled for this non-development deployment", async () => {
    const f = await fixture();
    configure(false);
    await expect(f.t.mutation(internal.bootstrap.productionFirstCoach, args)).rejects.toThrow("disabled or bound");
    configure(true, targetUrl, "https://another-synthetic.convex.cloud");
    await expect(f.t.mutation(internal.bootstrap.productionFirstCoach, args)).rejects.toThrow("disabled or bound");
    configure(true, "https://third-bandicoot-18.convex.cloud", "https://third-bandicoot-18.convex.cloud");
    await expect(f.t.mutation(internal.bootstrap.productionFirstCoach, args)).rejects.toThrow("disabled or bound");
    expect(await f.t.run(ctx => ctx.db.query("appUsers").withIndex("by_role").take(1))).toHaveLength(0);
  });

  it("requires the expected verified Google account", async () => {
    configure();
    for (const [email, verified, google] of [["other@example.invalid", true, true], ["coach@team8044.org", false, true], ["coach@team8044.org", true, false]] as const) {
      const f = await fixture(email, verified, google);
      await expect(f.t.mutation(internal.bootstrap.productionFirstCoach, args)).rejects.toThrow("verified Coach Google sign-in");
    }
  });

  it("refuses existing app users or seasons without changing their records", async () => {
    configure();
    const withUser = await fixture();
    const priorUser = await withUser.t.run(ctx => ctx.db.insert("appUsers", { authUserId: withUser.authUserId, email: "coach@team8044.org", name: "Existing", role: "parent", travelLead: false, financialEdit: false, active: true }));
    await expect(withUser.t.mutation(internal.bootstrap.productionFirstCoach, args)).rejects.toThrow("already exists");
    expect((await withUser.t.run(ctx => ctx.db.get(priorUser)))?.role).toBe("parent");

    const withSeason = await fixture();
    await withSeason.t.run(async ctx => {
      const priorCoach = await ctx.db.insert("appUsers", { authUserId: withSeason.authUserId, email: "coach@team8044.org", name: "Prior", role: "coach", travelLead: false, financialEdit: true, active: true });
      await ctx.db.insert("seasons", { name: "Prior", year: 2025, status: "archived", startsAt: 1, permissionVersion: "DRAFT-1", createdBy: priorCoach });
      await ctx.db.delete(priorCoach);
    });
    await expect(withSeason.t.mutation(internal.bootstrap.productionFirstCoach, args)).rejects.toThrow("already exists");
  });

  it("creates one Coach and draft-permission season, then refuses a repeat", async () => {
    configure();
    const f = await fixture();
    const result = await f.t.mutation(internal.bootstrap.productionFirstCoach, args);
    const rows = await f.t.run(async ctx => ({ coach: await ctx.db.get(result.coachId), season: await ctx.db.get(result.seasonId), audit: await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "seasons").eq("entityId", result.seasonId)).take(1) }));
    expect(rows.coach).toMatchObject({ authUserId: f.authUserId, email: "coach@team8044.org", role: "coach", active: true, financialEdit: true });
    expect(rows.season).toMatchObject({ name: args.seasonName, status: "active", permissionVersion: "DRAFT-1", createdBy: result.coachId });
    expect(rows.audit[0]?.action).toBe("bootstrapProduction");
    await expect(f.t.mutation(internal.bootstrap.productionFirstCoach, args)).rejects.toThrow("already exists");
  });
});

