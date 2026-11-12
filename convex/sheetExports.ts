import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v, type Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalMutation, internalQuery, query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { audit, isCoachOrTravelLead, requireRole, viewer } from "./lib/access";
import { MAX_FILES_PER_RUN, eventKindApplies, eventQualifies, eventWindowEnds } from "./lib/sheetEvents";
import { folderVisible, sheetFileKind, sheetFolder, type SheetFileKind, type SheetFolder } from "./lib/sheetKinds";
import { readySheetKinds, sheetKind } from "./lib/sheetRegistry";
import { sheetUpdateDue } from "./lib/sheetSchedule";
import { spreadsheetLink } from "./lib/googleSheets";

/** Longer than the 10-minute limit of one action, so a run is never taken over while its last step may still be working. */
export const LEASE_MS = 15 * 60_000;
export const ALREADY_UPDATING = "Spreadsheets are already updating. This takes a few minutes.";
export const NOT_SET_UP = "Google Drive isn't connected yet. A Coach can connect it on this page.";
export const NO_SEASON = "There's no active season yet, so there's nothing to put in the spreadsheets. A Coach can start a season on the Season page.";
export const NOT_TURNED_ON = "Spreadsheet updates aren't turned on yet. Ask the person who set up Venom Status for your team to turn them on.";
export const TOO_MANY = "You've pressed Update spreadsheets several times. Wait a few minutes, then try again.";
export const TOO_MANY_CHECKS = "You've checked access several times. Wait a few minutes, then try again.";

const limiter = new RateLimiter(components.rateLimiter, {
  sheetUpdatePress: { kind: "fixed window", rate: 5, period: 10 * 60_000 },
  sheetAccessCheck: { kind: "fixed window", rate: 10, period: 10 * 60_000 },
});

/** Google writes happen only when the deployment says so. */
export const exportEnabled = () => env.GOOGLE_SHEETS_EXPORT_ENABLED === "true";
export const credentialsConfigured = () => !!(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY);

const startResult = v.union(
  v.object({ status: v.literal("started") }),
  v.object({ status: v.union(v.literal("alreadyUpdating"), v.literal("notSetUp"), v.literal("noSeason"), v.literal("off"), v.literal("tooManyRequests")), message: v.string() }),
);

type Begin = { status: "started"; runId: Id<"sheetExportRuns"> } | { status: "alreadyUpdating" | "notSetUp" | "noSeason" | "off" | "skipped" };

/** One file of a run: a team file is its kind name; an event file also names its event. */
export type RunItem = SheetFileKind | { kind: SheetFileKind; eventId: Id<"events"> };
const itemKind = (item: RunItem) => (typeof item === "string" ? item : item.kind);
const itemEvent = (item: RunItem) => (typeof item === "string" ? undefined : item.eventId);
const sameItem = (item: RunItem | undefined, kind: SheetFileKind, eventId: Id<"events"> | undefined) => item !== undefined && itemKind(item) === kind && itemEvent(item) === eventId;

/** Most events read when looking for ones that get spreadsheets (a few months of one season; repeating meetings are read and dropped). */
const EVENT_SCAN_LIMIT = 500;

/** Events of the season that get per-event spreadsheets now (see eventQualifies), soonest start first. */
export async function qualifyingEvents(ctx: QueryCtx, seasonId: Id<"seasons">, now: number): Promise<Doc<"events">[]> {
  const { from, to } = eventWindowEnds(now);
  const rows = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", seasonId).eq("archived", false).gte("endsAt", from).lte("endsAt", to)).take(EVENT_SCAN_LIMIT);
  return rows.filter(event => eventQualifies(event, now)).sort((a, b) => a.startsAt - b.startsAt);
}

/**
 * Every file a run writes: ready team kinds, then each ready event kind that applies (the Travel emergency file only for events with travel,
 * an overnight stay or a permission form) for every qualifying event, soonest first. At most MAX_FILES_PER_RUN; the rest (the events
 * furthest away) are counted as skipped so the card can say so. Kinds with `ready: false` are never listed.
 */
