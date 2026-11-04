import { describe, expect, it } from 'vitest'
import { defaultRepeat, MAX_SERIES_MEETINGS, parseDay, repeatIssue, repeatPreview, repeatSummary, seriesDates } from './repeat'
import type { RepeatValue, Weekday } from './types'

// 2026-11-03 is a Tuesday. Daylight saving ends in Central Time on Sunday 2026-11-01.
const rule = (change: Partial<RepeatValue> = {}): RepeatValue => ({ repeats: true, intervalWeeks: 1, weekdays: [2], ends: 'afterCount', endDate: '', count: 5, ...change })
const tueThu: Weekday[] = [2, 4]
const everyDay: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

describe('seriesDates', () => {
  it.each([
    { name: 'weekly on Tuesday and Thursday', start: '2026-11-03', change: { weekdays: tueThu }, dates: ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-17'] },
    { name: 'every 2 weeks', start: '2026-11-03', change: { intervalWeeks: 2, count: 3 }, dates: ['2026-11-03', '2026-11-17', '2026-12-01'] },
    { name: 'a mid-week start skips earlier days and counts weeks from the start week', start: '2026-11-04', change: { intervalWeeks: 2, weekdays: tueThu, count: 3 }, dates: ['2026-11-05', '2026-11-17', '2026-11-19'] },
    { name: 'an end date is the last possible meeting', start: '2026-11-03', change: { weekdays: tueThu, ends: 'onDate' as const, endDate: '2026-11-12', count: 0 }, dates: ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12'] },
    { name: 'the daylight saving weekend keeps calendar days', start: '2026-10-31', change: { weekdays: [0, 6] as Weekday[], count: 3 }, dates: ['2026-10-31', '2026-11-01', '2026-11-07'] },
    { name: 'the new year', start: '2026-12-29', change: { count: 2 }, dates: ['2026-12-29', '2027-01-05'] },
    { name: 'weekday order does not matter', start: '2026-11-03', change: { weekdays: [4, 2, 2] as Weekday[], count: 3 }, dates: ['2026-11-03', '2026-11-05', '2026-11-10'] },
    { name: 'a one-off event', start: '2026-11-03', change: { repeats: false }, dates: ['2026-11-03'] },
    { name: 'a missing first date', start: '', change: {}, dates: [] },
    { name: 'no days chosen', start: '2026-11-03', change: { weekdays: [] }, dates: [] },
  ])('$name', ({ start, change, dates }) => {
    expect(seriesDates(start, rule(change))).toEqual(dates)
  })

  it('previews the next 5 and caps a runaway series at the meeting limit', () => {
    expect(repeatPreview('2026-11-03', rule({ weekdays: tueThu, count: 12 }))).toEqual({ next: ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-17'], total: 12, capped: false })
    const long = repeatPreview('2026-11-03', rule({ weekdays: everyDay, ends: 'onDate', endDate: '2027-11-03' }))
    expect([long.total, long.capped]).toEqual([MAX_SERIES_MEETINGS, true])
  })
})

describe('repeatIssue', () => {
  it.each([
    { name: 'a one-off event', start: '', change: { repeats: false, weekdays: [] }, field: null },
    { name: 'a ready weekly rule', start: '2026-11-03', change: {}, field: null },
    { name: 'a ready end date', start: '2026-11-03', change: { ends: 'onDate' as const, endDate: '2027-05-01' }, field: null },
    { name: 'no first date', start: '', change: {}, field: 'start' },
    { name: 'every 0 weeks', start: '2026-11-03', change: { intervalWeeks: 0 }, field: 'interval' },
    { name: 'every 9 weeks', start: '2026-11-03', change: { intervalWeeks: 9 }, field: 'interval' },
    { name: 'no days', start: '2026-11-03', change: { weekdays: [] }, field: 'days' },
    { name: 'a blank end date', start: '2026-11-03', change: { ends: 'onDate' as const }, field: 'end-date' },
    { name: 'an impossible end date', start: '2026-11-03', change: { ends: 'onDate' as const, endDate: '2027-02-30' }, field: 'end-date' },
    { name: 'an end before the start', start: '2026-11-03', change: { ends: 'onDate' as const, endDate: '2026-11-02' }, field: 'end-date' },
    { name: 'an end more than a year out', start: '2026-11-03', change: { ends: 'onDate' as const, endDate: '2027-11-05' }, field: 'end-date' },
    { name: '0 meetings', start: '2026-11-03', change: { count: 0 }, field: 'count' },
    { name: 'a fractional count', start: '2026-11-03', change: { count: 2.5 }, field: 'count' },
    { name: 'more meetings than allowed', start: '2026-11-03', change: { count: MAX_SERIES_MEETINGS + 1 }, field: 'count' },
    { name: 'an end date before the first chosen day', start: '2026-11-03', change: { weekdays: [3] as Weekday[], ends: 'onDate' as const, endDate: '2026-11-03' }, field: 'days' },
    { name: 'every day for a year', start: '2026-11-03', change: { weekdays: everyDay, ends: 'onDate' as const, endDate: '2027-11-03' }, field: 'end-date' },
  ])('$name → $field', ({ start, change, field }) => {
    expect(repeatIssue(start, rule(change))?.field ?? null).toBe(field)
  })
})

describe('dates', () => {
  it.each([
    { value: '2028-02-29', valid: true },
    { value: '2026-02-29', valid: false },
    { value: '2026-11-3', valid: false },
    { value: '2026-11-03T18:00', valid: false },
  ])('parseDay($value)', ({ value, valid }) => {
    expect(parseDay(value) !== null).toBe(valid)
  })

  it('starts a new repeat on the first date’s weekday', () => {
    expect(defaultRepeat('2026-11-05')).toMatchObject({ repeats: false, intervalWeeks: 1, weekdays: [4] })
    expect(defaultRepeat('').weekdays).toEqual([])
  })
})

describe('repeatSummary', () => {
  it.each([
    { weeks: 1, days: [2], text: 'Repeats every week on Tuesday' },
    { weeks: 2, days: [4, 2], text: 'Repeats every 2 weeks on Tuesday and Thursday' },
    { weeks: 3, days: [5, 1, 3], text: 'Repeats every 3 weeks on Monday, Wednesday and Friday' },
  ])('$text', ({ weeks, days, text }) => {
    expect(repeatSummary({ intervalWeeks: weeks, weekdays: days as Weekday[] })).toBe(text)
  })
})
