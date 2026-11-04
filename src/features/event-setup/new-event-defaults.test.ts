import { describe, expect, it } from 'vitest'
import { calendarChoiceArg, calendarReviewText, defaultCalendarChoice, eventTypeDefaults, isLinkedCalendar, newEventStepOrder, serverProblemStep, shownStep, stepChecks } from './new-event-defaults'

describe('New event Team Calendar choice', () => {
  it.each([
    ['Competition', false, 'create'],
    ['Outreach', false, 'create'],
    ['Fundraiser', false, 'create'],
    ['Team', false, 'none'],
    ['Competition', true, 'none'],
    ['Team', true, 'none'],
  ] as const)('%s (repeats %s) defaults to %s', (type, repeats, expected) => {
    expect(defaultCalendarChoice(type, repeats)).toBe(expected)
  })

  it.each([
    ['create', { kind: 'create' }, 'Create a separate entry', false],
    ['none', { kind: 'none' }, 'Not added to Team Calendar', false],
    ['google-123', { kind: 'link', eventId: 'google-123' }, 'Connect to existing entry', true],
  ] as const)('%s is sent and reviewed correctly', (choice, arg, review, linked) => {
    expect(calendarChoiceArg(choice)).toEqual(arg)
    expect(calendarReviewText(choice)).toBe(review)
    expect(isLinkedCalendar(choice)).toBe(linked)
  })
})

describe('eventTypeDefaults', () => {
  it('starts Team meetings at the shop for Everyone with no forms ticked', () => {
    expect(eventTypeDefaults('Team', true)).toEqual({ onsite: true, travelTeam: false, permission: false, first: false })
  })
  it('keeps Travel Team and both forms for a Coach competition, but not Travel Team for a Travel Lead', () => {
    expect(eventTypeDefaults('Competition', true)).toEqual({ onsite: false, travelTeam: true, permission: true, first: true })
    expect(eventTypeDefaults('Outreach', false).travelTeam).toBe(false)
  })
})

describe('serverProblemStep', () => {
  it.each([
    ['Choose a Calendar entry from the list, then try again.', 0, 'event-calendar'],
    ['Calendar updates are turned off in this copy of Venom Status. Create the series without Team Calendar.', 0, 'event-calendar'],
    ['Start the series today or later.', 0, 'event-start'],
    ['Check the event: it needs a name, an end after the start, a fee of $0 or more, and a capacity of at least 1 if set.', 0, 'event-name'],
    ["On-site events have no rooms, so they can't have a room deadline. Clear the room deadline.", 0, 'event-onsite'],
    ['Required subteam events include every matching student. Leave capacity blank.', 1, 'event-capacity'],
    ['Choose Mentors from the list. One of them is no longer available.', 1, 'event-who'],
    ['Each requirement needs its own short name, and pay, perm, first and room are reserved. Change the short name.', 8, 'event-requirements'],
  ])('%s', (message, step, field) => {
    expect(serverProblemStep(message)).toEqual({ step, field })
  })
  it('leaves unrelated failures on Review', () => {
    expect(serverProblemStep('Only a Coach or Travel Lead can create events.')).toBeNull()
  })
})

describe('newEventStepOrder', () => {
  it.each([
    [{ shifts: false, noTravel: false, team: false, extras: false }, [0, 1, 2, 9, 4, 5]],
    [{ shifts: false, noTravel: true, team: false, extras: false }, [0, 1, 2, 9, 5]],
    [{ shifts: true, noTravel: true, team: false, extras: false }, [0, 1, 6, 2, 9, 5]],
    // A Team meeting at our shop is Basics, Who's going, Review; Extras joins only when asked for.
    [{ shifts: false, noTravel: true, team: true, extras: false }, [0, 1, 5]],
    [{ shifts: false, noTravel: true, team: true, extras: true }, [0, 1, 9, 5]],
    [{ shifts: false, noTravel: false, team: true, extras: false }, [0, 1, 4, 5]],
  ])('%o', (choices, order) => {
    expect(newEventStepOrder(choices)).toEqual(order)
  })
})

describe('Extras step', () => {
  it.each([
    [3, false, 9], [7, false, 9], [8, true, 9], [2, false, 2], [2, true, 9], [1, true, 1],
  ])('a problem on step %i (Team %s) is shown on step %i', (step, team, shown) => {
    expect(shownStep(step, team)).toBe(shown)
  })
  it('checks every step it holds, with the fee only for a Team meeting', () => {
    expect(stepChecks(9, false)).toEqual([3, 7, 8])
    expect(stepChecks(9, true)).toEqual([3, 7, 8, 2])
    expect(stepChecks(4, true)).toEqual([4])
  })
})
