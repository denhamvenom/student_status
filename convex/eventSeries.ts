import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { boundCalendar, configured, eventUrl, googleDetails, invalidatePermissionCoverage, token, updateEventDetails, validCalendarEventId, writeEnabled } from "./eventCalendar";
import { syncInstancesNow } from "./eventSeriesCalendar";
import { scheduleEventArchive } from "./eventArchive";
import { activeSeason, audit, viewer, type AppUser } from "./lib/access";
import { MAX_AUDIENCE_STUDENTS, MAX_MENTOR_INVITES, prepareEventAudience } from "./lib/createEventCore";
import { notifyEventCancelled, notifyEventScheduleChange, notifyEventSeriesCreated } from "./lib/notificationTriggers";
import { savedPublicError } from "./lib/publicErrors";
import { parseGoogleRecurrence } from "./lib/rrule";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import type { AssignmentScope, SignupMode } from "./lib/eventAudienceRules";
import { chicagoLocalDateTime, generateRuleOccurrences, seriesProgress, hasOccurrenceFrom, isOccurrence, occurrenceStart, rowsFrom, ruleOf, seriesAudienceStudentIds, seriesFieldsFromRule, sessionsExistOn, todayKey, windowEndKey, windowEndMs } from "./lib/seriesGenerate";
import { addDays, firstOccurrence, occurrencesBetween, SERIES_TIME_ZONE, splitRuleAt, validateSeriesRule, type SeriesRule } from "./lib/seriesRecurrence";
import { assignSubteamMember, isSubteamMandatory } from "./lib/subteamEnrollment";
import { onsiteLocation, teamTransportEnabled } from "./lib/transportation";
import { assignWholeTeamMember } from "./lib/wholeTeam";

/**
 * Recurring Team Meetings. A series is a template plus a weekly rule (America/Chicago); its meetings are ordinary events
 * rows generated 8 weeks ahead (lib/seriesGenerate.ts) and, when on Team Calendar, linked to the instances of one Google
 * recurring master (eventSeriesCalendar.ts).
 *
 * Notifications: create sends exactly ONE notifyEventSeriesCreated (first meeting; audience students + invited Mentors).
 * Generated meetings never notify (createEventCore suppressNotifications + silent enrollment). Adopting a Google series
 * sends nothing. "This meeting only" edits use the single-event path and its notices. "This and following" and "cancel
 * following" send one representative notice for the first affected meeting only (dedupe per event), never one per meeting.
 */

const MAX_NAME = 250;

const eventType = v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team"), v.literal("Fundraiser"));
const templateArgs = {
  type: eventType, destination: v.string(), travel: v.string(), overnight: v.boolean(), roomingEnabled: v.boolean(), feeCents: v.number(),
  signupMode: v.optional(v.union(v.literal("open"), v.literal("approval"))), capacity: v.optional(v.number()), allowWithdrawal: v.boolean(), permissionRequired: v.boolean(), firstRequired: v.boolean(),
  mediaSupportRequested: v.optional(v.boolean()), isOutreach: v.optional(v.boolean()), onsite: v.optional(v.boolean()),
  audienceKind: v.union(v.literal("everyone"), v.literal("subteams"), v.literal("students"), v.literal("mentorsOnly")), audienceSubteams: v.optional(v.array(v.string())), mandatory: v.optional(v.boolean()),
  audienceStudentIds: v.optional(v.array(v.id("students"))), mentorInviteUserIds: v.optional(v.array(v.id("appUsers"))), inviteSubteamMentors: v.optional(v.boolean()), locationType: v.optional(v.union(v.literal("inPerson"), v.literal("virtual"))),
};
const ruleArgs = v.object({ startDate: v.string(), weekdays: v.array(v.number()), intervalWeeks: v.number(), localStartTime: v.string(), durationMinutes: v.number(), untilDate: v.optional(v.string()), count: v.optional(v.number()) });
type TemplateArgs = {
  type: Doc<"events">["type"]; destination: string; travel: string; overnight: boolean; roomingEnabled: boolean; feeCents: number; signupMode?: "open" | "approval"; capacity?: number;
  allowWithdrawal: boolean; permissionRequired: boolean; firstRequired: boolean; mediaSupportRequested?: boolean; isOutreach?: boolean; onsite?: boolean;
  audienceKind: "everyone" | "subteams" | "students" | "mentorsOnly"; audienceSubteams?: string[]; mandatory?: boolean; audienceStudentIds?: Id<"students">[]; mentorInviteUserIds?: Id<"appUsers">[]; inviteSubteamMentors?: boolean; locationType?: "inPerson" | "virtual";
};

/** Coach, or a Mentor with Travel Lead (a Parent's selected Travel Lead role resolves to that). A stored flag on any other role grants nothing. */
function requireSeriesStaff(user: AppUser) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can manage recurring events.");
}
function requireCoach(user: AppUser, message: string) {
  if (user.role !== "coach") throw new ConvexError(message);
}
/** Mandatory Whole Team / subteam series are Coach-only, like single events. */
function requireSeriesEditor(user: AppUser, series: Doc<"eventSeries">) {
  requireSeriesStaff(user);
  if (series.template.mandatory && (series.template.audienceKind === "everyone" || series.template.audienceKind === "subteams")) requireCoach(user, "Only a Coach can change a required series for the whole team or a subteam.");
}

