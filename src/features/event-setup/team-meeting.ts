// "+ Team meeting": the one-sheet fast path for a team meeting at our shop (one time by default, or repeating when the Coach
// turns on "Repeat this meeting"), and the prefill it hands to the full New event wizard ("More options"). Pure: no Convex or React, so the rules are tested directly (team-meeting.test.ts).
import type { FunctionArgs } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { onsiteLocation } from '../../../convex/lib/transportation'
import { chicagoInputTime } from '@/lib/chicago-time'
import { defaultMentorInvite } from './audience/audience-rules'
import { defaultRepeat, formatDay, MAX_SERIES_DAYS, parseDay, previewDateLabel, repeatIssue, seriesDates, weekdayOf } from './audience/repeat'
import type { AudienceValue, PickerIssue, RepeatValue, Weekday, Where } from './audience/types'
import { audienceCreateArgs, whoSignupMode, type WhoChoice } from './event-audience-wiring'
import { defaultCalendarChoice } from './new-event-defaults'

type CreateEventArgs = FunctionArgs<typeof api.admin.createEvent>

export const teamMeetingCopy = {
  open: '+ Team meeting',
  title: 'New team meeting',
  name: 'Name',
  defaultName: 'Team meeting',
  date: 'Date',
  startDate: 'Starting on',
  repeat: 'Repeat this meeting',
  repeatHelp: 'Off: one meeting. On: choose the days and when it ends.',
  days: 'Every week on',
  starts: 'Starts',
  ends: 'Ends',
  where: 'At our shop',
  who: 'Everyone',
  subteams: 'Only some subteams?',
  required: 'Required?',
  requiredYes: 'Yes',
  requiredNo: 'No',
  optionalOnly: 'Optional — students choose to sign up.',
  coachOnlyRequired: 'Only a Coach can make meetings required.',
  summary: 'Free · No permission form',
  addToCalendar: 'Add to Team Calendar',
  repeatingOffCalendar: 'Repeating meetings aren’t added to Team Calendar.',
  repeatEnds: 'Last meeting',
  seasonEnd: (date: string) => `At season end (${date})`,
  onDate: 'On a date',
  endDate: 'Last meeting on or before',
  afterCount: 'After a number of meetings',
  count: 'Number of meetings',
  needEndDate: 'Choose the date of the last meeting.',
  endBeforeFirst: (first: string) => `The last meeting can't be before the first meeting (${first}).`,
  endTooFar: (latest: string) => `Choose a date on or before ${latest} — a series can run up to a year.`,
  first: (date: string) => `First meeting: ${date}`,
  /** "7 meetings · Nov 10 – Dec 22", shown before Create. */
  meetingCount: (count: number, range: string) => `${count} meeting${count === 1 ? '' : 's'} · ${range}`,
  moreOptions: 'More options',
  cancel: 'Cancel',
  create: 'Create',
  creating: 'Creating…',
  created: 'Team meeting created.',
  seriesCreated: 'Repeating team meeting created.',
  needName: 'Enter a name.',
  needDate: 'Choose the date of the meeting.',
  past: 'That time has already passed. Choose a later date or time.',
  needDay: 'Choose at least one day.',
  needTimes: 'Enter a start and end time.',
  endAfterStart: 'The end must be after the start.',
} as const

export type TeamMeetingDraft = {
  name: string
  /** YYYY-MM-DD: the meeting's date, or the first day of a repeating one. Empty means the first day still ahead (today or tomorrow). */
  date: string
  /** Off by default: one meeting. On: weekly on `weekdays` until `ends`. */
  repeats: boolean
  weekdays: Weekday[]
  /** HH:MM, Central Time. */
  startTime: string
  endTime: string
  /** Empty means Everyone. */
  subteams: string[]
  required: boolean
  ends: 'seasonEnd' | 'onDate' | 'afterCount'
  /** YYYY-MM-DD, used when `ends` is 'onDate'. Filled with the season end when that choice is picked. */
  endDate: string
  count: number
  /**
   * One-time meetings only: "Add to Team Calendar" as chosen by hand, or null to follow the default for the meeting's date
   * (teamMeetingOnCalendar), which changes with the date until the box is changed.
   */
  addToCalendar: boolean | null
}

