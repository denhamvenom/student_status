import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { boundCalendar, configured, eventUrl, googleDetails, invalidatePermissionCoverage, token, updateEventDetails, validCalendarEventId, writeEnabled } from "./eventCalendar";
import { syncInstancesNow } from "./eventSeriesCalendar";
import { scheduleEventArchive } from "./eventArchive";
import { activeSeason, audit, viewer, type AppUser, isCoachOrTravelLead } from "./lib/access";
import { MAX_AUDIENCE_STUDENTS, MAX_MENTOR_INVITES, prepareEventAudience } from "./lib/createEventCore";
import { canMentorManageEvent, carrySeriesSignups, isMentorCapable, isMentorSeriesNow, MENTOR_ONLY_MESSAGE, mentorActor, mentorUpdateEvent, requireInvitableMeetingMentors, requireMentorMeetingFields } from "./lib/mentorMeetings";
import { notifyEventCancelled, notifyEventScheduleChange, notifyEventSeriesCreated, queueMentorMeetingOpenDigest } from "./lib/notificationTriggers";
import { savedPublicError } from "./lib/publicErrors";
import { parseGoogleRecurrence } from "./lib/rrule";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import type { AssignmentScope, SignupMode } from "./lib/eventAudienceRules";
import { chicagoLocalDateTime, generateRuleOccurrences, hasOccurrenceFrom, isOccurrence, occurrenceStart, rowsFrom, ruleOf, seriesAudienceStudentIds, seriesFieldsFromRule, sessionsExistOn, todayKey, WINDOW_DAYS, windowEndKey, windowEndMs } from "./lib/seriesGenerate";
import { TEAM_TIME_ZONE } from "../shared/chicago-time";
import { addDays, firstOccurrence, isLocalDate, MAX_OCCURRENCES_PER_QUERY, occurrencesBetween, splitRuleAt, validateSeriesRule, type SeriesRule } from "./lib/seriesRecurrence";
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
 * "Change end date" (setEndDate) sends the same single representative cancellation when it shortens, nothing when it extends.
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

const STAFF_ONLY = "Only a Coach or Travel Lead can manage recurring events.";
const COACH_ONLY_GROUP = "Only a Coach can change a required series for the whole team or a subteam.";
const isSeriesStaff = (user: AppUser) => isCoachOrTravelLead(user);
/** Coach, or a Mentor with Travel Lead (a Parent's selected Travel Lead role resolves to that). A stored flag on any other role grants nothing. */
function requireSeriesStaff(user: AppUser) {
  if (!isSeriesStaff(user)) throw new ConvexError(STAFF_ONLY);
}
/** A Mentor without Travel Lead. They manage only their own optional Team meeting series (lib/mentorMeetings limits). */
const isPlainMentor = (user: AppUser) => user.role === "mentor" && !user.travelLead;

/**
 * The session user for series functions. Coaches and Travel Leads (a Parent's selected Travel Lead role included) as they
 * are. Otherwise the stored account decides (lib/mentorMeetings isMentorCapable): a Mentor, or a Parent with Mentor staff
 * access whatever role their session selected, acts as a plain Mentor; null for a session that is not a Mentor (a
 * deactivated or archived Mentor). Callers refuse null.
 */
