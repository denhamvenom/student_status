import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { activeSeason, requireRole, viewer, type AppUser } from "./lib/access";
import { assertIdempotencyKey, assertNoOverlap, assertProfileId, chicagoDateKey, chicagoDayBounds, classifiedTime, HALF_HOUR_MS, MAX_EXTENSION_MS, MAX_GROUP_SIZE } from "./lib/timeclock";
import { verifyTimeclockPin } from "./lib/timeclockPin";

const occurrenceId = v.id("timeclockOccurrences");
const sessionId = v.id("timeclockSessions");
const studentId = v.id("students");
const commandResult = v.object({
  ok: v.boolean(), code: v.optional(v.string()), sessionId: v.optional(sessionId), occurrenceId: v.optional(occurrenceId), existing: v.optional(v.boolean()), revision: v.optional(v.number()), selectedSessionId: v.optional(v.union(sessionId, v.null())), studentId: v.optional(studentId), limit: v.optional(v.number()), at: v.optional(v.number()), count: v.optional(v.number()), effectiveEnd: v.optional(v.number()), extensionMs: v.optional(v.number()), correctionId: v.optional(v.id("timeclockCorrections")),
});
type Result = Infer<typeof commandResult>;
type ResultDetails = Omit<Result, "ok" | "code">;
const fail = (code: string, extra: ResultDetails = {}): Result => ({ ok: false, code, ...extra });
const good = (extra: ResultDetails = {}): Result => ({ ok: true, ...extra });

async function operator(ctx: QueryCtx | MutationCtx) {
  const actor = await viewer(ctx);
  requireRole(actor, "coach", "mentor");
  return actor;
}

async function reviewedStudent(ctx: MutationCtx, id: Id<"students">, seasonId: Id<"seasons">) {
  const student = await ctx.db.get(id);
  if (!student || !student.active || student.seasonId !== seasonId || !student.structuredNameReviewed || !student.firstName?.trim() || !student.lastName?.trim()) throw new Error("Student is unavailable or needs reviewed name fields.");
  return student;
}

async function command(ctx: MutationCtx, actor: AppUser, key: string, fingerprint: string, run: () => Promise<Result>): Promise<Result> {
  assertIdempotencyKey(key);
  const old = await ctx.db.query("timeclockCommands").withIndex("by_actorId_and_key", q => q.eq("actorId", actor._id).eq("key", key)).unique();
  if (old) return old.fingerprint === fingerprint ? JSON.parse(old.resultJson) as Result : fail("KEY_REUSED");
  const result = await run();
  await ctx.db.insert("timeclockCommands", { actorId: actor._id, key, fingerprint, resultJson: JSON.stringify(result), at: Date.now() });
  return result;
}

async function lockFor(ctx: MutationCtx, id: Id<"students">) {
  return await ctx.db.query("timeclockStudentLocks").withIndex("by_studentId", q => q.eq("studentId", id)).unique();
}

async function putLock(ctx: MutationCtx, id: Id<"students">, session: Id<"timeclockSessions"> | undefined, interval: Id<"timeclockIntervals"> | undefined) {
  const old = await lockFor(ctx, id);
  if (old) await ctx.db.patch(old._id, { sessionId: session, intervalId: interval });
  else await ctx.db.insert("timeclockStudentLocks", { studentId: id, sessionId: session, intervalId: interval });
}

async function closeInterval(ctx: MutationCtx, interval: Doc<"timeclockIntervals">, at: number, reason: string, actor?: Id<"appUsers">) {
  if (interval.outAt !== undefined) return;
  await ctx.db.patch(interval._id, { outAt: Math.max(at, interval.inAt), closeReason: reason, closedBy: actor });
  await putLock(ctx, interval.studentId, undefined, undefined);
}

async function closeSession(ctx: MutationCtx, session: Doc<"timeclockSessions">, at: number, reason: string, cancelled = false) {
  if (session.state !== "open") return;
  // A bounded transaction is deliberate: exceeding it rejects instead of partially closing.
  const open = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_outAt", q => q.eq("sessionId", session._id).eq("outAt", undefined)).take(MAX_GROUP_SIZE + 1);
  if (open.length > MAX_GROUP_SIZE) throw new Error("Too many open intervals to close atomically; contact a Coach.");
  for (const interval of open) await closeInterval(ctx, interval, at, reason);
  await ctx.db.patch(session._id, { state: cancelled ? "cancelled" : "closed", closedAt: at, closeReason: reason, revision: session.revision + 1, needsReview: session.needsReview || reason === "calendar_end_moved_into_past" || cancelled });
}

async function liveSession(ctx: MutationCtx, id: Id<"timeclockSessions">, now: number) {
  const session = await ctx.db.get(id);
  if (!session) return { session: null, expired: false };
  const season = await activeSeason(ctx);
  if (session.seasonId !== season._id) return { session: null, expired: false };
  if (session.state === "open" && now >= session.effectiveEnd) {
    await closeSession(ctx, session, session.effectiveEnd, "effective_end");
    return { session: null, expired: true };
  }
  return { session: session.state === "open" ? session : null, expired: false };
}

