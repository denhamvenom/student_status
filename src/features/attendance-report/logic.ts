import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { compareMonths, type ReportStatus } from '../../../convex/lib/attendanceReportView'
import { TEAM_TIME_ZONE } from '../../../shared/chicago-time'
import { chicagoDateKey } from '../student-home/format'
import { reportCopy as copy } from './copy'

export type AttendanceMonth = FunctionReturnType<typeof api.attendanceReport.month>
export type ReportEvent = AttendanceMonth['events'][number]
export type Month = { year: number; month: number }

/** The Chicago calendar month containing an instant. */
export function chicagoMonth(epoch: number): Month {
  const [year, month] = chicagoDateKey(epoch).split('-').map(Number)
  return { year, month }
}

/** The switcher stays between the season's first month and the current month. */
export function monthLimits(seasonStartsAt: number | null, now: number) {
  const last = chicagoMonth(now)
  const first = seasonStartsAt === null ? null : chicagoMonth(seasonStartsAt)
  return { first: first && compareMonths(first, last) > 0 ? last : first, last }
}

export function clampMonth(month: Month, limits: { first: Month | null; last: Month }): Month {
  if (compareMonths(month, limits.last) > 0) return limits.last
  if (limits.first && compareMonths(month, limits.first) < 0) return limits.first
  return month
}

const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
/** "November 2026" */
export const formatMonth = ({ year, month }: Month) => monthName.format(Date.UTC(year, month - 1, 15))

const time = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
/** "6:02 PM" in team time. */
export const formatTime = (epoch: number) => time.format(epoch)
/** "6:00 – 8:00 PM"-style range; both ends are written out so the meaning is never ambiguous. */
export const formatTimeRange = (start: number, end: number) => `${formatTime(start)} – ${formatTime(end)}`

/** By default the report shows Required and Build meetings; the toggle adds Outreach and Other. */
export function visibleEvents(events: readonly ReportEvent[], showAll: boolean) {
  return showAll ? [...events] : events.filter(event => event.kind === 'required' || event.kind === 'build')
}

/** The word on a row: the status, or for gray rows the reason (Upcoming vs Not held needs the browser clock). */
export function statusWord(event: Pick<ReportEvent, 'status' | 'neutralReason' | 'scheduledStart'>, now: number) {
  if (event.status !== 'neutral') return copy.status[event.status]
  return copy.neutral[neutralKey(event, now)]
}

export function neutralKey(event: Pick<ReportEvent, 'neutralReason' | 'scheduledStart'>, now: number) {
  const reason = event.neutralReason ?? 'optional'
  return reason === 'notStarted' ? (event.scheduledStart > now ? 'upcoming' : 'notHeld') : reason
}

/** Badges for a row: late and early both show when a Student arrived late and left early. */
export function statusBadges(event: Pick<ReportEvent, 'status' | 'late' | 'early'>): ReportStatus[] {
  return event.status === 'late' && event.early ? ['late', 'early'] : [event.status]
}

/** A day cell takes the color of its most serious event. */
const severity: Record<ReportStatus, number> = { missed: 4, late: 3, early: 2, present: 1, neutral: 0 }
export function dayStatus(events: readonly Pick<ReportEvent, 'status'>[]): ReportStatus | null {
  return events.reduce<ReportStatus | null>((worst, event) => worst === null || severity[event.status] > severity[worst] ? event.status : worst, null)
}

export type CalendarDay = { key: string; day: number; events: ReportEvent[] }
/** Sunday-first weeks for the month; null cells pad the first and last week. Events group by their Chicago date. */
export function calendarWeeks({ year, month }: Month, events: readonly ReportEvent[]): (CalendarDay | null)[][] {
  const byDay = new Map<string, ReportEvent[]>()
  for (const event of events) {
    const key = chicagoDateKey(event.scheduledStart)
    byDay.set(key, [...(byDay.get(key) ?? []), event])
  }
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const cells: (CalendarDay | null)[] = Array.from({ length: offset }, () => null)
  for (let day = 1; day <= days; day++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key, day, events: byDay.get(key) ?? [] })
  }
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
}

/** "6:02 PM – 8:00 PM" for each clock pair, "No clock-in", or a note while the session is open. */
export function timesLine(event: Pick<ReportEvent, 'intervals' | 'sessionState'>) {
  if (event.sessionState === 'open') return copy.inProgressTimes
  if (event.intervals.length === 0) return copy.noClockIn
  return event.intervals.map(pair => formatTimeRange(pair.inAt, pair.outAt)).join(', ')
}
