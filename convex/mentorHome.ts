import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { activeSeason, viewer } from "./lib/access";
import { todayKey } from "./lib/seriesGenerate";
import { isMentorSeriesNow, MAX_SERIES_SIGNUPS, mentorMeetingCreatorId, plausibleAsOf, requireMeetingMentor, selfSignupEligible, seriesOf } from "./lib/mentorMeetings";
import { meetingSummary, mentorMeetingSummary, type MentorMeetingSummary } from "./mentorMeetings";

/** Rows kept per list (Home shows the first few; Your schedule shows all of them). */
const MAX_LIST = 100;
/**
 * Own invite rows read per status (newest first); events the Mentor created read; upcoming season events scanned for meetings
 * to join. Invite rows can't be read in event-time order (no index on the event's time), so every row in the cap is checked and
 * all current ones are kept: an upcoming invite stays visible behind up to this many newer rows for past events (several
 * seasons for a busy Mentor); beyond that the result is marked truncated.
 */
const MAX_INVITE_SCAN = 500;
const MAX_CREATED = MAX_LIST + 1;
const MAX_SCAN = 600;
const MAX_SERIES = 50;
const MAX_SERIES_EVENTS = 30;
/** Total meetings read across all of the Mentor's series. */
const MAX_SERIES_MEETINGS = 300;
const DAY = 24 * 3_600_000;

const mySeries = v.object({
  seriesId: v.id("eventSeries"), name: v.string(), status: v.string(), weekdays: v.array(v.number()), intervalWeeks: v.number(), localStartTime: v.string(), durationMinutes: v.number(),
  startDate: v.string(), untilDate: v.union(v.string(), v.null()), count: v.union(v.number(), v.null()),
});

/**
 * Mentor Home in one query. Mentors only: a Mentor account or a Parent with Mentor staff access (not Coach, Student, or a
 * Parent without that access). Reads, by index and bounded: the Mentor's own
 * invite rows, the meetings they created (by createdBy and by their series), and a capped scan of the season's UPCOMING events
 * for meetings open to them. Each list holds up to 100 rows (Home shows a few; the Your schedule page shows all). Returns minimized
 * rows (title, time, place, flags, the Mentor's own state; see mentorMeetings.view for a meeting's detail).
 */