/** The same audience, location and fee rules as admin.createEvent, producing the stored template. */
async function buildTemplate(ctx: MutationCtx, user: AppUser, season: Doc<"seasons">, name: string, raw: TemplateArgs) {
  if ((raw.mentorInviteUserIds?.length ?? 0) > MAX_MENTOR_INVITES || (raw.audienceStudentIds?.length ?? 0) > MAX_AUDIENCE_STUDENTS) throw new ConvexError("Choose up to 200 Mentors and up to 200 students.");
  const input: TemplateArgs & { signupMode: SignupMode; roomDeadline?: number; assignmentScope?: AssignmentScope; assignedStudentIds?: Id<"students">[] } = { ...raw, signupMode: raw.signupMode ?? "open" };
  const prepared = await prepareEventAudience(ctx, user, season, input);
  const a = prepared.args;
  if (!name.trim() || name.trim().length > MAX_NAME || !Number.isSafeInteger(a.feeCents) || a.feeCents < 0 || a.capacity !== undefined && (!Number.isSafeInteger(a.capacity) || a.capacity < 1)) throw new ConvexError("Check the series: it needs a name up to 250 characters, a fee of $0 or more, and a capacity of at least 1 if set.");
  if (a.assignmentScope === "wholeTeam" && user.role !== "coach") throw new ConvexError("Only a Coach can assign the Whole Team automatically.");
  if (a.assignmentScope === "wholeTeam" && a.capacity !== undefined) throw new ConvexError("Whole Team events include every active member. Leave capacity blank.");
  if (a.onsite && (a.overnight || a.roomingEnabled || teamTransportEnabled({ travel: a.travel }))) throw new ConvexError("On-site events happen at the DSHS STEM Center, so they can't be overnight or use team transport. Turn off overnight and choose no transportation.");
  if (a.destination.length > 500) throw new ConvexError("Enter a place up to 500 characters.");
  const template: Doc<"eventSeries">["template"] = {
    type: a.type, destination: a.onsite ? onsiteLocation : a.destination.trim(), travel: a.onsite ? onsiteLocation : a.travel, overnight: a.overnight, roomingEnabled: a.roomingEnabled, feeCents: a.feeCents,
    signupMode: a.signupMode, assignmentScope: a.assignmentScope, capacity: a.capacity, allowWithdrawal: a.allowWithdrawal, permissionRequired: a.permissionRequired, firstRequired: a.firstRequired,
    mediaSupportRequested: a.mediaSupportRequested, isOutreach: a.type === "Fundraiser" ? a.isOutreach ?? false : a.isOutreach, onsite: a.onsite,
    audienceKind: a.audienceKind, audienceSubteams: a.audienceSubteams, mandatory: a.mandatory, locationType: a.locationType,
  };
  return {
    template, audienceStudentIds: prepared.audienceStudentIds,
    mentorInviteIds: prepared.mentorInvites.filter(invite => invite.source === "individual").map(invite => invite.mentorUserId),
    subteamMentorInviteIds: prepared.mentorInvites.filter(invite => invite.source === "subteam").map(invite => invite.mentorUserId),
  };
}

function ruleFromArgs(rule: { startDate: string; weekdays: number[]; intervalWeeks: number; localStartTime: string; durationMinutes: number; untilDate?: string; count?: number }): SeriesRule {
  const out: SeriesRule = { anchorDate: rule.startDate, weekdays: rule.weekdays, intervalWeeks: rule.intervalWeeks, startLocalTime: rule.localStartTime, durationMinutes: rule.durationMinutes };
  if (rule.untilDate !== undefined) out.endsOnDate = rule.untilDate;
  if (rule.count !== undefined) out.maxOccurrences = rule.count;
  return out;
}

/** Validates the rule and anchors it on its first meeting (so Google's DTSTART week and the app's interval weeks agree). */
function normalizedRule(rule: SeriesRule): SeriesRule {
  const errors = validateSeriesRule(rule);
  if (errors.length) throw new ConvexError(errors[0]);
  const first = firstOccurrence(rule);
  if (!first) throw new ConvexError("This repeat rule has no meetings. Change the days or the end date.");
  return { ...rule, anchorDate: first.occurrenceKey };
}

function rangesOverlap(a: Doc<"eventSeries">, rule: SeriesRule) {
  const aEnd = a.untilDate ?? "9999-12-31", bEnd = rule.endsOnDate ?? "9999-12-31";
  return a.startDate <= bEnd && rule.anchorDate <= aEnd;
}

/** A new app-owned series must not duplicate a Team Calendar series already managed here (e.g. the adopted Tuesday meeting). */
async function requireNoCalendarDuplicate(ctx: MutationCtx, seasonId: Id<"seasons">, rule: SeriesRule) {
  for (const status of ["active", "needsReview", "conflict"] as const) {
    const rows = await ctx.db.query("eventSeries").withIndex("by_seasonId_and_status", q => q.eq("seasonId", seasonId).eq("status", status)).take(100);
    const clash = rows.find(row => row.calendarMasterId && row.localStartTime === rule.startLocalTime && row.weekdays.some(day => rule.weekdays.includes(day)) && rangesOverlap(row, rule));
    if (clash) throw new ConvexError(`This matches "${clash.name}", which is already on Team Calendar and managed here. Change that series instead of creating another.`);
  }
}

async function firstRow(ctx: MutationCtx, seriesId: Id<"eventSeries">) {
  return await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId)).first();
}

