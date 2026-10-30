import type { WhatsLeftItem } from '../student-home/contract'
import { signupCopy } from './copy'
import type { AnswerDraft } from './logic'
import type { SignupExtras } from './types'

/*
 * The signup wizard's steps: one short task per screen. Only the steps that apply are included, so a plain
 * event is a single Event details screen whose button signs up.
 */

/** Up to this many questions get a screen each; more share one screen. */
export const QUESTIONS_ONE_PER_SCREEN = 3

export type WizardStep<Q extends string = string> =
  | { kind: 'details' }
  | { kind: 'shifts' }
  | { kind: 'question'; questionId: Q }
  | { kind: 'questions' }
  | { kind: 'review' }

export const stepKey = (step: WizardStep) => step.kind === 'question' ? `question:${step.questionId}` : step.kind

/** True when the shift picker has something to show (shifts on, at least one shift offered). */
export const offersShifts = (extras: SignupExtras) => !!extras.shifts?.shiftsEnabled && extras.shifts.shifts.length > 0

/**
 * `edit` is the event page's Change/Edit for a Student who is already signed up: no Event details, and the last
 * step saves instead of signing up. Waitlisted Students pick shifts only once they get a spot. Review appears only
 * when there are shifts or answers to look over.
 */
export function wizardSteps<Q extends string>({ edit, closed, waitlisted, shiftsOffered, questionIds }: {
  edit: boolean
  closed: boolean
  waitlisted: boolean
  shiftsOffered: boolean
  questionIds: readonly Q[]
}): WizardStep<Q>[] {
  if (closed && !edit) return [{ kind: 'details' }]
  const steps: WizardStep<Q>[] = edit ? [] : [{ kind: 'details' }]
  if (shiftsOffered && !waitlisted) steps.push({ kind: 'shifts' })
  if (questionIds.length > QUESTIONS_ONE_PER_SCREEN) steps.push({ kind: 'questions' })
  else steps.push(...questionIds.map(questionId => ({ kind: 'question' as const, questionId })))
  if (steps.some(step => step.kind !== 'details')) steps.push({ kind: 'review' })
  return steps
}

/** The step that holds a question's field. */
export function answerStepKey<Q extends string>(steps: readonly WizardStep<Q>[], questionId: Q): string | null {
  const step = steps.find(s => s.kind === 'questions' || (s.kind === 'question' && s.questionId === questionId))
  return step ? stepKey(step) : null
}

// Matches clip in convex/lib/eventSignupExtras, which quotes a question's prompt in its errors.
const clip = (text: string) => text.length > 80 ? `${text.slice(0, 77)}...` : text

/**
 * Where a server error belongs: the question it quotes, else the shifts step for shift problems, else the first
 * question for answer problems, else `part` (what was being saved). Null leaves it on the step the Student is on.
 */
export function errorStepKey<Q extends string>(steps: readonly WizardStep<Q>[], message: string, questions: readonly { questionId: Q; prompt: string }[], part: 'shifts' | 'answers' | null = null): string | null {
  const has = (key: string | null) => key !== null && steps.some(step => stepKey(step) === key)
  const quoted = questions.find(q => message.includes(`"${clip(q.prompt)}"`))
  if (quoted && has(answerStepKey(steps, quoted.questionId))) return answerStepKey(steps, quoted.questionId)
  const firstAnswer = questions.length ? answerStepKey(steps, questions[0].questionId) : null
  if (/\bshifts?\b/i.test(message) && has('shifts')) return 'shifts'
  if (/\b(questions?|answers?|answered)\b/i.test(message) && has(firstAnswer)) return firstAnswer
  if (part === 'shifts' && has('shifts')) return 'shifts'
  if (part === 'answers' && has(firstAnswer)) return firstAnswer
  return null
}

/** An answer as the review shows it. */
export function draftText(draft: AnswerDraft | undefined) {
  const copy = signupCopy.questions
  if (draft === null || draft === undefined) return copy.blank
  if (typeof draft === 'boolean') return draft ? copy.yes : copy.no
  if (Array.isArray(draft)) return draft.length ? draft.join(', ') : copy.blank
  return draft.trim() || copy.blank
}

const teamWideKinds: ReadonlySet<WhatsLeftItem['kind']> = new Set(['inviteParent', 'healthProfile', 'firstRegistration'])

/**
 * After signup: Home's What's left items for this event, and separately the team-wide ones that block going (a parent
 * link, the health profile, FIRST registration) so they don't read as unfinished parts of this event. Staff-only waits
 * and the signup's own approval (already shown) are left out.
 */
export function stillToDo(items: readonly WhatsLeftItem[], eventId: string, limit = 5): { event: WhatsLeftItem[]; team: WhatsLeftItem[] } {
  const own = items.filter(item => item.owner !== 'coach' && item.kind !== 'signupApproval' && item.kind !== 'staffReview')
  return {
    event: own.filter(item => item.eventId === eventId).slice(0, limit),
    team: own.filter(item => item.eventId === null && teamWideKinds.has(item.kind)).slice(0, limit),
  }
}

/** The same shifts, in any order. */
export const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id))

/** The answers to send match the saved ones (so Save skips an unchanged part). */
export function sameAnswers(next: readonly { questionId: string; value: unknown }[], saved: readonly { questionId: string; value: unknown }[]) {
  const key = (answers: readonly { questionId: string; value: unknown }[]) => JSON.stringify([...answers].sort((x, y) => x.questionId.localeCompare(y.questionId)).map(a => [a.questionId, a.value]))
  return key(next) === key(saved)
}