export async function planRun(ctx: QueryCtx, seasonId: Id<"seasons">, now: number): Promise<{ pending: RunItem[]; skipped: number }> {
  const items: RunItem[] = readySheetKinds("team").map(definition => definition.kind);
  const eventKinds = readySheetKinds("event");
  if (eventKinds.length) for (const event of await qualifyingEvents(ctx, seasonId, now)) for (const definition of eventKinds) if (eventKindApplies(definition.kind, event)) items.push({ kind: definition.kind, eventId: event._id });
  return { pending: items.slice(0, MAX_FILES_PER_RUN), skipped: Math.max(0, items.length - MAX_FILES_PER_RUN) };
}

/** Starts a run unless one is in progress (its lease has not expired). An expired lease is taken over. */
async function beginRun(ctx: MutationCtx, trigger: "schedule" | "button" | "server", requestedBy: Id<"appUsers"> | undefined, now: number): Promise<Begin> {
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  const settings = await ctx.db.query("sheetExportSettings").first();
  if (!season) return { status: "noSeason" };
  if (!settings) return { status: "notSetUp" };
  if (!exportEnabled() || !credentialsConfigured()) return { status: "off" };
  const latest = await ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first();
  if (latest?.state === "running") {
    if (latest.leaseExpiresAt > now) return { status: "alreadyUpdating" };
    await ctx.db.patch(latest._id, { state: "partial", finishedAt: now });
  } else if (trigger === "schedule" && latest?.trigger === "schedule" && now - latest.startedAt < 50 * 60_000) return { status: "skipped" };
  const { pending, skipped } = await planRun(ctx, season._id, now);
  const runId = await ctx.db.insert("sheetExportRuns", {
    seasonId: season._id, trigger, requestedBy, startedAt: now, leaseExpiresAt: now + LEASE_MS, pending, total: pending.length, done: 0, failed: 0,
    ...(skipped ? { skipped } : {}), state: pending.length ? "running" : "done", ...(pending.length ? {} : { finishedAt: now }),
  });
  if (pending.length) await ctx.scheduler.runAfter(0, internal.sheetExportActions.runOne, { runId });
  return { status: "started", runId };
}

/** Any Coach or Travel Lead (a Parent acting as Travel Lead included) refreshes every file, even ones they cannot open. */
export const requestUpdate = mutation({
  args: {}, returns: startResult,
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (!isCoachOrTravelLead(actor)) throw new ConvexError("Only a Coach or Travel Lead can update the team spreadsheets.");
    if (!(await limiter.check(ctx, "sheetUpdatePress", { key: actor._id })).ok) return { status: "tooManyRequests" as const, message: TOO_MANY };
    const begun = await beginRun(ctx, "button", actor._id, Date.now());
    if (begun.status === "alreadyUpdating") return { status: "alreadyUpdating" as const, message: ALREADY_UPDATING };
    if (begun.status === "noSeason") return { status: "noSeason" as const, message: NO_SEASON };
    if (begun.status === "notSetUp" || begun.status === "skipped") return { status: "notSetUp" as const, message: NOT_SET_UP };
    if (begun.status === "off") return { status: "off" as const, message: NOT_TURNED_ON };
    await limiter.limit(ctx, "sheetUpdatePress", { key: actor._id });
    return { status: "started" as const };
  },
});

/** Hourly cron: starts a full update only in the 5:00 AM and 6:00 PM Chicago hours (DST-safe). */
export const hourly = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const now = Date.now();
    if (sheetUpdateDue(now)) await beginRun(ctx, "schedule", undefined, now);
    return null;
  },
});

/**
 * Starts a full update from the server without a signed-in person (owner or operator use): `bunx convex run sheetExports:startNow`
 * (production only with the owner's approval). Same checks as the button except the per-person press limit; answers with what happened.
 */
export const startNow = internalMutation({
  args: {},
  returns: v.object({ status: v.union(v.literal("started"), v.literal("alreadyUpdating"), v.literal("notSetUp"), v.literal("noSeason"), v.literal("off"), v.literal("skipped")) }),
  handler: async ctx => {
    const begun = await beginRun(ctx, "server", undefined, Date.now());
    return { status: begun.status };
  },
});

export const requireCoach = internalQuery({
  args: {}, returns: v.null(),
  handler: async ctx => { requireRole(await viewer(ctx), "coach"); return null; },
});

