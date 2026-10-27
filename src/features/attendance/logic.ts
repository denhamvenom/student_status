import type { HomeAttendance } from '../student-home/contract'
import { formatShortDate } from '../student-home/format'
import { participationView } from '../student-home/logic'
import { attendanceCopy, type Kind } from './copy'

export type Breakdown = {
  state: 'ready' | 'updating'
  kickoffAt: number | null
  required: { attended: number; held: number }
  other: { attended: number; held: number }
  outreach: { attended: number; held: number }
  buildHours: { minutes: number; targetHours: number | null; weekday: DayType; weekend: DayType }
}

export type DayType = { attended: number; held: number; minutes: number }

export type SessionRow = { sessionId: string; scheduledStart: number; title: string | null; status: 'attended' | 'missed'; minutes?: number; dayType?: 'weekday' | 'weekend' }

/** The same numbers Home shows: Required meetings and Build hours go through participationView. */
export function breakdownView(breakdown: Breakdown, now: number) {
  const started = breakdown.kickoffAt !== null && now >= breakdown.kickoffAt
  const attendance: HomeAttendance = {
    state: breakdown.state,
    meetings: breakdown.required,
    outreach: breakdown.outreach,
    buildHours: { state: started ? 'ready' : breakdown.kickoffAt === null ? 'kickoffUnknown' : 'beforeKickoff', minutes: breakdown.buildHours.minutes, targetHours: breakdown.buildHours.targetHours },
    kickoffAt: breakdown.kickoffAt,
  }
  const view = participationView(attendance)
  return { required: view.meetings, other: breakdown.other, outreach: breakdown.outreach, build: { ...view.build, weekday: breakdown.buildHours.weekday, weekend: breakdown.buildHours.weekend } }
}

/** One list row: date, title (a plain name when none was given), status, and minutes for attended Build days. */
export function sessionRowView(row: SessionRow, kind: Kind) {
  const attended = row.status === 'attended'
  return {
    key: row.sessionId,
    date: formatShortDate(row.scheduledStart),
    title: row.title?.trim() || attendanceCopy.untitled[kind],
    attended,
    status: attended ? attendanceCopy.statusAttended : attendanceCopy.statusMissed,
    dayType: kind === 'build' && row.dayType ? (row.dayType === 'weekend' ? attendanceCopy.weekend : attendanceCopy.weekday) : null,
    minutes: kind === 'build' && attended && row.minutes !== undefined && row.minutes > 0 ? attendanceCopy.minutes(row.minutes) : null,
  }
}

/** "2 hours 5 minutes from 3 days"; the day count is left off until every Build day has loaded. */
export function buildTotalLine(totalMinutes: number, days: number | null) {
  const total = hoursMinutesLine(totalMinutes)
  return days === null ? total : `${total} ${attendanceCopy.fromDays(days)}`
}

/** "2 hours 5 minutes", or "0 hours 0 minutes"; the same words as the Build total line. */
export function hoursMinutesLine(totalMinutes: number) {
  const whole = Math.max(0, Math.floor(totalMinutes))
  return attendanceCopy.hoursMinutes(Math.floor(whole / 60), whole % 60)
}

/** One Build day-type line: "3 of 4 days · 2 hours 5 minutes". */
export function dayTypeLine(day: DayType) {
  return `${attendanceCopy.daysOf(day.attended, day.held)} · ${hoursMinutesLine(day.minutes)}`
}

/** Compact "3 / 4" for the team table; "—" when nothing was held. */
export function attendedOfHeld(attended: number, held: number) {
  return held > 0 ? `${attended} / ${held}` : '—'
}

/** Compact "2h 5m" for the team table. */
export function shortHours(totalMinutes: number) {
  const whole = Math.max(0, Math.floor(totalMinutes))
  return `${Math.floor(whole / 60)}h ${whole % 60}m`
}