const createResult = v.object({ seriesId: v.id("eventSeries"), firstEventId: v.union(v.id("events"), v.null()) });

export const create = mutation({
  args: { name: v.string(), ...templateArgs, rule: ruleArgs, addToCalendar: v.optional(v.boolean()) }, returns: createResult,
  handler: async (ctx, args) => {
    if ((args.mentorInviteUserIds?.length ?? 0) > MAX_MENTOR_INVITES || (args.audienceStudentIds?.length ?? 0) > MAX_AUDIENCE_STUDENTS || args.rule.weekdays.length > 7) throw new ConvexError("Choose up to 200 Mentors, 200 students and 7 days.");
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    requireSeriesStaff(user);
    const season = await activeSeason(ctx);
    const now = Date.now();
    const rule = normalizedRule(ruleFromArgs(args.rule));
    if (args.rule.startDate < todayKey(now)) throw new ConvexError("Start the series today or later.");
    if (args.addToCalendar && !writeEnabled()) throw new ConvexError("Calendar updates are turned off in this copy of Venom Status. Create the series without Team Calendar.");
    await requireNoCalendarDuplicate(ctx, season._id, rule);
    const { name: rawName, rule: _rule, addToCalendar, ...template } = args;
    const name = rawName.trim();
    const built = await buildTemplate(ctx, user, season, name, template);
    const seriesId = await ctx.db.insert("eventSeries", {
      seasonId: season._id, createdBy: user._id, createdAt: now, name, status: "active", origin: "created", template: built.template, ...seriesFieldsFromRule(rule), templateRevision: 1,
      mentorInviteIds: built.mentorInviteIds, subteamMentorInviteIds: built.subteamMentorInviteIds, audienceStudentIds: built.audienceStudentIds, generatedThrough: 0,
      ...(addToCalendar ? { calendarSyncState: "pending" as const } : {}),
    });
    const series = (await ctx.db.get(seriesId))!;
    const { audience, assigned } = await seriesAudienceStudentIds(ctx, series);
    if (built.template.capacity !== undefined && assigned.length > built.template.capacity) throw new ConvexError("More students are required than the meeting's capacity. Choose fewer students or raise the capacity.");
    const toKey = windowEndKey(now) > addDays(rule.anchorDate, 1) ? windowEndKey(now) : addDays(rule.anchorDate, 1);
    const generated = await generateRuleOccurrences(ctx, series, rule.anchorDate, toKey);
    if (generated.more) await ctx.scheduler.runAfter(0, internal.eventSeries.generate, { seriesId, toKey });
    else await ctx.db.patch(seriesId, { generatedThrough: windowEndMs(now) });
    const first = await firstRow(ctx, seriesId);
    // Exactly one notice for the whole series.
    if (first) await notifyEventSeriesCreated(ctx, { eventId: first._id, seriesName: name, studentIds: audience, staffUserIds: [...built.mentorInviteIds, ...built.subteamMentorInviteIds] });
    if (addToCalendar) await ctx.scheduler.runAfter(0, internal.eventSeriesCalendar.createMaster, { seriesId });
    await audit(ctx, user, "eventSeries", seriesId, "create", null, { name, rule, addToCalendar: addToCalendar ?? false });
    return { seriesId, firstEventId: first?._id ?? null };
  },
});

// ---------- generation ----------

/** Continuation of rule-based generation (bounded batches). */
export const generate = internalMutation({
  args: { seriesId: v.id("eventSeries"), toKey: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series || series.status !== "active") return null;
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season || season._id !== series.seasonId) return null;
    const today = todayKey(Date.now());
    const result = await generateRuleOccurrences(ctx, series, series.startDate > today ? series.startDate : today, args.toKey);
    if (result.more) await ctx.scheduler.runAfter(0, internal.eventSeries.generate, args);
    else await ctx.db.patch(series._id, { generatedThrough: Math.max(series.generatedThrough ?? 0, windowEndMs(Date.now())) });
    return null;
  },
});

/** Daily cron: pages active series (bounded, scheduler continuation); extends windows and reconciles Calendar series. */
export const tick = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = todayKey(now), toKey = windowEndKey(now);
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    const page = await ctx.db.query("eventSeries").withIndex("by_status_and_generatedThrough", q => q.eq("status", "active")).paginate({ cursor: args.cursor, numItems: 20 });
    let delay = 0;
    for (const series of page.page) {
      if (!season || series.seasonId !== season._id) continue;
      if (!hasOccurrenceFrom(ruleOf(series), today)) { await ctx.db.patch(series._id, { status: "ended" }); continue; }
      if (series.calendarMasterId) { await ctx.scheduler.runAfter(delay, internal.eventSeriesCalendar.extendAndReconcile, { seriesId: series._id }); delay += 2_000; }
      else if ((series.generatedThrough ?? 0) < windowEndMs(now)) await ctx.scheduler.runAfter(0, internal.eventSeries.generate, { seriesId: series._id, toKey });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.eventSeries.tick, { cursor: page.continueCursor });
    return null;
  },
});

// ---------- silent enrollment (same job as eventEnrollment.run, without the per-batch assignment notice) ----------

