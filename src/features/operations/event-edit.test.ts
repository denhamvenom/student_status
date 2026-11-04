import { describe, expect, it } from 'vitest'
import { chicagoInputTime } from '@/lib/chicago-time'
import { draftFrom, eventEditBlocker, eventEditValues, type EditableEvent } from './event-edit'

const start = Date.UTC(2026, 10, 10, 23, 0) // Tuesday 5:00 PM Central
const event: EditableEvent = { _id: 'e1', name: 'Build meeting', destination: 'Room 12', startsAt: start, endsAt: start + 2 * 3600_000 }

describe('eventEditBlocker', () => {
  it.each([
    { name: 'Coach can change a required whole-team series', isCoach: true, change: { seriesId: 's1', audienceKind: 'everyone', mandatory: true }, blocker: null },
    { name: 'Travel Lead can change an optional event', isCoach: false, change: { audienceKind: 'everyone', mandatory: false }, blocker: null },
    { name: 'Travel Lead blocked on a required subteam meeting', isCoach: false, change: { seriesId: 's1', audienceKind: 'subteams', mandatory: true }, blocker: 'Only the Coach can change required group meetings.' },
    { name: 'Travel Lead blocked on a single required whole-team meeting', isCoach: false, change: { audienceKind: 'everyone', mandatory: true }, blocker: 'Only the Coach can change required group meetings.' },
    { name: 'Travel Lead blocked on a Travel Team event', isCoach: false, change: { assignmentScope: 'travelTeam' }, blocker: 'Only the Coach can change this event' },
  ])('$name', ({ isCoach, change, blocker }) => {
    expect(eventEditBlocker(isCoach, { ...event, ...change })).toBe(blocker)
  })
})

describe('eventEditValues', () => {
  const draft = draftFrom(event)
  it('sends only what changed', () => {
    expect(eventEditValues(event, { ...draft, name: ' Build night ', end: chicagoInputTime(start + 3 * 3600_000) })).toEqual({ values: { name: 'Build night', endsAt: start + 3 * 3600_000 } })
  })
  it('sends Media Support only when it changed (Edit event is the one place to change it)', () => {
    expect(eventEditValues(event, { ...draft, media: true })).toEqual({ values: { mediaSupportRequested: true } })
    expect(eventEditValues({ ...event, mediaSupportRequested: true }, draftFrom({ ...event, mediaSupportRequested: true }))).toEqual({ error: 'Nothing has changed yet.' })
  })
  it('never sends a place for an event at our shop or online', () => {
    expect(eventEditValues({ ...event, onsite: true }, { ...draft, destination: 'Elsewhere' })).toEqual({ error: 'Nothing has changed yet.' })
    expect(eventEditValues({ ...event, locationType: 'virtual' }, { ...draft, destination: 'Elsewhere', name: 'Online' })).toEqual({ values: { name: 'Online' } })
  })
  it.each([
    { name: 'blank name', change: { name: ' ' } },
    { name: 'end before start', change: { end: chicagoInputTime(start - 3600_000) } },
    { name: 'unreadable start', change: { start: '20261-11-10T17:00' } },
  ])('rejects $name', ({ change }) => {
    expect(eventEditValues(event, { ...draft, ...change })).toHaveProperty('error')
  })
})
