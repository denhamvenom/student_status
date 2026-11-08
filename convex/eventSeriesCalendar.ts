import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { boundCalendar, calendarError, configured, eventUrl, googleDetails, MEDIA_MARKER, notifySeriesRepresentative, token, validCalendarEventId, writeEnabled } from "./eventCalendar";
import { chicagoDate, chicagoMidnight } from "./lib/calendarDates";
import { toGoogleRecurrence } from "./lib/rrule";
import { TEAM_TIME_ZONE, zonedWallTimeToUtc } from "../shared/chicago-time";
import { addDays, firstOccurrence } from "./lib/seriesRecurrence";
import { chicagoLocalDateTime, createOccurrence, GENERATE_BATCH, isOccurrence, masterIdForSeries, ruleOf, sameRecurrence, seriesAudienceStudentIds, todayKey, truncateRecurrence, windowEndKey } from "./lib/seriesGenerate";

/**
 * Google Calendar side of recurring meetings: one app series = one Google recurring master (RRULE) whose instances are
 * linked one-to-one to the series' events rows (calendarChoice "link", calendarEventId = instance id, eventCalendarClaims).
 *
 * Hard rule: an existing master's start/end/summary/location is never PATCHed; the only write to an existing master is its
 * recurrence UNTIL (truncation, or a later UNTIL from "Change end date", eventSeries.setEndDate) or deleting a master that
 * has no past instance. "This and following" always creates a new series and
 * master (eventSeries.editFuture). Instance ids are always read from events/{master}/instances, never synthesized.
 */

const instance = v.object({ id: v.string(), etag: v.optional(v.string()), key: v.string(), startsAt: v.number(), endsAt: v.number(), cancelled: v.boolean(), updatedAt: v.optional(v.number()), title: v.string(), location: v.string(), description: v.optional(v.string()) });
type Instance = { id: string; etag?: string; key: string; startsAt: number; endsAt: number; cancelled: boolean; updatedAt?: number; title: string; location: string; description?: string };

const disabledMessage = "Calendar updates are turned off in this copy of Venom Status, so changes here won't reach Team Calendar.";
const unboundMessage = "Team Calendar settings changed or haven't been checked yet. Try again after the next Calendar update, or contact a Coach.";

function parseInstance(raw: unknown): Instance | null {
  const detail = googleDetails(raw);
  const original = (raw as { originalStartTime?: { dateTime?: unknown } }).originalStartTime;
  const originalMs = typeof original?.dateTime === "string" ? Date.parse(original.dateTime) : NaN;
  if (!detail.id || !validCalendarEventId(detail.id) || !Number.isFinite(originalMs) || detail.allDay) return null;
  if (!detail.cancelled && (detail.startsAt === null || detail.endsAt === null)) return null;
  return { id: detail.id, etag: detail.etag, key: chicagoDate(originalMs), startsAt: detail.startsAt ?? originalMs, endsAt: detail.endsAt ?? originalMs, cancelled: detail.cancelled, updatedAt: detail.updatedAt, title: detail.title, location: detail.location, description: detail.description };
}

/** All instances of a master overlapping [timeMin, timeMax), canceled ones included so linked meetings see a Calendar cancellation (bounded: 4 pages of 250). */
export async function listInstances(auth: string, masterId: string, timeMin: number, timeMax: number): Promise<Instance[] | { error: string }> {
  const url = new URL(`${eventUrl(masterId)}/instances`);
  url.searchParams.set("showDeleted", "true"); url.searchParams.set("maxResults", "250");
  url.searchParams.set("timeMin", new Date(timeMin).toISOString()); url.searchParams.set("timeMax", new Date(timeMax).toISOString());
  const out: Instance[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 4; page++) {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { authorization: auth } });
    if (!response.ok) return { error: calendarError(response.status) };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items)) return { error: "Team Calendar sent meetings that couldn't be read. Try again." };
    for (const raw of body.items) { const parsed = parseInstance(raw); if (parsed) out.push(parsed); }
    pageToken = "nextPageToken" in body && typeof body.nextPageToken === "string" ? body.nextPageToken : undefined;
    if (!pageToken) return out;
  }
  return { error: "Team Calendar returned too many meetings for this series." };
}

// ---------- snapshots and small writes ----------

