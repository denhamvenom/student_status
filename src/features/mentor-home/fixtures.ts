import type { Id } from '../../../convex/_generated/dataModel'
import { at } from '../student-home/fixtures'
import type { ClockedInData, JoinEntry, MentorHomeData, MentorMeeting, MentorMeetingDetail } from './contract'

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
  return { canCreateMeeting: true, subteams: [], scheduled: [], pendingInvites: [], signUpAvailable: [], joinable: [], created: [], createdSeries: [], truncated: false, ...overrides }
}

/**
 * One "Events you can join" entry from its next meeting (mentorHome.joinable). A meeting with a seriesId becomes a series
 * entry; pass the schedule ("Mondays at 6:00 PM") and how many meetings are upcoming.
 */
export function joinEntry(next: MentorMeeting, overrides: Partial<JoinEntry> = {}): JoinEntry {
  const series = next.seriesId !== null
  const competition = next.type === 'Competition' || next.questions.askDrive || next.questions.askHotel
  return {
    kind: series ? 'series' : 'event', category: competition ? 'competitionsAndTrips' : 'meetings', forYourSubteam: false, title: next.title, seriesId: next.seriesId,
    repeatLabel: series ? next.repeatLabel : null, scheduleLabel: null, nextEventId: next.eventId, nextStartsAt: next.startsAt, upcomingCount: 1, joinableCount: 1,
    hasSeriesSignup: next.seriesSignup !== null, next, ...overrides,
  }
}

/** Who's here now for a Mentor's subteams: `groups` maps each subteam to the names clocked in. */
export function clockedIn(groups: Record<string, string[]>, truncated = false): ClockedInData {
  const subteams = Object.entries(groups).map(([subteam, names]) => ({ subteam, count: names.length, students: names.map((displayName, i) => ({ displayName, subteam, clockedInAt: NOW - (i + 1) * 600_000 })) }))
  return { subteams, totalCount: new Set(subteams.flatMap(group => group.students.map(student => student.displayName))).size, truncated }
}

const programming = { kind: 'subteams' as const, subteams: ['Programming'], required: false, text: 'Subteams: Programming' }
const busyOpen = [
  meeting('CAD design review', at('2026-11-09T18:30'), { canSignUp: true, audience: { kind: 'subteams', subteams: ['CAD'], required: false, text: 'Subteams: CAD' } }),
  meeting('Team meeting', at('2026-11-11T18:00'), { canSignUp: true, audience: { kind: 'everyone', subteams: [], required: true, text: 'Everyone (required)' } }),
  meeting('Monday open shop', at('2026-11-09T18:00'), { canSignUp: true, seriesId: 'fixture_series_shop' as Id<'eventSeries'>, repeatLabel: 'Repeats weekly' }),
  meeting('Programming robot code', at('2026-11-10T19:00'), { canSignUp: true, seriesId: 'fixture_series_prog' as Id<'eventSeries'>, repeatLabel: 'Repeats weekly', audience: programming }),
  meeting('Bayou Robotics Showcase', at('2026-11-20T08:00'), { canSignUp: true, type: 'Competition', questions: { askDrive: true, askHotel: false }, place: 'Baton Rouge River Center' }),
]

