import { describe, expect, it } from 'vitest'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import type { Id } from '../../../convex/_generated/dataModel'
import { meeting, NOW } from './fixtures'
import { clampCount, DEFAULT_NEXT, firstIssue, initialChoice, reviewLines, scopeOptions, stepIssue, wizardCalls, wizardSteps, type WizardChoice } from './signup-wizard'

const copy = mentorHomeCopy.signup
const HOUR = 3_600_000
const seriesId = 'fixture_series_w' as Id<'eventSeries'>
const plain = meeting('Team meeting', NOW + HOUR, { canSignUp: true })
const travel = meeting('Qualifier', NOW + HOUR, { canSignUp: true, questions: { askDrive: true, askHotel: false } })
const overnight = meeting('State', NOW + HOUR, { canSignUp: true, questions: { askDrive: true, askHotel: true } })
const hotelOnly = meeting('Lock-in', NOW + HOUR, { canSignUp: true, questions: { askDrive: false, askHotel: true } })
const series = meeting('Build night', NOW + HOUR, { canSignUp: true, seriesId })
const seriesTravel = meeting('Outreach tour', NOW + HOUR, { canSignUp: true, seriesId, questions: { askDrive: true, askHotel: false } })
const signup = (scope: 'all' | 'one' | 'next', count: number | null = null) => ({ scope, count, coversThisMeeting: true, skippedThisMeeting: false })
const choice = (next: Partial<WizardChoice> = {}): WizardChoice => ({ scope: null, count: DEFAULT_NEXT, canDrive: null, needsHotel: null, ...next })

describe('which wizard steps apply', () => {
  it.each([
    { name: 'plain one-time event: just confirm', row: plain, mode: 'join', steps: ['review'] },
    { name: 'travel', row: travel, mode: 'join', steps: ['drive', 'review'] },
    { name: 'overnight travel', row: overnight, mode: 'join', steps: ['drive', 'hotel', 'review'] },
    { name: 'overnight without travel', row: hotelOnly, mode: 'accept', steps: ['hotel', 'review'] },
    { name: 'series', row: series, mode: 'join', steps: ['which', 'review'] },
    { name: 'series with travel', row: seriesTravel, mode: 'accept', steps: ['which', 'drive', 'review'] },
    { name: 'change answers on a series', row: series, mode: 'change', steps: ['which', 'review'] },
    { name: 'join a skipped meeting again', row: seriesTravel, mode: 'rejoin', steps: ['drive', 'review'] },
  ] as const)('$name', ({ row, mode, steps }) => {
    expect(wizardSteps(row, mode)).toEqual(steps)
  })
})

describe('starting choices', () => {
  it('starts empty for a new sign-up and prefilled for Change my answers', () => {
    expect(initialChoice(seriesTravel, 'join')).toEqual(choice())
    const going = { ...seriesTravel, myStatus: 'accepted' as const, seriesSignup: signup('next', 6), myAnswers: { canDriveStudents: false, needsHotelRoom: null } }
    expect(initialChoice(going, 'change')).toEqual(choice({ scope: 'next', count: 6, canDrive: false }))
    // Going to a series meeting without a series sign-up counts as just this one.
    expect(initialChoice(series, 'change').scope).toBe('one')
    expect(initialChoice(seriesTravel, 'rejoin').scope).toBe('one')
    expect(initialChoice(plain, 'join').scope).toBeNull()
  })

  it('offers Just this one when changing only if the sign-up is already just one', () => {
    expect(scopeOptions({ ...series, seriesSignup: signup('all') }, 'change')).toEqual(['all', 'next'])
    expect(scopeOptions({ ...series, seriesSignup: signup('one') }, 'change')).toEqual(['all', 'one', 'next'])
    expect(scopeOptions({ ...series, seriesSignup: signup('all') }, 'join')).toEqual(['all', 'one', 'next'])
  })

  it.each([[0, 1], [53, 52], [4.4, 4], [Number.NaN, DEFAULT_NEXT], [12, 12]])('count %s becomes %s', (input, output) => {
    expect(clampCount(input)).toBe(output)
  })
})

describe('what blocks Next', () => {
  it.each([
    { name: 'no series choice', step: 'which', value: choice(), issue: copy.which.pick },
    { name: 'next with no number', step: 'which', value: choice({ scope: 'next', count: Number.NaN }), issue: copy.which.countInvalid },
    { name: 'next with 53', step: 'which', value: choice({ scope: 'next', count: 53 }), issue: copy.which.countInvalid },
    { name: 'next with 52', step: 'which', value: choice({ scope: 'next', count: 52 }), issue: null },
    { name: 'every meeting', step: 'which', value: choice({ scope: 'all' }), issue: null },
    { name: 'drive unanswered', step: 'drive', value: choice(), issue: copy.drive.pick },
    { name: 'drive: no', step: 'drive', value: choice({ canDrive: false }), issue: null },
    { name: 'hotel unanswered', step: 'hotel', value: choice(), issue: copy.hotel.pick },
    { name: 'review', step: 'review', value: choice(), issue: null },
  ] as const)('$name', ({ step, value, issue }) => {
    expect(stepIssue(step, value)).toBe(issue)
  })

  it('refuses a choice the step no longer offers and finds the first step to fix', () => {
    expect(stepIssue('which', choice({ scope: 'one' }), ['all', 'next'])).toBe(copy.which.pick)
    expect(firstIssue(wizardSteps(overnight, 'join'), choice({ canDrive: true }))).toBe('hotel')
    expect(firstIssue(wizardSteps(overnight, 'join'), choice({ canDrive: true, needsHotel: false }))).toBeNull()
  })
})