const DEFAULT_START = '18:00'

/**
 * One meeting, 6–8 PM, for Everyone (owner decision, Nov 7 2026: one time by default; "Repeat this meeting" makes it weekly
 * until season end). Optional by default (owner decision, Nov 7 2026); a Coach can still choose Required, a Travel Lead can't
 * require a group. With `nowMs` the date is filled in with the first day still ahead; without it the date stays empty and
 * means the same.
 */
export const teamMeetingDefaults = (nowMs?: number): TeamMeetingDraft => ({
  name: teamMeetingCopy.defaultName, date: nowMs === undefined ? '' : firstSearchDate(nowMs, DEFAULT_START), repeats: false, weekdays: [], startTime: DEFAULT_START, endTime: '20:00',
  subteams: [], required: false, ends: 'seasonEnd', endDate: '', count: 10, addToCalendar: null,
})

/** The competition season wraps up at the end of May (summer starts the next one), so a meeting series ends on the next May 31 on or after `date`. */
export function seasonEndDate(date: string): string {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7))
  return `${month >= 6 ? year + 1 : year}-05-31`
}

const addDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

/** Today in Central Time, or tomorrow once today's meeting time has passed (the server refuses series in the past). */
export function firstSearchDate(nowMs: number, startTime: string): string {
  const now = chicagoInputTime(nowMs), today = now.slice(0, 10)
  return validTime(startTime) && now.slice(11) < startTime ? today : addDay(today)
}

/** The meeting's date, or the first day a repeating meeting may start: the chosen date, else today (tomorrow once the start time has passed). */
export function teamMeetingStartDate(draft: Pick<TeamMeetingDraft, 'date' | 'startTime'>, nowMs: number): string {
  return parseDay(draft.date) !== null ? draft.date : firstSearchDate(nowMs, draft.startTime)
}

/** Turning on "Repeat this meeting": weekly on the meeting's own weekday, unless days were already chosen. */
export function teamMeetingRepeatOn(draft: Pick<TeamMeetingDraft, 'date' | 'startTime' | 'weekdays'>, nowMs: number): Pick<TeamMeetingDraft, 'repeats' | 'weekdays'> {
  const day = weekdayOf(teamMeetingStartDate(draft, nowMs))
  return { repeats: true, weekdays: draft.weekdays.length ? [...draft.weekdays] : day === null ? [] : [day] }
}

/**
 * The repeat rule the sheet stands for, starting from `startDate`: none for one meeting; otherwise weekly, where season end
 * and a chosen date both end 'onDate'.
 */
export function teamMeetingRepeat(draft: Pick<TeamMeetingDraft, 'repeats' | 'weekdays' | 'ends' | 'endDate' | 'count'>, startDate: string): RepeatValue {
  if (!draft.repeats) return defaultRepeat(startDate)
  return {
    repeats: true, intervalWeeks: 1, weekdays: [...draft.weekdays].sort((a, b) => a - b), ends: draft.ends === 'afterCount' ? 'afterCount' : 'onDate',
    endDate: draft.ends === 'onDate' ? draft.endDate : seasonEndDate(startDate), count: draft.count,
  }
}

/**
 * The (first) meeting date: the start date for one meeting; for a repeating one, the first chosen weekday on or after it, or
 * null with no days chosen.
 */
export function teamMeetingFirstDate(draft: Pick<TeamMeetingDraft, 'date' | 'repeats' | 'weekdays' | 'startTime'>, nowMs: number): string | null {
  const from = teamMeetingStartDate(draft, nowMs)
  if (!draft.repeats) return from
  if (!draft.weekdays.length) return null
  return seriesDates(from, teamMeetingRepeat({ repeats: true, weekdays: draft.weekdays, ends: 'afterCount', endDate: '', count: 1 }, from))[0] ?? null
}