async function seriesUserOrNull(ctx: QueryCtx | MutationCtx): Promise<AppUser | null> {
  const user = await viewer(ctx);
  if (isSeriesStaff(user)) return user;
  const stored = await ctx.db.get(user._id);
  if (isMentorCapable(stored)) return stored.role === "mentor" ? user : mentorActor(stored);
  return isPlainMentor(user) ? null : user;
}
async function seriesUser(ctx: QueryCtx | MutationCtx): Promise<AppUser> {
  const user = await seriesUserOrNull(ctx);
  if (!user) throw new ConvexError(MENTOR_ONLY_MESSAGE);
  return user;
}
const MENTOR_OWN_ONLY = `${STAFF_ONLY} A Mentor can change only repeating meetings they created.`;
function requireCoach(user: AppUser, message: string) {
  if (user.role !== "coach") throw new ConvexError(message);
}
/** Why this user may not change the series, or null. Mandatory Whole Team / subteam series are Coach-only, like single events. */
function seriesEditBlocker(user: AppUser, series: Doc<"eventSeries">): string | null {
  if (!isSeriesStaff(user)) {
    if (!isPlainMentor(user)) return STAFF_ONLY;
    // A Mentor edits only a series they created that is still a Mentor-safe Team meeting and not on Team Calendar.
    return series.createdBy === user._id && isMentorSeriesNow(series) ? null : MENTOR_OWN_ONLY;
  }
  if (series.template.mandatory && (series.template.audienceKind === "everyone" || series.template.audienceKind === "subteams") && user.role !== "coach") return COACH_ONLY_GROUP;
  return null;
}
function requireSeriesEditor(user: AppUser, series: Doc<"eventSeries">) {
  const blocker = seriesEditBlocker(user, series);
  if (blocker) throw new ConvexError(blocker);
}
const COACH_CHANGED_MEETING = "A Coach changed a meeting in this series. Ask a Coach to make this change.";
/**
 * seriesEditBlocker checks only the template. A Coach can change one meeting of a Mentor series (capacity, withdrawal,
 * Outreach) without detaching it, and that meeting then stops being the Mentor's to manage (canMentorManageEvent). So a
 * plain Mentor's series-wide change (this and following, end date) is refused when it would touch such a meeting.
 */
async function requireMentorOwnsRows(ctx: MutationCtx, user: AppUser, rows: Doc<"events">[]) {
  if (!isPlainMentor(user)) return;
  const seriesCache = new Map<Id<"eventSeries">, Doc<"eventSeries"> | null>();
  for (const row of rows) if (!row.cancelled && !(await canMentorManageEvent(ctx, user, row, seriesCache))) throw new ConvexError(COACH_CHANGED_MEETING);
}

/** The same audience, location and fee rules as admin.createEvent, producing the stored template. */
async function buildTemplate(ctx: MutationCtx, user: AppUser, season: Doc<"seasons">, name: string, raw: TemplateArgs) {
  if ((raw.mentorInviteUserIds?.length ?? 0) > MAX_MENTOR_INVITES || (raw.audienceStudentIds?.length ?? 0) > MAX_AUDIENCE_STUDENTS) throw new ConvexError("Choose up to 200 Mentors and up to 200 students.");
  // Server-side limit for Mentors: optional Team meetings only (no required audience, fee, travel, overnight, rooms or permission form).
  if (isPlainMentor(user)) requireMentorMeetingFields(raw);
  // Invitees may be Mentors or Parents with Mentor / Travel Lead staff access (isMentorCapable: such Parents are Mentors
  // first, so they alone satisfy a Mentors-only series). The shared audience check takes them all, as createMeeting does.
  const invitees = await requireInvitableMeetingMentors(ctx, raw.mentorInviteUserIds ?? []);
  const mentorInviteUserIds = invitees.map(mentor => mentor._id);
  const input: TemplateArgs & { signupMode: SignupMode; roomDeadline?: number; assignmentScope?: AssignmentScope; assignedStudentIds?: Id<"students">[] } = { ...raw, mentorInviteUserIds, signupMode: raw.signupMode ?? "open" };
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
    mentorInviteIds: [...prepared.mentorInvites.filter(invite => invite.source === "individual" && invite.mentorUserId !== user._id).map(invite => invite.mentorUserId)],
    subteamMentorInviteIds: prepared.mentorInvites.filter(invite => invite.source === "subteam" && invite.mentorUserId !== user._id).map(invite => invite.mentorUserId),
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
    const user = await seriesUser(ctx);
    if (isPlainMentor(user)) {
      requireMentorMeetingFields(args);
      if (args.addToCalendar) throw new ConvexError("Only a Coach or Travel Lead can add a series to Team Calendar. Create it without Team Calendar.");
    } else requireSeriesStaff(user);
    const season = await activeSeason(ctx);
    const now = Date.now();
    const rule = normalizedRule(ruleFromArgs(args.rule));
    if (args.rule.startDate < todayKey(now)) throw new ConvexError("Start the series today or later.");
    if (args.addToCalendar && !writeEnabled()) throw new ConvexError("Calendar updates are turned off in this copy of Venom Status. Create the series without Team Calendar.");
    await requireNoCalendarDuplicate(ctx, season._id, rule);
    const { name: rawName, rule: _rule, addToCalendar, ...template } = args;
    const name = rawName.trim();
    const built = await buildTemplate(ctx, user, season, name, template);
    if (isPlainMentor(user)) requireMentorMeetingFields(built.template); // the stored (mapped) template must still be Mentor-safe
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
    if (first) {
      await notifyEventSeriesCreated(ctx, { eventId: first._id, seriesName: name, studentIds: audience, staffUserIds: [...built.mentorInviteIds, ...built.subteamMentorInviteIds] });
      await queueMentorMeetingOpenDigest(ctx, { eventId: first._id }); // M4, once for the series (its first meeting)
    }
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
  const user = await seriesUser(ctx);
  if (!isPlainMentor(user)) requireSeriesStaff(user);
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
    const { user } = await requireOccurrence(ctx, args.eventId);
    // A Mentor edits only their own meeting, through the Mentor path (title, place and time; no Calendar or media changes).
    if (isPlainMentor(user)) return await mentorUpdateEvent(ctx, user, { eventId: args.eventId, expectedRevision: args.expectedRevision, name: args.name, destination: args.destination, startsAt: args.startsAt, endsAt: args.endsAt });
    return await updateEventDetails(ctx, args);
  },
});

