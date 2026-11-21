/// <reference types="vite/client" />
// Invite links must not sit raw in _scheduled_functions args. With INVITE_TOKEN_SECRET set the email job
// carries only the invite id + token hash and re-derives the link; without it the old behaviour stays.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { tokenHash } from "./lib/invitationIdentity";
import { deriveInviteToken } from "./lib/inviteToken";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "synthetic-invite-token-secret-0123456789abcdef";
const HOUR = 60 * 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "synthetic");
  vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "https://example.invalid"); vi.stubEnv("SITE_URL", "https://example.invalid");
  vi.stubEnv("INVITE_TOKEN_SECRET", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

async function fixture() {
  const t = createTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const adultAuth = await ctx.db.insert("users", { email: "adult@example.invalid", name: "Invited Adult", emailVerificationTime: 1 });
    const studentAuth = await ctx.db.insert("users", { email: "student@example.invalid", name: "Student" });
    const parentAuth = await ctx.db.insert("users", { email: "parent@example.invalid", name: "Parent", emailVerificationTime: 1 });
    for (const [userId, email] of [[adultAuth, "adult@example.invalid"], [parentAuth, "parent@example.invalid"]] as const) await ctx.db.insert("authAccounts", { userId, provider: "google", providerAccountId: email, emailVerified: email });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", travelLead: false, financialEdit: true, active: true });
    const studentUser = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT-1", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser, legalName: "Synthetic Student", preferredName: "Student", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await ctx.db.insert("familyLinkSeasonBackfill", { key: "team", state: "complete", phase: "verify", cursor: null, scanned: 0, unresolved: 0, updatedAt: 0, generation: 1, startedBy: coach });
    return { coach, student, coachAuth, adultAuth, studentAuth, parentAuth };
  });
  const as = (auth: Id<"users">) => t.withIdentity({ subject: `${auth}|session` });
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "synthetic" })));
  vi.stubGlobal("fetch", fetcher);
  const scheduled = () => t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  // Runs the pending email job exactly as the scheduler would, using only its stored args.
  async function runPendingSend(kind: Kind) {
    const jobs = (await scheduled()).filter(job => job.name.endsWith(`${kind === "adult" ? "adultInviteEmail" : "parentInviteEmail"}:send`) && job.state.kind === "pending");
    const job = jobs.at(-1);
    if (!job) throw new Error("no pending send job");
    await (kind === "adult" ? t.action(internal.adultInviteEmail.send, job.args[0] as never) : t.action(internal.parentInviteEmail.send, job.args[0] as never));
    // convex-test leaves manually-run jobs pending; cancel so the next lookup sees only newer ones.
    await t.run(ctx => ctx.scheduler.cancel(job._id));
    return job.args[0] as Record<string, unknown>;
  }
  const linkToken = (call = -1) => {
    const body = JSON.parse((fetcher.mock.calls.at(call) as unknown as [string, RequestInit])[1].body as string) as { text: string };
    return /#token=([0-9a-f]{64})/.exec(body.text)![1];
  };
  const idempotencyKey = (call: number) => ((fetcher.mock.calls.at(call) as unknown as [string, RequestInit])[1].headers as Record<string, string>)["Idempotency-Key"];
  return { t, ids, fetcher, scheduled, runPendingSend, linkToken, idempotencyKey, coach: as(ids.coachAuth), adult: as(ids.adultAuth), student: as(ids.studentAuth), parent: as(ids.parentAuth) };
}
type Kind = "adult" | "parent";
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function createInvite(f: Fixture, kind: Kind) {
  if (kind === "adult") {
    const { invitationId } = await f.coach.mutation(api.accounts.inviteAdult, { email: "adult@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false });
    return { table: "adultInvitations" as const, id: invitationId as string };
  }
  const { inviteId } = await f.student.mutation(api.parentInvites.createParentInvite, { studentId: f.ids.student, parentEmail: "parent@example.invalid" });
  return { table: "parentInvitations" as const, id: inviteId as string };
}
async function storedRow(f: Fixture, kind: Kind, id: string) {
  return f.t.run(async ctx => (kind === "adult" ? await ctx.db.get(id as Id<"adultInvitations">) : await ctx.db.get(id as Id<"parentInvitations">))!);
}
async function storedHash(f: Fixture, kind: Kind, id: string) {
  return (await storedRow(f, kind, id)).tokenHash;
}
// Everything an inviter or Coach can read about the invite: the list query for that kind, plus audit entries.
async function readableInviteData(f: Fixture, kind: Kind) {
  const list = kind === "adult"
    ? await f.coach.query(api.accounts.invitations, { paginationOpts: { cursor: null, numItems: 10 } })
    : await f.student.query(api.parentInvites.listStudentInvites, { studentId: f.ids.student });
  const audit = await f.t.run(ctx => ctx.db.query("audit").collect());
  return JSON.stringify({ list, audit });
}
async function acceptAs(f: Fixture, kind: Kind, token: string) {
  if (kind === "adult") return f.adult.mutation(api.accounts.accept, { token });
  return f.parent.mutation(api.parentInvites.acceptParentInvite, { token, relationship: "Parent", authorityAttested: true, attestationVersion: "parent-relationship-1" });
}

describe.each<Kind>(["adult", "parent"])("%s invite token at rest", kind => {
  it("without INVITE_TOKEN_SECRET keeps today's behaviour: the raw link token is a scheduler arg", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = await fixture();
    const invite = await createInvite(f, kind);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("INVITE_TOKEN_SECRET"));
    const args = await f.runPendingSend(kind);
    expect(typeof args.token).toBe("string");
    expect(await tokenHash(args.token as string)).toBe(await storedHash(f, kind, invite.id));
    expect(f.linkToken()).toBe(args.token);
    await acceptAs(f, kind, f.linkToken());
  });

  it("with INVITE_TOKEN_SECRET no raw token is scheduled; the emailed link hashes to the stored hash and retries reuse it", async () => {
    vi.stubEnv("INVITE_TOKEN_SECRET", SECRET);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = await fixture();
    f.fetcher.mockResolvedValueOnce(new Response("", { status: 503 }));
    const invite = await createInvite(f, kind);
    const first = await f.runPendingSend(kind);
    expect(first).not.toHaveProperty("token");
    const retry = await f.runPendingSend(kind);
    expect(retry).toMatchObject({ attempt: 2 }); expect(retry).not.toHaveProperty("token");
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    const token = f.linkToken(-1);
    expect(f.linkToken(0)).toBe(token);
    expect(f.idempotencyKey(0)).toBe(f.idempotencyKey(1));
    const row = await storedRow(f, kind, invite.id);
    expect(await tokenHash(token)).toBe(row.tokenHash);
    expect(row.tokenNonce).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(await f.scheduled())).not.toContain(token);
    expect(JSON.stringify(await f.scheduled())).not.toContain(row.tokenNonce);
    expect(await readableInviteData(f, kind)).not.toContain(row.tokenNonce);
    // Even with the secret, the id and times an inviter can see do not rebuild the link without the nonce.
    expect(await deriveInviteToken(SECRET, kind, invite.id, `${row.createdAt}:`)).not.toBe(token);
    expect(warn).not.toHaveBeenCalled();
    await acceptAs(f, kind, token);
    await expect(acceptAs(f, kind, token)).rejects.toThrow("unavailable");
  });

  it("with INVITE_TOKEN_SECRET still accepts an invite created earlier with a random token, and still sends its queued legacy job", async () => {
    vi.stubEnv("INVITE_TOKEN_SECRET", SECRET);
    const f = await fixture();
    const invite = await createInvite(f, kind);
    const legacy = "b".repeat(64);
    await f.t.run(async ctx => {
      // Rows from before this change have a random-token hash and no nonce.
      if (kind === "adult") await ctx.db.patch(invite.id as Id<"adultInvitations">, { tokenHash: await tokenHash(legacy), tokenNonce: undefined });
      else await ctx.db.patch(invite.id as Id<"parentInvitations">, { tokenHash: await tokenHash(legacy), tokenNonce: undefined });
    });
    const send = { inviteId: invite.id, token: legacy, attempt: 1 } as never;
    await (kind === "adult" ? f.t.action(internal.adultInviteEmail.send, send) : f.t.action(internal.parentInviteEmail.send, send));
    expect(f.linkToken()).toBe(legacy);
    await acceptAs(f, kind, legacy);
  });
});

