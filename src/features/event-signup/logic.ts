import { signupCopy } from './copy'

/*
 * The signup form's rules, matching convex/lib/eventSignupExtras (checkShifts, cleanAnswer, checkAnswers)
 * so a Student sees the problem next to the field before the backend refuses it.
 */

// Matches MAX_TEXT_ANSWER in convex/lib/eventSignupExtras.
export const MAX_TEXT_ANSWER = 2000

// Shifts

type Shift<I extends string> = { shiftId: I; startsAt: number; endsAt: number; spotsLeft: number | null }
export type ShiftSettings = { minShiftsPerStudent: number; maxShiftsPerStudent: number | null }
export type ShiftBounds = { min: number; max: number | null }

/** The backend never asks for more shifts than the event offers. */
export function shiftBounds(settings: ShiftSettings, offered: number): ShiftBounds {
  return { min: Math.min(settings.minShiftsPerStudent, offered), max: settings.maxShiftsPerStudent }
}

const overlaps = (a: { startsAt: number; endsAt: number }, b: { startsAt: number; endsAt: number }) => a.startsAt < b.endsAt && b.startsAt < a.endsAt

/** Why a shift can't be added to the choice right now, or null when it can be tapped. */
export type ShiftBlock = 'full' | 'overlap' | 'limit' | null

/**
 * `held` are the shifts the Student already has (their own place counts in spotsLeft, so a held shift is never full
 * for them). With a limit of one shift, tapping another swaps the choice instead of being blocked.
 */
export function shiftBlock<I extends string>(shift: Shift<I>, selected: readonly I[], shifts: readonly Shift<I>[], bounds: ShiftBounds, held: readonly I[]): ShiftBlock {
  if (selected.includes(shift.shiftId)) return null
  if (shift.spotsLeft === 0 && !held.includes(shift.shiftId)) return 'full'
  if (bounds.max === 1) return null
  if (shifts.some(other => selected.includes(other.shiftId) && overlaps(other, shift))) return 'overlap'
  if (bounds.max !== null && selected.length >= bounds.max) return 'limit'
  return null
}

/** The choice after tapping a shift; a blocked tap changes nothing. */
export function toggleShift<I extends string>(shiftId: I, selected: readonly I[], shifts: readonly Shift<I>[], bounds: ShiftBounds, held: readonly I[]): I[] {
  if (selected.includes(shiftId)) return selected.filter(id => id !== shiftId)
  const shift = shifts.find(s => s.shiftId === shiftId)
  if (!shift || shiftBlock(shift, selected, shifts, bounds, held)) return [...selected]
  return bounds.max === 1 ? [shiftId] : [...selected, shiftId]
}

/** A problem with the whole choice, worded for the Student, or null when it can be sent. */
export function shiftChoiceIssue(count: number, bounds: ShiftBounds): string | null {
  if (count < bounds.min) return signupCopy.shifts.pickMore(bounds.min - count)
  if (bounds.max !== null && count > bounds.max) return signupCopy.shifts.tooMany(bounds.max)
  return null
}

/** "Pick 1 shift", "Pick 1 to 3 shifts", "Pick at least 2 shifts", "Pick up to 2 shifts", or null with no rule to show. */
export function shiftRuleText(bounds: ShiftBounds): string | null {
  const { min, max } = bounds, copy = signupCopy.shifts
  if (max !== null && min === max) return copy.pickExactly(max)
  if (max !== null && min > 0) return copy.pickBetween(min, max)
  if (max !== null) return copy.pickUpTo(max)
  if (min > 0) return copy.pickAtLeast(min)
  return null
}

// Questions

type Question<I extends string> = { questionId: I; kind: 'singleChoice' | 'multiChoice' | 'shortText' | 'longText' | 'yesNo' | 'number'; prompt: string; options: string[] | null; required: boolean }
type Value = string | string[] | number | boolean

/** What a field holds while the Student types: numbers stay text until sent; Yes/No is null until tapped. */
export type AnswerDraft = string | string[] | boolean | null

export function draftFromSaved(question: Pick<Question<string>, 'kind'>, saved: Value | undefined): AnswerDraft {
  switch (question.kind) {
    case 'multiChoice': return Array.isArray(saved) ? saved : []
    case 'yesNo': return typeof saved === 'boolean' ? saved : null
    case 'number': return typeof saved === 'number' ? String(saved) : ''
    default: return typeof saved === 'string' ? saved : ''
  }
}

