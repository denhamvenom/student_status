import { useId, useState } from 'react'
import { cn } from 'cn'
import { useQuery, usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { DetailsSheet } from '@/components/dashboard/DetailsSheet'
import { dashboardButtonVariants, inset } from '@/components/dashboard/styles'
import { formatHours } from '../student-home/format'
import { useNow } from '../student-home/useNow'
import { attendanceCopy as copy, type Kind } from './copy'
import { breakdownView, buildTotalLine, sessionRowView } from './logic'

const PAGE_ROWS = 10

function SessionList({ studentId, kind, buildMinutes }: { studentId: Id<'students'>; kind: Kind; buildMinutes: number }) {
  const { results, status, loadMore } = usePaginatedQuery(api.dashboardReports.attendanceSessions, { studentId, kind }, { initialNumItems: PAGE_ROWS })
  if (status === 'LoadingFirstPage') return <p role="status" className="text-[13px] text-vs-muted">{copy.loading}</p>
  const done = status === 'Exhausted'
  const days = results.filter(row => row.status === 'attended').length
  return <>
    {kind === 'build' && <p className="m-0 mb-3 text-[14px] font-semibold text-vs-text-2">{buildTotalLine(buildMinutes, done ? days : null)}</p>}
    {results.length === 0 && done && <p className="text-[13px] text-vs-muted">{copy.empty}</p>}
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {results.map(row => {
        const view = sessionRowView(row, kind)
        return <li key={view.key} className={cn(inset, 'flex min-h-[60px] items-center justify-between gap-3 px-3 py-2')}>
          <div className="min-w-0">
            <p className="m-0 text-[12px] text-vs-muted">{view.date}</p>
            <p className="m-0 truncate text-[14px] font-medium text-vs-text-2">{view.title}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn('m-0 text-[13px] font-semibold', view.attended ? 'text-vs-text-2' : 'text-vs-muted')}>{view.status}</p>
            {view.minutes && <p className="m-0 text-[12px] text-vs-muted">{view.minutes}</p>}
          </div>
        </li>
      })}
    </ul>
    {!done && <button type="button" disabled={status === 'LoadingMore'} onClick={() => loadMore(PAGE_ROWS)} className={cn(dashboardButtonVariants({ tone: 'soft', size: 'md' }), 'mt-3 w-full')}>
      {status === 'LoadingMore' ? copy.loadingMore : copy.showMore}
    </button>}
  </>
}

type Tile = { kind: Kind; label: string; value: string; text: boolean; detail: string | null; action: string }

function SummaryTile({ tile, studentId, updating, buildMinutes }: { tile: Tile; studentId: Id<'students'>; updating: boolean; buildMinutes: number }) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  return <DashboardTile tone="quiet" aria-labelledby={titleId}>
    <TileTitle id={titleId}>{tile.label}</TileTitle>
    <p className={cn('m-0 mt-3 font-heading leading-none text-vs-heading', tile.text || updating ? 'text-[22px]' : 'text-[38px]')}>{updating ? copy.updating : tile.value}</p>
    {!updating && tile.detail && <p className="m-0 mt-1.5 text-[13px] text-vs-muted">{tile.detail}</p>}
    {updating && <p role="status" className="m-0 mt-1.5 text-[13px] text-vs-muted">{copy.updatingNote}</p>}
    <button type="button" onClick={() => setOpen(true)} disabled={updating} aria-label={`${tile.action}: ${tile.label}`} className={cn(dashboardButtonVariants({ tone: 'soft', size: 'md' }), 'mt-4 self-start')}>{tile.action}</button>
    <DetailsSheet open={open} onOpenChange={setOpen} title={copy.sheetTitle[tile.kind]} description={copy.sheetDescription[tile.kind]}>
      {open && <SessionList studentId={studentId} kind={tile.kind} buildMinutes={buildMinutes} />}
    </DetailsSheet>
  </DashboardTile>
}

/** Student and Parent Attendance page: four summaries (Required meetings, Other meetings, Outreach, Build hours), each opening its meeting list. */
export function FamilyAttendanceBreakdown({ studentId }: { studentId: Id<'students'> }) {
  const data = useQuery(api.dashboardReports.attendanceBreakdown, { studentId })
  const now = useNow()
  if (!data) return <p role="status">{copy.loading}</p>
  const view = breakdownView(data, now)
  const { required, other, outreach, build } = view
  const tiles: Tile[] = [
    required.percent === null
      ? { kind: 'required', label: copy.requiredMeetings, value: copy.noRequired, text: true, detail: null, action: copy.seeMeetings }
      : { kind: 'required', label: copy.requiredMeetings, value: copy.percent(required.percent), text: false, detail: copy.attended(required.attended, required.held), action: copy.seeMeetings },
    other.held === 0
      ? { kind: 'other', label: copy.otherMeetings, value: copy.noneYet, text: true, detail: null, action: copy.seeMeetings }
      : { kind: 'other', label: copy.otherMeetings, value: String(other.attended), text: false, detail: `${copy.ofMeetings(other.held)} attended`, action: copy.seeMeetings },
    { kind: 'outreach', label: copy.outreach, value: String(outreach.attended), text: false, detail: copy.ofEvents(outreach.held), action: copy.seeEvents },
    build.started
      ? { kind: 'build', label: copy.buildHours, value: copy.hours(formatHours(build.minutes)), text: false, detail: build.target ? copy.ofTarget(build.target) : copy.sinceKickoff, action: copy.seeBuildDays }
      : { kind: 'build', label: copy.buildHours, value: copy.startsAtKickoff, text: true, detail: null, action: copy.seeBuildDays },
  ]
  return <div className="grid gap-4 sm:grid-cols-2">
    {tiles.map(tile => <SummaryTile key={tile.kind} tile={tile} studentId={studentId} updating={data.state === 'updating'} buildMinutes={build.minutes} />)}
  </div>
}