const snapshotValidator = v.union(v.null(), v.object({
  seriesId: v.id("eventSeries"), status: v.string(), name: v.string(), destination: v.string(), masterId: v.union(v.string(), v.null()), etag: v.union(v.string(), v.null()),
  recurrence: v.array(v.string()), storedRecurrence: v.boolean(), firstStartLocal: v.string(), firstEndLocal: v.string(), startDate: v.string(), localStartTime: v.string(), fromKey: v.string(), toKey: v.string(),
}));
type Snapshot = { seriesId: Id<"eventSeries">; status: string; name: string; destination: string; masterId: string | null; etag: string | null; recurrence: string[]; storedRecurrence: boolean; firstStartLocal: string; firstEndLocal: string; startDate: string; localStartTime: string; fromKey: string; toKey: string } | null;

export const masterSnapshot = internalQuery({
  args: { seriesId: v.id("eventSeries"), now: v.number() }, returns: snapshotValidator,
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series) return null;
    const rule = ruleOf(series);
    const first = firstOccurrence(rule);
    const today = todayKey(args.now);
    const fromKey = series.startDate > today ? series.startDate : today;
    const firstStart = first?.startsAt ?? chicagoMidnight(series.startDate);
    return {
      seriesId: series._id, status: series.status, name: series.name, destination: series.template.destination, masterId: series.calendarMasterId ?? null, etag: series.calendarEtag ?? null,
      recurrence: series.calendarRecurrence ?? toGoogleRecurrence(rule), storedRecurrence: series.calendarRecurrence !== undefined,
      firstStartLocal: chicagoLocalDateTime(firstStart), firstEndLocal: chicagoLocalDateTime(firstStart + series.durationMinutes * 60_000), startDate: series.startDate, localStartTime: series.localStartTime,
      fromKey, toKey: windowEndKey(args.now) > addDays(fromKey, 1) ? windowEndKey(args.now) : addDays(fromKey, 1),
    };
  },
});

export const markSeries = internalMutation({
  args: { seriesId: v.id("eventSeries"), status: v.optional(v.union(v.literal("active"), v.literal("ended"), v.literal("cancelled"), v.literal("needsReview"), v.literal("conflict"))), calendarSyncState: v.optional(v.union(v.literal("pending"), v.literal("synced"), v.literal("failed"), v.literal("conflict"))), error: v.optional(v.union(v.string(), v.null())), etag: v.optional(v.string()), recurrence: v.optional(v.array(v.string())), providerUpdatedAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series) return null;
    // A Coach-visible review state is never silently overwritten back to active by a background job.
    const status = args.status && !(series.status === "cancelled" || series.status === "ended") ? { status: args.status } : {};
    await ctx.db.patch(series._id, { ...status, ...(args.calendarSyncState ? { calendarSyncState: args.calendarSyncState } : {}), ...(args.error !== undefined ? { calendarError: args.error ?? undefined } : {}), ...(args.etag !== undefined ? { calendarEtag: args.etag } : {}), ...(args.recurrence ? { calendarRecurrence: args.recurrence } : {}), ...(args.providerUpdatedAt !== undefined ? { calendarProviderUpdatedAt: args.providerUpdatedAt } : {}) });
    return null;
  },
});

export const finishMaster = internalMutation({
  args: { seriesId: v.id("eventSeries"), masterId: v.string(), etag: v.optional(v.string()), recurrence: v.array(v.string()), providerUpdatedAt: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series) return false;
    const claim = await ctx.db.query("eventSeriesCalendarClaims").withIndex("by_calendarMasterId", q => q.eq("calendarMasterId", args.masterId)).unique();
    if (claim && claim.seriesId !== series._id) {
      await ctx.db.patch(series._id, { calendarSyncState: "conflict", calendarError: "This Team Calendar series is already managed by another series here." });
      return false;
    }
    if (!claim) await ctx.db.insert("eventSeriesCalendarClaims", { calendarMasterId: args.masterId, seriesId: series._id });
    await ctx.db.patch(series._id, { calendarMasterId: args.masterId, calendarEtag: args.etag, calendarRecurrence: args.recurrence, calendarProviderUpdatedAt: args.providerUpdatedAt, calendarSyncState: "synced", calendarError: undefined });
    return true;
  },
});

