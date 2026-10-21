/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { tokenHash } from "./lib/invitationIdentity";
vi.mock("./lib/parentInviteEmail", () => ({ parentInviteEmailConfiguration: () => ({ apiKey: "synthetic", from: "Synthetic <test@example.invalid>", replyTo: "test@example.invalid", origin: "https://example.invalid" }) }));
const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const inviteAuth = await ctx.db.insert("users", { email: "adult@example.invalid", name: "Invited Adult", emailVerificationTime: 1 });
    const wrongAuth = await ctx.db.insert("users", { email: "wrong@example.invalid", emailVerificationTime: 1 });
    const unverifiedAuth = await ctx.db.insert("users", { email: "adult@example.invalid" });
    for (const [userId, email] of [[inviteAuth, "adult@example.invalid"], [wrongAuth, "wrong@example.invalid"]] as const) await ctx.db.insert("authAccounts", { userId, provider: "google", providerAccountId: email, emailVerified: email });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    return { coachAuth, inviteAuth, wrongAuth, unverifiedAuth, coach };
  });
  const as = (auth: typeof ids.coachAuth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coachAuth), invited: as(ids.inviteAuth), wrong: as(ids.wrongAuth), unverified: as(ids.unverifiedAuth) };
}
const access = { role: "mentor" as const, travelLead: true, financialEdit: false, healthExport: true };
async function createInvite(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await f.coach.mutation(api.accounts.inviteAdult, invite);
  expect(result).not.toHaveProperty("token");
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  const hash = await tokenHash(token);
  await f.t.run(ctx => ctx.db.patch(result.invitationId, { tokenHash: hash }));
  return { ...result, token };
}
const invite = { email: " Adult@Example.Invalid ", ...access };
describe("adult accounts", () => {
  it.each([
    { role: "mentor" as const, active: true, error: "permission" },
    { role: "coach" as const, active: false, error: "inactive" },
  ])("denies $role active=$active adult privilege escalation without writes", async ({ role, active, error }) => {
    const f = await fixture();
    const actorId = await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: f.ids.inviteAuth, email: "adult@example.invalid", name: "Restricted adult", role, active, travelLead: true, financialEdit: true, healthExport: true, accessRevision: 7 }));
    const snapshot = () => f.t.run(async ctx => ({ users: await ctx.db.query("appUsers").take(10), audit: await ctx.db.query("audit").take(10) }));
    const before = await snapshot();
    for (const userId of [actorId, f.ids.coach]) {
      await expect(f.invited.mutation(api.accounts.updateAdult, { userId, expectedRevision: userId === actorId ? 7 : 0, role: "coach", travelLead: true, financialEdit: true, healthExport: true, active: true, reason: "Attempt privilege escalation" })).rejects.toThrow(error);
      expect(await snapshot()).toEqual(before);
    }
  });
  it("records the latest adult archive transition and audit clocks without changing inactive edits", async () => {
    const f = await fixture();
    const userId = await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: f.ids.inviteAuth, email: "mentor@example.invalid", name: "Mentor", role: "mentor", travelLead: true, financialEdit: false, healthExport: true, active: true }));
    const clock = vi.spyOn(Date, "now");
    try {
      const steps = [
        { at: 1000, active: false, prior: null, next: 1000, reason: "Archive adult" },
        { at: 2000, active: true, prior: 1000, next: 1000, reason: "Reactivate adult" },
        { at: 3000, active: false, prior: 1000, next: 3000, reason: "Archive adult again" },
        { at: 4000, active: false, prior: 3000, next: 3000, reason: "Edit inactive grants" },
      ];
      for (const [revision, step] of steps.entries()) {
        clock.mockReturnValue(step.at);
        await f.coach.mutation(api.accounts.updateAdult, { userId, expectedRevision: revision, ...access, active: step.active, reason: step.reason, ...(revision === 3 ? { healthExport: false } : {}) });
        expect(await f.t.run(ctx => ctx.db.get(userId))).toMatchObject({ active: step.active, archivedAt: step.next, accessRevision: revision + 1 });
      }
      const rows = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "appUsers").eq("entityId", userId)).collect());
      expect(rows).toHaveLength(4);
      for (const [index, row] of rows.entries()) {
        expect(row).toMatchObject({ actorId: f.ids.coach, reason: steps[index].reason, at: steps[index].at });
        expect(JSON.parse(row.beforeJson!)).toMatchObject({ archivedAt: steps[index].prior });
        expect(JSON.parse(row.afterJson!)).toMatchObject({ archivedAt: steps[index].next });
      }
    } finally { clock.mockRestore(); }
  });
  it("accepts only the invited verified Google account, saves grants separately and excludes tokens from lists", async () => {
    const f = await fixture();
    const link = await createInvite(f);
    const stored = await f.t.run(ctx => ctx.db.get(link.invitationId));
    expect(stored?.tokenHash).not.toBe(link.token);
    if (!stored) throw new Error("Invitation fixture missing.");
    expect(stored.expiresAt - stored.createdAt).toBe(7 * 86400000);
    expect(await f.wrong.mutation(api.accounts.preview, { token: link.token })).toMatchObject({ status: "verifiedAccountRequired", email: null });
    await expect(f.unverified.mutation(api.accounts.accept, { token: link.token })).rejects.toThrow("verified Google");
    await expect(f.wrong.mutation(api.accounts.accept, { token: link.token })).rejects.toThrow("verified Google");
    expect(await f.invited.mutation(api.accounts.preview, { token: link.token })).toMatchObject({ status: "valid", email: "adult@example.invalid", ...access });
    const result = await f.invited.mutation(api.accounts.accept, { token: link.token });
    expect(await f.t.run(ctx => ctx.db.get(result.userId))).toMatchObject({ ...access, active: true, accessRevision: 0 });
    await expect(f.invited.mutation(api.accounts.accept, { token: link.token })).rejects.toThrow("unavailable");
    const list = await f.coach.query(api.accounts.invitations, { paginationOpts: { cursor: null, numItems: 10 } });
    expect(JSON.stringify(list)).not.toContain(link.token);
    expect(list.page[0]).not.toHaveProperty("tokenHash");
    const adults = await f.coach.query(api.accounts.workspace, { role: "mentor", paginationOpts: { cursor: null, numItems: 10 } });
    expect(adults.page).toHaveLength(1);
    expect(adults.page[0]).not.toHaveProperty("authUserId");
    await expect(f.invited.query(api.accounts.workspace, { role: "coach", paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("permission");
  });

  it("rejects replaced, revoked, expired invitations and invitations from removed Coaches", async () => {
    const f = await fixture();
    const first = await createInvite(f);
    await f.t.run(ctx => ctx.db.patch(first.invitationId, { emailQueuedAt: 0, createdAt: 0 }));
    const second = await createInvite(f);
    await expect(f.invited.mutation(api.accounts.accept, { token: first.token })).rejects.toThrow("unavailable");
    await f.coach.mutation(api.accounts.revokeInvitation, { invitationId: second.invitationId });
    await expect(f.invited.mutation(api.accounts.accept, { token: second.token })).rejects.toThrow("unavailable");
    await f.t.run(ctx => ctx.db.patch(second.invitationId, { emailQueuedAt: 0, createdAt: 0 }));
    const expired = await createInvite(f);
    await f.t.run(ctx => ctx.db.patch(expired.invitationId, { expiresAt: 0, emailQueuedAt: 0, createdAt: 0 }));
    await expect(f.invited.mutation(api.accounts.accept, { token: expired.token })).rejects.toThrow("expired");
    const removed = await createInvite(f);
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: false }));
    await expect(f.invited.mutation(api.accounts.accept, { token: removed.token })).rejects.toThrow("Inviting Coach");
    expect(await f.invited.mutation(api.accounts.preview, { token: removed.token })).toMatchObject({ status: "unavailable", email: null });
  });

  it("protects the last Coach and stale grants, and revokes access immediately", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(api.accounts.updateAdult, { userId: f.ids.coach, expectedRevision: 0, ...access, active: true, reason: "Change" })).rejects.toThrow("last active Coach");
    const link = await createInvite(f);
    const adult = await f.invited.mutation(api.accounts.accept, { token: link.token });
    await f.coach.mutation(api.accounts.updateAdult, { userId: adult.userId, expectedRevision: 0, ...access, healthExport: false, financialEdit: true, active: true, reason: "Finance only" });
    await expect(f.coach.mutation(api.accounts.updateAdult, { userId: adult.userId, expectedRevision: 0, ...access, active: true, reason: "Stale" })).rejects.toThrow("Account changed");
    expect(await f.t.run(ctx => ctx.db.get(adult.userId))).toMatchObject({ healthExport: false, financialEdit: true, accessRevision: 1 });
    await f.coach.mutation(api.accounts.updateAdult, { userId: adult.userId, expectedRevision: 1, ...access, active: false, reason: "Removed access" });
    await expect(f.invited.query(api.accounts.invitations, { paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("inactive");
    expect(await f.t.run(ctx => ctx.db.get(adult.userId))).toHaveProperty("archivedAt");
    await expect(f.coach.mutation(api.accounts.inviteAdult, { ...invite, travelLead: false })).rejects.toThrow("require Travel Lead");
  });

  it("refuses to convert or overwrite a parent account through invitation acceptance", async () => {
    const f = await fixture();
    const link = await createInvite(f);
    const parent = await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: f.ids.inviteAuth, email: "adult@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false }));
    await expect(f.invited.mutation(api.accounts.accept, { token: link.token })).rejects.toThrow("another role");
    await expect(f.coach.mutation(api.accounts.updateAdult, { userId: parent, expectedRevision: 0, ...access, active: true, reason: "Convert" })).rejects.toThrow("cannot be converted");
    expect(await f.t.run(ctx => ctx.db.get(parent))).toMatchObject({ role: "parent", financialEdit: false });
  });
});
