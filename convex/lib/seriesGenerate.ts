import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { grantedBackgroundActor, isCoachOrTravelLead } from "./access";
import { chicagoDate, chicagoMidnight } from "./calendarDates";
import { createEventCore, type MentorInvite, type NewEventFields } from "./createEventCore";
import { studentInAudience } from "./eventAudienceRules";
import { applySeriesSignups, isMentorCapable, mentorActor, mentorMeetingLimitError } from "./mentorMeetings";
import { TEAM_TIME_ZONE, zonedWallTimeToUtc } from "../../shared/chicago-time";
import { addDays, occurrenceIndex, occurrencesBetween, type SeriesOccurrence, type SeriesRule } from "./seriesRecurrence";
import { formatUtcBasic } from "./rrule";

/**
 * Recurring meeting generation. A series keeps a rolling window of real `events` rows (8 weeks ahead); each row is keyed
 * by (seriesId, seriesOccurrenceKey) where the key is the occurrence's original Chicago date, so generation is idempotent.
 * Rows are created through createEventCore with notifications suppressed and silent enrollment: the one series notice is
 * sent by eventSeries.create.
 */

export const WINDOW_DAYS = 56;
/** Occurrences created per mutation (Whole Team rows each write up to 500 enrollment members). */
export const GENERATE_BATCH = 4;
export const MAX_SERIES_ROWS_SCAN = 200;

export type Series = Doc<"eventSeries">;

export function ruleOf(series: Pick<Series, "startDate" | "weekdays" | "intervalWeeks" | "localStartTime" | "durationMinutes" | "untilDate" | "count">): SeriesRule {
  const rule: SeriesRule = { anchorDate: series.startDate, weekdays: series.weekdays, intervalWeeks: series.intervalWeeks, startLocalTime: series.localStartTime, durationMinutes: series.durationMinutes };
  if (series.untilDate !== undefined) rule.endsOnDate = series.untilDate;
  if (series.count !== undefined) rule.maxOccurrences = series.count;
  return rule;
}

export function seriesFieldsFromRule(rule: SeriesRule) {
  return { startDate: rule.anchorDate, weekdays: [...rule.weekdays].sort((a, b) => a - b), intervalWeeks: rule.intervalWeeks, localStartTime: rule.startLocalTime, durationMinutes: rule.durationMinutes, untilDate: rule.endsOnDate, count: rule.maxOccurrences, timeZone: TEAM_TIME_ZONE };
}

export function todayKey(now: number): string {
  return chicagoDate(now);
}

/** Exclusive end date of the rolling window. */
export function windowEndKey(now: number): string {
  return addDays(todayKey(now), WINDOW_DAYS);
}

export function windowEndMs(now: number): number {
  return chicagoMidnight(windowEndKey(now));
}

/** Start instant of an occurrence key under the rule's wall time. */
export function occurrenceStart(rule: SeriesRule, key: string): number {
  return zonedWallTimeToUtc(key, rule.startLocalTime);
}

/** "sr" + first 40 hex chars of sha256(seriesId): a valid Google base32hex id, new for every series doc (so every split). */
export async function masterIdForSeries(seriesId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seriesId));
  return "sr" + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** Chicago local wall time "YYYY-MM-DDTHH:MM:SS" for an instant (Google start/end with timeZone America/Chicago). */
