export type Audience = 'students' | 'parents' | 'both' | 'staff' | 'everyone'
type Home = 'students' | 'parents' | 'staff'

const HOMES = ['students', 'parents', 'staff'] as const

/** Both = Students + Parents; Everyone = Students + Parents + Mentors & staff. Mirrors convex/announcements.ts. */
export const reaches = (audience: Audience, home: Home) => audience === 'everyone' || audience === home || audience === 'both' && home !== 'staff'

/** Anything Parents see is Coach-only; Travel Leads may post to Students or Mentors & staff. */
export const coachOnly = (audience: Audience) => reaches(audience, 'parents')

/** Audiences a Travel Lead may choose; a Coach may choose any. */
export const TRAVEL_LEAD_AUDIENCES: readonly Audience[] = ['students', 'staff']
export const COACH_AUDIENCES: readonly Audience[] = ['students', 'parents', 'both', 'staff', 'everyone']

export function hasPinRoom(rows: { audience: Audience }[], audience: Audience, limit: number) {
  return HOMES.every(home => !reaches(audience, home) || rows.filter(row => reaches(row.audience, home)).length < limit)
}

/** Whether any Home has reached its pin limit. */
export const anyHomeFull = (rows: { audience: Audience }[], limit: number) => HOMES.some(home => !hasPinRoom(rows, home, limit))
