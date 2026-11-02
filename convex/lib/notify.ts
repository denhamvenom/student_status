import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { viewer, type AppUser } from "./access";
import { NOTIFICATION_CATEGORY_INFO, type NotificationCategory } from "./notificationCategories";
import { isQuietHours, nextQuietHoursEnd } from "./quietHours";

/**
 * Notification titles and bodies reach lock screens and third-party push services, and stay in the inbox.
 * Never put dollar amounts, medical or allergy information, rooming details, or other students' names in them.
 * Use generic text ("A payment is due", "Rooming was updated") and a `url` deep link to the signed-in page.
 */
export const MAX_TITLE = 120;
export const MAX_BODY = 500;
const MAX_BATCH = 1000;
const MAX_SUBSCRIPTIONS = 50;

export type NotifyArgs = {
  userIds: Id<"appUsers">[];
  title: string;
  body: string;
  url: string;
  category: NotificationCategory;
  urgent?: boolean;
  /** Skips users who already received a notification with this key. */
  dedupeKey?: string;
};

/** Inbox row for every user (the inbox is the record); push is scheduled unless disabled or deferred. */
export async function notifyUsers(ctx: MutationCtx, args: NotifyArgs): Promise<Id<"notifications">[]> {
  if (!args.url.startsWith("/") || args.url.startsWith("//") || args.url.includes("\\")) throw new ConvexError("Notification links must be paths inside the app.");
  const title = args.title.trim().slice(0, MAX_TITLE);
  const body = args.body.trim().slice(0, MAX_BODY);
  if (!title) throw new ConvexError("A notification needs a title.");
  const urgent = args.urgent ?? NOTIFICATION_CATEGORY_INFO[args.category].urgentByDefault;
  const allUserIds = [...new Set(args.userIds)];
  const userIds = allUserIds.slice(0, MAX_BATCH);
  if (allUserIds.length > MAX_BATCH) await ctx.scheduler.runAfter(0, internal.notifications.notifyBatch, { ...args, urgent, userIds: allUserIds.slice(MAX_BATCH) });
  const now = Date.now();
  const quiet = !urgent && isQuietHours(now);
  const created: Id<"notifications">[] = [];
  for (const userId of userIds) {
    const recipient = await ctx.db.get(userId);
    if (!recipient?.active) continue;
    const dedupeKey = args.dedupeKey === undefined ? undefined : `${userId}:${args.dedupeKey}`;
    if (dedupeKey && await ctx.db.query("notifications").withIndex("by_dedupeKey", q => q.eq("dedupeKey", dedupeKey)).first()) continue;
    const prefs = await ctx.db.query("notificationPreferences").withIndex("by_userId", q => q.eq("userId", userId)).unique();
    const disabled = prefs?.disabledCategories.includes(args.category) ?? false;
    const deliverAfter = !disabled && quiet ? nextQuietHoursEnd(now) : undefined;
    const notificationId = await ctx.db.insert("notifications", {
      userId, title, body, url: args.url, category: args.category, urgent, createdAt: now, dedupeKey,
      pushStatus: disabled ? "skipped" : deliverAfter !== undefined ? "deferred" : "pending",
      ...(deliverAfter !== undefined ? { deliverAfter } : {}),
    });
    created.push(notificationId);
    if (disabled) continue;
    if (deliverAfter !== undefined) await ctx.scheduler.runAt(deliverAfter, internal.push.deliver, { notificationId });
    else await ctx.scheduler.runAfter(0, internal.push.deliver, { notificationId });
  }
  return created;
}

/** Removes every push device for a user, e.g. when the account is deactivated or changes role. */
export async function deleteUserPushSubscriptions(ctx: MutationCtx, userId: Id<"appUsers">): Promise<void> {
  for (;;) {
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_userId", q => q.eq("userId", userId)).take(MAX_SUBSCRIPTIONS);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length < MAX_SUBSCRIPTIONS) return;
  }
}

type Ctx = QueryCtx | MutationCtx;

export async function studentUserIds(ctx: Ctx, studentIds: Id<"students">[]): Promise<Id<"appUsers">[]> {
  const ids = new Set<Id<"appUsers">>();
  for (const studentId of new Set(studentIds)) {
    const student = await ctx.db.get(studentId);
    if (!student?.active || !student.userId) continue;
    const user = await ctx.db.get(student.userId);
    if (user?.active && user.role === "student") ids.add(user._id);
  }
  return [...ids];
}

/** Active Parent accounts with an active link this season, as in studentHome's parentLinked. */
export async function parentUserIdsForStudents(ctx: Ctx, studentIds: Id<"students">[]): Promise<Id<"appUsers">[]> {
  const ids = new Set<Id<"appUsers">>();
  for (const studentId of new Set(studentIds)) {
    const student = await ctx.db.get(studentId);
    if (!student?.active) continue;
    const links = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", studentId)).take(20);
    for (const link of links) {
      // TODO(family-link migration): drop the `seasonId === undefined` allowance once every familyLinks row carries a seasonId.
      if (!link.active || link.seasonId !== undefined && link.seasonId !== student.seasonId) continue;
      const parent = await ctx.db.get(link.parentUserId);
      if (parent?.active && parent.role === "parent") ids.add(parent._id);
    }
  }
  return [...ids];
}

/** Active Coaches, Travel Lead Mentors, and Parents whose staff access is Travel Lead. */
export async function coachAndTravelLeadUserIds(ctx: Ctx): Promise<Id<"appUsers">[]> {
  const ids: Id<"appUsers">[] = [];
  for await (const user of ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "coach"))) if (user.active) ids.push(user._id);
  for await (const user of ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor"))) if (user.active && user.travelLead) ids.push(user._id);
  for await (const user of ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", "travelLead"))) if (user.active && user.role === "parent") ids.push(user._id);
  return ids;
}

/** For read-only notification queries: the signed-in account, or null when it cannot use notifications yet (no profile, inactive, mid-setup, wrong sign-in type). Other errors still throw. */
export async function viewerOrNull(ctx: QueryCtx): Promise<AppUser | null> {
  try {
    return await viewer(ctx);
  } catch (error) {
    if (error instanceof ConvexError) return null;
    throw error;
  }
}