function linkFields(row: Doc<"events">, series: Doc<"eventSeries">, item: Instance) {
  return { calendarChoice: "link" as const, calendarEventId: item.id, calendarEtag: item.etag, calendarSyncState: "synced" as const, calendarSyncError: undefined, calendarRevision: (row.calendarRevision ?? 0) + 1, calendarActorId: series.createdBy, calendarProviderUpdatedAt: item.updatedAt, calendarRecurring: true, calendarLinkReplaceable: undefined, calendarReconcileOnRetry: undefined };
}

function differs(row: Doc<"events">, item: Instance) {
  return row.startsAt !== item.startsAt || row.endsAt !== item.endsAt || row.name !== item.title || (!row.onsite && row.destination !== item.location) || (row.cancelled ?? false) !== item.cancelled;
}

/**
 * A meeting this series already links whose Google instance was later edited or canceled there: applied through the
 * single-event observation path (eventCalendar.applyObserved), which skips rows with an app change still pushing, older
 * or same-etag observations, marks a material change seriesDetached and cancels the row (stopping its enrollment).
 */
async function reconcileClaimed(ctx: MutationCtx, owner: Doc<"events">, item: Instance, noticed: Doc<"events">[]) {
  if (item.cancelled ? owner.cancelled === true : !differs(owner, item)) return false;
  await ctx.runMutation(internal.eventCalendar.applyObserved, {
    // One Google "all events" edit changes every instance; the per-meeting notice is replaced by one per series (seriesNotice).
    suppressNotice: true,
    eventId: item.id, title: item.title, location: item.location, ...(item.cancelled ? {} : { start: item.startsAt, end: item.endsAt }), allDay: false, recurring: true, cancelled: item.cancelled,
    etag: item.etag, providerUpdatedAt: item.updatedAt, authoritativeGone: item.cancelled && item.updatedAt === undefined,
    // Instances normally carry the description; without one the row keeps its Media Support choice.
    description: item.description ?? (owner.mediaSupportRequested ? MEDIA_MARKER : ""),
  });
  const after = await ctx.db.get(owner._id);
  // Only rows the observation actually changed in a way notifyEventScheduleChange reports (time, place, cancel/restore).
  if (after && ((after.cancelled ?? false) !== (owner.cancelled ?? false) || after.startsAt !== owner.startsAt || after.endsAt !== owner.endsAt || after.destination !== owner.destination)) noticed.push(owner);
  return true;
}

/** One notice per series per linkInstances call (see eventCalendar.notifySeriesRepresentative); later rounds find nothing new. */
async function seriesNotice(ctx: MutationCtx, noticed: Doc<"events">[]) {
  await notifySeriesRepresentative(ctx, noticed);
}

async function replaceClaim(ctx: MutationCtx, eventId: Id<"events">, calendarEventId: string) {
  const old = await ctx.db.query("eventCalendarClaims").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(5);
  for (const claim of old) if (claim.calendarEventId !== calendarEventId) await ctx.db.delete(claim._id);
  if (!old.some(claim => claim.calendarEventId === calendarEventId)) await ctx.db.insert("eventCalendarClaims", { calendarEventId, eventId });
}

/**
 * Links listed instances to the series' rows, in key order. Existing rows are linked (re-pointed after a split: the old
 * claim is replaced); a one-off event already claiming an instance is converted in place; missing rows are created
 * (at most GENERATE_BATCH per call, `more` asks the caller to call again). Instances outside the rule are drift.
 */
