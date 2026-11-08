import { describe, expect, it } from 'vitest'
import { chicagoDateString, chicagoMidnight, endOfChicagoDay, TEAM_TIME_ZONE, zonedWallTimeToUtc } from '../../shared/chicago-time'

const iso = (ms: number) => new Date(ms).toISOString()

describe('shared Chicago time', () => {
  it('names the team zone', () => expect(TEAM_TIME_ZONE).toBe('America/Chicago'))

  it.each([
    ['normal CST day', '2027-01-15', '08:30', '2027-01-15T14:30:00.000Z'],
    ['normal CDT day', '2027-05-10', '09:30', '2027-05-10T14:30:00.000Z'],
    ['spring-forward gap moves ahead by the gap', '2027-03-14', '02:30', '2027-03-14T08:30:00.000Z'],
    ['just before the gap', '2027-03-14', '01:59', '2027-03-14T07:59:00.000Z'],
    ['fall-back overlap takes the earlier (daylight) instant', '2027-11-07', '01:30', '2027-11-07T06:30:00.000Z'],
    ['seconds are honored', '2027-05-10', '09:30:15', '2027-05-10T14:30:15.000Z'],
  ])('wall time → instant: %s', (_name, date, time, expected) => expect(iso(zonedWallTimeToUtc(date, time))).toBe(expected))

  it.each([
    ['normal day', '2027-01-15', '2027-01-15T06:00:00.000Z'],
    ['day the clocks spring forward (still CST at midnight)', '2027-03-14', '2027-03-14T06:00:00.000Z'],
    ['day after spring forward (CDT)', '2027-03-15', '2027-03-15T05:00:00.000Z'],
    ['day the clocks fall back (still CDT at midnight)', '2027-11-07', '2027-11-07T05:00:00.000Z'],
    ['day after fall back (CST)', '2027-11-08', '2027-11-08T06:00:00.000Z'],
  ])('midnight: %s', (_name, date, expected) => expect(iso(chicagoMidnight(date))).toBe(expected))

  it.each([
    ['normal day', '2027-01-15', '2027-01-16T05:59:59.999Z'],
    ['spring-forward day is 23 hours long', '2027-03-14', '2027-03-15T04:59:59.999Z'],
    ['fall-back day is 25 hours long', '2027-11-07', '2027-11-08T05:59:59.999Z'],
  ])('end of day: %s', (_name, date, expected) => expect(iso(endOfChicagoDay(date))).toBe(expected))

  it.each([
    ['not a date', 'soon'], ['empty', ''], ['impossible day', '2027-02-30'], ['unpadded', '2027-1-5'], ['with time', '2027-01-15T10:00'],
  ])('end of day rejects invalid input: %s', (_name, value) => expect(endOfChicagoDay(value)).toBeNaN())

  it.each([
    ['last second of the previous Chicago day', '2027-03-14T05:59:59.000Z', '2027-03-13'],
    ['first instant of the Chicago day', '2027-03-14T06:00:00.000Z', '2027-03-14'],
    ['evening UTC is still the same Chicago day', '2027-07-04T04:59:59.999Z', '2027-07-03'],
    ['after fall-back', '2027-11-07T05:59:59.000Z', '2027-11-07'],
  ])('instant → Chicago date: %s', (_name, instant, expected) => expect(chicagoDateString(Date.parse(instant))).toBe(expected))

  it('rejects an invalid instant', () => expect(() => chicagoDateString(Number.NaN)).toThrow(RangeError))

  it('midnight and date string agree for a whole year', () => {
    for (let day = 0; day < 366; day++) {
      const date = new Date(Date.UTC(2027, 0, 1 + day)).toISOString().slice(0, 10)
      const midnight = chicagoMidnight(date)
      expect(chicagoDateString(midnight)).toBe(date)
      expect(chicagoDateString(midnight - 1)).not.toBe(date)
    }
  })
})
