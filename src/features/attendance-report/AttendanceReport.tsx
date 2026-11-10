import { useId, useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { cn } from 'cn'
import { ChevronLeft, ChevronRight, CircleCheck, CircleMinus, CircleX, Clock, LogOut, type LucideIcon } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { compareMonths, nextMonth, previousMonth, REPORT_STATUSES, type ReportStatus } from '../../../convex/lib/attendanceReportView'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { DetailsSheet } from '@/components/dashboard/DetailsSheet'
import { dashboardButtonVariants, focusRing, inset } from '@/components/dashboard/styles'
import { hoursMinutesLine } from '../attendance/logic'
import { formatLongDate, formatShortDate } from '../student-home/format'
import { useNow } from '../student-home/useNow'
import { reportCopy as copy } from './copy'
import { calendarWeeks, chicagoMonth, DEFAULT_VIEW, clampMonth, dayStatus, formatMonth, formatTime, formatTimeRange, monthLimits, neutralKey, statusBadges, statusWord, timesLine, visibleEvents, type AttendanceMonth, type CalendarDay, type Month, type ReportEvent } from './logic'

/** Color is never the only signal: every status also has its icon and its word. Late is blue, distinct from the yellow of leaving early. */
const statusStyle: Record<ReportStatus, { icon: LucideIcon; badge: string; cell: string }> = {
  present: { icon: CircleCheck, badge: 'border-vs-success-border bg-vs-success-soft text-vs-success', cell: 'border-vs-success-border bg-vs-success-soft' },
  late: { icon: Clock, badge: 'border-blue-600/40 bg-blue-600/10 text-blue-800 dark:border-blue-300/40 dark:bg-blue-400/15 dark:text-blue-200', cell: 'border-blue-600/40 bg-blue-600/10 dark:border-blue-300/40 dark:bg-blue-400/15' },
  early: { icon: LogOut, badge: 'border-amber-500/50 bg-amber-400/20 text-amber-900 dark:border-amber-300/40 dark:bg-amber-300/15 dark:text-amber-200', cell: 'border-amber-500/50 bg-amber-400/20 dark:border-amber-300/40 dark:bg-amber-300/15' },
  missed: { icon: CircleX, badge: 'border-vs-urgent-border bg-vs-urgent-soft text-vs-urgent', cell: 'border-vs-urgent-border bg-vs-urgent-soft' },
  neutral: { icon: CircleMinus, badge: 'border-vs-border bg-vs-inset text-vs-muted', cell: 'border-vs-border-subtle bg-vs-inset' },
}

function Badge({ status, label }: { status: ReportStatus; label: string }) {
  const { icon: Icon, badge } = statusStyle[status]
  return <span className={cn('inline-flex min-h-6 w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-tight font-bold whitespace-nowrap', badge)}>
    <Icon size={14} aria-hidden="true" />{label}
  </span>
}

/** One badge per status; a late arrival who also left early shows both. */
function EventBadges({ event, now }: { event: ReportEvent; now: number }) {
  return <span className="flex flex-wrap gap-1">{statusBadges(event).map(status => <Badge key={status} status={status} label={status === event.status ? statusWord(event, now) : copy.status[status]} />)}</span>
}

const eventTitle = (event: ReportEvent) => event.title.trim() || copy.kinds[event.kind]

function MonthSwitcher({ month, limits, onChange }: { month: Month; limits: { first: Month | null; last: Month }; onChange: (month: Month) => void }) {
  const canGoBack = limits.first !== null && compareMonths(month, limits.first) > 0
  const canGoForward = compareMonths(month, limits.last) < 0
  const button = cn(dashboardButtonVariants({ tone: 'soft', size: 'md' }), 'min-w-11 px-2')
  return <nav aria-label={copy.monthNavigation} className="flex items-center justify-between gap-2">
    <button type="button" className={button} disabled={!canGoBack} onClick={() => onChange(previousMonth(month.year, month.month))} aria-label={copy.previousMonth}><ChevronLeft size={22} aria-hidden="true" /></button>
    <h2 aria-live="polite" className="m-0! text-center font-heading! text-[22px]! leading-tight! font-normal! text-vs-heading lg:text-[26px]!">{formatMonth(month)}</h2>
    <button type="button" className={button} disabled={!canGoForward} onClick={() => onChange(nextMonth(month.year, month.month))} aria-label={copy.nextMonth}><ChevronRight size={22} aria-hidden="true" /></button>
  </nav>
}

function Summary({ data }: { data: AttendanceMonth }) {
  const { summary } = data
  const items: { key: string; label: string; value: string; icon?: ReportStatus }[] = [
    { key: 'required', label: copy.required, value: copy.requiredValue(summary.requiredAttended, summary.requiredHeld) },
    { key: 'build', label: copy.buildTime, value: summary.buildMinutes === null ? copy.buildNotYet : hoursMinutesLine(summary.buildMinutes) },
    { key: 'late', label: copy.late, value: String(summary.late), icon: 'late' },
    { key: 'early', label: copy.early, value: String(summary.early), icon: 'early' },
  ]
  return <section aria-label={copy.summaryLabel}>
    <dl className="m-0 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map(item => {
        const Icon = item.icon ? statusStyle[item.icon].icon : null
        return <div key={item.key} className={cn(inset, 'flex flex-col gap-1 px-3 py-2.5')}>
          <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-vs-text-2">{Icon && <Icon size={14} aria-hidden="true" />}{item.label}</dt>
          <dd className="m-0 font-heading text-[20px] leading-tight text-vs-heading">{item.value}</dd>
        </div>
      })}
    </dl>
    {data.reportsUpdating && <p role="status" className="m-0 mt-2 text-[13px] text-vs-muted">{copy.updating}</p>}
  </section>
}

