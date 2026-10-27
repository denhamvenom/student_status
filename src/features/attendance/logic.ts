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
  buildHours: { minutes: number; targetHours: number | null }
}

export type SessionRow = { sessionId: string; scheduledStart: number; title: string | null; status: 'attended' | 'missed'; minutes?: number }

/** The same numbers Home shows: Required meetings and Build hours go through participationView. */
export function breakdownView(breakdown: Breakdown, now: number) {
  const started = breakdown.kickoffAt !== null && now >= breakdown.kickoffAt
  const attendance: HomeAttendance = {
    state: breakdown.state,
    meetings: breakdown.required,
    outreach: breakdown.outreach,
    buildHours: { state: started ? 'ready' : breakdown.kickoffAt === null ? 'kickoffUnknown' : 'beforeKickoff', ...breakdown.buildHours },
    kickoffAt: breakdown.kickoffAt,
  }
  const view = participationView(attendance)
  return { required: view.meetings, other: breakdown.other, outreach: breakdown.outreach, build: view.build }
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
    minutes: kind === 'build' && attended && row.minutes !== undefined && row.minutes > 0 ? attendanceCopy.minutes(row.minutes) : null,
  }
}