/** The range a chosen last date may take: from the first meeting through MAX_SERIES_DAYS later (the same limit as the full wizard). */
export function teamMeetingEndDateLimits(firstDate: string): { min: string; max: string } {
  const first = parseDay(firstDate)
  return { min: firstDate, max: first === null ? firstDate : formatDay(first + MAX_SERIES_DAYS * 86_400_000) }
}

/** What is wrong with a chosen last date ('end-date'), or null. Season end and "after N meetings" have no date to check. */
export function teamMeetingEndIssue(draft: Pick<TeamMeetingDraft, 'repeats' | 'ends' | 'endDate'>, firstDate: string): PickerIssue | null {
  if (!draft.repeats || draft.ends !== 'onDate') return null
  if (parseDay(draft.endDate) === null) return { field: 'end-date', message: teamMeetingCopy.needEndDate }
  const { min, max } = teamMeetingEndDateLimits(firstDate)
  if (draft.endDate < min) return { field: 'end-date', message: teamMeetingCopy.endBeforeFirst(previewDateLabel(min)) }
  if (draft.endDate > max) return { field: 'end-date', message: teamMeetingCopy.endTooFar(previewDateLabel(max)) }
  return null
}

/** The sheet field that holds a repeat problem: the date or count input, or the End choices for season end. */
const endField = (ends: TeamMeetingDraft['ends']) => ends === 'onDate' ? 'end-date' : ends === 'afterCount' ? 'count' : 'repeat-ends'

export type TeamMeetingPlan = { start: string; end: string; repeat: RepeatValue; firstDate: string }

/** The first meeting's Central Time inputs ("YYYY-MM-DDTHH:MM") and the repeat rule, or the first thing to fix. */
export function teamMeetingPlan(draft: TeamMeetingDraft, nowMs: number): TeamMeetingPlan | PickerIssue {
  if (!draft.name.trim()) return { field: 'name', message: teamMeetingCopy.needName }
  if (draft.date && parseDay(draft.date) === null) return { field: 'date', message: teamMeetingCopy.needDate }
  if (draft.repeats && !draft.weekdays.length) return { field: 'days', message: teamMeetingCopy.needDay }
  if (!validTime(draft.startTime) || !validTime(draft.endTime)) return { field: 'starts', message: teamMeetingCopy.needTimes }
  if (draft.endTime <= draft.startTime) return { field: 'ends', message: teamMeetingCopy.endAfterStart }
  const firstDate = teamMeetingFirstDate(draft, nowMs)
  if (!firstDate) return { field: 'days', message: teamMeetingCopy.needDay }
  // The server refuses meetings that already started; Central Time inputs compare as text.
  if (`${firstDate}T${draft.startTime}` <= chicagoInputTime(nowMs)) return { field: 'date', message: teamMeetingCopy.past }
  if (!draft.repeats) return { start: `${firstDate}T${draft.startTime}`, end: `${firstDate}T${draft.endTime}`, repeat: defaultRepeat(firstDate), firstDate }
  const endIssue = teamMeetingEndIssue(draft, firstDate)
  if (endIssue) return endIssue
  const repeat = teamMeetingRepeat(draft, firstDate)
  const issue = repeatIssue(firstDate, repeat)
  if (issue) return { field: issue.field === 'end-date' || issue.field === 'count' ? endField(draft.ends) : 'days', message: issue.message }
  return { start: `${firstDate}T${draft.startTime}`, end: `${firstDate}T${draft.endTime}`, repeat, firstDate }
}

export const isPlan = (value: TeamMeetingPlan | PickerIssue): value is TeamMeetingPlan => 'start' in value

const shortDay = (date: string, withYear: boolean) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(parseDay(date) ?? 0)

/** "7 meetings · Nov 10 – Dec 22" for the meetings the plan creates (years shown when they span two), or null with none. */
export function teamMeetingSummary(plan: Pick<TeamMeetingPlan, 'firstDate' | 'repeat'>): string | null {
  const dates = seriesDates(plan.firstDate, plan.repeat)
  const first = dates[0], last = dates.at(-1)
  if (!first || !last) return null
  const withYear = first.slice(0, 4) !== last.slice(0, 4)
  return teamMeetingCopy.meetingCount(dates.length, first === last ? shortDay(first, false) : `${shortDay(first, withYear)} – ${shortDay(last, withYear)}`)
}