async function scheduleClose(ctx: MutationCtx, session: Doc<"timeclockSessions">, at: number, revision: number) {
  await ctx.scheduler.runAt(at, internal.timeclock.scheduledClose, { sessionId: session._id, expectedRevision: revision, expectedEnd: at });
}

export const scheduledClose = internalMutation({
  args: { sessionId, expectedRevision: v.number(), expectedEnd: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (session?.state === "open" && session.revision === args.expectedRevision && session.effectiveEnd === args.expectedEnd) await closeSession(ctx, session, session.effectiveEnd, "effective_end");
    return null;
  },
});

const calendarArgs = {
  sourceKey: v.string(), title: v.string(), allDay: v.boolean(), scheduledStart: v.optional(v.number()), scheduledEnd: v.optional(v.number()), allDayStartDate: v.optional(v.string()), allDayEndDate: v.optional(v.string()), recurringEventId: v.optional(v.string()), originalStartTime: v.optional(v.string()), providerVersion: v.optional(v.string()), providerUpdatedAt: v.optional(v.number()), cancelled: v.boolean(), observedAt: v.number(), generation: v.number(),
};
export const applyCalendarOccurrence = internalMutation({
  args: calendarArgs, returns: occurrenceId,
  handler: async (ctx, args) => {
    if (!args.sourceKey || args.sourceKey.length > 512 || !args.title.trim()) throw new Error("Invalid calendar occurrence.");
    if (!args.allDay && !args.cancelled && (!(args.scheduledStart! < args.scheduledEnd!) || !Number.isFinite(args.scheduledStart) || !Number.isFinite(args.scheduledEnd))) throw new Error("Invalid calendar window.");
    const sync = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
    if (!sync || sync.generation !== args.generation) throw new Error("Calendar refresh was superseded.");
    const season = await activeSeason(ctx);
    const existing = await ctx.db.query("timeclockOccurrences").withIndex("by_source_and_sourceKey", q => q.eq("source", "calendar").eq("sourceKey", args.sourceKey)).unique();
    if (existing?.providerUpdatedAt !== undefined && args.providerUpdatedAt !== undefined && args.providerUpdatedAt < existing.providerUpdatedAt) return existing._id;
    const now = Date.now();
    if (!existing) return await ctx.db.insert("timeclockOccurrences", { seasonId: season._id, source: "calendar", sourceKey: args.sourceKey, title: args.title.trim(), allDay: args.allDay, scheduledStart: args.scheduledStart, scheduledEnd: args.scheduledEnd, allDayStartDate: args.allDayStartDate, allDayEndDate: args.allDayEndDate, recurringEventId: args.recurringEventId, originalStartTime: args.originalStartTime, providerVersion: args.providerVersion, providerUpdatedAt: args.providerUpdatedAt, cancelled: args.cancelled, observedAt: args.observedAt, revision: 1, needsReview: false, lastSeenGeneration: args.generation });
    const session = await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", existing._id)).unique();
    if (session?.state === "open" && now >= session.effectiveEnd) await closeSession(ctx, session, session.effectiveEnd, "effective_end");
    // Google cancellation tombstones may omit the original title and time window.
    const nextStart = args.cancelled && args.scheduledStart === undefined ? existing.scheduledStart : args.scheduledStart;
    const nextEnd = args.cancelled && args.scheduledEnd === undefined ? existing.scheduledEnd : args.scheduledEnd;
    const nextAllDay = args.cancelled && args.scheduledStart === undefined ? existing.allDay : args.allDay;
    const changed = existing.scheduledStart !== nextStart || existing.scheduledEnd !== nextEnd || existing.cancelled !== args.cancelled || existing.allDay !== nextAllDay || existing.allDayStartDate !== (args.allDayStartDate ?? existing.allDayStartDate) || existing.allDayEndDate !== (args.allDayEndDate ?? existing.allDayEndDate);
    const revision = existing.revision + (changed ? 1 : 0);
    await ctx.db.patch(existing._id, { title: args.cancelled && args.scheduledStart === undefined ? existing.title : args.title.trim(), allDay: nextAllDay, scheduledStart: nextStart, scheduledEnd: nextEnd, allDayStartDate: args.allDayStartDate ?? existing.allDayStartDate, allDayEndDate: args.allDayEndDate ?? existing.allDayEndDate, recurringEventId: args.recurringEventId ?? existing.recurringEventId, originalStartTime: args.originalStartTime ?? existing.originalStartTime, providerVersion: args.providerVersion, providerUpdatedAt: args.providerUpdatedAt, cancelled: args.cancelled, observedAt: args.observedAt, revision, lastSeenGeneration: args.generation });
    if (!changed) return existing._id;
    await ctx.db.insert("timeclockScheduleRevisions", { occurrenceId: existing._id, sessionId: session?._id, revision, observedAt: args.observedAt, previousStart: existing.scheduledStart, previousEnd: existing.scheduledEnd, newStart: nextStart, newEnd: nextEnd, cause: args.cancelled ? "cancellation" : "calendar" });
    if (!session || session.state !== "open" || now >= session.effectiveEnd) return existing._id;
    if (args.cancelled) {
      await closeSession(ctx, session, now, "calendar_cancelled", true);
    } else if (session && existing.allDay) {
      // Once opened, the all-day operator-selected window is shared and fixed.
      await ctx.db.patch(session._id, { needsReview: true });
    } else if (!args.allDay && args.scheduledStart !== undefined && args.scheduledEnd !== undefined) {
      const effectiveEnd = args.scheduledEnd + session.extensionMs;
      if (existing.scheduledEnd !== args.scheduledEnd && args.scheduledEnd <= now) await closeSession(ctx, session, now, "calendar_end_moved_into_past");
      else {
        const nextRevision = session.revision + 1;
        await ctx.db.patch(session._id, { scheduledStart: args.scheduledStart, scheduledEnd: args.scheduledEnd, effectiveEnd, revision: nextRevision });
        await scheduleClose(ctx, session, effectiveEnd, nextRevision);
      }
    }
    return existing._id;
  },
});