export const getSettings = internalQuery({
  args: {}, returns: v.union(v.null(), v.object({ driveId: v.string(), generalFolderId: v.string(), moneyFolderId: v.string(), healthFolderId: v.string(), eventsFolderId: v.union(v.string(), v.null()) })),
  handler: async ctx => {
    const row = await ctx.db.query("sheetExportSettings").first();
    return row ? { driveId: row.driveId, generalFolderId: row.generalFolderId, moneyFolderId: row.moneyFolderId, healthFolderId: row.healthFolderId, eventsFolderId: row.eventsFolderId ?? null } : null;
  },
});

/** Coach only (checked by the setup action). Files made in a folder that has changed are forgotten; the next update makes new ones. */
export const saveSettings = internalMutation({
  args: { driveId: v.string(), generalFolderId: v.string(), moneyFolderId: v.string(), healthFolderId: v.string(), eventsFolderId: v.string(), setBy: v.id("appUsers"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { now, ...fields } = args;
    const actor = await ctx.db.get(args.setBy);
    const existing = await ctx.db.query("sheetExportSettings").first();
    // Which folders changed (names only; folder links are not written to the audit trail).
    const keys = { general: "generalFolderId", money: "moneyFolderId", health: "healthFolderId", events: "eventsFolderId" } as const;
    const changed = (Object.keys(keys) as (keyof typeof keys)[]).filter(name => existing?.[keys[name]] !== fields[keys[name]]);
    if (existing) await ctx.db.replace(existing._id, { ...fields, setAt: now });
    else await ctx.db.insert("sheetExportSettings", { ...fields, setAt: now });
    const folderIds = { general: args.generalFolderId, money: args.moneyFolderId, health: args.healthFolderId, events: args.eventsFolderId };
    // Bounded: a few hundred files per season. Files made in a folder that is no longer configured are forgotten (they stay in Drive).
    for (const file of await ctx.db.query("sheetExportFiles").take(1000)) if (!file.archivedAt && file.folderId !== folderIds[file.folder]) await ctx.db.delete(file._id);
    if (actor) await audit(ctx, actor, "sheetExportSettings", existing?._id ?? "new", existing ? "update" : "connect", existing ? { connected: true } : null, { connected: true, foldersChanged: changed, driveChanged: existing ? existing.driveId !== args.driveId : true });
    return null;
  },
});

/** One check-access attempt per call; false once a Coach has tried too often in a short time. */
export const takeCheckAttempt = internalMutation({
  args: { actorId: v.id("appUsers") }, returns: v.boolean(),
  handler: async (ctx, args) => (await limiter.limit(ctx, "sheetAccessCheck", { key: args.actorId })).ok,
});

/** Whether a run may still write: it is running, its hold has not run out, and its season is still the active one. */
async function runHolds(ctx: QueryCtx, run: Doc<"sheetExportRuns"> | null, now: number): Promise<boolean> {
  if (run?.state !== "running" || run.leaseExpiresAt <= now) return false;
  return (await ctx.db.get(run.seasonId))?.status === "active";
}

/**
 * True while this run still holds the update (it has not finished, was not taken over, and its season is still active). Checked before
 * every create and Google write, so a run whose season was just archived stops before it makes anything in the live folders.
 */
export const runCurrent = internalQuery({
  args: { runId: v.id("sheetExportRuns") }, returns: v.boolean(),
  handler: async (ctx, args) => runHolds(ctx, await ctx.db.get(args.runId), Date.now()),
});

export const setupActor = internalQuery({
  args: {}, returns: v.id("appUsers"),
  handler: async ctx => { const actor = await viewer(ctx); requireRole(actor, "coach"); return actor._id; },
});

const claimValidator = v.union(v.null(), v.object({
  kind: sheetFileKind, eventId: v.union(v.id("events"), v.null()), event: v.union(v.null(), v.object({ name: v.string(), startsAt: v.number() })),
  seasonId: v.id("seasons"), seasonName: v.string(), driveId: v.string(), folder: sheetFolder, folderId: v.string(),
  file: v.union(v.null(), v.object({ spreadsheetId: v.string(), name: v.string(), tabs: v.array(v.object({ title: v.string(), sheetId: v.number() })), fingerprint: v.union(v.string(), v.null()), folderId: v.string(), hadError: v.boolean() })),
}));

/**
 * The next file of a run, with its lease extended. Null when the run is over, replaced, or Google writes are off. A run whose season is no
 * longer active is stopped. A file that no longer belongs in the run (its kind was turned off, or its event was deleted, canceled, left the
 * window or no longer needs that file, so its file is frozen) is dropped without any Google call. A stop here releases the hold at once:
 * no step of this run is still working.
 */
export const claimNext = internalMutation({
  args: { runId: v.id("sheetExportRuns") }, returns: claimValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const now = Date.now();
    if (!run) return null;
    // A run stopped between steps (its season was archived): the next step finds it stopped and lets go of the hold at once.
    if (run.state !== "running") { if (run.leaseExpiresAt > now) await ctx.db.patch(run._id, { leaseExpiresAt: now }); return null; }
    if (!run.pending.length) return null;
    const stop = async () => { await ctx.db.patch(run._id, { state: "stopped", finishedAt: now, leaseExpiresAt: now }); return null; };
    if (!exportEnabled() || !credentialsConfigured()) return stop();
    const settings = await ctx.db.query("sheetExportSettings").first();
    const season = await ctx.db.get(run.seasonId);
    if (!settings || !season || season.status !== "active") return stop();
    let pending = run.pending;
    let total = run.total;
    for (; pending.length; pending = pending.slice(1), total--) {
      const kind = itemKind(pending[0]), eventId = itemEvent(pending[0]);
      const definition = sheetKind(kind).definition;
      if (!definition.ready || (definition.scope === "event") !== (eventId !== undefined)) continue;
      const event = eventId ? await ctx.db.get(eventId) : null;
      if (eventId && (!event || event.seasonId !== run.seasonId || !eventQualifies(event, now) || !eventKindApplies(kind, event))) continue;
      const folderId = { general: settings.generalFolderId, money: settings.moneyFolderId, health: settings.healthFolderId, events: settings.eventsFolderId }[definition.folder];
      if (!folderId) return stop();
      const stored = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", run.seasonId).eq("kind", kind).eq("eventId", eventId)).first();
      if (stored?.archivedAt) continue;
      await ctx.db.patch(run._id, { leaseExpiresAt: now + LEASE_MS, ...(pending !== run.pending ? { pending, total } : {}) });
      return {
        kind, eventId: eventId ?? null, event: event ? { name: event.name, startsAt: event.startsAt } : null,
        seasonId: run.seasonId, seasonName: season.name, driveId: settings.driveId, folder: definition.folder, folderId,
        file: stored ? { spreadsheetId: stored.spreadsheetId, name: stored.name, tabs: stored.tabs, fingerprint: stored.fingerprint ?? null, folderId: stored.folderId, hadError: stored.lastError !== undefined } : null,
      };
    }
    // Nothing left that belongs in this run.
    await ctx.db.patch(run._id, { pending: [], total, state: run.failed ? "partial" : "done", finishedAt: now, leaseExpiresAt: now });
    return null;
  },
});

