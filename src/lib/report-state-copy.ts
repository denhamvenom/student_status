export function balanceStatusLabel(state: string): string {
  switch (state) {
    case 'updating': return 'Balance updating'
    case 'failed': return 'Balance needs Coach review'
    case 'uninitialized': return 'Balance not yet available'
    default: return 'Balance unavailable'
  }
}

export function attendanceStatusLabel(state: string): string {
  switch (state) {
    case 'ready': return 'Verified'
    case 'updating': return 'Updating; verified totals unavailable'
    case 'failed': return 'Needs Coach review; verified totals unavailable'
    case 'unknownKickoff': return 'Kickoff date unverified; attendance phases unavailable'
    default: return 'Unavailable'
  }
}

export function eventCoverageLabel(state: string): string {
  return state === 'complete' ? 'Complete' : 'Limited to first 50 events; counts may be incomplete'
}

export function eventReadinessLabel(state: string | null): string {
  switch (state) {
    case 'ready': return 'Ready'
    case 'open': return 'Needs attention'
    case 'unknown': return 'Readiness unavailable'
    case 'notApplicable': return 'Not participating'
    default: return 'No selected event'
  }
}
