/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { markRoomCategoryReview } from "./lib/profileCorrections";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function configure() {
  vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "synthetic");
  vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "https://example.invalid"); vi.stubEnv("SITE_URL", "https://example.invalid");
}

type Role = "coach" | "mentor" | "parent" | "student";
async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Synthetic Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic Student", email: "student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "reported", text: "Synthetic allergy" }, medications: { state: "none" } });
    return { auth, coach, season, student };
  });
  const coach = t.withIdentity({ subject: `${ids.auth}|session` });
  const scheduled = () => t.run(ctx => ctx.db.system.query("_scheduled_functions").take(20));
  const requests = () => t.run(ctx => ctx.db.query("adminContactRequests").take(20));
  return { t, ids, coach, scheduled, requests };
}

async function caught(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return error; }
  throw new Error("Expected the call to fail.");
}
function topicOf(error: unknown) {
  expect(error).toBeInstanceOf(ConvexError);
  const data = (error as ConvexError<{ message: string; contactAdmin: string }>).data;
  expect(data.message).toMatch(/Use Contact admin to let the administrator know\.$/);
  expect(data.message).not.toContain("Student Status administrator");
  return data.contactAdmin;
}

describe("Contact admin request", () => {
  it.each<[string, (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>]>([
    ["a Mentor", async f => { await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role: "mentor" as Role })); }],
    ["a Parent", async f => { await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role: "parent" as Role })); }],
    ["a Student", async f => { await f.t.run(ctx => ctx.db.patch(f.ids.coach, { role: "student" as Role })); }],
    ["an inactive Coach", async f => { await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: false })); }],
  ])("refuses %s without recording or sending", async (_, setup) => {
    configure(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    await setup(f);
    await expect(f.coach.mutation(api.adminContact.request, { topic: "tooManyCoaches" })).rejects.toThrow(/permission|inactive/);
    expect(await f.requests()).toHaveLength(0); expect(await f.scheduled()).toHaveLength(0); expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    const f = await fixture();
    await expect(f.t.mutation(api.adminContact.request, { topic: "tooManyCoaches" })).rejects.toThrow("not signed in");
  });

  it("records the request and emails the administrator with the Coach as reply-to and no student data", async () => {
    configure(); const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic" }))); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    expect(await f.coach.mutation(api.adminContact.request, { topic: "tooManyEvents", details: "  Room type change for the fall season.  " })).toEqual({ status: "queued" });
    const [row] = await f.requests();
    expect(row).toMatchObject({ requestedBy: f.ids.coach, topic: "tooManyEvents", details: "Room type change for the fall season.", emailStatus: "queued" });
    expect((await f.scheduled()).map(job => job.name)).toEqual(expect.arrayContaining(["adminContact:send"]));

    await f.t.action(internal.adminContact.send, { requestId: row._id, attempt: 1 });
    await f.t.action(internal.adminContact.send, { requestId: row._id, attempt: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe(`admin-contact/${row._id}`);
    const payload = JSON.parse(init.body);
    expect(payload.to).toEqual(["admin@team8044.org"]);
    expect(payload.reply_to).toBe("coach@example.invalid");
    expect(payload.subject).toBe("Venom Status: Coach needs help — Too many events to update rooms for a Room type change");
    expect(payload.text).toContain("Synthetic Coach (Coach)");
    expect(payload.text).toContain("coach@example.invalid");
    expect(payload.text).toContain("Room type change for the fall season.");
    expect(payload.text).toMatch(/Sent: .*20\d\d.* C[SD]T/);
    expect(payload.text).not.toContain("Synthetic Student");
    expect(payload.text).not.toContain(f.ids.student);
    expect(await f.t.run(ctx => ctx.db.get(row._id))).toMatchObject({ emailStatus: "sent" });
  });

  it("records notSent and schedules nothing when email isn't set up", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "false"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    expect(await f.coach.mutation(api.adminContact.request, { topic: "inviteEmailNotConfigured" })).toEqual({ status: "notSent" });
    expect(await f.requests()).toEqual([expect.objectContaining({ topic: "inviteEmailNotConfigured", emailStatus: "notSent" })]);
    expect(await f.scheduled()).toHaveLength(0); expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns tooManyRequests after three requests in an hour", async () => {
    const f = await fixture();
    for (let i = 0; i < 3; i++) expect((await f.coach.mutation(api.adminContact.request, { topic: "tooManyDrivers" })).status).toBe("notSent");
    expect(await f.coach.mutation(api.adminContact.request, { topic: "tooManyDrivers" })).toEqual({ status: "tooManyRequests" });
    expect(await f.requests()).toHaveLength(3);
  });

  it("rejects details over 500 characters", async () => {
    const f = await fixture();
    await expect(f.coach.mutation(api.adminContact.request, { topic: "tooManyDrivers", details: "x".repeat(501) })).rejects.toThrow("500 characters");
    expect(await f.requests()).toHaveLength(0);
  });
});