async function stopCancelledJob(ctx: MutationCtx, event: Doc<"events">) {
  const job = await ctx.db.query("eventEnrollmentJobs").withIndex("by_eventId", q => q.eq("eventId", event._id)).unique();
  if (job && (job.state === "running" || job.state === "failed")) {
    await ctx.db.patch(job._id, { state: "cancelled", updatedAt: Date.now(), lastError: undefined });
    await ctx.db.patch(event._id, { enrollmentState: "cancelled" });
  }
  return null;
}

export const enrollPage = internalMutation({
  args: { jobId: v.id("eventEnrollmentJobs"), expectedCursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running" || job.cursor !== args.expectedCursor) return null;
    const event = await ctx.db.get(job.eventId); const actor = await ctx.db.get(job.actorId); const season = await activeSeason(ctx);
    if (event?.cancelled) return stopCancelledJob(ctx, event);
    const subteamEvent = !!event && isSubteamMandatory(event);
    if (!event || event.archived || event.seasonId !== season._id || event.signupMode !== "assigned" || (!subteamEvent && event.assignmentScope !== "wholeTeam")) throw new Error("Whole Team event is unavailable; Coach review is required.");
    if (!actor?.active || actor.role !== "coach") throw new Error("Enrollment actor is unavailable; a Coach must retry.");
    const page = await ctx.db.query("eventEnrollmentMembers").withIndex("by_jobId", q => q.eq("jobId", job._id)).paginate({ cursor: job.cursor, numItems: 25 });
    for (const member of page.page) {
      const student = await ctx.db.get(member.studentId);
      if (student) await (subteamEvent ? assignSubteamMember : assignWholeTeamMember)(ctx, actor, (await ctx.db.get(event._id))!, student, job._id);
    }
    await ctx.db.patch(job._id, { cursor: page.continueCursor, processed: job.processed + page.page.length, state: page.isDone ? "complete" : "running", updatedAt: Date.now(), lastError: undefined });
    if (page.isDone) {
      await ctx.db.patch(event._id, { enrollmentState: "complete" });
      await audit(ctx, actor, "events", event._id, "completeWholeTeamEnrollment", "running", "complete");
    } else await ctx.scheduler.runAfter(0, internal.eventSeries.runEnrollment, { jobId: job._id });
    return null;
  },
});

