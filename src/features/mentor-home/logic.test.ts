import { describe, expect, it } from 'vitest'
import { mentorHomeCopy as copy } from '@/copy/mentor-home-copy'
import { at } from '../student-home/fixtures'
import { eventEditValues, draftFrom } from '../operations/event-edit'
import { homeData, meeting, NOW } from './fixtures'
import type { Id } from '../../../convex/_generated/dataModel'
import { clockLabel, createdList, editableMeeting, eventTags, joinable, LIST_LIMIT, meetingPlace, myPartLabel, pendingCount, scheduleView, seriesStatus, startsWhen, subteamsLine, typeLabel } from './logic'

const HOUR = 3_600_000
const titles = (rows: readonly { title: string }[]) => rows.map(row => row.title)

describe('Where you’re scheduled', () => {
  it('leads with the soonest meeting, merges meetings the Mentor created and drops duplicates, canceled and past meetings', () => {
    const view = scheduleView(homeData({
      scheduled: [meeting('later', NOW + 48 * HOUR, { myStatus: 'accepted' }), meeting('in progress', NOW - HOUR, { myStatus: 'accepted' }), meeting('over', NOW - 5 * HOUR, { myStatus: 'accepted' })],
      created: [meeting('mine', NOW + 24 * HOUR, { isCreator: true }), meeting('later', NOW + 48 * HOUR, { isCreator: true }), meeting('canceled', NOW + 2 * HOUR, { isCreator: true, cancelled: true })],
    }), NOW)
    expect(view.next?.title).toBe('in progress')
    expect(titles(view.going)).toEqual(['mine', 'later'])
    expect(view.moreGoing).toBe(0)
  })

  it('lists every open invitation, soonest first, without canceled ones', () => {
    const view = scheduleView(homeData({ pendingInvites: [meeting('b', NOW + 3 * HOUR), meeting('a', NOW + 3 * HOUR), meeting('gone', NOW + HOUR, { cancelled: true })] }), NOW)
    expect(titles(view.invites)).toEqual(['a', 'b'])
    expect(view.next).toBeNull()
  })

  it('shows at most LIST_LIMIT meetings after the next one and counts the rest', () => {
    const scheduled = Array.from({ length: LIST_LIMIT + 3 }, (_, i) => meeting(`m${i}`, NOW + (i + 1) * HOUR, { myStatus: 'accepted' }))
    const view = scheduleView(homeData({ scheduled }), NOW)
    expect(view.next?.title).toBe('m0')
    expect(view.going).toHaveLength(LIST_LIMIT)
    expect(view.moreGoing).toBe(2)
  })

  it('is empty for a new Mentor', () => {
    expect(scheduleView(homeData(), NOW)).toEqual({ next: null, invites: [], going: [], moreGoing: 0, skipped: [] })
    expect(pendingCount(homeData(), NOW)).toBe(0)
  })
})

describe('skipped series meetings', () => {
  const skippedSignup = { scope: 'all', count: null, coversThisMeeting: false, skippedThisMeeting: true } as const
  it('shows a skipped meeting on the schedule as Skipped, not under Events and meetings you can join', () => {
    const rows = [
      meeting('skipped', NOW + 2 * HOUR, { canSignUp: true, seriesId: 'fixture_series_a' as Id<'eventSeries'>, seriesSignup: skippedSignup }),
      meeting('open', NOW + 3 * HOUR, { canSignUp: true }),
      meeting('skipped but canceled', NOW + 4 * HOUR, { canSignUp: true, cancelled: true, seriesSignup: skippedSignup }),
    ]
    expect(titles(scheduleView(homeData({ signUpAvailable: rows }), NOW).skipped)).toEqual(['skipped'])
    expect(titles(joinable(rows, NOW).shown)).toEqual(['open'])
  })
})

