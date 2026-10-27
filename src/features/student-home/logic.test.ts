import { describe, expect, it } from 'vitest'
import type { GenericId } from 'convex/values'
import type { Id } from '../../../convex/_generated/dataModel'
import type { HomeAttendance, OpenSignup, PinnedAnnouncement, RoomChoice, StudentHomeSummary, WhatsLeftItem } from './contract'
import { homeCopy } from './copy'
import { at } from './fixtures'
import { formatDateRange } from './format'
import { calendarDaysUntil, countdownTarget, countdownValue, dueShowsDate, heroCards, highlightActions, HOUR_MS, isWithinSoon, openSignupsSummary, participationView, percentAttended, roomDeadlineView, signupDateLine, SOON_MS, upcomingMilestones, whatsLeftSummary } from './logic'
import { actionContent } from './tiles/ActionCard'

const NOW = at('2026-10-26T12:00')
const event = (key: string) => key as Id<'events'>
const season = { name: '2026–2027 season', startsAt: at('2026-08-01T00:00'), kickoffAt: at('2027-01-09T00:00') }
const competition = (key: string, startsAt: string) => ({ eventId: event(key), name: key, startsAt: at(startsAt), endsAt: at(startsAt) + 10 * HOUR_MS })

const room = (key: string, roomDeadline: number | null, status: RoomChoice['status'] = 'notChosen'): RoomChoice => ({
  eventId: event(key), eventName: key, startsAt: NOW + 30 * 24 * HOUR_MS, endsAt: NOW + 32 * 24 * HOUR_MS, roomDeadline, status, groupName: null, memberNames: [], invitations: [],
})
const pin = (key: string, pinnedAt: number, showUntil: number | null = null): PinnedAnnouncement => ({
  id: key as GenericId<'teamAnnouncements'>, title: null, body: key, authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt, showUntil,
})
const item = (key: string, owner: WhatsLeftItem['owner'], dueAt: number | null = null, kind: WhatsLeftItem['kind'] = 'requirement'): WhatsLeftItem => ({
  key, kind, owner, eventId: null, eventName: null, label: key, dueAt, href: null,
})
const signup = (key: string, signupClosesAt: number | null): OpenSignup => ({
  eventId: event(key), name: key, type: 'Competition', startsAt: NOW + 40 * 24 * HOUR_MS, endsAt: NOW + 41 * 24 * HOUR_MS, signupClosesAt, feeCents: 0, signupMode: 'open',
})
type HighlightsInput = Pick<StudentHomeSummary, 'whatsLeft' | 'parentLinked' | 'roomChoices' | 'season' | 'competitions'>
const summary = (overrides: Partial<HighlightsInput>): HighlightsInput => ({ whatsLeft: [], parentLinked: true, roomChoices: [], season, competitions: [], ...overrides })
/** A What's left item as the summary sends it; the key doubles as the label. */
const todo = (key: string, kind: WhatsLeftItem['kind'], owner: WhatsLeftItem['owner'], dueAt: number | null = null): WhatsLeftItem => ({
  key, kind, owner, eventId: event('pri'), eventName: 'Pacific Robotics Invitational', label: key, dueAt, href: owner === 'student' ? '/somewhere' : null,
})
const DAY = 24 * HOUR_MS
const actionKeys = (input: Partial<HighlightsInput>, now = NOW) => highlightActions(summary(input), now).map(action => action.item.key)