export const linkInstances = internalMutation({
  args: { seriesId: v.id("eventSeries"), instances: v.array(instance), fromKey: v.string(), toKey: v.string(), refreshEtags: v.boolean() },
  returns: v.object({ more: v.boolean() }),
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series || !series.calendarMasterId || series.status !== "active") return { more: false };
    const rule = ruleOf(series);
    let created = 0;
    let drift: string | null = null;
    let assigned: Id<"students">[] | null = null;
    const noticed: Doc<"events">[] = [];
    for (const item of [...args.instances].sort((a, b) => a.key.localeCompare(b.key))) {
      if (item.key < args.fromKey || item.key >= args.toKey) continue;
      // After a split or "cancel following" the old master is truncated after the rows move; skip until then.
      if (series.untilDate !== undefined && item.key > series.untilDate) continue;
      if (item.cancelled) {
        // Canceled instances only matter for a meeting this series already links: canceled in Team Calendar => canceled here.
        const cancelledClaim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", item.id)).unique();
        const linked = cancelledClaim ? await ctx.db.get(cancelledClaim.eventId) : null;
        if (linked?.seriesId === series._id) await reconcileClaimed(ctx, linked, item, noticed);
        continue;
      }
      if (!isOccurrence(rule, item.key)) { drift = "Team Calendar has a meeting in this series on a day the series doesn't repeat. Review the series."; continue; }
      const row = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", series._id).eq("seriesOccurrenceKey", item.key)).first();
      const claim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", item.id)).unique();
      if (claim) {
        const owner = await ctx.db.get(claim.eventId);
        if (owner?.seriesId === series._id) {
          // Already linked: reconcile a later Google-side edit, otherwise just refresh the stored etag.
          if (await reconcileClaimed(ctx, owner, item, noticed)) continue;
          if (args.refreshEtags && item.etag && owner.calendarSyncState === "synced" && !differs(owner, item)) await ctx.db.patch(owner._id, { calendarEtag: item.etag, calendarProviderUpdatedAt: item.updatedAt ?? owner.calendarProviderUpdatedAt });
          continue;
        }
        if (owner && owner.seriesId === undefined && !row && owner.seasonId === series.seasonId) {
          // Linked earlier as a one-off (candidates/connect): convert the same row, never duplicate it.
          await ctx.db.patch(owner._id, { seriesId: series._id, seriesOccurrenceKey: item.key, seriesDetached: owner.name !== series.name || owner.startsAt !== item.startsAt || owner.endsAt !== item.endsAt, calendarRecurring: true });
          continue;
        }
        if (owner) { drift = "A Team Calendar meeting in this series is already connected to another event. Review the series."; continue; }
        await ctx.db.delete(claim._id);
      }
      if (row) {
        // A meeting canceled here without a Calendar link (e.g. by a shortened end date that was later moved back out) whose
        // instance is live again: link it and fall through to the override push below, which cancels that one instance in
        // Team Calendar (an instance exception, no notices), so the app and Calendar agree.
        await replaceClaim(ctx, row._id, item.id);
        const fields = linkFields(row, series, item);
        if (!differs(row, item)) await ctx.db.patch(row._id, fields);
        else if (row.seriesDetached || row.cancelled) {
          // The app's override wins: push it as an instance exception through the existing single-event path.
          await ctx.db.patch(row._id, { ...fields, calendarSyncState: "pending" });
          await ctx.scheduler.runAfter(0, internal.eventCalendar.push, { eventId: row._id, revision: fields.calendarRevision });
        } else {
          // A Google exception already exists for this meeting: keep Google's copy and treat the row as an override.
          await ctx.db.patch(row._id, { ...fields, startsAt: item.startsAt, endsAt: item.endsAt, name: item.title, ...(row.onsite ? {} : { destination: item.location }), seriesDetached: true });
        }
        continue;
      }
      if (item.cancelled) continue;
      if (created >= GENERATE_BATCH) { await seriesNotice(ctx, noticed); return { more: true }; }
      assigned ??= (await seriesAudienceStudentIds(ctx, series)).assigned;
      const eventId = await createOccurrence(ctx, series, item.key, { startsAt: item.startsAt, endsAt: item.endsAt, ...(item.title && item.title !== series.name ? { name: item.title } : {}), ...(!series.template.onsite && item.location !== series.template.destination ? { destination: item.location } : {}) }, assigned);
      // No row: the creator can no longer create meetings and the series was marked needsReview.
      if (!eventId) break;
      created++;
      const fresh = await ctx.db.get(eventId);
      if (fresh) {
        await replaceClaim(ctx, fresh._id, item.id);
        await ctx.db.patch(fresh._id, linkFields(fresh, series, item));
      }
    }
    await ctx.db.patch(series._id, { ...(drift ? { status: "needsReview" as const, calendarError: drift } : {}), generatedThrough: Math.max(series.generatedThrough ?? 0, chicagoMidnight(args.toKey)) });
    await seriesNotice(ctx, noticed);
    return { more: false };
  },
});

