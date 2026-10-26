import { scheduleEventArchive } from "./eventArchive";
import { ConvexError, v } from "convex/values";
import { action, env, internalMutation, internalQuery, internalAction, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { hashId, serviceToken } from "./lib/calendarAuth";
import { chicagoDate, chicagoMidnight } from "./lib/calendarDates";
import { timeclockTransitionLocked } from "./lib/timeclockTransition";

const calendarBase = "https://www.googleapis.com/calendar/v3/calendars/";
const mediaMarker = "Media Support Requested";
const writeScope = "https://www.googleapis.com/auth/calendar.events";
const productionCloudUrl = "https://amicable-eel-413.convex.cloud";
const choice = v.union(v.object({ kind: v.literal("create") }), v.object({ kind: v.literal("link"), eventId: v.string() }));
const observedArgs = { eventId: v.string(), title: v.string(), location: v.string(), start: v.optional(v.number()), end: v.optional(v.number()), allDay: v.boolean(), allDayStartDate: v.optional(v.string()), allDayEndDate: v.optional(v.string()), recurring: v.boolean(), cancelled: v.boolean(), etag: v.optional(v.string()), providerUpdatedAt: v.optional(v.number()), authoritativeGone: v.optional(v.boolean()), expectedRevision: v.optional(v.number()), description: v.string() };

function configured() { return !!(env.TIMECLOCK_CALENDAR_ID && env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL && env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY); }
function writeEnabled() { return configured() && env.CONVEX_CLOUD_URL === productionCloudUrl && env.STUDENT_STATUS_CALENDAR_WRITE_ENABLED === "true"; }
function eventUrl(eventId?: string) { return `${calendarBase}${encodeURIComponent(env.TIMECLOCK_CALENDAR_ID!)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`; }
async function token(write: boolean) { return serviceToken(env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL!, env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY!, write ? writeScope : undefined); }
function calendarError(status: number) {
  if (status === 401 || status === 403) return "Venom Status can't edit Team Calendar. Ask the Calendar owner to give Venom Status editor access, then try again.";
  if (status === 404) return "The selected Calendar entry no longer exists. Choose another entry or try again.";
  if (status === 412) return "This entry changed in Team Calendar. Reload Calendar details, then try again.";
  return `Team Calendar could not be updated (error ${status}). Try again in a few minutes. If it keeps happening, contact a Coach.`;
}
function stripMarker(description: string) {
  const separator = description.includes("\r\n") ? "\r\n" : "\n";
  return description.split(/\r?\n/).filter(line => line !== mediaMarker).join(separator);
}
export function withMediaMarker(description: string, requested: boolean) {
  const other = stripMarker(description);
  const separator = description.includes("\r\n") ? "\r\n" : "\n";
  return requested ? other ? `${other}${other.endsWith(separator) ? "" : separator}${mediaMarker}` : mediaMarker : other;
}
function dateTime(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = value as { dateTime?: unknown };
  if (typeof field.dateTime !== "string") return null;
  const parsed = Date.parse(field.dateTime);
  return Number.isFinite(parsed) ? parsed : null;
}
function dateOnly(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const date = (value as { date?: unknown }).date;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ? date : null;
}
function googleDetails(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Calendar returned an invalid event.");
  const item = raw as Record<string, unknown>;
  const startDate = dateOnly(item.start), endDate = dateOnly(item.end);
  const start = dateTime(item.start) ?? (startDate ? chicagoMidnight(startDate) : null), end = dateTime(item.end) ?? (endDate ? chicagoMidnight(endDate) : null);
  return { id: typeof item.id === "string" ? item.id : "", title: typeof item.summary === "string" ? item.summary : "Untitled event", location: typeof item.location === "string" ? item.location : "", startsAt: start, endsAt: end, startDate, endDate, recurring: typeof item.recurringEventId === "string" || !!item.recurrence, parentSeries: Array.isArray(item.recurrence) && typeof item.recurringEventId !== "string", allDay: !!startDate && !!endDate, cancelled: item.status === "cancelled", etag: typeof item.etag === "string" ? item.etag : undefined, updatedAt: typeof item.updated === "string" && Number.isFinite(Date.parse(item.updated)) ? Date.parse(item.updated) : undefined, description: typeof item.description === "string" ? item.description : "" };
}
function overlap(a: number, b: number, c: number, d: number) { return a < d && c < b; }
function safeDeadlines(event: Doc<"events">, startsAt: number) {
  return {
    ...(event.signupClosesAt !== undefined && event.signupClosesAt > startsAt ? { signupClosesAt: startsAt } : {}),
    ...(event.roomDeadline !== undefined && event.roomDeadline > startsAt ? { roomDeadline: startsAt } : {}),
  };
}
function requireStaff(actor: Doc<"appUsers">) { if (actor.role !== "coach" && !actor.travelLead) throw new ConvexError("Only a Coach or Travel Lead can manage Calendar events."); }
async function boundCalendar(ctx: { runQuery: (reference: typeof internal.eventCalendar.sourceBound, args: { calendarIdHash: string }) => Promise<boolean> }) {
  return configured() && await ctx.runQuery(internal.eventCalendar.sourceBound, { calendarIdHash: await hashId(env.TIMECLOCK_CALENDAR_ID!) });
}
async function activeEvent(ctx: MutationCtx, eventId: Id<"events">) {
  const actor = await viewer(ctx); requireStaff(actor);
  const event = await ctx.db.get(eventId), season = await activeSeason(ctx);
  if (!event || event.seasonId !== season._id || event.archived) throw new ConvexError("This event is no longer active. It may have moved to Past events. Reload to see current events.");
  return { actor, event };
}
async function invalidatePermissionCoverage(ctx: MutationCtx, event: Doc<"events">, actorId: Id<"appUsers">) {
  const rows = await ctx.db.query("permissionCoverage").withIndex("by_seasonId_and_eventId", q => q.eq("seasonId", event.seasonId).eq("eventId", event._id)).take(501);
  if (rows.length > 500) throw new ConvexError("This event has too many permission forms to update its schedule here. Contact a Coach.");
  const now = Date.now();
  for (const row of rows) {
    if (row.state === "required" && row.signatureRequestedAt !== undefined) continue;
    await ctx.db.patch(row._id, { state: "required", revision: row.revision + 1, updatedAt: now, updatedBy: actorId, signatureRequestedAt: now, reason: "The event's title, place, schedule or cancellation changed, so this permission form needs a new signature.", correctionField: undefined, sealedSnapshotFormat: undefined, sealedSnapshotHash: undefined, synthetic: undefined, source: undefined });
  }
}

export const candidates = action({
  args: { startsAt: v.number(), endsAt: v.number() },
  returns: v.object({ items: v.array(v.object({ id: v.string(), title: v.string(), location: v.string(), startsAt: v.number(), endsAt: v.number(), recurring: v.boolean(), allDay: v.boolean() })), error: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.eventCalendar.authorize, {});
    if (!Number.isFinite(args.startsAt) || !Number.isFinite(args.endsAt) || args.endsAt <= args.startsAt || args.endsAt - args.startsAt > 31 * 86_400_000) throw new ConvexError("Choose an end after the start, no more than 31 days apart.");
    if (!configured()) return { items: [], error: "Team Calendar isn't set up. Contact a Coach." };
    if (!await boundCalendar(ctx)) return { items: [], error: "Team Calendar settings changed or haven't been checked yet. Try again after the next Calendar update, or contact a Coach." };
    try {
      const url = new URL(eventUrl());
      url.searchParams.set("singleEvents", "true"); url.searchParams.set("showDeleted", "false"); url.searchParams.set("timeMin", new Date(args.startsAt).toISOString()); url.searchParams.set("timeMax", new Date(args.endsAt).toISOString()); url.searchParams.set("maxResults", "100");
      const auth = `Bearer ${await token(false)}`;
      const matches: ReturnType<typeof googleDetails>[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 5; page++) {
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await fetch(url, { headers: { authorization: auth } });
        if (!response.ok) return { items: [], error: calendarError(response.status) };
        const body: unknown = await response.json();
        if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items)) return { items: [], error: "Team Calendar sent entries that couldn't be read. Try again." };
        matches.push(...body.items.map(googleDetails));
        pageToken = "nextPageToken" in body && typeof body.nextPageToken === "string" ? body.nextPageToken : undefined;
        if (!pageToken) break;
      }
      if (pageToken) return { items: [], error: "Too many Calendar events overlap this window. Narrow the dates to see all choices." };
      return { items: matches.filter(item => !!item.id && !item.cancelled && !item.parentSeries && item.startsAt !== null && item.endsAt !== null && overlap(args.startsAt, args.endsAt, item.startsAt, item.endsAt)).map(item => ({ id: item.id, title: item.title, location: item.location, startsAt: item.startsAt!, endsAt: item.endsAt!, recurring: item.recurring, allDay: item.allDay })), error: null };
    } catch { return { items: [], error: "Team Calendar could not be read. Try again." }; }
  },
});

