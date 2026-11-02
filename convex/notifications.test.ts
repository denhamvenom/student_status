/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { internal } from "./_generated/api";
import { notifyUsers } from "./lib/notify";

const modules = import.meta.glob("./**/*.ts");
// Wed 2026-01-14 10:00 CST (quiet) and 16:00 CST (not quiet).
const QUIET_NOW = Date.parse("2026-01-14T16:00:00Z");
const OPEN_NOW = Date.parse("2026-01-14T22:00:00Z");
const QUIET_END = Date.parse("2026-01-14T22:00:00Z");

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const aAuth = await ctx.db.insert("users", { email: "a@example.invalid" });
    const bAuth = await ctx.db.insert("users", { email: "b@example.invalid" });
    const a = await ctx.db.insert("appUsers", { authUserId: aAuth, email: "a@example.invalid", name: "A", role: "parent", travelLead: false, financialEdit: false, active: true });
    const b = await ctx.db.insert("appUsers", { authUserId: bAuth, email: "b@example.invalid", name: "B", role: "student", travelLead: false, financialEdit: false, active: true });
    return { aAuth, bAuth, a, b };
  });
  const as = (auth: typeof ids.aAuth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, a: as(ids.aAuth), b: as(ids.bAuth) };
}
const sub = (endpoint: string) => ({ endpoint, p256dh: "key", auth: "auth", deviceLabel: "Phone" });
const base = { title: "Hello", body: "World", url: "/events", category: "events" as const };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("notifyUsers", () => {
  it("inserts one inbox row per distinct user and pushes immediately outside quiet hours", async () => {
    vi.setSystemTime(OPEN_NOW);
    const f = await fixture();
    const created = await f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a, f.ids.a, f.ids.b] }));
    expect(created).toHaveLength(2);
    const rows = await f.t.run(ctx => ctx.db.query("notifications").take(10));
    expect(rows.map(r => r.pushStatus)).toEqual(["pending", "pending"]);
  });

  it("keeps disabled categories in the inbox but skips push", async () => {
    vi.setSystemTime(OPEN_NOW);
    const f = await fixture();
    await f.a.mutation(api.notifications.setCategoryEnabled, { category: "events", enabled: false });
    await f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a] }));
    const rows = await f.t.run(ctx => ctx.db.query("notifications").take(10));
    expect(rows).toHaveLength(1);
    expect(rows[0].pushStatus).toBe("skipped");
  });

  it("defers non-urgent pushes in quiet hours; urgent and schedule bypass", async () => {
    vi.setSystemTime(QUIET_NOW);
    const f = await fixture();
    await f.t.run(async ctx => {
      await notifyUsers(ctx, { ...base, userIds: [f.ids.a] });
      await notifyUsers(ctx, { ...base, userIds: [f.ids.a], urgent: true });
      await notifyUsers(ctx, { ...base, userIds: [f.ids.a], category: "schedule" });
    });
    const rows = await f.t.run(ctx => ctx.db.query("notifications").take(10));
    expect(rows.map(r => r.pushStatus)).toEqual(["deferred", "pending", "pending"]);
    expect(rows[0].deliverAfter).toBe(QUIET_END);
  });

  it("dedupes per user and rejects non-path urls", async () => {
    vi.setSystemTime(OPEN_NOW);
    const f = await fixture();
    await f.t.run(async ctx => {
      await notifyUsers(ctx, { ...base, userIds: [f.ids.a], dedupeKey: "k" });
      await notifyUsers(ctx, { ...base, userIds: [f.ids.a, f.ids.b], dedupeKey: "k" });
    });
    expect(await f.t.run(ctx => ctx.db.query("notifications").take(10))).toHaveLength(2);
    await expect(f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a], url: "https://evil.example" }))).rejects.toThrow();
    await expect(f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a], url: "//evil.example" }))).rejects.toThrow();
  });
});