/** Before truncating an old master: rows of the new series still claiming an old-master instance lose that link. */
export const dropStaleClaims = internalMutation({
  args: { seriesId: v.id("eventSeries"), oldMasterId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", args.seriesId)).take(200);
    for (const row of rows) {
      if (!row.calendarEventId?.startsWith(`${args.oldMasterId}_`)) continue;
      const claims = await ctx.db.query("eventCalendarClaims").withIndex("by_eventId", q => q.eq("eventId", row._id)).take(5);
      for (const claim of claims) await ctx.db.delete(claim._id);
      await ctx.db.patch(row._id, { calendarChoice: undefined, calendarEventId: undefined, calendarEtag: undefined, calendarSyncState: undefined, calendarSyncError: undefined });
    }
    return null;
  },
});

// ---------- actions ----------

async function snapshot(ctx: ActionCtx, seriesId: Id<"eventSeries">): Promise<Snapshot> {
  return await ctx.runQuery(internal.eventSeriesCalendar.masterSnapshot, { seriesId, now: Date.now() });
}

/** Lists the window's instances and links them (looping while rows remain to create). */
export async function syncInstancesNow(ctx: ActionCtx, seriesId: Id<"eventSeries">, auth: string, refreshEtags: boolean): Promise<boolean> {
  const snap = await snapshot(ctx, seriesId);
  if (!snap?.masterId) return false;
  const listed = await listInstances(auth, snap.masterId, chicagoMidnight(snap.fromKey), chicagoMidnight(snap.toKey));
  if (!Array.isArray(listed)) { await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId, calendarSyncState: "failed", error: listed.error }); return false; }
  for (let round = 0; round < 30; round++) {
    const result: { more: boolean } = await ctx.runMutation(internal.eventSeriesCalendar.linkInstances, { seriesId, instances: listed, fromKey: snap.fromKey, toKey: snap.toKey, refreshEtags });
    if (!result.more) return true;
  }
  return true;
}

function privateSeriesId(raw: unknown): string | undefined {
  const props = raw && typeof raw === "object" && "extendedProperties" in raw ? (raw as { extendedProperties?: { private?: { studentStatusSeriesId?: string } } }).extendedProperties : undefined;
  return props?.private?.studentStatusSeriesId;
}

/** Creates (or recovers after a lost response) the series' master, then links its window instances. */
export async function createMasterNow(ctx: ActionCtx, seriesId: Id<"eventSeries">): Promise<boolean> {
  const snap = await snapshot(ctx, seriesId);
  if (!snap || snap.status !== "active") return false;
  const fail = async (error: string, conflict = false) => { await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId, calendarSyncState: conflict ? "conflict" : "failed", error }); return false; };
  if (!writeEnabled()) return await fail(disabledMessage);
  if (!await boundCalendar(ctx)) return await fail(unboundMessage, true);
  try {
    const auth = `Bearer ${await token(true)}`;
    const id = await masterIdForSeries(seriesId);
    let raw: unknown;
    const response = await fetch(eventUrl(), { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ id, summary: snap.name, location: snap.destination, start: { dateTime: snap.firstStartLocal, timeZone: TEAM_TIME_ZONE }, end: { dateTime: snap.firstEndLocal, timeZone: TEAM_TIME_ZONE }, recurrence: snap.recurrence, extendedProperties: { private: { studentStatusSeriesId: seriesId } } }) });
    if (response.status === 409) {
      const existing = await fetch(eventUrl(id), { headers: { authorization: auth } });
      if (!existing.ok) return await fail(calendarError(existing.status));
      raw = await existing.json();
      if (privateSeriesId(raw) !== seriesId) return await fail("This Calendar entry is connected to a different series. Contact a Coach.", true);
    } else if (!response.ok) return await fail(calendarError(response.status));
    else raw = await response.json();
    const detail = googleDetails(raw);
    const recurrence = raw && typeof raw === "object" && "recurrence" in raw && Array.isArray(raw.recurrence) ? raw.recurrence.filter((line): line is string => typeof line === "string") : snap.recurrence;
    const ok: boolean = await ctx.runMutation(internal.eventSeriesCalendar.finishMaster, { seriesId, masterId: id, etag: detail.etag, recurrence, providerUpdatedAt: detail.updatedAt });
    if (!ok) return false;
    return await syncInstancesNow(ctx, seriesId, auth, true);
  } catch { return await fail("Team Calendar couldn't be updated. Check your connection and try again."); }
}

