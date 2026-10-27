import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeSeason, audit, viewer, type AppUser } from "./lib/access";

/** Student Home shows at most this many pinned messages; pinning one more is refused. */
const PIN_LIMIT = 5;
/** The staff page lists this many of the newest unpinned messages. */
const NOT_PINNED_LIMIT = 20;
const TITLE_MAX = 80;
const BODY_MAX = 500;

type Ctx = QueryCtx | MutationCtx;
type Announcement = Doc<"teamAnnouncements">;
type AuthorRole = Announcement["authorRole"];

const authorRole = v.union(v.literal("coach"), v.literal("travelLead"));
const pinnedAnnouncement = v.object({
  id: v.id("teamAnnouncements"), title: v.union(v.string(), v.null()), body: v.string(), authorName: v.string(), authorRole,
  pinnedAt: v.number(), showUntil: v.union(v.number(), v.null()),
});
const staffAnnouncement = v.object({
  id: v.id("teamAnnouncements"), title: v.union(v.string(), v.null()), body: v.string(), authorName: v.string(), authorRole,
  pinned: v.boolean(), pinnedAt: v.union(v.number(), v.null()), showUntil: v.union(v.number(), v.null()), createdAt: v.number(), updatedAt: v.number(),
});

/** A Coach, or a Mentor with Travel Lead access (including a Parent who selected Travel Lead for this session). */
function managerRole(user: AppUser): AuthorRole | null {
  if (user.role === "coach") return "coach";
  if (user.role === "mentor" && user.travelLead) return "travelLead";
  return null;
}

async function requireManager(ctx: Ctx) {
  const actor = await viewer(ctx);
  const role = managerRole(actor);
  if (!role) throw new ConvexError("Only a Coach or Travel Lead can manage announcements.");
  return { actor, role, season: await activeSeason(ctx) };
}

function cleanContent(args: { title?: string; body: string }) {
  const title = (args.title ?? "").trim();
  const body = args.body.replace(/\r\n?/g, "\n").trim();
  if (title.length > TITLE_MAX) throw new ConvexError(`Keep the title to ${TITLE_MAX} characters or fewer.`);
  if (!body) throw new ConvexError("Write a message before saving.");
  if (body.length > BODY_MAX) throw new ConvexError(`Keep the message to ${BODY_MAX} characters or fewer.`);
  return { title: title || undefined, body };
}

function futureShowUntil(showUntil: number | undefined, now: number) {
  if (showUntil === undefined) return undefined;
  if (!Number.isSafeInteger(showUntil) || showUntil <= now) throw new ConvexError("Choose a Show until date that hasn't passed, or leave it blank.");
  return showUntil;
}

async function currentAnnouncement(ctx: MutationCtx, id: Id<"teamAnnouncements">, seasonId: Id<"seasons">) {
  const row = await ctx.db.get("teamAnnouncements", id);
  if (!row || row.archivedAt !== undefined) throw new ConvexError("This announcement was removed. Reload to see current announcements.");
  if (row.seasonId !== seasonId) throw new ConvexError("This announcement is from an earlier season. Reload to see this season's announcements.");
  return row;
}

async function requirePinRoom(ctx: MutationCtx, seasonId: Id<"seasons">) {
  const pinned = await ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_pinned_and_pinnedAt", q => q.eq("seasonId", seasonId).eq("pinned", true)).take(PIN_LIMIT);
  if (pinned.length >= PIN_LIMIT) throw new ConvexError("Five announcements are already pinned. Unpin one first.");
}

/** What the audit trail keeps: the visible content and pin state, never account details. */
function auditView(row: Pick<Announcement, "title" | "body" | "pinned" | "showUntil">) {
  return { title: row.title ?? null, body: row.body, pinned: row.pinned, showUntil: row.showUntil ?? null };
}

/** Author names come from the account name. An account whose name is an email shows its role instead. */
function authorNames(ctx: Ctx) {
  const cache = new Map<Id<"appUsers">, Promise<string>>();
  return (row: Announcement) => {
    const fallback = row.authorRole === "coach" ? "Coach" : "Travel Lead";
    let name = cache.get(row.authorId);
    if (!name) {
      name = ctx.db.get("appUsers", row.authorId).then(author => author?.name.trim() ?? "");
      cache.set(row.authorId, name);
    }
    return name.then(value => value && !value.includes("@") ? value : fallback);
  };
}

/**
 * Pinned messages for Student Home, newest pin first. Expired messages are included; the browser hides them after showUntil.
 * With no active season, or for a Student not on this season's roster, there is nothing to show, so Home gets an empty list rather than an error.
 */
export const pinnedForHome = query({
  args: {},
  returns: v.array(pinnedAnnouncement),
  handler: async ctx => {
    const user = await viewer(ctx);
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season) return [];
    // A Student sees the messages only while on this season's roster; Parents and staff may preview.
    if (user.role === "student") {
      const student = await ctx.db.query("students").withIndex("by_seasonId_and_userId", q => q.eq("seasonId", season._id).eq("userId", user._id)).unique();
      if (!student?.active) return [];
    }
    const rows = await ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_pinned_and_pinnedAt", q => q.eq("seasonId", season._id).eq("pinned", true)).order("desc").take(PIN_LIMIT);
    const nameOf = authorNames(ctx);
    return await Promise.all(rows.filter(row => row.archivedAt === undefined).map(async row => ({
      id: row._id, title: row.title ?? null, body: row.body, authorName: await nameOf(row), authorRole: row.authorRole,
      pinnedAt: row.pinnedAt ?? row.updatedAt, showUntil: row.showUntil ?? null,
    })));
  },
});