describe("subscriptions", () => {
  it("only the owner can delete; saving an existing endpoint reassigns it", async () => {
    const f = await fixture();
    await f.a.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/1"));
    await f.b.mutation(api.push.deleteSubscription, { endpoint: "https://fcm.googleapis.com/fcm/send/1" });
    expect(await f.a.query(api.push.listMySubscriptions, {})).toHaveLength(1);
    expect(await f.b.query(api.push.listMySubscriptions, {})).toHaveLength(0);
    await f.b.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/1"));
    expect(await f.a.query(api.push.listMySubscriptions, {})).toHaveLength(0);
    expect(await f.b.query(api.push.listMySubscriptions, {})).toHaveLength(1);
    await f.b.mutation(api.push.deleteSubscription, { endpoint: "https://fcm.googleapis.com/fcm/send/1" });
    expect(await f.b.query(api.push.listMySubscriptions, {})).toHaveLength(0);
  });

  it("rejects endpoints that are not on an allowed push service", async () => {
    const f = await fixture();
    for (const endpoint of ["http://fcm.googleapis.com/1", "https://push.example/1", "https://169.254.169.254/x", "https://fcm.googleapis.com.evil.com/x"]) {
      await expect(f.a.mutation(api.push.saveSubscription, sub(endpoint))).rejects.toThrow();
    }
    expect(await f.a.query(api.push.listMySubscriptions, {})).toHaveLength(0);
  });

  it("deleteSubscriptionById is owner-checked and listings hide the endpoint", async () => {
    const f = await fixture();
    await f.a.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/1"));
    const [row] = await f.a.query(api.push.listMySubscriptions, { currentEndpoint: "https://fcm.googleapis.com/fcm/send/1" });
    expect(row).not.toHaveProperty("endpoint");
    expect(row.isThisDevice).toBe(true);
    await f.b.mutation(api.push.deleteSubscriptionById, { subscriptionId: row._id });
    expect(await f.a.query(api.push.listMySubscriptions, {})).toHaveLength(1);
    await f.a.mutation(api.push.deleteSubscriptionById, { subscriptionId: row._id });
    expect(await f.a.query(api.push.listMySubscriptions, {})).toHaveLength(0);
  });

  it("moving a device onto an account that is at the cap is refused", async () => {
    const f = await fixture();
    for (let i = 0; i < 10; i++) await f.b.mutation(api.push.saveSubscription, sub(`https://fcm.googleapis.com/fcm/send/b${i}`));
    await f.a.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/shared"));
    await expect(f.b.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/shared"))).rejects.toThrow();
    expect(await f.a.query(api.push.listMySubscriptions, {})).toHaveLength(1);
  });

  it("deactivating an account deletes its devices", async () => {
    const f = await fixture();
    const coachAuth = await f.t.run(ctx => ctx.db.insert("users", { email: "c@example.invalid" }));
    await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: coachAuth, email: "c@example.invalid", name: "C", role: "coach", travelLead: false, financialEdit: false, active: true }));
    const mentorAuth = await f.t.run(ctx => ctx.db.insert("users", { email: "m@example.invalid" }));
    const mentor = await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: mentorAuth, email: "m@example.invalid", name: "M", role: "mentor", travelLead: false, financialEdit: false, active: true }));
    const asMentor = f.t.withIdentity({ subject: `${mentorAuth}|session` });
    await asMentor.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/m1"));
    await f.t.withIdentity({ subject: `${coachAuth}|session` }).mutation(api.accounts.updateAdult, { userId: mentor, expectedRevision: 0, role: "mentor", travelLead: false, financialEdit: false, healthExport: false, active: false, reason: "Left the team" });
    expect(await f.t.run(ctx => ctx.db.query("pushSubscriptions").take(5))).toHaveLength(0);
  });

  it("delivery without VAPID configuration marks the notification skipped", async () => {
    vi.setSystemTime(OPEN_NOW);
    const f = await fixture();
    const [id] = await f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a] }));
    await f.t.mutation(internal.push.deliver, { notificationId: id });
    expect((await f.t.run(ctx => ctx.db.get(id)))?.pushStatus).toBe("skipped");
  });
});

describe("stale delivery", () => {
  const deliver = (f: Awaited<ReturnType<typeof fixture>>, notificationId: Id<"notifications">) => f.t.mutation(internal.push.deliver, { notificationId });

  it("skips a deferred push when the category was disabled after deferral", async () => {
    vi.setSystemTime(QUIET_NOW);
    const f = await fixture();
    vi.stubEnv("VAPID_PUBLIC_KEY", "k"); vi.stubEnv("VAPID_PRIVATE_KEY", "k"); vi.stubEnv("VAPID_SUBJECT", "mailto:a@example.invalid");
    await f.a.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/1"));
    const [id] = await f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a] }));
    expect((await f.t.run(ctx => ctx.db.get(id)))?.pushStatus).toBe("deferred");
    await f.a.mutation(api.notifications.setCategoryEnabled, { category: "events", enabled: false });
    await deliver(f, id);
    expect((await f.t.run(ctx => ctx.db.get(id)))?.pushStatus).toBe("skipped");
    vi.unstubAllEnvs();
  });

  it("skips delivery to a user deactivated after the notification was queued, and notifyUsers skips inactive users", async () => {
    vi.setSystemTime(OPEN_NOW);
    const f = await fixture();
    vi.stubEnv("VAPID_PUBLIC_KEY", "k"); vi.stubEnv("VAPID_PRIVATE_KEY", "k"); vi.stubEnv("VAPID_SUBJECT", "mailto:a@example.invalid");
    await f.a.mutation(api.push.saveSubscription, sub("https://fcm.googleapis.com/fcm/send/1"));
    const [id] = await f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a] }));
    await f.t.run(ctx => ctx.db.patch(f.ids.a, { active: false }));
    await deliver(f, id);
    expect((await f.t.run(ctx => ctx.db.get(id)))?.pushStatus).toBe("skipped");
    expect(await f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.a] }))).toHaveLength(0);
    vi.unstubAllEnvs();
  });
});

