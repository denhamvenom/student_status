/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest as convexTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { tokenHash } from "./lib/invitationIdentity";
import { exportPKCS8, generateKeyPair } from "jose";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules); rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid", emailVerificationTime: 1 });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    await ctx.db.insert("authAccounts", { userId: auth, provider: "google", providerAccountId: "coach", emailVerified: "coach@example.invalid" });
    const invitation = await ctx.db.insert("adultInvitations", { email: "adult@example.invalid", role: "mentor", travelLead: true, financialEdit: false, healthExport: false, tokenHash: await tokenHash("a".repeat(64)), status: "pending", createdBy: coach, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    return { auth, coach, invitation };
  });
  const prepare = (email: string, adultInviteToken?: string) => t.mutation(internal.parentEmailAuth.prepareCode, { email, code: "123456", nonce: "b".repeat(64), adultInviteToken });
  const consume = (email: string) => t.mutation(internal.parentEmailAuth.consumeCode, { email, code: "123456" });
  return { t, ids, prepare, consume };
}
describe("adult email authentication", () => {
  it.each(["coach", "mentor"] as const)("creates a real Auth session on the existing Google %s identity without assigning parent access", async role => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(keys.privateKey)); vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
    const f = await fixture();
    if (role === "mentor") await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role: "mentor", travelLead: true }));
    expect(await f.prepare("coach@example.invalid")).toBe(true);
    const result = await f.t.action(api.auth.signIn, { provider: "parentEmail", params: { kind: "otp", email: "coach@example.invalid", code: "123456" } });
    expect(result.tokens?.token).toBeTruthy(); expect(result.tokens?.refreshToken).toBeTruthy();
    const session = await f.t.run(ctx => ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", f.ids.auth)).first());
    expect(session?.userId).toBe(f.ids.auth);
    expect(await f.t.run(ctx => ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", f.ids.auth)).unique())).toBeNull();
    const signedIn = f.t.withIdentity({ subject: `${f.ids.auth}|${session!._id}` });
    if (role === "coach") expect((await signedIn.query(api.accounts.workspace, { role, paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(1);
    else await expect(signedIn.query(api.accounts.workspace, { role, paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("permission");
    expect(await f.consume("coach@example.invalid")).toBeNull();
  });
  it.each([false, true])("requires a valid adult invitation and preserves grants (existing Google identity: %s)", async existingGoogle => {
    const f = await fixture();
    const existingId = existingGoogle ? await f.t.run(async ctx => {
      const id = await ctx.db.insert("users", { email: "adult@example.invalid", emailVerificationTime: 1 });
      await ctx.db.insert("authAccounts", { userId: id, provider: "google", providerAccountId: "adult", emailVerified: "adult@example.invalid" });
      return id;
    }) : null; expect(await f.prepare("adult@example.invalid")).toBe(false);
    expect(await f.prepare("adult@example.invalid", "a".repeat(64))).toBe(true);
    const userId = await f.consume("adult@example.invalid"); expect(userId).toBeTruthy();
    if (existingId) expect(userId).toBe(existingId);
    const as = f.t.withIdentity({ subject: `${userId}|session` });
    expect((await as.mutation(api.accounts.preview, { token: "a".repeat(64) })).status).toBe("valid");
    await expect(as.mutation(api.app.requestJoin, { code: "FAKE", firstName: "Adult", lastName: "Synthetic" })).rejects.toThrow("Google");
    const accepted = await as.mutation(api.accounts.accept, { token: "a".repeat(64) });
    expect(await f.t.run(ctx => ctx.db.get(accepted.userId))).toMatchObject({ role: "mentor", travelLead: true, financialEdit: false, active: true });
  });
  it.each(["pending", "declined", "approved"] as const)("handles %s enrollment history without converting linked student identities", async status => {
    const f = await fixture();
    const history = await f.t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "adult@example.invalid", emailVerificationTime: 1 });
      const seasonId = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "draft", createdBy: f.ids.coach });
      const join = await ctx.db.insert("joinRequests", { authUserId: auth, email: "adult@example.invalid", firstName: "Synthetic", lastName: "Adult", seasonId, status, createdAt: 1 });
      const studentId = await ctx.db.insert("students", { seasonId, legalName: "Synthetic Student", preferredName: "Student", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const batchId = await ctx.db.insert("bulkInviteBatches", { seasonId, createdBy: f.ids.coach, createdAt: 1, idempotencyKey: "synthetic", requestHash: "synthetic", inviteCount: 1, pendingCount: 1, connectedCount: 0, createdCount: 0, linkedCount: 0, skippedCount: 0 });
      const inviteId = await ctx.db.insert("bulkStudentInvites", { batchId, seasonId, studentId, code: "synthetic", codeHash: "synthetic", status: "pending", createdBy: f.ids.coach, createdAt: 1 });
      const bulk = await ctx.db.insert("bulkInviteConnectionRequests", { authUserId: auth, inviteId, codeHash: "synthetic", studentId, seasonId, googleName: "Synthetic Adult", googleEmail: "adult@example.invalid", status, createdAt: 1 });
      return { auth, join, bulk };
    });
    expect(await f.prepare("adult@example.invalid", "a".repeat(64))).toBe(true);
    const auth = await f.consume("adult@example.invalid");
    if (status === "approved") { expect(auth).toBeNull(); return; }
    expect(auth).toBe(history.auth);
    if (status === "pending") {
      const coach = f.t.withIdentity({ subject: `${f.ids.auth}|session` });
      await expect(coach.mutation(api.admin.approveJoin, { requestId: history.join, approve: true })).rejects.toThrow("email code");
      await expect(coach.mutation(api.bulkInvites.decideConnection, { requestId: history.bulk, approve: true })).rejects.toThrow("Email sign-in identities");
      expect(await f.t.run(ctx => ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", history.auth)).unique())).toBeNull();
      expect(await f.t.run(ctx => ctx.db.get(history.join))).toMatchObject({ status: "pending" });
      expect(await f.t.run(ctx => ctx.db.get(history.bulk))).toMatchObject({ status: "pending" });
    }
    const as = f.t.withIdentity({ subject: `${auth}|session` });
    const result = await as.mutation(api.accounts.accept, { token: "a".repeat(64) });
    expect(await f.t.run(ctx => ctx.db.get(result.userId))).toMatchObject({ role: "mentor", travelLead: true });
    expect(await f.t.run(ctx => ctx.db.get(history.join))).toMatchObject({ status: "declined" });
    expect(await f.t.run(ctx => ctx.db.get(history.bulk))).toMatchObject({ status: "declined" });
  });
  it.each(["revoked", "expired", "issuerInactive"])("rechecks %s invitations when consuming a previously issued code", async state => {
    const f = await fixture(); expect(await f.prepare("adult@example.invalid", "a".repeat(64))).toBe(true);
    await f.t.run(async ctx => { if (state === "revoked") await ctx.db.patch(f.ids.invitation, { status: "revoked" }); else if (state === "expired") await ctx.db.patch(f.ids.invitation, { expiresAt: 1 }); else await ctx.db.patch(f.ids.coach, { active: false }); });
    expect(await f.consume("adult@example.invalid")).toBeNull();
  });
  it.each(["student", "inactive", "ambiguous"])("denies %s accounts and rechecks active access after issuing", async state => {
    const f = await fixture();
    if (state === "inactive") { expect(await f.prepare("coach@example.invalid")).toBe(true); await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: false })); expect(await f.consume("coach@example.invalid")).toBeNull(); }
    else { await f.t.run(async ctx => { if (state === "student") await ctx.db.patch(f.ids.coach, { role: "student" }); else await ctx.db.insert("users", { email: "coach@example.invalid", emailVerificationTime: 1 }); }); expect(await f.prepare("coach@example.invalid")).toBe(false); }
  });
});