export const runEnrollment = internalMutation({
  args: { jobId: v.id("eventEnrollmentJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== "running") return null;
    try {
      await ctx.runMutation(internal.eventSeries.enrollPage, { jobId: job._id, expectedCursor: job.cursor });
    } catch (error) {
      await ctx.db.patch(job._id, { state: "failed", lastError: savedPublicError(error, "Enrollment failed; Coach review is required."), updatedAt: Date.now() });
      const event = await ctx.db.get(job.eventId);
      if (event) await ctx.db.patch(event._id, { enrollmentState: "failed" });
    }
    return null;
  },
});

// ---------- this meeting only ----------

async function requireOccurrence(ctx: MutationCtx, eventId: Id<"events">) {
  const user = await viewer(ctx);
  requireSeriesStaff(user);
  const event = await ctx.db.get(eventId);
  if (!event?.seriesId) throw new ConvexError("This event isn't part of a recurring series. Reload to see the latest.");
  const series = await ctx.db.get(event.seriesId);
  if (!series) throw new ConvexError("This series is no longer available. Reload to see the latest.");
  requireSeriesEditor(user, series);
  return { user, event, series };
}

/** "This meeting only": the single-event edit path; the meeting becomes a detached override (a Google instance exception). */
export const editOccurrence = mutation({
  args: { eventId: v.id("events"), expectedRevision: v.optional(v.number()), name: v.optional(v.string()), destination: v.optional(v.string()), startsAt: v.optional(v.number()), endsAt: v.optional(v.number()), mediaSupportRequested: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireOccurrence(ctx, args.eventId);
    return await updateEventDetails(ctx, args);
  },
});

/** Cancels one meeting through the single-event path (its own cancellation notice, deduplicated per meeting). */
export const cancelOccurrence = mutation({
  args: { eventId: v.id("events"), expectedRevision: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireOccurrence(ctx, args.eventId);
    return await updateEventDetails(ctx, { eventId: args.eventId, expectedRevision: args.expectedRevision, cancelled: true });
  },
});

// ---------- this and following ----------

async function requireFutureSplit(ctx: MutationCtx, seriesId: Id<"eventSeries">, fromKey: string) {
  const user = await viewer(ctx);
  const series = await ctx.db.get(seriesId);
  const season = await activeSeason(ctx);
  if (!series || series.seasonId !== season._id) throw new ConvexError("This series is no longer available. Reload to see the latest.");
  requireSeriesEditor(user, series);
  if (series.status !== "active") throw new ConvexError("This series needs review or has ended. Reload to see the latest.");
  if (fromKey <= todayKey(Date.now())) throw new ConvexError("Choose a meeting after today. Change earlier meetings one at a time.");
  const rule = ruleOf(series);
  if (!isOccurrence(rule, fromKey)) throw new ConvexError("That date isn't a meeting in this series. Reload and choose a meeting.");
  if (series.calendarMasterId && !writeEnabled()) throw new ConvexError("Calendar updates are turned off in this copy of Venom Status, so this Team Calendar series can't be changed here.");
  const rows = await rowsFrom(ctx, series._id, fromKey);
  if (await sessionsExistOn(ctx, rows)) throw new ConvexError("Attendance has already been taken for a meeting on or after that date. Choose a later meeting.");
  return { user, series, rule, rows };
}

/** Cancels a row silently (the caller sends at most one representative notice) and drops its Calendar link. */
async function cancelRowQuietly(ctx: MutationCtx, row: Doc<"events">, actorId: Id<"appUsers">) {
  if (!row.cancelled) await invalidatePermissionCoverage(ctx, row, actorId);
  const claims = await ctx.db.query("eventCalendarClaims").withIndex("by_eventId", q => q.eq("eventId", row._id)).take(5);
  for (const claim of claims) await ctx.db.delete(claim._id);
  await ctx.db.patch(row._id, { cancelled: true, calendarChoice: undefined, calendarEventId: undefined, calendarEtag: undefined, calendarSyncState: undefined, calendarSyncError: undefined });
  if (!row.cancelled) await ctx.runMutation(internal.eventEnrollment.stopCancelledEnrollment, { eventId: row._id });
}

const endArgs = v.optional(v.union(v.object({ kind: v.literal("until"), date: v.string() }), v.object({ kind: v.literal("count"), count: v.number() }), v.object({ kind: v.literal("never") })));

/**
 * "This and all following" at meeting `fromKey`: ALWAYS a split (a past master is never edited). Meetings on or after the
 * key move to a new series (same _id and key; detached overrides keep their changes), meetings no longer on the new rule
 * are canceled, and the old series ends the day before. On Team Calendar a new master is created, rows/claims re-pointed,
 * then the old master gets UNTIL = start(fromKey) - 1 s. One representative notice (first affected meeting) is sent.
 */
export const editFuture = mutation({
  args: { seriesId: v.id("eventSeries"), fromKey: v.string(), name: v.optional(v.string()), destination: v.optional(v.string()), localStartTime: v.optional(v.string()), durationMinutes: v.optional(v.number()), weekdays: v.optional(v.array(v.number())), intervalWeeks: v.optional(v.number()), end: endArgs },
  returns: v.object({ seriesId: v.id("eventSeries") }),
  handler: async (ctx, args) => {
    const { user, series, rule, rows } = await requireFutureSplit(ctx, args.seriesId, args.fromKey);
    const split = splitRuleAt(rule, args.fromKey);
    let after: SeriesRule = { ...split.after, ...(args.localStartTime !== undefined ? { startLocalTime: args.localStartTime } : {}), ...(args.durationMinutes !== undefined ? { durationMinutes: args.durationMinutes } : {}), ...(args.weekdays !== undefined ? { weekdays: args.weekdays } : {}), ...(args.intervalWeeks !== undefined ? { intervalWeeks: args.intervalWeeks } : {}) };
    if (args.end) {
      const { endsOnDate: _e, maxOccurrences: _m, ...base } = after;
      after = args.end.kind === "until" ? { ...base, endsOnDate: args.end.date } : args.end.kind === "count" ? { ...base, maxOccurrences: args.end.count } : base;
    }
    after = normalizedRule(after);
    const name = args.name?.trim() ?? series.name;
    if (!name || name.length > MAX_NAME) throw new ConvexError("Enter a name up to 250 characters.");
    const destination = series.template.onsite ? series.template.destination : args.destination?.trim() ?? series.template.destination;
    if (destination.length > 500) throw new ConvexError("Enter a place up to 500 characters.");
    const now = Date.now();
    const { _id: _oldId, _creationTime: _ct, calendarMasterId: oldMasterId, calendarEtag: _etag, calendarRecurrence: _rec, calendarSyncState: _state, calendarError: _err, calendarRevision: _rev, calendarProviderUpdatedAt: _upd, untilDate: _u, count: _c, ...copy } = series;
    // The new series is generated as the editor (who just passed requireSeriesEditor), not the original creator.
    const newSeriesId = await ctx.db.insert("eventSeries", { ...copy, createdBy: user._id, name, createdAt: now, origin: "created", status: "active", template: { ...series.template, destination }, ...seriesFieldsFromRule(after), predecessorSeriesId: series._id, templateRevision: series.templateRevision + 1, ...(oldMasterId ? { calendarSyncState: "pending" as const } : {}) });
    // The old series ends the day before the split (COUNT becomes an end date).
    await ctx.db.patch(series._id, { untilDate: addDays(args.fromKey, -1), count: undefined, ...(split.before === null ? { status: "ended" as const } : {}) });
    let representative: Doc<"events"> | null = null;
    for (const row of rows) {
      const key = row.seriesOccurrenceKey!;
      if (!isOccurrence(after, key)) { if (!row.cancelled) representative ??= row; await cancelRowQuietly(ctx, row, user._id); continue; }
      const startsAt = occurrenceStart(after, key), endsAt = startsAt + after.durationMinutes * 60_000;
      const changes = row.seriesDetached ? {} : { name, destination, startsAt, endsAt };
      const material = !row.seriesDetached && (name !== row.name || destination !== row.destination || startsAt !== row.startsAt || endsAt !== row.endsAt);
      if (material) { await invalidatePermissionCoverage(ctx, row, user._id); if (!row.cancelled) representative ??= row; }
      await ctx.db.patch(row._id, { seriesId: newSeriesId, ...changes });
      if (material && endsAt !== row.endsAt) await scheduleEventArchive(ctx, row._id);
    }
    if (representative) {
      // At most one notice per person for the whole operation: the first affected meeting stands for the rest.
      if (isOccurrence(after, representative.seriesOccurrenceKey!)) await notifyEventScheduleChange(ctx, representative);
      else await notifyEventCancelled(ctx, { eventId: representative._id });
    }
    const fresh = (await ctx.db.get(newSeriesId))!;
    const toKey = windowEndKey(now);
    const generated = await generateRuleOccurrences(ctx, fresh, after.anchorDate, toKey);
    if (generated.more) await ctx.scheduler.runAfter(0, internal.eventSeries.generate, { seriesId: newSeriesId, toKey });
    else await ctx.db.patch(newSeriesId, { generatedThrough: windowEndMs(now) });
    if (oldMasterId) await ctx.scheduler.runAfter(0, internal.eventSeriesCalendar.splitMaster, { oldSeriesId: series._id, newSeriesId, oldMasterId, untilMs: occurrenceStart(rule, args.fromKey) - 1000, deleteOld: split.before === null });
    await audit(ctx, user, "eventSeries", series._id, "editFuture", { rule }, { newSeriesId, fromKey: args.fromKey, rule: after, name, destination });
    return { seriesId: newSeriesId };
  },
});

/**
 * Cancels every meeting from `fromKey` on and ends the series the day before. On Team Calendar the claims are dropped first,
 * then the master gets UNTIL (or is deleted when nothing of it is in the past). One representative cancellation notice.
 */
export const cancelFuture = mutation({
  args: { seriesId: v.id("eventSeries"), fromKey: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { user, series, rule, rows } = await requireFutureSplit(ctx, args.seriesId, args.fromKey);
    const split = splitRuleAt(rule, args.fromKey);
    const representative = rows.find(row => !row.cancelled) ?? null;
    for (const row of rows) await cancelRowQuietly(ctx, row, user._id);
    await ctx.db.patch(series._id, { untilDate: addDays(args.fromKey, -1), count: undefined, ...(split.before === null ? { status: "cancelled" as const } : {}) });
    if (representative) await notifyEventCancelled(ctx, { eventId: representative._id });
    if (series.calendarMasterId) await ctx.scheduler.runAfter(0, internal.eventSeriesCalendar.truncateMaster, { seriesId: series._id, untilMs: occurrenceStart(rule, args.fromKey) - 1000, deleteMaster: split.before === null });
    await audit(ctx, user, "eventSeries", series._id, "cancelFuture", { untilDate: series.untilDate ?? null, count: series.count ?? null }, { fromKey: args.fromKey });
    return null;
  },
});

// ---------- adopting an existing Google recurring series ----------

export const authorizeCoach = internalQuery({
  args: {}, returns: v.null(),
  handler: async ctx => { requireCoach(await viewer(ctx), "Only a Coach can bring a Team Calendar series into Venom Status."); return null; },
});

export const claimedMasters = internalQuery({
  args: { ids: v.array(v.string()) }, returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const out: string[] = [];
    for (const id of args.ids.slice(0, 250)) if (await ctx.db.query("eventSeriesCalendarClaims").withIndex("by_calendarMasterId", q => q.eq("calendarMasterId", id)).unique()) out.push(id);
    return out;
  },
});