export const authorize = internalQuery({ args: {}, returns: v.null(), handler: async ctx => { requireStaff(await viewer(ctx)); return null; } });
export const sourceBound = internalQuery({ args: { calendarIdHash: v.string() }, returns: v.boolean(), handler: async (ctx, args) => {
  const row = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
  return !!row && row.calendarIdHash === args.calendarIdHash;
} });

export const status = query({
  args: { eventId: v.id("events") },
  returns: v.object({ state: v.union(v.literal("unlinked"), v.literal("pending"), v.literal("synced"), v.literal("failed"), v.literal("conflict"), v.literal("disabled")), error: v.union(v.string(), v.null()), calendarEventId: v.union(v.string(), v.null()), mediaSupportRequested: v.boolean(), cancelled: v.boolean(), allDay: v.boolean(), recurring: v.boolean(), revision: v.number(), canReselect: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireStaff(actor);
    const event = await ctx.db.get(args.eventId), season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id) throw new ConvexError("This event is no longer in the current season. Reload to see current events.");
    const disabled = !!event.calendarChoice && !writeEnabled();
    const state: "unlinked" | "pending" | "synced" | "failed" | "conflict" | "disabled" = !event.calendarChoice ? "unlinked" : disabled ? "disabled" : event.calendarSyncState ?? "pending";
    return { state, error: disabled ? "Calendar updates are turned off in this copy of Venom Status, so changes here won't reach Team Calendar." : event.calendarSyncError ?? null, calendarEventId: event.calendarEventId ?? null, mediaSupportRequested: event.mediaSupportRequested ?? false, cancelled: event.cancelled ?? false, allDay: !!event.calendarAllDayStartDate, recurring: event.calendarRecurring ?? false, revision: event.calendarRevision ?? 0, canReselect: event.calendarChoice === "link" && event.calendarSyncState === "failed" && !!event.calendarLinkReplaceable && !event.calendarEtag };
  },
});