/**
 * Saves what is known about a file. Refuses (false) when the run no longer holds the update. A save without a fingerprint also clears the stored
 * one, so a write that was interrupted is redone at the next update. Any successful check (frozen: a real write or an unchanged file) clears the "made again" note left by an earlier update.
 */
export const saveFile = internalMutation({
  args: { runId: v.id("sheetExportRuns"), seasonId: v.id("seasons"), kind: sheetFileKind, eventId: v.optional(v.id("events")), folder: sheetFolder, folderId: v.string(), name: v.string(), spreadsheetId: v.string(), tabs: v.array(v.object({ title: v.string(), sheetId: v.number() })), fingerprint: v.optional(v.string()), updatedAt: v.optional(v.number()), checkedAt: v.number(), frozen: v.boolean(), recreated: v.union(v.null(), v.literal("missing"), v.literal("moved")) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { runId, recreated, ...fields } = args;
    const run = await ctx.db.get(runId);
    if (run?.state !== "running" || (await ctx.db.get(run.seasonId))?.status !== "active") return false;
    const existing = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", args.seasonId).eq("kind", args.kind).eq("eventId", args.eventId)).first();
    // A file moved into the Archive is never written again.
    if (existing?.archivedAt) return false;
    const note = recreated ? { recreatedAt: args.checkedAt, recreatedWhy: recreated } : args.frozen ? { recreatedAt: undefined, recreatedWhy: undefined } : {};
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, fingerprint: args.fingerprint, updatedAt: args.updatedAt ?? existing.updatedAt, lastError: undefined, ...note });
    } else await ctx.db.insert("sheetExportFiles", { ...fields, ...(recreated ? { recreatedAt: args.checkedAt, recreatedWhy: recreated } : {}) });
    return true;
  },
});