function Legend() {
  const id = useId()
  return <section aria-labelledby={id} className="flex flex-col gap-2">
    <h3 id={id} className="m-0! text-[13px]! font-semibold! text-vs-text-2">{copy.legend}</h3>
    <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2 lg:grid-cols-5">
      {REPORT_STATUSES.map(status => <li key={status} className="flex flex-col gap-0.5"><Badge status={status} label={copy.status[status]} /><span className="text-[12px] text-vs-muted">{copy.legendDetail[status]}</span></li>)}
    </ul>
  </section>
}

function CalendarView({ month, events, now, onOpen }: { month: Month; events: ReportEvent[]; now: number; onOpen: (day: CalendarDay) => void }) {
  const weeks = calendarWeeks(month, events)
  return <table className="w-full table-fixed border-separate border-spacing-1">
    <thead><tr>{copy.weekdays.map(day => <th key={day} scope="col" className="p-0 text-center text-[11px] font-semibold text-vs-muted">{day}</th>)}</tr></thead>
    <tbody>{weeks.map((week, index) => <tr key={index}>{week.map((cell, column) => {
      if (!cell) return <td key={column} className="p-0" />
      const status = dayStatus(cell.events)
      if (!status) return <td key={cell.key} className="h-14 p-0 align-top"><span className="block h-full rounded-[10px] px-1.5 py-1 text-[13px] text-vs-muted">{cell.day}</span></td>
      const words = cell.events.map(event => `${eventTitle(event)} ${statusWord(event, now)}`).join('; ')
      const badges = [...new Set(cell.events.flatMap(statusBadges))]
      return <td key={cell.key} className="h-14 p-0 align-top">
        <button type="button" onClick={() => onOpen(cell)} aria-label={copy.dayButton(formatShortDate(cell.events[0].scheduledStart), cell.events.length, words)}
          className={cn('flex h-full min-h-14 w-full cursor-pointer flex-col items-start justify-between rounded-[10px] border px-1.5 py-1 text-left text-vs-text hover:brightness-95', statusStyle[status].cell, focusRing)}>
          <span className="text-[13px] font-bold">{cell.day}</span>
          <span aria-hidden="true" className="flex flex-wrap gap-0.5">{badges.map(badge => { const Icon = statusStyle[badge].icon; return <Icon key={badge} size={14} /> })}</span>
        </button>
      </td>
    })}</tr>)}</tbody>
  </table>
}