const isBlank = (draft: AnswerDraft) => draft === null || (typeof draft === 'string' ? !draft.trim() : Array.isArray(draft) && !draft.length)

/** The value to send, or null when the field is blank. Assumes answerIssue found nothing. */
export function draftValue(question: Pick<Question<string>, 'kind'>, draft: AnswerDraft): Value | null {
  if (isBlank(draft)) return null
  if (question.kind === 'number') return Number(String(draft).trim().replaceAll(',', ''))
  return typeof draft === 'string' ? draft.trim() : draft
}

/** A friendly problem with one answer, or null when it's fine (blank is fine unless required). */
export function answerIssue(question: Question<string>, draft: AnswerDraft): string | null {
  const copy = signupCopy.questions
  if (isBlank(draft)) return question.required ? copy.requiredHint : null
  if (question.kind === 'number' && !Number.isFinite(draftValue(question, draft))) return copy.number
  if ((question.kind === 'shortText' || question.kind === 'longText') && typeof draft === 'string' && draft.trim().length > MAX_TEXT_ANSWER) return copy.tooLong
  if (question.kind === 'singleChoice' && !question.options?.includes(String(draft))) return copy.pickOne
  if (question.kind === 'multiChoice' && Array.isArray(draft) && draft.some(x => !question.options?.includes(x))) return copy.pickOne
  return null
}

/** Every answer's problem by question, empty when the set can be sent. */
export function answerIssues<I extends string>(questions: readonly Question<I>[], drafts: Partial<Record<I, AnswerDraft>>) {
  const issues: Partial<Record<I, string>> = {}
  for (const question of questions) {
    const issue = answerIssue(question, drafts[question.questionId] ?? draftFromSaved(question, undefined))
    if (issue) issues[question.questionId] = issue
  }
  return issues
}

/** The full set of answers to send; blank answers are left out (the backend clears them). */
export function answersToSend<I extends string>(questions: readonly Question<I>[], drafts: Partial<Record<I, AnswerDraft>>) {
  return questions.flatMap(question => {
    const value = draftValue(question, drafts[question.questionId] ?? null)
    return value === null ? [] : [{ questionId: question.questionId, value }]
  })
}

export function draftsFromSaved<I extends string>(questions: readonly Question<I>[], saved: readonly { questionId: I; value: Value }[]) {
  const drafts: Partial<Record<I, AnswerDraft>> = {}
  for (const question of questions) drafts[question.questionId] = draftFromSaved(question, saved.find(a => a.questionId === question.questionId)?.value)
  return drafts
}

/**
 * The Student's drafts against the questions as they are now (the questions are a live query): new questions get
 * their saved/default draft, removed questions go, and choices that no longer exist are dropped. Everything else they typed stays.
 */
export function reconcileDrafts<I extends string>(questions: readonly Question<I>[], drafts: Partial<Record<I, AnswerDraft>>, saved: readonly { questionId: I; value: Value }[]) {
  const next: Partial<Record<I, AnswerDraft>> = {}
  for (const question of questions) {
    const draft = drafts[question.questionId]
    if (draft === undefined) { next[question.questionId] = draftFromSaved(question, saved.find(a => a.questionId === question.questionId)?.value); continue }
    if (question.kind === 'multiChoice' && Array.isArray(draft)) next[question.questionId] = draft.filter(option => question.options?.includes(option))
    else if (question.kind === 'singleChoice' && typeof draft === 'string' && draft && !question.options?.includes(draft)) next[question.questionId] = ''
    else next[question.questionId] = draft
  }
  return next
}

/** The chosen shifts that are still offered. */
export const reconcileShifts = <I extends string>(selected: readonly I[], offered: readonly { shiftId: I }[]) => selected.filter(id => offered.some(shift => shift.shiftId === id))

/** Required questions without a saved answer. */
export function unansweredRequired<I extends string>(questions: readonly Question<I>[], saved: readonly { questionId: I }[]) {
  return questions.filter(q => q.required && !saved.some(a => a.questionId === q.questionId))
}