export const connect = mutation({
  args: { eventId: v.id("events"), calendarChoice: choice }, returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, event } = await activeEvent(ctx, args.eventId);
    const replacing = event.calendarChoice === "link" && event.calendarSyncState === "failed" && !!event.calendarLinkReplaceable && !event.calendarEtag;
    if (event.calendarChoice && !replacing) throw new ConvexError("This event is already connected to Team Calendar. Reload to see it.");
    if (replacing) {
      const oldClaim = await ctx.db.query("eventCalendarClaims").withIndex("by_eventId", q => q.eq("eventId", event._id)).unique();
      if (oldClaim) await ctx.db.delete(oldClaim._id);
    }
    if (args.calendarChoice.kind === "link" && (!args.calendarChoice.eventId || args.calendarChoice.eventId.length > 512)) throw new ConvexError("Choose a Calendar entry from the list, then try again.");
    if (args.calendarChoice.kind === "link") {
      const selectedId = args.calendarChoice.eventId;
      const existing = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", selectedId)).unique();
      if (existing) throw new ConvexError("This Calendar entry is already connected to another event. Choose a different entry.");
      await ctx.db.insert("eventCalendarClaims", { calendarEventId: args.calendarChoice.eventId, eventId: event._id });
    }
    const revision = (event.calendarRevision ?? 0) + 1;
    await ctx.db.patch(event._id, { calendarChoice: args.calendarChoice.kind, calendarEventId: args.calendarChoice.kind === "link" ? args.calendarChoice.eventId : undefined, calendarSyncState: "pending", calendarSyncError: undefined, calendarLinkReplaceable: undefined, calendarRevision: revision, calendarActorId: actor._id });
    await ctx.scheduler.runAfter(0, internal.eventCalendar.push, { eventId: event._id, revision });
    await audit(ctx, actor, "events", event._id, "connectCalendar", null, args.calendarChoice);
    return null;
  },
});

