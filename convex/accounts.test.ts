/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
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
const invite = { email: " Adult@Example.Invalid ", ...access };
describe("adult accounts", () => {
  it("accepts only the invited verified Google account, saves grants separately and excludes tokens from lists", async () => {
    const f = await fixture();
    const link = await f.coach.mutation(api.accounts.inviteAdult, invite);
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
    const first = await f.coach.mutation(api.accounts.inviteAdult, invite);
    const second = await f.coach.mutation(api.accounts.inviteAdult, invite);
    await expect(f.invited.mutation(api.accounts.accept, { token: first.token })).rejects.toThrow("unavailable");
    await f.coach.mutation(api.accounts.revokeInvitation, { invitationId: second.invitationId });
    await expect(f.invited.mutation(api.accounts.accept, { token: second.token })).rejects.toThrow("unavailable");
    const expired = await f.coach.mutation(api.accounts.inviteAdult, invite);
    await f.t.run(ctx => ctx.db.patch(expired.invitationId, { expiresAt: 0 }));
    await expect(f.invited.mutation(api.accounts.accept, { token: expired.token })).rejects.toThrow("expired");
    const removed = await f.coach.mutation(api.accounts.inviteAdult, invite);
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: false }));
    await expect(f.invited.mutation(api.accounts.accept, { token: removed.token })).rejects.toThrow("Inviting Coach");
    expect(await f.invited.mutation(api.accounts.preview, { token: removed.token })).toMatchObject({ status: "unavailable", email: null });
  });

  it("protects the last Coach and stale grants, and revokes access immediately", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(api.accounts.updateAdult, { userId: f.ids.coach, expectedRevision: 0, ...access, active: true, reason: "Change" })).rejects.toThrow("last active Coach");
    const link = await f.coach.mutation(api.accounts.inviteAdult, invite);
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
    const link = await f.coach.mutation(api.accounts.inviteAdult, invite);
    const parent = await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: f.ids.inviteAuth, email: "adult@example.invalid", name: "Parent", role: "parent", active: true, travelLead: false, financialEdit: false }));
    await expect(f.invited.mutation(api.accounts.accept, { token: link.token })).rejects.toThrow("another role");
    await expect(f.coach.mutation(api.accounts.updateAdult, { userId: parent, expectedRevision: 0, ...access, active: true, reason: "Convert" })).rejects.toThrow("cannot be converted");
    expect(await f.t.run(ctx => ctx.db.get(parent))).toMatchObject({ role: "parent", financialEdit: false });
  });
});