type MasterRead = { ok: true; id: string; title: string; location: string; etag?: string; recurrence: string[]; date: string; time: string; durationMinutes: number; startsAt: number } | { ok: false; reason: string };

/** Reads a Google master into the pieces an adopted series needs, with a Coach-readable refusal reason. */
function readMaster(raw: unknown): MasterRead {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "Team Calendar sent an entry that couldn't be read." };
  const item = raw as { recurrence?: unknown; recurringEventId?: unknown; start?: { dateTime?: unknown; timeZone?: unknown; date?: unknown }; end?: { dateTime?: unknown } };
  const detail = googleDetails(raw);
  if (!Array.isArray(item.recurrence) || typeof item.recurringEventId === "string") return { ok: false, reason: "Choose a whole repeating series from Team Calendar." };
  if (detail.cancelled) return { ok: false, reason: "This series was deleted in Team Calendar." };
  if (detail.allDay || typeof item.start?.dateTime !== "string") return { ok: false, reason: "All-day repeating series can't be managed here." };
  if (item.start.timeZone !== SERIES_TIME_ZONE) return { ok: false, reason: "This series uses a time zone other than America/Chicago. Change it in Team Calendar first." };
  if (detail.startsAt === null || detail.endsAt === null) return { ok: false, reason: "The series start or end couldn't be read." };
  const local = chicagoLocalDateTime(detail.startsAt);
  if (local.slice(17, 19) !== "00") return { ok: false, reason: "The series start time has seconds, which can't be managed here." };
  const recurrence = item.recurrence.filter((line): line is string => typeof line === "string");
  const durationMinutes = Math.round((detail.endsAt - detail.startsAt) / 60_000);
  const parsed = parseGoogleRecurrence(recurrence, { date: local.slice(0, 10), time: local.slice(11, 16) }, durationMinutes);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, id: detail.id, title: detail.title, location: detail.location, etag: detail.etag, recurrence, date: local.slice(0, 10), time: local.slice(11, 16), durationMinutes, startsAt: detail.startsAt };
}

