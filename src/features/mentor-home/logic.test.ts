import { describe, expect, it } from 'vitest'
import { mentorHomeCopy as copy } from '@/copy/mentor-home-copy'
import { at } from '../student-home/fixtures'
import { eventEditValues, draftFrom } from '../operations/event-edit'
import { clockedIn, homeData, joinEntry, meeting, NOW } from './fixtures'
import type { Id } from '../../../convex/_generated/dataModel'
import { clockLabel, COMING_UP_LIMIT, comingUpTags, createdList, editableMeeting, eventTags, goingList, hereGroups, homeView, joinEntryLines, joinInScope, joinSections, meetingPlace, myPartLabel, needsAnswer, pinKey, seriesStatus, showsSubteamTag, subteamsLine, tabFromHash, typeLabel, unreadPinned } from './logic'

const HOUR = 3_600_000
const titles = (rows: readonly { title: string }[]) => rows.map(row => row.title)
const going = { myStatus: 'accepted', mySource: 'individual', canWithdraw: true } as const
const askDrive = { askDrive: true, askHotel: false }
const askBoth = { askDrive: true, askHotel: true }
const skippedSignup = { scope: 'all', count: null, coversThisMeeting: false, skippedThisMeeting: true } as const
const everyone = { kind: 'everyone' as const, subteams: [], required: false, text: 'Everyone' }

describe('which Home blocks show', () => {
  it('shows only Next event (empty) and Who’s here now for a new Mentor: no Needs your answer, Coming up or join tile', () => {
    expect(homeView(homeData(), NOW)).toEqual({ next: null, needsAnswer: [], comingUp: [], joinCount: 0 })
  })

  it('leads with the soonest meeting (in progress counts), merges meetings the Mentor created, and drops duplicates, canceled and past ones', () => {
    const view = homeView(homeData({
      scheduled: [meeting('later', NOW + 48 * HOUR, going), meeting('in progress', NOW - HOUR, going), meeting('over', NOW - 5 * HOUR, going)],
      created: [meeting('mine', NOW + 24 * HOUR, { isCreator: true }), meeting('later', NOW + 48 * HOUR, { isCreator: true }), meeting('canceled', NOW + 2 * HOUR, { isCreator: true, cancelled: true })],
    }), NOW)
    expect(view.next?.title).toBe('in progress')
    expect(view.comingUp.map(row => row.meeting.title)).toEqual(['mine', 'later'])
  })

  it('Coming up is the next three after the Next event, soonest first', () => {
    const scheduled = Array.from({ length: COMING_UP_LIMIT + 3 }, (_, i) => meeting(`m${i}`, NOW + (i + 1) * HOUR, going))
    const view = homeView(homeData({ scheduled }), NOW)
    expect(view.next?.title).toBe('m0')
    expect(view.comingUp.map(row => row.meeting.title)).toEqual(['m1', 'm2', 'm3'])
  })

  it('counts events the Mentor could help with, one per series or one-time event, without their own, skipped or closed ones', () => {
    const open = [
      meeting('series', NOW + HOUR, { canSignUp: true, seriesId: 'fixture_series_a' as Id<'eventSeries'> }),
      meeting('one time', NOW + 2 * HOUR, { canSignUp: true }),
      meeting('competition', NOW + 3 * HOUR, { canSignUp: true, type: 'Competition' }),
      meeting('my own', NOW + 2 * HOUR, { canSignUp: true, isCreator: true }),
      meeting('skipped', NOW + 2 * HOUR, { canSignUp: true, seriesId: 'fixture_series_b' as Id<'eventSeries'>, seriesSignup: skippedSignup }),
      meeting('closed', NOW + 2 * HOUR, { canSignUp: false }),
    ]
    expect(homeView(homeData({ joinable: open.map(row => joinEntry(row)) }), NOW).joinCount).toBe(3)
  })
})