describe("adult resend with INVITE_TOKEN_SECRET", () => {
  it("issues a new link and the old link stops working; an old-issue job cannot send or change the new one", async () => {
    vi.stubEnv("INVITE_TOKEN_SECRET", SECRET);
    const f = await fixture();
    const invite = await createInvite(f, "adult");
    const oldJob = await f.runPendingSend("adult");
    const oldToken = f.linkToken();
    const oldNonce = (await storedRow(f, "adult", invite.id)).tokenNonce;
    vi.setSystemTime(Date.now() + HOUR + 1);
    await f.coach.mutation(api.accounts.resendInvitation, { invitationId: invite.id as Id<"adultInvitations"> });
    await f.runPendingSend("adult");
    const newToken = f.linkToken();
    expect(newToken).not.toBe(oldToken);
    const row = await storedRow(f, "adult", invite.id);
    expect(await tokenHash(newToken)).toBe(row.tokenHash);
    expect(row.tokenNonce).toMatch(/^[0-9a-f]{32}$/); expect(row.tokenNonce).not.toBe(oldNonce);
    // A late retry from the first issue is fenced out by its hash.
    await f.t.action(internal.adultInviteEmail.send, { ...oldJob, attempt: 2 } as never);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    await expect(acceptAs(f, "adult", oldToken)).rejects.toThrow("unavailable");
    await acceptAs(f, "adult", newToken);
  });

  it("fails the email instead of sending a wrong link when the secret changed after queueing", async () => {
    vi.stubEnv("INVITE_TOKEN_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = await fixture();
    const invite = await createInvite(f, "adult");
    vi.stubEnv("INVITE_TOKEN_SECRET", `${SECRET}-rotated`);
    await f.runPendingSend("adult");
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await f.t.run(ctx => ctx.db.get(invite.id as Id<"adultInvitations">))).toMatchObject({ emailStatus: "failed" });
  });
});