/** Coach picker: Team Calendar repeating series that are still running and not managed here yet. No writes. */
export const googleSeriesCandidates = action({
  args: {}, returns: v.object({ items: v.array(v.object({ id: v.string(), title: v.string(), location: v.string(), startsAt: v.number(), supported: v.boolean(), reason: v.union(v.string(), v.null()) })), error: v.union(v.string(), v.null()) }),
  handler: async (ctx): Promise<{ items: { id: string; title: string; location: string; startsAt: number; supported: boolean; reason: string | null }[]; error: string | null }> => {
    await ctx.runQuery(internal.eventSeries.authorizeCoach, {});
    if (!configured()) return { items: [], error: "Team Calendar isn't set up. Contact a Coach." };
    if (!await boundCalendar(ctx)) return { items: [], error: "Team Calendar settings changed or haven't been checked yet. Try again after the next Calendar update." };
    try {
      const url = new URL(eventUrl());
      url.searchParams.set("singleEvents", "false"); url.searchParams.set("showDeleted", "false"); url.searchParams.set("timeMin", new Date().toISOString()); url.searchParams.set("maxResults", "250");
      const response = await fetch(url, { headers: { authorization: `Bearer ${await token(false)}` } });
      if (!response.ok) return { items: [], error: "Team Calendar could not be read. Try again." };
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items)) return { items: [], error: "Team Calendar sent entries that couldn't be read. Try again." };
      const masters = body.items.filter((raw: unknown) => !!raw && typeof raw === "object" && Array.isArray((raw as { recurrence?: unknown }).recurrence) && typeof (raw as { recurringEventId?: unknown }).recurringEventId !== "string").slice(0, 100);
      const ids = masters.map((raw: unknown) => googleDetails(raw).id).filter(Boolean);
      const claimedIds: string[] = await ctx.runQuery(internal.eventSeries.claimedMasters, { ids });
      const claimed = new Set<string>(claimedIds);
      const items: { id: string; title: string; location: string; startsAt: number; supported: boolean; reason: string | null }[] = masters.map((raw: unknown) => {
        const detail = googleDetails(raw);
        const read = readMaster(raw);
        return { id: detail.id, title: detail.title, location: detail.location, startsAt: detail.startsAt ?? 0, supported: read.ok, reason: read.ok ? null : read.reason };
      }).filter((item: { id: string }) => item.id && !claimed.has(item.id));
      return { items, error: null };
    } catch { return { items: [], error: "Team Calendar could not be read. Try again." }; }
  },
});

export const insertAdopted = internalMutation({
  args: { calendarMasterId: v.string(), etag: v.optional(v.string()), recurrence: v.array(v.string()), name: v.string(), date: v.string(), time: v.string(), durationMinutes: v.number(), weekdays: v.array(v.number()), intervalWeeks: v.number(), untilDate: v.optional(v.string()), count: v.optional(v.number()), template: v.object(templateArgs) },
  returns: v.id("eventSeries"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    requireCoach(user, "Only a Coach can bring a Team Calendar series into Venom Status.");
    if (!validCalendarEventId(args.calendarMasterId)) throw new ConvexError("Choose a series from the list, then try again.");
    const season = await activeSeason(ctx);
    if (await ctx.db.query("eventSeriesCalendarClaims").withIndex("by_calendarMasterId", q => q.eq("calendarMasterId", args.calendarMasterId)).unique()) throw new ConvexError("This Team Calendar series is already managed here. Reload to see it.");
    const name = args.name.trim().slice(0, MAX_NAME) || "Team meeting";
    const built = await buildTemplate(ctx, user, season, name, args.template);
    const now = Date.now();
    const seriesId = await ctx.db.insert("eventSeries", {
      seasonId: season._id, createdBy: user._id, createdAt: now, name, status: "active", origin: "adopted", template: built.template,
      startDate: args.date, weekdays: args.weekdays, intervalWeeks: args.intervalWeeks, localStartTime: args.time, durationMinutes: args.durationMinutes, untilDate: args.untilDate, count: args.count, timeZone: SERIES_TIME_ZONE,
      templateRevision: 1, mentorInviteIds: built.mentorInviteIds, subteamMentorInviteIds: built.subteamMentorInviteIds, audienceStudentIds: built.audienceStudentIds, generatedThrough: 0,
      calendarMasterId: args.calendarMasterId, calendarEtag: args.etag, calendarRecurrence: args.recurrence, calendarSyncState: "synced",
    });
    await ctx.db.insert("eventSeriesCalendarClaims", { calendarMasterId: args.calendarMasterId, seriesId });
    await audit(ctx, user, "eventSeries", seriesId, "adoptGoogleSeries", null, { calendarMasterId: args.calendarMasterId });
    return seriesId;
  },
});

/**
 * Coach: manage an existing Team Calendar repeating series here. Reads only (no Google writes); window meetings are
 * linked to the existing instance ids, so Timeclock history keyed by instance id stays attached. A meeting already
 * connected as a one-off event is converted in place. Sends no notifications.
 */
