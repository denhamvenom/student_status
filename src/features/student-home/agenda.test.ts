import { describe, expect, it } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'
import { agendaLine, formatWhen, nextUp, thisWeek, toAgendaEvents, type AgendaEvent, type ListedEventRow } from './agenda'
import { at } from './fixtures'

const id = (key: string) => key as Id<'events'>
const row = (key: string, start: string, end: string, extra: Partial<ListedEventRow['event']> = {}, participation: string | null = null): ListedEventRow => ({
  event: { _id: id(key), name: key, startsAt: at(start), endsAt: at(end), destination: 'Baton Rouge', feeCents: 0, signupMode: 'open', ...extra },
  participation,
})
const event = (key: string, start: string, end: string, extra: Partial<AgendaEvent> = {}): AgendaEvent => ({ eventId: id(key), name: key, startsAt: at(start), endsAt: at(end), place: 'Baton Rouge', feeCents: 0, required: false, status: null, ...extra })

describe('Home agenda events', () => {
  it('drops canceled, archived and mentors-only events, maps place, status and Required', () => {
    const events = toAgendaEvents([
      row('later', '2026-11-05T18:00', '2026-11-05T20:00', { locationType: 'virtual' }, 'withdrawn'),
      row('meeting', '2026-11-03T18:00', '2026-11-03T20:00', { onsite: true, audienceKind: 'everyone', mandatory: true }, 'confirmed'),
      row('canceled', '2026-11-04T18:00', '2026-11-04T20:00', { cancelled: true }),
      row('mentors', '2026-11-04T18:00', '2026-11-04T20:00', { audienceKind: 'mentorsOnly' }),
      row('travel', '2026-11-06T08:00', '2026-11-06T17:00', { signupMode: 'assigned', assignmentScope: 'travelTeam', feeCents: 8500 }, 'pending'),
    ])
    expect(events.map(e => [e.name, e.place, e.required, e.status])).toEqual([
      ['meeting', 'DSHS STEM Center (on site)', true, 'confirmed'],
      ['later', 'Virtual (Discord)', false, null],
      ['travel', 'Baton Rouge', true, 'pending'],
    ])
    expect(toAgendaEvents(undefined)).toEqual([])
  })

  it.each([
    { name: 'skips optional events the Student is not on', now: '2026-11-03T12:00', expected: 'meeting' },
    { name: 'keeps an event that has started until it ends', now: '2026-11-04T19:00', expected: 'meeting2' },
    { name: 'returns null when nothing is ahead', now: '2026-12-01T12:00', expected: null },
  ])('Next up $name', ({ now, expected }) => {
    const events = [
      event('optional', '2026-11-03T15:00', '2026-11-03T16:00'),
      event('meeting', '2026-11-03T18:00', '2026-11-03T20:00', { required: true }),
      event('meeting2', '2026-11-04T18:00', '2026-11-04T20:00', { status: 'waitlist' }),
    ]
    expect(nextUp(events, at(now))?.name ?? null).toBe(expected)
  })

  it('This week lists at most five events in the next seven days, leaving out Next up', () => {
    const days = ['03', '04', '05', '06', '07', '08', '09', '10', '11']
    const events = days.map(day => event(`d${day}`, `2026-11-${day}T18:00`, `2026-11-${day}T20:00`))
    expect(thisWeek(events, at('2026-11-03T12:00'), id('d03')).map(e => e.name)).toEqual(['d04', 'd05', 'd06', 'd07', 'd08'])
    expect(thisWeek(events.slice(0, 3), at('2026-11-05T12:00')).map(e => e.name)).toEqual(['d05'])
  })

  it.each([
    ['2026-11-03T18:00', '2026-11-03T20:00', 'Tue Nov 3, 6–8 PM'],
    ['2026-11-07T11:00', '2026-11-07T13:30', 'Sat Nov 7, 11 AM–1:30 PM'],
    ['2026-11-03T18:00', '2026-11-03T18:00', 'Tue Nov 3, 6 PM'],
    ['2026-11-21T08:00', '2026-11-23T17:00', 'Nov 21–23'],
  ])('formats %s to %s as %s', (start, end, expected) => {
    expect(formatWhen(at(start), at(end))).toBe(expected)
  })

  it('writes the one-line summary with place, cost and status', () => {
    expect(agendaLine(event('m', '2026-11-03T18:00', '2026-11-03T20:00', { place: 'DSHS STEM Center (on site)', status: 'confirmed' }))).toBe('Tue Nov 3, 6–8 PM · DSHS STEM Center (on site) · Free · Signed up')
    expect(agendaLine(event('r', '2026-11-03T18:00', '2026-11-03T20:00', { place: 'Virtual (Discord)', feeCents: 8500 }))).toBe('Tue Nov 3, 6–8 PM · Virtual (Discord) · $85')
  })
})
