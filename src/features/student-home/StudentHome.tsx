import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useLiveSignupSource } from '../event-signup/wizardSource'
import { toAgendaEvents, type AgendaEvent, type ListedEventRow } from './agenda'
import type { HomeAttendance, PinnedAnnouncement, StudentHomeSummary } from './contract'
import { chicagoDateKey } from './format'
import { StudentHomeView } from './StudentHomeView'
import type { HomeFinance, HomeTileSource, Loadable, StudentHomeHandlers } from './types'
import { useNow } from './useNow'

const summaryQuery = api.studentHome.summary
const homeAttendanceQuery = api.dashboardReports.homeAttendance
const pinnedQuery = api.announcements.pinnedForHome

type FamilyFinance = FunctionReturnType<typeof api.dashboardReports.familyFinance>

function toHomeFinance(result: Loadable<FamilyFinance>): Loadable<HomeFinance> {
  if (result === undefined || result instanceof Error) return result
  return result.state === 'ready' ? { state: 'ready', dueCents: result.dueCents, availableCents: result.travelBalanceCents } : { state: result.state }
}

const noSources: ReadonlySet<HomeTileSource> = new Set()

/**
 * Keeps showing the last summary while the next one loads (the summary is re-read for the new day
 * after Chicago midnight), so the tiles do not flash back to skeletons. An error clears it, so
 * "Try again" after a failure shows the loading state rather than older data.
 */
function useSteadySummary(current: Loadable<StudentHomeSummary>): Loadable<StudentHomeSummary> {
  const [last, setLast] = useState<StudentHomeSummary | undefined>(undefined)
  const next = current instanceof Error ? undefined : current ?? last
  if (next !== last) setLast(next)
  return current === undefined ? last : current
}

/** app.listEvents rows as Next up / This week events; recomputed only when the rows change. */
function useAgendaEvents(rows: Loadable<ListedEventRow[]>): Loadable<AgendaEvent[]> {
  return useMemo(() => rows === undefined || rows instanceof Error ? rows : toAgendaEvents(rows), [rows])
}

/**
 * Loads every Home source without throwing (useQueries reports errors as values), so one failed
 * query only breaks its own tile. "Try again" drops the tile's subscriptions for a tick and
 * subscribes again, which asks the server to run the queries afresh.
 */
function useStudentHomeData(studentId: Id<'students'>, asOfDay: string) {
  const [paused, setPaused] = useState(noSources)
  useEffect(() => {
    if (paused.size === 0) return
    const timer = window.setTimeout(() => setPaused(noSources), 0)
    return () => window.clearTimeout(timer)
  }, [paused])
  const queries = useMemo(() => {
    const all = {
      summary: { query: summaryQuery, args: { asOfDay } },
      attendance: { query: homeAttendanceQuery, args: { studentId } },
      announcements: { query: pinnedQuery, args: {} },
      finance: { query: api.dashboardReports.familyFinance, args: { studentId } },
      events: { query: api.app.listEvents, args: {} },
    }
    return Object.fromEntries(Object.entries(all).filter(([source]) => !paused.has(source as HomeTileSource)))
  }, [studentId, asOfDay, paused])
  const results = useQueries(queries)
  // A tile can retry several sources in one go (the hero reads the summary and the pinned messages).
  const retry = useCallback((source: HomeTileSource) => setPaused(previous => previous.has(source) ? previous : new Set([...previous, source])), [])
  const summary = useSteadySummary(results.summary as Loadable<StudentHomeSummary>)
  return {
    summary,
    attendance: results.attendance as Loadable<HomeAttendance>,
    announcements: results.announcements as Loadable<PinnedAnnouncement[]>,
    finance: toHomeFinance(results.finance as Loadable<FamilyFinance>),
    events: useAgendaEvents(results.events as Loadable<ListedEventRow[]>),
    retry,
  }
}

/** Student Home for the signed-in Student. `studentId` is the Student's own record (viewer.students[0]). */
export function StudentHome({ studentId }: { studentId: Id<'students'> }) {
  const now = useNow()
  const asOfDay = chicagoDateKey(now)
  const { summary, attendance, announcements, finance, events, retry } = useStudentHomeData(studentId, asOfDay)
  const signup = useLiveSignupSource()
  const handlers = useMemo<StudentHomeHandlers>(() => ({ signup, retry }), [signup, retry])
  return <StudentHomeView summary={summary} attendance={attendance} announcements={announcements} finance={finance} events={events} now={now} handlers={handlers} />
}