export const update = mutation({
  args: { eventId: v.id("events"), expectedRevision: v.optional(v.number()), name: v.optional(v.string()), destination: v.optional(v.string()), startsAt: v.optional(v.number()), endsAt: v.optional(v.number()), mediaSupportRequested: v.optional(v.boolean()), cancelled: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, event } = await activeEvent(ctx, args.eventId);
    if (event.calendarChoice && args.expectedRevision !== (event.calendarRevision ?? 0)) throw new ConvexError("This event changed since you opened it. Reload to see the latest, then try again.");
    const name = args.name?.trim() ?? event.name, destination = args.destination?.trim() ?? event.destination;
    const startsAt = args.startsAt ?? event.startsAt, endsAt = args.endsAt ?? event.endsAt;
    if (!name || name.length > 250 || destination.length > 500 || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) throw new ConvexError("Enter a title up to 250 characters, a place up to 500, and an end time after the start.");
    if (!event.calendarChoice && (args.name !== undefined || args.destination !== undefined || args.startsAt !== undefined || args.endsAt !== undefined)) throw new ConvexError("Connect this event to Team Calendar before changing its title, place or schedule.");
    if (event.calendarChoice === "link" && !event.calendarEtag && (args.name !== undefined || args.destination !== undefined || args.startsAt !== undefined || args.endsAt !== undefined)) throw new ConvexError("Wait for the Team Calendar connection to finish before changing the title, place or schedule.");
    const material = name !== event.name || destination !== event.destination || startsAt !== event.startsAt || endsAt !== event.endsAt || (args.cancelled ?? event.cancelled ?? false) !== (event.cancelled ?? false);
    if (material) await invalidatePermissionCoverage(ctx, event, actor._id);
    const revision = (event.calendarRevision ?? 0) + 1;
    await ctx.db.patch(event._id, { name, destination, startsAt, endsAt, ...safeDeadlines(event, startsAt), mediaSupportRequested: args.mediaSupportRequested ?? event.mediaSupportRequested ?? false, cancelled: args.cancelled ?? event.cancelled ?? false, ...(event.calendarChoice ? { calendarSyncState: "pending" as const, calendarSyncError: undefined, calendarRevision: revision, calendarActorId: actor._id } : {}) });
    if (endsAt !== event.endsAt) await scheduleEventArchive(ctx, event._id);
    if (args.cancelled && !event.cancelled) await ctx.runMutation(internal.eventEnrollment.stopCancelledEnrollment, { eventId: event._id });
    if (event.calendarChoice) await ctx.scheduler.runAfter(0, internal.eventCalendar.push, { eventId: event._id, revision });
    await audit(ctx, actor, "events", event._id, "updateCalendarDetails", { name: event.name, destination: event.destination, startsAt: event.startsAt, endsAt: event.endsAt, mediaSupportRequested: event.mediaSupportRequested, cancelled: event.cancelled }, { name, destination, startsAt, endsAt, mediaSupportRequested: args.mediaSupportRequested ?? event.mediaSupportRequested, cancelled: args.cancelled ?? event.cancelled });
    return null;
  },
});

export const retry = mutation({ args: { eventId: v.id("events") }, returns: v.null(), handler: async (ctx, args) => {
  const { actor, event } = await activeEvent(ctx, args.eventId);
  if (!event.calendarChoice) throw new ConvexError("Connect this event to Team Calendar first.");
  const revision = (event.calendarRevision ?? 0) + 1;
  await ctx.db.patch(event._id, { calendarRevision: revision, calendarSyncState: "pending", calendarSyncError: undefined, calendarActorId: actor._id, calendarReconcileOnRetry: event.calendarSyncState === "conflict" });
  await ctx.scheduler.runAfter(0, internal.eventCalendar.push, { eventId: event._id, revision });
  return null;
} });

export const pushSnapshot = internalQuery({ args: { eventId: v.id("events"), revision: v.number() }, returns: v.union(v.null(), v.object({ eventId: v.id("events"), choice: v.union(v.literal("create"), v.literal("link")), calendarEventId: v.union(v.string(), v.null()), etag: v.union(v.string(), v.null()), name: v.string(), destination: v.string(), startsAt: v.number(), endsAt: v.number(), media: v.boolean(), cancelled: v.boolean(), reconcile: v.boolean(), revision: v.number() })), handler: async (ctx, args) => {
  const event = await ctx.db.get(args.eventId);
  if (!event?.calendarChoice || event.calendarRevision !== args.revision || event.calendarSyncState !== "pending" || event.archived) return null;
  const season = await activeSeason(ctx);
  if (event.seasonId !== season._id || await timeclockTransitionLocked(ctx, season._id)) return null;
  return { eventId: event._id, choice: event.calendarChoice, calendarEventId: event.calendarEventId ?? null, etag: event.calendarEtag ?? null, name: event.name, destination: event.destination, startsAt: event.startsAt, endsAt: event.endsAt, media: event.mediaSupportRequested ?? false, cancelled: event.cancelled ?? false, reconcile: event.calendarReconcileOnRetry ?? false, revision: args.revision };
} });