describe('Needs your answer', () => {
  it.each([
    { name: 'open invitation', invite: meeting('x', NOW + HOUR, { myStatus: 'invited', canSignUp: true }), row: null, shown: { mode: 'accept', reason: copy.answer.invited } },
    { name: 'canceled invitation', invite: meeting('x', NOW + HOUR, { myStatus: 'invited', cancelled: true }), row: null, shown: null },
    { name: 'going, drive not answered', invite: null, row: meeting('x', NOW + HOUR, { ...going, questions: askDrive }), shown: { mode: 'change', reason: copy.answer.missingDrive } },
    { name: 'going, hotel not answered', invite: null, row: meeting('x', NOW + HOUR, { ...going, questions: askBoth, myAnswers: { canDriveStudents: false, needsHotelRoom: null } }), shown: { mode: 'change', reason: copy.answer.missingHotel } },
    { name: 'going, everything answered', invite: null, row: meeting('x', NOW + HOUR, { ...going, questions: askBoth, myAnswers: { canDriveStudents: true, needsHotelRoom: false } }), shown: null },
    { name: 'going, nothing asked', invite: null, row: meeting('x', NOW + HOUR, going), shown: null },
    { name: 'drive not answered but can no longer change', invite: null, row: meeting('x', NOW + HOUR, { ...going, canWithdraw: false, questions: askDrive }), shown: null },
    { name: 'drive not answered but canceled', invite: null, row: meeting('x', NOW + HOUR, { ...going, cancelled: true, questions: askDrive }), shown: null },
    { name: 'drive not answered but over', invite: null, row: meeting('x', NOW - 3 * HOUR, { ...going, questions: askDrive }), shown: null },
  ])('$name', ({ invite, row, shown }) => {
    const items = needsAnswer(homeData({ pendingInvites: invite ? [invite] : [], scheduled: row ? [row] : [] }), NOW)
    expect(items.map(({ mode, reason }) => ({ mode, reason }))).toEqual(shown ? [shown] : [])
  })

  it('lists invitations and missing answers together, soonest first, each meeting once', () => {
    const items = needsAnswer(homeData({
      pendingInvites: [meeting('invite later', NOW + 9 * HOUR, { myStatus: 'invited' }), meeting('both', NOW + 3 * HOUR, { myStatus: 'invited' })],
      scheduled: [meeting('trip', NOW + 5 * HOUR, { ...going, questions: askDrive }), meeting('both', NOW + 3 * HOUR, { ...going, questions: askDrive })],
    }), NOW)
    expect(items.map(item => `${item.meeting.title}:${item.mode}`)).toEqual(['both:accept', 'trip:change', 'invite later:accept'])
  })
})

describe('Coming up tags', () => {
  const subteams = (list: string[]) => ({ kind: 'subteams' as const, subteams: list, required: false, text: 'Subteams' })
  it.each([
    { name: 'plain meeting for Everyone', row: { questions: { askDrive: false, askHotel: false }, audience: everyone }, tags: [] },
    { name: 'trip', row: { questions: askDrive, audience: everyone }, tags: [copy.tags.travel] },
    { name: 'overnight only', row: { questions: { askDrive: false, askHotel: true }, audience: everyone }, tags: [copy.tags.travel] },
    { name: 'the Mentor’s subteam (any case)', row: { questions: { askDrive: false, askHotel: false }, audience: subteams(['programming']) }, tags: [copy.join.yourSubteam] },
    { name: 'another subteam', row: { questions: { askDrive: false, askHotel: false }, audience: subteams(['CAD']) }, tags: [] },
    { name: 'trip for the Mentor’s subteam: two tags, no more', row: { questions: askBoth, audience: subteams(['Programming']) }, tags: [copy.tags.travel, copy.join.yourSubteam] },
  ])('$name', ({ row, tags }) => {
    expect(comingUpTags(row, ['Programming'])).toEqual(tags)
  })
})

describe('Schedule', () => {
  it.each([['', 'going'], ['#join', 'join'], ['#created', 'created'], ['#going', 'going'], ['#nope', 'going']] as const)('hash "%s" opens %s', (hash, tab) => {
    expect(tabFromHash(hash)).toBe(tab)
  })

  it('Going lists the Mentor’s schedule and the series meetings they skip (marked), soonest first', () => {
    const rows = goingList(homeData({
      scheduled: [meeting('later', NOW + 9 * HOUR, going)],
      created: [meeting('mine', NOW + HOUR, { isCreator: true })],
      signUpAvailable: [meeting('skipped', NOW + 3 * HOUR, { canSignUp: true, seriesSignup: skippedSignup }), meeting('open', NOW + 2 * HOUR, { canSignUp: true })],
    }), NOW)
    expect(rows.map(row => (row.skipping ? `${row.meeting.title} (skipping)` : row.meeting.title))).toEqual(['mine', 'skipped (skipping)', 'later'])
  })

  it('Created by me lists upcoming meetings first and canceled ones after them', () => {
    const rows = [meeting('canceled soon', NOW + HOUR, { cancelled: true }), meeting('later', NOW + 9 * HOUR), meeting('sooner', NOW + 2 * HOUR), meeting('past', NOW - 4 * HOUR)]
    expect(titles(createdList(rows, NOW))).toEqual(['sooner', 'later', 'canceled soon'])
  })
})

describe('pinned announcement banner', () => {
  const message = (id: string, pinnedAt: number, showUntil: number | null = null) => ({ id, pinnedAt, showUntil })
  it('shows the newest pinned message still showing that wasn’t dismissed on this device', () => {
    const messages = [message('old', NOW - 9 * HOUR), message('newest', NOW - HOUR), message('expired', NOW, NOW - 1)]
    expect(unreadPinned(messages, new Set(), NOW)?.id).toBe('newest')
    expect(unreadPinned(messages, new Set([pinKey(messages[1])]), NOW)?.id).toBe('old')
    expect(unreadPinned(messages, new Set(messages.map(pinKey)), NOW)).toBeNull()
  })

  it('shows a dismissed message again when it is pinned again', () => {
    expect(unreadPinned([message('a', NOW)], new Set([pinKey(message('a', NOW - HOUR))]), NOW)?.id).toBe('a')
  })
})