describe('Highlights order', () => {
  it.each([
    {
      name: 'the three most important to-do cards, then the countdown',
      input: summary({
        whatsLeft: [todo('photo', 'requirement', 'student', NOW + DAY), todo('permission', 'permissionForm', 'parent', NOW + 2 * DAY), todo('fee', 'requiredPayment', 'parent', NOW - DAY), todo('first', 'firstRegistration', 'parent')],
        roomChoices: [room('soon', NOW + DAY)],
      }),
      pins: [],
      keys: ['todo:first', 'todo:fee', 'todo:permission', 'countdown'],
    },
    {
      name: 'Invite a parent leads; then the room choice, pins newest first and the countdown',
      input: summary({ parentLinked: false, whatsLeft: [todo('invite', 'inviteParent', 'student')], roomChoices: [room('soon', NOW + 2 * DAY)] }),
      pins: [pin('old', NOW - 5 * HOUR_MS), pin('new', NOW - HOUR_MS)],
      keys: ['todo:invite', 'room:soon', 'pin:new', 'pin:old', 'countdown'],
    },
    {
      name: 'at most three to-do cards, rooms included; pins and the countdown still follow',
      input: summary({ whatsLeft: [todo('a', 'requirement', 'student', NOW + DAY), todo('b', 'requirement', 'student', NOW + 2 * DAY)], roomChoices: [room('later', NOW + 9 * DAY), room('soon', NOW + 2 * DAY)] }),
      pins: [pin('pin', NOW - HOUR_MS)],
      keys: ['todo:a', 'todo:b', 'room:soon', 'pin:pin', 'countdown'],
    },
    {
      name: 'rooms by soonest deadline, no deadline last; final rooms, passed deadlines and expired pins are hidden',
      input: summary({ roomChoices: [room('none', null), room('final', NOW + DAY, 'final'), room('passed', NOW - 1), room('later', NOW + 9 * DAY)] }),
      pins: [pin('expired', NOW - HOUR_MS, NOW), pin('showing', NOW - 2 * HOUR_MS, NOW + 1)],
      keys: ['room:later', 'room:none', 'pin:showing', 'countdown'],
    },
    {
      name: 'no to-do cards: up to five pins, then the countdown',
      input: summary({ whatsLeft: [todo('verify', 'firstVerification', 'coach')] }),
      pins: Array.from({ length: 7 }, (_, index) => pin(`p${index}`, NOW - index * HOUR_MS)),
      keys: ['pin:p0', 'pin:p1', 'pin:p2', 'pin:p3', 'pin:p4', 'countdown'],
    },
    {
      name: 'no countdown card without a kickoff ahead or a Competition',
      input: summary({ season: { ...season, kickoffAt: null } }),
      pins: [],
      keys: [],
    },
  ])('$name', ({ input, pins, keys }) => {
    expect(heroCards(input, pins, NOW).map(card => card.key)).toEqual(keys)
  })

  it('orders to-do cards by type first: FIRST registration, overdue fee, permission form, event requirement', () => {
    expect(actionKeys({ whatsLeft: [todo('photo', 'requirement', 'student', NOW - 2 * DAY), todo('permission', 'permissionForm', 'parent', NOW + 2 * DAY), todo('fee', 'requiredPayment', 'parent', NOW - DAY), todo('first', 'firstRegistration', 'parent')] }))
      .toEqual(['first', 'fee', 'permission', 'photo'])
  })

  it('soonest due first within a type, undated last', () => {
    expect(actionKeys({ whatsLeft: [todo('undated', 'requirement', 'student'), todo('later', 'requirement', 'student', NOW + 20 * DAY), todo('overdue', 'requirement', 'student', NOW - DAY), todo('soon', 'requirement', 'student', NOW + DAY)] }))
      .toEqual(['overdue', 'soon', 'later', 'undated'])
  })

  it.each([
    { name: 'FIRST registration a parent finishes (under 18)', item: todo('first', 'firstRegistration', 'parent'), waits: true },
    { name: 'an overdue fee', item: todo('fee', 'requiredPayment', 'parent', NOW - DAY), waits: true },
    { name: 'a permission form', item: todo('permission', 'permissionForm', 'parent', NOW + DAY), waits: true },
    { name: 'FIRST registration the Student finishes (18+)', item: todo('first', 'firstRegistration', 'student'), waits: false },
    { name: 'an event requirement', item: todo('photo', 'requirement', 'student', NOW + DAY), waits: false },
  ])('without a connected parent, $name waits behind Invite a parent: $waits', ({ item, waits }) => {
    expect(actionKeys({ whatsLeft: [item] })).toEqual([item.key])
    expect(actionKeys({ parentLinked: false, whatsLeft: [todo('invite', 'inviteParent', 'student'), item] })).toEqual(waits ? ['invite'] : ['invite', item.key])
  })

  it('shows Invite a parent when no parent is connected, even without the What\'s left item', () => {
    expect(highlightActions(summary({ parentLinked: false }), NOW).map(action => [action.kind, action.item.href])).toEqual([['inviteParent', '/parents']])
  })

  it.each([
    { name: 'a fee with no due date', dueAt: null, card: false },
    { name: 'a fee due later', dueAt: NOW + DAY, card: false },
    { name: 'a fee due right now', dueAt: NOW, card: false },
    { name: 'a fee past due', dueAt: NOW - 1, card: true },
  ])('$name is a card only once overdue: $card', ({ dueAt, card }) => {
    expect(actionKeys({ whatsLeft: [todo('fee', 'requiredPayment', 'parent', dueAt)] })).toEqual(card ? ['fee'] : [])
  })

  it.each([
    ['firstVerification', 'coach'], ['permissionReview', 'coach'], ['studentSetup', 'student'], ['healthProfile', 'parent'], ['signupApproval', 'coach'], ['staffReview', 'coach'], ['roomChoice', 'student'],
  ] as const)('%s never becomes a to-do card', (kind, owner) => {
    expect(actionKeys({ whatsLeft: [todo(kind, kind, owner, NOW - DAY)] })).toEqual([])
  })

  it.each([
    { name: 'under 18: remind your parent, no button', owner: 'parent' as const, text: homeCopy.highlights.firstRegistration.parentText, primary: null },
    { name: '18+: finish it yourself', owner: 'student' as const, text: homeCopy.highlights.firstRegistration.studentText, primary: { label: homeCopy.highlights.firstRegistration.action, to: '/somewhere' } },
  ])('FIRST registration card, $name', ({ owner, text, primary }) => {
    const [action] = highlightActions(summary({ whatsLeft: [todo('first', 'firstRegistration', owner)] }), NOW)
    expect(actionContent(action, false)).toMatchObject({ text, primary })
  })

  it.each([
    { name: 'a student with a fundraiser page can fundraise', fundraiserLinked: true, to: '/finances#fundraiser' },
    { name: 'otherwise the button opens Money', fundraiserLinked: false, to: '/finances' },
  ])('overdue fee card: $name', ({ fundraiserLinked, to }) => {
    const [action] = highlightActions(summary({ whatsLeft: [todo('fee', 'requiredPayment', 'parent', NOW - DAY)] }), NOW)
    expect(actionContent(action, fundraiserLinked).primary?.to).toBe(to)
  })

  it.each([
    { name: 'overdue', kind: 'requirement' as const, dueAt: NOW - 1, urgent: true, state: 'overdue' },
    { name: 'exactly seven days ahead', kind: 'requirement' as const, dueAt: NOW + SOON_MS, urgent: true, state: 'soon' },
    { name: 'a minute more than seven days ahead', kind: 'requirement' as const, dueAt: NOW + SOON_MS + 60_000, urgent: false, state: 'later' },
    { name: 'no due date', kind: 'requirement' as const, dueAt: null, urgent: false, state: null },
    { name: 'Invite a parent, always', kind: 'inviteParent' as const, dueAt: null, urgent: true, state: null },
  ])('urgency: $name', ({ kind, dueAt, urgent, state }) => {
    const [action] = highlightActions(summary({ whatsLeft: [todo('item', kind, 'student', dueAt)] }), NOW)
    expect({ urgent: action.urgent, state: action.due?.state ?? null }).toEqual({ urgent, state })
  })
})

