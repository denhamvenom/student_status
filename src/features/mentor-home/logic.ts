// Mentor Home rules: which blocks show, which meetings go in each, and how each one is described.
// Pure (no Convex or React) so the rules are tested directly; the backend decides what a Mentor may see and do.
import { onsiteLocation } from '../../../convex/lib/transportation'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { canonicalSubteam, subteamDisplay } from '@/lib/subteams'
import { formatWhen } from '../student-home/agenda'
import { repeatSummary } from '../event-setup/audience/repeat'
import type { RepeatValue } from '../event-setup/audience/types'
import type { EditableEvent } from '../operations/event-edit'
import type { ClockedInData, JoinEntry, MentorHomeData, MentorMeeting, MentorSeries } from './contract'

const copy = mentorHomeCopy

type Timed = Pick<MentorMeeting, 'startsAt' | 'endsAt' | 'title'>

/** Soonest first; same start sorts by title so the order never jumps between reloads. */
export const bySoonest = (a: Timed, b: Timed) => a.startsAt - b.startsAt || a.title.localeCompare(b.title)

/** Not over yet (a meeting in progress still counts), soonest first. */
export function upcoming<T extends Timed>(rows: readonly T[], now: number): T[] {
  return rows.filter(row => row.endsAt > now).sort(bySoonest)
}

/** Where the meeting is, in plain words. */
export function meetingPlace(meeting: Pick<MentorMeeting, 'place' | 'virtual'>): string {
  if (meeting.virtual) return copy.meeting.virtual
  const place = meeting.place.trim()
  if (place === onsiteLocation) return copy.meeting.shop
  return place || copy.meeting.noPlace
}

/** "Tue Nov 10, 6–8 PM · DSHS STEM Center (on site)". */
export const meetingLine = (meeting: Pick<MentorMeeting, 'startsAt' | 'endsAt' | 'place' | 'virtual'>) => `${formatWhen(meeting.startsAt, meeting.endsAt)} · ${meetingPlace(meeting)}`

/** The Mentor's own part in the meeting, for a small badge; null when they have none yet. */
export function myPartLabel(meeting: Pick<MentorMeeting, 'isCreator' | 'myStatus' | 'mySource'>): string | null {
  if (meeting.isCreator) return copy.meeting.youCreated
  if (meeting.myStatus === 'accepted') return meeting.mySource === 'self' ? copy.meeting.selfSignedUp : copy.meeting.going
  if (meeting.myStatus === 'invited') return copy.meeting.invited
  return null
}

/** A meeting of a series the Mentor signed up for and then skipped ("Skip this one"); it can be joined again. */
export const isSkipped = (row: Pick<MentorMeeting, 'seriesSignup' | 'cancelled'>) => !row.cancelled && row.seriesSignup?.skippedThisMeeting === true

/**
 * The Mentor's schedule: accepted / self-signed-up meetings plus upcoming meetings they created (a creator runs their meeting
 * even without an invite row), soonest first, without duplicates, canceled or past meetings.
 */
export function myUpcoming(data: Pick<MentorHomeData, 'scheduled' | 'created'>, now: number): MentorMeeting[] {
  const seen = new Set<string>()
  const mine: MentorMeeting[] = []
  for (const row of [...data.scheduled, ...data.created]) {
    if (row.cancelled || seen.has(row.eventId)) continue
    seen.add(row.eventId)
    mine.push(row)
  }
  return upcoming(mine, now)
}

/** One Needs your answer row: an invitation (Answer opens the wizard to say yes) or a trip missing a drive / hotel answer. */
export type AnswerItem = { meeting: MentorMeeting; mode: 'accept' | 'change'; reason: string }

/** Why a meeting the Mentor is going to still needs an answer from them (driving, then hotel room); null when it doesn't. */
export function missingAnswer(meeting: Pick<MentorMeeting, 'myStatus' | 'canWithdraw' | 'cancelled' | 'questions' | 'myAnswers'>): string | null {
  if (meeting.cancelled || meeting.myStatus !== 'accepted' || !meeting.canWithdraw) return null
  if (meeting.questions.askDrive && meeting.myAnswers.canDriveStudents === null) return copy.answer.missingDrive
  if (meeting.questions.askHotel && meeting.myAnswers.needsHotelRoom === null) return copy.answer.missingHotel
  return null
}

/**
 * Needs your answer: open invitations and meetings the Mentor is going to that still need a drive or hotel answer, upcoming
 * and not canceled, soonest first. Empty hides the block.
 */