/**
 * Ends an existing master: PATCH only its recurrence (UNTIL = untilMs, COUNT converted) with if-match, or DELETE it when
 * no instance of it is in the past. Never touches start/end/summary/location.
 */
export async function truncateMasterNow(ctx: ActionCtx, seriesId: Id<"eventSeries">, untilMs: number, deleteMaster: boolean): Promise<boolean> {
  const snap = await snapshot(ctx, seriesId);
  if (!snap?.masterId) return false;
  const fail = async (error: string, conflict = false) => { await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId, calendarSyncState: conflict ? "conflict" : "failed", error }); return false; };
  if (!writeEnabled()) return await fail(disabledMessage);
  if (!await boundCalendar(ctx)) return await fail(unboundMessage, true);
  try {
    const auth = `Bearer ${await token(true)}`;
    const current = await fetch(eventUrl(snap.masterId), { headers: { authorization: auth } });
    if (current.status === 404 || current.status === 410) { await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId, calendarSyncState: "synced", error: null }); return true; }
    if (!current.ok) return await fail(calendarError(current.status));
    const raw: unknown = await current.json();
    const detail = googleDetails(raw);
    const lines = raw && typeof raw === "object" && "recurrence" in raw && Array.isArray(raw.recurrence) ? raw.recurrence.filter((line): line is string => typeof line === "string") : [];
    const recurrence = lines.some(line => /^RRULE:/i.test(line.trim())) ? truncateRecurrence(lines, untilMs) : null;
    if (!deleteMaster && recurrence && sameRecurrence(recurrence, lines)) {
      // Already ends there (an earlier job of several quick end-date changes wrote the latest end, maybe before its own
      // result was stored here): success with no write, even when the stored copy is older.
      await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId, calendarSyncState: "synced", error: null, etag: detail.etag, recurrence: lines, providerUpdatedAt: detail.updatedAt });
      await syncInstancesNow(ctx, seriesId, auth, false);
      return true;
    }
    if (snap.storedRecurrence && !sameRecurrence(lines, snap.recurrence)) return await fail("The repeat rule was changed in Team Calendar. Review the series before changing it here.", true);
    // Never write without the master's etag: an empty if-match would overwrite a concurrent Calendar edit. Retryable.
    if (!detail.etag) return await fail("Team Calendar didn't return the latest copy of this series. Try again.");
    if (deleteMaster) {
      const deleted = await fetch(eventUrl(snap.masterId), { method: "DELETE", headers: { authorization: auth, "if-match": detail.etag } });
      if (!deleted.ok && deleted.status !== 410) return await fail(calendarError(deleted.status), deleted.status === 412);
      await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId, calendarSyncState: "synced", error: null });
      return true;
    }
    if (!recurrence) throw new Error("The series has no repeat rule to end.");
    const patched = await fetch(eventUrl(snap.masterId), { method: "PATCH", headers: { authorization: auth, "content-type": "application/json", "if-match": detail.etag }, body: JSON.stringify({ recurrence }) });
    if (!patched.ok) return await fail(calendarError(patched.status), patched.status === 412);
    const latest = googleDetails(await patched.json());
    await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId, calendarSyncState: "synced", error: null, etag: latest.etag, recurrence, providerUpdatedAt: latest.updatedAt });
    // Master writes change instance etags; store the fresh ones so the next refresh doesn't re-notify.
    await syncInstancesNow(ctx, seriesId, auth, true);
    return true;
  } catch { return await fail("Team Calendar couldn't be updated. Check your connection and try again."); }
}

export const createMaster = internalAction({ args: { seriesId: v.id("eventSeries") }, returns: v.null(), handler: async (ctx, args) => { await createMasterNow(ctx, args.seriesId); return null; } });

/** "This and following": new master first, re-point rows/claims, drop stale claims, then end the old master. */
export const splitMaster = internalAction({
  args: { oldSeriesId: v.id("eventSeries"), newSeriesId: v.id("eventSeries"), oldMasterId: v.string(), untilMs: v.number(), deleteOld: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!await createMasterNow(ctx, args.newSeriesId)) return null;
    await ctx.runMutation(internal.eventSeriesCalendar.dropStaleClaims, { seriesId: args.newSeriesId, oldMasterId: args.oldMasterId });
    await truncateMasterNow(ctx, args.oldSeriesId, args.untilMs, args.deleteOld);
    return null;
  },
});

