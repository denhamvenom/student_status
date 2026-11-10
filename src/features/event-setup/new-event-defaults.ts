// New event wizard defaults and choices that depend on the event type, repeating and the server's answer.
// Pure: no Convex or React, so the rules are tested directly (new-event-defaults.test.ts).
import type { EventType } from '@/lib/event-copy'
import { parseChicagoInput } from '@/lib/chicago-time'
import { requiredMeetingDay } from '../../../convex/lib/requiredMeetingDay'
import { defaultRepeat } from './audience/repeat'
import type { RepeatValue } from './audience/types'

/** 'create' or 'none', or the id of an existing Team Calendar entry to connect. */
export type CalendarChoice = string

export const calendarChoiceCopy = {
  create: 'Create a separate Calendar entry',
  none: 'Don’t add to Team Calendar',
  checking: 'Checking Calendar for events at this time…',
  noMatches: 'Choose whether this event goes on Team Calendar.',
  reviewCreate: 'Create a separate entry',
  reviewNone: 'Not added to Team Calendar',
  reviewLink: 'Connect to existing entry',
  /** Next to a chosen existing Calendar entry and on Review: connecting replaces the meeting's name and times with the entry's. */
  linkNote: 'Uses this calendar entry’s name and time.',
  /** In the edit forms, when a Team meeting already on Team Calendar is set to start on a Required weekday (requiredDayEditHint). */
  requiredDayEditHint: (day: 'Monday' | 'Tuesday') => `This meeting is on Team Calendar. On a ${day}, it will count toward student attendance.`,
  /**
   * Under the Team Calendar choice while a Team meeting is left off it because of its weekday (calendarOffDay). `control`
   * names what adds it: the "Add to Team Calendar" box, or the full wizard's "Create a separate Calendar entry" choice.
   */
  requiredDayHint: (day: 'Monday' | 'Tuesday', control: 'box' | 'choice' = 'box') => `${day} is a regular team meeting day. Meetings on Team Calendar that day count toward student attendance, so this one starts off. ${control === 'box' ? 'Check the box' : 'Choose “Create a separate Calendar entry”'} to add it anyway.`,
} as const

export const newEventWizardCopy = {
  travelTeamHelper: 'Active Travel Team students are signed up automatically when the event is created.',
  calendarError: 'Couldn’t check Team Calendar. You can still create the event.',
  more: 'More',
  moreDetail: 'Repeat, Team Calendar',
  moreCalendar: 'Team Calendar',
  extras: 'Extras (optional)',
  /** Step counter on a Team meeting's Extras: optional, and counted as part of Review (the same number as Review). */
  optionalStep: (total: number) => `Step ${total} of ${total} · Optional extras`,
  addExtras: 'Add extras',
  addExtrasDetail: 'Signup questions, things students must do or forms',
  extrasQuestions: 'Signup questions',
  extrasRequirements: 'Things students must do',
  extrasForms: 'Forms and support',
  allDetails: 'All details',
  media: 'Ask Media team to cover it',
  discardQuestion: 'Discard this new event? What you entered will be lost.',
  keepEditing: 'Keep editing',
  discard: 'Discard',
} as const

export const isLinkedCalendar = (choice: CalendarChoice) => choice !== 'create' && choice !== 'none'

/**
 * The wizard's starting repeat rule: one time (owner decision, Nov 7 2026, for Coaches, Travel Leads and Mentors alike),
 * unless "More options" on the Team meeting sheet handed over a repeating meeting.
 */
export const initialRepeat = (prefill: RepeatValue | null | undefined): RepeatValue => prefill ?? defaultRepeat('')

/** A Team meeting shows "One time / Repeat this meeting" right on Basics; other events keep Repeat under More. */
export const repeatOnBasics = (type: EventType) => type === 'Team'

/**
 * The weekday that keeps a one-time Team meeting off Team Calendar by default, or null. Attendance reports count a Team
 * Calendar meeting on that day as Required (Tuesday before Build Season kickoff, Monday from kickoff; the same
 * requiredMeetingDay rule), so it is only added when someone asks (owner decision, Nov 7 2026). `startsAt` is the start
 * (NaN while unset) and `competitionYear` the current season's year (null when unknown: then only Tuesday counts).
 */
export function calendarOffDay(type: EventType, startsAt: number, competitionYear: number | null): 'Monday' | 'Tuesday' | null {
  return type === 'Team' ? requiredMeetingDay(startsAt, competitionYear) : null
}

/**
 * The edit forms' note for a Team meeting already on Team Calendar whose start (the form's "YYYY-MM-DDTHH:MM", Chicago) is
 * a Required weekday (requiredMeetingDay): attendance will count it as Required, and the edit keeps it on Team Calendar.
 * Only a note (owner decision, Nov 7 2026: Required days are off by default for new meetings, not refused); null otherwise.
 */
