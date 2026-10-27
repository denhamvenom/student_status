import { describe, expect, it } from 'vitest'
import type { GenericId } from 'convex/values'
import type { Id } from '../../../convex/_generated/dataModel'
import type { HomeAttendance, OpenSignup, PinnedAnnouncement, RoomChoice, StudentHomeSummary, WhatsLeftItem } from './contract'
import { at } from './fixtures'
import { formatDateRange } from './format'
import { calendarDaysUntil, countdownTarget, countdownValue, heroCards, HOUR_MS, isWithinSoon, openSignupsSummary, participationView, percentAttended, SOON_MS, upcomingMilestones, whatsLeftSummary } from './logic'

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
const summary = (overrides: Partial<StudentHomeSummary>): Pick<StudentHomeSummary, 'roomChoices' | 'season' | 'competitions'> => ({ roomChoices: [], season, competitions: [], ...overrides })

describe('hero stack order', () => {
  it.each([
    {
      name: 'rooms by soonest deadline (no deadline last), then pins newest first, then the countdown',
      input: summary({ roomChoices: [room('later', NOW + 9 * 24 * HOUR_MS), room('none', null), room('soon', NOW + 2 * 24 * HOUR_MS)] }),
      pins: [pin('old', NOW - 5 * HOUR_MS), pin('new', NOW - HOUR_MS)],
      keys: ['room:soon', 'room:later', 'room:none', 'pin:new', 'pin:old', 'countdown'],
    },
    {
      name: 'hides final rooms, passed deadlines and expired pins',
      input: summary({ roomChoices: [room('final', NOW + 24 * HOUR_MS, 'final'), room('passed', NOW - 1)] }),
      pins: [pin('expired', NOW - HOUR_MS, NOW), pin('showing', NOW - 2 * HOUR_MS, NOW + 1)],
      keys: ['pin:showing', 'countdown'],
    },
    {
      name: 'shows at most five pins',
      input: summary({}),
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
