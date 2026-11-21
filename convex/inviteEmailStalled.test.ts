/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";
import { tokenHash } from "./lib/invitationIdentity";

// A delivered email must not stay labelled "failed" because the 20-minute stall mark landed first.
const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function configure() {
  vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "synthetic");
  vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "https://example.invalid"); vi.stubEnv("SITE_URL", "https://example.invalid");
}
const token = "b".repeat(64);
const ok = () => new Response(JSON.stringify({ id: "synthetic" }));

async function adultFixture() {
  const t = convexTest(schema, modules); const hash = await tokenHash(token);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const inviteId = await ctx.db.insert("adultInvitations", { email: "adult@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false, tokenHash: hash, status: "pending", createdBy: coach, createdAt: Date.now(), expiresAt: Date.now() + 86400000, emailStatus: "queued", emailAttempt: 0 });
    return { inviteId };
  });
  const row = () => t.run(ctx => ctx.db.get(ids.inviteId));
  return { t, ids, hash, row };
}

async function parentFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic Student", email: "student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
    const inviteId = await ctx.db.insert("parentInvitations", { studentId: student, parentEmail: "parent@example.invalid", tokenHash: await tokenHash(token), status: "pending", emailStatus: "queued", createdBy: coach, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    return { inviteId };
  });
  const row = () => t.run(ctx => ctx.db.get(ids.inviteId));
  return { t, ids, row };
}

async function adminFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const requestId = await ctx.db.insert("adminContactRequests", { requestedBy: coach, topic: "tooManyEvents", createdAt: Date.now(), emailStatus: "queued", emailAttempt: 0 });
    return { requestId };
  });
  const row = () => t.run(ctx => ctx.db.get(ids.requestId));
  return { t, ids, row };
}

describe("adult invitation email stall mark", () => {
  it("lets a delivery confirmed after the stall mark correct failed to sent", async () => {
    configure(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok())); const f = await adultFixture();
    // Attempt 1 is in flight: prepareSend ran, Resend call not yet confirmed.
    await f.t.mutation(internal.adultInviteEmail.prepareSend, { inviteId: f.ids.inviteId, hash: f.hash, attempt: 1 });
    await f.t.mutation(internal.adultInviteEmail.markStalled, { inviteId: f.ids.inviteId, hash: f.hash });
    expect(await f.row()).toMatchObject({ emailStatus: "failed" });
    await f.t.mutation(internal.adultInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "sent" });
    expect(await f.row()).toMatchObject({ emailStatus: "sent" }); expect((await f.row())?.emailError).toBeUndefined();
  });
  it("does not let the stall mark override an outcome already reached", async () => {
    const f = await adultFixture();
    await f.t.mutation(internal.adultInviteEmail.prepareSend, { inviteId: f.ids.inviteId, hash: f.hash, attempt: 1 });
    await f.t.mutation(internal.adultInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "sent" });
    await f.t.mutation(internal.adultInviteEmail.markStalled, { inviteId: f.ids.inviteId, hash: f.hash });
    expect(await f.row()).toMatchObject({ emailStatus: "sent" });
  });
  it("keeps a real failure failed and ignores a stale attempt or a different token", async () => {
    const f = await adultFixture();
    await f.t.mutation(internal.adultInviteEmail.prepareSend, { inviteId: f.ids.inviteId, hash: f.hash, attempt: 1 });
    await f.t.mutation(internal.adultInviteEmail.markStalled, { inviteId: f.ids.inviteId, hash: f.hash });
    // Late sent from an older attempt number, or for a rotated token, must not correct it.
    await f.t.mutation(internal.adultInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 2, outcome: "sent" });
    await f.t.mutation(internal.adultInviteEmail.finishSend, { inviteId: f.ids.inviteId, token: "c".repeat(64), attempt: 1, outcome: "sent" });
    expect(await f.row()).toMatchObject({ emailStatus: "failed" });
    // A late failure never changes the stalled wording or status.
    await f.t.mutation(internal.adultInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "retry" });
    expect(await f.row()).toMatchObject({ emailStatus: "failed" });
  });
  it("does not turn a provider-rejected failure into sent", async () => {
    const f = await adultFixture();
    await f.t.mutation(internal.adultInviteEmail.prepareSend, { inviteId: f.ids.inviteId, hash: f.hash, attempt: 1 });
    await f.t.mutation(internal.adultInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "failed" });
    await f.t.mutation(internal.adultInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "sent" });
    expect(await f.row()).toMatchObject({ emailStatus: "failed", emailError: "Email could not be sent. Ask a Coach for help." });
  });
});

describe("parent invitation email stall mark", () => {
  it("lets a delivery confirmed after the stall mark correct failed to sent", async () => {
    const f = await parentFixture();
    await f.t.mutation(internal.parentInviteEmail.prepareSend, { inviteId: f.ids.inviteId, hash: await tokenHash(token), attempt: 1 });
    await f.t.mutation(internal.parentInviteEmail.markStalled, { inviteId: f.ids.inviteId });
    expect(await f.row()).toMatchObject({ emailStatus: "failed" });
    await f.t.mutation(internal.parentInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "sent" });
    expect(await f.row()).toMatchObject({ emailStatus: "sent" }); expect((await f.row())?.emailError).toBeUndefined();
  });
  it("does not let the stall mark override an outcome already reached or a real failure", async () => {
    const f = await parentFixture();
    await f.t.mutation(internal.parentInviteEmail.prepareSend, { inviteId: f.ids.inviteId, hash: await tokenHash(token), attempt: 1 });
    await f.t.mutation(internal.parentInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "failed" });
    await f.t.mutation(internal.parentInviteEmail.markStalled, { inviteId: f.ids.inviteId });
    await f.t.mutation(internal.parentInviteEmail.finishSend, { inviteId: f.ids.inviteId, token, attempt: 1, outcome: "sent" });
    expect(await f.row()).toMatchObject({ emailStatus: "failed", emailError: "Email could not be sent. Ask a Coach for help." });
  });
});

describe("admin contact email stall mark", () => {
  it("lets a delivery confirmed after the stall mark correct failed to sent for the same attempt only", async () => {
    const f = await adminFixture();
    await f.t.mutation(internal.adminContact.prepareSend, { requestId: f.ids.requestId, attempt: 1 });
    await f.t.mutation(internal.adminContact.markStalled, { requestId: f.ids.requestId });
    expect(await f.row()).toMatchObject({ emailStatus: "failed" });
    await f.t.mutation(internal.adminContact.finishSend, { requestId: f.ids.requestId, attempt: 2, outcome: "sent" });
    expect(await f.row()).toMatchObject({ emailStatus: "failed" });
    await f.t.mutation(internal.adminContact.finishSend, { requestId: f.ids.requestId, attempt: 1, outcome: "sent" });
    expect(await f.row()).toMatchObject({ emailStatus: "sent" });
  });
  it("does not let the stall mark override sent", async () => {
    const f = await adminFixture();
    await f.t.mutation(internal.adminContact.prepareSend, { requestId: f.ids.requestId, attempt: 1 });
    await f.t.mutation(internal.adminContact.finishSend, { requestId: f.ids.requestId, attempt: 1, outcome: "sent" });
    await f.t.mutation(internal.adminContact.markStalled, { requestId: f.ids.requestId });
    expect(await f.row()).toMatchObject({ emailStatus: "sent" });
  });
});
