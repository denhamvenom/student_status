// Mentor Home rules: which meetings show where, in what order, and how each one is described.
// Pure (no Convex or React) so the rules are tested directly; the backend decides what a Mentor may see and do.
import { onsiteLocation } from '../../../convex/lib/transportation'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { subteamDisplay } from '@/lib/subteams'
import { formatWhen } from '../student-home/agenda'
import { calendarDaysUntil } from '../student-home/logic'
import { formatLongDate, formatWeekday } from '../student-home/format'
import { repeatSummary } from '../event-setup/audience/repeat'
import type { RepeatValue } from '../event-setup/audience/types'
import type { EditableEvent } from '../operations/event-edit'
import type { MentorHomeData, MentorMeeting, MentorSeries } from './contract'

const copy = mentorHomeCopy

/** Rows shown before "N more" in Where you're scheduled, Meetings you can join and Meetings you created. */
export const LIST_LIMIT = 5

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

/** "today", "tomorrow", "on Fri" or "on Mon, Nov 16" (more than a week away), for the Next up card. */
export function startsWhen(startsAt: number, now: number): string {
  const days = calendarDaysUntil(startsAt, now)
  if (days <= 0) return startsAt <= now ? 'now' : 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `on ${formatWeekday(startsAt)}`
  return `on ${formatLongDate(startsAt)}`
}

export type ScheduleView = {
  /** The first meeting the Mentor is going to (or creating), shown big. Null when nothing is scheduled. */
  next: MentorMeeting | null
  /** Invitations waiting for an answer, soonest first. Always shown in full: each needs an answer. */
  invites: MentorMeeting[]
  /** The rest of the Mentor's schedule after `next`, soonest first, at most LIST_LIMIT. */
  going: MentorMeeting[]
  moreGoing: number
  /** Series meetings the Mentor skipped (still in a series they signed up for), soonest first, at most LIST_LIMIT. */
  skipped: MentorMeeting[]
}

/** A meeting of a series the Mentor signed up for and then skipped ("Skip this one"); it can be joined again. */
export const isSkipped = (row: Pick<MentorMeeting, 'seriesSignup' | 'cancelled'>) => !row.cancelled && row.seriesSignup?.skippedThisMeeting === true

/**
 * Where you're scheduled: accepted / self-signed-up meetings plus upcoming meetings the Mentor created (a creator runs
 * their meeting even without an invite row), without duplicates or canceled meetings. Skipped series meetings (the backend
 * lists them as open to sign up again) are shown here as Skipped instead of under Events and meetings you can join.
 */
export function scheduleView(data: Pick<MentorHomeData, 'scheduled' | 'pendingInvites' | 'created' | 'signUpAvailable'>, now: number): ScheduleView {
  const seen = new Set<string>()
  const mine: MentorMeeting[] = []
  for (const row of [...data.scheduled, ...data.created]) {
    if (row.cancelled || seen.has(row.eventId)) continue
    seen.add(row.eventId)
    mine.push(row)
  }
  const sorted = upcoming(mine, now)
  const [next = null, ...rest] = sorted
  return {
    next,
    invites: upcoming(data.pendingInvites.filter(row => !row.cancelled), now),
    going: rest.slice(0, LIST_LIMIT),
    moreGoing: Math.max(0, rest.length - LIST_LIMIT),
    skipped: upcoming(data.signUpAvailable.filter(row => isSkipped(row) && !seen.has(row.eventId)), now).slice(0, LIST_LIMIT),
  }
}

/**
 * Events and meetings you can join: still open to sign-up, soonest first. The Mentor's own meetings are left out (the
 * backend also lists a creator's Everyone meeting as open to them; they are already on their schedule), and so are series
 * meetings they skipped (shown as Skipped on their schedule).
 */
export function joinable(rows: readonly MentorMeeting[], now: number, limit = LIST_LIMIT): { shown: MentorMeeting[]; more: number } {
  const open = upcoming(rows.filter(row => !row.cancelled && row.canSignUp && !row.isCreator && !isSkipped(row)), now)
  return { shown: open.slice(0, limit), more: Math.max(0, open.length - limit) }
}

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

/** Meetings you created: upcoming ones first, canceled ones after them, both soonest first. */
export function createdList(rows: readonly MentorMeeting[], now: number, limit = LIST_LIMIT): { shown: MentorMeeting[]; more: number } {
  const live = upcoming(rows, now)
  const ordered = [...live.filter(row => !row.cancelled), ...live.filter(row => row.cancelled)]
  return { shown: ordered.slice(0, limit), more: Math.max(0, ordered.length - limit) }
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

/** Count of answers still owed, for the greeting line. */
export const pendingCount = (data: Pick<MentorHomeData, 'pendingInvites'>, now: number) => upcoming(data.pendingInvites.filter(row => !row.cancelled), now).length

/** The edit form's event shape for a meeting row: the place is locked for virtual and on-site meetings. */
export function editableMeeting(meeting: Pick<MentorMeeting, 'eventId' | 'title' | 'place' | 'startsAt' | 'endsAt' | 'virtual' | 'cancelled' | 'calendarRevision'>): EditableEvent {
  return {
    _id: meeting.eventId, name: meeting.title, destination: meeting.place, startsAt: meeting.startsAt, endsAt: meeting.endsAt,
    onsite: meeting.place.trim() === onsiteLocation, locationType: meeting.virtual ? 'virtual' : 'inPerson', cancelled: meeting.cancelled,
    calendarRevision: meeting.calendarRevision, mediaSupportRequested: false,
  }
}