describe('due pill date', () => {
  it.each([
    { name: 'six days ahead names the weekday', dueAt: NOW + 6 * DAY, state: 'soon', date: false },
    { name: 'seven days ahead names the date, still urgent', dueAt: NOW + 7 * DAY, state: 'soon', date: true },
    { name: 'eight days ahead names the date', dueAt: NOW + 8 * DAY, state: 'later', date: true },
  ])('$name', ({ dueAt, state, date }) => {
    const [action] = highlightActions(summary({ whatsLeft: [todo('item', 'requirement', 'student', dueAt)] }), NOW)
    expect(action.due?.state).toBe(state)
    expect(action.due && action.due.state !== 'overdue' && dueShowsDate(action.due)).toBe(date)
  })
})

describe('room choice deadline', () => {
  it.each([
    { name: 'exactly seven days before the deadline is urgent', now: NOW, deadline: NOW + SOON_MS, status: 'notChosen' as const, urgent: true, closes: 'weekday', left: '7 days left' },
    { name: 'a minute more than seven days is calm', now: NOW, deadline: NOW + SOON_MS + 60_000, status: 'notChosen' as const, urgent: false, closes: 'date', left: '7 days left' },
    { name: 'a final room inside the window is not urgent', now: NOW, deadline: NOW + 2 * 24 * HOUR_MS, status: 'final' as const, urgent: false, closes: 'date', left: '2 days left' },
    { name: 'a group that is not final yet is still urgent', now: NOW, deadline: NOW + 2 * 24 * HOUR_MS, status: 'inGroup' as const, urgent: true, closes: 'weekday', left: '2 days left' },
    { name: 'deadline later today: Closes today, Last day', now: NOW, deadline: at('2026-10-26T23:59'), status: 'notChosen' as const, urgent: true, closes: 'today', left: 'Last day' },
    { name: 'deadline just after midnight counts as tomorrow', now: at('2026-10-26T23:00'), deadline: at('2026-10-27T00:30'), status: 'notChosen' as const, urgent: true, closes: 'weekday', left: '1 day left' },
  ])('$name', ({ now, deadline, status, urgent, closes, left }) => {
    const view = roomDeadlineView(room('pri', deadline, status), now)
    expect(view && { urgent: view.urgent, closes: view.closes.kind, left: homeCopy.room.daysLeft(view.daysLeft) }).toEqual({ urgent, closes, left })
  })

  it('says nothing about a deadline when there is none', () => {
    expect(roomDeadlineView(room('pri', null), NOW)).toBeNull()
  })
})

