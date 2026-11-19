import { describe, expect, it } from 'vitest'
import { calendarWeeks, clampMonth, DEFAULT_VIEW, dayStatus, monthLimits, statusBadges, statusWord, visibleEvents, type ReportEvent } from './logic'

const at = (iso: string) => Date.parse(iso)
const event = (overrides: Partial<ReportEvent>): ReportEvent => ({
  key: overrides.key ?? 'e', title: 'Team meeting', scheduledStart: at('2026-11-11T00:00:00Z'), scheduledEnd: at('2026-11-11T02:00:00Z'),
  kind: 'required', required: true, build: false, outreach: false, sessionState: 'closed', status: 'present', late: false, early: false,
  neutralReason: null, intervals: [], minutes: 0, adjustedByCoach: false, countsAsAttended: false, ...overrides,
})

describe('month switcher limits', () => {
  // Season starts Aug 1, 2026; today is Nov 4, 2026 in Chicago.
  const limits = monthLimits(at('2026-08-01T05:00:00Z'), null, at('2026-11-04T18:00:00Z'))
  it.each([
    { name: 'stays on a month inside the season', month: { year: 2026, month: 10 }, expected: { year: 2026, month: 10 } },
    { name: 'never goes before the season starts', month: { year: 2026, month: 7 }, expected: { year: 2026, month: 8 } },
    { name: 'never goes past the current month', month: { year: 2026, month: 12 }, expected: { year: 2026, month: 11 } },
  ])('$name', ({ month, expected }) => expect(clampMonth(month, limits)).toEqual(expected))

  it('uses the Chicago month for "now", not UTC', () => {
    // 8 p.m. Oct 31 in Chicago is already November in UTC.
    expect(monthLimits(null, null, at('2026-11-01T01:00:00Z')).last).toEqual({ year: 2026, month: 10 })
  })
})

describe('month switcher earliest month', () => {
  const now = at('2026-11-04T18:00:00Z')
  const kickoff = at('2027-01-09T18:00:00Z')
  it.each([
    { name: 'a start date set at kickoff still reaches back to the first meeting', startsAt: kickoff, activity: at('2026-09-08T23:00:00Z'), first: { year: 2026, month: 9 } },
    { name: 'no meetings yet keeps the start date, clamped to the current month', startsAt: kickoff, activity: null, first: { year: 2026, month: 11 } },
    { name: 'a meeting before the start date wins', startsAt: at('2026-08-01T05:00:00Z'), activity: at('2026-07-20T23:00:00Z'), first: { year: 2026, month: 7 } },
    { name: 'a start date before the first meeting wins', startsAt: at('2026-08-01T05:00:00Z'), activity: at('2026-09-08T23:00:00Z'), first: { year: 2026, month: 8 } },
    { name: 'a first meeting in a future month never passes the current month', startsAt: kickoff, activity: at('2026-12-15T23:00:00Z'), first: { year: 2026, month: 11 } },
    { name: 'uses the Chicago month of the first meeting', startsAt: kickoff, activity: at('2026-10-01T03:00:00Z'), first: { year: 2026, month: 9 } },
  ])('$name', ({ startsAt, activity, first }) => expect(monthLimits(startsAt, activity, now).first).toEqual(first))

  it('lets a Student go back to October when the start date is at kickoff', () => {
    const limits = monthLimits(kickoff, at('2026-09-08T23:00:00Z'), now)
    expect(clampMonth({ year: 2026, month: 10 }, limits)).toEqual({ year: 2026, month: 10 })
    expect(clampMonth({ year: 2026, month: 8 }, limits)).toEqual({ year: 2026, month: 9 })
  })

  it('ignores a missing or invalid first-activity time, as sent by a backend that is not updated yet', () => {
    const expected = { year: 2026, month: 8 }
    expect(monthLimits(at('2026-08-01T05:00:00Z'), undefined, now).first).toEqual(expected)
    expect(monthLimits(at('2026-08-01T05:00:00Z'), Number.NaN, now).first).toEqual(expected)
    expect(monthLimits(undefined, undefined, now).first).toBeNull()
  })

  it('has no earliest month while neither date is known', () => expect(monthLimits(null, null, now).first).toBeNull())
})

describe('calendar grid', () => {
  it('starts November 2026 on Sunday and puts events on their Chicago date', () => {
    const late = event({ key: 'late', scheduledStart: at('2026-11-04T05:30:00Z') }) // 11:30 p.m. Tue Nov 3 in Chicago
    const weeks = calendarWeeks({ year: 2026, month: 11 }, [late])
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]?.day).toBe(1)
    expect(weeks[0][2]).toMatchObject({ day: 3, events: [late] })
    expect(weeks[0][3]?.events).toEqual([])
    expect(weeks[4].map(cell => cell?.day ?? null)).toEqual([29, 30, null, null, null, null, null])
  })
})

describe('row and day labels', () => {
  it.each([
    { name: 'missed outranks every other status on a day', statuses: ['present', 'neutral', 'missed', 'late'], expected: 'missed' },
    { name: 'late outranks leaving early', statuses: ['early', 'late'], expected: 'late' },
    { name: 'gray only when nothing else happened', statuses: ['neutral'], expected: 'neutral' },
  ] as const)('$name', ({ statuses, expected }) => {
    expect(dayStatus(statuses.map(status => ({ status })))).toBe(expected)
  })

  it('shows both badges for late and early', () => {
    expect(statusBadges({ status: 'late', late: true, early: true })).toEqual(['late', 'early'])
    expect(statusBadges({ status: 'early', late: false, early: true })).toEqual(['early'])
  })

  it('calls a session-less calendar event Upcoming before it starts and Not held after', () => {
    const planned = { status: 'neutral' as const, neutralReason: 'notStarted' as const, scheduledStart: at('2026-11-20T00:00:00Z') }
    expect(statusWord(planned, at('2026-11-19T00:00:00Z'))).toBe('Upcoming')
    expect(statusWord(planned, at('2026-11-21T00:00:00Z'))).toBe('Not held')
  })

  it('shows every meeting by default and adds outreach events with the toggle', () => {
    const events = [event({ key: 'r', kind: 'required' }), event({ key: 'b', kind: 'build' }), event({ key: 'o', kind: 'outreach' }), event({ key: 'x', kind: 'other' })]
    expect(visibleEvents(events, false).map(row => row.key)).toEqual(['r', 'b', 'x'])
    expect(visibleEvents(events, true).map(row => row.key)).toEqual(['r', 'b', 'o', 'x'])
  })
})

describe('default view', () => {
  it('opens on the list so meeting names show', () => expect(DEFAULT_VIEW).toBe('list'))
})
