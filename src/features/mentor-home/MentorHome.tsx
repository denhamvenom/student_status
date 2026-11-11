import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueries } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { browserStorage } from '@/lib/staff-setup-skip'
import { useNow } from '../student-home/useNow'
import type { MentorHomeData } from './contract'
import { pinKey, subteamsLine, unreadPinned } from './logic'
import type { MentorActions } from './MentorSignupWizard'
import { MentorHomeBlocks, MentorHomeView, PinnedBannerView, type MentorHomeHandlers } from './MentorHomeView'
import { useClockedIn } from './WhoIsHere'

const copy = mentorHomeCopy

/** The Mentor's own sign-up mutations (Home, Schedule and the event page share them). The server re-checks every rule. */
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

/** The Mentor Home query and the Mentor's own sign-up actions (shared with Schedule and the Travel Lead's My schedule). */
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

// Dismissed pinned messages are remembered on this device per signed-in user, by id and pin time only (no message text), newest 50.
const dismissedKey = (userId: string) => `venom.mentorHome.dismissedPins.${userId}`
const MAX_DISMISSED = 50

function readDismissed(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(browserStorage()?.getItem(dismissedKey(userId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}

/**
 * The small pinned-announcement banner on Mentor Home: the newest pinned staff message this Mentor hasn't dismissed here.
 * Nothing shows while it loads, when it fails (the Inbox still lists every message) or when there is none unread.
 */
export function PinnedBanner({ userId }: { userId: string }) {
  const results = useQueries(useMemo(() => ({ pinned: { query: api.announcements.pinnedForStaffHome, args: {} } }), []))
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(userId))
  // The browser decides whether Show until has passed; queries can't read the clock.
  const [now] = useState(() => Date.now())
  const pinned = results.pinned as FunctionReturnType<typeof api.announcements.pinnedForStaffHome> | Error | undefined
  const message = Array.isArray(pinned) ? unreadPinned(pinned, new Set(dismissed), now) : null
  if (!message) return null
  const dismiss = () => {
    const next = [...dismissed.filter(key => key !== pinKey(message)), pinKey(message)].slice(-MAX_DISMISSED)
    setDismissed(next)
    try { browserStorage()?.setItem(dismissedKey(userId), JSON.stringify(next)) } catch { /* Storage can be full or blocked; it stays dismissed until reload. */ }
    toast.success(copy.pinned.dismissed)
  }
  return <PinnedBannerView message={message} onDismiss={dismiss} />
}

/** Mentor Home: the Home query (mentorHome.mentorHome), Who's here now (mentorClockedIn.mySubteamClockedIn) and the pinned banner. */
export function MentorHome({ name, userId, email }: { name: string; userId: string; email?: string }) {
  const now = useNow()
  const { data, handlers } = useMentorHomeData(now)
  const here = useClockedIn(now)
  return <MentorHomeView name={name} now={now} data={data} handlers={handlers} here={here} email={email} banner={<PinnedBanner key={userId} userId={userId} />} />
}

/**
 * My schedule, at the top of the Travel Lead's Home (a Travel Lead is a Mentor too, including a Parent acting as one): the
 * same blocks as Mentor Home, followed by their staff home. Pinned messages stay in the staff home below.
 */
export function TravelLeadSchedule() {
  const id = useId()
  const now = useNow()
  const { data, handlers } = useMentorHomeData(now)
  const here = useClockedIn(now)
  return <section aria-labelledby={id} className="mb-6 flex min-w-0 flex-col gap-3 font-sans text-vs-text md:max-w-[720px]">
    <h2 id={id} className="m-0!">{copy.mySchedule}</h2>
    <MentorHomeBlocks now={now} data={data} handlers={handlers} here={here} />
  </section>
}

/** About you, in the Mentor's More menu: their subteams, Edit my profile and Team report. */
export function MentorAboutYou({ onNavigate, className }: { onNavigate: () => void; className?: string }) {
  const id = useId()
  const now = useNow()
  const { data } = useMentorHomeData(now)
  const subteams = data === undefined ? copy.about.loading : data instanceof Error ? null : subteamsLine(data.subteams)
  return <section aria-labelledby={id} className={className}>
    <h3 id={id}>{copy.about.title}</h3>
    {subteams && <p className="m-0 px-1 pb-1 text-[14px] text-vs-text-2">{subteams}</p>}
    <Link to="/myprofile" onClick={onNavigate}>{copy.about.profile}</Link>
    <Link to="/report" onClick={onNavigate}>{copy.about.report}</Link>
  </section>
}