/** Records one finished file; schedules the next, or ends the run (partly done when any file failed). */
export const completeOne = internalMutation({
  args: { runId: v.id("sheetExportRuns"), kind: sheetFileKind, eventId: v.optional(v.id("events")), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const now = Date.now();
    if (!run) return null;
    // A step that finishes after its run was stopped releases the hold, so a waiting season archive goes on at once.
    if (run.state !== "running") { if (run.leaseExpiresAt > now) await ctx.db.patch(run._id, { leaseExpiresAt: now }); return null; }
    if (!sameItem(run.pending[0], args.kind, args.eventId)) return null;
    const pending = run.pending.slice(1);
    const failed = run.failed + (args.error ? 1 : 0);
    const problems = args.error ? [...(run.problems ?? []), { kind: args.kind, ...(args.eventId ? { eventId: args.eventId } : {}), message: args.error }] : run.problems;
    if (args.error) {
      const file = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", run.seasonId).eq("kind", args.kind).eq("eventId", args.eventId)).first();
      if (file) await ctx.db.patch(file._id, { lastError: args.error });
    }
    await ctx.db.patch(run._id, { pending, done: run.done + (args.error ? 0 : 1), failed, problems, leaseExpiresAt: pending.length ? now + LEASE_MS : now, ...(pending.length ? {} : { state: failed ? "partial" as const : "done" as const, finishedAt: now }) });
    if (pending.length) await ctx.scheduler.runAfter(1000, internal.sheetExportActions.runOne, { runId: run._id });
    return null;
  },
});

/**
 * A step that lost its hold (its run was stopped or replaced, its season was archived, or its file was archived) closes out at once instead
 * of leaving the run held for 15 minutes. A spreadsheet the step had just made but could not save is recorded, so it is never left untracked
 * in a live folder: a season archive that is waiting moves it, or the next update finds and rewrites it. A running run whose file was
 * archived drops that file and goes on with the next.
 */