/** Cancels one meeting through the single-event path (its own cancellation notice, deduplicated per meeting). */
export const cancelOccurrence = mutation({
  args: { eventId: v.id("events"), expectedRevision: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireOccurrence(ctx, args.eventId);
    if (isPlainMentor(user)) return await mentorUpdateEvent(ctx, user, { eventId: args.eventId, expectedRevision: args.expectedRevision, cancelled: true });
    return await updateEventDetails(ctx, { eventId: args.eventId, expectedRevision: args.expectedRevision, cancelled: true });
  },
});

// ---------- this and following ----------

async function requireFutureSplit(ctx: MutationCtx, seriesId: Id<"eventSeries">, fromKey: string) {
  const user = await seriesUser(ctx);
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
  await requireMentorOwnsRows(ctx, user, rows);
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
    // A Mentor's series stays theirs when a Coach or Travel Lead edits it (the Mentor keeps managing it); otherwise the editor owns the new series.
    const originalCreator = await ctx.db.get(series.createdBy);
    // Only while the series is still a Mentor-safe one (same test as seriesEditBlocker); a former Travel Lead's fee/travel/Calendar series is owned by the editor.
    // A Parent with Mentor staff access counts as a Mentor creator here (lib/mentorMeetings isMentorCapable).
    const keepCreator = isMentorCapable(originalCreator) && !(originalCreator.role === "mentor" && originalCreator.travelLead) && isMentorSeriesNow(series);
    const newSeriesId = await ctx.db.insert("eventSeries", { ...copy, createdBy: keepCreator ? series.createdBy : user._id, name, createdAt: now, origin: "created", status: "active", template: { ...series.template, destination }, ...seriesFieldsFromRule(after), predecessorSeriesId: series._id, templateRevision: series.templateRevision + 1, ...(oldMasterId ? { calendarSyncState: "pending" as const } : {}) });
    // Mentors' series sign-ups continue on the new series (before it generates meetings); moved rows point at them.
    await carrySeriesSignups(ctx, series._id, newSeriesId, args.fromKey, rows.filter(row => isOccurrence(after, row.seriesOccurrenceKey!)).map(row => row._id), now);
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
 * Returns how many meetings were canceled (scheduled ones not already canceled, plus later ones of an ending series).
 */
export const cancelFuture = mutation({
  args: { seriesId: v.id("eventSeries"), fromKey: v.string() }, returns: v.object({ cancelled: v.number() }),
  handler: async (ctx, args) => {
    const { user, series, rule, rows } = await requireFutureSplit(ctx, args.seriesId, args.fromKey);
    const split = splitRuleAt(rule, args.fromKey);
    const representative = rows.find(row => !row.cancelled) ?? null;
    const cancelled = removedMeetingKeys(rule, rows, args.fromKey).length;
    for (const row of rows) await cancelRowQuietly(ctx, row, user._id);
    await ctx.db.patch(series._id, { untilDate: addDays(args.fromKey, -1), count: undefined, ...(split.before === null ? { status: "cancelled" as const } : {}) });
    if (representative) await notifyEventCancelled(ctx, { eventId: representative._id });
    if (series.calendarMasterId) await ctx.scheduler.runAfter(0, internal.eventSeriesCalendar.truncateMaster, { seriesId: series._id, untilMs: occurrenceStart(rule, args.fromKey) - 1000, deleteMaster: split.before === null });
    await audit(ctx, user, "eventSeries", series._id, "cancelFuture", { untilDate: series.untilDate ?? null, count: series.count ?? null }, { fromKey: args.fromKey });
    return { cancelled };
  },
});

// ---------- change the end date ----------

const MAX_PREVIEW_ROWS = 201;
const SERIES_STATUSES = ["active", "ended", "cancelled", "needsReview", "conflict"] as const;

/** The same calendar date one year later (Feb 29 becomes Mar 1), matching validateSeriesRule's one-year limit. */
function oneYearAfter(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year + 1, month - 1, day)).toISOString().slice(0, 10);
}