export const finishPush = internalMutation({ args: { eventId: v.id("events"), revision: v.number(), calendarEventId: v.optional(v.string()), etag: v.optional(v.string()), providerUpdatedAt: v.optional(v.number()), error: v.optional(v.string()), conflict: v.optional(v.boolean()), replaceable: v.optional(v.boolean()), observed: v.optional(v.object({ title: v.string(), location: v.string(), startsAt: v.number(), endsAt: v.number(), cancelled: v.boolean(), media: v.boolean(), startDate: v.optional(v.string()), endDate: v.optional(v.string()), recurring: v.boolean() })) }, returns: v.null(), handler: async (ctx, args) => {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.calendarRevision !== args.revision) return null;
  if (args.error) await ctx.db.patch(event._id, { calendarSyncState: args.conflict ? "conflict" : "failed", calendarSyncError: args.error, calendarLinkReplaceable: args.replaceable ?? false });
  else {
    const observed = args.observed;
    if (observed && (observed.title !== event.name || observed.location !== event.destination || observed.startsAt !== event.startsAt || observed.endsAt !== event.endsAt || observed.cancelled !== (event.cancelled ?? false))) await invalidatePermissionCoverage(ctx, event, event.calendarActorId!);
    if (args.calendarEventId) {
      const claim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", args.calendarEventId!)).unique();
      if (claim && claim.eventId !== event._id) throw new ConvexError("This Calendar entry is already connected to another event. Choose a different entry.");
      if (!claim) await ctx.db.insert("eventCalendarClaims", { calendarEventId: args.calendarEventId, eventId: event._id });
    }
    await ctx.db.patch(event._id, { calendarEventId: args.calendarEventId ?? event.calendarEventId, calendarEtag: args.etag, calendarProviderUpdatedAt: args.providerUpdatedAt ?? event.calendarProviderUpdatedAt, calendarSyncState: "synced", calendarSyncError: undefined, calendarLinkReplaceable: undefined, calendarReconcileOnRetry: undefined, calendarRevision: args.revision + (observed ? 1 : 0), ...(observed ? { name: observed.title, destination: observed.location, startsAt: observed.startsAt, endsAt: observed.endsAt, ...safeDeadlines(event, observed.startsAt), cancelled: observed.cancelled, mediaSupportRequested: observed.media, calendarAllDayStartDate: observed.startDate, calendarAllDayEndDate: observed.endDate, calendarRecurring: observed.recurring } : {}) });
    if (observed && observed.endsAt !== event.endsAt) await scheduleEventArchive(ctx, event._id);
    if (observed?.cancelled && !event.cancelled) await ctx.runMutation(internal.eventEnrollment.stopCancelledEnrollment, { eventId: event._id });
  }
  return null;
} });