describe('Schedule › Join', () => {
  const competition = { canSignUp: true, type: 'Competition' } as const
  const trip = { canSignUp: true, questions: { askDrive: true, askHotel: false } }

  it('groups Competitions & trips before Meetings & events, soonest first, and leaves out the Mentor’s own, canceled, closed, skipped and past ones', () => {
    const entries = [
      meeting('meeting later', NOW + 5 * HOUR, { canSignUp: true }),
      meeting('meeting soon', NOW + HOUR, { canSignUp: true }),
      meeting('regional', NOW + 9 * HOUR, competition),
      meeting('outreach with travel', NOW + 2 * HOUR, trip),
      meeting('my own', NOW + 2 * HOUR, { canSignUp: true, isCreator: true }),
      meeting('canceled', NOW + 2 * HOUR, { canSignUp: true, cancelled: true }),
      meeting('closed', NOW + 2 * HOUR, { canSignUp: false }),
      meeting('skipped', NOW + 2 * HOUR, { canSignUp: true, seriesSignup: skippedSignup }),
      meeting('over', NOW - 3 * HOUR, { canSignUp: true }),
    ].map(row => joinEntry(row))
    const sections = joinSections(entries, NOW)
    expect(titles(sections.competitions)).toEqual(['outreach with travel', 'regional'])
    expect(titles(sections.meetings)).toEqual(['meeting soon', 'meeting later'])
  })

  it('leaves out meetings for other subteams until widened, and always keeps whole-team and own-subteam ones', () => {
    const forSubteam = (name: string, subteam: string) => joinEntry(meeting(name, NOW + HOUR, { canSignUp: true, audience: { kind: 'subteams', subteams: [subteam], required: false, text: subteam } }))
    const entries = [forSubteam('mine', 'Programming'), forSubteam('other', 'Mechanical'), joinEntry(meeting('whole team', NOW + 2 * HOUR, { canSignUp: true }))]
    expect(titles(joinSections(entries, NOW, ['programming']).meetings)).toEqual(['mine', 'whole team'])
    expect(joinSections(entries, NOW, ['Programming']).hidden).toBe(1)
    expect(titles(joinSections(entries, NOW, ['Programming'], true).meetings)).toEqual(['mine', 'other', 'whole team'])
    expect(joinSections(entries, NOW).hidden).toBe(0)
    expect(joinInScope(entries[1], [])).toBe(false)
  })

  it('drops a series from Home’s could-help-with count once the Mentor signs up for it', () => {
    const next = meeting('series', NOW + HOUR, { canSignUp: true, seriesId: 'fixture_series_a' as Id<'eventSeries'> })
    expect(homeView(homeData({ joinable: [joinEntry(next)] }), NOW).joinCount).toBe(1)
    expect(homeView(homeData({ joinable: [joinEntry(next, { hasSeriesSignup: true })] }), NOW).joinCount).toBe(0)
  })

  it.each([
    ['a meeting for the Mentor’s subteam', 'meetings', true, true],
    ['a meeting for Everyone', 'meetings', false, false],
    // Never on a Competition or trip, even if the server marked it.
    ['a competition', 'competitionsAndTrips', true, false],
  ] as const)('shows the Your subteam tag on %s: %s', (_, category, forYourSubteam, shown) => {
    expect(showsSubteamTag({ category, forYourSubteam })).toBe(shown)
  })

  it('describes a repeating series once, with its schedule, how often and how many are coming up', () => {
    const next = meeting('Build night', at('2026-11-09T18:00'), { canSignUp: true, seriesId: 'fixture_series_b' as Id<'eventSeries'>, repeatLabel: 'Repeats weekly' })
    expect(joinEntryLines(joinEntry(next, { scheduleLabel: 'Mondays at 6:00 PM', upcomingCount: 8 }))).toEqual({
      line: 'Mondays at 6:00 PM · Repeats weekly',
      detail: '8 upcoming · Next: Mon Nov 9, 6–8 PM · DSHS STEM Center (on site)',
    })
  })

  it('describes a one-time event by its time and place', () => {
    expect(joinEntryLines(joinEntry(meeting('Showcase', at('2026-11-20T08:00'), { canSignUp: true, place: 'Baton Rouge River Center' })))).toEqual({ line: 'Fri Nov 20, 8–10 AM · Baton Rouge River Center', detail: null })
  })
})

describe('Who’s here now', () => {
  it('lists each student with the time they clocked in, and says plainly when a subteam is empty', () => {
    const groups = hereGroups(clockedIn({ Programming: ['Avery N.', 'Jordan W.'], CAD: [] }))
    expect(groups.map(group => [group.label, group.students.map(student => student.name)])).toEqual([
      ['Programming · 2 clocked in', ['Avery N.', 'Jordan W.']],
      ['CAD · nobody clocked in', []],
    ])
    // NOW is 12:00 PM Central; the fixtures clock students in 10 and 20 minutes earlier.
    expect(groups[0].students.map(student => student.since)).toEqual(['since 11:50 AM', 'since 11:40 AM'])
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