/** "May 31, 2027" for a YYYY-MM-DD date (no time zone shift). */
function longDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * The date this series was split at ("this and following"), or null if no newer series was split off it: from then on the
 * newer series (whatever its status) owns the dates, so this series must end the day before. Uses the split key editFuture
 * records in the audit log in the same transaction as the split; the successor's first meeting can be later when the split
 * changed the weekdays, so it (and the successor's earliest row) only serve as a fallback. Bounded scans.
 */
async function successorStart(ctx: QueryCtx, series: Doc<"eventSeries">): Promise<string | null> {
  const successors: Doc<"eventSeries">[] = [];
  for (const status of SERIES_STATUSES) {
    const rows = await ctx.db.query("eventSeries").withIndex("by_seasonId_and_status", q => q.eq("seasonId", series.seasonId).eq("status", status)).take(200);
    successors.push(...rows.filter(row => row.predecessorSeriesId === series._id));
  }
  if (!successors.length) return null;
  const ids = new Set<string>(successors.map(row => row._id));
  const dates: string[] = successors.map(row => row.startDate);
  for (const successor of successors) {
    const first = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", successor._id)).first();
    if (first?.seriesOccurrenceKey) dates.push(first.seriesOccurrenceKey);
  }
  const entries = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "eventSeries").eq("entityId", series._id)).take(500);
  for (const entry of entries) {
    if (entry.action !== "editFuture" || !entry.afterJson) continue;
    try {
      const after = JSON.parse(entry.afterJson) as { newSeriesId?: unknown; fromKey?: unknown };
      if (typeof after.newSeriesId === "string" && ids.has(after.newSeriesId) && typeof after.fromKey === "string" && isLocalDate(after.fromKey)) dates.push(after.fromKey);
    } catch { /* an unreadable entry adds nothing; the successor dates still apply */ }
  }
  return dates.reduce((earliest, date) => date < earliest ? date : earliest);
}

/** Latest allowed end: one year after the start, and the day before a successor series starts. */
function latestEnd(series: Doc<"eventSeries">, successor: string | null): string {
  const yearEnd = oneYearAfter(series.startDate);
  return successor !== null && addDays(successor, -1) < yearEnd ? addDays(successor, -1) : yearEnd;
}

/** Every meeting date of `rule` in [fromKey, toKeyExclusive), paging past the per-call occurrence cap. */
function ruleKeys(rule: SeriesRule, fromKey: string, toKeyExclusive: string): string[] {
  const keys: string[] = [];
  for (let cursor = fromKey; ;) {
    const page = occurrencesBetween(rule, cursor, toKeyExclusive);
    keys.push(...page.map(occurrence => occurrence.occurrenceKey));
    if (page.length < MAX_OCCURRENCES_PER_QUERY) return keys;
    cursor = addDays(page.at(-1)!.occurrenceKey, 1);
  }
}