export const abandonStep = internalMutation({
  args: {
    runId: v.id("sheetExportRuns"), kind: sheetFileKind, eventId: v.optional(v.id("events")),
    made: v.optional(v.object({ seasonId: v.id("seasons"), folder: sheetFolder, folderId: v.string(), name: v.string(), spreadsheetId: v.string(), checkedAt: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.made) {
      const made = args.made;
      const existing = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", made.seasonId).eq("kind", args.kind).eq("eventId", args.eventId)).first();
      const row = { ...made, tabs: [], fingerprint: undefined, frozen: false };
      if (!existing) await ctx.db.insert("sheetExportFiles", { ...row, kind: args.kind, ...(args.eventId ? { eventId: args.eventId } : {}) });
      else if (existing.spreadsheetId !== made.spreadsheetId) {
        if (!existing.archivedAt) await ctx.db.patch(existing._id, row);
        else console.warn("Spreadsheet made after its file was archived", { kind: args.kind, eventId: args.eventId ?? null });
      }
    }
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    if (run.state === "running" && (await ctx.db.get(run.seasonId))?.status !== "active") {
      await ctx.db.patch(run._id, { state: "stopped", finishedAt: now, leaseExpiresAt: now });
      return null;
    }
    if (run.state !== "running") { if (run.leaseExpiresAt > now) await ctx.db.patch(run._id, { leaseExpiresAt: now }); return null; }
    if (run.leaseExpiresAt <= now || !sameItem(run.pending[0], args.kind, args.eventId)) return null;
    const pending = run.pending.slice(1);
    await ctx.db.patch(run._id, { pending, total: run.total - 1, leaseExpiresAt: pending.length ? now + LEASE_MS : now, ...(pending.length ? {} : { state: run.failed ? "partial" as const : "done" as const, finishedAt: now }) });
    if (pending.length) await ctx.scheduler.runAfter(1000, internal.sheetExportActions.runOne, { runId: run._id });
    return null;
  },
});

const fileFields = { kind: sheetFileKind, title: v.string(), folder: sheetFolder, name: v.union(v.string(), v.null()), link: v.union(v.string(), v.null()), updatedAt: v.union(v.number(), v.null()), checkedAt: v.union(v.number(), v.null()), problem: v.union(v.string(), v.null()), note: v.union(v.string(), v.null()) };
const fileStatus = v.object(fileFields);
/**
 * One event with its files (Event, Fees, Travel emergency, in that order; only the ones the person may see and the event has). `current`
 * is false once the event left the window: its files are frozen (kept in Drive, no longer updated).
 */
const eventStatus = v.object({ eventId: v.id("events"), eventName: v.string(), eventStartsAt: v.number(), current: v.boolean(), files: v.array(fileStatus) });
type FileStatus = Infer<typeof fileStatus>;

/** Most events the card lists (current events first, then the most recent frozen ones). */
const EVENTS_LISTED = 60;
/** Most stored files read per event kind for the card. */
const EVENT_FILES_READ = 200;

const recreatedNote = (file: Doc<"sheetExportFiles"> | null) => (file?.recreatedAt ? (file.recreatedWhy === "moved" ? "This spreadsheet was no longer in its folder, so Venom Status made a new one there. The old one is still in Google Drive." : "This spreadsheet was missing in Google Drive, so Venom Status made it again.") : null);

/**
 * The last season archive for the card. Everyone sees a finished move; only a Coach (who can do something about it) sees that a move
 * stopped partway or was skipped.
 */
function archiveStatus(row: Doc<"sheetArchives"> | null, coach: boolean): { label: string; state: "done" | "partial" | "skipped" } | null {
  if (!row) return null;
  if (row.state === "done") return row.moved > 0 ? { label: row.label, state: "done" } : null;
  if (coach && (row.state === "partial" || row.state === "skipped")) return { label: row.label, state: row.state };
  return null;
}

/** What the Reports card shows. Files in folders a person can't see (Money, Health) are omitted entirely; kinds that aren't ready are never listed. */
export const status = query({
  args: {},
  returns: v.object({
    canUpdate: v.boolean(), canSetUp: v.boolean(), enabled: v.boolean(), connected: v.boolean(),
    serviceAccountEmail: v.union(v.string(), v.null()), credentialsReady: v.boolean(),
    folders: v.union(v.null(), v.object({ general: v.string(), money: v.string(), health: v.string(), events: v.union(v.string(), v.null()) })),
    run: v.union(v.null(), v.object({ state: v.union(v.literal("running"), v.literal("done"), v.literal("partial"), v.literal("stopped")), total: v.number(), finished: v.number(), skipped: v.number(), leaseExpiresAt: v.number() })),
    archive: v.union(v.null(), v.object({ label: v.string(), state: v.union(v.literal("done"), v.literal("partial"), v.literal("skipped")) })),
    lastSuccessAt: v.union(v.number(), v.null()), lastTriedAt: v.union(v.number(), v.null()), files: v.array(fileStatus), events: v.array(eventStatus),
  }),
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (!isCoachOrTravelLead(actor)) throw new ConvexError("Only a Coach or Travel Lead can see the team spreadsheets.");
    const canSetUp = actor.role === "coach";
    const now = Date.now();
    const settings = await ctx.db.query("sheetExportSettings").first();
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    const latest = await ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first();
    const lastDone = await ctx.db.query("sheetExportRuns").withIndex("by_state_and_startedAt", q => q.eq("state", "done")).order("desc").first();
    const lastArchive = await ctx.db.query("sheetArchives").withIndex("by_startedAt").order("desc").first();
    const runProblem = (kind: SheetFileKind, eventId: Id<"events"> | undefined) => latest?.problems?.find(item => item.kind === kind && item.eventId === eventId)?.message ?? null;
    const describe = (definition: { kind: SheetFileKind; label: string; folder: SheetFolder }, file: Doc<"sheetExportFiles"> | null, eventId?: Id<"events">): FileStatus => ({
      kind: definition.kind, title: definition.label, folder: definition.folder, name: file?.name ?? null, link: file ? spreadsheetLink(file.spreadsheetId) : null,
      updatedAt: file?.updatedAt ?? null, checkedAt: file?.checkedAt ?? null, problem: file?.lastError ?? runProblem(definition.kind, eventId), note: recreatedNote(file),
    });
    const files: FileStatus[] = [];
    const events: Infer<typeof eventStatus>[] = [];
    if (season) {
      for (const definition of readySheetKinds("team").filter(item => folderVisible(item.folder, actor))) {
        const found = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", season._id).eq("kind", definition.kind).eq("eventId", undefined)).first();
        const file = found?.archivedAt ? null : found;
        files.push(describe(definition, file));
      }
      const eventKinds = readySheetKinds("event").filter(item => folderVisible(item.folder, actor));
      if (eventKinds.length) {
        const current = await qualifyingEvents(ctx, season._id, now);
        const docs = new Map<Id<"events">, Doc<"events"> | null>(current.map(event => [event._id, event]));
        const stored = new Map<SheetFileKind, Map<Id<"events">, Doc<"sheetExportFiles">>>();
        for (const definition of eventKinds) {
          const rows = await ctx.db.query("sheetExportFiles").withIndex("by_seasonId_and_kind_and_eventId", q => q.eq("seasonId", season._id).eq("kind", definition.kind).gt("eventId", undefined)).take(EVENT_FILES_READ);
          stored.set(definition.kind, new Map(rows.filter(file => file.eventId !== undefined && !file.archivedAt).map(file => [file.eventId!, file] as const)));
        }
        const ids = new Set<Id<"events">>([...current.map(event => event._id), ...[...stored.values()].flatMap(byEvent => [...byEvent.keys()])]);
        for (const eventId of ids) {
          if (!docs.has(eventId)) docs.set(eventId, await ctx.db.get(eventId));
          const event = docs.get(eventId) ?? null;
          const isCurrent = !!event && eventQualifies(event, now);
          const eventFiles: FileStatus[] = [];
          let savedName: string | null = null;
          for (const definition of eventKinds) {
            const file = stored.get(definition.kind)?.get(eventId) ?? null;
            savedName ??= file?.name ?? null;
            // A current event lists the files it gets (made or not yet); any event lists the files already made.
            if (file || (isCurrent && event && eventKindApplies(definition.kind, event))) eventFiles.push(describe(definition, file, eventId));
          }
          // A deleted event's files are still listed (frozen) under the name they were saved with.
          if (eventFiles.length) events.push({ eventId, eventName: event?.name ?? savedName ?? "Event", eventStartsAt: event?.startsAt ?? 0, current: isCurrent, files: eventFiles });
        }
        // Current events soonest first, then frozen ones newest first.
        events.sort((a, b) => (a.current === b.current ? 0 : a.current ? -1 : 1) || (a.current ? a.eventStartsAt - b.eventStartsAt : b.eventStartsAt - a.eventStartsAt) || a.eventId.localeCompare(b.eventId));
      }
    }
    return {
      canUpdate: true, canSetUp, enabled: exportEnabled(), connected: !!settings,
      serviceAccountEmail: canSetUp ? env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ?? null : null, credentialsReady: credentialsConfigured(),
      folders: canSetUp && settings ? { general: settings.generalFolderId, money: settings.moneyFolderId, health: settings.healthFolderId, events: settings.eventsFolderId ?? null } : null,
      run: latest ? { state: latest.state, total: latest.total, finished: latest.done + latest.failed, skipped: latest.skipped ?? 0, leaseExpiresAt: latest.leaseExpiresAt } : null,
      archive: archiveStatus(lastArchive, canSetUp),
      lastSuccessAt: lastDone?.finishedAt ?? null, lastTriedAt: latest?.finishedAt ?? null, files, events: events.slice(0, EVENTS_LISTED),
    };
  },
});
