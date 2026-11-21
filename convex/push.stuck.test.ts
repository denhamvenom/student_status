/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { notifyUsers } from "./lib/notify";

const modules = import.meta.glob("./**/*.ts");
const OPEN_NOW = Date.parse("2026-01-14T22:00:00Z");
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/1";

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const authId = await t.run(ctx => ctx.db.insert("users", { email: "a@example.invalid" }));
  const userId = await t.run(ctx => ctx.db.insert("appUsers", { authUserId: authId, email: "a@example.invalid", name: "A", role: "parent", travelLead: false, financialEdit: false, active: true }));
  await t.withIdentity({ subject: `${authId}|session` }).mutation(api.push.saveSubscription, { endpoint: ENDPOINT, p256dh: "key", auth: "auth", deviceLabel: "Phone" });
  const [id] = await t.run(ctx => notifyUsers(ctx, { userIds: [userId], title: "Hello", body: "World", url: "/events", category: "events" }));
  return { t, id };
}
const status = (f: Awaited<ReturnType<typeof fixture>>) => f.t.run(async ctx => (await ctx.db.get(f.id))?.pushStatus);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(OPEN_NOW);
  vi.stubEnv("VAPID_PUBLIC_KEY", "k"); vi.stubEnv("VAPID_PRIVATE_KEY", "k"); vi.stubEnv("VAPID_SUBJECT", "mailto:a@example.invalid");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("push rows that never hear back", () => {
  it("a send that crashes leaves the row pending until the scheduled stuck check marks it failed", async () => {
    const f = await fixture();
    await f.t.mutation(internal.push.deliver, { notificationId: f.id });
    // pushNode.send is scheduled but never reports back (crash/timeout): nothing calls markPushed.
    expect(await status(f)).toBe("pending");
    const jobs = await f.t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").collect()).filter(job => job.name.includes("failIfStuck")));
    expect(jobs).toHaveLength(1);
    await f.t.mutation(internal.push.failIfStuck, { notificationId: f.id });
    expect(await status(f)).toBe("failed");
  });

  it("the stuck check leaves rows that already finished alone", async () => {
    const f = await fixture();
    await f.t.mutation(internal.push.markPushed, { notificationId: f.id, succeededEndpoints: [ENDPOINT] });
    await f.t.mutation(internal.push.failIfStuck, { notificationId: f.id });
    expect(await status(f)).toBe("sent");
  });

  it("a late report does not overwrite skipped", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.id, { pushStatus: "skipped" }));
    await f.t.mutation(internal.push.markPushed, { notificationId: f.id as Id<"notifications">, succeededEndpoints: [ENDPOINT] });
    expect(await status(f)).toBe("skipped");
  });
});