/**
 * Dates an extension adds: meetings of the new rule after the current end (and from today and the start on) through the
 * new end that have no row yet, in order. Those inside the 8-week window are added now; the rest by the daily job as their
 * dates get closer. Meetings the series already had (generated or not) aren't counted.
 */
async function meetingsToAdd(ctx: QueryCtx, series: Doc<"eventSeries">, rule: SeriesRule, endDate: string, now: number): Promise<string[]> {
  const today = todayKey(now), currentEnd = currentEndKey(series);
  const fromKey = [series.startDate, today, currentEnd === null ? today : addDays(currentEnd, 1)].reduce((latest, key) => key > latest ? key : latest);
  const rows = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", series._id).gte("seriesOccurrenceKey", fromKey)).take(MAX_PREVIEW_ROWS);
  const known = new Set(rows.map(row => row.seriesOccurrenceKey));
  return ruleKeys(rule, fromKey, addDays(endDate, 1)).filter(key => !known.has(key));
}

/**
 * Dates of the meetings from `fromKey` on that ending the series there removes, in order: its rows not already canceled, plus
 * the later meetings of `rule` (the current rule) not generated yet when the series has an end. A never-ending series counts
 * only its scheduled rows.
 */
function removedMeetingKeys(rule: SeriesRule, rows: Doc<"events">[], fromKey: string): string[] {
  const known = new Set(rows.map(row => row.seriesOccurrenceKey));
  const removed = rows.filter(row => !row.cancelled && row.seriesOccurrenceKey).map(row => row.seriesOccurrenceKey!);
  if (rule.endsOnDate !== undefined || rule.maxOccurrences !== undefined) removed.push(...ruleKeys(rule, fromKey, addDays(fromKey, 367)).filter(key => !known.has(key)));
  return removed.sort();
}

/** Date of the series' last meeting under its current rule, or null when it never ends. */
function currentEndKey(series: Doc<"eventSeries">): string | null {
  if (series.untilDate !== undefined) return series.untilDate;
  if (series.count === undefined) return null;
  const rule = ruleOf(series);
  const all = occurrencesBetween(rule, series.startDate, addDays(series.startDate, 7 * rule.intervalWeeks * series.count + 7));
  return all.at(-1)?.occurrenceKey ?? series.startDate;
}

type EndDatePlan = { problem: string; rule?: undefined; shortening?: undefined; unchanged?: undefined; lastMeetingDate?: undefined } | { problem: null; rule: SeriesRule; shortening: boolean; unchanged: boolean; lastMeetingDate: string | null };

/**
 * Checks a new end date: YYYY-MM-DD, today (Chicago) or later, not before the series starts, at most one year after it
 * starts, and before a successor series starts. Shortening is any date before the current last meeting (or any date for a
 * series that never ended).
 */
function endDatePlan(series: Doc<"eventSeries">, endDate: string, today: string, successor: string | null): EndDatePlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !isLocalDate(endDate)) return { problem: "Choose a valid end date." };
  if (endDate < today) return { problem: "Choose today or a later date." };
  if (endDate < series.startDate) return { problem: "The end date can't be before the series starts." };
  if (successor !== null && endDate >= successor) return { problem: `This series continues as a newer series from ${longDate(successor)}. Choose ${longDate(addDays(successor, -1))} or earlier, or change the newer series.` };
  const { endsOnDate: _e, maxOccurrences: _m, ...base } = ruleOf(series);
  const rule: SeriesRule = { ...base, endsOnDate: endDate };
  const errors = validateSeriesRule(rule);
  if (errors.length) return { problem: errors[0] };
  const interval = Math.max(1, rule.intervalWeeks);
  const window = occurrencesBetween(rule, addDays(endDate, -7 * interval - 7) > series.startDate ? addDays(endDate, -7 * interval - 7) : series.startDate, addDays(endDate, 1));
  const current = currentEndKey(series);
  return { problem: null, rule, shortening: current === null || endDate < current, unchanged: current === endDate, lastMeetingDate: window.at(-1)?.occurrenceKey ?? null };
}