describe("Coach-only setup errors carry their Contact admin topic", () => {
  it.each<[string, string, (f: Awaited<ReturnType<typeof fixture>>) => Promise<unknown>]>([
    ["inviting an adult without email set up", "inviteEmailNotConfigured", f => f.coach.mutation(api.accounts.inviteAdult, { email: "new@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false })],
    ["resending an invitation without email set up", "inviteEmailNotConfigured", async f => {
      const invitationId = await f.t.run(ctx => ctx.db.insert("adultInvitations", { email: "adult@example.invalid", role: "mentor", travelLead: false, financialEdit: false, healthExport: false, tokenHash: "synthetic", status: "pending", createdBy: f.ids.coach, createdAt: 0, expiresAt: Date.now() + 86400000 }));
      return f.coach.mutation(api.accounts.resendInvitation, { invitationId });
    }],
    ["removing Coach access with too many Coaches", "tooManyCoaches", async f => {
      await f.t.run(async ctx => { for (let i = 0; i < 501; i++) await ctx.db.insert("appUsers", { authUserId: (await ctx.db.insert("users", {})) as Id<"users">, email: `coach${i}@example.invalid`, name: `Coach ${i}`, role: "coach", active: true, travelLead: false, financialEdit: false }); });
      return f.coach.mutation(api.accounts.updateAdult, { userId: f.ids.coach, expectedRevision: 0, role: "mentor", travelLead: false, financialEdit: false, healthExport: false, active: true, reason: "Synthetic change" });
    }],
    ["matching drivers with too many Mentors", "tooManyDrivers", async f => {
      await f.t.run(async ctx => { for (let i = 0; i < 201; i++) await ctx.db.insert("appUsers", { authUserId: (await ctx.db.insert("users", {})) as Id<"users">, email: `mentor${i}@example.invalid`, name: `Mentor ${i}`, role: "mentor", active: true, travelLead: false, financialEdit: false }); });
      return f.coach.query(api.adultProfile.ownerReconciliationCandidates, {});
    }],
    ["a Coach's Room type change with too many events", "tooManyEvents", f => f.t.run(async ctx => { await addEvents(ctx, f.ids.season); await markRoomCategoryReview(ctx, f.ids.student, f.ids.season, true); })],
  ])("%s", async (_, topic, attempt) => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "false"); const f = await fixture();
    expect(topicOf(await caught(attempt(f)))).toBe(topic);
  });

  it("sends Students and Parents to a Coach instead of Contact admin", async () => {
    const f = await fixture();
    const error = await caught(f.t.run(async ctx => { await addEvents(ctx, f.ids.season); await markRoomCategoryReview(ctx, f.ids.student, f.ids.season, false); }));
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<string>).data).toMatch(/Ask a Coach for help\.$/);
  });
});

async function addEvents(ctx: Parameters<Parameters<Awaited<ReturnType<typeof fixture>>["t"]["run"]>[0]>[0], seasonId: Id<"seasons">) {
  for (let i = 0; i < 201; i++) await ctx.db.insert("events", { seasonId, name: `Event ${i}`, type: "Team", startsAt: i, endsAt: i + 1, destination: "School", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "approval", capacity: 1, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
}