const busy = homeData({
  subteams: ['Programming', 'CAD'],
  scheduled: [
    meeting('Programming build night', at('2026-11-10T18:00'), { ...going, audience: { kind: 'subteams', subteams: ['Programming'], required: false, text: 'Subteams: Programming' } }),
    meeting('Autonomous review', at('2026-11-12T19:00'), { ...self, virtual: true, place: 'Virtual (Discord)' }),
    // Travel + Your subteam on Coming up; no drive or hotel answer yet, so it is also under Needs your answer.
    meeting('Lone Star Qualifier', at('2026-11-20T07:00'), { ...going, type: 'Competition', questions: { askDrive: true, askHotel: true }, endsAt: at('2026-11-21T18:00'), place: 'Houston, TX', audience: programming }),
    meeting('Saturday shop day', at('2026-11-14T09:00'), { ...self }),
  ],
  pendingInvites: [meeting('River City Regional', at('2026-11-21T07:00'), { ...invited, endsAt: at('2026-11-22T18:00'), place: 'Kansas City Convention Center' })],
  signUpAvailable: busyOpen,
  joinable: [
    joinEntry(busyOpen[0], { forYourSubteam: true }),
    joinEntry(busyOpen[1]),
    joinEntry(busyOpen[2], { scheduleLabel: 'Mondays at 6:00 PM', upcomingCount: 8, joinableCount: 8 }),
    joinEntry(busyOpen[3], { title: 'Programming robot code nights', forYourSubteam: true, scheduleLabel: 'Tuesdays and Thursdays at 7:00 PM', upcomingCount: 16, joinableCount: 16 }),
    joinEntry(busyOpen[4]),
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

const signupsOpen = [
  meeting('Programming build night', at('2026-11-17T18:00'), { ...open, ...series('build'), ...signup('all', null, true), eventId: meetingId('Programming build night 2') }),
  meeting('Library outreach', at('2026-11-15T10:00'), { ...open, type: 'Outreach', place: 'Denham Springs Library' }),
  meeting('Bayou Robotics Showcase', at('2026-11-20T08:00'), { ...open, ...travel, place: 'Baton Rouge River Center' }),
  meeting('State Championship', at('2026-12-04T07:00'), { ...open, ...overnight, endsAt: at('2026-12-05T18:00'), place: 'Lafayette Cajundome' }),
  meeting('Wednesday CAD lab', at('2026-11-12T18:00'), { ...open, ...series('cad') }),
  meeting('Team pancake breakfast', at('2026-11-16T08:00'), { ...open, type: 'Fundraiser', place: 'Applebee’s, Denham Springs' }),
]

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
  signUpAvailable: signupsOpen,
  // The skipped build night is grouped too, but Events you can join leaves it out (it shows as Skipped on the schedule).
  joinable: signupsOpen.map(row => joinEntry(row, row.seriesId === null ? {} : {
    scheduleLabel: row.title === 'Wednesday CAD lab' ? 'Thursdays at 6:00 PM' : 'Tuesdays at 6:00 PM', upcomingCount: 6, joinableCount: 6,
  })),
})

/** Each preview state's Mentor Home data and Who's here now (busy: one subteam with students, one empty). */
export const mentorHomeFixtures = {
  busy: { now: NOW, name: 'Morgan Lee', data: busy, here: clockedIn({ Programming: ['Avery N.', 'Jordan W.', 'Riley P.'], CAD: [] }) },
  empty: { now: NOW, name: 'Morgan Lee', data: homeData(), here: clockedIn({}) },
  invitesOnly: { now: NOW, name: 'Morgan Lee', data: homeData({ subteams: ['Mechanical'], pendingInvites: busy.pendingInvites }), here: clockedIn({ Mechanical: [] }) },
  signups: { now: NOW, name: 'Morgan Lee', data: signups, here: clockedIn({ Programming: ['Jordan W.'] }, true) },
}

/** A pinned staff message for the preview's banner (fictional). */
export const pinnedFixture = { id: 'fixture_pin_1', title: 'Robot reveal moved to Sat, Nov 21.', body: 'Robot reveal moved to Sat, Nov 21. Same time and place.', authorName: 'Coach Rivera', pinnedAt: NOW - 3_600_000, showUntil: null }

export const meetingDetailFixture: MentorMeetingDetail = {
  meeting: busy.created[0],
  mentors: [{ userId: 'fixture_user_1' as Id<'appUsers'>, name: 'Morgan Lee', isCreator: true }, { userId: 'fixture_user_2' as Id<'appUsers'>, name: 'Sam Ortiz', isCreator: false }],
  pendingMentors: [{ userId: 'fixture_user_3' as Id<'appUsers'>, name: 'Alex Kim', status: 'invited' }],
  students: [{ displayName: 'Jordan W.', subteam: 'Programming' }],
  studentsTruncated: false,
}
