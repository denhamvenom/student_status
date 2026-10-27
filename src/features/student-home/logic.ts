import type { Id } from '../../../convex/_generated/dataModel'
import type { HomeAttendance, OpenSignup, PinnedAnnouncement, RoomChoice, StudentHomeSummary, UpcomingCompetition, WhatsLeftItem } from './contract'
import { chicagoDateKey } from './format'

/*
 * Pure Student Home rules. Every "soon" or "past" decision takes the browser's `now`
 * (Convex queries cannot read the clock), so the screen re-evaluates as useNow ticks.
 */

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS
/** Signups, room deadlines and due dates within this window are "soon". */
export const SOON_MS = 7 * DAY_MS
/** Under this, the countdown switches from days to hours. */
export const HOURS_THRESHOLD_MS = 48 * HOUR_MS
/** At most this many pinned messages appear in the hero stack. */
export const MAX_PINNED = 5

const ascending = (a: number | null, b: number | null) => (a ?? Number.POSITIVE_INFINITY) === (b ?? Number.POSITIVE_INFINITY) ? 0 : (a ?? Number.POSITIVE_INFINITY) < (b ?? Number.POSITIVE_INFINITY) ? -1 : 1
const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

function chicagoDayNumber(epoch: number) {
  const [year, month, day] = chicagoDateKey(epoch).split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

/** Whole Chicago calendar days from `now` to `epoch`; 0 on the same day, negative once past. */
export function calendarDaysUntil(epoch: number, now: number) {
  return chicagoDayNumber(epoch) - chicagoDayNumber(now)
}

/** Still ahead and no more than seven days away. */
export function isWithinSoon(at: number | null, now: number) {
  return at !== null && at > now && at - now <= SOON_MS
}

// Room choice ---------------------------------------------------------------

/** A room choice belongs on Home until its deadline passes or the room is final. */
export function isRoomOpen(room: RoomChoice, now: number) {
  return room.status !== 'final' && (room.roomDeadline === null || room.roomDeadline > now)
}

export function isRoomUrgent(room: RoomChoice, now: number) {
  return isRoomOpen(room, now) && isWithinSoon(room.roomDeadline, now)
}

// Hero stack ----------------------------------------------------------------

export type CountdownTarget =
  | { kind: 'kickoff'; at: number; from: number }
  | { kind: 'competition'; at: number; from: number; name: string; eventId: Id<'events'> }

/**
 * Before kickoff: kickoff. From kickoff on (or when kickoff is not verified): the next Competition
 * that has not started. Nothing ahead: no countdown.
 */
export function countdownTarget(season: StudentHomeSummary['season'], competitions: UpcomingCompetition[], now: number): CountdownTarget | null {
  if (season.kickoffAt !== null && now < season.kickoffAt) return { kind: 'kickoff', at: season.kickoffAt, from: season.startsAt }
  const next = [...competitions].filter(competition => competition.startsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0]
  if (!next) return null
  return { kind: 'competition', at: next.startsAt, from: season.kickoffAt ?? season.startsAt, name: next.name, eventId: next.eventId }
}

/** Days until the target; hours once it is less than 48 hours away. */
export function countdownValue(at: number, now: number): { unit: 'days' | 'hours'; value: number } {
  const left = at - now
  if (left < HOURS_THRESHOLD_MS) return { unit: 'hours', value: Math.max(1, Math.ceil(left / HOUR_MS)) }
  return { unit: 'days', value: calendarDaysUntil(at, now) }
}

/** How far `now` is between `from` and `to`, 0–1. */
export function progressFraction(from: number, to: number, now: number) {
  if (to <= from) return now >= to ? 1 : 0
  return clamp01((now - from) / (to - from))
}

export type Milestone = { key: string; kind: 'kickoff' | 'competition'; name: string | null; startsAt: number; endsAt: number }

/** Kickoff while it is ahead and the next two Competitions, in date order. */
export function upcomingMilestones(season: StudentHomeSummary['season'], competitions: UpcomingCompetition[], now: number): Milestone[] {
  const kickoff: Milestone[] = season.kickoffAt !== null && season.kickoffAt > now ? [{ key: 'kickoff', kind: 'kickoff', name: null, startsAt: season.kickoffAt, endsAt: season.kickoffAt }] : []
  const next = [...competitions].filter(competition => competition.startsAt > now).sort((a, b) => a.startsAt - b.startsAt).slice(0, 2)
  return [...kickoff, ...next.map(competition => ({ key: competition.eventId, kind: 'competition' as const, name: competition.name, startsAt: competition.startsAt, endsAt: competition.endsAt }))].sort((a, b) => a.startsAt - b.startsAt)
}

/** Pinned messages that have not expired, newest pin first, at most five. */
export function visibleAnnouncements(announcements: PinnedAnnouncement[], now: number) {
  return announcements.filter(item => item.showUntil === null || item.showUntil > now).sort((a, b) => b.pinnedAt - a.pinnedAt).slice(0, MAX_PINNED)
}

export type HeroCard =
  | { kind: 'room'; key: string; room: RoomChoice }
  | { kind: 'announcement'; key: string; announcement: PinnedAnnouncement }
  | { kind: 'countdown'; key: 'countdown'; target: CountdownTarget }

/** Room choices (soonest deadline first), then pinned messages, then the countdown last. */
export function heroCards(summary: Pick<StudentHomeSummary, 'roomChoices' | 'season' | 'competitions'>, announcements: PinnedAnnouncement[], now: number): HeroCard[] {
  const rooms = summary.roomChoices.filter(room => isRoomOpen(room, now)).sort((a, b) => ascending(a.roomDeadline, b.roomDeadline) || a.startsAt - b.startsAt)
  const target = countdownTarget(summary.season, summary.competitions, now)
  return [
    ...rooms.map(room => ({ kind: 'room' as const, key: `room:${room.eventId}`, room })),
    ...visibleAnnouncements(announcements, now).map(announcement => ({ kind: 'announcement' as const, key: `pin:${announcement.id}`, announcement })),
    ...(target ? [{ kind: 'countdown' as const, key: 'countdown' as const, target }] : []),
  ]
}

// Open signups --------------------------------------------------------------

/** Signups whose close time has not passed, closing soonest first. */
export function openSignupRows(signups: OpenSignup[], now: number) {
  return signups.filter(signup => signup.signupClosesAt === null || signup.signupClosesAt > now).sort((a, b) => ascending(a.signupClosesAt, b.signupClosesAt) || a.startsAt - b.startsAt)
}

export function openSignupsSummary(signups: OpenSignup[], now: number) {
  const rows = openSignupRows(signups, now)
  const closingSoon = rows.filter(row => isWithinSoon(row.signupClosesAt, now)).length
  return { rows, closingSoon, tone: closingSoon > 0 ? 'urgent' as const : 'quiet' as const }
}

// What's left ---------------------------------------------------------------

export type WhatsLeftGroup = 'student' | 'parent' | 'coach' | 'coachOrTravelLead'
export type DueState = 'overdue' | 'soon' | 'later' | 'none'

/** Who the Student is waiting for. Signup approval can come from a Coach or a Travel Lead. */
export function groupOf(item: WhatsLeftItem): WhatsLeftGroup {
  if (item.owner === 'student') return 'student'
  if (item.kind === 'signupApproval') return 'coachOrTravelLead'
  return item.owner
}

export function dueState(item: Pick<WhatsLeftItem, 'dueAt'>, now: number): DueState {
  if (item.dueAt === null) return 'none'
  if (item.dueAt <= now) return 'overdue'
  return item.dueAt - now <= SOON_MS ? 'soon' : 'later'
}

const urgencyRank = (item: WhatsLeftItem, now: number) => {
  const state = dueState(item, now)
  return state === 'overdue' ? 0 : state === 'soon' || item.kind === 'inviteParent' ? 1 : state === 'later' ? 2 : 3
}

export type WhatsLeftBadge = { kind: 'overdue' } | { kind: 'dueSoon'; count: number } | { kind: 'allSet' } | null

/**
 * The Student's own items drive the count, tone and badge; items waiting on a parent or staff are
 * listed quietly and never make the tile urgent. "Invite a parent" is urgent without a due date.
 */
export function whatsLeftSummary(items: WhatsLeftItem[], now: number) {
  const sorted = [...items].sort((a, b) => urgencyRank(a, now) - urgencyRank(b, now) || ascending(a.dueAt, b.dueAt))
  const groups: Record<WhatsLeftGroup, WhatsLeftItem[]> = { student: [], parent: [], coach: [], coachOrTravelLead: [] }
  for (const item of sorted) groups[groupOf(item)].push(item)
  const own = groups.student
  const overdue = own.filter(item => dueState(item, now) === 'overdue').length
  const dueSoon = own.filter(item => dueState(item, now) === 'soon').length
  const inviteParent = own.some(item => item.kind === 'inviteParent')
  const tone = overdue > 0 ? 'overdue' as const : dueSoon > 0 || inviteParent ? 'urgent' as const : own.length === 0 ? 'done' as const : 'quiet' as const
  const badge: WhatsLeftBadge = overdue > 0 ? { kind: 'overdue' } : dueSoon > 0 ? { kind: 'dueSoon', count: dueSoon } : own.length === 0 ? { kind: 'allSet' } : null
  const waiting = (['parent', 'coach', 'coachOrTravelLead'] as const).map(group => ({ group, count: groups[group].length })).filter(line => line.count > 0)
  return { own, count: own.length, overdue, dueSoon, tone, badge, groups, waiting }
}

/** "You're all set" in the greeting when only items waiting on others remain. */
export function hasOwnWork(items: WhatsLeftItem[]) {
  return items.some(item => item.owner === 'student')
}

// Participation -------------------------------------------------------------

/** Whole percent attended; null when nothing was held (never NaN). */
export function percentAttended(attended: number, held: number) {
  return held > 0 ? Math.round(100 * Math.min(Math.max(attended, 0), held) / held) : null
}

export function ringFraction(attended: number, held: number) {
  return held > 0 ? clamp01(attended / held) : 0
}

export function participationView(attendance: HomeAttendance) {
  const { meetings, outreach, buildHours } = attendance
  const buildStarted = buildHours.state === 'ready'
  const target = buildHours.targetHours !== null && buildHours.targetHours > 0 ? buildHours.targetHours : null
  return {
    meetings: { ...meetings, percent: percentAttended(meetings.attended, meetings.held), fraction: ringFraction(meetings.attended, meetings.held) },
    outreach: { ...outreach, fraction: ringFraction(outreach.attended, outreach.held) },
    build: { started: buildStarted, minutes: buildStarted ? buildHours.minutes : 0, target, fraction: buildStarted && target ? clamp01(buildHours.minutes / 60 / target) : 0 },
  }
}
