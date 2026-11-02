import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { MAX_DIGEST_USERS, queueDigestItem, type DigestCategory } from "./lib/digest";
import { parentUserIdsForStudents, studentUserIds } from "./lib/notify";
import { digestDue } from "./lib/reminderSchedule";
import { scheduleSummaryPush } from "./push";

const USERS_PER_BATCH = 25;
/** Items stamped per flush transaction, across all users in it. */
const ITEMS_PER_BATCH = 500;
const MAX_SUMMARY_URLS = 100;
const PURGE_BATCH = 200;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type FlushCarry = { userId: Id<"appUsers">; tallies: Tally[] };
const flushRef = makeFunctionReference<"mutation", { carry?: FlushCarry }, null>("notificationDigest:flush");
const purgeRef = makeFunctionReference<"mutation", Record<string, never>, null>("notificationDigest:purgeFlushed");

const DEFAULT_URL: Record<DigestCategory, string> = { money: "/finances", travel: "/events", staff: "/inbox" };
const STAFF_LABELS: Record<string, [string, string]> = {
  withdrawalRequest: ["withdrawal request", "withdrawal requests"],
  signupPending: ["signup to review", "signups to review"],
  joinRequest: ["join request", "join requests"],
  profileCorrection: ["profile correction", "profile corrections"],
};
const MONEY_LABELS: Record<string, [string, string]> = { payment: ["payment received", "payments received"], charge: ["new charge", "new charges"] };

