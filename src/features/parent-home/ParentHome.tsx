import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AskCoachButton } from '@/AskCoachButton'
import { SetupWizard, type SetupStart } from '@/SetupWizard'
import { TaskSheetEmailContext } from '@/features/student-home/tiles/TaskSheet'
import { chicagoDateKey } from '../student-home/format'
import { useNow } from '../student-home/useNow'
import { toAgendaEvents, type ListedEventRow } from '../student-home/agenda'
import type { ParentHomeFinance, ParentHomeSummary, ParentPinnedAnnouncement } from './contract'
import { ParentHomeView, type ParentHomeSource } from './ParentHomeView'
import { FinishSetupCard } from './FinishSetupCard'
import { ParentRoomStatus } from './ParentRoomStatus'
import { setupOpen, type SetupNext } from './logic'

type Loadable<T> = T | Error | undefined
const none: ReadonlySet<ParentHomeSource> = new Set()

export function ParentHome({ studentId, studentName, email }: { studentId: Id<'students'>; studentName: string; email?: string }) {
  const now = useNow()
  const asOfDay = chicagoDateKey(now)
  const [paused, setPaused] = useState(none)
  // The setup wizard opens full screen on Home from the Finish setup card or a What's left item.
  const [flow, setFlow] = useState<SetupStart | null>(null)
  const [setupNext, setSetupNext] = useState<SetupNext | null>(null)
  const [firstLinkReady, setFirstLinkReady] = useState<boolean | null>(null)
  const [refresh, setRefresh] = useState(0)
  const getSetup = useMutation(api.setupWizard.summary)
  const getFirst = useMutation(api.firstRegistration.get)
  useEffect(() => {
    if (!paused.size) return
    const timer = window.setTimeout(() => setPaused(none), 0)
    return () => window.clearTimeout(timer)
  }, [paused])
  useEffect(() => {
    let current = true
    void getSetup({}).then(value => { if (current) setSetupNext(value.students.find(row => row.studentId === studentId)?.nextItem ?? null) }).catch(() => { if (current) setSetupNext(null) })
    void getFirst({ studentId }).then(value => { if (current) setFirstLinkReady(!value.canAccessInvitation || !!value.invitationUrl) }).catch(() => { if (current) setFirstLinkReady(null) })
    return () => { current = false }
  }, [getSetup, getFirst, studentId, refresh])
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
  const openSetup = useCallback((step?: SetupStart['step']) => setFlow({ student: studentId, step: step ?? null }), [studentId])
  const closeSetup = useCallback(() => { setFlow(null); setRefresh(value => value + 1) }, [])
  if (flow) return <div role="dialog" aria-modal="true" aria-label="Finish setup" className="fixed inset-0 z-50 overflow-y-auto bg-background"><SetupWizard role="parent" start={flow} accountEmail={email} onExit={closeSetup} /></div>
  const setupIsOpen = setupOpen(setupNext)
  return <div className="flex min-w-0 flex-col gap-3 md:mx-auto md:max-w-[720px] lg:max-w-none">
    {setupIsOpen && setupNext && <FinishSetupCard studentName={studentName} next={setupNext} onOpen={() => openSetup()} />}
    <TaskSheetEmailContext.Provider value={email}><ParentHomeView studentName={studentName} now={now} summary={results.summary as Loadable<ParentHomeSummary>} announcements={results.announcements as Loadable<ParentPinnedAnnouncement[]>} finance={results.finance as Loadable<ParentHomeFinance>} events={events} retry={retry} setupOpen={setupIsOpen} setupNext={setupNext} firstLinkReady={firstLinkReady} onOpenSetup={openSetup} renderRoomStatus={eventId => <ParentRoomStatus eventId={eventId as Id<'events'>} studentId={studentId} studentName={studentName} />} /></TaskSheetEmailContext.Provider>
    <div><AskCoachButton email={email} /></div>
  </div>
}
