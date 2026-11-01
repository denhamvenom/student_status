import { describe, expect, it } from 'vitest'
import { MAX_REQUIREMENTS, shiftReviewText, addLater, reviewDetails, extrasIssue, extrasIssues, newDraftId, questionIssue, withoutInvalid, requirementArgs, shiftArgs, type DraftQuestion } from './new-event-extras'

const hour = 3_600_000
const event = { startsAt: Date.parse('2026-11-07T15:00:00Z'), endsAt: Date.parse('2026-11-07T23:00:00Z') }
const none = { shiftsOn: true, shifts: [], questions: [], requirements: [], event }
const question = (patch: Partial<DraftQuestion>): DraftQuestion => ({ id: 'q', kind: 'shortText', prompt: 'Size?', options: ['', ''], required: true, ...patch })

describe('new event optional steps', () => {
  it.each([
    { name: 'a blank prompt', q: question({ prompt: ' ' }), bad: true },
    { name: 'one choice option', q: question({ kind: 'singleChoice', options: ['S', ''] }), bad: true },
    { name: 'repeated options', q: question({ kind: 'multiChoice', options: ['S', 's'] }), bad: true },
    { name: 'text with leftover options', q: question({ options: ['', ''] }), bad: false },
    { name: 'two different options', q: question({ kind: 'singleChoice', options: ['S', 'M'] }), bad: false },
  ])('questionIssue: $name', ({ q, bad }) => expect(questionIssue(q) !== null).toBe(bad))

  it('sends only what Coaches entered, in time order', () => {
    const args = shiftArgs([{ shiftId: 'b', label: ' ', startsAt: event.startsAt + 2 * hour, endsAt: event.startsAt + 3 * hour, capacity: null }, { shiftId: 'a', label: 'Setup', startsAt: event.startsAt, endsAt: event.startsAt + hour, capacity: 4 }])
    expect(args).toEqual([{ label: 'Setup', startsAt: event.startsAt, endsAt: event.startsAt + hour, capacity: 4 }, { startsAt: event.startsAt + 2 * hour, endsAt: event.startsAt + 3 * hour }])
  })

  it('makes unique, allowed short names for requirements', () => {
    const r = (label: string) => ({ id: label, label, instructions: '', url: '', dueAt: '' })
    expect(requirementArgs([r('Waiver'), r('waiver!'), r('Pay'), r('???')]).map(x => x.key)).toEqual(['waiver', 'waiver-2', 'requirement-3', 'requirement-4'])
  })

  it('flags a time slot left outside the event after the event dates change', () => {
    const slot = { shiftId: 'a', label: '', startsAt: event.startsAt - hour, endsAt: event.startsAt + hour, capacity: null }
    expect(extrasIssue({ ...none, shifts: [slot] })?.step).toBe(6)
    expect(extrasIssue({ ...none, shiftsOn: false, shifts: [slot] })).toBeNull()
  })

  it('lists skipped items for the event page', () => {
    expect(addLater(none)).toHaveLength(3)
    expect(addLater({ ...none, shiftsOn: false, questions: [1], requirements: [1] })).toEqual([])
  })

  it('never reuses a draft id, even after a step is closed and reopened', () => {
    const ids = [newDraftId('q'), newDraftId('q'), newDraftId('r'), newDraftId('slot-')]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('Skip removes only the unfinished drafts of that step, so Create is not left disabled', () => {
    const good = question({ id: 'g' }), bad = question({ id: 'b', prompt: '' })
    const requirement = { id: 'r', label: '', instructions: '', url: '', dueAt: '' }
    const draft = { ...none, questions: [good, bad], requirements: [requirement] }
    const skipped = withoutInvalid(draft, 7)
    expect(skipped.questions).toEqual([good])
    expect(skipped.requirements).toEqual([requirement])
    expect(skipped.removed).toBe(1)
    expect(extrasIssue({ ...draft, questions: skipped.questions }, 7)).toBeNull()
  })

  it('lists each step with a problem and which item it is for the Review step', () => {
    const issues = extrasIssues({ ...none, questions: [question({ id: 'a' }), question({ id: 'b', prompt: '' })], requirements: [{ id: 'r', label: '', instructions: '', url: '', dueAt: '' }] })
    expect(issues.map(i => [i.step, i.item])).toEqual([[7, 2], [8, 1]])
  })
})

describe('reviewDetails', () => {
  it('lists slots, questions and requirements compactly', () => {
    const d = reviewDetails({
      shifts: [{ shiftId: 'a', label: '', startsAt: event.startsAt, endsAt: event.startsAt + hour, capacity: 4 }, { shiftId: 'b', label: 'Late', startsAt: event.startsAt + hour, endsAt: event.startsAt + 2 * hour, capacity: null }],
      questions: [question({ kind: 'singleChoice', prompt: 'Lunch?', options: ['Ham', 'Veg'], required: false }), question({ prompt: 'Size?' })],
      requirements: [{ id: 'r', label: 'Waiver', instructions: '', url: '', dueAt: '2026-11-05T17:00' }, { id: 's', label: 'Photo', instructions: '', url: '', dueAt: '' }]
    })
    expect(d.slots).toHaveLength(2)
    expect(d.slots[0]).toContain('4 places')
    expect(d.slots[1]).toContain('Late')
    expect(d.slots[1]).toContain('No limit')
    expect(d.questions[0]).toBe('Lunch? · Multiple choice (pick one) · Optional · Ham, Veg')
    expect(d.questions[1]).toBe('Size? · Short answer · Required')
    expect(d.requirements[0]).toMatch(/^Waiver · due /)
    expect(d.requirements[1]).toBe('Photo · no due date')
  })
})

describe('backend caps in the wizard', () => {
  const req = (i: number) => ({ id: `r${i}`, label: `Item ${i}`, instructions: '', url: '', dueAt: '' })
  it('flags more than 100 requirements on step 8 and in the review list', () => {
    const draft = { ...none, requirements: Array.from({ length: MAX_REQUIREMENTS + 1 }, (_, i) => req(i)) }
    expect(extrasIssue({ ...draft, requirements: draft.requirements.slice(0, MAX_REQUIREMENTS) })).toBeNull()
    expect(extrasIssue(draft, 8)?.step).toBe(8)
    expect(extrasIssues(draft).map(i => i.step)).toEqual([8])
  })
  it('flags more than 25 questions', () => {
    const questions = Array.from({ length: 26 }, (_, i) => question({ id: `q${i}` }))
    expect(extrasIssue({ ...none, questions }, 7)?.step).toBe(7)
  })
})

describe('shiftReviewText', () => {
  it.each([
    { min: '1', max: '', slots: 0, has: 'No time slots yet' },
    { min: '3', max: '', slots: 2, has: 'at least 2 shifts' },
    { min: '', max: '', slots: 1, has: 'at least 1 shift' },
    { min: '2', max: '2', slots: 5, has: 'pick 2 shifts' },
  ])('min $min max $max with $slots slots', ({ min, max, slots, has }) => {
    expect(shiftReviewText(min, max, slots)).toContain(has)
  })
})
