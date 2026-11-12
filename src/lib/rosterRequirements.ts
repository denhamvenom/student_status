// The Team roster's per-student requirement rules, shared by the roster screen and the Readiness spreadsheet. Pure functions; no server calls.

export type RequirementRow = {
  studentId: string
  name: string
  active: boolean
  firstRegistrationState: 'needsCompletion' | 'awaitingVerification' | 'verified'
  balance: { state: string; dueCents: number | null }
  nextEvent: { name: string; state: 'ready' | 'open' | 'unknown'; open: string[]; participation: 'confirmed' | 'pending' | 'waitlist' | 'withdrawn' | null } | null
  missingSummary: string[]
  permission: { state: 'closed' | 'noForm' | 'signed' | 'review' | 'notSigned'; eventName: string | null }
}

/** "Profile setup" is the sign-in step, not profile information, so it is never listed or counted. */
export function missingProfileItems(row: Pick<RequirementRow, 'missingSummary'>): string[] {
  return row.missingSummary.filter(item => item !== 'Profile setup').map(item => (item === 'Room category' ? 'Room type' : item))
}

export const balanceDueCents = (row: Pick<RequirementRow, 'balance'>) => (row.balance.state === 'ready' && row.balance.dueCents !== null && row.balance.dueCents > 0 ? row.balance.dueCents : 0)

/**
 * Needs attention: an active student who is confirmed for their next event (upcoming, not canceled) and still has an
 * open item on it: a payment, permission form, FIRST registration, shifts, room choice or another requirement.
 * "Something to know" notes never count. Students who are only pending or waitlisted, events that could not be fully
 * checked, and balances on their own do not count: Balance due, Permission form and Missing profile information
 * have their own chips.
 */
export function needsAttention(row: RequirementRow): boolean {
  if (!row.active || row.nextEvent?.participation !== 'confirmed') return false
  return row.nextEvent.state === 'open' && row.nextEvent.open.length > 0
}

export const firstRegistrationLabel = { needsCompletion: 'Missing', awaitingVerification: 'Waiting for Coach', verified: 'Verified' } as const

export const permissionLabel = (row: RequirementRow) =>
  row.permission.state === 'closed' ? 'Not collecting yet'
    : row.permission.state === 'noForm' ? 'No form needed'
      : row.permission.state === 'signed' ? 'Signed'
        : row.permission.state === 'review' ? 'Signed, needs review' : 'Not signed'
