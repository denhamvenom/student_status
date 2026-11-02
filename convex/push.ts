import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { viewer as requireViewer } from "./lib/access";
import { categoriesForUser } from "./lib/notificationCategories";
import { viewerOrNull } from "./lib/notify";
import { isAllowedPushEndpoint } from "./lib/pushEndpoint";

const MAX_SUBSCRIPTIONS_PER_USER = 10;
const MAX_ENDPOINT = 1000;
const MAX_KEY = 200;
const MAX_LABEL = 80;
const MAX_BADGE = 99;

export function vapidConfigured() {
  return !!(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim() && env.VAPID_SUBJECT?.trim());
}

/** Loads the notification and the owner's devices, then hands the network call to the Node action. */
export const deliver = internalMutation({
  args: { notificationId: v.id("notifications") }, returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || (notification.pushStatus !== "pending" && notification.pushStatus !== "deferred")) return null;
    if (!vapidConfigured()) {
      console.warn("Web Push is not configured (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT); notification stays in the inbox only.");
      await ctx.db.patch(notification._id, { pushStatus: "skipped" });
      return null;
    }
    // The account or its preferences may have changed since this was queued (quiet hours defer up to a day).
    const user = await ctx.db.get(notification.userId);
    const prefs = user ? await ctx.db.query("notificationPreferences").withIndex("by_userId", q => q.eq("userId", user._id)).unique() : null;
    if (!user || !user.active || !categoriesForUser(user).includes(notification.category) || prefs?.disabledCategories.includes(notification.category)) {
      await ctx.db.patch(notification._id, { pushStatus: "skipped" });
      return null;
    }
    const subscriptions = await ctx.db.query("pushSubscriptions").withIndex("by_userId", q => q.eq("userId", notification.userId)).take(MAX_SUBSCRIPTIONS_PER_USER);
    if (!subscriptions.length) {
      await ctx.db.patch(notification._id, { pushStatus: "skipped" });
      return null;
    }
    const unread = await ctx.db.query("notifications").withIndex("by_userId_and_readAt", q => q.eq("userId", notification.userId).eq("readAt", undefined)).take(MAX_BADGE + 1);
    await ctx.scheduler.runAfter(0, internal.pushNode.send, {
      notificationId: notification._id,
      urgent: notification.urgent,
      subscriptions: subscriptions.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })),
      payload: { title: notification.title, body: notification.body, url: notification.url, category: notification.category, tag: `${notification.category}-${notification._id}`, badgeCount: Math.min(unread.length, MAX_BADGE), notificationId: notification._id },
    });
    return null;
  },
});

/**
 * Digest summary push: no new inbox row. `notificationId` is one of the user's digest inbox rows in this category;
 * it carries the push result (sent/failed) and the tap target. Returns false when nothing was scheduled.
 */
export async function scheduleSummaryPush(ctx: MutationCtx, args: { notificationId: Id<"notifications">; title: string; body: string; url: string }): Promise<boolean> {
  const notification = await ctx.db.get(args.notificationId);
  if (!notification) return false;
  const skip = async () => { if (notification.pushStatus === "digest") await ctx.db.patch(notification._id, { pushStatus: "skipped" }); return false; };
  if (!vapidConfigured()) return await skip();
  const user = await ctx.db.get(notification.userId);
  const prefs = user ? await ctx.db.query("notificationPreferences").withIndex("by_userId", q => q.eq("userId", user._id)).unique() : null;
  if (!user || !user.active || !categoriesForUser(user).includes(notification.category) || prefs?.disabledCategories.includes(notification.category)) return await skip();
  const subscriptions = await ctx.db.query("pushSubscriptions").withIndex("by_userId", q => q.eq("userId", user._id)).take(MAX_SUBSCRIPTIONS_PER_USER);
  if (!subscriptions.length) return await skip();
  const unread = await ctx.db.query("notifications").withIndex("by_userId_and_readAt", q => q.eq("userId", user._id).eq("readAt", undefined)).take(MAX_BADGE + 1);
  await ctx.scheduler.runAfter(0, internal.pushNode.send, {
    notificationId: notification._id,
    urgent: false,
    subscriptions: subscriptions.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })),
    payload: { title: args.title, body: args.body, url: args.url, category: notification.category, tag: `${notification.category}-digest`, badgeCount: Math.min(unread.length, MAX_BADGE), notificationId: notification._id },
  });
  return true;
}

