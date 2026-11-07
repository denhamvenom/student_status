import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canonicalSubteam } from "../../src/lib/subteams";
import { scheduleEventArchive } from "../eventArchive";
import { activeSeason, audit, type AppUser } from "./access";
import { resolveAudience } from "./eventAudienceRules";
import { sessionsExistOn, todayKey } from "./seriesGenerate";
import { MAX_DURATION_MINUTES } from "./seriesRecurrence";
import { notifyEventScheduleChange } from "./notificationTriggers";

/**
 * Mentor-created Team meetings. Every Mentor (isMentorCapable: a Mentor, or a Parent with Mentor staff access) may create, edit and cancel their OWN optional Team meetings;
 * required meetings, fees, travel, overnight, rooming, permission forms and non-Team types stay with Coaches / Travel Leads.
 * Hiding a control is not authorization: every mutation re-checks these rules on the server.
 */

type Ctx = QueryCtx | MutationCtx;

/** Cap on invite/sign-up rows read or kept per meeting (same as the existing per-event Mentor invite cap). */
export const MAX_MEETING_MENTORS = 200;

export const MENTOR_ONLY_MESSAGE = "Only a Mentor can use Mentor meetings.";

/** Longest Mentor meeting: 12 hours, the same limit as a repeating meeting (seriesRecurrence MAX_DURATION_MINUTES). */
export const MAX_MEETING_MS = MAX_DURATION_MINUTES * 60_000;
export const MEETING_TOO_LONG_MESSAGE = "A meeting can last up to 12 hours. Choose an earlier end time.";

export function requireMeetingLength(startsAt: number, endsAt: number) {
  if (endsAt - startsAt > MAX_MEETING_MS) throw new ConvexError(MEETING_TOO_LONG_MESSAGE);
}

/**
 * Whether a STORED account may use Mentor meeting features (create, sign up, view, Home, invites, notices): an active,
 * non-archived Mentor, or an active, non-archived Parent with a current Mentor or Travel Lead staff-access grant
 * (`appUsers.parentStaffAccess`). Such a Parent counts as a Mentor first for these features, whatever role their session
 * selected; their Parent data access is unchanged because the Mentor shape is used only inside Mentor meeting functions.
 */
export function isMentorCapable(stored: Doc<"appUsers"> | null | undefined): stored is Doc<"appUsers"> {
  if (!stored || !stored.active || stored.archivedAt !== undefined) return false;
  return stored.role === "mentor" || (stored.role === "parent" && (stored.parentStaffAccess === "mentor" || stored.parentStaffAccess === "travelLead"));
}

/** The Mentor shape of a capable stored account: a Mentor as stored; a Parent as a plain Mentor (no Travel Lead, Money edit or health export). */
export function mentorActor(stored: Doc<"appUsers">): AppUser {
  if (stored.role === "mentor") return stored;
  return { ...stored, role: "mentor", travelLead: false, financialEdit: false, healthExport: false };
}

/** The session user as a Mentor for Mentor meeting features (isMentorCapable on the stored row), or a ConvexError. */
export async function requireMeetingMentor(ctx: Ctx, user: AppUser): Promise<AppUser> {
  const stored = await ctx.db.get(user._id);
  if (!isMentorCapable(stored)) throw new ConvexError(MENTOR_ONLY_MESSAGE);
  // A stored Mentor keeps their session shape (a Travel Lead stays one); a Parent acts as a plain Mentor here.
  return stored.role === "mentor" ? user : mentorActor(stored);
}

/** Mentors (isMentorCapable) among the ids, in order and de-duplicated; any other id is refused. */
export async function requireInvitableMeetingMentors(ctx: Ctx, ids: Id<"appUsers">[]): Promise<Doc<"appUsers">[]> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_MEETING_MENTORS) throw new ConvexError("Invite up to 200 Mentors at a time.");
  const out: Doc<"appUsers">[] = [];
  for (const id of unique) {
    const mentor = await ctx.db.get(id);
    if (!isMentorCapable(mentor)) throw new ConvexError("Choose Mentors from the list. One of them is no longer available.");
    out.push(mentor);
  }
  return out;
}

/** The event/template fields the Mentor limits look at (events rows, series templates and raw create arguments all fit). */
export type MentorMeetingFields = {
  type: string; feeCents: number; signupMode?: string; assignmentScope?: string; audienceKind?: string; mandatory?: boolean;
  overnight: boolean; roomingEnabled: boolean; permissionRequired: boolean; firstRequired: boolean; travel: string; isOutreach?: boolean;
  allowWithdrawal?: boolean; mediaSupportRequested?: boolean; onsite?: boolean; capacity?: number;
};

/**
 * Why a Mentor may not create or manage a meeting with these fields, or null. A Mentor meeting is a Team meeting with an
 * audience (Everyone, Subteams, specific students or Mentors only) that is OPTIONAL for students, with no fee, travel,
 * overnight, rooms or permission form.
 */
