import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { activeSeason, viewer } from "./lib/access";
import { todayKey } from "./lib/seriesGenerate";
import { forMentorSubteam, isMentorSeriesNow, joinCategory, MAX_SERIES_SIGNUPS, mentorMeetingCreatorId, plausibleAsOf, repeatLabel, requireMeetingMentor, selfSignupEligible, seriesOf, seriesScheduleLabel } from "./lib/mentorMeetings";
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
 * One entry in "Events you can join" (owner decision, Nov 7 2026): ONE entry per repeating series (not one per week) and one
 * per one-time event. `next` is the soonest meeting the Mentor can still sign up for; open the sign-up wizard with it (its
 * eventId, questions and seriesSignup), where the Mentor picks every meeting / next N / just this one.
 */
const joinableEntry = v.object({
  kind: v.union(v.literal("series"), v.literal("event")),
  /** "competitionsAndTrips": a Competition or an overnight trip; else "meetings" (Fundraisers, Outreach, Team meetings, even with travel). */
  category: v.union(v.literal("meetings"), v.literal("competitionsAndTrips")),
  /** A meeting whose audience is restricted to subteams that include one of the Mentor's; always false for competitionsAndTrips. */
  forYourSubteam: v.boolean(),
  /** The series name, or the event title. */
  title: v.string(),
  seriesId: v.union(v.id("eventSeries"), v.null()),
  /** "Repeats weekly" / "Repeats every 2 weeks"; null for a one-time event. */
  repeatLabel: v.union(v.string(), v.null()),
  /** When the series meets, America/Chicago: "Tuesdays and Thursdays at 6:00 PM"; null for a one-time event. */
  scheduleLabel: v.union(v.string(), v.null()),
  nextEventId: v.id("events"),
  nextStartsAt: v.number(),
  /** Upcoming, non-canceled meetings of the series in the scan that this Mentor may see and join (not ones restricted to other subteams), whether or not they are on them; 1 for a one-time event. */
  upcomingCount: v.number(),
  /** Of those, the ones the Mentor can still sign up for (not on their schedule, not an open invitation). */
  joinableCount: v.number(),
  /** The Mentor has an active sign-up for this series (for example "Just this one" or "Next 4"); always false for a one-time event. */
  hasSeriesSignup: v.boolean(),
  /** The next meeting's full row (same shape as signUpAvailable). */
  next: mentorMeetingSummary,
});

type JoinableEntry = typeof joinableEntry.type;

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
    /**
     * "Events you can join", grouped: one entry per repeating series and one per one-time event, soonest next meeting first,
     * up to 100 entries. Built from the same eligible events as signUpAvailable.
     */
    joinable: v.array(joinableEntry),
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
    // "Events you can join" groups a series' meetings into one entry (owner decision, Nov 7 2026). Groups keep the soonest-first
    // order of their first meeting; the first MAX_LIST groups are kept and each group's first meeting gets a row below, even when
    // it falls after the 100 soonest joinable meetings (it can't be later than the 600-event scan already read).
    const joinGroups = new Map<string, Doc<"events">[]>();
    for (const event of joinableEvents) {
      const key = event.seriesId ?? event._id;
      const group = joinGroups.get(key);
      if (group) group.push(event); else joinGroups.set(key, [event]);
    }
    if (joinGroups.size > MAX_LIST) truncated = true;
    const keptGroups = [...joinGroups.values()].slice(0, MAX_LIST);
    for (const group of keptGroups) events.set(group[0]._id, group[0]);
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
    // Grouped joinable entries, from the rows that made signUpAvailable (before its cut), so they follow the same rules.
    const signable = new Map(signUpAvailable.map(row => [row.eventId, row] as const));
    const upcomingInSeries = new Map<Id<"eventSeries">, number>();
    for (const event of upcoming.slice(0, MAX_SCAN)) if (event.seriesId && selfSignupEligible(user, event, now)) upcomingInSeries.set(event.seriesId, (upcomingInSeries.get(event.seriesId) ?? 0) + 1);
    const joinable: JoinableEntry[] = [];
    for (const group of keptGroups) {
      const nextEvent = group.find(event => signable.has(event._id));
      if (!nextEvent) continue;
      const next = signable.get(nextEvent._id)!;
      const joinableCount = group.filter(event => signable.has(event._id)).length;
      const seriesId = nextEvent.seriesId ?? null;
      const eventSeries = seriesId ? await seriesOf(ctx, seriesId, seriesCache) : null;
      joinable.push({
        kind: seriesId ? "series" : "event", category: joinCategory(nextEvent), forYourSubteam: forMentorSubteam(user, nextEvent),
        title: seriesId ? eventSeries?.name.trim() || next.title : next.title, seriesId,
        repeatLabel: repeatLabel(nextEvent, eventSeries), scheduleLabel: seriesId ? seriesScheduleLabel(eventSeries, nextEvent.startsAt) : null,
        nextEventId: next.eventId, nextStartsAt: next.startsAt,
        upcomingCount: seriesId ? Math.max(upcomingInSeries.get(seriesId) ?? 0, joinableCount) : 1, joinableCount,
        hasSeriesSignup: seriesId !== null && signups.has(seriesId), next,
      });
    }
    joinable.sort((a, b) => a.nextStartsAt - b.nextStartsAt || a.title.localeCompare(b.title));
    // Every list is cut to the first (soonest) MAX_LIST rows; cutting one marks the result truncated.
    const firstRows = (rows: MentorMeetingSummary[]) => { if (rows.length > MAX_LIST) truncated = true; return rows.sort(bySoonest).slice(0, MAX_LIST); };
    const lists = { scheduled: firstRows(scheduled), pendingInvites: firstRows(pendingInvites), signUpAvailable: firstRows(signUpAvailable), created: firstRows(created) };
    return {
      canCreateMeeting: true as const, subteams: [...(user.subteams ?? [])], ...lists, joinable,
      // The same rule as eventSeries.seriesEditBlocker: only series the Mentor may still manage.
      createdSeries: series.filter(isMentorSeriesNow).map(row => ({ seriesId: row._id, name: row.name, status: row.status, weekdays: row.weekdays, intervalWeeks: row.intervalWeeks, localStartTime: row.localStartTime, durationMinutes: row.durationMinutes, startDate: row.startDate, untilDate: row.untilDate ?? null, count: row.count ?? null })),
      truncated,
    };
  },
});