export const markPushed = internalMutation({
  args: { notificationId: v.id("notifications"), succeededEndpoints: v.array(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const endpoint of args.succeededEndpoints) {
      const subscription = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", endpoint)).first();
      if (subscription) await ctx.db.patch(subscription._id, { lastSuccessAt: now });
    }
    const notification = await ctx.db.get(args.notificationId);
    if (notification) await ctx.db.patch(notification._id, args.succeededEndpoints.length ? { pushStatus: "sent", pushedAt: now } : { pushStatus: "failed" });
    return null;
  },
});

export const removeSubscriptionByEndpoint = internalMutation({
  args: { endpoint: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).take(10)) await ctx.db.delete(row._id);
    return null;
  },
});

export const getVapidPublicKey = query({
  args: {}, returns: v.union(v.string(), v.null()),
  handler: async ctx => {
    await requireViewer(ctx);
    return vapidConfigured() ? env.VAPID_PUBLIC_KEY!.trim() : null;
  },
});

export const saveSubscription = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string(), deviceLabel: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const endpoint = args.endpoint.trim();
    const deviceLabel = args.deviceLabel.trim().slice(0, MAX_LABEL) || "This device";
    if (!isAllowedPushEndpoint(endpoint) || endpoint.length > MAX_ENDPOINT || !args.p256dh || args.p256dh.length > MAX_KEY || !args.auth || args.auth.length > MAX_KEY) throw new ConvexError("This device sent an invalid notification subscription. Turn notifications off and on again.");
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", endpoint)).first();
    if (existing?.userId === user._id) {
      await ctx.db.patch(existing._id, { p256dh: args.p256dh, auth: args.auth, deviceLabel });
      return null;
    }
    // A new device, or a shared device moving to this account, counts toward this account's cap.
    const mine = await ctx.db.query("pushSubscriptions").withIndex("by_userId", q => q.eq("userId", user._id)).take(MAX_SUBSCRIPTIONS_PER_USER);
    if (mine.length >= MAX_SUBSCRIPTIONS_PER_USER) throw new ConvexError("This account already has the maximum number of notification devices. Remove one in Notification settings first.");
    if (existing) await ctx.db.patch(existing._id, { userId: user._id, p256dh: args.p256dh, auth: args.auth, deviceLabel, createdAt: Date.now(), lastSuccessAt: undefined });
    else await ctx.db.insert("pushSubscriptions", { userId: user._id, endpoint, p256dh: args.p256dh, auth: args.auth, deviceLabel, createdAt: Date.now() });
    return null;
  },
});

export const deleteSubscription = mutation({
  args: { endpoint: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const row = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint.trim())).first();
    if (row && row.userId === user._id) await ctx.db.delete(row._id);
    return null;
  },
});

export const deleteSubscriptionById = mutation({
  args: { subscriptionId: v.id("pushSubscriptions") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const row = await ctx.db.get(args.subscriptionId);
    if (row && row.userId === user._id) await ctx.db.delete(row._id);
    return null;
  },
});

/** `currentEndpoint` only marks which row is this browser; the raw endpoint is never returned. */
export const listMySubscriptions = query({
  args: { currentEndpoint: v.optional(v.string()) },
  returns: v.array(v.object({ _id: v.id("pushSubscriptions"), deviceLabel: v.string(), createdAt: v.number(), lastSuccessAt: v.union(v.number(), v.null()), isThisDevice: v.boolean() })),
  handler: async (ctx, args) => {
    const user = await viewerOrNull(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_userId", q => q.eq("userId", user._id)).take(MAX_SUBSCRIPTIONS_PER_USER);
    return rows.map(row => ({ _id: row._id, deviceLabel: row.deviceLabel, createdAt: row.createdAt, lastSuccessAt: row.lastSuccessAt ?? null, isThisDevice: args.currentEndpoint !== undefined && row.endpoint === args.currentEndpoint }));
  },
});
