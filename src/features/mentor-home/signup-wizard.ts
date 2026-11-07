// The Mentor sign-up wizard's rules: which steps apply, what each starts with, what blocks Next, the review summary and the
// server calls Confirm makes. Pure (no Convex or React) so the rules are tested directly; the server re-checks everything
// (mentorMeetings.signUp / updateAnswers, mentorInvites.respond).
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import type { MentorMeeting } from './contract'

const copy = mentorHomeCopy.signup

export type SeriesScope = 'all' | 'one' | 'next'
/**
 * join: sign up for an event open to the Mentor. accept: say yes to an invitation. change: "Change my answers" for an event
 * they're going to (prefilled). rejoin: "Join this one again" for a series meeting they skipped (just this one).
 */
export type WizardMode = 'join' | 'accept' | 'change' | 'rejoin'
export type WizardStep = 'which' | 'drive' | 'hotel' | 'review'

/** The Mentor's choices on screen. Null means not chosen yet. */
export type WizardChoice = { scope: SeriesScope | null; count: number; canDrive: boolean | null; needsHotel: boolean | null }

/** Arguments shared by mentorMeetings.signUp and mentorInvites.respond (accepting). */
export type SignupArgs = { scope?: SeriesScope; count?: number; canDriveStudents?: boolean; needsHotelRoom?: boolean }
export type AnswerArgs = { canDriveStudents?: boolean; needsHotelRoom?: boolean }

export type WizardCall =
  | { kind: 'signUp'; args: SignupArgs }
  | { kind: 'respond'; args: SignupArgs }
  | { kind: 'updateAnswers'; answers: AnswerArgs; allMeetingsInSeries: boolean }

type WizardMeeting = Pick<MentorMeeting, 'seriesId' | 'questions' | 'myAnswers' | 'seriesSignup'>

export const MIN_NEXT = 1
export const MAX_NEXT = 52
/** "The next __ meetings" starts here when the Mentor has no earlier number. */
export const DEFAULT_NEXT = 4

const isSeries = (meeting: Pick<MentorMeeting, 'seriesId'>) => meeting.seriesId !== null

/** A whole number from 1 to 52 (anything else is pulled to the nearest end; not a number gives the default). */
export function clampCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_NEXT
  return Math.min(MAX_NEXT, Math.max(MIN_NEXT, Math.round(value)))
}

/** The Mentor's current series sign-up (scope and number), or null when they have none that is still active. */
function currentScope(meeting: WizardMeeting): { scope: SeriesScope; count: number | null } | null {
  return meeting.seriesSignup ? { scope: meeting.seriesSignup.scope, count: meeting.seriesSignup.count } : null
}

/**
 * Only the steps that apply: "Which meetings?" for a meeting of a repeating series (not when rejoining one skipped meeting),
 * "Can you drive students?" for travel, "Do you need a hotel room?" for overnight, then always Review and confirm. A plain
 * one-time event is just Review: one tap to open, one to confirm.
 */
export function wizardSteps(meeting: WizardMeeting, mode: WizardMode): WizardStep[] {
  const questions = meeting.questions
  const steps: WizardStep[] = []
  if (isSeries(meeting) && mode !== 'rejoin') steps.push('which')
  if (questions.askDrive) steps.push('drive')
  if (questions.askHotel) steps.push('hotel')
  steps.push('review')
  return steps
}

/** Whether the wizard has anything to ask before Review (otherwise "Change my answers" isn't offered). */
export const hasQuestions = (meeting: WizardMeeting, mode: WizardMode) => wizardSteps(meeting, mode).length > 1

/**
 * "Just this one" can't narrow an Every meeting / Next N sign-up on the server (adding one meeting keeps the wider choice),
 * so Change my answers doesn't offer it then; the step says to use Leave all instead.
 */
export function scopeOptions(meeting: WizardMeeting, mode: WizardMode): SeriesScope[] {
  const current = currentScope(meeting)
  if (mode === 'change' && current && current.scope !== 'one') return ['all', 'next']
  return ['all', 'one', 'next']
}

/** What each step starts with: the Mentor's own earlier answers and series choice, if any (Change my answers is prefilled). */
export function initialChoice(meeting: WizardMeeting, mode: WizardMode): WizardChoice {
  const current = currentScope(meeting)
  const answers = meeting.myAnswers
  let scope: SeriesScope | null = null
  if (mode === 'rejoin') scope = 'one'
  else if (isSeries(meeting)) scope = current?.scope ?? (mode === 'change' ? 'one' : null)
  return {
    scope,
    count: clampCount(current?.count ?? DEFAULT_NEXT),
    canDrive: answers?.canDriveStudents ?? null,
    needsHotel: answers?.needsHotelRoom ?? null,
  }
}