export function needsAnswer(data: Pick<MentorHomeData, 'pendingInvites' | 'scheduled'>, now: number): AnswerItem[] {
  const invites = upcoming(data.pendingInvites.filter(row => !row.cancelled), now).map(meeting => ({ meeting, mode: 'accept' as const, reason: copy.answer.invited }))
  const seen = new Set(invites.map(item => item.meeting.eventId))
  const answers = upcoming(data.scheduled, now).flatMap(meeting => {
    const reason = seen.has(meeting.eventId) ? null : missingAnswer(meeting)
    return reason ? [{ meeting, mode: 'change' as const, reason }] : []
  })
  return [...invites, ...answers].sort((a, b) => bySoonest(a.meeting, b.meeting))
}

/** Coming up shows this many meetings after the Next event. */
export const COMING_UP_LIMIT = 3
/** At most this many tags on a Coming up row. */
export const MAX_TAGS = 2

/** Same subteam under the server's rule: legacy names are canonicalized (Mechanical = Build), then compared without case. */
const sameSubteam = (a: string, b: string) => canonicalSubteam(a).toLowerCase() === canonicalSubteam(b).toLowerCase()

/** Coming up tags, at most two: Travel (it asks about driving or a hotel room), then Your subteam (for one of the Mentor's subteams). */
export function comingUpTags(meeting: Pick<MentorMeeting, 'questions' | 'audience'>, subteams: readonly string[]): string[] {
  const tags: string[] = []
  if (meeting.questions.askDrive || meeting.questions.askHotel) tags.push(copy.tags.travel)
  if (meeting.audience.kind === 'subteams' && meeting.audience.subteams.some(item => subteams.some(mine => sameSubteam(item, mine)))) tags.push(copy.join.yourSubteam)
  return tags.slice(0, MAX_TAGS)
}

export type HomeView = {
  /** The first meeting on the Mentor's schedule (the Next event card); null when nothing is scheduled. */
  next: MentorMeeting | null
  /** Empty hides Needs your answer. */
  needsAnswer: AnswerItem[]
  /** The next COMING_UP_LIMIT meetings after `next`, each with at most two tags. Empty hides Coming up. */
  comingUp: { meeting: MentorMeeting; tags: string[] }[]
  /** Series and one-time events open to join (Schedule › Join); 0 hides the tile. */
  joinCount: number
}

/** Mentor Home in one pass: Next event, Needs your answer, Coming up and how many events the Mentor could help with. */
export function homeView(data: Pick<MentorHomeData, 'scheduled' | 'created' | 'pendingInvites' | 'joinable' | 'subteams'>, now: number): HomeView {
  const [next = null, ...rest] = myUpcoming(data, now)
  // Series the Mentor already signed up for are not "could help with" anymore, so the count drops when they sign up.
  const join = joinSections(data.joinable.filter(entry => !entry.hasSeriesSignup), now, data.subteams)
  return {
    next,
    needsAnswer: needsAnswer(data, now),
    comingUp: rest.slice(0, COMING_UP_LIMIT).map(meeting => ({ meeting, tags: comingUpTags(meeting, data.subteams) })),
    joinCount: join.competitions.length + join.meetings.length,
  }
}

export type GoingRow = { meeting: MentorMeeting; skipping: boolean }

/** Schedule › Going: everything on the Mentor's schedule plus series meetings they're skipping (marked), soonest first. */
export function goingList(data: Pick<MentorHomeData, 'scheduled' | 'created' | 'signUpAvailable'>, now: number): GoingRow[] {
  const mine = myUpcoming(data, now)
  const seen = new Set(mine.map(row => row.eventId))
  const skipped = upcoming(data.signUpAvailable.filter(row => isSkipped(row) && !seen.has(row.eventId)), now)
  return [...mine.map(meeting => ({ meeting, skipping: false })), ...skipped.map(meeting => ({ meeting, skipping: true }))].sort((a, b) => bySoonest(a.meeting, b.meeting))
}

/** Still open to this Mentor: upcoming, not canceled, not their own meeting and not a series meeting they skipped. */
const openToJoin = (row: MentorMeeting, now: number) => !row.cancelled && row.canSignUp && !row.isCreator && !isSkipped(row) && row.endsAt > now

export type JoinSections = { competitions: JoinEntry[]; meetings: JoinEntry[]; /** Entries left out because they are for other subteams (0 when widened). */ hidden: number }

/**
 * An entry is in the Mentor's scope when it is for the whole team or for one of their subteams. Only a meeting restricted to
 * other subteams is out of scope (the server already refuses those; this keeps the screen right if it ever returns them).
 */
export function joinInScope(entry: Pick<JoinEntry, 'next'>, subteams: readonly string[]): boolean {
  const audience = entry.next.audience
  if (audience.kind !== 'subteams') return true
  return audience.subteams.some(item => subteams.some(mine => sameSubteam(item, mine)))
}