/** Everyone, or the chosen subteams. Only a Coach may sign a group up automatically. */
export function teamMeetingAudience(draft: Pick<TeamMeetingDraft, 'subteams' | 'required'>, isCoach: boolean): AudienceValue {
  return { kind: draft.subteams.length ? 'subteams' : 'everyone', subteams: [...draft.subteams], studentIds: [], required: isCoach && draft.required }
}

/**
 * Whether the meeting goes on Team Calendar: never when repeating; otherwise the hand-made choice, else the default for its
 * start (defaultCalendarChoice: on, except Tuesday before kickoff and Monday from kickoff, which attendance counts as Required).
 */
export function teamMeetingOnCalendar(draft: Pick<TeamMeetingDraft, 'repeats' | 'addToCalendar'>, startsAt: number, competitionYear: number | null): boolean {
  if (draft.repeats) return false
  return draft.addToCalendar ?? defaultCalendarChoice('Team', false, startsAt, competitionYear) === 'create'
}

/**
 * createEvent arguments for the meeting (a repeating one's series copies them): at our shop, free, no forms, and on Team
 * Calendar as teamMeetingOnCalendar says (a repeating one stays off it).
 */
export function teamMeetingEventArgs(draft: TeamMeetingDraft, isCoach: boolean, startsAt: number, endsAt: number, competitionYear: number | null = null): CreateEventArgs {
  const who: WhoChoice = { travelTeam: false, audience: teamMeetingAudience(draft, isCoach), mentors: defaultMentorInvite() }
  return {
    name: draft.name.trim(), type: 'Team', startsAt, endsAt, destination: onsiteLocation, travel: onsiteLocation, overnight: false, roomingEnabled: false, onsite: true,
    feeCents: 0, ...audienceCreateArgs(who, [], 'inPerson'), allowWithdrawal: whoSignupMode(who) !== 'assigned', permissionRequired: false, firstRequired: false,
    requirements: [], mediaSupportRequested: false, calendarChoice: { kind: teamMeetingOnCalendar(draft, startsAt, competitionYear) ? 'create' : 'none' },
  }
}

/**
 * What "More options" hands the full New event wizard (sent as router state to /events/new). `addToCalendar` is present only
 * when "Add to Team Calendar" was changed by hand; otherwise the wizard applies its own date-based default.
 */
export type NewEventPrefill = { name: string; type: 'Team'; start: string; end: string; where: Where; audience: AudienceValue; repeat: RepeatValue; addToCalendar?: boolean }

export function teamMeetingPrefill(draft: TeamMeetingDraft, isCoach: boolean, nowMs: number): NewEventPrefill {
  const plan = teamMeetingPlan(draft, nowMs)
  const audience = teamMeetingAudience(draft, isCoach)
  const calendar = !draft.repeats && draft.addToCalendar !== null ? { addToCalendar: draft.addToCalendar } : {}
  if (isPlan(plan)) return { name: draft.name, type: 'Team', start: plan.start, end: plan.end, where: 'shop', audience, repeat: plan.repeat, ...calendar }
  const from = teamMeetingFirstDate(draft, nowMs) ?? teamMeetingStartDate(draft, nowMs)
  return { name: draft.name, type: 'Team', start: validTime(draft.startTime) ? `${from}T${draft.startTime}` : '', end: validTime(draft.endTime) ? `${from}T${draft.endTime}` : '', where: 'shop', audience, repeat: teamMeetingRepeat(draft, from), ...calendar }
}

/** Reads router state defensively: anything but a prefill from the Team meeting sheet is ignored. */
export function readPrefill(state: unknown): NewEventPrefill | null {
  const prefill = (state as { prefill?: NewEventPrefill } | null)?.prefill
  return prefill && prefill.type === 'Team' && typeof prefill.name === 'string' && prefill.repeat && prefill.audience ? prefill : null
}
