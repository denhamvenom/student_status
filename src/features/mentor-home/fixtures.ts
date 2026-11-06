import type { Id } from '../../../convex/_generated/dataModel'
import { at } from '../student-home/fixtures'
import type { MentorHomeData, MentorMeeting, MentorMeetingDetail } from './contract'

/*
 * Synthetic Mentor Home states for the dev preview and for tests. Fictional people and meetings only.
 * Times are Chicago wall-clock times so each state reads the same on any machine.
 */

export const NOW = at('2026-11-06T12:00')
const HOUR = 3_600_000

export const meetingId = (key: string) => `fixture_meeting_${key}` as Id<'events'>

export function meeting(key: string, startsAt: number, overrides: Partial<MentorMeeting> = {}): MentorMeeting {
  return {
    eventId: meetingId(key), title: key, type: 'Team', startsAt, endsAt: startsAt + 2 * HOUR, place: 'DSHS STEM Center (on site)', virtual: false, cancelled: false,
    audience: { kind: 'everyone', subteams: [], required: false, text: 'Everyone' }, seriesId: null, repeatLabel: null, calendarRevision: 0,
    myStatus: null, mySource: null, questions: { askDrive: false, askHotel: false }, myAnswers: { canDriveStudents: null, needsHotelRoom: null }, seriesSignup: null,
    isCreator: false, canSignUp: false, canWithdraw: false, canManage: false,
    ...overrides,
  }
}

const going = { myStatus: 'accepted', mySource: 'individual', canWithdraw: true } as const
const self = { myStatus: 'accepted', mySource: 'self', canWithdraw: true } as const
const invited = { myStatus: 'invited', mySource: 'individual', canSignUp: true } as const
const open = { canSignUp: true } as const
const mine = { isCreator: true, canManage: true } as const

export function homeData(overrides: Partial<MentorHomeData> = {}): MentorHomeData {
  return { canCreateMeeting: true, subteams: [], scheduled: [], pendingInvites: [], signUpAvailable: [], created: [], createdSeries: [], truncated: false, ...overrides }
}

const busy = homeData({
  subteams: ['Programming', 'CAD'],
  scheduled: [
    meeting('Programming build night', at('2026-11-10T18:00'), { ...going, audience: { kind: 'subteams', subteams: ['Programming'], required: false, text: 'Subteams: Programming' } }),
    meeting('Autonomous review', at('2026-11-12T19:00'), { ...self, virtual: true, place: 'Virtual (Discord)' }),
  ],
  pendingInvites: [meeting('River City Regional', at('2026-11-21T07:00'), { ...invited, endsAt: at('2026-11-22T18:00'), place: 'Kansas City Convention Center' })],
  signUpAvailable: [
    meeting('CAD design review', at('2026-11-09T18:30'), { ...open, audience: { kind: 'subteams', subteams: ['CAD'], required: false, text: 'Subteams: CAD' } }),
    meeting('Team meeting', at('2026-11-11T18:00'), { ...open, audience: { kind: 'everyone', subteams: [], required: true, text: 'Everyone (required)' } }),
  ],
  created: [
    meeting('Mentor planning', at('2026-11-08T19:30'), { ...mine, virtual: true, place: 'Virtual (Discord)', audience: { kind: 'mentorsOnly', subteams: [], required: false, text: 'Mentors only' } }),
    meeting('Soldering basics', at('2026-11-14T10:00'), { ...mine, cancelled: true, canManage: false }),
  ],
  createdSeries: [{ seriesId: 'fixture_series_1' as Id<'eventSeries'>, name: 'Mentor planning', status: 'active', weekdays: [0], intervalWeeks: 1, localStartTime: '19:30', durationMinutes: 60, startDate: '2026-11-08', untilDate: null, count: 10 }],
})

const series = (key: string, repeatLabel = 'Repeats weekly') => ({ seriesId: `fixture_series_${key}` as Id<'eventSeries'>, repeatLabel })
const travel = { type: 'Competition', questions: { askDrive: true, askHotel: false } } as const
const overnight = { type: 'Competition', questions: { askDrive: true, askHotel: true } } as const
const signup = (scope: 'all' | 'one' | 'next', count: number | null = null, skipped = false) => ({ seriesSignup: { scope, count, coversThisMeeting: !skipped, skippedThisMeeting: skipped } })

/** Every sign-up shape the wizard and the series actions handle: travel, overnight, series every / next N / one, skipped. */
const signups = homeData({
  subteams: ['Programming'],
  scheduled: [
    meeting('Programming build night', at('2026-11-10T18:00'), { ...self, ...series('build'), ...signup('all') }),
    meeting('Driver practice', at('2026-11-11T18:00'), { ...self, ...series('drive', 'Repeats every 2 weeks'), ...signup('next', 4) }),
    meeting('Scouting workshop', at('2026-11-13T18:00'), { ...self, ...series('scout'), ...signup('one') }),
    meeting('Lone Star Qualifier', at('2026-11-14T07:00'), { ...going, ...travel, endsAt: at('2026-11-14T19:00'), place: 'Austin Convention Center', myAnswers: { canDriveStudents: true, needsHotelRoom: null } }),
  ],
  pendingInvites: [meeting('River City Regional', at('2026-11-21T07:00'), { ...invited, ...overnight, endsAt: at('2026-11-22T18:00'), place: 'Kansas City Convention Center' })],
  signUpAvailable: [
    meeting('Programming build night', at('2026-11-17T18:00'), { ...open, ...series('build'), ...signup('all', null, true), eventId: meetingId('Programming build night 2') }),
    meeting('Library outreach', at('2026-11-15T10:00'), { ...open, type: 'Outreach', place: 'Denham Springs Library' }),
    meeting('Bayou Robotics Showcase', at('2026-11-20T08:00'), { ...open, ...travel, place: 'Baton Rouge River Center' }),
    meeting('State Championship', at('2026-12-04T07:00'), { ...open, ...overnight, endsAt: at('2026-12-05T18:00'), place: 'Lafayette Cajundome' }),
    meeting('Wednesday CAD lab', at('2026-11-12T18:00'), { ...open, ...series('cad') }),
    meeting('Team pancake breakfast', at('2026-11-16T08:00'), { ...open, type: 'Fundraiser', place: 'Applebee’s, Denham Springs' }),
  ],
})

export const mentorHomeFixtures = {
  busy: { now: NOW, name: 'Morgan Lee', data: busy },
  empty: { now: NOW, name: 'Morgan Lee', data: homeData() },
  invitesOnly: { now: NOW, name: 'Morgan Lee', data: homeData({ subteams: ['Mechanical'], pendingInvites: busy.pendingInvites }) },
  signups: { now: NOW, name: 'Morgan Lee', data: signups },
}

export const meetingDetailFixture: MentorMeetingDetail = {
  meeting: busy.created[0],
  mentors: [{ userId: 'fixture_user_1' as Id<'appUsers'>, name: 'Morgan Lee', isCreator: true }, { userId: 'fixture_user_2' as Id<'appUsers'>, name: 'Sam Ortiz', isCreator: false }],
  pendingMentors: [{ userId: 'fixture_user_3' as Id<'appUsers'>, name: 'Alex Kim', status: 'invited' }],
  students: [{ displayName: 'Jordan W.', subteam: 'Programming' }],
  studentsTruncated: false,
}