describe('Events and meetings you can join', () => {
  it('keeps upcoming meetings open to sign-up and leaves out the Mentor’s own, canceled and closed ones', () => {
    const rows = [
      meeting('open later', NOW + 5 * HOUR, { canSignUp: true }),
      meeting('open soon', NOW + HOUR, { canSignUp: true }),
      meeting('my own', NOW + 2 * HOUR, { canSignUp: true, isCreator: true }),
      meeting('canceled', NOW + 2 * HOUR, { canSignUp: true, cancelled: true }),
      meeting('closed', NOW + 2 * HOUR, { canSignUp: false }),
      meeting('over', NOW - 3 * HOUR, { canSignUp: true }),
    ]
    expect(titles(joinable(rows, NOW).shown)).toEqual(['open soon', 'open later'])
  })

  it('counts meetings past the list limit', () => {
    const rows = Array.from({ length: LIST_LIMIT + 1 }, (_, i) => meeting(`j${i}`, NOW + (i + 1) * HOUR, { canSignUp: true }))
    expect(joinable(rows, NOW).more).toBe(1)
  })
})

describe('Meetings you created', () => {
  it('lists upcoming meetings first and canceled ones after them', () => {
    const rows = [meeting('canceled soon', NOW + HOUR, { cancelled: true }), meeting('later', NOW + 9 * HOUR), meeting('sooner', NOW + 2 * HOUR), meeting('past', NOW - 4 * HOUR)]
    expect(titles(createdList(rows, NOW).shown)).toEqual(['sooner', 'later', 'canceled soon'])
  })
})

describe('meeting descriptions', () => {
  it.each([
    { name: 'virtual', row: { place: 'Somewhere', virtual: true }, place: copy.meeting.virtual },
    { name: 'stored on site', row: { place: 'On site', virtual: false }, place: copy.meeting.shop },
    { name: 'blank place', row: { place: '  ', virtual: false }, place: copy.meeting.noPlace },
    { name: 'written place', row: { place: ' Kansas City ', virtual: false }, place: 'Kansas City' },
  ])('place: $name', ({ row, place }) => {
    expect(meetingPlace(row)).toBe(place)
  })

  it.each([
    { name: 'creator', row: { isCreator: true, myStatus: 'accepted', mySource: 'self' }, label: copy.meeting.youCreated },
    { name: 'self sign-up', row: { isCreator: false, myStatus: 'accepted', mySource: 'self' }, label: copy.meeting.selfSignedUp },
    { name: 'accepted invitation', row: { isCreator: false, myStatus: 'accepted', mySource: 'subteam' }, label: copy.meeting.going },
    { name: 'open invitation', row: { isCreator: false, myStatus: 'invited', mySource: 'individual' }, label: copy.meeting.invited },
    { name: 'declined', row: { isCreator: false, myStatus: 'declined', mySource: 'individual' }, label: null },
    { name: 'nothing yet', row: { isCreator: false, myStatus: null, mySource: null }, label: null },
  ] as const)('my part: $name', ({ row, label }) => {
    expect(myPartLabel(row)).toBe(label)
  })

  it.each([
    { name: 'already started', startsAt: NOW - HOUR, text: 'now' },
    { name: 'later today', startsAt: at('2026-11-06T18:00'), text: 'today' },
    { name: 'tomorrow', startsAt: at('2026-11-07T09:00'), text: 'tomorrow' },
    { name: 'this week', startsAt: at('2026-11-10T18:00'), text: 'on Tue' },
    { name: 'far off', startsAt: at('2026-11-20T18:00'), text: 'on Friday, Nov 20' },
  ])('starts: $name', ({ startsAt, text }) => {
    expect(startsWhen(startsAt, NOW)).toBe(text)
  })

  it.each([
    { name: 'plain Team meeting', row: { type: 'Team', questions: { askDrive: false, askHotel: false }, seriesId: null, repeatLabel: null }, type: copy.types.Team, tags: [] },
    { name: 'travel competition', row: { type: 'Competition', questions: { askDrive: true, askHotel: false }, seriesId: null, repeatLabel: null }, type: 'Competition', tags: [copy.tags.travel] },
    { name: 'overnight trip', row: { type: 'Competition', questions: { askDrive: true, askHotel: true }, seriesId: null, repeatLabel: null }, type: 'Competition', tags: [copy.tags.travel, copy.tags.overnight] },
    { name: 'outreach every 2 weeks', row: { type: 'Outreach', questions: { askDrive: false, askHotel: false }, seriesId: 'fixture_series_b' as Id<'eventSeries'>, repeatLabel: 'Repeats every 2 weeks' }, type: 'Outreach', tags: ['Repeats every 2 weeks'] },
    { name: 'series without a label', row: { type: 'Team', questions: { askDrive: false, askHotel: false }, seriesId: 'fixture_series_c' as Id<'eventSeries'>, repeatLabel: null }, type: copy.types.Team, tags: [copy.tags.repeats] },
  ] as const)('type and tags: $name', ({ row, type, tags }) => {
    expect(typeLabel(row)).toBe(type)
    expect(eventTags(row)).toEqual(tags)
  })

  it.each([
    { name: 'no series sign-up', signup: null, label: null },
    { name: 'every meeting', signup: { scope: 'all', count: null, coversThisMeeting: true, skippedThisMeeting: false }, label: copy.series.every },
    { name: 'next 4', signup: { scope: 'next', count: 4, coversThisMeeting: true, skippedThisMeeting: false }, label: 'Next 4 meetings' },
    { name: 'next 1', signup: { scope: 'next', count: 1, coversThisMeeting: true, skippedThisMeeting: false }, label: 'Next meeting' },
    { name: 'just this one', signup: { scope: 'one', count: null, coversThisMeeting: true, skippedThisMeeting: false }, label: copy.series.justOne },
    { name: 'skipped', signup: { scope: 'all', count: null, coversThisMeeting: false, skippedThisMeeting: true }, label: copy.series.skipped },
  ] as const)('series status: $name', ({ signup, label }) => {
    expect(seriesStatus({ seriesSignup: signup })).toBe(label)
  })

  it.each([['18:00', '6:00 PM'], ['00:30', '12:30 AM'], ['12:05', '12:05 PM'], ['bad', 'bad']])('clock %s → %s', (input, output) => {
    expect(clockLabel(input)).toBe(output)
  })

  it('names subteams once in their display form, or says a Coach sets them', () => {
    expect(subteamsLine(['CAD', 'CAD', ' '])).toBe(copy.about.subteams('CAD'))
    expect(subteamsLine([])).toBe(copy.about.noSubteams)
  })
})