export function mentorMeetingLimitError(fields: MentorMeetingFields): string | null {
  if (fields.type !== "Team") return "Mentors can create Team meetings only.";
  if (fields.audienceKind === undefined) return "Choose who the meeting is for: Everyone, Subteams, specific students or Mentors only.";
  if (fields.mandatory === true || fields.assignmentScope !== undefined || (fields.signupMode === "assigned" && fields.audienceKind !== "mentorsOnly")) return "Mentors can't create required meetings. Ask a Coach to make a meeting required.";
  if (fields.signupMode === "approval") return "Mentors can't create meetings that need approval. Choose open signup.";
  if (fields.feeCents !== 0) return "Mentors can't add fees to a meeting. Ask a Coach.";
  if (fields.overnight || fields.roomingEnabled) return "Mentors can't create overnight or rooming meetings. Ask a Coach.";
  if (fields.permissionRequired || fields.firstRequired) return "Mentors can't require a permission form or FIRST registration. Ask a Coach.";
  if (fields.travel !== "None") return "Mentors can't add travel or transportation to a meeting. Ask a Coach.";
  if (fields.isOutreach === true) return "Mentors can't mark a meeting as Outreach. Ask a Coach.";
  if (fields.allowWithdrawal === false) return "Mentors can't turn off student withdrawal. Ask a Coach.";
  if (fields.mediaSupportRequested === true) return "Mentors can't request media support. Ask a Coach.";
  if (fields.onsite === true) return "Mentors can't mark a meeting as on site. Enter the place instead, or ask a Coach.";
  if (fields.capacity !== undefined) return "Mentors can't set a capacity. Ask a Coach.";
  return null;
}

export function requireMentorMeetingFields(fields: MentorMeetingFields) {
  const problem = mentorMeetingLimitError(fields);
  if (problem) throw new ConvexError(problem);
}

/**
 * Whether a series is still a Mentor-safe one: its template passes mentorMeetingLimitError, it has no automatic assignment and
 * it isn't on Team Calendar. Its Mentor creator may manage it only while this holds (eventSeries.seriesEditBlocker, Mentor Home).
 */
export function isMentorSeriesNow(series: Pick<Doc<"eventSeries">, "template" | "calendarMasterId">): boolean {
  return mentorMeetingLimitError(series.template) === null && series.template.assignmentScope === undefined && !series.calendarMasterId;
}

/** The Mentor who created an event: its own `createdBy`, else (series meetings) the series creator. */
export async function eventCreatorId(ctx: Ctx, event: Doc<"events">, seriesCache: SeriesCache = new Map()): Promise<Id<"appUsers"> | null> {
  if (event.createdBy) return event.createdBy;
  if (!event.seriesId) return null;
  return (await seriesOf(ctx, event.seriesId, seriesCache))?.createdBy ?? null;
}

export type SeriesCache = Map<Id<"eventSeries">, Doc<"eventSeries"> | null>;

/** A series by id, read once per request through the cache. */
export async function seriesOf(ctx: Ctx, seriesId: Id<"eventSeries">, cache: SeriesCache): Promise<Doc<"eventSeries"> | null> {
  let series = cache.get(seriesId);
  if (series === undefined) { series = await ctx.db.get(seriesId); cache.set(seriesId, series); }
  return series;
}

/**
 * Whether the event is a Mentor meeting right now: it passes mentorMeetingLimitError (optional Team meeting, no fee, travel,
 * overnight, rooms or permission form) and isn't linked to Team Calendar (own Calendar event or a Calendar series).
 */
export async function isMentorMeetingNow(ctx: Ctx, event: Doc<"events">, seriesCache: SeriesCache = new Map()): Promise<boolean> {
  if (mentorMeetingLimitError(event) !== null || event.calendarChoice !== undefined || event.calendarEventId !== undefined) return false;
  if (!event.seriesId) return true;
  return !(await seriesOf(ctx, event.seriesId, seriesCache))?.calendarMasterId;
}

/**
 * The creator who holds Mentor-meeting creator rights (manage, full roster, the created list, M5 notices), or null. admin.ts
 * stamps createdBy on EVERY event, so creator rights count only while the event is still a Mentor meeting (isMentorMeetingNow):
 * a Travel Lead's travel or fee Competition never makes them its "Mentor meeting creator", even after they lose Travel Lead.
 */
export async function mentorMeetingCreatorId(ctx: Ctx, event: Doc<"events">, seriesCache: SeriesCache = new Map()): Promise<Id<"appUsers"> | null> {
  const creatorId = await eventCreatorId(ctx, event, seriesCache);
  if (!creatorId || !(await isMentorMeetingNow(ctx, event, seriesCache))) return null;
  // A creator who is no longer a Mentor (deactivated, or a Parent whose Mentor access was removed) loses creator rights.
  if (!isMentorCapable(await ctx.db.get(creatorId))) return null;
  return creatorId;
}

/**
 * How often a series meeting repeats, for the tag on a meeting row: "Repeats weekly" or "Repeats every N weeks" (the series
 * rule repeats on Chicago calendar weeks; seriesRecurrence). "Repeats" when the series can't be read; null for a one-time event.
 */
export function repeatLabel(event: Pick<Doc<"events">, "seriesId">, series: Pick<Doc<"eventSeries">, "intervalWeeks"> | null): string | null {
  if (!event.seriesId) return null;
  const weeks = series?.intervalWeeks;
  if (weeks === undefined || !Number.isInteger(weeks) || weeks < 1) return "Repeats";
  return weeks === 1 ? "Repeats weekly" : `Repeats every ${weeks} weeks`;
}

const WEEKDAY_PLURALS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;
const chicagoWeekdayTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", hour: "numeric", minute: "2-digit" });

