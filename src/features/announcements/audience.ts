import { coachOnly, reaches, type Audience } from '../../../shared/announcement-audience'

export { coachOnly, reaches, type Audience }

const HOMES = ['students', 'parents', 'staff'] as const

/** Audiences a Travel Lead may choose; a Coach may choose any. */
export const TRAVEL_LEAD_AUDIENCES: readonly Audience[] = ['students', 'staff']
export const COACH_AUDIENCES: readonly Audience[] = ['students', 'parents', 'both', 'staff', 'everyone']

export function hasPinRoom(rows: { audience: Audience }[], audience: Audience, limit: number) {
  return HOMES.every(home => !reaches(audience, home) || rows.filter(row => reaches(row.audience, home)).length < limit)
}

/** Whether any Home has reached its pin limit. */
export const anyHomeFull = (rows: { audience: Audience }[], limit: number) => HOMES.some(home => !hasPinRoom(rows, home, limit))
