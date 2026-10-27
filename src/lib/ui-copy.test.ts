import { describe, expect, it } from 'vitest'
import { familyParticipationLabel, statusLabel } from './ui-copy'

describe('signup status by audience', () => {
  it.each([
    { value: 'confirmed', family: 'Signed up', staff: 'Confirmed' },
    { value: 'pending', family: 'Waiting for approval', staff: 'Pending approval' },
    { value: 'waitlist', family: 'Waitlisted', staff: 'Waitlist' },
    { value: 'withdrawn', family: 'Withdrawn', staff: 'Withdrawn' },
    { value: null, family: 'Not signed up', staff: 'Not signed up' },
  ])('$value: Students and Parents see "$family", staff keep "$staff"', ({ value, family, staff }) => {
    expect(familyParticipationLabel(value)).toBe(family)
    expect(statusLabel(value)).toBe(staff)
  })
})