/** "18:00" → "6:00 PM"; null when it isn't a valid HH:MM time. */
function clockLabel(localTime: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) return null;
  const hours = Number(match[1]), minutes = match[2];
  if (hours > 23 || Number(minutes) > 59) return null;
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** "Tuesdays", "Tuesdays and Thursdays", "Mondays, Wednesdays and Fridays". */
function weekdayList(days: string[]): string {
  return days.length <= 1 ? days.join("") : `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

/**
 * When a repeating series meets, in America/Chicago (the series rule's own time zone): "Tuesdays and Thursdays at 6:00 PM".
 * Read from the series rule; when the series can't be read (or its rule is malformed), from the given meeting's start in Chicago.
 */
export function seriesScheduleLabel(series: Pick<Doc<"eventSeries">, "weekdays" | "localStartTime"> | null, fallbackStartsAt: number): string {
  if (series) {
    const days = [...new Set(series.weekdays)].filter(day => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b);
    const time = clockLabel(series.localStartTime);
    if (days.length > 0 && time) return `${weekdayList(days.map(day => WEEKDAY_PLURALS[day]))} at ${time}`;
  }
  const parts = chicagoWeekdayTime.formatToParts(new Date(fallbackStartsAt));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("weekday")}s at ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

export type JoinCategory = "meetings" | "competitionsAndTrips";

/**
 * Which Mentor Home group an event to join belongs to (owner decision, Nov 7 2026, revised the same day):
 * "competitionsAndTrips" only for a Competition and for an overnight trip (the hotel question applies); "meetings" (shown as
 * "Meetings & events") otherwise, so Fundraisers, Outreach and Team meetings stay there even when travel is set.
 */
export function joinCategory(event: Pick<Doc<"events">, "type"> & QuestionFields): JoinCategory {
  return event.type === "Competition" || mentorQuestions(event).askHotel ? "competitionsAndTrips" : "meetings";
}

/**
 * Whether a joinable event is "for your subteam": a meeting (not a Competition or trip, which are for the whole team) whose
 * audience is restricted to subteams that include one of the Mentor's subteams.
 */
export function forMentorSubteam(user: Pick<AppUser, "subteams">, event: Doc<"events">): boolean {
  if (joinCategory(event) !== "meetings") return false;
  const audience = resolveAudience(event);
  return audience.kind === "subteams" && mentorMatchesSubteams(user, audience.subteams);
}

/** Whether this Mentor's subteams (primary, CAD) include any of the event's audience groups (legacy names canonicalized). */
export function mentorMatchesSubteams(user: Pick<AppUser, "subteams">, groups: readonly string[]): boolean {
  const mine = new Set((user.subteams ?? []).map(canonicalSubteam));
  return groups.some(group => mine.has(canonicalSubteam(group)));
}

/**
 * The ONE rule for Mentor self sign-up, the joinable list, view eligibility and the M4 notice (owner decision, Nov 6 2026):
 * any upcoming, non-canceled, non-archived event of any type (Team meetings, competitions, travel, overnight, outreach,
 * fundraisers), EXCEPT an event for specific subteams that include none of the Mentor's subteams. Everyone, Travel Team,
 * specific students, Mentors only and legacy events are all open. Callers also require the active season.
 */
export function selfSignupEligible(user: Pick<AppUser, "subteams">, event: Doc<"events">, now: number): boolean {
  if (event.archived || event.cancelled || event.endsAt <= now) return false;
  const audience = resolveAudience(event);
  if (audience.kind === "subteams") return mentorMatchesSubteams(user, audience.subteams);
  return true;
}

/**
 * The time a Mentor read (`mentorMeetings.view`, `mentorHome`) uses. Queries must not read the clock (Convex guidelines), so
 * the client passes `asOf`; the server can't compare it with the real time inside a query, so it is never trusted to widen
 * access:
 * - it must be finite and is rounded down to the minute (the client sends minute-rounded times);
 * - it is raised to the latest time the server KNOWS has already passed (`knownPast`: the creation time of documents it just
 *   read, such as the event, the season or the Mentor's account), so an old or zero `asOf` can't make an event created after
 *   it ended look upcoming;
 * - eligibility (selfSignupEligible) also requires the event not to be archived, which the server itself sets when an event
 *   ends (eventArchive.atEnd at endsAt, plus the one-minute sweep): time state materialized by scheduled mutations, so a past
 *   event can't be opened by a Mentor who isn't on it whatever `asOf` says.
 * A far-future `asOf` only hides events (eligibility needs endsAt > asOf). Mutations re-check everything with Date.now().
 * Returns null for a non-finite value.
 */
export function plausibleAsOf(asOf: number, knownPast: readonly number[]): number | null {
  if (!Number.isFinite(asOf)) return null;
  return Math.max(Math.floor(asOf / 60_000) * 60_000, ...knownPast.filter(Number.isFinite));
}

/** Fields that decide which sign-up questions apply (events rows and series templates both fit). */
export type QuestionFields = { travel: string; onsite?: boolean; locationType?: "inPerson" | "virtual"; overnight: boolean };

/**
 * Which sign-up questions a Mentor answers: "Can you drive students?" when the event involves travel (travel isn't None,
 * on site or virtual), and "Do you need a hotel room?" when it is overnight. No other questions are asked.
 */
export function mentorQuestions(event: QuestionFields): { askDrive: boolean; askHotel: boolean } {
  return { askDrive: event.travel !== "None" && !event.onsite && event.locationType !== "virtual", askHotel: event.overnight };
}

export type MentorAnswers = { canDriveStudents?: boolean; needsHotelRoom?: boolean };
export const DRIVE_ANSWER_MESSAGE = "This event has travel. Answer whether you can drive students.";
export const HOTEL_ANSWER_MESSAGE = "This event is overnight. Answer whether you need a hotel room.";

/** Only the answers this event asks for (others are dropped). */
export function answersFor(event: QuestionFields, answers: MentorAnswers): MentorAnswers {
  const q = mentorQuestions(event);
  return { canDriveStudents: q.askDrive ? answers.canDriveStudents : undefined, needsHotelRoom: q.askHotel ? answers.needsHotelRoom : undefined };
}

/** The applicable answers, refusing a missing required one. */
export function requireAnswers(event: QuestionFields, answers: MentorAnswers): MentorAnswers {
  const q = mentorQuestions(event);
  if (q.askDrive && answers.canDriveStudents === undefined) throw new ConvexError(DRIVE_ANSWER_MESSAGE);
  if (q.askHotel && answers.needsHotelRoom === undefined) throw new ConvexError(HOTEL_ANSWER_MESSAGE);
  return answersFor(event, answers);
}

/** One-line audience description shown to Mentors. */
export function audienceSummary(event: Doc<"events">): { kind: "everyone" | "subteams" | "students" | "mentorsOnly"; subteams: string[]; required: boolean; text: string } {
  const audience = resolveAudience(event);
  const text = audience.kind === "everyone" ? "Everyone" : audience.kind === "subteams" ? `Subteams: ${audience.subteams.map(canonicalSubteam).join(", ") || "none chosen"}` : audience.kind === "students" ? "Specific students" : "Mentors only";
  return { kind: audience.kind, subteams: audience.subteams.map(canonicalSubteam), required: audience.mandatory, text: audience.mandatory ? `${text} (required)` : text };
}

/** Whether this Mentor may edit or cancel the event: they created it, and it is still a Mentor meeting (mentorMeetingCreatorId). */
export async function canMentorManageEvent(ctx: Ctx, user: AppUser, event: Doc<"events">, seriesCache?: SeriesCache): Promise<boolean> {
  if (user.role !== "mentor") return false;
  return (await mentorMeetingCreatorId(ctx, event, seriesCache)) === user._id;
}

export type MeetingMentor = {
  userId: Id<"appUsers">;
  /** Invite status; the creator of a Mentor meeting (mentorMeetingCreatorId) without an invite row counts as accepted. */
  status: "invited" | "accepted" | "declined";
  source: "individual" | "subteam" | "self" | "creator";
  /** The Mentor-meeting creator (mentorMeetingCreatorId); false for the creator of any other event. */
  isCreator: boolean;
};

/**
 * Every Mentor tied to a meeting, for reuse (notifications, rosters): invited, accepted, declined and self-signed-up Mentors
 * from eventMentorInvites, plus the creator of a Mentor meeting (mentorMeetingCreatorId: only while the event is still a
 * Mentor meeting and the creator is still a Mentor), who counts as going without a row and hears schedule changes (M1) and
 * reminders (M2). The creator of any OTHER event (a Travel Lead's overnight Competition, say) is treated like anyone else:
 * they are listed only through their own invite or sign-up row. A Mentor appears once; the creator's own invite row (if any)
 * supplies their status. Bounded to MAX_MEETING_MENTORS + 1 rows.
 */
export async function listMeetingMentors(ctx: Ctx, eventId: Id<"events">): Promise<MeetingMentor[]> {
  const event = await ctx.db.get(eventId);
  if (!event) return [];
  const rows = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(MAX_MEETING_MENTORS + 1);
  const creatorId = await mentorMeetingCreatorId(ctx, event);
  const out = new Map<Id<"appUsers">, MeetingMentor>();
  const capable = new Map<Id<"appUsers">, boolean>();
  const stillMentor = async (id: Id<"appUsers">) => {
    let ok = capable.get(id);
    if (ok === undefined) { ok = isMentorCapable(await ctx.db.get(id)); capable.set(id, ok); }
    return ok;
  };
  for (const row of rows) {
    if (out.has(row.mentorUserId)) continue;
    // A Mentor who lost Mentor access (deactivated, or a Parent whose grant was removed) is no longer on any meeting.
    if (!(await stillMentor(row.mentorUserId))) continue;
    out.set(row.mentorUserId, { userId: row.mentorUserId, status: row.status, source: row.source, isCreator: row.mentorUserId === creatorId });
  }
  // mentorMeetingCreatorId already requires the creator to still be a Mentor.
  if (creatorId) {
    const existing = out.get(creatorId);
    if (existing) existing.isCreator = true;
    else out.set(creatorId, { userId: creatorId, status: "accepted", source: "creator", isCreator: true });
  }
  return [...out.values()];
}

export const MEETING_CHANGED_MESSAGE = "This meeting changed since you opened it. Reload to see the latest, then try again.";

export type MentorEventEdit = { eventId: Id<"events">; expectedRevision?: number; name?: string; destination?: string; startsAt?: number; endsAt?: number; cancelled?: boolean };

/**
 * A Mentor edits or cancels one meeting they created (this meeting only). Same field rules as the Coach path
 * (calendarDetails update); the meeting becomes a detached override when it belongs to a series. Meetings on Team Calendar
 * are Coach/Travel Lead-managed, so a Mentor is sent to a Coach for those.
 */
export async function mentorUpdateEvent(ctx: MutationCtx, sessionUser: AppUser, args: MentorEventEdit): Promise<null> {
  const user = await requireMeetingMentor(ctx, sessionUser);
  const season = await activeSeason(ctx);
  const event = await ctx.db.get(args.eventId);
  if (!event || event.seasonId !== season._id || event.archived) throw new ConvexError("This meeting is no longer available. It may have moved to Past events. Reload to see current meetings.");
  const series = event.seriesId ? await ctx.db.get(event.seriesId) : null;
  if (series?.calendarMasterId && (await eventCreatorId(ctx, event)) === user._id) throw new ConvexError("This meeting is on Team Calendar. Ask a Coach to change it.");
  const owned = await canMentorManageEvent(ctx, user, event);
  if (!owned) throw new ConvexError("You can change only Team meetings you created. Ask a Coach to change this one.");
  if (event.cancelled) throw new ConvexError("This meeting is canceled, so it can't be changed.");
  const now = Date.now();
  if (event.endsAt <= now) throw new ConvexError("This meeting is over, so it can't be changed.");
  if (args.expectedRevision !== undefined && args.expectedRevision !== (event.calendarRevision ?? 0)) throw new ConvexError(MEETING_CHANGED_MESSAGE);
  const name = args.name?.trim() ?? event.name, destination = args.destination?.trim() ?? event.destination;
  const startsAt = args.startsAt ?? event.startsAt, endsAt = args.endsAt ?? event.endsAt;
  if (!name || name.length > 250 || destination.length > 500 || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) throw new ConvexError("Enter a title up to 250 characters, a place up to 500, and an end time after the start.");
  if (event.onsite && destination !== event.destination) throw new ConvexError("This meeting is on site at the DSHS STEM Center, so its location stays On site.");
  const cancelling = args.cancelled === true;
  const timeChanged = startsAt !== event.startsAt || endsAt !== event.endsAt;
  if (timeChanged && !cancelling) {
    requireMeetingLength(startsAt, endsAt);
    if (startsAt !== event.startsAt && startsAt < now) throw new ConvexError("Choose a start time that hasn't passed yet.");
    if (await sessionsExistOn(ctx, [event])) throw new ConvexError("Attendance has already been taken for this meeting, so its time can't be changed.");
  }
  const material = name !== event.name || destination !== event.destination || startsAt !== event.startsAt || endsAt !== event.endsAt || cancelling;
  await ctx.db.patch(event._id, {
    name, destination, startsAt, endsAt, cancelled: cancelling ? true : event.cancelled ?? false,
    ...(event.seriesId && material ? { seriesDetached: true } : {}), calendarRevision: (event.calendarRevision ?? 0) + 1,
  });
  if (endsAt !== event.endsAt) await scheduleEventArchive(ctx, event._id);
  if (cancelling) await ctx.runMutation(internal.eventEnrollment.stopCancelledEnrollment, { eventId: event._id });
  if (material) await notifyEventScheduleChange(ctx, event);
  await audit(ctx, user, "events", event._id, cancelling ? "mentorCancelMeeting" : "mentorUpdateMeeting", { name: event.name, destination: event.destination, startsAt: event.startsAt, endsAt: event.endsAt, cancelled: event.cancelled ?? false }, { name, destination, startsAt, endsAt, cancelled: cancelling || (event.cancelled ?? false) });
  return null;
}

// ---------- Sign-up rows, answers and series sign-ups ----------

export type SeriesScope = "all" | "one" | "next";
export const MAX_NEXT_MEETINGS = 52;
/** Upcoming meetings of one series read when a series sign-up is applied, left or carried over (the 8-week window holds far fewer). */
export const MAX_SERIES_SIGNUP_MEETINGS = 200;
/** Active series sign-ups read per series (applied to each newly generated meeting, carried over on a split). */
export const MAX_SERIES_SIGNUPS = MAX_MEETING_MENTORS;
/** Skipped (and "one") keys kept per sign-up; keys before today are dropped first. */
const MAX_KEYS = 120;

export type SignupChoice = { scope: SeriesScope; count?: number };

/** The sign-up choice for this event: a non-series event is always "one"; "next" needs a whole count from 1 to 52. */
export function signupChoice(event: Doc<"events">, scope: SeriesScope | undefined, count: number | undefined): SignupChoice {
  if (!event.seriesId || !event.seriesOccurrenceKey) {
    if (scope !== undefined && scope !== "one") throw new ConvexError("This event doesn't repeat. Sign up for just this one.");
    return { scope: "one" };
  }
  const chosen = scope ?? "one";
  if (chosen === "next") {
    if (count === undefined || !Number.isInteger(count) || count < 1 || count > MAX_NEXT_MEETINGS) throw new ConvexError("Choose how many meetings to sign up for: 1 to 52.");
    return { scope: "next", count };
  }
  if (count !== undefined) throw new ConvexError("A number of meetings goes only with \"the next meetings\".");
  return { scope: chosen };
}

/** One Mentor's rows on an event: normally one, but duplicates are tolerated (every one gets the same answer). */
export async function mentorInviteRows(ctx: Ctx, eventId: Id<"events">, mentorUserId: Id<"appUsers">): Promise<Doc<"eventMentorInvites">[]> {
  return await ctx.db.query("eventMentorInvites").withIndex("by_eventId_and_mentorUserId", q => q.eq("eventId", eventId).eq("mentorUserId", mentorUserId)).take(10);
}

export type JoinResult = "joined" | "already" | "notOpen" | "full";

/**
 * Puts the Mentor on one meeting: their invite rows (any source) become accepted with the answers, or, with no row, a `self`
 * row is inserted when the meeting is open to them (selfSignupEligible) and has room. The creator of a Mentor meeting is
 * already on it (no row; listMeetingMentors); the creator of any other event signs up like anyone else. Answers are stored
 * only where this meeting asks the question.
 */
export async function acceptMeeting(ctx: MutationCtx, mentor: AppUser, event: Doc<"events">, answers: MentorAnswers, now: number, seriesSignupId?: Id<"mentorSeriesSignups">): Promise<JoinResult> {
  const rows = await mentorInviteRows(ctx, event._id, mentor._id);
  const fields = { ...answersFor(event, answers), answeredAt: now, ...(seriesSignupId ? { seriesSignupId } : {}) };
  if (rows.length) {
    const was = rows[0].status;
    for (const row of rows) await ctx.db.patch(row._id, { status: "accepted", respondedAt: was === "accepted" ? row.respondedAt ?? now : now, ...fields });
    return was === "accepted" ? "already" : "joined";
  }
  if (!selfSignupEligible(mentor, event, now)) return "notOpen";
  if ((await mentorMeetingCreatorId(ctx, event)) === mentor._id) return "already";
  const existing = await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_MEETING_MENTORS);
  if (existing.length >= MAX_MEETING_MENTORS) return "full";
  await ctx.db.insert("eventMentorInvites", { eventId: event._id, mentorUserId: mentor._id, source: "self", status: "accepted", invitedBy: mentor._id, createdAt: now, respondedAt: now, ...fields });
  return "joined";
}

/** Takes the Mentor off one meeting: `self` rows are deleted, invited rows go back to declined. Returns whether they were going. */
export async function leaveMeetingRows(ctx: MutationCtx, rows: Doc<"eventMentorInvites">[], now: number): Promise<boolean> {
  if (!rows.length) return false;
  const wasGoing = rows[0].status === "accepted";
  if (rows[0].source === "self") for (const row of rows) await ctx.db.delete(row._id);
  else for (const row of rows) await ctx.db.patch(row._id, { status: "declined", respondedAt: now });
  return wasGoing;
}

export async function seriesSignupFor(ctx: Ctx, seriesId: Id<"eventSeries">, mentorUserId: Id<"appUsers">): Promise<Doc<"mentorSeriesSignups"> | null> {
  return await ctx.db.query("mentorSeriesSignups").withIndex("by_seriesId_and_mentorUserId", q => q.eq("seriesId", seriesId).eq("mentorUserId", mentorUserId)).first();
}

/** Upcoming, non-canceled meetings of a series from `fromKey` on, in date order (bounded). */
export async function upcomingSeriesMeetings(ctx: Ctx, seriesId: Id<"eventSeries">, fromKey: string, now: number): Promise<Doc<"events">[]> {
  const rows = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId).gte("seriesOccurrenceKey", fromKey)).take(MAX_SERIES_SIGNUP_MEETINGS);
  return rows.filter(row => !row.cancelled && !row.archived && row.endsAt > now);
}

function keptKeys(keys: Iterable<string>, today: string): string[] {
  return [...new Set(keys)].filter(key => key >= today).sort().slice(-MAX_KEYS);
}

/**
 * A Mentor signs up from one meeting of a series (the caller has already checked that meeting and its answers).
 * - `one`: this meeting only. Added to an existing sign-up (its choice is kept), or a new "one" sign-up.
 * - `all`: every current and future meeting, including ones generated later (except meetings the Mentor skipped).
 * - `next` N: this meeting and the following non-canceled meetings the Mentor hasn't skipped, up to N in total, also as
 *   they are generated. Skipped meetings don't count toward N and stay skipped.
 * Choosing again replaces the choice, but doesn't take the Mentor off meetings already on their schedule ("Leave all" does).
 * No choice clears a skip except on the meeting the Mentor signs up from: a skipped meeting is rejoined only by signing up
 * for (or accepting) that meeting itself.
 * The answers apply to every row the sign-up creates. Bounded to MAX_SERIES_SIGNUP_MEETINGS upcoming meetings (the 8-week
 * window holds far fewer). Returns how many meetings the Mentor newly joined.
 */
export async function signUpForSeries(ctx: MutationCtx, mentor: AppUser, event: Doc<"events">, choice: SignupChoice, answers: MentorAnswers, now: number): Promise<number> {
  const seriesId = event.seriesId!, key = event.seriesOccurrenceKey!;
  const today = todayKey(now);
  const prior = await seriesSignupFor(ctx, seriesId, mentor._id);
  const active = prior?.status === "active" ? prior : null;
  const skipped = new Set(active?.skippedKeys ?? []);
  skipped.delete(key);
  let scope: SeriesScope = choice.scope, count: number | undefined, covered: string[] = [], targets: Doc<"events">[];
  const notSkipped = (meeting: Doc<"events">) => meeting._id === event._id || !skipped.has(meeting.seriesOccurrenceKey!);
  if (choice.scope === "all") {
    targets = (await upcomingSeriesMeetings(ctx, seriesId, key, now)).filter(notSkipped);
  } else if (choice.scope === "next") {
    count = choice.count;
    // N meetings the Mentor hasn't skipped, starting with this one; skipped dates stay skipped and don't count.
    targets = (await upcomingSeriesMeetings(ctx, seriesId, key, now)).filter(notSkipped).slice(0, choice.count);
    if (!targets.some(meeting => meeting._id === event._id)) targets = [event, ...targets].slice(0, choice.count);
    covered = targets.map(meeting => meeting.seriesOccurrenceKey!);
  } else {
    targets = [event];
    if (active && active.scope !== "one") { scope = active.scope; count = active.count; covered = active.coveredKeys; }
    else covered = keptKeys([...(active?.coveredKeys ?? []), key], today);
  }
  const fields = { status: "active" as const, scope, count, coveredKeys: covered, skippedKeys: keptKeys(skipped, today), canDriveStudents: answers.canDriveStudents, needsHotelRoom: answers.needsHotelRoom, updatedAt: now };
  let signupId: Id<"mentorSeriesSignups">;
  if (prior) { await ctx.db.patch(prior._id, fields); signupId = prior._id; }
  else signupId = await ctx.db.insert("mentorSeriesSignups", { seriesId, mentorUserId: mentor._id, createdAt: now, ...fields });
  let joined = 0;
  for (const meeting of targets) if ((await acceptMeeting(ctx, mentor, meeting, answers, now, signupId)) === "joined") joined++;
  return joined;
}

/**
 * A newly generated series meeting: Mentors with an active `all` sign-up, or a `next` sign-up that hasn't reached its count,
 * are put on it, unless they skipped that date. A sign-up whose Mentor lost Mentor access is ended instead.
 */
export async function applySeriesSignups(ctx: MutationCtx, eventId: Id<"events">): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event?.seriesId || !event.seriesOccurrenceKey || event.cancelled) return;
  const key = event.seriesOccurrenceKey, now = Date.now();
  const signups = await ctx.db.query("mentorSeriesSignups").withIndex("by_seriesId_and_status", q => q.eq("seriesId", event.seriesId!).eq("status", "active")).take(MAX_SERIES_SIGNUPS);
  for (const signup of signups) {
    const mentor = await ctx.db.get(signup.mentorUserId);
    if (!isMentorCapable(mentor)) { await ctx.db.patch(signup._id, { status: "left", updatedAt: now }); continue; }
    if (signup.scope === "one" || signup.skippedKeys.includes(key)) continue;
    const alreadyCovered = signup.coveredKeys.includes(key);
    if (signup.scope === "next" && !alreadyCovered && signup.coveredKeys.length >= (signup.count ?? 0)) continue;
    const result = await acceptMeeting(ctx, mentorActor(mentor), event, signup, now, signup._id);
    if (signup.scope === "next" && !alreadyCovered && (result === "joined" || result === "already")) await ctx.db.patch(signup._id, { coveredKeys: [...signup.coveredKeys, key], updatedAt: now });
  }
}

/**
 * Records that the Mentor left one meeting of a series they signed up for, so re-applying the sign-up never puts them back.
 * A "next" sign-up keeps a skipped meeting it already covered in its count (the sign-up isn't extended to a later meeting);
 * meetings skipped before a "next" choice never count toward N (signUpForSeries). A "one" sign-up with nothing left ends.
 * See docs/EVENT_AUDIENCES_AND_SERIES.md (Skip this meeting).
 */
export async function recordSeriesSkip(ctx: MutationCtx, mentorUserId: Id<"appUsers">, event: Doc<"events">, now: number): Promise<void> {
  if (!event.seriesId || !event.seriesOccurrenceKey) return;
  const signup = await seriesSignupFor(ctx, event.seriesId, mentorUserId);
  if (signup?.status !== "active") return;
  const key = event.seriesOccurrenceKey, today = todayKey(now);
  const coveredKeys = signup.scope === "one" ? signup.coveredKeys.filter(covered => covered !== key) : signup.coveredKeys;
  const ends = signup.scope === "one" && !coveredKeys.some(covered => covered >= today);
  await ctx.db.patch(signup._id, { skippedKeys: keptKeys([...signup.skippedKeys, key], today), coveredKeys, updatedAt: now, ...(ends ? { status: "left" as const } : {}) });
}

/**
 * "Leave all": ends the Mentor's sign-up for the series and takes them off every upcoming meeting of it (self rows deleted,
 * invited rows declined). Returns how many meetings they were going to and the first of them (for one M5 notice).
 */
export async function leaveSeries(ctx: MutationCtx, mentorUserId: Id<"appUsers">, seriesId: Id<"eventSeries">, now: number): Promise<{ hadSignup: boolean; left: number; firstEventId: Id<"events"> | null }> {
  const signup = await seriesSignupFor(ctx, seriesId, mentorUserId);
  const hadSignup = signup?.status === "active";
  if (signup && hadSignup) await ctx.db.patch(signup._id, { status: "left", coveredKeys: [], skippedKeys: [], updatedAt: now });
  let left = 0, firstEventId: Id<"events"> | null = null;
  for (const meeting of await upcomingSeriesMeetings(ctx, seriesId, todayKey(now), now)) {
    const rows = await mentorInviteRows(ctx, meeting._id, mentorUserId);
    if (await leaveMeetingRows(ctx, rows, now)) { left++; firstEventId ??= meeting._id; }
  }
  return { hadSignup, left, firstEventId };
}

/**
 * "This and following" split: every active sign-up on the old series continues on the new one. `all` stays `all`; `next`
 * keeps the meetings it still had to go (its number minus the ones before the split); `one` keeps its chosen meetings from
 * the split on. Skips on or after the split move too, and the moved meetings' rows point at the new sign-up. The old sign-up
 * keeps what came before the split (an `all` one ends: the old series has no meetings left to generate). Call before the
 * new series generates meetings.
 */
export async function carrySeriesSignups(ctx: MutationCtx, oldSeriesId: Id<"eventSeries">, newSeriesId: Id<"eventSeries">, fromKey: string, movedEventIds: Id<"events">[], now: number): Promise<void> {
  const signups = await ctx.db.query("mentorSeriesSignups").withIndex("by_seriesId_and_status", q => q.eq("seriesId", oldSeriesId).eq("status", "active")).take(MAX_SERIES_SIGNUPS);
  const moved = new Map<Id<"mentorSeriesSignups">, Id<"mentorSeriesSignups">>();
  for (const signup of signups) {
    const before = signup.coveredKeys.filter(key => key < fromKey), after = signup.coveredKeys.filter(key => key >= fromKey);
    const count = signup.scope === "next" ? (signup.count ?? 0) - before.length : undefined;
    const carry = signup.scope === "all" || (signup.scope === "next" ? (count ?? 0) > 0 : after.length > 0);
    if (carry) {
      const newId = await ctx.db.insert("mentorSeriesSignups", {
        seriesId: newSeriesId, mentorUserId: signup.mentorUserId, status: "active", scope: signup.scope, count, coveredKeys: signup.scope === "all" ? [] : after,
        skippedKeys: signup.skippedKeys.filter(key => key >= fromKey), canDriveStudents: signup.canDriveStudents, needsHotelRoom: signup.needsHotelRoom, createdAt: now, updatedAt: now,
      });
      moved.set(signup._id, newId);
    }
    const ends = signup.scope === "all" || before.length === 0;
    await ctx.db.patch(signup._id, { coveredKeys: signup.scope === "all" ? [] : before, skippedKeys: signup.skippedKeys.filter(key => key < fromKey), ...(signup.scope === "next" ? { count: before.length } : {}), updatedAt: now, ...(ends ? { status: "left" as const } : {}) });
  }
  if (!moved.size) return;
  for (const eventId of movedEventIds) {
    for (const row of await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(MAX_MEETING_MENTORS + 1)) {
      const newId = row.seriesSignupId && moved.get(row.seriesSignupId);
      if (newId) await ctx.db.patch(row._id, { seriesSignupId: newId });
    }
  }
}

/**
 * Lost Mentor access (a Parent's Mentor grant removed, or the account deactivated): ends their series sign-ups and removes
 * their rows on upcoming events. Read paths already ignore such accounts (listMeetingMentors, isMentorCapable); this cleans up.
 * Bounded; returns how many rows were removed. Does nothing while the account is still a Mentor.
 */
export async function removeLostMentorSignups(ctx: MutationCtx, userId: Id<"appUsers">, now: number): Promise<number> {
  if (isMentorCapable(await ctx.db.get(userId))) return 0;
  for (const signup of await ctx.db.query("mentorSeriesSignups").withIndex("by_mentorUserId_and_status", q => q.eq("mentorUserId", userId).eq("status", "active")).take(MAX_SERIES_SIGNUPS)) {
    await ctx.db.patch(signup._id, { status: "left", updatedAt: now });
  }
  let removed = 0;
  for (const status of ["accepted", "invited"] as const) {
    for (const row of await ctx.db.query("eventMentorInvites").withIndex("by_mentorUserId_and_status", q => q.eq("mentorUserId", userId).eq("status", status)).take(500)) {
      const event = await ctx.db.get(row.eventId);
      if (event && !event.archived && event.endsAt > now) { await ctx.db.delete(row._id); removed++; }
    }
  }
  return removed;
}

/** What a Mentor's series sign-up means for one meeting (null when the meeting isn't in a series they signed up for). */
export type SeriesSignupView = { scope: SeriesScope; count: number | null; coversThisMeeting: boolean; skippedThisMeeting: boolean };

export function seriesSignupView(signup: Doc<"mentorSeriesSignups"> | null | undefined, event: Doc<"events">): SeriesSignupView | null {
  if (!signup || signup.status !== "active" || !event.seriesOccurrenceKey || signup.seriesId !== event.seriesId) return null;
  const key = event.seriesOccurrenceKey, skipped = signup.skippedKeys.includes(key);
  return { scope: signup.scope, count: signup.count ?? null, coversThisMeeting: !skipped && (signup.scope === "all" || signup.coveredKeys.includes(key)), skippedThisMeeting: skipped };
}