export function requiredDayEditHint(event: { type?: string; onTeamCalendar: boolean }, startInput: string, competitionYear: number | null): string | null {
  if (event.type !== 'Team' || !event.onTeamCalendar) return null
  const day = requiredMeetingDay(parseChicagoInput(startInput), competitionYear)
  return day ? calendarChoiceCopy.requiredDayEditHint(day) : null
}

/**
 * Every one-time event, Team meetings included (owner decision, Nov 7 2026), gets its own Team Calendar entry by default,
 * except a Team meeting on a Required weekday (calendarOffDay). Repeating meetings stay off Team Calendar unless the Coach
 * asks, so the existing Google Tuesday series is never duplicated. Callers re-apply it when the type, repeat or start date
 * changes, until the choice is changed by hand.
 */
export const defaultCalendarChoice = (type: EventType, repeats: boolean, startsAt: number = Number.NaN, competitionYear: number | null = null): 'create' | 'none' =>
  repeats || calendarOffDay(type, startsAt, competitionYear) ? 'none' : 'create'

export const calendarChoiceArg = (choice: CalendarChoice): { kind: 'create' } | { kind: 'none' } | { kind: 'link'; eventId: string } =>
  choice === 'create' ? { kind: 'create' } : choice === 'none' ? { kind: 'none' } : { kind: 'link', eventId: choice }

export const calendarReviewText = (choice: CalendarChoice) => choice === 'create' ? calendarChoiceCopy.reviewCreate : choice === 'none' ? calendarChoiceCopy.reviewNone : calendarChoiceCopy.reviewLink

export type TypeDefaults = { onsite: boolean; travelTeam: boolean; permission: boolean; first: boolean }

/**
 * Starting answers for a type. Team meetings are at the shop for Everyone with no permission form or FIRST registration;
 * fundraisers are at the shop with open signup; competitions and outreach keep the Coach's Travel Team and both forms.
 */
export function eventTypeDefaults(type: EventType, isCoach: boolean): TypeDefaults {
  if (type === 'Team') return { onsite: true, travelTeam: false, permission: false, first: false }
  if (type === 'Fundraiser') return { onsite: true, travelTeam: false, permission: false, first: false }
  return { onsite: false, travelTeam: isCoach, permission: true, first: true }
}

/** Datetime inputs accept four-digit years only within a sensible range. */
export const dateTimeBounds = { min: '2020-01-01T00:00', max: '2100-12-31T23:59' } as const

/** Wizard step ids (see NewEvent in LiveApp.tsx): 0 basics, 1 who's going, 2 fee, 4 travel, 7 questions, 8 requirements; 9 Extras shows 3, 7 and 8. */
export type ServerProblem = { step: number; field: string }

/**
 * Where to send the Coach when the server refuses an event at Review for something fixable on an earlier step.
 * Matches the plain-language messages from convex/admin.ts, convex/lib/createEventCore.ts and convex/eventSeries.ts.
 */
export function serverProblemStep(message: string): ServerProblem | null {
  const text = message.toLowerCase()
  if (text.includes('needs a name') || text.includes('end after the start')) return { step: 0, field: 'event-name' }
  if (text.includes('calendar')) return { step: 0, field: 'event-calendar' }
  if (text.includes('series today')) return { step: 0, field: 'event-start' }
  if (text.includes('on-site') || text.includes('room deadline')) return { step: 0, field: 'event-onsite' }
  if (text.includes('requirement')) return { step: 8, field: 'event-requirements' }
  if (text.includes('question')) return { step: 7, field: 'event-questions' }
  if (text.includes('capacity')) return { step: 1, field: 'event-capacity' }
  if (/mentor|student|subteam|travel team|whole team|who the event is for|audience|required/.test(text)) return { step: 1, field: 'event-who' }
  if (text.includes('fee')) return { step: 2, field: 'event-fee' }
  return null
}

/** The one optional Extras step: Requirements (3), Signup questions (7) and Things students must do (8), (Costs, step 2, is its own step for every event type). */
export const EXTRAS_STEP = 9

/** The step that shows a problem found on step `step` (questions, requirements and forms live on Extras). */
export function shownStep(step: number): number {
  return step === 3 || step === 7 || step === 8 ? EXTRAS_STEP : step
}

/** The steps whose checks Continue runs on `step`: Extras checks each step it holds. */
export function stepChecks(step: number): number[] {
  return step === EXTRAS_STEP ? [3, 7, 8] : [step]
}

/**
 * Wizard step ids in the order shown. Every event is Basics, Who's going, Costs and Review, with Time slots only when students pick shifts and Travel only
 * for "Somewhere else". Extras is counted for other events; a Team meeting's Extras is optional and only joins once asked for.
 */
export function newEventStepOrder(choices: { shifts: boolean; noTravel: boolean; team: boolean; extras: boolean }): number[] {
  const slots = choices.shifts ? [6] : []
  if (choices.team) return [0, 1, ...slots, 2, ...(choices.extras ? [EXTRAS_STEP] : []), ...(choices.noTravel ? [] : [4]), 5]
  return [0, 1, ...slots, 2, EXTRAS_STEP, ...(choices.noTravel ? [] : [4]), 5]
}