/** The management page: every pinned message plus the newest unpinned ones. */
export const listForStaff = query({
  args: {},
  returns: v.object({ pinned: v.array(staffAnnouncement), notPinned: v.array(staffAnnouncement), moreNotPinned: v.boolean(), pinLimit: v.number() }),
  handler: async ctx => {
    const { season } = await requireManager(ctx);
    const pinned = await ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_pinned_and_pinnedAt", q => q.eq("seasonId", season._id).eq("pinned", true)).order("desc").take(PIN_LIMIT);
    // At most PIN_LIMIT current rows are pinned, so this window always holds the newest unpinned rows plus one to tell whether more exist.
    const recent = await ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_archivedAt_and_createdAt", q => q.eq("seasonId", season._id).eq("archivedAt", undefined)).order("desc").take(NOT_PINNED_LIMIT + PIN_LIMIT + 1);
    const unpinned = recent.filter(row => !row.pinned);
    const nameOf = authorNames(ctx);
    const project = async (row: Announcement) => ({
      id: row._id, title: row.title ?? null, body: row.body, authorName: await nameOf(row), authorRole: row.authorRole,
      pinned: row.pinned, pinnedAt: row.pinnedAt ?? null, showUntil: row.showUntil ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
    });
    return {
      pinned: await Promise.all(pinned.filter(row => row.archivedAt === undefined).map(project)),
      notPinned: await Promise.all(unpinned.slice(0, NOT_PINNED_LIMIT).map(project)),
      moreNotPinned: unpinned.length > NOT_PINNED_LIMIT,
      pinLimit: PIN_LIMIT,
    };
  },
});

export const create = mutation({
  args: { title: v.optional(v.string()), body: v.string(), showUntil: v.optional(v.number()), pin: v.boolean() },
  returns: v.id("teamAnnouncements"),
  handler: async (ctx, args) => {
    const { actor, role, season } = await requireManager(ctx);
    const now = Date.now();
    const content = cleanContent(args);
    const showUntil = futureShowUntil(args.showUntil, now);
    if (args.pin) await requirePinRoom(ctx, season._id);
    const row = { seasonId: season._id, ...content, showUntil, authorId: actor._id, authorRole: role, pinned: args.pin, pinnedAt: args.pin ? now : undefined, createdAt: now, updatedAt: now };
    const id = await ctx.db.insert("teamAnnouncements", row);
    await audit(ctx, actor, "teamAnnouncements", id, "createAnnouncement", null, auditView(row));
    return id;
  },
});

/** Replaces the title, message and Show until date. The author and pin order stay the same. */
export const update = mutation({
  args: { id: v.id("teamAnnouncements"), title: v.optional(v.string()), body: v.string(), showUntil: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, season } = await requireManager(ctx);
    const row = await currentAnnouncement(ctx, args.id, season._id);
    const now = Date.now();
    const content = cleanContent(args);
    // An unchanged date may already have passed; only a newly chosen date must be in the future.
    const showUntil = args.showUntil === row.showUntil ? row.showUntil : futureShowUntil(args.showUntil, now);
    if (content.title === row.title && content.body === row.body && showUntil === row.showUntil) return null;
    await ctx.db.patch("teamAnnouncements", row._id, { title: content.title, body: content.body, showUntil, updatedAt: now });
    await audit(ctx, actor, "teamAnnouncements", row._id, "updateAnnouncement", auditView(row), auditView({ ...row, ...content, showUntil }));
    return null;
  },
});

export const pin = mutation({
  args: { id: v.id("teamAnnouncements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, season } = await requireManager(ctx);
    const row = await currentAnnouncement(ctx, args.id, season._id);
    if (row.pinned) return null;
    await requirePinRoom(ctx, season._id);
    const now = Date.now();
    await ctx.db.patch("teamAnnouncements", row._id, { pinned: true, pinnedAt: now, updatedAt: now });
    await audit(ctx, actor, "teamAnnouncements", row._id, "pinAnnouncement", auditView(row), auditView({ ...row, pinned: true }));
    return null;
  },
});

export const unpin = mutation({
  args: { id: v.id("teamAnnouncements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, season } = await requireManager(ctx);
    const row = await currentAnnouncement(ctx, args.id, season._id);
    if (!row.pinned) return null;
    await ctx.db.patch("teamAnnouncements", row._id, { pinned: false, pinnedAt: undefined, updatedAt: Date.now() });
    await audit(ctx, actor, "teamAnnouncements", row._id, "unpinAnnouncement", auditView(row), auditView({ ...row, pinned: false }));
    return null;
  },
});

/** "Remove" on the staff page: hides the message everywhere and unpins it. The row stays for the audit trail. */
export const archive = mutation({
  args: { id: v.id("teamAnnouncements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, season } = await requireManager(ctx);
    const row = await currentAnnouncement(ctx, args.id, season._id);
    const now = Date.now();
    await ctx.db.patch("teamAnnouncements", row._id, { archivedAt: now, pinned: false, pinnedAt: undefined, updatedAt: now });
    await audit(ctx, actor, "teamAnnouncements", row._id, "archiveAnnouncement", auditView(row), { ...auditView({ ...row, pinned: false }), archived: true });
    return null;
  },
});
