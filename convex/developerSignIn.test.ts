/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { exportPKCS8, generateKeyPair } from "jose";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { DEVELOPER_PERSONAS, DEVELOPER_SIGN_IN_CLOUD_URL, developerEmail } from "./lib/developerSignIn";

const modules = import.meta.glob("./**/*.ts");
const KEY = "k".repeat(40);
afterEach(() => vi.unstubAllEnvs());

function enable(overrides: { url?: string; enabled?: string; key?: string } = {}) {
  vi.stubEnv("CONVEX_CLOUD_URL", overrides.url ?? DEVELOPER_SIGN_IN_CLOUD_URL);
  vi.stubEnv("DEVELOPER_SIGN_IN_ENABLED", overrides.enabled ?? "true");
  vi.stubEnv("DEVELOPER_SIGN_IN_KEY", overrides.key ?? KEY);
}

async function fixture() {
  const t = convexTest(schema, modules); rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "realcoach@example.invalid", emailVerificationTime: 1 });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "realcoach@example.invalid", name: "Real Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
    return { auth, coach, season };
  });
  return { t, ids };
}

async function signInAs(t: Awaited<ReturnType<typeof fixture>>["t"], persona: string, key = KEY) {
  const keys = await generateKeyPair("RS256", { extractable: true });
  vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey)); vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
  return await t.action(api.auth.signIn, { provider: "developer", params: { persona, key } });
}

async function sessionFor(t: Awaited<ReturnType<typeof fixture>>["t"], persona: (typeof DEVELOPER_PERSONAS)[number]["id"]) {
  return await t.run(async ctx => {
    const user = await ctx.db.query("users").withIndex("email", q => q.eq("email", developerEmail(persona))).unique();
    const session = user && await ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", user._id)).first();
    if (!user || !session) throw new Error("Session missing");
    return `${user._id}|${session._id}`;
  });
}