/**
 * Schedule › Join, grouped (owner decision, Nov 7 2026): one entry per repeating series or one-time event, Competitions &
 * trips first, then Meetings & events, each soonest first. An entry is dropped when its next meeting is the Mentor's own,
 * canceled, over or skipped (a skipped meeting shows on Going instead). With `subteams` given, entries for other subteams are
 * left out and counted in `hidden` until the Mentor widens (`showAll`).
 */
export function joinSections(entries: readonly JoinEntry[], now: number, subteams?: readonly string[], showAll = false): JoinSections {
  const openEntries = entries.filter(entry => openToJoin(entry.next, now))
  const scoped = subteams && !showAll ? openEntries.filter(entry => joinInScope(entry, subteams)) : openEntries
  // Mentors can sign up for chosen-students and Mentors-only events too (DECISIONS: Mentor self sign-up), but they come after
  // whole-team and subteam items in each group.
  const narrow = (entry: JoinEntry) => entry.next.audience.kind === 'students' || entry.next.audience.kind === 'mentorsOnly' ? 1 : 0
  const open = [...scoped].sort((a, b) => narrow(a) - narrow(b) || a.nextStartsAt - b.nextStartsAt || a.title.localeCompare(b.title))
  return {
    competitions: open.filter(entry => entry.category === 'competitionsAndTrips'),
    meetings: open.filter(entry => entry.category !== 'competitionsAndTrips'),
    hidden: openEntries.length - scoped.length,
  }
}

/** Who an event is for, as a small row tag: "Whole team", its subteams ("Programming, CAD"), or the narrower audiences. */
export function audienceTag(audience: { kind: MentorMeeting['audience']['kind']; subteams: readonly string[] }): string {
  if (audience.kind === 'subteams') {
    const list = subteamsList(audience.subteams)
    return list || copy.join.wholeTeam
  }
  if (audience.kind === 'students') return copy.join.someStudents
  if (audience.kind === 'mentorsOnly') return copy.join.mentorsOnly
  return copy.join.wholeTeam
}

/** The always-on scope line for Schedule › Join: "Showing: Programming and whole-team items" (or all subteams once widened). */
export function joinScopeLine(subteams: readonly string[], showAll: boolean): string {
  if (showAll) return copy.scope.showingAll
  const list = subteamsList(subteams)
  return list ? copy.scope.showing(list) : copy.scope.showingNone
}

/**
 * How a join entry is described. A series: "Mondays at 6:00 PM · Repeats weekly", then "4 upcoming · Next: Mon Nov 9,
 * 6–8 PM · DSHS STEM Center (on site)". A one-time event: its time and place.
 */
export function joinEntryLines(entry: Pick<JoinEntry, 'kind' | 'scheduleLabel' | 'repeatLabel' | 'upcomingCount' | 'next'>): { line: string; detail: string | null } {
  if (entry.kind !== 'series') return { line: meetingLine(entry.next), detail: null }
  const schedule = entry.scheduleLabel ?? formatWhen(entry.next.startsAt, entry.next.endsAt)
  return { line: copy.join.seriesLine(schedule, entry.repeatLabel ?? copy.tags.repeats), detail: `${copy.join.upcoming(Math.max(1, entry.upcomingCount))} · ${copy.join.nextMeeting(meetingLine(entry.next))}` }
}

export type ScheduleTab = 'going' | 'join' | 'created'
export const SCHEDULE_TABS: readonly ScheduleTab[] = ['going', 'join', 'created']

/** The Schedule tab named in the URL hash (#going, #join, #created); Going otherwise. */
export function tabFromHash(hash: string): ScheduleTab {
  const name = hash.replace(/^#/, '')
  return (SCHEDULE_TABS as readonly string[]).includes(name) ? name as ScheduleTab : 'going'
}

type Pinned = { id: string; pinnedAt: number; showUntil: number | null }

/** A dismissed pinned message is remembered by id and pin time, so pinning it again shows it again. */
export const pinKey = (message: Pick<Pinned, 'id' | 'pinnedAt'>) => `${message.id}:${message.pinnedAt}`

/** The newest pinned message still showing that the Mentor hasn't dismissed on this device, or null (no banner). */
export function unreadPinned<T extends Pinned>(messages: readonly T[], dismissed: ReadonlySet<string>, now: number): T | null {
  return messages.filter(item => (item.showUntil === null || item.showUntil > now) && !dismissed.has(pinKey(item))).sort((a, b) => b.pinnedAt - a.pinnedAt)[0] ?? null
}

export type HereStudent = { name: string; since: string }
export type HereGroup = { subteam: string; count: number; students: HereStudent[]; label: string }

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })

