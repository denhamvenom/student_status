import { describe, expect, it } from 'vitest'
import { attendedOfHeld, breakdownView, buildTotalLine, dayTypeLine, shortHours, sessionRowView, type Breakdown, type SessionRow } from './logic'

const KICKOFF = Date.parse('2027-01-09T12:00:00Z')
const base: Breakdown = { state: 'ready', kickoffAt: KICKOFF, required: { attended: 3, held: 4 }, other: { attended: 1, held: 2 }, outreach: { attended: 0, held: 0 }, buildHours: { minutes: 90, targetHours: 30, weekday: { attended: 1, held: 2, minutes: 60 }, weekend: { attended: 1, held: 1, minutes: 30 } } }

describe('breakdownView', () => {
  it.each([
    ['before kickoff', KICKOFF - 1, false, 0],
    ['at kickoff', KICKOFF, true, 0.05],
    ['unknown kickoff', KICKOFF, false, 0],
  ])('build %s', (name, now, started, fraction) => {
    const view = breakdownView(name === 'unknown kickoff' ? { ...base, kickoffAt: null } : base, now)
    expect(view.build.started).toBe(started)
    expect(view.build.fraction).toBeCloseTo(fraction)
  })

  it.each([
    [{ attended: 3, held: 4 }, 75],
    [{ attended: 0, held: 0 }, null],
    [{ attended: 5, held: 4 }, 100],
  ])('required percent for %j is %s', (required, percent) => {
    expect(breakdownView({ ...base, required }, KICKOFF).required.percent).toBe(percent)
  })
})

describe('sessionRowView', () => {
  const row = (over: Partial<SessionRow>): SessionRow => ({ sessionId: 's1', scheduledStart: Date.parse('2026-10-20T23:00:00Z'), title: 'Tuesday meeting', status: 'attended', ...over })
  it.each([
    ['titled', row({}), 'required', 'Tuesday meeting', 'Attended', null],
    ['blank title', row({ title: '  ' }), 'outreach', 'Outreach event', 'Attended', null],
    ['no title other', row({ title: null, status: 'missed' }), 'other', 'Meeting', 'Missed', null],
    ['build minutes', row({ title: null, minutes: 125 }), 'build', 'Build meeting', 'Attended', '125 minutes'],
    ['build one minute', row({ minutes: 1 }), 'build', 'Tuesday meeting', 'Attended', '1 minute'],
    ['missed build', row({ status: 'missed', minutes: 0 }), 'build', 'Tuesday meeting', 'Missed', null],
  ] as const)('%s', (_name, input, kind, title, status, minutes) => {
    const view = sessionRowView(input, kind)
    expect([view.title, view.status, view.minutes]).toEqual([title, status, minutes])
    expect(view.date).toBe('Tue, Oct 20')
  })
})

describe('buildTotalLine', () => {
  it.each([
    [125, 3, '2 hours 5 minutes from 3 days'],
    [61, 1, '1 hour 1 minute from 1 day'],
    [0, 0, '0 hours 0 minutes from 0 days'],
    [90, null, '1 hour 30 minutes'],
  ])('%s minutes, %s days', (minutes, days, line) => {
    expect(buildTotalLine(minutes, days)).toBe(line)
  })
})

describe('Build day types', () => {
  it.each([
    [{ attended: 3, held: 4, minutes: 125 }, '3 of 4 days · 2 hours 5 minutes'],
    [{ attended: 1, held: 1, minutes: 60 }, '1 of 1 day · 1 hour 0 minutes'],
    [{ attended: 0, held: 0, minutes: 0 }, '0 of 0 days · 0 hours 0 minutes'],
  ])('dayTypeLine %j', (day, line) => expect(dayTypeLine(day)).toBe(line))

  it.each([
    [3, 4, '3 / 4'],
    [0, 0, '—'],
  ])('attendedOfHeld %s of %s', (a, h, text) => expect(attendedOfHeld(a, h)).toBe(text))

  it.each([
    [125, '2h 5m'],
    [0, '0h 0m'],
    [59.9, '0h 59m'],
  ])('shortHours %s', (m, text) => expect(shortHours(m)).toBe(text))

  it('keeps weekday and weekend beside the total', () => {
    const { build } = breakdownView(base, KICKOFF)
    expect(build.weekday.minutes + build.weekend.minutes).toBe(base.buildHours.minutes)
  })

  it.each([
    ['weekend', 'Weekend'],
    ['weekday', 'Weekday'],
  ] as const)('row tagged %s', (dayType, tag) => {
    expect(sessionRowView({ sessionId: 's', scheduledStart: 0, title: null, status: 'missed', dayType }, 'build').dayType).toBe(tag)
  })
})
