import { describe, expect, it } from 'vitest'
import type { WhatsLeftItem } from '../student-home/contract'
import type { ParentHomeSummary } from './contract'
import type { Id } from '../../../convex/_generated/dataModel'
import type { AgendaEvent } from '../student-home/agenda'
import { at } from '../student-home/fixtures'
import { formsSummary, groupWork, paidPercent, parentAllSet, parentItemAction, parentItemHref, parentNext, parentWeek, roomStatusLines, upcomingEvent, type ParentRoomStatus } from './logic'

const item = (owner: WhatsLeftItem['owner'], kind: WhatsLeftItem['kind'] = 'requirement'): WhatsLeftItem => ({ key: `${owner}:${kind}`, owner, kind, eventId: null, eventName: null, label: null, dueAt: null, href: null })

describe('Parent Home decisions', () => {
  it.each([
    { owners: [] as WhatsLeftItem['owner'][], counts: [0, 0, 0], allSet: true },
    { owners: ['student', 'coach'] as WhatsLeftItem['owner'][], counts: [0, 1, 1], allSet: true },
    { owners: ['parent', 'student', 'parent'] as WhatsLeftItem['owner'][], counts: [2, 1, 0], allSet: false },
  ])('groups $owners for the right person', ({ owners, counts, allSet }) => {
    const work = owners.map(owner => item(owner))
    const groups = groupWork(work)
    expect([groups.parent.length, groups.student.length, groups.coach.length]).toEqual(counts)
    expect(parentAllSet(work)).toBe(allSet)
  })

  it.each([[0, 0, 0], [0, 500, 0], [10000, 2500, 25], [10000, 12000, 100], [10000, -100, 0]])('calculates a bounded paid ring for %i cents charged and %i paid', (charged, paid, percent) => {
    expect(paidPercent(charged, paid)).toBe(percent)
  })

  it('hides a past event while keeping a current event', () => {
    const summary = { nextEvent: { startsAt: 100 } } as ParentHomeSummary
    expect(upcomingEvent(summary, 101)).toBeNull()
    expect(upcomingEvent(summary, 100)).toBe(summary.nextEvent)
    expect(upcomingEvent({ ...summary, nextEvent: null }, 100)).toBeNull()
  })

  it.each([
    ['healthProfile', '/setup?edit=1&step=health&student=student-1', 'Fill in Health information'],
    ['firstRegistration', '/setup?edit=1&step=first&student=student-1', 'Start FIRST registration'],
    ['permissionForm', '/forms', 'Sign permission form'],
    ['requiredPayment', '/finances', 'Review balance due'],
    ['requirement', null, null],
  ] as const)('routes %s to its action', (kind, href, action) => {
    expect(parentItemHref(item('parent', kind), 'student-1')).toBe(href)
    expect(parentItemAction(item('parent', kind))).toBe(action)
  })

  it('fills the Next line from the event list and keeps the summary status', () => {
    const eventId = 'regional' as Id<'events'>
    const summary: ParentHomeSummary = { studentId: 's' as Id<'students'>, whatsLeft: [], nextEvent: { eventId, name: 'Regional', startsAt: at('2026-11-03T18:00'), location: 'Kansas City', status: 'confirmed' } }
    const listed: AgendaEvent = { eventId, name: 'Regional', startsAt: at('2026-11-03T18:00'), endsAt: at('2026-11-03T20:00'), place: 'DSHS STEM Center (on site)', feeCents: 0, required: false, status: null }
    const other: AgendaEvent = { ...listed, eventId: 'meeting' as Id<'events'>, name: 'Meeting', startsAt: at('2026-11-05T18:00'), endsAt: at('2026-11-05T20:00') }
    const now = at('2026-11-02T12:00')
    const next = parentNext(summary, [listed, other], now)
    expect(next).toMatchObject({ line: 'Tue Nov 3, 6–8 PM · DSHS STEM Center (on site) · Free · Signed up', required: false })
    expect(parentWeek([listed, other], next, now).map(event => event.name)).toEqual(['Meeting'])
    // Not in the event list (still loading or failed): the summary's own place and status, no Required/Optional.
    expect(parentNext(summary, [], now)).toMatchObject({ line: 'Tue Nov 3, 6 PM · Kansas City · Signed up', required: null })
  })

  it('makes a required meeting under way today Next, so Next and This week agree', () => {
    const eventId = 'plant-sale' as Id<'events'>
    const summary: ParentHomeSummary = { studentId: 's' as Id<'students'>, whatsLeft: [], nextEvent: { eventId, name: 'Plant Sale', startsAt: at('2026-11-11T16:00'), location: 'Campus', status: 'confirmed' } }
    const sale: AgendaEvent = { eventId, name: 'Plant Sale', startsAt: at('2026-11-11T16:00'), endsAt: at('2026-11-11T18:00'), place: 'Campus', feeCents: 500, required: false, status: null }
    const meeting: AgendaEvent = { ...sale, eventId: 'meeting' as Id<'events'>, name: 'Team Meeting', startsAt: at('2026-11-09T16:00'), endsAt: at('2026-11-09T19:00'), feeCents: 0, required: true }
    const optional: AgendaEvent = { ...meeting, eventId: 'extra' as Id<'events'>, name: 'Open Shop', required: false }
    const now = at('2026-11-09T17:00')
    const next = parentNext(summary, [optional, meeting, sale], now)
    expect(next?.name).toBe('Team Meeting')
    expect(next?.line).not.toContain('Signed up')
    // This week never repeats Next; the optional event stays a plain "also" row with its Optional badge.
    expect(parentWeek([optional, meeting, sale], next, now).map(event => event.name)).toEqual(['Open Shop', 'Plant Sale'])
    // Once the meeting is over, the Student's signup is Next.
    expect(parentNext(summary, [optional, meeting, sale], at('2026-11-09T20:00'))).toMatchObject({ name: 'Plant Sale', line: expect.stringContaining('Signed up') })
  })

  it('lists the same week as Events: through Sunday, Central Time, with no row limit', () => {
    const base: AgendaEvent = { eventId: 'x' as Id<'events'>, name: 'x', startsAt: 0, endsAt: 0, place: 'Campus', feeCents: 0, required: false, status: null }
    const make = (id: string, start: string, end: string): AgendaEvent => ({ ...base, eventId: id as Id<'events'>, name: id, startsAt: at(start), endsAt: at(end) })
    const now = at('2026-11-10T12:00') // Tuesday
    const events = [
      make('Over', '2026-11-10T08:00', '2026-11-10T09:00'),
      make('Wed', '2026-11-11T18:00', '2026-11-11T19:00'),
      make('Thu', '2026-11-12T18:00', '2026-11-12T19:00'),
      make('Fri', '2026-11-13T18:00', '2026-11-13T19:00'),
      make('Sat', '2026-11-14T10:00', '2026-11-14T12:00'),
      make('Spaghetti Dinner', '2026-11-15T17:00', '2026-11-15T19:00'),
      make('Monday', '2026-11-16T18:00', '2026-11-16T19:00'),
    ]
    expect(parentWeek(events, null, now).map(event => event.name)).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Spaghetti Dinner'])
    expect(parentWeek(events, null, now)).toHaveLength(5)
    expect(parentWeek(events, { eventId: 'Wed' as Id<'events'>, name: 'Wed', line: '', required: null }, at('2026-11-11T08:00')).map(event => event.name)).toEqual(['Thu', 'Fri', 'Sat', 'Spaghetti Dinner'])
  })

  it('does not count FIRST registration as a Parent action while the invitation link is missing', () => {
    const work = [item('parent', 'firstRegistration'), item('parent', 'healthProfile')]
    expect(groupWork(work, { firstLinkReady: false }).parent.map(row => row.kind)).toEqual(['healthProfile'])
    expect(groupWork(work, { firstLinkReady: false }).waiting.map(row => row.kind)).toEqual(['firstRegistration'])
    expect(parentAllSet([item('parent', 'firstRegistration')], { firstLinkReady: false })).toBe(true)
    // Link ready, or not checked yet: it stays the Parent's item.
    for (const firstLinkReady of [true, null, undefined]) expect(groupWork(work, { firstLinkReady }).parent).toHaveLength(2)
  })

  type Coverage = { eventId: string; state: 'required' | 'pending' | 'accepted' | 'correction' }
  it.each([
    { paused: true, coverage: [] as Coverage[], names: ['Regional', 'Scrimmage'], message: 'Permission forms are not open yet. A Coach or Travel Lead will post a date.' },
    { paused: false, coverage: [{ eventId: 'scrimmage', state: 'accepted' }] as Coverage[], names: ['Regional'], message: '1 event needs a signed form.' },
    { paused: true, coverage: [{ eventId: 'regional', state: 'pending' }, { eventId: 'scrimmage', state: 'accepted' }] as Coverage[], names: [], message: 'Nothing to sign right now.' },
    { paused: false, coverage: [{ eventId: 'regional', state: 'correction' }] as Coverage[], names: ['Regional', 'Scrimmage'], message: '2 events need a signed form.' },
  ])('Forms summary: $message', ({ paused, coverage, names, message }) => {
    const events = [
      { eventId: 'scrimmage', name: 'Scrimmage', startsAt: at('2026-11-20T08:00'), endsAt: at('2026-11-20T17:00') },
      { eventId: 'past', name: 'Past', startsAt: at('2026-10-01T08:00'), endsAt: at('2026-10-01T17:00') },
      { eventId: 'regional', name: 'Regional', startsAt: at('2026-11-10T08:00'), endsAt: at('2026-11-12T17:00') },
    ]
    const result = formsSummary({ events, coverage, signingPaused: paused, now: at('2026-11-03T12:00') })
    expect(result.needForm.map(event => event.name)).toEqual(names)
    expect(result.message).toBe(message)
  })
})

describe('Parent room status text', () => {
  const when = () => 'Fri, Jan 8 · 5 PM'
  const base: ParentRoomStatus = { roomChoiceOpen: true, deadline: 1, roomType: null, status: 'notChosen', roommates: [] }
  it.each([
    [{}, ['Dev Student picks roommates in Venom Status. Room choice closes Fri, Jan 8 · 5 PM.']],
    [{ roomChoiceOpen: false }, ['Room choice is closed and no room is set yet. Ask a Coach or Travel Lead about a room.']],
    [{ status: 'inGroup', roommates: ['Leo', 'Maya'], roomType: 'Girls' }, ['In a group with Leo and Maya.', 'Room choice closes Fri, Jan 8 · 5 PM.', 'Room type: Girls.']],
    [{ status: 'finalized', roommates: ['Maya'], roomChoiceOpen: false }, ['Room is final, with Maya.']],
    [{ status: 'inGroup', roommates: ['A', 'B', 'C'], roomChoiceOpen: false }, ['In a group with A, B and C.']],
  ] as [Partial<ParentRoomStatus>, string[]][])('describes %j', (patch, lines) => expect(roomStatusLines({ ...base, ...patch }, 'Dev Student', when)).toEqual(lines))
})
