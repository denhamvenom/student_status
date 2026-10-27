import type { GenericId } from 'convex/values'
import type { Id } from '../../../convex/_generated/dataModel'
import { parseChicagoInput } from '@/lib/chicago-time'
import type { HomeAttendance, OpenSignup, PinnedAnnouncement, SignupAvailability, StudentHomeSummary, WhatsLeftItem } from './contract'
import type { HomeFinance } from './types'

/*
 * Synthetic Student Home states for the dev preview and for tests. Fictional people and events only.
 * Times are Chicago wall-clock times so each state reads the same on any machine.
 */

export const at = (chicago: string) => {
  const epoch = parseChicagoInput(chicago)
  if (!Number.isFinite(epoch)) throw new Error(`Bad fixture time ${chicago}`)
  return epoch
}
const eventId = (key: string) => `fixture_event_${key}` as Id<'events'>
const inviteId = (key: string) => `fixture_invite_${key}` as Id<'roomInvites'>
const pinId = (key: string) => `fixture_pin_${key}` as GenericId<'teamAnnouncements'>
const studentId = 'fixture_student_dev' as Id<'students'>

export type StudentHomeFixture = {
  label: string
  now: number
  summary: StudentHomeSummary
  attendance: HomeAttendance
  announcements: PinnedAnnouncement[]
  finance: HomeFinance
  /** signupAvailability per event; a missing entry loads as an error. */
  availability: Record<string, SignupAvailability>
  /** Events whose Sign up fails in the preview, to show the error state. */
  failingSignups?: string[]
}

const season2027 = { name: '2026–2027 season', startsAt: at('2026-08-01T00:00'), kickoffAt: at('2027-01-09T00:00') }

const competitions = [
  { eventId: eventId('pri'), name: 'Pacific Robotics Invitational', startsAt: at('2026-11-21T08:00'), endsAt: at('2026-11-23T17:00') },
  { eventId: eventId('lonestar'), name: 'Lone Star Central Regional', startsAt: at('2027-03-04T08:00'), endsAt: at('2027-03-06T18:00') },
  { eventId: eventId('bayou'), name: 'Bayou Regional', startsAt: at('2027-03-25T08:00'), endsAt: at('2027-03-27T18:00') },
]

const signup = (key: string, name: string, type: OpenSignup['type'], startsAt: string, closesAt: string | null, feeCents: number, signupMode: OpenSignup['signupMode'] = 'open'): OpenSignup => ({
  eventId: eventId(key), name, type, startsAt: at(startsAt), endsAt: at(startsAt) + (type === 'Outreach' ? 3 : 8) * 60 * 60 * 1000, signupClosesAt: closesAt ? at(closesAt) : null, feeCents, signupMode,
})

const availabilityFor = (row: OpenSignup, capacity: number | null, spotsLeft: number | null, outcome: SignupAvailability['outcome']): SignupAvailability => ({
  eventId: row.eventId, name: row.name, startsAt: row.startsAt, endsAt: row.endsAt, feeCents: row.feeCents, signupMode: row.signupMode, signupClosesAt: row.signupClosesAt, capacity, spotsLeft, outcome,
})

const item = (key: string, kind: WhatsLeftItem['kind'], owner: WhatsLeftItem['owner'], extra: Partial<WhatsLeftItem> = {}): WhatsLeftItem => ({
  key, kind, owner, eventId: null, eventName: null, label: null, dueAt: null, href: null, ...extra,
})

const readyAttendance = (attended: number, held: number, outreach: [number, number], build: HomeAttendance['buildHours']): HomeAttendance => ({
  state: 'ready', meetings: { attended, held }, outreach: { attended: outreach[0], held: outreach[1] }, buildHours: build, kickoffAt: season2027.kickoffAt,
})

const summaryBase = (overrides: Partial<StudentHomeSummary>): StudentHomeSummary => ({
  studentId, greetingName: 'Dev', displayName: 'Dev Student', initials: 'DS', season: season2027, parentLinked: true, fundraiserLinked: false,
  whatsLeft: [], openSignups: [], roomChoices: [], competitions, ...overrides,
})

