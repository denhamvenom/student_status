import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AskCoachButton } from '@/AskCoachButton'
import { TaskSheetEmailContext } from '@/features/student-home/tiles/TaskSheet'
import { chicagoDateKey } from '../student-home/format'
import { useNow } from '../student-home/useNow'
import { toAgendaEvents, type ListedEventRow } from '../student-home/agenda'
import type { ParentHomeFinance, ParentHomeSummary, ParentPinnedAnnouncement } from './contract'
import { ParentHomeView, type ParentHomeSource } from './ParentHomeView'

type Loadable<T> = T | Error | undefined
const none: ReadonlySet<ParentHomeSource> = new Set()

export function ParentHome({ studentId, studentName, email }: { studentId: Id<'students'>; studentName: string; email?: string }) {
  const now = useNow()
  const asOfDay = chicagoDateKey(now)
  const [paused, setPaused] = useState(none)
  useEffect(() => {
    if (!paused.size) return
    const timer = window.setTimeout(() => setPaused(none), 0)
    return () => window.clearTimeout(timer)
  }, [paused])
  const queries = useMemo(() => {
    const all = {
    summary: { query: api.studentHome.parentSummary, args: { studentId, asOfDay, asOf: now } },
    announcements: { query: api.announcements.pinnedForParentHome, args: {} },
    finance: { query: api.dashboardReports.familyFinance, args: { studentId } },
    events: { query: api.app.listEvents, args: {} },
    }
    return Object.fromEntries(Object.entries(all).filter(([source]) => !paused.has(source as ParentHomeSource)))
  }, [studentId, asOfDay, now, paused])
  const results = useQueries(queries)
  const rows = results.events as Loadable<ListedEventRow[]>
  const events = useMemo(() => rows === undefined || rows instanceof Error ? rows : toAgendaEvents(rows), [rows])
  const retry = useCallback((source: ParentHomeSource) => setPaused(previous => new Set([...previous, source])), [])
  return <div className="flex min-w-0 flex-col gap-3 md:mx-auto md:max-w-[720px] lg:max-w-none">
    <TaskSheetEmailContext.Provider value={email}><ParentHomeView studentName={studentName} now={now} summary={results.summary as Loadable<ParentHomeSummary>} announcements={results.announcements as Loadable<ParentPinnedAnnouncement[]>} finance={results.finance as Loadable<ParentHomeFinance>} events={events} retry={retry} /></TaskSheetEmailContext.Provider>
    <div><AskCoachButton email={email} /></div>
  </div>
}
