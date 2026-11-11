/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function configure() {
  vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "synthetic");
  vi.stubEnv("PARENT_INVITE_APP_ORIGIN", "https://example.invalid"); vi.stubEnv("SITE_URL", "https://example.invalid");
}

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const make = async (email: string, name: string, role: "coach" | "mentor" | "parent" | "student") => {
      const auth = await ctx.db.insert("users", { email });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email, name, role, active: true, travelLead: false, financialEdit: false });
      return { auth, user };
    };
    const coach = await make("coach@example.invalid", "Synthetic Coach", "coach");
    const parent = await make("parent@example.invalid", "Synthetic Parent", "parent");
    const student = await make("student@example.invalid", "Synthetic Student Account", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach.user });
    const row = await ctx.db.insert("students", { seasonId: season, userId: student.user, legalName: "Synthetic Legal", preferredName: "Sam Synthetic", email: "student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "reported", text: "Synthetic peanut allergy" }, medications: { state: "none" } });
    await ctx.db.insert("students", { seasonId: season, legalName: "Other Legal", preferredName: "Other Unlinked", email: "other@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategory: "Girls", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
    await ctx.db.insert("familyLinks", { parentUserId: parent.user, studentId: row, active: true, createdBy: coach.user });
    return { coach, parent, student, row };
  });
  const as = (who: { auth: string }) => t.withIdentity({ subject: `${who.auth}|session` });
  const scheduled = () => t.run(ctx => ctx.db.system.query("_scheduled_functions").take(20));
  return { t, ids, parent: as(ids.parent), student: as(ids.student), coach: as(ids.coach), scheduled };
}

async function sentEmail(f: Awaited<ReturnType<typeof fixture>>) {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic" })));
  vi.stubGlobal("fetch", fetcher);
  const [job] = await f.scheduled();
  await f.t.action(internal.coachContact.deliver, job.args[0] as never);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  return { url, init, payload: JSON.parse(init.body) };
}

describe("Ask a Coach", () => {
  it("refuses a signed-out caller and sends nothing", async () => {
    configure(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const f = await fixture();
    await expect(f.t.mutation(api.coachContact.send, { topic: "money", message: "Hello" })).rejects.toThrow("not signed in");
    expect(await f.scheduled()).toHaveLength(0); expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a Coach, who already has Coach tools", async () => {
    configure(); const f = await fixture();
    await expect(f.coach.mutation(api.coachContact.send, { topic: "money", message: "Hello" })).rejects.toThrow("Coaches and Travel Leads can't use Ask a Coach");
    expect(await f.scheduled()).toHaveLength(0);
  });

  it("refuses a Travel Lead, who already has Coach tools", async () => {
    configure(); const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.parent.user, { role: "mentor", travelLead: true }));
    await expect(f.parent.mutation(api.coachContact.send, { topic: "money", message: "Hello" })).rejects.toThrow("Travel Leads can't use Ask a Coach");
    expect(await f.scheduled()).toHaveLength(0);
  });

  it.each([["empty", "   "], ["too long", "x".repeat(1001)]])("rejects a message that is %s", async (_, message) => {
    configure(); const f = await fixture();
    await expect(f.parent.mutation(api.coachContact.send, { topic: "forms", message })).rejects.toThrow(/Write a message|1000 characters/);
    expect(await f.scheduled()).toHaveLength(0);
  });

  it("rejects an unknown topic", async () => {
    configure(); const f = await fixture();
    await expect(f.parent.mutation(api.coachContact.send, { topic: "everything" as never, message: "Hi" })).rejects.toThrow();
    expect(await f.scheduled()).toHaveLength(0);
  });

  it("emails the fixed Coach address with the sender as reply-to, linked student names and no health data", async () => {
    configure(); const f = await fixture();
    expect(await f.parent.mutation(api.coachContact.send, { topic: "eventsTravel", message: "  Can Sam ride with us?  " })).toEqual({ status: "queued" });
    const { url, init, payload } = await sentEmail(f);
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toMatch(/^coach-contact\//);
    expect(payload.to).toEqual(["coach@team8044.org"]);
    expect(payload.reply_to).toBe("parent@example.invalid");
    expect(payload.subject).toBe("Venom Status: Ask a Coach — Events and travel");
    expect(payload.text).toContain("Synthetic Parent (Parent)");
    expect(payload.text).toContain("parent@example.invalid");
    expect(payload.text).toContain("Students: Sam Synthetic");
    expect(payload.text).toContain("Can Sam ride with us?");
    expect(payload.text).not.toContain("Other Unlinked");
    for (const secret of ["peanut", "allerg", "Synthetic Legal", f.ids.row, "Boys"]) expect(payload.text).not.toContain(secret);
  });

  it("lets a Student send and names only their own student record", async () => {
    configure(); const f = await fixture();
    await f.student.mutation(api.coachContact.send, { topic: "money", message: "Is my fee paid?" });
    const { payload } = await sentEmail(f);
    expect(payload.text).toContain("(Student)");
    expect(payload.text).toContain("Students: Sam Synthetic");
  });

  it("never takes the recipient from the client", async () => {
    configure(); const f = await fixture();
    await expect(f.parent.mutation(api.coachContact.send, { topic: "other", message: "Hi", to: "attacker@example.invalid" } as never)).rejects.toThrow();
    expect(await f.scheduled()).toHaveLength(0);
  });

  it("retries after a temporary email failure with the same idempotency key", async () => {
    configure(); const f = await fixture();
    await f.parent.mutation(api.coachContact.send, { topic: "forms", message: "Hi" });
    const [job] = await f.scheduled();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "synthetic" })));
    vi.stubGlobal("fetch", fetcher);
    await f.t.action(internal.coachContact.deliver, job.args[0] as never);
    const retry = (await f.scheduled()).find(j => (j.args[0] as { attempt: number }).attempt === 2)!;
    expect(retry).toBeDefined();
    await f.t.action(internal.coachContact.deliver, retry.args[0] as never);
    const keys = fetcher.mock.calls.map(([, init]) => init.headers["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
  });

  it.each([["a rejected request", 422, 1], ["retries running out", 500, 3]])("logs %s with the account id and no message or contact details", async (_, status, attempts) => {
    configure(); const f = await fixture();
    await f.parent.mutation(api.coachContact.send, { topic: "forms", message: "Private words about Sam" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("{}", { status })));
    const args = (await f.scheduled())[0].args[0] as object;
    for (let attempt = 1; attempt <= attempts; attempt++) await f.t.action(internal.coachContact.deliver, { ...args, attempt } as never);
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0][0]);
    expect(line).toContain(f.ids.parent.user);
    for (const secret of ["Private words", "parent@example.invalid", "Synthetic Parent", "Sam"]) expect(line).not.toContain(secret);
    error.mockRestore();
  });

  it("says nothing was sent, and schedules nothing, when email isn't set up", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "false"); const f = await fixture();
    expect(await f.parent.mutation(api.coachContact.send, { topic: "money", message: "Hi" })).toEqual({ status: "notSent" });
    expect(await f.scheduled()).toHaveLength(0);
  });

  it("doesn't spend the sender's limit while email isn't set up", async () => {
    vi.stubEnv("PARENT_INVITE_EMAIL_ENABLED", "false"); const f = await fixture();
    for (let i = 0; i < 4; i++) expect(await f.parent.mutation(api.coachContact.send, { topic: "money", message: "Hi" })).toEqual({ status: "notSent" });
    configure();
    expect((await f.parent.mutation(api.coachContact.send, { topic: "money", message: "Now" })).status).toBe("queued");
  });

  it("limits each account to three messages an hour, separately per account", async () => {
    configure(); const f = await fixture();
    for (let i = 0; i < 3; i++) expect((await f.parent.mutation(api.coachContact.send, { topic: "money", message: `Hi ${i}` })).status).toBe("queued");
    expect(await f.parent.mutation(api.coachContact.send, { topic: "money", message: "Again" })).toEqual({ status: "tooManyRequests" });
    expect(await f.scheduled()).toHaveLength(3);
    expect((await f.student.mutation(api.coachContact.send, { topic: "money", message: "Hi" })).status).toBe("queued");
  });
});
