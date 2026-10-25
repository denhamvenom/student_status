/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { tokenHash } from "./lib/invitationIdentity";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function configure() {
  vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "synthetic");
  vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "https://example.invalid"); vi.stubEnv("SITE_URL", "https://example.invalid");
}
async function fixture() {
  const t = convexTest(schema, modules); const token = "a".repeat(64); const hash = await tokenHash(token);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const inviteId = await ctx.db.insert("adultInvitations", { email: "adult@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false, tokenHash: hash, status: "pending", createdBy: coach, createdAt: Date.now() - 3600001, expiresAt: Date.now() + 86400000, emailStatus: "queued", emailAttempt: 0 });
    return { auth, coach, inviteId };
  });
  return { t, ids, token, hash, coach: t.withIdentity({ subject: `${ids.auth}|session` }), send: (attempt = 1, value = token) => t.action(internal.adultInviteEmail.send, { inviteId: ids.inviteId, token: value, attempt }) };
}
describe("staff invitation email", () => {
  it("refuses disabled configuration without creating a public token or sending", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "false"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    await expect(f.coach.mutation(api.accounts.inviteAdult, { email: "new@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false })).rejects.toThrow("not configured");
    await expect(f.coach.mutation(api.accounts.resendInvitation, { invitationId: f.ids.inviteId })).rejects.toThrow("not configured");
    await f.send(); expect(fetcher).not.toHaveBeenCalled(); expect(await f.t.run(ctx => ctx.db.get(f.ids.inviteId))).toMatchObject({ emailStatus: "not_sent" });
  });
  it("sends to the invited inbox once with a private link and stable retry idempotency", async () => {
    configure(); const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValue(new Response(JSON.stringify({ id: "synthetic" }))); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    await f.send(); expect(await f.t.run(ctx => ctx.db.get(f.ids.inviteId))).toMatchObject({ emailStatus: "queued", emailAttempt: 1 });
    await f.send(2); await f.send(2); expect(fetcher).toHaveBeenCalledTimes(2);
    const request = fetcher.mock.calls[0][1]; const payload = JSON.parse(request.body); expect(payload.to).toEqual(["adult@example.invalid"]); expect(payload.text).toContain(`/invite-adult#token=${f.token}`); expect(payload.text).toContain("7 days");
    expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe(request.headers["Idempotency-Key"]);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.inviteId))).toMatchObject({ emailStatus: "sent", emailAttempt: 2 });
    const listed = await f.coach.query(api.accounts.invitations, { paginationOpts: { cursor: null, numItems: 10 } }); expect(JSON.stringify(listed)).not.toContain(f.token); expect(listed.page[0]).toMatchObject({ emailStatus: "sent", emailError: null });
  });
  it.each([
    { role: "coach" as const, travelLead: false, title: "Coach" },
    { role: "mentor" as const, travelLead: false, title: "Mentor" },
    { role: "mentor" as const, travelLead: true, title: "Travel Lead" },
  ])("names the $title role being offered in the subject and heading", async ({ role, travelLead, title }) => {
    configure(); const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic" }))); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.inviteId, { role, travelLead }));
    await f.send();
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.subject).toBe(`${title} invitation to Denham Venom Student Status`);
    expect(payload.html).toContain(`<h1>${title} invitation</h1>`);
    expect(payload.html).not.toContain("Mentor/Staff");
  });
  it.each(["revoked", "expired", "issuerInactive", "stale"])("does not send %s invitations", async state => {
    configure(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    await f.t.run(async ctx => { if (state === "revoked") await ctx.db.patch(f.ids.inviteId, { status: "revoked" }); else if (state === "expired") await ctx.db.patch(f.ids.inviteId, { expiresAt: 0 }); else if (state === "issuerInactive") await ctx.db.patch(f.ids.coach, { active: false }); else await ctx.db.patch(f.ids.inviteId, { tokenHash: "new-generation" }); });
    await f.send(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rotates a resend token, applies cooldown and ignores old delivery and stall callbacks", async () => {
    configure(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    const result = await f.coach.mutation(api.accounts.resendInvitation, { invitationId: f.ids.inviteId }); expect(Object.keys(result).sort()).toEqual(["expiresAt", "invitationId"]);
    await f.send(); await f.t.mutation(internal.adultInviteEmail.markStalled, { inviteId: f.ids.inviteId, hash: f.hash });
    expect(fetcher).not.toHaveBeenCalled(); const row = await f.t.run(ctx => ctx.db.get(f.ids.inviteId)); expect(row?.tokenHash).not.toBe(f.hash); expect(row?.emailStatus).toBe("queued");
    await expect(f.coach.mutation(api.accounts.resendInvitation, { invitationId: f.ids.inviteId })).rejects.toThrow("one hour");
    expect(await f.t.mutation(api.accounts.preview, { token: f.token })).toMatchObject({ status: "unavailable" });
    await f.t.mutation(internal.adultInviteEmail.markStalled, { inviteId: f.ids.inviteId, hash: row!.tokenHash }); expect(await f.t.run(ctx => ctx.db.get(f.ids.inviteId))).toMatchObject({ emailStatus: "failed" });
  });
  it("enforces Coach-only controls and per-email cooldown even through create", async () => {
    configure(); const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.inviteId, { emailQueuedAt: Date.now() }));
    await expect(f.coach.mutation(api.accounts.inviteAdult, { email: "ADULT@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false })).rejects.toThrow("one hour");
    await f.coach.mutation(api.accounts.revokeInvitation, { invitationId: f.ids.inviteId });
    await expect(f.coach.mutation(api.accounts.inviteAdult, { email: "adult@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false })).rejects.toThrow("one hour");
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role: "mentor" }));
    await expect(f.coach.mutation(api.accounts.resendInvitation, { invitationId: f.ids.inviteId })).rejects.toThrow("permission");
    await expect(f.coach.query(api.accounts.invitations, { paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("permission");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await f.send(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["accepted", "revoked", "replaced", "expired"])("refuses resend of %s invitations", async state => {
    configure(); const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.inviteId, state === "expired" ? { expiresAt: 0 } : { status: state as "accepted" | "revoked" | "replaced" }));
    await expect(f.coach.mutation(api.accounts.resendInvitation, { invitationId: f.ids.inviteId })).rejects.toThrow("active invitation");
  });
  it("records permanent and exhausted failures without exposing provider details", async () => {
    configure(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status: 400 }))); const f = await fixture(); await f.send();
    expect(await f.t.run(ctx => ctx.db.get(f.ids.inviteId))).toMatchObject({ emailStatus: "failed", emailError: "Email could not be sent. Ask a Coach for help." });
    await f.t.run(ctx => ctx.db.patch(f.ids.inviteId, { emailStatus: "queued", emailAttempt: 2 })); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private"))); await f.send(3); expect(await f.t.run(ctx => ctx.db.get(f.ids.inviteId))).toMatchObject({ emailStatus: "failed", emailAttempt: 3 });
  });
});