export function chicagoLocalDateTime(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TEAM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (name: string) => parts.find(part => part.type === name)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Recurrence lines with the single RRULE ended at `untilMs` (UTC Z form). COUNT is converted to UNTIL; EXDATE and other
 * lines are kept. Used for the only write ever made to an existing master ("this and following" or "cancel following").
 */
export function truncateRecurrence(lines: string[], untilMs: number): string[] {
  const until = formatUtcBasic(untilMs);
  let found = false;
  const out = lines.map(line => {
    if (!/^RRULE:/i.test(line.trim())) return line;
    found = true;
    const parts = line.trim().slice(6).split(";").filter(part => part && !/^(UNTIL|COUNT)=/i.test(part));
    return `RRULE:${[...parts, `UNTIL=${until}`].join(";")}`;
  });
  if (!found) throw new Error("The series has no repeat rule to end.");
  return out;
}

/** Recurrence lines compared without case or ordering noise of the RRULE parts. */
export function sameRecurrence(a: string[] | undefined, b: string[] | undefined): boolean {
  const norm = (lines: string[] | undefined) => (lines ?? []).map(line => line.trim()).filter(Boolean).map(line => /^RRULE:/i.test(line) ? `RRULE:${line.slice(6).toUpperCase().split(";").filter(Boolean).sort().join(";")}` : line.toUpperCase()).sort().join("\n");
  return norm(a) === norm(b);
}

/** Students the series is for (used for the one creation notice and for mandatory enrollment). Bounded at 500. */
export async function seriesAudienceStudentIds(ctx: QueryCtx | MutationCtx, series: Series): Promise<{ audience: Id<"students">[]; assigned: Id<"students">[] }> {
  const template = series.template;
  if (template.audienceKind === "students") {
    const listed = series.audienceStudentIds ?? [];
    return { audience: listed, assigned: template.mandatory ? listed : [] };
  }
  if (template.audienceKind === "mentorsOnly" || template.audienceKind === undefined) return { audience: [], assigned: [] };
  const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", series.seasonId)).take(501);
  if (students.length > 500) throw new Error("The roster is too large for a recurring event.");
  const audience = students.filter(student => studentInAudience({ signupMode: template.signupMode, assignmentScope: template.assignmentScope, audienceKind: template.audienceKind, audienceSubteams: template.audienceSubteams, mandatory: template.mandatory }, student, false)).map(student => student._id);
  return { audience, assigned: template.mandatory ? audience : [] };
}

export function seriesMentorInvites(series: Series): MentorInvite[] {
  const individual = (series.mentorInviteIds ?? []).filter(id => id !== series.createdBy); // the creator is never invited to their own series
  return [...individual.map(mentorUserId => ({ mentorUserId, source: "individual" as const })), ...(series.subteamMentorInviteIds ?? []).filter(id => id !== series.createdBy && !individual.includes(id)).map(mentorUserId => ({ mentorUserId, source: "subteam" as const }))];
}

export const CREATOR_REVIEW_MESSAGE = "The person who set up this series can no longer manage it, so new meetings stopped. A Coach should review the series.";

/**
 * Meetings are created as the series creator, so the creator must still be allowed to: an active Coach or Travel Lead (a
 * Coach for a required Whole Team or subteam series), or an active plain Mentor (a Mentor account, or a Parent with Mentor
 * staff access: lib/mentorMeetings isMentorCapable) whose series is still an optional Team meeting within the Mentor limits.
 * Otherwise (including a Parent whose staff access was removed) the series is marked needsReview and null is returned.
 */
export async function seriesGenerationActor(ctx: MutationCtx, series: Series): Promise<Doc<"appUsers"> | null> {
  const stored = await ctx.db.get(series.createdBy);
  // A Parent with a current Travel Lead grant (stored role "parent") acts as a Travel Lead, as lib/access effectiveViewer
  // resolves it; a Parent with a Mentor grant acts as a plain Mentor.
  const actor = !stored ? null : stored.role === "parent" && stored.parentStaffAccess === "mentor" && isMentorCapable(stored) ? mentorActor(stored) : grantedBackgroundActor(stored);
  const groupMandatory = series.template.mandatory === true && (series.template.audienceKind === "everyone" || series.template.audienceKind === "subteams");
  const staff = !!actor && (isCoachOrTravelLead(actor)) && (!groupMandatory || actor.role === "coach");
  const plainMentor = !!actor && actor.role === "mentor" && !actor.travelLead && mentorMeetingLimitError(series.template) === null && series.template.assignmentScope === undefined;
  const allowed = !!actor && actor.active && actor.archivedAt === undefined && (staff || plainMentor);
  if (allowed) return actor;
  if (series.status !== "needsReview") await ctx.db.patch(series._id, { status: "needsReview", calendarError: CREATOR_REVIEW_MESSAGE });
  return null;
}

/** Invited Mentors who are still Mentors (isMentorCapable); anyone else is dropped from the series' invite lists. */
async function activeMentorInvites(ctx: MutationCtx, series: Series): Promise<MentorInvite[]> {
  const invites = seriesMentorInvites(series);
  const kept: MentorInvite[] = [];
  for (const invite of invites) {
    const user = await ctx.db.get(invite.mentorUserId);
    if (isMentorCapable(user)) kept.push(invite);
  }
  if (kept.length !== invites.length) {
    const keep = new Set(kept.map(invite => invite.mentorUserId));
    await ctx.db.patch(series._id, { mentorInviteIds: (series.mentorInviteIds ?? []).filter(id => keep.has(id)), subteamMentorInviteIds: (series.subteamMentorInviteIds ?? []).filter(id => keep.has(id)) });
  }
  return kept;
}

export type OccurrenceOverride = { startsAt: number; endsAt: number; name?: string; destination?: string };

/** Creates one occurrence row (no notifications, silent enrollment). Returns null when the key already has a row or the creator can no longer create meetings (series marked needsReview). */
export async function createOccurrence(ctx: MutationCtx, series: Series, key: string, override: OccurrenceOverride, assigned: Id<"students">[]): Promise<Id<"events"> | null> {
  const existing = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", series._id).eq("seriesOccurrenceKey", key)).first();
  if (existing) return null;
  const actor = await seriesGenerationActor(ctx, series);
  if (!actor) return null;
  const season = await ctx.db.get(series.seasonId);
  if (!season) throw new Error("The series season is no longer available.");
  const { transportEnabled: _transportEnabled, ...template } = series.template;
  const name = override.name ?? series.name;
  const destination = override.destination ?? template.destination;
  const eventFields: NewEventFields = { ...template, name, destination, startsAt: override.startsAt, endsAt: override.endsAt, seriesId: series._id, seriesOccurrenceKey: key, ...(name !== series.name || destination !== template.destination ? { seriesDetached: true } : {}) };
  // Mandatory specific-students occurrences put the listed students on directly; Whole Team and subteam ones enroll by job.
  const eventId = await createEventCore(ctx, actor, season, { eventFields, requirements: [], shifts: [], questions: [], assigned, audienceStudentIds: template.audienceKind === "students" ? series.audienceStudentIds ?? [] : [], mentorInvites: await activeMentorInvites(ctx, series) }, { suppressNotifications: true, silentEnrollment: true });
  // Mentors signed up for every meeting (or the next N not yet reached) go on the new meeting, skipped dates excepted.
  await applySeriesSignups(ctx, eventId);
  return eventId;
}

/**
 * Creates up to `limit` missing rule-based occurrences with keys in [fromKey, toKeyExclusive). Returns the keys created and
 * whether more remain. Idempotent: existing (seriesId, key) rows are skipped.
 */
export async function generateRuleOccurrences(ctx: MutationCtx, series: Series, fromKey: string, toKeyExclusive: string, limit = GENERATE_BATCH): Promise<{ created: string[]; more: boolean }> {
  const rule = ruleOf(series);
  const created: string[] = [];
  let assigned: Id<"students">[] | null = null;
  let cursor = fromKey;
  while (cursor < toKeyExclusive) {
    const page: SeriesOccurrence[] = occurrencesBetween(rule, cursor, toKeyExclusive, 50);
    if (!page.length) break;
    for (const occurrence of page) {
      const existing = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", series._id).eq("seriesOccurrenceKey", occurrence.occurrenceKey)).first();
      if (existing) continue;
      if (created.length >= limit) return { created, more: true };
      assigned ??= (await seriesAudienceStudentIds(ctx, series)).assigned;
      // The key was checked above, so null means the creator can no longer create meetings: the series now needs review.
      if (!await createOccurrence(ctx, series, occurrence.occurrenceKey, { startsAt: occurrence.startsAt, endsAt: occurrence.endsAt }, assigned)) return { created, more: false };
      created.push(occurrence.occurrenceKey);
    }
    cursor = addDays(page[page.length - 1].occurrenceKey, 1);
  }
  return { created, more: false };
}

/**
 * How far a series' meetings exist and how many its rule plans, so staff screens can say "more meetings are added
 * automatically" (only an 8-week window of meetings exists at a time). `generatedThrough` is the exclusive end instant
 * (Chicago midnight) of the meetings created so far, `generatedThroughDate` the last Chicago date covered; both null until the
 * first window finishes. `plannedMeetingCount` is the rule's total (a count or an end date), null when it never ends.
 * `moreMeetingsScheduled` is true when an active series still has meetings after the created window.
 */
export function seriesProgress(series: Series) {
  const rule = ruleOf(series);
  const generatedThrough = series.generatedThrough ? series.generatedThrough : null;
  const throughKey = generatedThrough === null ? null : chicagoDate(generatedThrough);
  const plannedMeetingCount = series.count ?? (series.untilDate !== undefined ? occurrencesBetween(rule, series.startDate, addDays(series.untilDate, 1)).length : null);
  return {
    generatedThrough, generatedThroughDate: throughKey === null ? null : addDays(throughKey, -1), plannedMeetingCount,
    moreMeetingsScheduled: series.status === "active" && (throughKey === null || hasOccurrenceFrom(rule, throughKey)), windowDays: WINDOW_DAYS,
  };
}

/** Whether the rule still has an occurrence on or after `fromKey`. */
export function hasOccurrenceFrom(rule: SeriesRule, fromKey: string): boolean {
  return occurrencesBetween(rule, fromKey, addDays(fromKey, 7 * rule.intervalWeeks + 7 + 366), 1).length > 0;
}

export function isOccurrence(rule: SeriesRule, key: string): boolean {
  return occurrenceIndex(rule, key) !== null;
}

/** Rows of the series with key >= fromKey, in key order (bounded). */
export async function rowsFrom(ctx: QueryCtx | MutationCtx, seriesId: Id<"eventSeries">, fromKey: string): Promise<Doc<"events">[]> {
  const rows = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId).gte("seriesOccurrenceKey", fromKey)).take(MAX_SERIES_ROWS_SCAN + 1);
  if (rows.length > MAX_SERIES_ROWS_SCAN) throw new Error("This series has too many upcoming meetings to change at once.");
  return rows;
}

