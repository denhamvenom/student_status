import { describe, expect, it } from 'vitest'
import { parseChicagoInput } from '@/lib/chicago-time'
import { eventSetupCopy } from '../../copy/event-setup-copy'
import { byMostOpen, endFollowingStart, nextShiftTimes, overlappingShifts, planShifts, shiftLimitsIssue, shiftTimesIssue, timeSpan } from './shift-plan'

const at = (time: string, day = '2026-11-07') => parseChicagoInput(`${day}T${time}`)
const event = { startsAt: at('08:00'), endsAt: at('18:00') }
const request = { day: '2026-11-07', from: '09:00', to: '17:00', blockMinutes: 120, capacity: '6', event, existing: [] }
const times = (plan: ReturnType<typeof planShifts>) => 'issue' in plan ? plan.issue : plan.shifts.map(s => [s.startsAt, s.endsAt, s.capacity])

describe('planShifts', () => {
  it('splits 9 AM to 5 PM Central into 2-hour back-to-back shifts with the chosen places', () => {
    expect(times(planShifts(request))).toEqual([
      [at('09:00'), at('11:00'), 6], [at('11:00'), at('13:00'), 6], [at('13:00'), at('15:00'), 6], [at('15:00'), at('17:00'), 6],
    ])
  })

  it('ends with a shorter shift when the hours do not divide evenly, and allows no place limit', () => {
    expect(times(planShifts({ ...request, blockMinutes: 180, capacity: '' }))).toEqual([
      [at('09:00'), at('12:00'), null], [at('12:00'), at('15:00'), null], [at('15:00'), at('17:00'), null],
    ])
  })

  it('skips shifts that already exist so generating twice does not duplicate them', () => {
    const plan = planShifts({ ...request, existing: [{ startsAt: at('09:00'), endsAt: at('11:00') }] })
    expect('issue' in plan ? plan.issue : [plan.shifts.length, plan.skipped]).toEqual([3, 1])
    const again = planShifts({ ...request, existing: [[9, 11], [11, 13], [13, 15], [15, 17]].map(([a, b]) => ({ startsAt: at(`${String(a).padStart(2, '0')}:00`), endsAt: at(`${b}:00`) })) })
    expect(again).toEqual({ issue: 'Those shifts already exist.' })
  })

  it('uses Central Time on a daylight saving change day', () => {
    const day = '2026-11-01'
    const plan = planShifts({ ...request, day, from: '09:00', to: '13:00', event: { startsAt: at('00:00', day), endsAt: at('23:00', day) } })
    expect(times(plan)).toEqual([[at('09:00', day), at('11:00', day), 6], [at('11:00', day), at('13:00', day), 6]])
  })

  it.each([
    { name: 'missing day', change: { day: '' }, issue: /valid start and end/ },
    { name: 'end before start', change: { from: '17:00', to: '09:00' }, issue: /must end after/ },
    { name: 'places of 0', change: { capacity: '0' }, issue: /places in each shift/ },
    { name: 'fractional places', change: { capacity: '2.5' }, issue: /places in each shift/ },
    { name: 'before the event starts', change: { from: '07:00' }, issue: /within the event's times/ },
    { name: 'on another day', change: { day: '2026-11-08' }, issue: /within the event's times/ },
    { name: 'more than 100 shifts', change: { blockMinutes: 30, existing: Array.from({ length: 90 }, (_, i) => ({ startsAt: i, endsAt: i + 1 })) }, issue: /add 10 or fewer/ },
  ])('rejects $name', ({ change, issue }) => {
    const plan = planShifts({ ...request, ...change })
    expect('issue' in plan ? plan.issue : plan).toMatch(issue)
  })
})

describe('shiftLimitsIssue', () => {
  it.each([
    { min: '1', max: '1', issue: null },
    { min: '', max: '', issue: null },
    { min: '0', max: '3', issue: null },
    { min: '1', max: '0', issue: 'max' },
    { min: '1', max: '1.5', issue: 'max' },
    { min: '1', max: '101', issue: 'max' },
    { min: '-1', max: '', issue: 'min' },
    { min: '3', max: '2', issue: 'min' },
  ])('min $min, max $max → $issue', ({ min, max, issue }) => {
    expect(shiftLimitsIssue(min, max)?.field ?? null).toBe(issue)
  })
})

describe('overlappingShifts', () => {
  const existing = [{ shiftId: 'a', startsAt: at('13:00'), endsAt: at('15:00') }, { shiftId: 'b', startsAt: at('15:00'), endsAt: at('17:00') }]

  it('counts real overlaps but not back-to-back shifts, and ignores the shift being edited', () => {
    expect(overlappingShifts({ startsAt: at('15:00'), endsAt: at('16:00') }, existing).map(s => s.shiftId)).toEqual(['b'])
    expect(overlappingShifts({ startsAt: at('14:00'), endsAt: at('16:00') }, existing)).toHaveLength(2)
    expect(overlappingShifts({ startsAt: at('14:00'), endsAt: at('16:00') }, existing, 'a').map(s => s.shiftId)).toEqual(['b'])
    expect(overlappingShifts({ startsAt: at('09:00'), endsAt: at('13:00') }, existing)).toEqual([])
  })

  it('words the overlap with a compact time span', () => {
    expect(eventSetupCopy.shifts.overlaps(1, [timeSpan(at('15:00'), at('17:00'))])).toBe('Overlaps 1 existing shift (3:00–5:00 PM).')
    expect(timeSpan(at('11:00'), at('13:00'))).toBe('11:00 AM–1:00 PM')
  })

  it('tells the generator preview how many existing shifts the new ones overlap', () => {
    const plan = planShifts({ ...request, existing: [{ startsAt: at('10:00'), endsAt: at('12:00') }] })
    expect('issue' in plan ? plan : plan.overlapping).toBe(1)
  })
})

describe('preview wording', () => {
  it.each([[1, '1 matching shift already exists'], [2, '2 matching shifts already exist']])('%i skipped', (count, text) => {
    expect(eventSetupCopy.shifts.preview(3, count)).toContain(text)
  })
})

describe('endFollowingStart', () => {
  it('keeps the previous length when the start moves', () => {
    expect(endFollowingStart('2026-11-07T09:00', '2026-11-07T11:00', '2026-11-07T13:00')).toBe('2026-11-07T15:00')
  })
  it('falls back to one hour when the old length is unusable', () => {
    expect(endFollowingStart('2026-11-07T09:00', '2026-11-07T08:00', '2026-11-07T13:00')).toBe('2026-11-07T14:00')
    expect(endFollowingStart('', '', '2026-11-07T13:00')).toBe('2026-11-07T14:00')
  })
})

describe('shiftTimesIssue', () => {
  it.each([
    ['2026-11-07T09:00', '2026-11-07T10:00', null],
    ['2026-11-07T10:00', '2026-11-07T10:00', 'must end after'],
    ['2026-11-07T07:00', '2026-11-07T09:00', /within the event's times/],
    ['2026-11-07T17:00', '2026-11-07T19:00', /within the event's times/],
    ['', '2026-11-07T09:00', 'valid Central Time'],
  ])('%s to %s', (start, end, issue) => {
    const result = shiftTimesIssue(start, end, event)
    if (issue === null) expect(result).toBeNull()
    else expect(result).toMatch(issue)
  })
})

describe('byMostOpen', () => {
  it('puts the emptiest shift first and no-limit shifts last', () => {
    const shift = (startsAt: number, capacity: number | null, students: number) => ({ startsAt, endsAt: startsAt + 1, capacity, students: Array(students).fill(0) })
    expect(byMostOpen([shift(1, 4, 3), shift(2, null, 0), shift(3, 4, 0), shift(4, 2, 2)]).map(s => s.startsAt)).toEqual([3, 1, 4, 2])
  })
})

describe('nextShiftTimes', () => {
  const shift = (from: string, to: string) => ({ startsAt: at(from), endsAt: at(to) })
  it.each([
    { name: 'no shifts yet', existing: [], times: { start: '2026-11-07T08:00', end: '2026-11-07T10:00' } },
    { name: 'after the last shift, not the first', existing: [shift('08:00', '10:00'), shift('12:00', '14:00'), shift('10:00', '12:00')], times: { start: '2026-11-07T14:00', end: '2026-11-07T16:00' } },
    { name: 'shortened at the event end', existing: [shift('08:00', '17:00')], times: { start: '2026-11-07T17:00', end: '2026-11-07T18:00' } },
    { name: 'blank when shifts fill the event', existing: [shift('08:00', '18:00')], times: { start: '', end: '' } },
  ])('suggests $name', ({ existing, times }) => {
    const next = nextShiftTimes(event, existing)
    expect(next).toEqual(times)
    if (next.start) expect(overlappingShifts({ startsAt: parseChicagoInput(next.start), endsAt: parseChicagoInput(next.end) }, existing)).toEqual([])
  })
})