export const push = internalAction({ args: { eventId: v.id("events"), revision: v.number() }, returns: v.null(), handler: async (ctx, args) => {
  const snapshot = await ctx.runQuery(internal.eventCalendar.pushSnapshot, args);
  if (!snapshot) return null;
  const fail = async (error: string, conflict = false, replaceable = false) => ctx.runMutation(internal.eventCalendar.finishPush, { ...args, error, conflict, replaceable });
  if (!writeEnabled()) { await fail("Calendar updates are turned off in this copy of Venom Status, so changes here won't reach Team Calendar."); return null; }
  if (!await boundCalendar(ctx)) { await fail("Team Calendar settings changed or haven't been checked yet. Try again after the next Calendar update, or contact a Coach.", true); return null; }
  try {
    const auth = `Bearer ${await token(true)}`;
    if (snapshot.reconcile && snapshot.calendarEventId) {
      const response = await fetch(eventUrl(snapshot.calendarEventId), { headers: { authorization: auth } });
      if (!response.ok) { await fail(calendarError(response.status), false, response.status === 404); return null; }
      const detail = googleDetails(await response.json());
      if (detail.parentSeries || (!detail.cancelled && (detail.startsAt === null || detail.endsAt === null))) { await fail("This Calendar entry has a schedule Venom Status can't use. Fix it in Team Calendar, then try again.", true); return null; }
      await ctx.runMutation(internal.eventCalendar.finishPush, { ...args, calendarEventId: detail.id, etag: detail.etag, providerUpdatedAt: detail.updatedAt, observed: { title: detail.cancelled ? snapshot.name : detail.title, location: detail.cancelled ? snapshot.destination : detail.location, startsAt: detail.startsAt ?? snapshot.startsAt, endsAt: detail.endsAt ?? snapshot.endsAt, cancelled: detail.cancelled, media: detail.cancelled ? snapshot.media : detail.description.split(/\r?\n/).some(line => line.trim() === mediaMarker), startDate: detail.startDate ?? undefined, endDate: detail.endDate ?? undefined, recurring: detail.recurring } });
      return null;
    }
    if (snapshot.choice === "link" && !snapshot.etag) {
      const response = await fetch(eventUrl(snapshot.calendarEventId!), { headers: { authorization: auth } });
      if (!response.ok) { await fail(calendarError(response.status), false, response.status === 404); return null; }
      const detail = googleDetails(await response.json());
      if (detail.parentSeries || detail.cancelled || detail.startsAt === null || detail.endsAt === null) { await fail("Choose one active, dated Calendar entry. A whole repeating series can't be connected.", false, true); return null; }
      if (!overlap(snapshot.startsAt, snapshot.endsAt, detail.startsAt, detail.endsAt)) { await fail("The Calendar event no longer overlaps this event. Select a different Calendar event.", false, true); return null; }
      const description = withMediaMarker(detail.description, snapshot.media);
      let etag = detail.etag;
      let updatedAt = detail.updatedAt;
      if (description !== detail.description || snapshot.cancelled) {
        const patched = await fetch(eventUrl(detail.id), { method: "PATCH", headers: { authorization: auth, "content-type": "application/json", "if-match": detail.etag ?? "" }, body: JSON.stringify(snapshot.cancelled ? { status: "cancelled" } : { description }) });
        if (!patched.ok) { await fail(calendarError(patched.status), patched.status === 412); return null; }
        const patchedDetail = googleDetails(await patched.json());
        etag = patchedDetail.etag;
        updatedAt = patchedDetail.updatedAt;
      }
      await ctx.runMutation(internal.eventCalendar.finishPush, { ...args, calendarEventId: detail.id, etag, providerUpdatedAt: updatedAt, observed: { title: detail.title, location: detail.location, startsAt: detail.startsAt, endsAt: detail.endsAt, cancelled: snapshot.cancelled, media: snapshot.cancelled ? detail.description.split(/\r?\n/).some(line => line.trim() === mediaMarker) : snapshot.media, startDate: detail.startDate ?? undefined, endDate: detail.endDate ?? undefined, recurring: detail.recurring } });
      return null;
    }
    if (snapshot.choice === "create" && !snapshot.calendarEventId) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot.eventId));
      const id = "ss" + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 40);
      const response = await fetch(eventUrl(), { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ id, summary: snapshot.name, location: snapshot.destination, start: { dateTime: new Date(snapshot.startsAt).toISOString() }, end: { dateTime: new Date(snapshot.endsAt).toISOString() }, description: snapshot.media ? mediaMarker : "", extendedProperties: { private: { studentStatusEventId: snapshot.eventId } } }) });
      if (response.status === 409) {
        const existingResponse = await fetch(eventUrl(id), { headers: { authorization: auth } });
        if (!existingResponse.ok) { await fail(calendarError(existingResponse.status)); return null; }
        const existingRaw: unknown = await existingResponse.json();
        const props = existingRaw && typeof existingRaw === "object" && "extendedProperties" in existingRaw ? existingRaw.extendedProperties as { private?: { studentStatusEventId?: string } } : undefined;
        if (props?.private?.studentStatusEventId !== snapshot.eventId) { await fail("This Calendar entry is connected to a different event. Choose another entry or contact a Coach.", true); return null; }
        const existing = googleDetails(existingRaw);
        if (!existing.etag) { await fail("Team Calendar didn't return the latest copy of this entry. Try again.", true); return null; }
        if (existing.cancelled && !snapshot.cancelled) { await fail("This entry was canceled in Team Calendar. Reload Calendar details before editing.", true); return null; }
        if (existing.cancelled && snapshot.cancelled) { await ctx.runMutation(internal.eventCalendar.finishPush, { ...args, calendarEventId: id, etag: existing.etag, providerUpdatedAt: existing.updatedAt }); return null; }
        const patched = await fetch(eventUrl(id), { method: "PATCH", headers: { authorization: auth, "content-type": "application/json", "if-match": existing.etag }, body: JSON.stringify(snapshot.cancelled ? { status: "cancelled" } : { summary: snapshot.name, location: snapshot.destination, start: { dateTime: new Date(snapshot.startsAt).toISOString() }, end: { dateTime: new Date(snapshot.endsAt).toISOString() }, description: withMediaMarker(existing.description, snapshot.media) }) });
        if (!patched.ok) { await fail(calendarError(patched.status), patched.status === 412); return null; }
        const latest = googleDetails(await patched.json());
        await ctx.runMutation(internal.eventCalendar.finishPush, { ...args, calendarEventId: id, etag: latest.etag, providerUpdatedAt: latest.updatedAt });
        return null;
      }
      if (!response.ok) { await fail(calendarError(response.status)); return null; }
      let detail = googleDetails(await response.json());
      if (snapshot.cancelled) {
        const patched = await fetch(eventUrl(detail.id), { method: "PATCH", headers: { authorization: auth, "content-type": "application/json", "if-match": detail.etag ?? "" }, body: JSON.stringify({ status: "cancelled" }) });
        if (!patched.ok) { await fail(calendarError(patched.status), patched.status === 412); return null; }
        detail = googleDetails(await patched.json());
      }
      await ctx.runMutation(internal.eventCalendar.finishPush, { ...args, calendarEventId: detail.id, etag: detail.etag, providerUpdatedAt: detail.updatedAt });
      return null;
    }
    const get = await fetch(eventUrl(snapshot.calendarEventId!), { headers: { authorization: auth } });
    if (!get.ok) { await fail(calendarError(get.status)); return null; }
    const raw: unknown = await get.json(), current = googleDetails(raw);
    if (current.parentSeries || !current.etag) { await fail("A whole repeating series can't be edited here. Edit it in Team Calendar.", true); return null; }
    if (snapshot.etag && current.etag !== snapshot.etag) { await fail(calendarError(412), true); return null; }
    if (current.cancelled && !snapshot.cancelled) { await fail("This entry was canceled in Team Calendar. Reload Calendar details before editing.", true); return null; }
    if (current.cancelled && snapshot.cancelled) { await ctx.runMutation(internal.eventCalendar.finishPush, { ...args, calendarEventId: snapshot.calendarEventId!, etag: current.etag, providerUpdatedAt: current.updatedAt }); return null; }
    let start: { date: string } | { dateTime: string } = { dateTime: new Date(snapshot.startsAt).toISOString() };
    let end: { date: string } | { dateTime: string } = { dateTime: new Date(snapshot.endsAt).toISOString() };
    if (current.allDay) {
      const startDate = chicagoDate(snapshot.startsAt), endDate = chicagoDate(snapshot.endsAt);
      if (chicagoMidnight(startDate) !== snapshot.startsAt || chicagoMidnight(endDate) !== snapshot.endsAt || endDate <= startDate) { await fail("All-day event dates must remain Chicago midnight boundaries.", true); return null; }
      start = { date: startDate }; end = { date: endDate };
    }
    const body = snapshot.cancelled ? { status: "cancelled" } : { summary: snapshot.name, location: snapshot.destination, start, end, description: withMediaMarker(current.description, snapshot.media) };
    const patched = await fetch(eventUrl(snapshot.calendarEventId!), { method: "PATCH", headers: { authorization: auth, "content-type": "application/json", "if-match": current.etag }, body: JSON.stringify(body) });
    if (!patched.ok) { await fail(calendarError(patched.status), patched.status === 412); return null; }
    const detail = googleDetails(await patched.json());
    await ctx.runMutation(internal.eventCalendar.finishPush, { ...args, calendarEventId: snapshot.calendarEventId!, etag: detail.etag, providerUpdatedAt: detail.updatedAt });
  } catch { await fail("Team Calendar couldn't be updated. Check your connection and try again."); }
  return null;
} });