describe("developer sign-in", () => {
  it.each([
    ["production deployment", { url: "https://amicable-eel-413.convex.cloud" }],
    ["switch off", { enabled: "false" }],
    ["short key", { key: "short" }],
  ])("is fully refused with %s", async (_label, overrides) => {
    const f = await fixture();
    enable(overrides);
    expect(await f.t.query(api.developerSignIn.available, {})).toBeNull();
    await expect(f.t.mutation(internal.developerSignIn.ensurePersonas, {})).rejects.toThrow("disabled");
    expect(await f.t.mutation(internal.developerSignIn.consume, { persona: "coach", key: KEY })).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("appUsers").take(10))).toHaveLength(1);
  });

  it("creates the fixed fictional accounts and links without touching real accounts, and is repeatable", async () => {
    const f = await fixture(); enable();
    const first = await f.t.mutation(internal.developerSignIn.ensurePersonas, {});
    expect(first).toMatchObject({ created: DEVELOPER_PERSONAS.length + 3, restored: 0 });
    const state = await f.t.run(async ctx => ({
      app: await ctx.db.query("appUsers").take(20),
      links: await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", first.studentId)).take(5),
      student: await ctx.db.get(first.studentId),
    }));
    expect(state.app.filter(row => row.email.endsWith("@developer.example.invalid"))).toHaveLength(DEVELOPER_PERSONAS.length);
    expect(state.app.find(row => row._id === f.ids.coach)).toMatchObject({ name: "Real Coach", role: "coach", active: true });
    expect(state.links.map(link => link.active)).toEqual([true, true]);
    expect(state.student).toMatchObject({ seasonId: f.ids.season, email: developerEmail("student"), active: true });
    expect(await f.t.mutation(internal.developerSignIn.ensurePersonas, {})).toMatchObject({ studentId: first.studentId, created: 0, restored: 0 });
  });

  it("restores grants and family links changed during testing", async () => {
    const f = await fixture(); enable();
    const { studentId } = await f.t.mutation(internal.developerSignIn.ensurePersonas, {});
    await f.t.run(async ctx => {
      const mentor = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail("travelLead"))).unique();
      await ctx.db.patch(mentor!._id, { travelLead: false, active: false });
      const link = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", studentId)).first();
      await ctx.db.patch(link!._id, { active: false, revokedAt: 1 });
    });
    expect(await f.t.mutation(internal.developerSignIn.ensurePersonas, {})).toMatchObject({ created: 0, restored: 2 });
    const restored = await f.t.run(async ctx => ({
      mentor: await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail("travelLead"))).unique(),
      links: await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", studentId)).take(5),
    }));
    expect(restored.mentor).toMatchObject({ travelLead: true, active: true, accessRevision: 1 });
    expect(restored.links.every(link => link.active && link.revokedAt === undefined)).toBe(true);
  });

  it("stops instead of adopting an account that already uses a reserved address", async () => {
    const f = await fixture(); enable();
    await f.t.run(async ctx => {
      const other = await ctx.db.insert("users", { email: "other@example.invalid" });
      await ctx.db.insert("appUsers", { authUserId: other, email: developerEmail("mentor"), name: "Collision", role: "mentor", travelLead: false, financialEdit: false, active: true });
    });
    await expect(f.t.mutation(internal.developerSignIn.ensurePersonas, {})).rejects.toThrow("manual review");
  });

  it.each(DEVELOPER_PERSONAS.map(p => [p.id, p.role] as const))("signs in as %s with the %s role", async (persona, role) => {
    const f = await fixture(); enable();
    await f.t.mutation(internal.developerSignIn.ensurePersonas, {});
    const result = await signInAs(f.t, persona);
    expect(result.tokens?.token).toBeTruthy();
    const view = await f.t.withIdentity({ subject: await sessionFor(f.t, persona) }).query(api.app.viewer, {});
    expect(view).toMatchObject({ status: "active", user: { role, email: developerEmail(persona) } });
    if (persona === "parentStaff") expect(view.availableRoles).toEqual(["parent", "mentor", "travelLead"]);
    if (persona === "student") expect(view.students).toHaveLength(1);
  });

  it.each([
    ["a wrong key", "coach", "w".repeat(40)],
    ["an unknown persona", "admin", KEY],
  ])("rejects %s", async (_label, persona, key) => {
    const f = await fixture(); enable();
    await f.t.mutation(internal.developerSignIn.ensurePersonas, {});
    expect((await signInAs(f.t, persona, key)).tokens).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("authSessions").take(5))).toHaveLength(0);
  });

  it("cannot be reached through email-code sign-in", async () => {
    const f = await fixture(); enable();
    await f.t.mutation(internal.developerSignIn.ensurePersonas, {});
    for (const persona of ["parent", "coach"] as const) {
      expect(await f.t.mutation(internal.parentEmailAuth.prepareCode, { email: developerEmail(persona), code: "123456", nonce: "b".repeat(64) })).toBe(false);
      expect(await f.t.mutation(internal.parentEmailAuth.consumeCode, { email: developerEmail(persona), code: "123456" })).toBeNull();
    }
  });

  it("refuses accounts that were never set up", async () => {
    const f = await fixture(); enable();
    expect(await f.t.mutation(internal.developerSignIn.consume, { persona: "coach", key: KEY })).toBeNull();
  });

  it("ends existing developer sessions once any guard is removed", async () => {
    const f = await fixture(); enable();
    await f.t.mutation(internal.developerSignIn.ensurePersonas, {});
    await signInAs(f.t, "coach");
    const as = f.t.withIdentity({ subject: await sessionFor(f.t, "coach") });
    expect(await as.query(api.app.viewer, {})).toMatchObject({ status: "active" });
    vi.stubEnv("DEVELOPER_SIGN_IN_ENABLED", "false");
    expect(await as.query(api.app.viewer, {})).toMatchObject({ status: "pending", user: null });
    await expect(as.query(api.accounts.workspace, { role: "coach", paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("not available");
  });
});
