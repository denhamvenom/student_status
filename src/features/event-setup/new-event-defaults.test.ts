import { describe, expect, it } from 'vitest'
import { parseChicagoInput } from '@/lib/chicago-time'
import { calendarChoiceArg, calendarChoiceCopy, calendarOffDay, requiredDayEditHint, calendarReviewText, defaultCalendarChoice, eventTypeDefaults, initialRepeat, isLinkedCalendar, newEventStepOrder, repeatOnBasics, serverProblemStep, shownStep, stepChecks } from './new-event-defaults'

describe('New event Team Calendar choice', () => {
  it.each([
    ['Competition', false, 'create'],
    ['Outreach', false, 'create'],
    ['Fundraiser', false, 'create'],
    ['Team', false, 'create'],
    ['Competition', true, 'none'],
    ['Team', true, 'none'],
  ] as const)('%s (repeats %s) defaults to %s', (type, repeats, expected) => {
    expect(defaultCalendarChoice(type, repeats)).toBe(expected)
  })

  // Attendance reports count a Team Calendar meeting on Tuesday before kickoff, or Monday from kickoff, as Required, so a
  // one-time Team meeting on that day starts off Team Calendar (owner decision, Nov 7 2026). 2027 kickoff: Sat Jan 9, 2027.
  it.each([
    ['Tuesday before kickoff', 'Team', '2026-11-10T18:00', 2027, false, 'none', 'Tuesday'],
    ['Monday before kickoff', 'Team', '2026-11-09T18:00', 2027, false, 'create', null],
    ['Monday after kickoff', 'Team', '2027-01-11T18:00', 2027, false, 'none', 'Monday'],
    ['Tuesday after kickoff', 'Team', '2027-01-12T18:00', 2027, false, 'create', null],
    ['Wednesday', 'Team', '2026-11-11T18:00', 2027, false, 'create', null],
    ['Thursday after kickoff', 'Team', '2027-01-14T18:00', 2027, false, 'create', null],
    ['Saturday', 'Team', '2026-11-14T10:00', 2027, false, 'create', null],
    ['Tuesday, season unknown (only Tuesday counts)', 'Team', '2026-11-10T18:00', null, false, 'none', 'Tuesday'],
    ['Monday, kickoff not verified for the season', 'Team', '2031-01-13T18:00', 2031, false, 'create', null],
    ['no start yet', 'Team', '', 2027, false, 'create', null],
    ['repeating Wednesday', 'Team', '2026-11-11T18:00', 2027, true, 'none', null],
    ['Competition on a Tuesday', 'Competition', '2026-11-10T18:00', 2027, false, 'create', null],
  ] as const)('%s: %s defaults to %s', (_, type, start, year, repeats, expected, offDay) => {
    const startsAt = start ? parseChicagoInput(start) : Number.NaN
    expect(defaultCalendarChoice(type, repeats, startsAt, year)).toBe(expected)
    expect(calendarOffDay(type, startsAt, year)).toBe(offDay)
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

describe('Editing a Team meeting on Team Calendar onto a Required day (note only)', () => {
  it.each([
    ['Team on Calendar, moved to a Tuesday before kickoff', 'Team', true, '2026-11-10T18:00', 'This meeting is on Team Calendar. On a Tuesday, it will count toward student attendance.'],
    ['Team on Calendar, moved to a Monday after kickoff', 'Team', true, '2027-01-11T18:00', 'This meeting is on Team Calendar. On a Monday, it will count toward student attendance.'],
    ['Team on Calendar, on a Wednesday', 'Team', true, '2026-11-11T18:00', null],
    ['Team on Calendar, Tuesday after kickoff', 'Team', true, '2027-01-12T18:00', null],
    ['Team off Calendar, on a Tuesday', 'Team', false, '2026-11-10T18:00', null],
    ['Competition on Calendar, on a Tuesday', 'Competition', true, '2026-11-10T18:00', null],
    ['start cleared', 'Team', true, '', null],
  ] as const)('%s', (_, type, onTeamCalendar, start, note) => {
    expect(requiredDayEditHint({ type, onTeamCalendar }, start, 2027)).toBe(note)
  })

  it('explains a Required-day meeting in plain words, without "required attendance"', () => {
    expect(calendarChoiceCopy.requiredDayHint('Tuesday')).toBe('Tuesday is a regular team meeting day. Meetings on Team Calendar that day count toward student attendance, so this one starts off. Check the box to add it anyway.')
    expect(calendarChoiceCopy.requiredDayHint('Monday')).toBe('Monday is a regular team meeting day. Meetings on Team Calendar that day count toward student attendance, so this one starts off. Check the box to add it anyway.')
    expect(calendarChoiceCopy.requiredDayHint('Tuesday', 'choice')).toBe('Tuesday is a regular team meeting day. Meetings on Team Calendar that day count toward student attendance, so this one starts off. Choose “Create a separate Calendar entry” to add it anyway.')
    for (const day of ['Monday', 'Tuesday'] as const) {
      expect(calendarChoiceCopy.requiredDayHint(day)).not.toMatch(/required attendance/i)
      expect(calendarChoiceCopy.requiredDayEditHint(day)).not.toMatch(/required attendance/i)
    }
  })
})

describe('New event repeat (owner decision, Nov 7 2026: one time by default)', () => {
  const weekly = { repeats: true, intervalWeeks: 1, weekdays: [2], ends: 'onDate', endDate: '2027-05-31', count: 10 } as const
  it('starts one time for every role, and keeps a repeating meeting handed over by the Team meeting sheet', () => {
    expect(initialRepeat(null).repeats).toBe(false)
    expect(initialRepeat(undefined).repeats).toBe(false)
    expect(initialRepeat({ ...weekly, weekdays: [2] })).toMatchObject({ repeats: true, weekdays: [2] })
  })
  it.each([['Team', true], ['Competition', false], ['Outreach', false], ['Fundraiser', false]] as const)('%s asks "One time or repeating?" on Basics: %s', (type, onBasics) => {
    expect(repeatOnBasics(type)).toBe(onBasics)
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