// Busy week: Highlights lead with an overdue fee (Fall Scrimmage started Oct 17), the permission form and
// the room choice that closes Friday (three to-do cards, the most allowed), then five pins and the countdown:
// nine cards, the most Highlights ever show. A signup closes Monday and money is due. The PRI fee (not
// overdue yet) and FIRST verification stay in What's left only.
const busySignups = [
  signup('glacier', 'Glacier Peak Classic', 'Competition', '2026-11-14T08:00', '2026-11-02T09:00', 8500),
  signup('oregon', 'Oregon State Scrimmage', 'Competition', '2026-12-05T08:00', '2026-11-13T23:59', 4000, 'approval'),
  signup('stem-night', 'Community STEM Night', 'Outreach', '2026-11-19T17:30', '2026-11-18T12:00', 0),
  // A Coach made this event assigned after Home loaded: the sheet explains there is no signup.
  signup('showcase', 'Library Robot Showcase', 'Outreach', '2026-12-03T16:00', '2026-11-20T23:59', 0),
]
const busyWeek: StudentHomeFixture = {
  label: 'Busy week',
  now: at('2026-10-26T12:00'),
  summary: summaryBase({
    fundraiserLinked: true,
    roomChoices: [{
      eventId: eventId('pri'), eventName: 'Pacific Robotics Invitational', startsAt: at('2026-11-21T08:00'), endsAt: at('2026-11-23T17:00'),
      roomDeadline: at('2026-10-30T23:59'), status: 'notChosen', groupName: null, memberNames: [],
      invitations: [{ inviteId: inviteId('jordan'), fromName: 'Jordan W.', initials: 'JW' }],
    }],
    openSignups: busySignups,
    whatsLeft: [
      item('room', 'roomChoice', 'student', { eventId: eventId('pri'), eventName: 'Pacific Robotics Invitational', dueAt: at('2026-10-30T23:59'), href: `/events/${eventId('pri')}/rooming` }),
      item('first', 'firstVerification', 'coach'),
      item('permission', 'permissionForm', 'parent', { eventId: eventId('pri'), eventName: 'Pacific Robotics Invitational', dueAt: at('2026-11-06T23:59') }),
      // Fees are due when the event starts (until fee due dates exist), so only Fall Scrimmage is overdue.
      item('payment-pri', 'requiredPayment', 'parent', { eventId: eventId('pri'), eventName: 'Pacific Robotics Invitational', dueAt: at('2026-11-21T08:00') }),
      item('payment-scrimmage', 'requiredPayment', 'parent', { eventId: eventId('scrimmage'), eventName: 'Fall Scrimmage', dueAt: at('2026-10-17T08:00') }),
      item('approval', 'signupApproval', 'coach', { eventId: eventId('winter'), eventName: 'Winter Showcase' }),
    ],
  }),
  attendance: readyAttendance(28, 34, [3, 5], { state: 'beforeKickoff', minutes: 0, targetHours: 120 }),
  announcements: [
    { id: pinId('hotel'), title: 'Hotel check-in', body: 'Check-in for the Pacific Robotics Invitational opens at 3 PM on Friday.\nRoom choice closes Friday night, so pick your group before then.\n\nPack for three days: a team shirt for each day, closed-toe shoes for the pit, a jacket for the bus and any medicine listed on your permission form.\nThe bus leaves the school at 6:30 AM. Eat breakfast before you come.', authorName: 'Sam Ortiz', authorRole: 'travelLead', pinnedAt: at('2026-10-24T09:00'), showUntil: at('2026-11-23T23:59') },
    { id: pinId('kickoff'), title: 'Kickoff watch party', body: 'We watch the game reveal together at school on January 9.\nBring your engineering notebook and a water bottle.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: at('2026-10-22T16:00'), showUntil: null },
    { id: pinId('expired'), title: 'Fall fundraiser', body: 'The fall fundraiser ended on October 25.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: at('2026-10-25T08:00'), showUntil: at('2026-10-25T23:59') },
    { id: pinId('shirts'), title: 'Team shirts', body: 'Shirt sizes are due Wednesday. Tell a Travel Lead if your size changed.', authorName: 'Sam Ortiz', authorRole: 'travelLead', pinnedAt: at('2026-10-21T10:00'), showUntil: null },
    { id: pinId('pit'), title: null, body: 'Pit crew practice moves to Thursday this week.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: at('2026-10-20T15:00'), showUntil: null },
    { id: pinId('photos'), title: 'Team photos', body: 'Team photos are at the start of the Tuesday meeting. Wear your team shirt.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: at('2026-10-19T09:00'), showUntil: null },
    // A sixth visible pin: Highlights show five at most, so this one stays off Home.
    { id: pinId('welcome'), title: 'Welcome back', body: 'Welcome to the 2026–2027 season.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: at('2026-08-03T09:00'), showUntil: null },
  ],
  finance: { state: 'ready', dueCents: 8500, availableCents: 4000 },
  availability: {
    [eventId('glacier')]: availabilityFor(busySignups[0], 24, 6, 'signedUp'),
    [eventId('oregon')]: availabilityFor(busySignups[1], 30, 0, 'waitlisted'),
    [eventId('stem-night')]: availabilityFor(busySignups[2], null, null, 'signedUp'),
    [eventId('showcase')]: { ...availabilityFor(busySignups[3], null, null, 'closed'), signupMode: 'assigned' },
  },
  failingSignups: [eventId('stem-night')],
}

// All done: nothing of the Student's own and no to-do cards (the room is final); one item waits for a
// Coach. Highlights show the pin, then the countdown.
const demoDay = signup('demo-day', 'Spring Demo Day', 'Outreach', '2026-12-12T10:00', '2026-11-16T23:59', 0)
const allDone: StudentHomeFixture = {
  label: 'All done',
  now: at('2026-10-26T12:00'),
  summary: summaryBase({
    roomChoices: [{ eventId: eventId('pri'), eventName: 'Pacific Robotics Invitational', startsAt: at('2026-11-21T08:00'), endsAt: at('2026-11-23T17:00'), roomDeadline: at('2026-10-30T23:59'), status: 'final', groupName: 'Room 3', memberNames: ['Jordan W.', 'Sam K.'], invitations: [] }],
    openSignups: [demoDay],
    whatsLeft: [item('verify', 'firstVerification', 'coach')],
  }),
  attendance: readyAttendance(28, 34, [3, 5], { state: 'beforeKickoff', minutes: 0, targetHours: 120 }),
  announcements: [
    { id: pinId('kickoff'), title: 'Kickoff watch party', body: 'We watch the game reveal together at school on January 9.\nBring your engineering notebook and a water bottle.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: at('2026-10-22T16:00'), showUntil: null },
  ],
  finance: { state: 'ready', dueCents: 0, availableCents: 0 },
  availability: { [eventId('demo-day')]: availabilityFor(demoDay, 40, 22, 'waitingForApproval') },
}

// New student: no parent linked yet, so Highlights lead with Invite a parent; FIRST registration (a
// parent's step for a Student under 18) waits behind it. No fundraiser page, nothing signed up.
const newSignups = [
  signup('glacier', 'Glacier Peak Classic', 'Competition', '2026-11-14T08:00', '2026-11-02T09:00', 8500),
  signup('demo-day', 'Spring Demo Day', 'Outreach', '2026-12-12T10:00', '2026-11-16T23:59', 0),
]
const newStudent: StudentHomeFixture = {
  label: 'New student',
  now: at('2026-10-26T12:00'),
  summary: summaryBase({
    greetingName: 'Riley', displayName: 'Riley Student', initials: 'RS', parentLinked: false,
    openSignups: newSignups,
    whatsLeft: [item('invite', 'inviteParent', 'student', { href: '/parents' }), item('first', 'firstRegistration', 'parent')],
  }),
  attendance: readyAttendance(1, 2, [0, 0], { state: 'beforeKickoff', minutes: 0, targetHours: null }),
  announcements: [],
  finance: { state: 'ready', dueCents: 0, availableCents: 0 },
  availability: {
    [eventId('glacier')]: availabilityFor(newSignups[0], 24, 1, 'signedUp'),
    [eventId('demo-day')]: availabilityFor(newSignups[1], null, null, 'signedUp'),
  },
}

// Before kickoff: under 48 hours to go, so the countdown is in hours. Money and attendance are updating.
// One calm to-do card (due in six weeks), then the countdown.
const beforeKickoff: StudentHomeFixture = {
  label: 'Before kickoff',
  now: at('2027-01-07T18:00'),
  summary: summaryBase({
    whatsLeft: [item('notebook', 'requirement', 'student', { eventId: eventId('lonestar'), eventName: 'Lone Star Central Regional', label: 'Engineering notebook check', dueAt: at('2027-02-20T23:59'), href: `/events/${eventId('lonestar')}` })],
  }),
  attendance: { ...readyAttendance(30, 36, [4, 6], { state: 'beforeKickoff', minutes: 0, targetHours: 120 }), state: 'updating' },
  announcements: [],
  finance: { state: 'updating' },
  availability: {},
}

// Build season: counting down to the next Competition; build hours are adding up. Highlights: an overdue
// and a due-soon requirement, then the calm room choice, the pin and the countdown. A fee is due but not
// overdue (the event has not started), so it has no card; the Student has no fundraiser page, so Balance
// due has no Fundraise button. The open signup has no availability entry, so its sheet shows the load error.
const openHouse = signup('open-house', 'Robotics Open House', 'Outreach', '2027-02-20T10:00', '2027-02-13T23:59', 0)
const buildSeason: StudentHomeFixture = {
  label: 'Build season',
  now: at('2027-02-01T16:00'),
  summary: summaryBase({
    roomChoices: [{
      eventId: eventId('lonestar'), eventName: 'Lone Star Central Regional', startsAt: at('2027-03-04T08:00'), endsAt: at('2027-03-06T18:00'),
      roomDeadline: at('2027-02-19T23:59'), status: 'inGroup', groupName: 'Room 4', memberNames: ['Jordan W.', 'Sam K.'], invitations: [],
    }],
    openSignups: [openHouse],
    whatsLeft: [
      item('inspection', 'requirement', 'student', { eventId: eventId('lonestar'), eventName: 'Lone Star Central Regional', label: 'Robot safety quiz', dueAt: at('2027-02-05T23:59'), href: `/events/${eventId('lonestar')}` }),
      item('notebook', 'requirement', 'student', { eventId: eventId('lonestar'), eventName: 'Lone Star Central Regional', label: 'Engineering notebook check', dueAt: at('2027-01-29T23:59'), href: `/events/${eventId('lonestar')}` }),
      item('permission', 'permissionReview', 'coach', { eventId: eventId('lonestar'), eventName: 'Lone Star Central Regional' }),
      item('payment', 'requiredPayment', 'parent', { eventId: eventId('lonestar'), eventName: 'Lone Star Central Regional', dueAt: at('2027-03-04T08:00') }),
    ],
  }),
  attendance: { ...readyAttendance(41, 48, [5, 7], { state: 'ready', minutes: 46 * 60 + 30, targetHours: 120 }), kickoffAt: season2027.kickoffAt },
  announcements: [
    { id: pinId('shop'), title: null, body: 'The shop is open until 9 PM every weeknight during build season. Sign the clock in and out each time.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: at('2027-01-12T08:00'), showUntil: null },
  ],
  finance: { state: 'ready', dueCents: 12000, availableCents: 2500 },
  availability: {},
}

export const studentHomeFixtures = { busyWeek, allDone, newStudent, beforeKickoff, buildSeason } satisfies Record<string, StudentHomeFixture>
export type StudentHomeFixtureName = keyof typeof studentHomeFixtures