/** Why Next can't leave this step yet, or null. */
export function stepIssue(step: WizardStep, choice: WizardChoice, options: readonly SeriesScope[] = ['all', 'one', 'next']): string | null {
  if (step === 'which') {
    if (choice.scope === null || !options.includes(choice.scope)) return copy.which.pick
    if (choice.scope === 'next' && (!Number.isInteger(choice.count) || choice.count < MIN_NEXT || choice.count > MAX_NEXT)) return copy.which.countInvalid
  }
  if (step === 'drive' && choice.canDrive === null) return copy.drive.pick
  if (step === 'hotel' && choice.needsHotel === null) return copy.hotel.pick
  return null
}

/** The first step with a problem (Confirm sends the Mentor back to it), or null. */
export function firstIssue(steps: readonly WizardStep[], choice: WizardChoice, options?: readonly SeriesScope[]): WizardStep | null {
  return steps.find(step => stepIssue(step, choice, options) !== null) ?? null
}

/** "Every meeting", "Just this one", "The next 4 meetings": the wizard's words for a choice. */
export function scopeChoiceText(scope: SeriesScope, count: number): string {
  return scope === 'all' ? copy.which.every : scope === 'one' ? copy.which.justOne : copy.which.nextCount(count)
}

export type ReviewLine = { key: WizardStep | 'fixed'; label: string; value: string; edit: WizardStep | null }

/** Review and confirm: one line per answer, each with the step that changes it. A plain event has no lines. */
export function reviewLines(meeting: WizardMeeting, mode: WizardMode, choice: WizardChoice): ReviewLine[] {
  const lines: ReviewLine[] = []
  const r = copy.review
  if (mode === 'rejoin') lines.push({ key: 'fixed', label: r.which, value: copy.which.justOne, edit: null })
  for (const step of wizardSteps(meeting, mode)) {
    if (step === 'which' && choice.scope) lines.push({ key: step, label: r.which, value: scopeChoiceText(choice.scope, choice.count), edit: step })
    if (step === 'drive' && choice.canDrive !== null) lines.push({ key: step, label: r.drive, value: choice.canDrive ? copy.drive.yes : copy.drive.no, edit: step })
    if (step === 'hotel' && choice.needsHotel !== null) lines.push({ key: step, label: r.hotel, value: choice.needsHotel ? copy.hotel.yes : copy.hotel.no, edit: step })
  }
  return lines
}

/** The arguments for signUp / respond: a scope only for a series meeting, a count only with "next", answers only where asked. */
export function signupArgs(meeting: WizardMeeting, mode: WizardMode, choice: WizardChoice): SignupArgs {
  const questions = meeting.questions
  const args: SignupArgs = {}
  if (isSeries(meeting)) {
    const scope = mode === 'rejoin' ? 'one' : choice.scope ?? 'one'
    args.scope = scope
    if (scope === 'next') args.count = clampCount(choice.count)
  }
  if (questions.askDrive && choice.canDrive !== null) args.canDriveStudents = choice.canDrive
  if (questions.askHotel && choice.needsHotel !== null) args.needsHotelRoom = choice.needsHotel
  return args
}

/**
 * What Confirm sends, in order. Join and rejoin sign up; accept answers the invitation with the same choices. Change my
 * answers sends only what changed: a new series choice signs up again with it, and new answers are saved (for every upcoming
 * meeting of the series the Mentor is going to, when it repeats). Nothing changed sends nothing.
 */
export function wizardCalls(meeting: WizardMeeting, mode: WizardMode, choice: WizardChoice): WizardCall[] {
  const args = signupArgs(meeting, mode, choice)
  if (mode === 'join' || mode === 'rejoin') return [{ kind: 'signUp', args }]
  if (mode === 'accept') return [{ kind: 'respond', args }]
  const questions = meeting.questions
  const calls: WizardCall[] = []
  const was = currentScope(meeting) ?? { scope: 'one' as const, count: null }
  if (isSeries(meeting) && (args.scope !== was.scope || (args.scope === 'next' && args.count !== was.count))) calls.push({ kind: 'signUp', args })
  const answers: AnswerArgs = { canDriveStudents: args.canDriveStudents, needsHotelRoom: args.needsHotelRoom }
  const answersChanged = (questions.askDrive && args.canDriveStudents !== (meeting.myAnswers.canDriveStudents ?? undefined))
    || (questions.askHotel && args.needsHotelRoom !== (meeting.myAnswers.needsHotelRoom ?? undefined))
  if (answersChanged) calls.push({ kind: 'updateAnswers', answers, allMeetingsInSeries: isSeries(meeting) })
  return calls
}
