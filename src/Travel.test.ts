import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { driverStepIssue, EventTransport, IndependentTravel } from './Travel'

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
  const ok = { name: 'Sam Driver', email: 'sam@example.org', phone: '555-0100', vehicleName: '', seats: '6', approved: false, towCapable: false, active: true }
  it.each([
    [0, { name: ' ' }, 'Enter the driver’s name.'],
    [0, { email: 'sam' }, 'Enter a full email address, like name@example.org.'],
    [0, { phone: '' }, 'Enter a phone number.'],
    [1, { seats: '' }, 'Enter passenger seats as a whole number from 0 to 100.'],
    [1, { seats: '101' }, 'Enter passenger seats as a whole number from 0 to 100.'],
    [1, { seats: '2.5' }, 'Enter passenger seats as a whole number from 0 to 100.'],
    [1, { seats: '0' }, ''],
    [2, {}, ''],
  ])('step %i with %o -> %s', (step, change, expected) => {
    expect(driverStepIssue(step, { ...ok, ...change })).toBe(expected)
  })
})