describe('countdown target', () => {
  const competitions = [competition('later', '2027-03-25T08:00'), competition('first', '2027-03-04T08:00')]
  it.each([
    { name: 'offseason counts to kickoff', now: NOW, kickoffAt: season.kickoffAt, expected: { kind: 'kickoff', at: season.kickoffAt } },
    { name: 'at kickoff it switches to the next Competition', now: season.kickoffAt, kickoffAt: season.kickoffAt, expected: { kind: 'competition', at: at('2027-03-04T08:00') } },
    { name: 'a Competition that has started is skipped', now: at('2027-03-04T09:00'), kickoffAt: season.kickoffAt, expected: { kind: 'competition', at: at('2027-03-25T08:00') } },
    { name: 'unverified kickoff counts to the next Competition', now: NOW, kickoffAt: null, expected: { kind: 'competition', at: at('2027-03-04T08:00') } },
    { name: 'nothing ahead means no countdown', now: at('2027-04-01T00:00'), kickoffAt: season.kickoffAt, expected: null },
  ])('$name', ({ now, kickoffAt, expected }) => {
    const target = countdownTarget({ ...season, kickoffAt }, competitions, now)
    expect(target && { kind: target.kind, at: target.at }).toEqual(expected)
  })

  it('progress runs from season start to kickoff, then from kickoff to the Competition', () => {
    expect(countdownTarget(season, competitions, NOW)?.from).toBe(season.startsAt)
    expect(countdownTarget(season, competitions, season.kickoffAt)?.from).toBe(season.kickoffAt)
  })

  it('milestones list kickoff while it is ahead and the next two Competitions in date order', () => {
    const list = [...competitions, competition('third', '2027-04-15T08:00')]
    expect(upcomingMilestones(season, list, NOW).map(milestone => milestone.key)).toEqual(['kickoff', 'first', 'later'])
    expect(upcomingMilestones(season, list, at('2027-02-01T00:00')).map(milestone => milestone.key)).toEqual(['first', 'later'])
  })
})

