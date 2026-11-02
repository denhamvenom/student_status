import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MAX_BODY, MAX_TITLE, parentUserIdsForStudents } from "./notify";

/**
 * Digest updates: the inbox row is written right away (pushStatus "digest", no push), and one push per category
 * goes out with the daily 5 PM flush (convex/notificationDigest.ts). Same PII rule as notifyUsers: generic text only.
 */
export type DigestCategory = "money" | "travel" | "staff";
export type DigestKind = "payment" | "charge" | "transport" | "withdrawalRequest" | "signupPending" | "joinRequest" | "profileCorrection";

export type QueueDigestArgs = {
  userIds: Id<"appUsers">[];
  category: DigestCategory;
  kind: DigestKind;
  url: string;
  inboxTitle: string;
  inboxBody: string;
  /** Skip a user who already has an unflushed item of this kind and url (e.g. repeated transport edits). */
  coalesce?: boolean;
};

/** Most recipients one queueDigestItem call accepts; callers with larger audiences chunk (see notificationDigest.queueTravel). */
export const MAX_DIGEST_USERS = 500;

export async function queueDigestItem(ctx: MutationCtx, args: QueueDigestArgs): Promise<number> {
  if (!args.url.startsWith("/") || args.url.startsWith("//") || args.url.includes("\\")) throw new ConvexError("Notification links must be paths inside the app.");
  const title = args.inboxTitle.trim().slice(0, MAX_TITLE);
  const body = args.inboxBody.trim().slice(0, MAX_BODY);
  if (!title) throw new ConvexError("A notification needs a title.");
  const userIds = [...new Set(args.userIds)];
  if (userIds.length > MAX_DIGEST_USERS) throw new Error("Digest audience exceeds the safe batch size.");
  const now = Date.now();
  let queued = 0;
  for (const userId of userIds) {
    const user = await ctx.db.get(userId);
    if (!user?.active) continue;
    if (args.coalesce) {
      const open = await ctx.db.query("notificationDigestItems").withIndex("by_userId_and_kind_and_url_and_flushedAt", q => q.eq("userId", userId).eq("kind", args.kind).eq("url", args.url).eq("flushedAt", undefined)).first();
      if (open) continue;
    }
    const prefs = await ctx.db.query("notificationPreferences").withIndex("by_userId", q => q.eq("userId", userId)).unique();
    const disabled = prefs?.disabledCategories.includes(args.category) ?? false;
    const notificationId = await ctx.db.insert("notifications", { userId, title, body, url: args.url, category: args.category, urgent: false, createdAt: now, pushStatus: disabled ? "skipped" : "digest" });
    if (disabled) continue;
    await ctx.db.insert("notificationDigestItems", { userId, category: args.category, kind: args.kind, url: args.url, notificationId, createdAt: now });
    queued++;
  }
  return queued;
}

const MONEY_TEXT = {
  payment: { title: "Payment received", body: "A payment was recorded for your student. Open Money for details." },
  charge: { title: "New charge added", body: "A new charge was added for your student. Open Money for details." },
} as const;

/** D1/D2: queue a Money digest update for the student's linked Parents. */
export async function queueMoneyDigest(ctx: MutationCtx, studentId: Id<"students">, kind: "payment" | "charge"): Promise<void> {
  const userIds = await parentUserIdsForStudents(ctx, [studentId]);
  if (!userIds.length) return;
  await queueDigestItem(ctx, { userIds, category: "money", kind, url: "/finances", inboxTitle: MONEY_TEXT[kind].title, inboxBody: MONEY_TEXT[kind].body });
}

const queueTravelRef = makeFunctionReference<"mutation", { eventId: Id<"events">; cursor: string | null }, null>("notificationDigest:queueTravel");

/** D2: queue a Travel digest update for the event's confirmed participants and their Parents (fanned out in the background). */
export async function queueTravelDigest(ctx: MutationCtx, eventId: Id<"events">): Promise<void> {
  await ctx.scheduler.runAfter(0, queueTravelRef, { eventId, cursor: null });
}