export const linkOwner = internalQuery({ args: { calendarEventId: v.string() }, returns: v.union(v.id("events"), v.null()), handler: async (ctx, args) => (await ctx.db.query("events").withIndex("by_calendarEventId", q => q.eq("calendarEventId", args.calendarEventId)).first())?._id ?? null });

export const linkedPage = internalQuery({ args: { cursor: v.union(v.string(), v.null()) }, returns: v.object({ ids: v.array(v.string()), cursor: v.union(v.string(), v.null()), done: v.boolean() }), handler: async (ctx, args) => {
  const page = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId").paginate({ cursor: args.cursor, numItems: 50 });
  return { ids: page.page.map(row => row.calendarEventId), cursor: page.continueCursor, done: page.isDone };
} });

export const observationRevision = internalQuery({ args: { calendarEventId: v.string() }, returns: v.union(v.number(), v.null()), handler: async (ctx, args) => {
  const claim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", args.calendarEventId)).unique();
  const event = claim ? await ctx.db.get(claim.eventId) : null;
  return event?.calendarSyncState === "synced" ? event.calendarRevision ?? 0 : null;
} });

/** A sparse cancellation has no timestamp; read the current event before applying it. */
export async function reconcileOneNow(ctx: ActionCtx, calendarEventId: string): Promise<null> {
  if (!await boundCalendar(ctx)) return null;
  const expectedRevision = await ctx.runQuery(internal.eventCalendar.observationRevision, { calendarEventId });
  if (expectedRevision === null) return null;
  const response = await fetch(eventUrl(calendarEventId), { headers: { authorization: `Bearer ${await token(false)}` } });
  if (response.status === 404) {
    await ctx.runMutation(internal.eventCalendar.applyObserved, { eventId: calendarEventId, title: "", location: "", allDay: false, recurring: false, cancelled: true, authoritativeGone: true, expectedRevision, description: "" });
    return null;
  }
  if (!response.ok) throw new Error(calendarError(response.status));
  const detail = googleDetails(await response.json());
  await ctx.runMutation(internal.eventCalendar.applyObserved, { eventId: calendarEventId, title: detail.title, location: detail.location, start: detail.startsAt ?? undefined, end: detail.endsAt ?? undefined, allDay: detail.allDay, allDayStartDate: detail.startDate ?? undefined, allDayEndDate: detail.endDate ?? undefined, recurring: detail.recurring, cancelled: detail.cancelled, etag: detail.etag, providerUpdatedAt: detail.updatedAt, authoritativeGone: detail.cancelled && detail.updatedAt === undefined, expectedRevision, description: detail.description });
  return null;
}
export const reconcileOne = internalAction({ args: { calendarEventId: v.string() }, returns: v.null(), handler: (ctx, args) => reconcileOneNow(ctx, args.calendarEventId) });