describe('countdown days and hours', () => {
  const kickoff = season.kickoffAt
  it.each([
    { name: 'exactly 48 hours shows days', now: kickoff - 48 * HOUR_MS, expected: { unit: 'days', value: 2 } },
    { name: 'just under 48 hours shows hours', now: kickoff - 48 * HOUR_MS + 1, expected: { unit: 'hours', value: 48 } },
    { name: '30 hours', now: kickoff - 30 * HOUR_MS, expected: { unit: 'hours', value: 30 } },
    { name: 'the last minutes still say 1 hour', now: kickoff - 60_000, expected: { unit: 'hours', value: 1 } },
    { name: 'offseason distance', now: NOW, expected: { unit: 'days', value: 75 } },
  ])('$name', ({ now, expected }) => {
    expect(countdownValue(kickoff, now)).toEqual(expected)
  })

  it('counts Chicago calendar days, not 24-hour blocks', () => {
    // 3 days and 2 hours away, but on the third calendar day.
    expect(countdownValue(at('2027-03-04T08:00'), at('2027-03-01T06:00'))).toEqual({ unit: 'days', value: 3 })
  })

  it('counts calendar days across the end of daylight saving time', () => {
    expect(calendarDaysUntil(at('2026-11-02T00:30'), at('2026-10-31T23:30'))).toBe(2)
  })
})

describe('closing soon', () => {
  it.each([
    { name: 'exactly seven days away', closesAt: NOW + SOON_MS, soon: true },
    { name: 'just over seven days away', closesAt: NOW + SOON_MS + 1, soon: false },
    { name: 'already closed', closesAt: NOW, soon: false },
    { name: 'no close time', closesAt: null, soon: false },
  ])('$name', ({ closesAt, soon }) => {
    expect(isWithinSoon(closesAt, NOW)).toBe(soon)
  })

  it('hides closed signups and counts the ones closing within seven days', () => {
    const result = openSignupsSummary([signup('open-ended', null), signup('far', NOW + 20 * 24 * HOUR_MS), signup('closed', NOW - 1), signup('soon', NOW + 2 * 24 * HOUR_MS)], NOW)
    expect(result.rows.map(row => row.name)).toEqual(['soon', 'far', 'open-ended'])
    expect(result.closingSoon).toBe(1)
    expect(result.tone).toBe('urgent')
    expect(openSignupsSummary([signup('far', NOW + 20 * 24 * HOUR_MS)], NOW).tone).toBe('quiet')
  })
})

describe("what's left", () => {
  const overdue = NOW - HOUR_MS
  const soon = NOW + 3 * 24 * HOUR_MS
  const later = NOW + 20 * 24 * HOUR_MS
  it.each([
    { name: 'nothing at all', items: [], count: 0, tone: 'done', badge: { kind: 'allSet' } },
    { name: 'only items waiting on others', items: [item('form', 'parent', overdue), item('check', 'coach', soon)], count: 0, tone: 'done', badge: { kind: 'allSet' } },
    { name: 'an overdue own item wins', items: [item('a', 'student', overdue), item('b', 'student', soon)], count: 2, tone: 'overdue', badge: { kind: 'overdue' } },
    { name: 'own items due within seven days', items: [item('a', 'student', soon), item('b', 'student', soon), item('c', 'student', later)], count: 3, tone: 'urgent', badge: { kind: 'dueSoon', count: 2 } },
    { name: 'Invite a parent is urgent without a due date', items: [item('invite', 'student', null, 'inviteParent')], count: 1, tone: 'urgent', badge: null },
    { name: 'own items due later stay quiet', items: [item('a', 'student', later)], count: 1, tone: 'quiet', badge: null },
  ])('$name', ({ items, count, tone, badge }) => {
    const result = whatsLeftSummary(items, NOW)
    expect({ count: result.count, tone: result.tone, badge: result.badge }).toEqual({ count, tone, badge })
  })

  it('groups items by who acts; signup approval can come from a Coach or a Travel Lead', () => {
    const result = whatsLeftSummary([
      item('mine', 'student', later), item('health', 'parent', null, 'healthProfile'), item('review', 'coach', null, 'permissionReview'), item('approval', 'coach', null, 'signupApproval'),
    ], NOW)
    expect(Object.fromEntries(Object.entries(result.groups).map(([group, list]) => [group, list.map(entry => entry.key)]))).toEqual({ student: ['mine'], parent: ['health'], coach: ['review'], coachOrTravelLead: ['approval'] })
    expect(result.waiting).toEqual([{ group: 'parent', count: 1 }, { group: 'coach', count: 1 }, { group: 'coachOrTravelLead', count: 1 }])
  })

  it('lists overdue first, then due soon and Invite a parent, then later, then undated', () => {
    const result = whatsLeftSummary([item('undated', 'student'), item('later', 'student', later), item('invite', 'student', null, 'inviteParent'), item('soon', 'student', soon), item('overdue', 'student', overdue)], NOW)
    expect(result.own.map(entry => entry.key)).toEqual(['overdue', 'soon', 'invite', 'later', 'undated'])
  })
})

