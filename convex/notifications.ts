import { RateLimiter } from "@convex-dev/rate-limiter";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { viewer as requireViewer } from "./lib/access";
import { categoriesForUser, NOTIFICATION_CATEGORY_INFO, notificationCategoryValidator } from "./lib/notificationCategories";
import { notifyUsers, viewerOrNull } from "./lib/notify";

const MARK_ALL_BATCH = 200;
const UNREAD_CAP = 99;
const MAX_PAGE = 50;
const RETENTION_MS = 120 * 24 * 60 * 60 * 1000;
const PURGE_BATCH = 200;

const testLimiter = new RateLimiter(components.rateLimiter, {
  notificationTest: { kind: "fixed window", rate: 1, period: 60_000 },
});

const notificationView = v.object({ _id: v.id("notifications"), title: v.string(), body: v.string(), url: v.string(), category: notificationCategoryValidator, urgent: v.boolean(), createdAt: v.number(), readAt: v.union(v.number(), v.null()),
  /** When the event this notice links to ends (null when it links elsewhere; 0 when the event no longer exists, so it counts as past); the Inbox files notices for past events under Older. */
  eventEndsAt: v.union(v.number(), v.null()) });

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(notificationView),
  handler: async (ctx, args) => {
    const user = await viewerOrNull(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: "" };
    const paginationOpts = { ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, MAX_PAGE) };
    const result = await ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", user._id)).order("desc").paginate(paginationOpts);
    const page = [];
    for (const row of result.page) {
      const eventId = row.url.startsWith("/events/") ? ctx.db.normalizeId("events", row.url.slice("/events/".length).split(/[/?#]/)[0]) : null;
      const event = eventId ? await ctx.db.get(eventId) : null;
      page.push({ _id: row._id, title: row.title, body: row.body, url: row.url, category: row.category, urgent: row.urgent, createdAt: row.createdAt, readAt: row.readAt ?? null, eventEndsAt: eventId ? (event ? event.endsAt : 0) : null });
    }
    return { ...result, page };
  },
});

/** Capped at 99; the UI shows "99+" when it reaches the cap. */
export const unreadCount = query({
  args: {}, returns: v.number(),
  handler: async ctx => {
    const user = await viewerOrNull(ctx);
    if (!user) return 0;
    const rows = await ctx.db.query("notifications").withIndex("by_userId_and_readAt", q => q.eq("userId", user._id).eq("readAt", undefined)).take(UNREAD_CAP);
    return rows.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== user._id) throw new ConvexError("This notification was not found.");
    if (notification.readAt === undefined) await ctx.db.patch(notification._id, { readAt: Date.now() });
    return null;
  },
});

/** Marks up to one batch as read; `more` means call again. */
export const markAllRead = mutation({
  args: {}, returns: v.object({ marked: v.number(), more: v.boolean() }),
  handler: async ctx => {
    const user = await requireViewer(ctx);
    const rows = await ctx.db.query("notifications").withIndex("by_userId_and_readAt", q => q.eq("userId", user._id).eq("readAt", undefined)).take(MARK_ALL_BATCH);
    const now = Date.now();
    for (const row of rows) await ctx.db.patch(row._id, { readAt: now });
    return { marked: rows.length, more: rows.length === MARK_ALL_BATCH };
  },
});

export const getMyPreferences = query({
  args: {},
  // includesMentorMeetings: kept for compatibility and now always false. Mentor meeting updates (M4/M5) have their own
  // Mentor-only "mentorEvents" row ("Meetings and events"), listed only for Mentors and Parents with Mentor staff access.
  returns: v.array(v.object({ category: notificationCategoryValidator, label: v.string(), description: v.string(), urgentByDefault: v.boolean(), enabled: v.boolean(), includesMentorMeetings: v.boolean() })),
  handler: async ctx => {
    const user = await viewerOrNull(ctx);
    if (!user) return [];
    // The stored row, not the session's operating role: push delivery reads the same row (see categoriesForUser).
    const stored = await ctx.db.get(user._id);
    if (!stored) return [];
    const prefs = await ctx.db.query("notificationPreferences").withIndex("by_userId", q => q.eq("userId", user._id)).unique();
    const disabled = new Set(prefs?.disabledCategories ?? []);
    return categoriesForUser(stored).map(category => ({ category, label: NOTIFICATION_CATEGORY_INFO[category].label, description: NOTIFICATION_CATEGORY_INFO[category].description, urgentByDefault: NOTIFICATION_CATEGORY_INFO[category].urgentByDefault, enabled: !disabled.has(category), includesMentorMeetings: false }));
  },
});

export const setCategoryEnabled = mutation({
  args: { category: notificationCategoryValidator, enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const stored = await ctx.db.get(user._id);
    if (!stored || !categoriesForUser(stored).includes(args.category)) throw new ConvexError("This notification type does not apply to your account.");
    const prefs = await ctx.db.query("notificationPreferences").withIndex("by_userId", q => q.eq("userId", user._id)).unique();
    const rest = (prefs?.disabledCategories ?? []).filter(category => category !== args.category);
    const disabledCategories = args.enabled ? rest : [...rest, args.category];
    if (prefs) await ctx.db.patch(prefs._id, { disabledCategories, updatedAt: Date.now() });
    else await ctx.db.insert("notificationPreferences", { userId: user._id, disabledCategories, updatedAt: Date.now() });
    return null;
  },
});

/** Sends the signed-in user a test notification, once a minute, so they can check their device. */
export const sendTestToMe = mutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const user = await requireViewer(ctx);
    const { ok } = await testLimiter.limit(ctx, "notificationTest", { key: user._id });
    if (!ok) throw new ConvexError("A test notification was just sent. Wait a minute and try again.");
    await notifyUsers(ctx, { userIds: [user._id], title: "Test notification", body: "Notifications are working on this device.", url: "/", category: "announcements", urgent: true });
    return null;
  },
});

/** Continuation for notifyUsers when an audience is larger than one batch. */
export const notifyBatch = internalMutation({
  args: { userIds: v.array(v.id("appUsers")), title: v.string(), body: v.string(), url: v.string(), category: notificationCategoryValidator, urgent: v.optional(v.boolean()), dedupeKey: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await notifyUsers(ctx, args);
    return null;
  },
});

/** Daily retention sweep: deletes notifications older than 120 days in bounded batches, rescheduling itself while more remain. */
export const purgeOld = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const old = await ctx.db.query("notifications").withIndex("by_creation_time", q => q.lt("_creationTime", Date.now() - RETENTION_MS)).take(PURGE_BATCH);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.notifications.purgeOld, {});
    return null;
  },
});