/** Full-token resets can miss old linked events; fetch every claimed event directly. */
export async function reconcileLinkedNow(ctx: ActionCtx): Promise<null> {
  if (!configured()) return null;
  if (!await boundCalendar(ctx)) throw new Error("Shared Calendar source changed before linked event reconciliation.");
  const auth = `Bearer ${await token(false)}`;
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const batch: { ids: string[]; cursor: string | null; done: boolean } = await ctx.runQuery(internal.eventCalendar.linkedPage, { cursor });
    for (const id of batch.ids) {
      const expectedRevision = await ctx.runQuery(internal.eventCalendar.observationRevision, { calendarEventId: id });
      if (expectedRevision === null) continue;
      const response = await fetch(eventUrl(id), { headers: { authorization: auth } });
      if (response.status === 404) {
        await ctx.runMutation(internal.eventCalendar.applyObserved, { eventId: id, title: "", location: "", allDay: false, recurring: false, cancelled: true, authoritativeGone: true, expectedRevision, description: "" });
        continue;
      }
      if (!response.ok) throw new Error(calendarError(response.status));
      const detail = googleDetails(await response.json());
      await ctx.runMutation(internal.eventCalendar.applyObserved, { eventId: id, title: detail.title, location: detail.location, start: detail.startsAt ?? undefined, end: detail.endsAt ?? undefined, allDay: detail.allDay, allDayStartDate: detail.startDate ?? undefined, allDayEndDate: detail.endDate ?? undefined, recurring: detail.recurring, cancelled: detail.cancelled, etag: detail.etag, providerUpdatedAt: detail.updatedAt, authoritativeGone: detail.cancelled && detail.updatedAt === undefined, expectedRevision, description: detail.description });
    }
    if (batch.done) return null;
    if (!batch.cursor) throw new Error("Calendar linked event pagination failed.");
    cursor = batch.cursor;
  }
  throw new Error("Calendar linked event reconciliation exceeded its page limit.");
}
export const reconcileLinked = internalAction({ args: {}, returns: v.null(), handler: ctx => reconcileLinkedNow(ctx) });

export const applyObserved = internalMutation({ args: observedArgs, returns: v.null(), handler: async (ctx, args) => {
  const claim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", args.eventId)).unique();
  const event = claim ? await ctx.db.get(claim.eventId) : null;
  if (!event || !event.calendarChoice || event.calendarSyncState !== "synced") return null;
  if (args.expectedRevision !== undefined && event.calendarRevision !== args.expectedRevision) return null;
  if (event.calendarProviderUpdatedAt !== undefined && !args.authoritativeGone && (args.providerUpdatedAt === undefined || args.providerUpdatedAt < event.calendarProviderUpdatedAt)) return null;
  if (event.calendarEtag && args.etag === event.calendarEtag) return null;
  if (!args.cancelled && (args.start === undefined || args.end === undefined || args.end <= args.start || args.allDay && (!args.allDayStartDate || !args.allDayEndDate))) {
    await ctx.db.patch(event._id, { calendarSyncState: "conflict", calendarSyncError: "This entry was changed in Team Calendar to a repeating, all-day or invalid time that Venom Status can't use. Fix it in Team Calendar." });
    return null;
  }
  const title = args.cancelled ? event.name : args.title;
  const location = args.cancelled ? event.destination : args.location;
  const material = title !== event.name || location !== event.destination || (!args.cancelled && (args.start !== event.startsAt || args.end !== event.endsAt)) || args.cancelled !== (event.cancelled ?? false);
  if (material) await invalidatePermissionCoverage(ctx, event, event.calendarActorId!);
  await ctx.db.patch(event._id, { name: title, destination: location, startsAt: args.start ?? event.startsAt, endsAt: args.end ?? event.endsAt, ...safeDeadlines(event, args.start ?? event.startsAt), cancelled: args.cancelled, mediaSupportRequested: args.cancelled ? event.mediaSupportRequested : args.description.split(/\r?\n/).some(line => line.trim() === mediaMarker), calendarAllDayStartDate: args.cancelled ? event.calendarAllDayStartDate : args.allDayStartDate, calendarAllDayEndDate: args.cancelled ? event.calendarAllDayEndDate : args.allDayEndDate, calendarRecurring: args.cancelled ? event.calendarRecurring : args.recurring, calendarEtag: args.etag, calendarProviderUpdatedAt: args.providerUpdatedAt ?? event.calendarProviderUpdatedAt, calendarRevision: (event.calendarRevision ?? 0) + 1, calendarSyncError: undefined });
    if (args.end !== undefined && args.end !== event.endsAt) await scheduleEventArchive(ctx, event._id);
  if (args.cancelled && !event.cancelled) await ctx.runMutation(internal.eventEnrollment.stopCancelledEnrollment, { eventId: event._id });
  return null;
} });