export const truncateMaster = internalAction({
  args: { seriesId: v.id("eventSeries"), untilMs: v.number(), deleteMaster: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => { await truncateMasterNow(ctx, args.seriesId, args.untilMs, args.deleteMaster); return null; },
});

export const seriesUntil = internalQuery({
  args: { seriesId: v.id("eventSeries") }, returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await ctx.db.get(args.seriesId))?.untilDate ?? null,
});

/**
 * "Change end date": the master's recurrence gets UNTIL = the series' end date AS STORED WHEN THIS RUNS (so of several quick
 * changes the latest always wins; an older `untilMs` argument from a queued job is ignored), earlier or later than before.
 * Same if-match, recurrence-only PATCH as a truncation (start/end/summary/location are never written), skipped when the
 * master already ends there. A later UNTIL adds instances, which the follow-up instance sync links to new silent meetings.
 *
 * Concurrent jobs: after each attempt the stored end is read again. If it changed meanwhile (another end-date change
 * committed while this one wrote), or the attempt failed (e.g. 412 because another job wrote first, or a stored copy that
 * another job hadn't updated yet), it tries again with the latest end, at most SET_UNTIL_ATTEMPTS times.
 */
const SET_UNTIL_ATTEMPTS = 3;
export const setMasterUntil = internalAction({
  args: { seriesId: v.id("eventSeries"), untilMs: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => {
    for (let attempt = 0; attempt < SET_UNTIL_ATTEMPTS; attempt++) {
      const until: string | null = await ctx.runQuery(internal.eventSeriesCalendar.seriesUntil, { seriesId: args.seriesId });
      if (until === null) return null;
      const ok = await truncateMasterNow(ctx, args.seriesId, zonedWallTimeToUtc(addDays(until, 1), "00:00") - 1000, false);
      const latest: string | null = await ctx.runQuery(internal.eventSeriesCalendar.seriesUntil, { seriesId: args.seriesId });
      if (ok && latest === until) return null;
    }
    return null;
  },
});

/**
 * Daily: read the master and its window instances. A deleted master, a changed repeat rule or start (for example a Google
 * "this and following" edit) marks the series needsReview; otherwise missing window rows are created and linked.
 */
export const extendAndReconcile = internalAction({
  args: { seriesId: v.id("eventSeries") }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!configured() || !await boundCalendar(ctx)) return null;
    const snap = await snapshot(ctx, args.seriesId);
    if (!snap?.masterId || snap.status !== "active") return null;
    const review = (error: string) => ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId: args.seriesId, status: "needsReview", error });
    try {
      const auth = `Bearer ${await token(false)}`;
      const response = await fetch(eventUrl(snap.masterId), { headers: { authorization: auth } });
      if (response.status === 404 || response.status === 410) { await review("This series was deleted in Team Calendar. Review the series."); return null; }
      if (!response.ok) { await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId: args.seriesId, error: calendarError(response.status) }); return null; }
      const raw: unknown = await response.json();
      const detail = googleDetails(raw);
      const lines = raw && typeof raw === "object" && "recurrence" in raw && Array.isArray(raw.recurrence) ? raw.recurrence.filter((line): line is string => typeof line === "string") : [];
      if (detail.cancelled) { await review("This series was deleted in Team Calendar. Review the series."); return null; }
      const startLocal = detail.startsAt === null ? "" : chicagoLocalDateTime(detail.startsAt);
      if (!sameRecurrence(lines, snap.recurrence) || startLocal.slice(0, 10) !== snap.startDate || startLocal.slice(11, 16) !== snap.localStartTime) { await review("This series' repeat rule or start was changed in Team Calendar. Review the series."); return null; }
      if (detail.etag && detail.etag !== snap.etag) await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId: args.seriesId, etag: detail.etag, providerUpdatedAt: detail.updatedAt });
      await syncInstancesNow(ctx, args.seriesId, auth, false);
    } catch { await ctx.runMutation(internal.eventSeriesCalendar.markSeries, { seriesId: args.seriesId, error: "Team Calendar couldn't be read. The series will be checked again tomorrow." }); }
    return null;
  },
});
