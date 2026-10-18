import { reportCopy } from './report-copy'

export function attendanceDuration(ms: number): string {
  if (ms > 0 && ms < 1000) return '<1 s'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`
}

export function attendanceEligibilityText(session: {
  state: 'open' | 'closed' | 'cancelled'
  needsReview: boolean
  qualifies: boolean | null
  longestScheduledMs: number | null
}): string {
  if (session.state === 'cancelled') return reportCopy.cancelledEligibility
  if (session.state === 'open') return reportCopy.openEligibility
  if (session.needsReview) return reportCopy.reviewEligibility
  if (session.qualifies) return reportCopy.qualifies
  return session.longestScheduledMs === null
    ? reportCopy.doesNotQualify
    : reportCopy.notQualifying(attendanceDuration(session.longestScheduledMs))
}
