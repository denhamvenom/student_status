import { describe, expect, it } from 'vitest'
import { operationsText } from '../../lib/operations-copy'
import { calendarChip, costLabel, displayBadges, requiredMeaning } from './event-page'

describe('event badges no longer show legacy audience names', () => {
  it.each([
    { name: 'legacy open signup', event: { signupMode: 'open' }, badges: ['Everyone', 'Optional'] },
    { name: 'legacy approval signup', event: { signupMode: 'approval' }, badges: ['Everyone', 'Optional'] },
    { name: 'legacy Whole Team', event: { signupMode: 'assigned', assignmentScope: 'wholeTeam' }, badges: ['Everyone', 'Required'] },
    { name: 'legacy Travel Team', event: { signupMode: 'assigned', assignmentScope: 'travelTeam' }, badges: ['Travel Team', 'Required'] },
    { name: 'legacy virtual open signup', event: { signupMode: 'open', locationType: 'virtual' }, badges: ['Everyone', 'Optional', 'Virtual (Discord)'] },
    { name: 'new Everyone, required', event: { signupMode: 'assigned', audienceKind: 'everyone', mandatory: true }, badges: ['Everyone', 'Required'] },
  ])('$name', ({ event, badges }) => {
    expect(displayBadges(event)).toEqual(badges)
  })
})

describe('Required / Optional with its meaning', () => {
  it.each([
    { event: { signupMode: 'assigned', assignmentScope: 'wholeTeam' }, parent: 'Required — your student is signed up automatically', student: 'Required — you’re signed up' },
    { event: { signupMode: 'open' }, parent: 'Optional — your student signs up in Venom Status. You can see the signup here but cannot change it.', student: 'Optional — you choose' },
    { event: { signupMode: 'assigned', audienceKind: 'mentorsOnly' }, parent: null, student: null },
    { event: {}, parent: null, student: null },
  ])('$event', ({ event, parent, student }) => {
    expect(requiredMeaning(event, 'parent')).toBe(parent)
    expect(requiredMeaning(event, 'student')).toBe(student)
  })
})

it.each([
  { cents: undefined, label: 'Free' },
  { cents: 0, label: 'Free' },
  { cents: 8500, label: '$85.00' },
])('cost of $cents cents reads "$label"', ({ cents, label }) => {
  expect(costLabel(cents)).toBe(label)
})

describe('Team Calendar chip', () => {
  it.each([
    { status: { state: 'synced' }, label: 'On Team Calendar', canRetry: false },
    { status: { state: 'pending', calendarEventId: 'g1' }, label: 'On Team Calendar', canRetry: false },
    { status: { state: 'pending' }, label: 'Adding to Team Calendar…', canRetry: false },
    { status: { state: 'unlinked' }, label: 'Not on Team Calendar', canRetry: false },
    // Requested at creation but Calendar updates are off: not the same as never asked.
    { status: { state: 'disabled' }, label: 'Not added to Team Calendar', canRetry: false },
    { status: { state: 'failed' }, label: 'Needs attention', canRetry: true },
    { status: { state: 'conflict' }, label: 'Needs attention', canRetry: true },
  ])('$status.state → $label', ({ status, label, canRetry }) => {
    const chip = calendarChip(status)
    expect(chip.label).toBe(label)
    expect(chip.canRetry).toBe(canRetry)
  })
  it('keeps a failure reason to its first sentence', () => {
    expect(calendarChip({ state: 'failed', error: 'Google refused the write. Request id abc-123. Try later.' }).reason).toBe('Google refused the write.')
  })
})

describe('signup status lines stay short (rules sit behind "?")', () => {
  it.each([
    { count: 15, capacity: undefined, left: null, line: '15 signed up' },
    { count: 15, capacity: 20, left: 5, line: '15 of 20 signed up · 5 left' },
  ])('$line', ({ count, capacity, left, line }) => {
    expect(operationsText.event.signedUp(count, capacity, left)).toBe(line)
  })
  it.each([
    { date: null, line: 'Signup closes: not set' },
    { date: 'Nov 3, 2026, 6:00 PM CST', line: 'Signup closes: Nov 3, 2026, 6:00 PM CST' },
  ])('$line', ({ date, line }) => {
    expect(operationsText.event.signupCloses(date)).toBe(line)
  })
})
