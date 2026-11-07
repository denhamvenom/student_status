// New event wizard defaults and choices that depend on the event type, repeating and the server's answer.
// Pure: no Convex or React, so the rules are tested directly (new-event-defaults.test.ts).
import type { EventType } from '@/lib/event-copy'
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
} as const

export const newEventWizardCopy = {
  travelTeamHelper: 'Active Travel Team students are signed up automatically when the event is created.',
  calendarError: 'Couldn’t check Team Calendar. You can still create the event.',
  more: 'More',
  moreDetail: 'Repeat, Team Calendar',
  moreCalendar: 'Team Calendar',
  extras: 'Extras (optional)',
  /** Step counter on a Team meeting's Extras, which is not counted as a step. */
  optionalStep: 'Optional step',
  addExtras: 'Add extras',
  addExtrasDetail: 'Signup questions, things students must do, forms or a fee',
  extrasQuestions: 'Signup questions',
  extrasRequirements: 'Things students must do',
  extrasForms: 'Forms and support',
  extrasCost: 'Cost',
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

/** Team meetings and repeating meetings stay off Team Calendar unless the Coach asks; other events get their own entry. */
export const defaultCalendarChoice = (type: EventType, repeats: boolean): 'create' | 'none' => repeats || type === 'Team' ? 'none' : 'create'

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

/** The one optional Extras step: Requirements (3), Signup questions (7) and Things students must do (8), plus Costs (2) for a Team meeting. */
export const EXTRAS_STEP = 9

/** The step that shows a problem found on step `step` (questions, requirements and forms live on Extras). */
export function shownStep(step: number, team: boolean): number {
  return step === 3 || step === 7 || step === 8 || (team && step === 2) ? EXTRAS_STEP : step
}

/** The steps whose checks Continue runs on `step`: Extras checks each step it holds. */
export function stepChecks(step: number, team: boolean): number[] {
  return step === EXTRAS_STEP ? [3, 7, 8, ...(team ? [2] : [])] : [step]
}

/**
 * Wizard step ids in the order shown. A Team meeting is Basics, Who's going and Review (Extras only once asked for, and
 * Time slots only when students pick shifts); other events add Costs, Extras and, only for "Somewhere else", Travel.
 */
export function newEventStepOrder(choices: { shifts: boolean; noTravel: boolean; team: boolean; extras: boolean }): number[] {
  const slots = choices.shifts ? [6] : []
  if (choices.team) return [0, 1, ...slots, ...(choices.extras ? [EXTRAS_STEP] : []), ...(choices.noTravel ? [] : [4]), 5]
  return [0, 1, ...slots, 2, EXTRAS_STEP, ...(choices.noTravel ? [] : [4]), 5]
}
