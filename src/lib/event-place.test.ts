import { describe, expect, it } from 'vitest'
import { eventLocation, transportationLabel } from './event-place'

describe('on-site event wording', () => {
  it.each([
    [{ destination: 'On site', onsite: true }, 'DSHS STEM Center (on site)'],
    [{ destination: 'Calendar room 12', onsite: true }, 'DSHS STEM Center (on site)'],
    [{ destination: 'Example arena' }, 'Example arena'],
  ])('shows %o as %s', (event, shown) => expect(eventLocation(event)).toBe(shown))

  it.each([
    ['On site', 'No team ride – families drop off at DSHS STEM Center'],
    ['Provide your Own', 'Provide your Own Ride'],
    ['Charter Bus', 'Charter Bus'],
  ])('shows stored travel %s as %s', (stored, shown) => expect(transportationLabel(stored)).toBe(shown))
})