describe("inbox", () => {
  it("counts unread, enforces markRead ownership, and markAllRead only touches own rows", async () => {
    vi.setSystemTime(OPEN_NOW);
    const f = await fixture();
    const [forA1, forA2] = await f.t.run(async ctx => [...await notifyUsers(ctx, { ...base, userIds: [f.ids.a] }), ...await notifyUsers(ctx, { ...base, userIds: [f.ids.a] })]);
    await f.t.run(ctx => notifyUsers(ctx, { ...base, userIds: [f.ids.b] }));
    expect(await f.a.query(api.notifications.unreadCount, {})).toBe(2);
    await expect(f.b.mutation(api.notifications.markRead, { notificationId: forA1 })).rejects.toThrow();
    await f.a.mutation(api.notifications.markRead, { notificationId: forA1 });
    expect(await f.a.query(api.notifications.unreadCount, {})).toBe(1);
    await f.a.mutation(api.notifications.markAllRead, {});
    expect(await f.a.query(api.notifications.unreadCount, {})).toBe(0);
    expect(await f.b.query(api.notifications.unreadCount, {})).toBe(1);
    const page = await f.a.query(api.notifications.listMine, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map(r => r._id)).toEqual([forA2, forA1]);
  });

  it("preferences list only categories for the viewer's role, and sendTestToMe is rate limited", async () => {
    vi.setSystemTime(OPEN_NOW);
    const f = await fixture();
    const parent = (await f.a.query(api.notifications.getMyPreferences, {})).map(p => p.category);
    const student = (await f.b.query(api.notifications.getMyPreferences, {})).map(p => p.category);
    expect(parent).toContain("money");
    expect(student).not.toContain("money");
    await expect(f.b.mutation(api.notifications.setCategoryEnabled, { category: "money", enabled: false })).rejects.toThrow();
    await f.a.mutation(api.notifications.sendTestToMe, {});
    await expect(f.a.mutation(api.notifications.sendTestToMe, {})).rejects.toThrow();
    expect(await f.a.query(api.notifications.unreadCount, {})).toBe(1);
  });
});

describe("signed-in accounts that cannot use notifications yet", () => {
  // Regression: a signed-in account whose viewer() check fails (no profile, inactive, parent with staff access) crashed the shell via unreadCount.
  it("returns empty values instead of throwing", async () => {
    const f = await fixture();
    const ids = await f.t.run(async ctx => {
      const noProfile = await ctx.db.insert("users", { email: "new@example.invalid" });
      const inactiveAuth = await ctx.db.insert("users", { email: "off@example.invalid" });
      await ctx.db.insert("appUsers", { authUserId: inactiveAuth, email: "off@example.invalid", name: "Off", role: "mentor", travelLead: true, financialEdit: false, active: false });
      const staffAuth = await ctx.db.insert("users", { email: "ps@example.invalid" });
      await ctx.db.insert("appUsers", { authUserId: staffAuth, email: "ps@example.invalid", name: "Parent Staff", role: "parent", parentStaffAccess: "travelLead", travelLead: false, financialEdit: false, active: true });
      return { noProfile, inactiveAuth, staffAuth };
    });
    for (const auth of [ids.noProfile, ids.inactiveAuth]) {
      const who = f.t.withIdentity({ subject: `${auth}|session` });
      expect(await who.query(api.notifications.unreadCount, {})).toBe(0);
      expect(await who.query(api.notifications.getMyPreferences, {})).toEqual([]);
      expect(await who.query(api.push.listMySubscriptions, {})).toEqual([]);
      expect((await who.query(api.notifications.listMine, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);
    }
    const staff = f.t.withIdentity({ subject: `${ids.staffAuth}|session` });
    expect(await staff.query(api.notifications.unreadCount, {})).toBe(0);
    expect(await f.t.query(api.notifications.unreadCount, {})).toBe(0);
  });
});