/**
 * Changes only when a series ends (no split): the rule gets UNTIL = endDate. Shortening cancels the meetings after the date
 * (refused once attendance was taken on one) with ONE representative cancellation notice, like cancelFuture; on Team
 * Calendar the master's recurrence gets the earlier UNTIL. Extending sends nothing: meetings up to the new end are added
 * silently now (and by the daily job); on Team Calendar only the master's recurrence UNTIL is moved later (its
 * start/summary/location are never written), then the new instances are linked. A series split by "this and following"
 * can't be extended (or reopened) into its successor's dates.
 *
 * Meetings canceled by an earlier shortening stay canceled in the app when the end moves later again (their notice was
 * already sent; restoring would need another). On Team Calendar their re-appearing instances are re-linked and canceled
 * there as instance exceptions (eventSeriesCalendar.linkInstances -> eventCalendar.push), so both sides agree.
 */
export const setEndDate = mutation({
  args: { seriesId: v.id("eventSeries"), endDate: v.string() },
  returns: v.object({ cancelled: v.number(), lastMeetingDate: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const user = await seriesUser(ctx);
    const season = await activeSeason(ctx);
    const series = await ctx.db.get(args.seriesId);
    if (!series || series.seasonId !== season._id) throw new ConvexError("This series is no longer available. Reload to see the latest.");
    requireSeriesEditor(user, series);
    if (series.status !== "active" && series.status !== "ended") throw new ConvexError("This series needs review or was canceled. Reload to see the latest.");
    const now = Date.now(), today = todayKey(now);
    const plan = endDatePlan(series, args.endDate, today, await successorStart(ctx, series));
    if (plan.problem !== null) throw new ConvexError(plan.problem);
    if (series.calendarMasterId && !writeEnabled()) throw new ConvexError("Calendar updates are turned off in this copy of Venom Status, so this Team Calendar series can't be changed here.");
    const rows = plan.shortening ? await rowsFrom(ctx, series._id, addDays(args.endDate, 1)) : [];
    await requireMentorOwnsRows(ctx, user, rows);
    if (await sessionsExistOn(ctx, rows)) throw new ConvexError("Attendance has already been taken for a meeting after that date. Choose a later end date.");
    const live = rows.filter(row => !row.cancelled);
    for (const row of rows) await cancelRowQuietly(ctx, row, user._id);
    const reopen = series.status === "ended" && hasOccurrenceFrom(plan.rule, today);
    await ctx.db.patch(series._id, { untilDate: args.endDate, count: undefined, ...(reopen ? { status: "active" as const } : {}) });
    // At most one notice per person for the whole operation: the first canceled meeting stands for the rest.
    if (live[0]) await notifyEventCancelled(ctx, { eventId: live[0]._id });
    // The Calendar job reads the series' end when it runs, so the last of several quick changes wins.
    if (series.calendarMasterId) await ctx.scheduler.runAfter(0, internal.eventSeriesCalendar.setMasterUntil, { seriesId: series._id });
    else if (!plan.shortening && (series.status === "active" || reopen)) {
      const fresh = (await ctx.db.get(series._id))!;
      const fromKey = fresh.startDate > today ? fresh.startDate : today;
      const toKey = windowEndKey(now) > addDays(fromKey, 1) ? windowEndKey(now) : addDays(fromKey, 1);
      const generated = await generateRuleOccurrences(ctx, fresh, fromKey, toKey);
      if (generated.more) await ctx.scheduler.runAfter(0, internal.eventSeries.generate, { seriesId: series._id, toKey });
      else await ctx.db.patch(series._id, { generatedThrough: Math.max(fresh.generatedThrough ?? 0, windowEndMs(now)) });
    }
    await audit(ctx, user, "eventSeries", series._id, "setEndDate", { untilDate: series.untilDate ?? null, count: series.count ?? null }, { endDate: args.endDate, cancelled: live.length });
    return { cancelled: live.length, lastMeetingDate: plan.lastMeetingDate };
  },
});

/**
 * Event page: how the series repeats and ends, whether this user may change the end, the latest allowed end (one year, or
 * the day before a newer series split off this one: `continuesFrom`), and for a typed date a preview: the last meeting, how
 * many meetings would be canceled (and the first dates) or added up to the new end, or that nothing changes. Staff only.
 */
export const endDateDetails = query({
  args: { seriesId: v.id("eventSeries"), endDate: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({
    weekdays: v.array(v.number()), intervalWeeks: v.number(), startDate: v.string(), endDate: v.union(v.string(), v.null()), status: v.string(), onCalendar: v.boolean(),
    minEndDate: v.string(), maxEndDate: v.string(), continuesFrom: v.union(v.string(), v.null()), seasonEndDate: v.union(v.string(), v.null()), blocker: v.union(v.string(), v.null()), windowDays: v.number(),
    preview: v.union(v.null(), v.object({ endDate: v.string(), problem: v.union(v.string(), v.null()), lastMeetingDate: v.union(v.string(), v.null()), cancelCount: v.number(), cancelDates: v.array(v.string()), addCount: v.number(), laterAddedAutomatically: v.boolean(), shortening: v.boolean(), unchanged: v.boolean() })),
  })),
  handler: async (ctx, args) => {
    const user = await seriesUserOrNull(ctx);
    // Not staff or a Mentor: nothing to show (this reveals nothing either way).
    if (!user || (!isSeriesStaff(user) && !isPlainMentor(user))) return null;
    const season = await activeSeason(ctx);
    const series = await ctx.db.get(args.seriesId);
    if (!series || series.seasonId !== season._id) return null;
    // A Mentor sees the end-date details only of a series they may manage.
    if (!isSeriesStaff(user) && seriesEditBlocker(user, series)) return null;
    const now = Date.now(), today = todayKey(now);
    const successor = await successorStart(ctx, series);
    const statusBlocker = series.status === "active" || series.status === "ended" ? null : "This series needs review or was canceled, so its end date can't be changed here.";
    let preview = null;
    if (args.endDate !== undefined) {
      const plan = endDatePlan(series, args.endDate, today, successor);
      let removed: string[] = [], added: string[] = [];
      if (plan.problem === null && plan.shortening) {
        const rows = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", series._id).gt("seriesOccurrenceKey", args.endDate!)).take(MAX_PREVIEW_ROWS);
        removed = removedMeetingKeys(ruleOf(series), rows, addDays(args.endDate, 1));
      } else if (plan.problem === null && !plan.unchanged) added = await meetingsToAdd(ctx, series, plan.rule, args.endDate, now);
      const windowEnd = windowEndKey(now);
      preview = {
        endDate: args.endDate, problem: plan.problem, lastMeetingDate: plan.lastMeetingDate ?? null, cancelCount: removed.length, cancelDates: removed.slice(0, 3), addCount: added.length,
        shortening: plan.shortening ?? false, unchanged: plan.unchanged ?? false,
        // Some added meetings fall after the 8-week window: they appear on the schedule as their dates get closer.
        laterAddedAutomatically: added.some(key => key >= windowEnd),
      };
    }
    return {
      weekdays: series.weekdays, intervalWeeks: series.intervalWeeks, startDate: series.startDate, endDate: currentEndKey(series), status: series.status, onCalendar: !!series.calendarMasterId,
      minEndDate: series.startDate > today ? series.startDate : today, maxEndDate: latestEnd(series, successor), continuesFrom: successor,
      // Season end dates are stored as that calendar date at 23:59:59 UTC (seasonTransition).
      seasonEndDate: season.endsAt !== undefined ? new Date(season.endsAt).toISOString().slice(0, 10) : null,
      blocker: seriesEditBlocker(user, series) ?? statusBlocker, windowDays: WINDOW_DAYS, preview,
    };
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
  if (item.start.timeZone !== TEAM_TIME_ZONE) return { ok: false, reason: "This series uses a time zone other than America/Chicago. Change it in Team Calendar first." };
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
      startDate: args.date, weekdays: args.weekdays, intervalWeeks: args.intervalWeeks, localStartTime: args.time, durationMinutes: args.durationMinutes, untilDate: args.untilDate, count: args.count, timeZone: TEAM_TIME_ZONE,
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
