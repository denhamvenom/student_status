import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { driverStepIssue, withoutFieldPrefix, EventTransport, IndependentTravel } from './Travel'

const state = vi.hoisted(() => ({ enabled: false }))
vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
  useQuery: () => ({
    transportEnabled: state.enabled, eligible: true, independentTravel: false,
    event: { travel: state.enabled ? 'Team Carpool' : 'Provide your Own', transportEnabled: state.enabled, busSeats: 0, additionalAdults: 0, trailerRequired: false },
    drivers: [], assignments: [], riders: [],
    summary: { state: state.enabled ? 'ready' : 'notApplicable', seats: 0, demand: 0, ridingStudents: 0, additionalAdults: 0, open: [] },
  }),
}))

describe('transportation controls', () => {
  it('shows the four choices and hides ride controls for own transportation', () => {
    state.enabled = false
    const html = renderToStaticMarkup(createElement(EventTransport, { id: 'synthetic-event' }))
    for (const option of ['Charter Bus', 'School Bus', 'Team Carpool', 'Provide your Own']) expect(html).toContain(`value="${option}"`)
    expect(html).toContain('Families arrange their own transportation.')
    expect(html).not.toContain('type="number"')
    expect(html).not.toContain('Assign vehicle')
    expect(renderToStaticMarkup(createElement(IndependentTravel, { id: 'synthetic-event', student: 'synthetic-student' }))).toBe('')
  })
  it('keeps team ride settings available for managed transportation', () => {
    state.enabled = true
    const html = renderToStaticMarkup(createElement(EventTransport, { id: 'synthetic-event' }))
    expect(html).toContain('type="number"')
    expect(renderToStaticMarkup(createElement(IndependentTravel, { id: 'synthetic-event', student: 'synthetic-student' }))).toContain('My student will travel on their own')
  })
})

describe('driver wizard steps', () => {
  const vehicleMessage = 'Enter the vehicle, like “Gray minivan”, so a Coach or Travel Lead can tell it apart.'
  const seatsMessage = 'Enter passenger seats as a whole number from 1 to 100. A driver who carries no students does not need to be added.'
  const ok = { name: 'Sam Driver', email: 'sam@example.org', phone: '555-0100', vehicleName: 'Gray minivan', seats: '6', approved: false, towCapable: false, active: true }
  it.each([
    [0, { name: ' ' }, 'Enter the driver’s name.'],
    [0, { email: 'sam' }, 'Enter a full email address, like name@example.org.'],
    [0, { phone: '' }, 'Enter a phone number.'],
    [0, { phone: '555-01' }, 'Enter a 10-digit phone number, with an optional leading 1.'],
    [0, { phone: 'call me' }, 'Enter a 10-digit phone number, with an optional leading 1.'],
    [0, { phone: '(555) 010-0100' }, ''],
    [1, { vehicleName: '  ' }, vehicleMessage],
    [1, { seats: '' }, seatsMessage],
    [1, { seats: '0' }, seatsMessage],
    [1, { seats: '101' }, seatsMessage],
    [1, { seats: '2.5' }, seatsMessage],
    [1, { vehicleName: 'Gray minivan', seats: '1' }, ''],
    [2, {}, ''],
  ])('step %i with %o -> %s', (step, change, expected) => {
    expect(driverStepIssue(step, { ...ok, ...change })).toBe(expected)
  })
  it('keeps an unchanged saved phone valid and drops the server field prefix', () => {
    expect(driverStepIssue(0, { ...ok, phone: 'ext 12' }, 'ext 12')).toBe('')
    expect(withoutFieldPrefix('Driver phone: enter a 10-digit phone number, with an optional leading 1.')).toBe('enter a 10-digit phone number, with an optional leading 1.')
  })
})
