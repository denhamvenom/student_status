import { describe, expect, it } from 'vitest'
import { answerIssue, answersToSend, draftFromSaved, reconcileDrafts, reconcileShifts, shiftBlock, shiftBounds, shiftChoiceIssue, shiftRuleText, toggleShift, unansweredRequired, type ShiftBounds } from './logic'

const hour = 60 * 60 * 1000
const shift = (shiftId: string, from: number, to: number, spotsLeft: number | null = 5) => ({ shiftId, startsAt: from * hour, endsAt: to * hour, spotsLeft })
// 9-11, 11-13 (back to back), 10-12 (overlaps both), 13-15 full.
const shifts = [shift('a', 9, 11), shift('b', 11, 13), shift('c', 10, 12), shift('d', 13, 15, 0)]
const upTo2: ShiftBounds = { min: 1, max: 2 }

describe('shift choice rules (match checkShifts)', () => {
  it.each([
    ['a full shift', 'd', [], [], 'full'],
    ['a full shift the student already holds', 'd', [], ['d'], null],
    ['a shift overlapping a picked one', 'c', ['a'], [], 'overlap'],
    ['a back-to-back shift', 'b', ['a'], [], null],
    ['a shift past the limit', 'd', ['a', 'b'], ['d'], 'limit'],
    ['a picked shift (to unpick it)', 'a', ['a', 'b'], [], null],
  ])('blocks %s correctly', (_name, id, selected, held, expected) => {
    expect(shiftBlock(shifts.find(s => s.shiftId === id)!, selected, shifts, upTo2, held)).toBe(expected)
  })

  it('swaps the choice when only one shift is allowed, even if the times overlap, but never into a full shift', () => {
    const one = { min: 1, max: 1 }
    expect(toggleShift('c', ['a'], shifts, one, [])).toEqual(['c'])
    expect(toggleShift('d', ['a'], shifts, one, [])).toEqual(['a'])
  })

  it('adds, removes and ignores blocked taps', () => {
    expect(toggleShift('b', ['a'], shifts, upTo2, [])).toEqual(['a', 'b'])
    expect(toggleShift('a', ['a', 'b'], shifts, upTo2, [])).toEqual(['b'])
    expect(toggleShift('c', ['a'], shifts, upTo2, [])).toEqual(['a'])
  })

  it('never asks for more shifts than the event offers', () => {
    expect(shiftBounds({ minShiftsPerStudent: 3, maxShiftsPerStudent: null }, 2)).toEqual({ min: 2, max: null })
  })

  it.each([
    [0, { min: 1, max: 2 }, 'Pick 1 more shift.'],
    [1, { min: 3, max: null }, 'Pick 2 more shifts.'],
    [3, { min: 1, max: 2 }, 'You can pick up to 2 shifts. Remove one.'],
    [0, { min: 0, max: 2 }, null],
    [2, { min: 1, max: 2 }, null],
  ])('with %i picked and %o the issue is %s', (count, bounds, expected) => {
    expect(shiftChoiceIssue(count, bounds)).toBe(expected)
  })

  it.each([
    [{ min: 1, max: 1 }, 'Pick 1 shift'],
    [{ min: 1, max: 3 }, 'Pick 1 to 3 shifts'],
    [{ min: 0, max: 2 }, 'Pick up to 2 shifts'],
    [{ min: 2, max: null }, 'Pick at least 2 shifts'],
    [{ min: 0, max: null }, null],
  ])('describes %o as %s', (bounds, expected) => {
    expect(shiftRuleText(bounds)).toBe(expected)
  })
})

type Kind = 'singleChoice' | 'multiChoice' | 'shortText' | 'longText' | 'yesNo' | 'number'
const question = (kind: Kind, required = true, options: string[] | null = null) => ({ questionId: `q-${kind}`, kind, prompt: 'Question', options, required })

describe('answer rules (match cleanAnswer and checkAnswers)', () => {
  it.each([
    ['a blank required text', question('shortText'), '   ', 'Please answer this.'],
    ['a blank optional text', question('shortText', false), '', null],
    ['an unanswered required Yes/No', question('yesNo'), null, 'Please answer this.'],
    ['No to a required Yes/No', question('yesNo'), false, null],
    ['no choices on a required multi-choice', question('multiChoice', true, ['A', 'B']), [], 'Please answer this.'],
    ['text in a number question', question('number'), 'twelve', 'Enter a number.'],
    ['a number with a thousands comma', question('number'), '1,200', null],
    ['an over-long answer', question('longText'), 'x'.repeat(2001), 'Keep it under 2,000 characters.'],
    ['a choice that is no longer offered', question('singleChoice', true, ['A', 'B']), 'C', 'Pick one of the choices.'],
  ])('checks %s', (_name, q, draft, expected) => {
    expect(answerIssue(q, draft)).toBe(expected)
  })

  it('sends typed values, trims text and leaves blank answers out', () => {
    const questions = [question('number'), question('shortText', false), question('yesNo'), question('multiChoice', false, ['A', 'B'])]
    expect(answersToSend(questions, { 'q-number': ' 1,200 ', 'q-shortText': '  ', 'q-yesNo': false, 'q-multiChoice': ['B'] })).toEqual([
      { questionId: 'q-number', value: 1200 }, { questionId: 'q-yesNo', value: false }, { questionId: 'q-multiChoice', value: ['B'] },
    ])
  })

  it('starts each field from the saved answer, or blank', () => {
    expect([draftFromSaved({ kind: 'number' }, 4), draftFromSaved({ kind: 'yesNo' }, undefined), draftFromSaved({ kind: 'multiChoice' }, undefined)]).toEqual(['4', null, []])
  })

  it('lists required questions without a saved answer for the To do', () => {
    const questions = [question('shortText'), question('yesNo'), question('number', false)]
    expect(unansweredRequired(questions, [{ questionId: 'q-yesNo' }]).map(q => q.questionId)).toEqual(['q-shortText'])
  })
})

describe('live questions and shifts', () => {
  const q = (questionId: string, kind: 'singleChoice' | 'multiChoice' | 'shortText', options: string[] | null = null) => ({ questionId, kind, prompt: questionId, options, required: false })

  it('drops removed options and questions, adds new ones, and keeps everything else typed', () => {
    const questions = [q('size', 'singleChoice', ['S', 'M']), q('food', 'multiChoice', ['pizza']), q('note', 'shortText'), q('fresh', 'shortText')]
    const drafts = reconcileDrafts(questions, { size: 'XL', food: ['pizza', 'tacos'], note: 'hi', gone: 'x' } as never, [{ questionId: 'fresh', value: 'saved' }])
    expect(drafts).toEqual({ size: '', food: ['pizza'], note: 'hi', fresh: 'saved' })
  })

  it('drops picked shifts that are no longer offered', () => {
    expect(reconcileShifts(['a', 'z'], [{ shiftId: 'a' }, { shiftId: 'b' }])).toEqual(['a'])
  })
})