/** "4:05 PM" in Central Time. */
export const clockedInTime = (at: number) => timeFormat.format(at)

/** Who's here now, one group per Mentor subteam in the order a Coach set them: the students clocked in, with the time they clocked in. */
export function hereGroups(data: Pick<ClockedInData, 'subteams'>): HereGroup[] {
  return data.subteams.map(group => {
    const subteam = subteamDisplay(group.subteam)
    const students = group.students.map(student => ({ name: student.displayName.trim(), since: copy.here.since(clockedInTime(student.clockedInAt)) })).filter(student => student.name)
    return { subteam, count: group.count, students, label: group.count === 0 ? copy.here.nobody(subteam) : copy.here.count(subteam, group.count) }
  })
}

/** "Programming, CAD": the Mentor's subteams in display form, once each. */
export const subteamsList = (subteams: readonly string[]) => [...new Set(subteams.filter(item => item.trim()).map(subteamDisplay))].join(', ')

/** "Showing: Programming, CAD" for Who's here now (the Mentor's subteams only). */
export const hereScopeLine = (subteams: readonly string[]) => copy.here.showing(subteamsList(subteams))

/** "Team meeting", "Competition", "Outreach", "Fundraiser". */
export const typeLabel = (meeting: Pick<MentorMeeting, 'type'>) => copy.types[meeting.type] ?? meeting.type

/**
 * Simple tags: Travel (it asks who can drive), Overnight (it asks about a hotel room), and how often a series meeting repeats
 * ("Repeats weekly", from the server's repeatLabel; plain "Repeats" if the label is missing).
 */
export function eventTags(meeting: Pick<MentorMeeting, 'questions' | 'seriesId' | 'repeatLabel'>): string[] {
  const tags: string[] = []
  if (meeting.questions.askDrive) tags.push(copy.tags.travel)
  if (meeting.questions.askHotel) tags.push(copy.tags.overnight)
  if (meeting.seriesId) tags.push(meeting.repeatLabel ?? copy.tags.repeats)
  return tags
}

/**
 * The Mentor's series sign-up as it applies to this meeting: "Every meeting", "Next 4 meetings", "Just this one", or
 * "Skipped"; null when the meeting isn't in a series they signed up for.
 */
export function seriesStatus(meeting: Pick<MentorMeeting, 'seriesSignup'>): string | null {
  const signup = meeting.seriesSignup
  if (!signup) return null
  if (signup.skippedThisMeeting) return copy.series.skipped
  if (signup.scope === 'all') return copy.series.every
  if (signup.scope === 'next') return copy.series.next(signup.count ?? 1)
  return copy.series.justOne
}

/** Created by me: upcoming meetings first, canceled ones after them, both soonest first. */
export function createdList(rows: readonly MentorMeeting[], now: number): MentorMeeting[] {
  const live = upcoming(rows, now)
  return [...live.filter(row => !row.cancelled), ...live.filter(row => row.cancelled)]
}

/** "6:00 PM" from a stored "18:00". */
export function clockLabel(localStartTime: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(localStartTime)
  if (!match) return localStartTime
  const hour = Number(match[1]), minute = match[2]
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${period}`
}

/** "Repeats every week on Tuesday · 6:00 PM". */
export function seriesLine(series: Pick<MentorSeries, 'weekdays' | 'intervalWeeks' | 'localStartTime'>): string {
  return `${repeatSummary({ weekdays: series.weekdays as RepeatValue['weekdays'], intervalWeeks: series.intervalWeeks })} · ${clockLabel(series.localStartTime)}`
}

/** "Your subteams: Programming, CAD", or a note that a Coach sets them. */
export function subteamsLine(subteams: readonly string[]): string {
  const list = subteams.filter(item => item.trim()).map(subteamDisplay)
  return list.length ? copy.about.subteams([...new Set(list)].join(', ')) : copy.about.noSubteams
}

/** The edit form's event shape for a meeting row: the place is locked for virtual and on-site meetings. */
export function editableMeeting(meeting: Pick<MentorMeeting, 'eventId' | 'title' | 'place' | 'startsAt' | 'endsAt' | 'virtual' | 'cancelled' | 'calendarRevision'>): EditableEvent {
  return {
    _id: meeting.eventId, name: meeting.title, destination: meeting.place, startsAt: meeting.startsAt, endsAt: meeting.endsAt,
    onsite: meeting.place.trim() === onsiteLocation, locationType: meeting.virtual ? 'virtual' : 'inPerson', cancelled: meeting.cancelled,
    calendarRevision: meeting.calendarRevision, mediaSupportRequested: false,
  }
}