function ListView({ events, now, onOpen }: { events: ReportEvent[]; now: number; onOpen: (event: ReportEvent) => void }) {
  return <div className="w-full overflow-x-auto">
    <table className="w-full border-collapse text-left text-[14px]">
      <thead><tr className="border-b border-vs-border">
        <th scope="col" className="px-2 py-2 text-[12px] font-semibold text-vs-muted">{copy.table.date}</th>
        <th scope="col" className="px-2 py-2 text-[12px] font-semibold text-vs-muted">{copy.table.event}</th>
        <th scope="col" className="px-2 py-2 text-[12px] font-semibold text-vs-muted">{copy.table.status}</th>
        <th scope="col" className="px-2 py-2 text-[12px] font-semibold text-vs-muted">{copy.table.times}</th>
      </tr></thead>
      <tbody>{events.map(event => <tr key={event.key} className="border-b border-vs-border-subtle align-top">
        <td className="px-2 py-2 whitespace-nowrap text-vs-text-2">{formatShortDate(event.scheduledStart)}</td>
        <td className="px-1 py-1">
          <button type="button" onClick={() => onOpen(event)} aria-label={copy.open(eventTitle(event))} className={cn('flex min-h-11 w-full cursor-pointer flex-col items-start justify-center rounded-lg px-1 text-left text-vs-accent-text! underline-offset-2 hover:underline', focusRing)}>
            <span className="font-semibold">{eventTitle(event)}</span>
            <span className="text-[12px] text-vs-muted">{copy.kinds[event.kind]}</span>
          </button>
        </td>
        <td className="px-2 py-2"><EventBadges event={event} now={now} /></td>
        <td className="px-2 py-2 text-[13px] text-vs-text-2">{timesLine(event)}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-0.5"><dt className="text-[12px] font-semibold text-vs-muted">{label}</dt><dd className="m-0 text-[14px] text-vs-text">{children}</dd></div>
}

function EventDetail({ event, now }: { event: ReportEvent; now: number }) {
  const neutral = event.status === 'neutral' ? copy.neutralNote[neutralKey(event, now)] : null
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2"><EventBadges event={event} now={now} /><span className="text-[13px] text-vs-muted">{copy.kinds[event.kind]}</span></div>
    {neutral && <p className="m-0 text-[14px] text-vs-text-2">{neutral}</p>}
    <dl className="m-0 flex flex-col gap-3">
      <Row label={copy.detail.scheduled}>{formatLongDate(event.scheduledStart)}, {formatTimeRange(event.scheduledStart, event.scheduledEnd)}</Row>
      <Row label={copy.detail.clockTimes}>
        {event.sessionState === 'open' || event.intervals.length === 0 ? timesLine(event)
          : <ul className="m-0 flex list-none flex-col gap-1 p-0">{event.intervals.map(pair => <li key={pair.inAt}>{copy.detail.clockIn} {formatTime(pair.inAt)} · {copy.detail.clockOut} {formatTime(pair.outAt)}</li>)}</ul>}
      </Row>
      {event.intervals.length > 0 && <Row label={copy.detail.total}>{hoursMinutesLine(event.minutes)}</Row>}
      {event.required && event.sessionState === 'closed' && event.neutralReason === null && <Row label={copy.detail.counts}>{event.countsAsAttended ? copy.detail.yes : copy.detail.no}{!event.countsAsAttended && event.intervals.length > 0 && <span className="block text-[13px] text-vs-muted">{copy.detail.countsNote}</span>}</Row>}
    </dl>
    {event.adjustedByCoach && <p className={cn(inset, 'm-0 px-3 py-2 text-[13px] text-vs-text-2')}>{copy.detail.adjusted}</p>}
  </div>
}

type Selection = { title: string; events: ReportEvent[] }

/**
 * Monthly attendance for one Student, for the Student or a linked Parent. Opens on the list, which names every meeting; the calendar is one tap away. 
 * Tapping an event (or a day) opens its clock times in a sheet.
 */
export function AttendanceReport({ studentId }: { studentId: Id<'students'> }) {
  const now = useNow()
  const [chosenView, setChosenView] = useState<'calendar' | 'list' | null>(null)
  const view = chosenView ?? DEFAULT_VIEW
  const [requested, setRequested] = useState<Month>(() => chicagoMonth(Date.now()))
  const [seasonStartsAt, setSeasonStartsAt] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const limits = monthLimits(seasonStartsAt, now)
  const month = clampMonth(requested, limits)
  const data = useQuery(api.attendanceReport.month, { studentId, year: month.year, month: month.month })
  if (data && data.seasonStartsAt !== seasonStartsAt) setSeasonStartsAt(data.seasonStartsAt)
  const viewsId = useId()
  const events = data ? visibleEvents(data.events, showAll) : []
  const openDay = (day: CalendarDay) => setSelection(day.events.length === 1 ? { title: eventTitle(day.events[0]), events: day.events } : { title: copy.detail.dayTitle(formatShortDate(day.events[0].scheduledStart)), events: day.events })
  const toggle = (active: boolean) => cn(dashboardButtonVariants({ tone: active ? 'primary' : 'soft', size: 'md' }), 'flex-1 sm:flex-none')

  return <div className="flex min-w-0 flex-col gap-3 font-sans text-vs-text lg:gap-4">
    <DashboardTile tone="quiet" className="gap-3">
      <MonthSwitcher month={month} limits={limits} onChange={setRequested} />
      {data ? <Summary data={data} /> : <p role="status" className="m-0 text-[13px] text-vs-muted">{copy.loading}</p>}
    </DashboardTile>
    <DashboardTile tone="quiet" className="gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-labelledby={viewsId} className="flex items-center gap-2">
          <TileTitle id={viewsId} className="sr-only">{copy.views}</TileTitle>
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => setChosenView('calendar')} className={toggle(view === 'calendar')}>{copy.calendar}</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setChosenView('list')} className={toggle(view === 'list')}>{copy.list}</button>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] text-vs-text-2">
          <input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} className="size-5 accent-vs-purple" />
          {copy.showAll}
        </label>
      </div>
      {data && (events.length === 0
        ? <p className="m-0 text-[14px] text-vs-muted">{data.events.length === 0 ? copy.noEvents : copy.noEventsFiltered}</p>
        : view === 'calendar' ? <CalendarView month={month} events={events} now={now} onOpen={openDay} /> : <ListView events={events} now={now} onOpen={event => setSelection({ title: eventTitle(event), events: [event] })} />)}
      <Legend />
    </DashboardTile>
    <DetailsSheet open={selection !== null} onOpenChange={open => { if (!open) setSelection(null) }} title={selection?.title ?? ''}>
      {selection && <div className="flex flex-col gap-5">{selection.events.map(event => <section key={event.key} aria-label={eventTitle(event)} className="flex flex-col gap-2">
        {selection.events.length > 1 && <h3 className="m-0! text-[16px]! font-semibold! text-vs-heading">{eventTitle(event)}</h3>}
        <EventDetail event={event} now={now} />
      </section>)}</div>}
    </DetailsSheet>
  </div>
}