export const adoptGoogleSeries = action({
  args: { calendarMasterId: v.string(), name: v.optional(v.string()), ...templateArgs, destination: v.optional(v.string()) },
  returns: v.id("eventSeries"),
  handler: async (ctx, args): Promise<Id<"eventSeries">> => {
    await ctx.runQuery(internal.eventSeries.authorizeCoach, {});
    if (!validCalendarEventId(args.calendarMasterId)) throw new ConvexError("Choose a series from the list, then try again.");
    if (!configured()) throw new ConvexError("Team Calendar isn't set up. Contact a Coach.");
    if (!await boundCalendar(ctx)) throw new ConvexError("Team Calendar settings changed or haven't been checked yet. Try again after the next Calendar update.");
    const auth = `Bearer ${await token(false)}`;
    const response = await fetch(eventUrl(args.calendarMasterId), { headers: { authorization: auth } });
    if (!response.ok) throw new ConvexError(response.status === 404 ? "This series no longer exists in Team Calendar." : "Team Calendar could not be read. Try again.");
    const read = readMaster(await response.json());
    if (!read.ok) throw new ConvexError(read.reason);
    const parsed = parseGoogleRecurrence(read.recurrence, { date: read.date, time: read.time }, read.durationMinutes);
    if (!parsed.ok) throw new ConvexError(parsed.reason);
    const { calendarMasterId, name, destination, ...template } = args;
    const seriesId: Id<"eventSeries"> = await ctx.runMutation(internal.eventSeries.insertAdopted, {
      calendarMasterId, etag: read.etag, recurrence: read.recurrence, name: name ?? read.title, date: read.date, time: read.time, durationMinutes: read.durationMinutes,
      weekdays: parsed.rule.weekdays, intervalWeeks: parsed.rule.intervalWeeks, untilDate: parsed.rule.endsOnDate, count: parsed.rule.maxOccurrences,
      template: { ...template, destination: destination ?? read.location },
    });
    await syncInstancesNow(ctx, seriesId, auth, false);
    return seriesId;
  },
});

// ---------- queries for the UI ----------

const seriesSummary = v.object({
  seriesId: v.id("eventSeries"), name: v.string(), status: v.string(), origin: v.string(), weekdays: v.array(v.number()), intervalWeeks: v.number(), localStartTime: v.string(), durationMinutes: v.number(),
  startDate: v.string(), untilDate: v.union(v.string(), v.null()), count: v.union(v.number(), v.null()), onCalendar: v.boolean(), calendarSyncState: v.union(v.string(), v.null()), calendarError: v.union(v.string(), v.null()),
  audienceKind: v.union(v.string(), v.null()), mandatory: v.boolean(),
  // Rolling window: meetings exist through generatedThroughDate; more are added automatically (lib/seriesGenerate seriesProgress).
  generatedThrough: v.union(v.number(), v.null()), generatedThroughDate: v.union(v.string(), v.null()), plannedMeetingCount: v.union(v.number(), v.null()), moreMeetingsScheduled: v.boolean(), windowDays: v.number(),
});
function summary(series: Doc<"eventSeries">) {
  return { seriesId: series._id, name: series.name, status: series.status, origin: series.origin, weekdays: series.weekdays, intervalWeeks: series.intervalWeeks, localStartTime: series.localStartTime, durationMinutes: series.durationMinutes, startDate: series.startDate, untilDate: series.untilDate ?? null, count: series.count ?? null, onCalendar: !!series.calendarMasterId, calendarSyncState: series.calendarSyncState ?? null, calendarError: series.calendarError ?? null, audienceKind: series.template.audienceKind ?? null, mandatory: series.template.mandatory ?? false, ...seriesProgress(series) };
}

export const list = query({
  args: {}, returns: v.array(seriesSummary),
  handler: async ctx => {
    requireSeriesStaff(await viewer(ctx));
    const season = await activeSeason(ctx);
    const out: ReturnType<typeof summary>[] = [];
    for (const status of ["active", "needsReview", "conflict"] as const) {
      const rows = await ctx.db.query("eventSeries").withIndex("by_seasonId_and_status", q => q.eq("seasonId", season._id).eq("status", status)).take(50);
      out.push(...rows.map(summary));
    }
    return out;
  },
});

export const get = query({
  args: { seriesId: v.id("eventSeries"), fromKey: v.string() },
  returns: v.object({ series: seriesSummary, occurrences: v.array(v.object({ eventId: v.id("events"), key: v.string(), name: v.string(), startsAt: v.number(), endsAt: v.number(), cancelled: v.boolean(), detached: v.boolean(), calendarRevision: v.number(), calendarSyncState: v.union(v.string(), v.null()) })), nextKeys: v.array(v.string()) }),
  handler: async (ctx, args) => {
    requireSeriesStaff(await viewer(ctx));
    const season = await activeSeason(ctx);
    const series = await ctx.db.get(args.seriesId);
    if (!series || series.seasonId !== season._id) throw new ConvexError("This series is no longer available. Reload to see the latest.");
    const rows = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", series._id).gte("seriesOccurrenceKey", args.fromKey)).take(60);
    const rule = ruleOf(series);
    return {
      series: summary(series),
      occurrences: rows.map(row => ({ eventId: row._id, key: row.seriesOccurrenceKey!, name: row.name, startsAt: row.startsAt, endsAt: row.endsAt, cancelled: row.cancelled ?? false, detached: row.seriesDetached ?? false, calendarRevision: row.calendarRevision ?? 0, calendarSyncState: row.calendarSyncState ?? null })),
      // Upcoming rule dates (generated or not yet), so the UI can show the pattern beyond the window.
      nextKeys: /^\d{4}-\d{2}-\d{2}$/.test(args.fromKey) ? occurrencesBetween(rule, args.fromKey, addDays(args.fromKey, 7 * 26), 26).map(occurrence => occurrence.occurrenceKey) : [],
    };
  },
});
