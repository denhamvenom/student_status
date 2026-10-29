import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { chicagoDateKey } from '../student-home/format'
import { useNow } from '../student-home/useNow'
import type { ParentHomeFinance, ParentHomeSummary, ParentPinnedAnnouncement } from './contract'
import { ParentHomeView, type ParentHomeSource } from './ParentHomeView'

type Loadable<T> = T | Error | undefined
const none: ReadonlySet<ParentHomeSource> = new Set()

export function ParentHome({ studentId, studentName }: { studentId: Id<'students'>; studentName: string }) {
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
    }
    return Object.fromEntries(Object.entries(all).filter(([source]) => !paused.has(source as ParentHomeSource)))
  }, [studentId, asOfDay, now, paused])
  const results = useQueries(queries)
  const retry = useCallback((source: ParentHomeSource) => setPaused(previous => new Set([...previous, source])), [])
  return <ParentHomeView studentName={studentName} now={now} summary={results.summary as Loadable<ParentHomeSummary>} announcements={results.announcements as Loadable<ParentPinnedAnnouncement[]>} finance={results.finance as Loadable<ParentHomeFinance>} retry={retry} />
}