/**
 * True when attendance was taken for one of these rows (it would be orphaned): a Timeclock session on the Calendar instance
 * a row links to, or, for any row including app-only meetings, an attendance record on an attendance meeting for the same
 * occurrence: one linked to the row's event id, or one with no event link, on the row's Chicago date. Both the original
 * occurrence date and the current one are checked, so a moved meeting is still found whatever time it was recorded at.
 * (Manual Timeclock occurrences carry no event link, so they can't be matched to a meeting.)
 */
export async function sessionsExistOn(ctx: QueryCtx | MutationCtx, rows: Doc<"events">[]): Promise<boolean> {
  for (const row of rows) {
    if (row.calendarEventId) {
      const occurrence = await ctx.db.query("timeclockOccurrences").withIndex("by_source_and_sourceKey", q => q.eq("source", "calendar").eq("sourceKey", row.calendarEventId!)).first();
      if (occurrence && await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).first()) return true;
    }
    for (const date of new Set([row.seriesOccurrenceKey ?? chicagoDate(row.startsAt), chicagoDate(row.startsAt)])) {
      const meetings = await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", row.seasonId).gte("startsAt", chicagoMidnight(date)).lt("startsAt", chicagoMidnight(addDays(date, 1)))).take(50);
      for (const meeting of meetings) {
        if ((meeting.eventId === row._id || meeting.eventId === undefined) && await ctx.db.query("attendanceRecords").withIndex("by_meetingId_and_studentId", q => q.eq("meetingId", meeting._id)).first()) return true;
      }
    }
  }
  return false;
}
