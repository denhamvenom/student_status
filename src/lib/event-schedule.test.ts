import { describe, expect, it } from 'vitest'
import { eventSchedule } from './event-schedule'

describe('eventSchedule', () => {
  it('shows Chicago start and end times for same-day and overnight events', () => {
    expect(eventSchedule({
      startsAt: Date.parse('2027-05-10T13:00:00Z'),
      endsAt: Date.parse('2027-05-10T16:30:00Z'),
    })).toBe('May 10, 2027, 8:00 AM CDT – 11:30 AM CDT')
    expect(eventSchedule({
      startsAt: Date.parse('2027-12-10T23:00:00Z'),
      endsAt: Date.parse('2027-12-11T08:00:00Z'),
    })).toBe('Dec 10, 2027, 5:00 PM CST – Dec 11, 2027, 2:00 AM CST')
  })

  it('uses all-day calendar dates and excludes the end date', () => {
    expect(eventSchedule({
      startsAt: Date.parse('2027-05-10T00:00:00Z'),
      endsAt: Date.parse('2027-05-11T00:00:00Z'),
      calendarAllDayStartDate: '2027-05-10',
      calendarAllDayEndDate: '2027-05-11',
    })).toBe('May 10, 2027 · All day')
    expect(eventSchedule({
      startsAt: Date.parse('2027-05-10T00:00:00Z'),
      endsAt: Date.parse('2027-05-12T00:00:00Z'),
      calendarAllDayStartDate: '2027-05-10',
      calendarAllDayEndDate: '2027-05-12',
    })).toBe('May 10, 2027 – May 11, 2027 · All day')
  })
})
