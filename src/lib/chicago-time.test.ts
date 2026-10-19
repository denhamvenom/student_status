import { describe, expect, it } from 'vitest'
import { chicagoDisplayTime, chicagoInputTime, parseChicagoInput } from './chicago-time'

describe('Chicago event times', () => {
  it('converts ordinary local times independent of the browser timezone', () => {
    const value = '2027-05-10T09:30'
    const epoch = parseChicagoInput(value)
    expect(new Date(epoch).toISOString()).toBe('2027-05-10T14:30:00.000Z')
    expect(chicagoInputTime(epoch)).toBe(value)
    expect(chicagoDisplayTime(epoch)).toContain('CDT')
  })

  it('rejects the missing spring-forward hour', () => {
    expect(parseChicagoInput('2027-03-14T02:30')).toBeNaN()
  })

  it('uses the first occurrence of the repeated fall-back hour', () => {
    expect(new Date(parseChicagoInput('2027-11-07T01:30')).toISOString()).toBe('2027-11-07T06:30:00.000Z')
  })
})