describe('participation rings', () => {
  const attendance = (meetings: [number, number], outreach: [number, number], buildHours: HomeAttendance['buildHours']): HomeAttendance => ({
    state: 'ready', meetings: { attended: meetings[0], held: meetings[1] }, outreach: { attended: outreach[0], held: outreach[1] }, buildHours, kickoffAt: season.kickoffAt,
  })
  it.each([
    { name: 'nothing held yet', attended: 0, held: 0, percent: null },
    { name: 'some attended', attended: 28, held: 34, percent: 82 },
    { name: 'all attended', attended: 5, held: 5, percent: 100 },
    { name: 'more attended than held is capped', attended: 6, held: 5, percent: 100 },
  ])('$name', ({ attended, held, percent }) => {
    expect(percentAttended(attended, held)).toBe(percent)
  })

  it.each([
    { name: 'zero held gives empty rings, never NaN', input: attendance([0, 0], [0, 0], { state: 'ready', minutes: 90, targetHours: 0 }), fractions: [0, 0, 0] },
    { name: 'build hours stay empty before kickoff', input: attendance([3, 4], [1, 2], { state: 'beforeKickoff', minutes: 600, targetHours: 120 }), fractions: [0.75, 0.5, 0] },
    { name: 'build hours stay empty while kickoff is unknown', input: attendance([3, 4], [1, 2], { state: 'kickoffUnknown', minutes: 600, targetHours: 120 }), fractions: [0.75, 0.5, 0] },
    { name: 'build hours fill toward the target and stop at full', input: attendance([3, 4], [1, 2], { state: 'ready', minutes: 200 * 60, targetHours: 120 }), fractions: [0.75, 0.5, 1] },
  ])('$name', ({ input, fractions }) => {
    const view = participationView(input)
    const values = [view.meetings.fraction, view.outreach.fraction, view.build.fraction]
    expect(values).toEqual(fractions)
    expect(values.every(Number.isFinite)).toBe(true)
  })
})

describe('event dates in Chicago', () => {
  it.each([
    { name: 'same month', start: '2026-11-21T08:00', end: '2026-11-23T17:00', text: 'Nov 21–23' },
    { name: 'across months', start: '2026-11-30T08:00', end: '2026-12-02T17:00', text: 'Nov 30 – Dec 2' },
    { name: 'one evening that ends after midnight UTC', start: '2026-11-19T17:30', end: '2026-11-19T22:30', text: 'Nov 19' },
  ])('$name', ({ start, end, text }) => {
    expect(formatDateRange(at(start), at(end))).toBe(text)
  })
})

describe('signup date line', () => {
  it.each([
    { name: 'closes later today', closesAt: at('2026-10-26T23:59'), line: 'Closes today' },
    { name: 'closes tomorrow', closesAt: at('2026-10-27T09:00'), line: 'Closes Tue, Oct 27' },
    { name: 'never closes', closesAt: null, line: 'Starts Fri, Nov 20' },
  ])('$name', ({ closesAt, line }) => {
    expect(signupDateLine({ signupClosesAt: closesAt, startsAt: at('2026-11-20T09:00') }, NOW)).toBe(line)
  })
})
