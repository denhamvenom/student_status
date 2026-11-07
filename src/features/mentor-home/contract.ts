import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

/** mentorHome.mentorHome: the signed-in Mentor's meetings, subteams and repeating series. */
export type MentorHomeData = FunctionReturnType<typeof api.mentorHome.mentorHome>

/** One minimized meeting row (mentorMeetings.mentorMeetingSummary). */
export type MentorMeeting = MentorHomeData['scheduled'][number]

/** A repeating series the Mentor created. */
export type MentorSeries = MentorHomeData['createdSeries'][number]

/** mentorMeetings.view: one meeting's minimized page. */
export type MentorMeetingDetail = FunctionReturnType<typeof api.mentorMeetings.view>

/** One "Events you can join" entry: a whole repeating series, or a one-time event (mentorHome.joinable). */
export type JoinEntry = MentorHomeData['joinable'][number]

/** mentorClockedIn.mySubteamClockedIn: students of the Mentor's subteams clocked in at Timeclock now. */
export type ClockedInData = FunctionReturnType<typeof api.mentorClockedIn.mySubteamClockedIn>