export const reconcileCalendarGeneration = internalMutation({
  args: { generation: v.number(), cursor: v.union(v.string(), v.null()), windowStart: v.number() },
  returns: v.object({ continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const sync = await ctx.db.query("timeclockCalendarSync").withIndex("by_key", q => q.eq("key", "team")).unique();
    if (!sync || sync.generation !== args.generation) throw new Error("Calendar refresh was superseded.");
    const page = await ctx.db.query("timeclockOccurrences").withIndex("by_source_and_sourceKey", q => q.eq("source", "calendar")).paginate({ cursor: args.cursor, numItems: 50 });
    const now = Date.now();
    const startDate = chicagoDateKey(args.windowStart);
    for (const occurrence of page.page) {
      if (occurrence.lastSeenGeneration === args.generation || occurrence.cancelled) continue;
      if ((occurrence.scheduledEnd ?? -Infinity) < args.windowStart && (occurrence.allDayEndDate ?? "") < startDate) continue;
      await ctx.db.patch(occurrence._id, { cancelled: true, observedAt: now, revision: occurrence.revision + 1, needsReview: true });
      const session = await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).unique();
      await ctx.db.insert("timeclockScheduleRevisions", { occurrenceId: occurrence._id, sessionId: session?._id, revision: occurrence.revision + 1, observedAt: now, previousStart: occurrence.scheduledStart, previousEnd: occurrence.scheduledEnd, newStart: occurrence.scheduledStart, newEnd: occurrence.scheduledEnd, cause: "cancellation" });
      if (session?.state === "open") {
        if (now >= session.effectiveEnd) await closeSession(ctx, session, session.effectiveEnd, "effective_end");
        else await closeSession(ctx, session, now, "calendar_missing_on_full_refresh", true);
      }
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const openOccurrence = mutation({
  args: { occurrenceId, allDayEnd: v.optional(v.number()), key: v.string() }, returns: commandResult,
  handler: async (ctx, args): Promise<Result> => {
    const actor = await operator(ctx); const now = Date.now();
    return await command(ctx, actor, args.key, JSON.stringify(["open", args.occurrenceId, args.allDayEnd]), async () => {
      const occurrence = await ctx.db.get(args.occurrenceId);
      const season = await activeSeason(ctx);
      if (!occurrence || occurrence.seasonId !== season._id || occurrence.cancelled) return fail("UNAVAILABLE");
      const existing = await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).unique();
      if (existing) {
        const checked = await liveSession(ctx, existing._id, now);
        return checked.session ? good({ sessionId: existing._id, existing: true }) : fail("FINISHED");
      }
      if (occurrence.allDay) {
        const today = chicagoDateKey(now);
        if (!occurrence.allDayStartDate || !occurrence.allDayEndDate || today < occurrence.allDayStartDate || today >= occurrence.allDayEndDate) return fail("FINISHED");
      }
      const start = occurrence.allDay ? now : occurrence.scheduledStart;
      const end = occurrence.allDay ? args.allDayEnd : occurrence.scheduledEnd;
      if (start === undefined || end === undefined || !Number.isFinite(end) || end <= now || end <= start) return fail("INVALID_WINDOW");
      const id = await ctx.db.insert("timeclockSessions", { occurrenceId: occurrence._id, seasonId: season._id, state: "open", scheduledStart: start, scheduledEnd: end, effectiveEnd: end, extensionMs: 0, revision: 1, openedAt: now, openedBy: actor._id, needsReview: false });
      await ctx.scheduler.runAt(end, internal.timeclock.scheduledClose, { sessionId: id, expectedRevision: 1, expectedEnd: end });
      return good({ sessionId: id, existing: false });
    });
  },
});

export const createUnscheduled = mutation({
  args: { title: v.string(), durationMs: v.number(), key: v.string() }, returns: commandResult,
  handler: async (ctx, args): Promise<Result> => {
    const actor = await operator(ctx); const now = Date.now();
    return await command(ctx, actor, args.key, JSON.stringify(["manual", args.title, args.durationMs]), async () => {
      const title = args.title.trim();
      if (!title || title.length > 160 || !Number.isFinite(args.durationMs) || args.durationMs <= 0 || !Number.isSafeInteger(now + args.durationMs)) return fail("INVALID_WINDOW");
      const season = await activeSeason(ctx); const end = now + args.durationMs;
      const occurrence = await ctx.db.insert("timeclockOccurrences", { seasonId: season._id, source: "manual", sourceKey: args.key, title, allDay: false, scheduledStart: now, scheduledEnd: end, cancelled: false, observedAt: now, revision: 1, needsReview: false });
      const session = await ctx.db.insert("timeclockSessions", { occurrenceId: occurrence, seasonId: season._id, state: "open", scheduledStart: now, scheduledEnd: end, effectiveEnd: end, extensionMs: 0, revision: 1, openedAt: now, openedBy: actor._id, needsReview: false });
      await ctx.scheduler.runAt(end, internal.timeclock.scheduledClose, { sessionId: session, expectedRevision: 1, expectedEnd: end });
      return good({ occurrenceId: occurrence, sessionId: session });
    });
  },
});

export const selectConsole = mutation({
  args: { profileId: v.string(), expectedRevision: v.number(), selectedSessionId: v.optional(sessionId), pin: v.optional(v.string()) }, returns: commandResult,
  handler: async (ctx, args): Promise<Result> => {
    const actor = await operator(ctx); assertProfileId(args.profileId);
    const old = await ctx.db.query("timeclockConsoles").withIndex("by_profileId", q => q.eq("profileId", args.profileId)).unique();
    const revision = old?.revision ?? 0;
    if (revision !== args.expectedRevision) return fail("STALE_CONSOLE", { revision, selectedSessionId: old?.selectedSessionId ?? null });
    if (old?.selectedSessionId && old.selectedSessionId !== args.selectedSessionId) {
      const current = await ctx.db.get(old.selectedSessionId);
      if (current?.state === "open") {
        if (!args.pin) return fail("PIN_REQUIRED");
        const verified = await verifyTimeclockPin(ctx, actor, args.pin);
        if (!verified.ok) return fail(verified.reason === "unconfigured" ? "PIN_UNCONFIGURED" : verified.reason === "rate_limited" ? "PIN_RATE_LIMITED" : "PIN_INVALID");
      }
    }
    if (args.selectedSessionId) {
      const selected = await liveSession(ctx, args.selectedSessionId, Date.now());
      if (!selected.session) return fail(selected.expired ? "EXPIRED" : "FINISHED");
    }
    const next = revision + 1;
    if (old) await ctx.db.patch(old._id, { selectedSessionId: args.selectedSessionId, revision: next, updatedAt: Date.now() });
    else await ctx.db.insert("timeclockConsoles", { profileId: args.profileId, selectedSessionId: args.selectedSessionId, revision: next, updatedAt: Date.now() });
    return good({ revision: next, selectedSessionId: args.selectedSessionId ?? null });
  },
});

export const consoleStatus = query({
  args: { profileId: v.string() }, returns: v.object({ revision: v.number(), selectedSessionId: v.union(sessionId, v.null()), session: v.union(v.null(), v.object({ state: v.literal("open"), scheduledStart: v.number(), scheduledEnd: v.number(), effectiveEnd: v.number(), revision: v.number() })) }),
  handler: async (ctx, args) => {
    await operator(ctx); assertProfileId(args.profileId);
    const console = await ctx.db.query("timeclockConsoles").withIndex("by_profileId", q => q.eq("profileId", args.profileId)).unique();
    const session = console?.selectedSessionId ? await ctx.db.get(console.selectedSessionId) : null;
    return { revision: console?.revision ?? 0, selectedSessionId: session?.state === "open" ? session._id : null, session: session?.state === "open" ? { state: session.state, scheduledStart: session.scheduledStart, scheduledEnd: session.scheduledEnd, effectiveEnd: session.effectiveEnd, revision: session.revision } : null };
  },
});

export const todayEvents = query({
  args: { asOf: v.number() }, returns: v.array(v.object({ occurrenceId, title: v.string(), allDay: v.boolean(), scheduledStart: v.union(v.number(), v.null()), scheduledEnd: v.union(v.number(), v.null()), effectiveEnd: v.union(v.number(), v.null()), sessionId: v.union(sessionId, v.null()), state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled"), v.literal("unopened")), available: v.boolean(), revision: v.number(), needsReview: v.boolean() })),
  handler: async (ctx, args) => {
    await operator(ctx);
    const season = await activeSeason(ctx);
    const day = chicagoDayBounds(args.asOf);
    const timed = await ctx.db.query("timeclockOccurrences").withIndex("by_seasonId_and_scheduledEnd", q => q.eq("seasonId", season._id).gt("scheduledEnd", day.start)).take(501);
    const dateKey = chicagoDateKey(args.asOf);
    const allDay = await ctx.db.query("timeclockOccurrences").withIndex("by_seasonId_and_allDayStartDate", q => q.eq("seasonId", season._id).gt("allDayStartDate", "").lte("allDayStartDate", dateKey)).take(501);
    const openSessions = await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id).eq("state", "open")).take(101);
    if (timed.length > 500 || allDay.length > 500 || openSessions.length > 100) throw new Error("Too many event records for the today view.");
    const byId = new Map<Id<"timeclockOccurrences">, Doc<"timeclockOccurrences">>();
    for (const occurrence of timed) if (!occurrence.allDay && (occurrence.scheduledStart ?? Number.POSITIVE_INFINITY) < day.end) byId.set(occurrence._id, occurrence);
    for (const occurrence of allDay) if (occurrence.allDay && (occurrence.allDayEndDate ?? "") > dateKey) byId.set(occurrence._id, occurrence);
    for (const session of openSessions) {
      const occurrence = await ctx.db.get(session.occurrenceId);
      if (occurrence) byId.set(occurrence._id, occurrence);
    }
    const rows = [];
    for (const occurrence of byId.values()) {
      const session = await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).unique();
      const state: "open" | "closed" | "cancelled" | "unopened" = session?.state ?? (occurrence.cancelled ? "cancelled" : "unopened");
      rows.push({ occurrenceId: occurrence._id, title: occurrence.title, allDay: occurrence.allDay, scheduledStart: session?.scheduledStart ?? occurrence.scheduledStart ?? null, scheduledEnd: session?.scheduledEnd ?? occurrence.scheduledEnd ?? null, effectiveEnd: session?.effectiveEnd ?? null, sessionId: session?._id ?? null, state, available: !occurrence.cancelled && (session?.state === "open" ? args.asOf < session.effectiveEnd : !session && (occurrence.allDay || (occurrence.scheduledEnd ?? 0) > args.asOf)), revision: session?.revision ?? occurrence.revision, needsReview: session?.needsReview ?? occurrence.needsReview });
    }
    return rows.sort((a, b) => (a.scheduledStart ?? 0) - (b.scheduledStart ?? 0) || a.title.localeCompare(b.title));
  },
});

const expected = v.object({ studentId, intervalId: v.optional(v.union(v.id("timeclockIntervals"), v.null())), sessionId: v.optional(v.union(sessionId, v.null())) });
export const previewGroup = query({
  args: { sessionId, studentIds: v.array(studentId) }, returns: v.union(v.object({ ok: v.literal(false), code: v.string() }), v.object({ ok: v.literal(true), sessionRevision: v.number(), expected: v.array(v.object({ studentId, intervalId: v.union(v.id("timeclockIntervals"), v.null()), sessionId: v.union(sessionId, v.null()) })), conflicts: v.array(v.object({ studentId, sessionId, intervalId: v.optional(v.id("timeclockIntervals")) })) })),
  handler: async (ctx, args) => {
    await operator(ctx);
    if (args.studentIds.length > MAX_GROUP_SIZE || new Set(args.studentIds).size !== args.studentIds.length) throw new Error("Invalid group size or duplicate student.");
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.state !== "open") return { ok: false as const, code: "FINISHED" };
    const locks = await Promise.all(args.studentIds.map(id => ctx.db.query("timeclockStudentLocks").withIndex("by_studentId", q => q.eq("studentId", id)).unique()));
    return { ok: true as const, sessionRevision: session.revision, expected: locks.map((lock, i) => ({ studentId: args.studentIds[i], intervalId: lock?.intervalId ?? null, sessionId: lock?.sessionId ?? null })), conflicts: locks.flatMap((lock, i) => lock?.sessionId && lock.sessionId !== args.sessionId ? [{ studentId: args.studentIds[i], sessionId: lock.sessionId, intervalId: lock.intervalId }] : []) };
  },
});

export const clockGroup = mutation({
  args: { sessionId, mode: v.union(v.literal("in"), v.literal("out"), v.literal("transfer")), expectedRevision: v.number(), expected: v.array(expected), pin: v.optional(v.string()), key: v.string() }, returns: commandResult,
  handler: async (ctx, args): Promise<Result> => {
    const actor = await operator(ctx); const now = Date.now();
    if (args.expected.length < 1 || args.expected.length > MAX_GROUP_SIZE || new Set(args.expected.map(x => x.studentId)).size !== args.expected.length) return fail("INVALID_GROUP");
    const fingerprint = JSON.stringify(["group", args.sessionId, args.mode, args.expectedRevision, args.expected]);
    return await command(ctx, actor, args.key, fingerprint, async () => {
      const checked = await liveSession(ctx, args.sessionId, now);
      if (!checked.session) return fail(checked.expired ? "EXPIRED" : "FINISHED");
      const session = checked.session;
      if (session.revision !== args.expectedRevision) return fail("STALE_SESSION", { revision: session.revision });
      // A transfer confirmation may outlive its source session. Settle that source
      // first, commit the close, and force the console to preview the new state.
      for (const item of args.expected) {
        const lock = await lockFor(ctx, item.studentId);
        if (lock?.sessionId && lock.sessionId !== session._id) {
          const source = await ctx.db.get(lock.sessionId);
          if (source?.state === "open" && now >= source.effectiveEnd) {
            await closeSession(ctx, source, source.effectiveEnd, "effective_end");
            return fail("STALE_STUDENT", { studentId: item.studentId });
          }
        }
      }
      const locks = await Promise.all(args.expected.map(x => lockFor(ctx, x.studentId)));
      for (let i = 0; i < args.expected.length; i++) {
        const expectedInterval = args.expected[i].intervalId;
        if ((locks[i]?.intervalId ?? null) !== (expectedInterval ?? null) || args.expected[i].sessionId !== undefined && (locks[i]?.sessionId ?? null) !== args.expected[i].sessionId) return fail("STALE_STUDENT", { studentId: args.expected[i].studentId });
        await reviewedStudent(ctx, args.expected[i].studentId, session.seasonId);
        if (args.mode === "in" && locks[i]?.intervalId) return fail(locks[i]?.sessionId === session._id ? "ALREADY_IN" : "TRANSFER_REQUIRED", { studentId: args.expected[i].studentId });
        if (args.mode === "out" && locks[i]?.sessionId !== session._id) return fail("NOT_IN_EVENT", { studentId: args.expected[i].studentId });
        if (args.mode === "transfer" && locks[i]?.sessionId === session._id) return fail("TRANSFER_CONFLICT", { studentId: args.expected[i].studentId });
      }
      if (args.mode === "transfer") {
        if (!args.pin) return fail("PIN_REQUIRED");
        const verified = await verifyTimeclockPin(ctx, actor, args.pin);
        if (!verified.ok) return fail(verified.reason === "unconfigured" ? "PIN_UNCONFIGURED" : verified.reason === "rate_limited" ? "PIN_RATE_LIMITED" : "PIN_INVALID");
      }
      if (args.mode !== "out") {
        const alreadyOpen = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_outAt", q => q.eq("sessionId", session._id).eq("outAt", undefined)).take(MAX_GROUP_SIZE + 1);
        if (alreadyOpen.length + args.expected.length > MAX_GROUP_SIZE) return fail("EVENT_CAPACITY", { limit: MAX_GROUP_SIZE });
      }
      for (let i = 0; i < args.expected.length; i++) {
        const student = args.expected[i].studentId; const lock = locks[i];
        if (lock?.intervalId) {
          const interval = await ctx.db.get(lock.intervalId);
          if (!interval || interval.outAt !== undefined) throw new Error("Active interval pointer is inconsistent.");
          await closeInterval(ctx, interval, now, args.mode === "transfer" ? "transfer" : "operator", actor._id);
        }
        if (args.mode !== "out") {
          const interval = await ctx.db.insert("timeclockIntervals", { sessionId: session._id, studentId: student, inAt: now, openedBy: actor._id, openCommandKey: args.key, scheduleRevision: session.revision });
          await putLock(ctx, student, session._id, interval);
        }
      }
      return good({ at: now, count: args.expected.length });
    });
  },
});

export const clockOutAll = mutation({
  args: { sessionId, expectedRevision: v.number(), key: v.string() }, returns: commandResult,
  handler: async (ctx, args): Promise<Result> => {
    const actor = await operator(ctx); const now = Date.now();
    return await command(ctx, actor, args.key, JSON.stringify(["outAll", args.sessionId, args.expectedRevision]), async () => {
      const checked = await liveSession(ctx, args.sessionId, now);
      if (!checked.session) return fail(checked.expired ? "EXPIRED" : "FINISHED");
      if (checked.session.revision !== args.expectedRevision) return fail("STALE_SESSION", { revision: checked.session.revision });
      const open = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_outAt", q => q.eq("sessionId", args.sessionId).eq("outAt", undefined)).take(MAX_GROUP_SIZE + 1);
      if (open.length > MAX_GROUP_SIZE) return fail("GROUP_TOO_LARGE", { limit: MAX_GROUP_SIZE });
      for (const interval of open) await closeInterval(ctx, interval, now, "operator_all", actor._id);
      return good({ at: now, count: open.length });
    });
  },
});

export const extend = mutation({
  args: { sessionId, halfHours: v.number(), expectedRevision: v.number(), pin: v.string(), key: v.string() }, returns: commandResult,
  handler: async (ctx, args): Promise<Result> => {
    const actor = await operator(ctx); const now = Date.now();
    return await command(ctx, actor, args.key, JSON.stringify(["extend", args.sessionId, args.halfHours, args.expectedRevision]), async () => {
      const checked = await liveSession(ctx, args.sessionId, now);
      if (!checked.session) return fail(checked.expired ? "EXPIRED" : "FINISHED");
      const session = checked.session;
      if (session.revision !== args.expectedRevision) return fail("STALE_SESSION", { revision: session.revision });
      const addedMs = args.halfHours * HALF_HOUR_MS;
      if (!Number.isInteger(args.halfHours) || args.halfHours < 1 || session.extensionMs + addedMs > MAX_EXTENSION_MS) return fail("EXTENSION_LIMIT");
      const verified = await verifyTimeclockPin(ctx, actor, args.pin);
      if (!verified.ok) return fail(verified.reason === "unconfigured" ? "PIN_UNCONFIGURED" : verified.reason === "rate_limited" ? "PIN_RATE_LIMITED" : "PIN_INVALID");
      const end = session.effectiveEnd + addedMs; const revision = session.revision + 1;
      await ctx.db.patch(session._id, { extensionMs: session.extensionMs + addedMs, effectiveEnd: end, revision });
      await ctx.db.insert("timeclockExtensions", { sessionId: session._id, actorId: actor._id, at: now, addedMs, previousEnd: session.effectiveEnd, newEnd: end, commandKey: args.key });
      await scheduleClose(ctx, session, end, revision);
      return good({ effectiveEnd: end, extensionMs: session.extensionMs + addedMs, revision });
    });
  },
});

type PendingCorrection = { originalIntervalId?: Id<"timeclockIntervals">; targetCorrectionId?: Id<"timeclockCorrections">; kind: "add" | "replace" | "void"; inAt?: number; outAt?: number };
async function effectiveIntervals(ctx: QueryCtx | MutationCtx, session: Doc<"timeclockSessions">, student: Id<"students">, asOf: number, pending?: PendingCorrection) {
  const original = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", student)).take(501);
  const corrections = await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", session._id).eq("studentId", student)).take(501);
  if (original.length > 500 || corrections.length > 500) throw new Error("Attendance history exceeds the review limit.");
  const latest = new Map<string, Doc<"timeclockCorrections">>();
  const latestAdded = new Map<string, Doc<"timeclockCorrections">>();
  for (const correction of corrections) if (correction.originalIntervalId) latest.set(correction.originalIntervalId, correction);
  for (const correction of corrections) if (correction.targetCorrectionId) latestAdded.set(correction.targetCorrectionId, correction);
  const intervals: { inAt: number; outAt: number }[] = [];
  for (const row of original) {
    const correction = pending?.originalIntervalId === row._id ? pending : latest.get(row._id);
    if (correction?.kind === "void") continue;
    if (correction?.kind === "replace" && correction.inAt !== undefined && correction.outAt !== undefined) intervals.push({ inAt: correction.inAt, outAt: correction.outAt });
    else intervals.push({ inAt: row.inAt, outAt: row.outAt ?? (session.state === "open" ? Math.min(asOf, session.effectiveEnd) : session.closedAt ?? session.effectiveEnd) });
  }
  for (const correction of corrections) if (correction.kind === "add" && correction.inAt !== undefined && correction.outAt !== undefined) {
    const latestForAdd = pending?.targetCorrectionId === correction._id ? pending : latestAdded.get(correction._id);
    if (latestForAdd?.kind === "void") continue;
    if (latestForAdd?.kind === "replace" && latestForAdd.inAt !== undefined && latestForAdd.outAt !== undefined) intervals.push({ inAt: latestForAdd.inAt, outAt: latestForAdd.outAt });
    else intervals.push({ inAt: correction.inAt, outAt: correction.outAt });
  }
  if (pending?.kind === "add" && pending.inAt !== undefined && pending.outAt !== undefined) intervals.push({ inAt: pending.inAt, outAt: pending.outAt });
  return intervals;
}

export const summary = query({
  args: { sessionId, studentId, asOf: v.number() }, returns: v.union(v.null(), v.object({ sessionId, studentId, state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")), totalMs: v.number(), earlyMs: v.number(), scheduledMs: v.number(), extendedMs: v.number(), longestScheduledMs: v.number(), qualifies: v.boolean(), intervalCount: v.number(), needsReview: v.boolean() })),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const intervals = await effectiveIntervals(ctx, session, args.studentId, args.asOf);
    const capped = intervals.map(x => ({ inAt: x.inAt, outAt: Math.min(x.outAt, args.asOf) })).filter(x => x.outAt > x.inAt);
    return { sessionId: session._id, studentId: args.studentId, state: session.state, ...classifiedTime(capped, session.scheduledStart, session.scheduledEnd, session.effectiveEnd), intervalCount: capped.length, needsReview: session.needsReview };
  },
});

export const correctionEvidence = query({
  args: { sessionId, studentId },
  returns: v.object({ intervals: v.array(v.object({ intervalId: v.id("timeclockIntervals"), inAt: v.number(), outAt: v.union(v.number(), v.null()), openedBy: v.id("appUsers"), closedBy: v.union(v.id("appUsers"), v.null()), closeReason: v.union(v.string(), v.null()) })), corrections: v.array(v.object({ correctionId: v.id("timeclockCorrections"), originalIntervalId: v.union(v.id("timeclockIntervals"), v.null()), targetCorrectionId: v.union(v.id("timeclockCorrections"), v.null()), kind: v.union(v.literal("add"), v.literal("replace"), v.literal("void")), inAt: v.union(v.number(), v.null()), outAt: v.union(v.number(), v.null()), reason: v.string(), actorId: v.id("appUsers"), at: v.number() })) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Event session not found.");
    const originals = await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", args.sessionId).eq("studentId", args.studentId)).take(501);
    const audit = await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", args.sessionId).eq("studentId", args.studentId)).take(501);
    if (originals.length > 500 || audit.length > 500) throw new Error("Attendance history exceeds the review limit.");
    return { intervals: originals.map(x => ({ intervalId: x._id, inAt: x.inAt, outAt: x.outAt ?? null, openedBy: x.openedBy, closedBy: x.closedBy ?? null, closeReason: x.closeReason ?? null })), corrections: audit.map(x => ({ correctionId: x._id, originalIntervalId: x.originalIntervalId ?? null, targetCorrectionId: x.targetCorrectionId ?? null, kind: x.kind, inAt: x.inAt ?? null, outAt: x.outAt ?? null, reason: x.reason, actorId: x.actorId, at: x.at })) };
  },
});

export const correctInterval = mutation({
  args: { sessionId, studentId, originalIntervalId: v.optional(v.id("timeclockIntervals")), targetCorrectionId: v.optional(v.id("timeclockCorrections")), kind: v.union(v.literal("add"), v.literal("replace"), v.literal("void")), inAt: v.optional(v.number()), outAt: v.optional(v.number()), reason: v.string(), key: v.string() }, returns: commandResult,
  handler: async (ctx, args): Promise<Result> => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    // Check before command replay so an archived season cannot return a prior
    // success as if a correction were still accepted.
    const season = await activeSeason(ctx);
    const currentSession = await ctx.db.get(args.sessionId);
    if (!currentSession || currentSession.seasonId !== season._id) return fail("INVALID_SESSION");
    return await command(ctx, actor, args.key, JSON.stringify(["correct", args.sessionId, args.studentId, args.originalIntervalId, args.targetCorrectionId, args.kind, args.inAt, args.outAt, args.reason]), async () => {
      const session = await ctx.db.get(args.sessionId);
      if (!session || session.state === "open") return fail("SESSION_OPEN");
      const reason = args.reason.trim(); if (reason.length < 5 || reason.length > 1000) return fail("REASON_REQUIRED");
      if (args.kind === "add" && (args.originalIntervalId || args.targetCorrectionId) || args.kind !== "add" && Number(Boolean(args.originalIntervalId)) + Number(Boolean(args.targetCorrectionId)) !== 1) return fail("INVALID_CORRECTION");
      if (args.kind !== "void" && (!Number.isFinite(args.inAt) || !Number.isFinite(args.outAt) || args.inAt! < 0 || args.outAt! > session.effectiveEnd || args.outAt! <= args.inAt!)) return fail("INVALID_TIME");
      const student = await ctx.db.get(args.studentId);
      if (!student || student.seasonId !== session.seasonId) return fail("INVALID_STUDENT");
      if (args.originalIntervalId) {
        const original = await ctx.db.get(args.originalIntervalId);
        if (!original || original.sessionId !== session._id || original.studentId !== args.studentId) return fail("INVALID_INTERVAL");
      }
      if (args.targetCorrectionId) {
        const target = await ctx.db.get(args.targetCorrectionId);
        if (!target || target.kind !== "add" || target.sessionId !== session._id || target.studentId !== args.studentId) return fail("INVALID_CORRECTION_TARGET");
      }
      const proposed = await effectiveIntervals(ctx, session, args.studentId, Date.now(), args);
      try { assertNoOverlap(proposed); } catch { return fail("OVERLAP"); }
      // Cross-event overlap validation includes active intervals and corrected history.
      const otherOriginals = await ctx.db.query("timeclockIntervals").withIndex("by_studentId_and_inAt", q => q.eq("studentId", args.studentId)).take(501);
      const otherCorrections = await ctx.db.query("timeclockCorrections").withIndex("by_studentId_and_at", q => q.eq("studentId", args.studentId)).take(501);
      if (otherOriginals.length > 500 || otherCorrections.length > 500) return fail("HISTORY_LIMIT");
      const otherSessionIds = new Set<Id<"timeclockSessions">>([...otherOriginals.map(x => x.sessionId), ...otherCorrections.map(x => x.sessionId)]);
      otherSessionIds.delete(session._id);
      for (const otherSessionId of otherSessionIds) {
        const otherSession = await ctx.db.get(otherSessionId);
        if (!otherSession) continue;
        const effective = await effectiveIntervals(ctx, otherSession, args.studentId, Date.now());
        for (const next of proposed) for (const previous of effective) if (next.inAt < previous.outAt && previous.inAt < next.outAt) return fail("CROSS_EVENT_OVERLAP");
      }
      const id = await ctx.db.insert("timeclockCorrections", { sessionId: session._id, studentId: args.studentId, originalIntervalId: args.originalIntervalId, targetCorrectionId: args.targetCorrectionId, kind: args.kind, inAt: args.inAt, outAt: args.outAt, reason, actorId: actor._id, at: Date.now(), commandKey: args.key });
      return good({ correctionId: id });
    });
  },
});
