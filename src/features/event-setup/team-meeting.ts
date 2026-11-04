// "+ Team meeting": the one-sheet fast path for a weekly team meeting at our shop, and the prefill it hands to the full
// New event wizard ("More options"). Pure: no Convex or React, so the rules are tested directly (team-meeting.test.ts).
import type { FunctionArgs } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { onsiteLocation } from '../../../convex/lib/transportation'
import { chicagoInputTime } from '@/lib/chicago-time'
import { defaultMentorInvite } from './audience/audience-rules'
import { repeatIssue, seriesDates } from './audience/repeat'
import type { AudienceValue, PickerIssue, RepeatValue, Weekday, Where } from './audience/types'
import { audienceCreateArgs, whoSignupMode, type WhoChoice } from './event-audience-wiring'

type CreateEventArgs = FunctionArgs<typeof api.admin.createEvent>

export const teamMeetingCopy = {
  open: '+ Team meeting',
  title: 'New team meeting',
  name: 'Name',
  defaultName: 'Team meeting',
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
  summary: 'Free · No permission form · Not added to Team Calendar',
  repeatEnds: 'Last meeting',
  seasonEnd: (date: string) => `At season end (${date})`,
  afterCount: 'After a number of meetings',
  count: 'Number of meetings',
  first: (date: string) => `First meeting: ${date}`,
  more: 'More',
  moreOptions: 'More options',
  cancel: 'Cancel',
  create: 'Create',
  creating: 'Creating…',
  created: 'Team meeting created.',
  needName: 'Enter a name.',
  needDay: 'Choose at least one day.',
  needTimes: 'Enter a start and end time.',
  endAfterStart: 'The end must be after the start.',
} as const

export type TeamMeetingDraft = {
  name: string
  weekdays: Weekday[]
  /** HH:MM, Central Time. */
  startTime: string
  endTime: string
  /** Empty means Everyone. */
  subteams: string[]
  required: boolean
  ends: 'seasonEnd' | 'afterCount'
  count: number
}

const TUESDAY: Weekday = 2

/** Tuesdays 6–8 PM for Everyone until season end; required for a Coach, optional for a Travel Lead (who can't require a group). */
export const teamMeetingDefaults = (isCoach: boolean): TeamMeetingDraft => ({
  name: teamMeetingCopy.defaultName, weekdays: [TUESDAY], startTime: '18:00', endTime: '20:00', subteams: [], required: isCoach, ends: 'seasonEnd', count: 10,
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

/** The weekly repeat rule the sheet stands for, starting from `startDate`. */
export function teamMeetingRepeat(draft: Pick<TeamMeetingDraft, 'weekdays' | 'ends' | 'count'>, startDate: string): RepeatValue {
  return { repeats: true, intervalWeeks: 1, weekdays: [...draft.weekdays].sort((a, b) => a - b), ends: draft.ends === 'seasonEnd' ? 'onDate' : 'afterCount', endDate: seasonEndDate(startDate), count: draft.count }
}

export type TeamMeetingPlan = { start: string; end: string; repeat: RepeatValue; firstDate: string }

/** The first meeting's Central Time inputs ("YYYY-MM-DDTHH:MM") and the repeat rule, or the first thing to fix. */
export function teamMeetingPlan(draft: TeamMeetingDraft, nowMs: number): TeamMeetingPlan | PickerIssue {
  if (!draft.name.trim()) return { field: 'name', message: teamMeetingCopy.needName }
  if (!draft.weekdays.length) return { field: 'days', message: teamMeetingCopy.needDay }
  if (!validTime(draft.startTime) || !validTime(draft.endTime)) return { field: 'starts', message: teamMeetingCopy.needTimes }
  if (draft.endTime <= draft.startTime) return { field: 'ends', message: teamMeetingCopy.endAfterStart }
  const from = firstSearchDate(nowMs, draft.startTime)
  const firstDate = seriesDates(from, teamMeetingRepeat({ ...draft, ends: 'afterCount', count: 1 }, from))[0]
  if (!firstDate) return { field: 'days', message: teamMeetingCopy.needDay }
  const repeat = teamMeetingRepeat(draft, firstDate)
  const issue = repeatIssue(firstDate, repeat)
  if (issue) return { field: issue.field === 'end-date' || issue.field === 'count' ? 'count' : 'days', message: issue.message }
  return { start: `${firstDate}T${draft.startTime}`, end: `${firstDate}T${draft.endTime}`, repeat, firstDate }
}

export const isPlan = (value: TeamMeetingPlan | PickerIssue): value is TeamMeetingPlan => 'start' in value

/** Everyone, or the chosen subteams. Only a Coach may sign a group up automatically. */
export function teamMeetingAudience(draft: Pick<TeamMeetingDraft, 'subteams' | 'required'>, isCoach: boolean): AudienceValue {
  return { kind: draft.subteams.length ? 'subteams' : 'everyone', subteams: [...draft.subteams], studentIds: [], required: isCoach && draft.required }
}

/** createEvent arguments for the first meeting (the series copies them): at our shop, free, no forms, off Team Calendar. */
export function teamMeetingEventArgs(draft: TeamMeetingDraft, isCoach: boolean, startsAt: number, endsAt: number): CreateEventArgs {
  const who: WhoChoice = { travelTeam: false, audience: teamMeetingAudience(draft, isCoach), mentors: defaultMentorInvite() }
  return {
    name: draft.name.trim(), type: 'Team', startsAt, endsAt, destination: onsiteLocation, travel: onsiteLocation, overnight: false, roomingEnabled: false, onsite: true,
    feeCents: 0, ...audienceCreateArgs(who, [], 'inPerson'), allowWithdrawal: whoSignupMode(who) !== 'assigned', permissionRequired: false, firstRequired: false,
    requirements: [], mediaSupportRequested: false, calendarChoice: { kind: 'none' },
  }
}

/** What "More options" hands the full New event wizard (sent as router state to /events/new). */
export type NewEventPrefill = { name: string; type: 'Team'; start: string; end: string; where: Where; audience: AudienceValue; repeat: RepeatValue }

export function teamMeetingPrefill(draft: TeamMeetingDraft, isCoach: boolean, nowMs: number): NewEventPrefill {
  const plan = teamMeetingPlan(draft, nowMs)
  const audience = teamMeetingAudience(draft, isCoach)
  if (isPlan(plan)) return { name: draft.name, type: 'Team', start: plan.start, end: plan.end, where: 'shop', audience, repeat: plan.repeat }
  const from = firstSearchDate(nowMs, draft.startTime)
  return { name: draft.name, type: 'Team', start: validTime(draft.startTime) ? `${from}T${draft.startTime}` : '', end: validTime(draft.endTime) ? `${from}T${draft.endTime}` : '', where: 'shop', audience, repeat: teamMeetingRepeat(draft, from) }
}

/** Reads router state defensively: anything but a prefill from the Team meeting sheet is ignored. */
export function readPrefill(state: unknown): NewEventPrefill | null {
  const prefill = (state as { prefill?: NewEventPrefill } | null)?.prefill
  return prefill && prefill.type === 'Team' && typeof prefill.name === 'string' && prefill.repeat && prefill.audience ? prefill : null
}