export const mentorHome = query({
  args: { asOf: v.number() },
  returns: v.object({
    canCreateMeeting: v.literal(true),
    /** The Mentor's subteams (primary subteams and CAD), as set by a Coach. */
    subteams: v.array(v.string()),
    /** Accepted or self-signed-up, upcoming, not canceled, soonest first. */
    scheduled: v.array(mentorMeetingSummary),
    /** Invited and not answered yet, upcoming, not canceled, soonest first. */
    pendingInvites: v.array(mentorMeetingSummary),
    /** Open to this Mentor (any event except ones for other subteams only) and not joined, soonest first. mentorMeetings.signUp. */
    signUpAvailable: v.array(mentorMeetingSummary),
    /** Upcoming meetings this Mentor created (including canceled ones still upcoming), soonest first. */
    created: v.array(mentorMeetingSummary),
    /** Repeating series this Mentor created and that are still running. */
    createdSeries: v.array(mySeries),
    /** True when a read cap was reached, so some meetings may be missing. */
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // A Mentor account, or a Parent with Mentor staff access (acting as a plain Mentor here).
    const user = await requireMeetingMentor(ctx, await viewer(ctx));
    const season = await activeSeason(ctx);
    // Client-supplied time (queries don't read the clock), clamped by plausibleAsOf: rounded to the minute and never earlier than
    // the season or the account's creation. Every list also requires a non-archived event, and the server archives each event
    // when it ends, so an old asOf can't bring back past events (lib/mentorMeetings plausibleAsOf).
    const now = plausibleAsOf(args.asOf, [season._creationTime, user._creationTime]);
    if (now === null) throw new ConvexError("Mentor Home could not load. Reload the page and try again.");
    let truncated = false;
    const events = new Map<Id<"events">, Doc<"events">>();
    const invites = new Map<Id<"events">, Doc<"eventMentorInvites">>();
    const current = (event: Doc<"events"> | null): event is Doc<"events"> => !!event && event.seasonId === season._id && !event.archived && event.endsAt >= now;
    // 1. The Mentor's own invitations (invited, accepted), newest first; every current one in the scan cap is kept (the lists
    // are sorted and cut to the soonest 100 below), so rows for past events can't hide an upcoming invite.
    for (const status of ["invited", "accepted"] as const) {
      const rows = await ctx.db.query("eventMentorInvites").withIndex("by_mentorUserId_and_status", q => q.eq("mentorUserId", user._id).eq("status", status)).order("desc").take(MAX_INVITE_SCAN + 1);
      if (rows.length > MAX_INVITE_SCAN) truncated = true;
      for (const row of rows.slice(0, MAX_INVITE_SCAN)) {
        const event = await ctx.db.get(row.eventId);
        if (!current(event)) continue;
        events.set(event._id, event);
        if (!invites.has(event._id)) invites.set(event._id, row);
      }
    }
    // 2. Meetings they created: their own createdBy, and the meetings of their series (generated ones carry no createdBy).
    const mine = await ctx.db.query("events").withIndex("by_createdBy_and_endsAt", q => q.eq("createdBy", user._id).gte("endsAt", now)).take(MAX_CREATED);
    if (mine.length > MAX_LIST) truncated = true;
    for (const event of mine) if (current(event)) events.set(event._id, event);
    // Ended series are skipped (no meetings ahead to list); reads are capped per status, per series and in total. Meetings of a
    // series a Coach made restricted are still read (one may still be a Mentor meeting), but the series isn't listed as theirs.
    const series: Doc<"eventSeries">[] = [];
    for (const status of ["active", "needsReview", "conflict"] as const) {
      const rows = await ctx.db.query("eventSeries").withIndex("by_createdBy_and_status", q => q.eq("createdBy", user._id).eq("status", status)).take(MAX_SERIES + 1);
      if (rows.length > MAX_SERIES) truncated = true;
      for (const row of rows.slice(0, MAX_SERIES)) if (row.seasonId === season._id) series.push(row);
    }
    const fromKey = todayKey(now - DAY);
    let seriesMeetingsRead = 0;
    for (const row of series) {
      const budget = Math.min(MAX_SERIES_EVENTS, MAX_SERIES_MEETINGS - seriesMeetingsRead);
      if (budget <= 0) { truncated = true; break; }
      const rows = await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", row._id).gte("seriesOccurrenceKey", fromKey)).take(budget + 1);
      if (rows.length > budget) truncated = true;
      seriesMeetingsRead += Math.min(rows.length, budget);
      for (const event of rows.slice(0, budget)) if (current(event)) events.set(event._id, event);
    }
    // The Mentor's active series sign-ups (every meeting / next N / just one), shown on each meeting of those series.
    const signupRows = await ctx.db.query("mentorSeriesSignups").withIndex("by_mentorUserId_and_status", q => q.eq("mentorUserId", user._id).eq("status", "active")).take(MAX_SERIES_SIGNUPS + 1);
    if (signupRows.length > MAX_SERIES_SIGNUPS) truncated = true;
    const signups = new Map(signupRows.slice(0, MAX_SERIES_SIGNUPS).map(row => [row.seriesId, row] as const));
    // 3. Events to join: the season's UPCOMING events (any type), read by end time up to a cap. There is no index that lists
    // still-running events by start time, so every candidate in the read is kept and the soonest-starting MAX_LIST are taken,
    // the same order as the final list: a long event that started first isn't dropped behind many later, shorter ones.
    const seriesCache = new Map<Id<"eventSeries">, Doc<"eventSeries"> | null>();
    const upcoming = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false).gte("endsAt", now)).take(MAX_SCAN + 1);
    if (upcoming.length > MAX_SCAN) truncated = true;
    const joinableEvents: Doc<"events">[] = [];
    for (const event of upcoming.slice(0, MAX_SCAN)) {
      if (events.has(event._id) || !selfSignupEligible(user, event, now)) continue;
      // The creator of a Mentor meeting is already going (listMeetingMentors); the creator of any other event (a Travel Lead's
      // Competition) can join it like anyone else.
      if ((await mentorMeetingCreatorId(ctx, event, seriesCache)) === user._id) continue;
      joinableEvents.push(event);
    }
    if (joinableEvents.length > MAX_LIST) truncated = true;
    joinableEvents.sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name));
    for (const event of joinableEvents.slice(0, MAX_LIST)) events.set(event._id, event);
    const scheduled: MentorMeetingSummary[] = [], pendingInvites: MentorMeetingSummary[] = [], signUpAvailable: MentorMeetingSummary[] = [], created: MentorMeetingSummary[] = [];
    for (const event of events.values()) {
      // .first(): a duplicate invite row must not break Home.
      const invite = invites.get(event._id) ?? await ctx.db.query("eventMentorInvites").withIndex("by_eventId_and_mentorUserId", q => q.eq("eventId", event._id).eq("mentorUserId", user._id)).first();
      // Creator rights only while the event is still a Mentor meeting (a former Travel Lead's Competition doesn't count).
      const creatorId = await mentorMeetingCreatorId(ctx, event, seriesCache);
      const isCreator = creatorId === user._id;
      const eligible = selfSignupEligible(user, event, now);
      if (!isCreator && !invite && !eligible) continue;
      const eventSeries = event.seriesId ? await seriesOf(ctx, event.seriesId, seriesCache) : null;
      const row = meetingSummary(event, user, invite, creatorId, now, event.seriesId ? signups.get(event.seriesId) ?? null : null, eventSeries);
      if (isCreator) created.push(row);
      if (event.cancelled) continue;
      if (invite?.status === "accepted") scheduled.push(row);
      else if (invite?.status === "invited") pendingInvites.push(row);
      // Only when the Mentor can actually sign up (the creator of their own Mentor meeting is already going, with no button).
      else if (eligible && row.canSignUp) signUpAvailable.push(row);
    }
    const bySoonest = (a: MentorMeetingSummary, b: MentorMeetingSummary) => a.startsAt - b.startsAt || a.title.localeCompare(b.title);
    // Every list is cut to the first (soonest) MAX_LIST rows; cutting one marks the result truncated.
    const firstRows = (rows: MentorMeetingSummary[]) => { if (rows.length > MAX_LIST) truncated = true; return rows.sort(bySoonest).slice(0, MAX_LIST); };
    const lists = { scheduled: firstRows(scheduled), pendingInvites: firstRows(pendingInvites), signUpAvailable: firstRows(signUpAvailable), created: firstRows(created) };
    return {
      canCreateMeeting: true as const, subteams: [...(user.subteams ?? [])], ...lists,
      // The same rule as eventSeries.seriesEditBlocker: only series the Mentor may still manage.
      createdSeries: series.filter(isMentorSeriesNow).map(row => ({ seriesId: row._id, name: row.name, status: row.status, weekdays: row.weekdays, intervalWeeks: row.intervalWeeks, localStartTime: row.localStartTime, durationMinutes: row.durationMinutes, startDate: row.startDate, untilDate: row.untilDate ?? null, count: row.count ?? null })),
      truncated,
    };
  },
});
