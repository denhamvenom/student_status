import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { StaffHomeAnnouncements } from '../announcements/StaffHomeAnnouncements'
import { useNow } from '../student-home/useNow'
import type { MentorHomeData } from './contract'
import type { MentorHomeHandlers } from './MentorMeetingRow'
import type { MentorActions } from './MentorSignupWizard'
import { MentorHomeView } from './MentorHomeView'
import { useClockedIn } from './WhoIsHere'

/** The Mentor's own sign-up mutations (Home, Your schedule and the event page share them). The server re-checks every rule. */
export function useMentorActions(): MentorActions {
  const signUp = useMutation(api.mentorMeetings.signUp)
  const withdraw = useMutation(api.mentorMeetings.withdraw)
  const skip = useMutation(api.mentorMeetings.skipMeeting)
  const leaveSeries = useMutation(api.mentorMeetings.leaveSeries)
  const updateAnswers = useMutation(api.mentorMeetings.updateAnswers)
  const respond = useMutation(api.mentorInvites.respond)
  return useMemo<MentorActions>(() => ({
    signUp: (meeting, args) => signUp({ eventId: meeting.eventId, ...args }),
    respond: (meeting, status, args) => respond({ eventId: meeting.eventId, status, ...(status === 'accepted' ? args : {}) }),
    updateAnswers: (meeting, answers, allMeetingsInSeries) => updateAnswers({ eventId: meeting.eventId, ...answers, allMeetingsInSeries }),
    withdraw: meeting => withdraw({ eventId: meeting.eventId }),
    skip: meeting => skip({ eventId: meeting.eventId }),
    leaveSeries: async meeting => {
      if (!meeting.seriesId) throw new ConvexError('This meeting doesn’t repeat. Use Leave instead.')
      return (await leaveSeries({ seriesId: meeting.seriesId })).left
    },
  }), [signUp, withdraw, skip, leaveSeries, updateAnswers, respond])
}

/** The Mentor Home query and the Mentor's own sign-up actions (shared with the Your schedule page). */
export function useMentorHomeData(now: number) {
  // Queries can't read the clock: pass the time rounded down to the minute (the server still re-checks in mutations).
  const asOf = Math.floor(now / 60_000) * 60_000
  // "Try again" drops the subscription for one render, then subscribes again (same pattern as Parent Home).
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!paused) return
    const timer = window.setTimeout(() => setPaused(false), 0)
    return () => window.clearTimeout(timer)
  }, [paused])
  const queries = useMemo(() => Object.fromEntries(paused ? [] : [['home', { query: api.mentorHome.mentorHome, args: { asOf } }]]), [paused, asOf])
  const results = useQueries(queries)
  const actions = useMentorActions()
  const retry = useCallback(() => setPaused(true), [])
  const handlers = useMemo<MentorHomeHandlers>(() => ({ ...actions, retry }), [actions, retry])
  return { data: results.home as MentorHomeData | Error | undefined, handlers }
}

/** Mentor Home: the Home query (mentorHome.mentorHome) and Who's here now (mentorClockedIn.mySubteamClockedIn). */
export function MentorHome({ name }: { name: string }) {
  const now = useNow()
  const { data, handlers } = useMentorHomeData(now)
  const here = useClockedIn(now)
  return <MentorHomeView name={name} now={now} data={data} handlers={handlers} here={here} announcements={<StaffHomeAnnouncements />} />
}