describe('editing a meeting the Mentor created', () => {
  it('locks the place of virtual and on-site meetings and sends only changed fields', () => {
    const virtual = editableMeeting(meeting('Online', NOW + HOUR, { virtual: true, place: 'Virtual (Discord)' }))
    const draft = { ...draftFrom(virtual), destination: 'Library', name: 'Online review' }
    expect(eventEditValues(virtual, draft)).toEqual({ values: { name: 'Online review' } })
    const onsite = editableMeeting(meeting('Shop', NOW + HOUR, { place: 'On site' }))
    expect(eventEditValues(onsite, { ...draftFrom(onsite), destination: 'Library' })).toEqual({ error: expect.any(String) })
    const elsewhere = editableMeeting(meeting('Park', NOW + HOUR, { place: 'City park' }))
    expect(eventEditValues(elsewhere, { ...draftFrom(elsewhere), destination: 'Library' })).toEqual({ values: { destination: 'Library' } })
  })
})

describe('full lists for the Your schedule page', () => {
  it('shows everything when no limit is given and keeps the Home limit otherwise', () => {
    const rows = Array.from({ length: LIST_LIMIT + 4 }, (_, i) => meeting(`j${i}`, NOW + (i + 1) * HOUR, { canSignUp: true }))
    expect(joinable(rows, NOW, Number.POSITIVE_INFINITY).shown).toHaveLength(LIST_LIMIT + 4)
    expect(createdList(rows, NOW, Number.POSITIVE_INFINITY).shown).toHaveLength(LIST_LIMIT + 4)
    expect(joinable(rows, NOW).more).toBe(4)
  })
})