const counted = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`;

type Tally = { category: DigestCategory; total: number; counts: Record<string, number>; urls: string[]; anchor?: Id<"notifications"> };
const tallyValidator = v.object({ category: v.union(v.literal("money"), v.literal("travel"), v.literal("staff")), total: v.number(), counts: v.record(v.string(), v.number()), urls: v.array(v.string()), anchor: v.optional(v.id("notifications")) });
const carryValidator = v.object({ userId: v.id("appUsers"), tallies: v.array(tallyValidator) });

function addItem(tallies: Map<DigestCategory, Tally>, item: Doc<"notificationDigestItems">) {
  const tally = tallies.get(item.category) ?? { category: item.category, total: 0, counts: {}, urls: [] };
  tally.total++;
  tally.counts[item.kind] = (tally.counts[item.kind] ?? 0) + 1;
  if (tally.urls.length < MAX_SUMMARY_URLS && !tally.urls.includes(item.url)) tally.urls.push(item.url);
  if (item.notificationId) tally.anchor = item.notificationId;
  tallies.set(item.category, tally);
}

/** Summary text for one category. Generic only: no amounts, names or rooming details. */
function summarize({ category, total, counts, urls }: Tally): { title: string; body: string; url: string } {
  const url = urls.length === 1 ? urls[0] : DEFAULT_URL[category];
  // Fixed label order: a carried tally's record keys do not keep insertion order.
  const order = Object.keys(category === "money" ? MONEY_LABELS : STAFF_LABELS);
  const rank = (kind: string) => order.includes(kind) ? order.indexOf(kind) : order.length;
  const kinds = Object.entries(counts).sort(([a], [b]) => rank(a) - rank(b));
  if (category === "money") {
    const parts = kinds.map(([kind, count]) => counted(count, MONEY_LABELS[kind] ?? ["update", "updates"]));
    return { title: `Money: ${counted(total, ["update", "updates"])}`, body: `${parts.join(", ")}. Open Money for details.`, url };
  }
  if (category === "travel") {
    return { title: "Travel: transport details updated", body: urls.length === 1 ? "Transportation for an event changed. Open the event for details." : `Transportation changed for ${urls.length} events. Open Events for details.`, url };
  }
  const parts = kinds.map(([kind, count]) => counted(count, STAFF_LABELS[kind] ?? ["item", "items"]));
  return { title: `To-dos: ${parts.join(", ")}`, body: "New staff items are waiting for review.", url };
}

export function digestSummary(category: DigestCategory, items: Doc<"notificationDigestItems">[]): { title: string; body: string; url: string } {
  const tallies = new Map<DigestCategory, Tally>();
  for (const item of items) addItem(tallies, item);
  return summarize(tallies.get(category) ?? { category, total: 0, counts: {}, urls: [] });
}

/** Hourly cron: flushes only during the 5 PM Chicago hour (DST-safe), and trims old flushed rows. */
export const hourly = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    if (digestDue(Date.now())) await ctx.scheduler.runAfter(0, flushRef, {});
    await ctx.scheduler.runAfter(0, purgeRef, {});
    return null;
  },
});

/**
 * Stamps flushedAt on every unflushed item and sends exactly one push per user per category. A user with more items than
 * one transaction's budget is continued with `carry` (the running tally), and their pushes go out only after the last
 * item is stamped. Idempotent; reschedules itself while users remain.
 */
export const flush = internalMutation({
  args: { carry: v.optional(carryValidator) }, returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    let carry = args.carry;
    let budget = ITEMS_PER_BATCH;
    for (let users = 0; users < USERS_PER_BATCH; users++) {
      const userId = carry?.userId ?? (await ctx.db.query("notificationDigestItems").withIndex("by_flushedAt_and_userId", q => q.eq("flushedAt", undefined)).first())?.userId;
      if (!userId) return null;
      const tallies = new Map<DigestCategory, Tally>((carry?.tallies ?? []).map(tally => [tally.category, tally]));
      const items = await ctx.db.query("notificationDigestItems").withIndex("by_userId_and_flushedAt", q => q.eq("userId", userId).eq("flushedAt", undefined)).take(budget);
      for (const item of items) {
        addItem(tallies, item);
        await ctx.db.patch(item._id, { flushedAt: now });
      }
      budget -= items.length;
      if (budget === 0) {
        // This user may have more items: finish them in a fresh transaction before sending their one push.
        await ctx.scheduler.runAfter(0, flushRef, { carry: { userId, tallies: [...tallies.values()] } });
        return null;
      }
      for (const tally of tallies.values()) if (tally.anchor) await scheduleSummaryPush(ctx, { notificationId: tally.anchor, ...summarize(tally) });
      carry = undefined;
    }
    await ctx.scheduler.runAfter(0, flushRef, {});
    return null;
  },
});

export const purgeFlushed = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const old = await ctx.db.query("notificationDigestItems").withIndex("by_flushedAt_and_userId", q => q.gte("flushedAt", 0).lt("flushedAt", Date.now() - RETENTION_MS)).take(PURGE_BATCH);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === PURGE_BATCH) await ctx.scheduler.runAfter(0, purgeRef, {});
    return null;
  },
});

const PARTICIPANTS_PER_PAGE = 100;
const queueTravelRef = makeFunctionReference<"mutation", { eventId: Id<"events">; cursor: string | null }, null>("notificationDigest:queueTravel");

/** Fan-out for queueTravelDigest: confirmed participants and their Parents, one page at a time. Repeated edits coalesce until the next flush. */
export const queueTravel = internalMutation({
  args: { eventId: v.id("events"), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.archived || event.cancelled) return null;
    const page = await ctx.db.query("participants").withIndex("by_eventId_and_status", q => q.eq("eventId", event._id).eq("status", "confirmed")).paginate({ numItems: PARTICIPANTS_PER_PAGE, cursor: args.cursor });
    const studentIds = page.page.map(row => row.studentId);
    const userIds = [...new Set([...await studentUserIds(ctx, studentIds), ...await parentUserIdsForStudents(ctx, studentIds)])];
    // A page's students plus Parents can exceed one queueDigestItem call's cap, so queue in chunks.
    for (let i = 0; i < userIds.length; i += MAX_DIGEST_USERS) {
      await queueDigestItem(ctx, { userIds: userIds.slice(i, i + MAX_DIGEST_USERS), category: "travel", kind: "transport", url: `/events/${event._id}`, inboxTitle: "Transportation updated", inboxBody: "Transportation details for an event changed. Open the event for details.", coalesce: true });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, queueTravelRef, { eventId: event._id, cursor: page.continueCursor });
    return null;
  },
});