describe('review summary', () => {
  const text = (lines: ReturnType<typeof reviewLines>) => lines.map(line => `${line.label}: ${line.value}`)
  it.each([
    { name: 'plain event has nothing to review', row: plain, mode: 'join', value: choice(), lines: [] },
    { name: 'every meeting', row: series, mode: 'join', value: choice({ scope: 'all' }), lines: ['Which meetings: Every meeting'] },
    { name: 'next 4', row: series, mode: 'join', value: choice({ scope: 'next', count: 4 }), lines: ['Which meetings: The next 4 meetings'] },
    { name: 'next 1', row: series, mode: 'join', value: choice({ scope: 'next', count: 1 }), lines: ['Which meetings: The next meeting'] },
    { name: 'just this one, with travel', row: seriesTravel, mode: 'accept', value: choice({ scope: 'one', canDrive: true }), lines: ['Which meetings: Just this one', `Drive students: ${copy.drive.yes}`] },
    { name: 'overnight', row: overnight, mode: 'join', value: choice({ canDrive: false, needsHotel: true }), lines: ['Drive students: No', `Hotel room: ${copy.hotel.yes}`] },
    { name: 'rejoin is just this one', row: seriesTravel, mode: 'rejoin', value: choice({ scope: 'one', canDrive: false }), lines: ['Which meetings: Just this one', 'Drive students: No'] },
  ] as const)('$name', ({ row, mode, value, lines }) => {
    expect(text(reviewLines(row, mode, value))).toEqual(lines)
  })
})

describe('what Confirm sends', () => {
  it.each([
    { name: 'plain sign-up', row: plain, mode: 'join', value: choice(), calls: [{ kind: 'signUp', args: {} }] },
    { name: 'travel sign-up', row: travel, mode: 'join', value: choice({ canDrive: true }), calls: [{ kind: 'signUp', args: { canDriveStudents: true } }] },
    { name: 'accept an overnight invitation', row: overnight, mode: 'accept', value: choice({ canDrive: false, needsHotel: true }), calls: [{ kind: 'respond', args: { canDriveStudents: false, needsHotelRoom: true } }] },
    { name: 'series: next 4', row: series, mode: 'join', value: choice({ scope: 'next', count: 4 }), calls: [{ kind: 'signUp', args: { scope: 'next', count: 4 } }] },
    { name: 'series: every meeting drops the number', row: series, mode: 'join', value: choice({ scope: 'all', count: 9 }), calls: [{ kind: 'signUp', args: { scope: 'all' } }] },
    { name: 'rejoin a skipped meeting', row: seriesTravel, mode: 'rejoin', value: choice({ scope: 'one', canDrive: true }), calls: [{ kind: 'signUp', args: { scope: 'one', canDriveStudents: true } }] },
  ] as const)('$name', ({ row, mode, value, calls }) => {
    expect(wizardCalls(row, mode, value)).toEqual(calls)
  })

  it('Change my answers sends only what changed', () => {
    const goingTravel = { ...travel, myStatus: 'accepted' as const, myAnswers: { canDriveStudents: true, needsHotelRoom: null } }
    expect(wizardCalls(goingTravel, 'change', choice({ canDrive: true }))).toEqual([])
    expect(wizardCalls(goingTravel, 'change', choice({ canDrive: false }))).toEqual([{ kind: 'updateAnswers', answers: { canDriveStudents: false, needsHotelRoom: undefined }, allMeetingsInSeries: false }])
    const goingSeries = { ...seriesTravel, myStatus: 'accepted' as const, seriesSignup: signup('next', 4), myAnswers: { canDriveStudents: true, needsHotelRoom: null } }
    expect(wizardCalls(goingSeries, 'change', choice({ scope: 'next', count: 4, canDrive: true }))).toEqual([])
    expect(wizardCalls(goingSeries, 'change', choice({ scope: 'next', count: 8, canDrive: true }))).toEqual([{ kind: 'signUp', args: { scope: 'next', count: 8, canDriveStudents: true } }])
    expect(wizardCalls(goingSeries, 'change', choice({ scope: 'all', canDrive: false }))).toEqual([
      { kind: 'signUp', args: { scope: 'all', canDriveStudents: false } },
      { kind: 'updateAnswers', answers: { canDriveStudents: false, needsHotelRoom: undefined }, allMeetingsInSeries: true },
    ])
  })
})
