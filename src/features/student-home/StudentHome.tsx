import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries } from 'convex/react'
import { makeFunctionReference, type FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { HomeAttendance, PinnedAnnouncement, SignupAvailability, StudentHomeSummary } from './contract'
import { chicagoDateKey } from './format'
import { StudentHomeView } from './StudentHomeView'
import type { HomeFinance, HomeTileSource, Loadable, StudentHomeHandlers } from './types'
import { useNow } from './useNow'

/*
 * The Student Home queries are built in parallel with this screen, so they are referenced by name
 * and typed with the shared contract. Once they exist in convex/_generated/api, these can switch
 * to api.studentHome.summary etc. without changing the screen.
 */
const summaryQuery = makeFunctionReference<'query', { asOfDay: string }, StudentHomeSummary>('studentHome:summary')
const homeAttendanceQuery = makeFunctionReference<'query', { studentId: Id<'students'> }, HomeAttendance>('dashboardReports:homeAttendance')
const pinnedQuery = makeFunctionReference<'query', Record<string, never>, PinnedAnnouncement[]>('announcements:pinnedForHome')
const availabilityQuery = makeFunctionReference<'query', { eventId: Id<'events'> }, SignupAvailability>('participation:signupAvailability')

type FamilyFinance = FunctionReturnType<typeof api.dashboardReports.familyFinance>

function toHomeFinance(result: Loadable<FamilyFinance>): Loadable<HomeFinance> {
  if (result === undefined || result instanceof Error) return result
  return result.state === 'ready' ? { state: 'ready', dueCents: result.dueCents, availableCents: result.travelBalanceCents } : { state: result.state }
}

/**
 * Loads every Home source without throwing (useQueries reports errors as values), so one failed
 * query only breaks its own tile. "Try again" drops that one subscription for a tick and
 * subscribes again, which asks the server to run the query afresh.
 */
function useStudentHomeData(studentId: Id<'students'>, asOfDay: string) {
  const [paused, setPaused] = useState<HomeTileSource | null>(null)
  useEffect(() => {
    if (!paused) return
    const timer = window.setTimeout(() => setPaused(null), 0)
    return () => window.clearTimeout(timer)
  }, [paused])
  const queries = useMemo(() => {
    const all = {
      summary: { query: summaryQuery, args: { asOfDay } },
      attendance: { query: homeAttendanceQuery, args: { studentId } },
      announcements: { query: pinnedQuery, args: {} },
      finance: { query: api.dashboardReports.familyFinance, args: { studentId } },
    }
    return Object.fromEntries(Object.entries(all).filter(([source]) => source !== paused))
  }, [studentId, asOfDay, paused])
  const results = useQueries(queries)
  const retry = useCallback((source: HomeTileSource) => setPaused(source), [])
  return {
    summary: results.summary as Loadable<StudentHomeSummary>,
    attendance: results.attendance as Loadable<HomeAttendance>,
    announcements: results.announcements as Loadable<PinnedAnnouncement[]>,
    finance: toHomeFinance(results.finance as Loadable<FamilyFinance>),
    retry,
  }
}

/** Passed to the view as a hook; runs inside the open signup sheet. */
function useSignupAvailability(eventId: Id<'events'>): Loadable<SignupAvailability> {
  const queries = useMemo(() => ({ availability: { query: availabilityQuery, args: { eventId } } }), [eventId])
  return useQueries(queries).availability as Loadable<SignupAvailability>
}

/** Student Home for the signed-in Student. `studentId` is the Student's own record (viewer.students[0]). */
export function StudentHome({ studentId }: { studentId: Id<'students'> }) {
  const now = useNow()
  const asOfDay = chicagoDateKey(now)
  const { summary, attendance, announcements, finance, retry } = useStudentHomeData(studentId, asOfDay)
  const signUp = useMutation(api.participation.signUp)
  const handlers = useMemo<StudentHomeHandlers>(() => ({
    signUp: eventId => signUp({ eventId }),
    useAvailability: useSignupAvailability,
    retry,
  }), [signUp, retry])
  return <StudentHomeView summary={summary} attendance={attendance} announcements={announcements} finance={finance} now={now} handlers={handlers} />
}
