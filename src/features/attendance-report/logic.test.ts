import { describe, expect, it } from 'vitest'
import { calendarWeeks, clampMonth, dayStatus, monthLimits, statusBadges, statusWord, visibleEvents, type ReportEvent } from './logic'

const at = (iso: string) => Date.parse(iso)
const event = (overrides: Partial<ReportEvent>): ReportEvent => ({
  key: overrides.key ?? 'e', title: 'Team meeting', scheduledStart: at('2026-11-11T00:00:00Z'), scheduledEnd: at('2026-11-11T02:00:00Z'),
  kind: 'required', required: true, build: false, outreach: false, sessionState: 'closed', status: 'present', late: false, early: false,
  neutralReason: null, intervals: [], minutes: 0, adjustedByCoach: false, countsAsAttended: false, ...overrides,
})

describe('month switcher limits', () => {
  // Season starts Aug 1, 2026; today is Nov 4, 2026 in Chicago.
  const limits = monthLimits(at('2026-08-01T05:00:00Z'), at('2026-11-04T18:00:00Z'))
  it.each([
    { name: 'stays on a month inside the season', month: { year: 2026, month: 10 }, expected: { year: 2026, month: 10 } },
    { name: 'never goes before the season starts', month: { year: 2026, month: 7 }, expected: { year: 2026, month: 8 } },
    { name: 'never goes past the current month', month: { year: 2026, month: 12 }, expected: { year: 2026, month: 11 } },
  ])('$name', ({ month, expected }) => expect(clampMonth(month, limits)).toEqual(expected))

  it('uses the Chicago month for "now", not UTC', () => {
    // 8 p.m. Oct 31 in Chicago is already November in UTC.
    expect(monthLimits(null, at('2026-11-01T01:00:00Z')).last).toEqual({ year: 2026, month: 10 })
  })
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

  it('shows Required and Build meetings by default and everything with the toggle', () => {
    const events = [event({ key: 'r', kind: 'required' }), event({ key: 'b', kind: 'build' }), event({ key: 'o', kind: 'outreach' }), event({ key: 'x', kind: 'other' })]
    expect(visibleEvents(events, false).map(row => row.key)).toEqual(['r', 'b'])
    expect(visibleEvents(events, true).map(row => row.key)).toEqual(['r', 'b', 'o', 'x'])
  })
})
