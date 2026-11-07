import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * The current season's competition year from the signed-in viewer (the same app.viewer subscription LiveApp holds), or
 * null while loading or with no active season. Used to tell whether a date is a Required weekday (requiredMeetingDay).
 */
export function useSeasonYear(): number | null {
  const viewer = useQuery(api.app.viewer, {}) as { season?: { year?: number } | null } | undefined
  const year = viewer?.season?.year
  return typeof year === 'number' ? year : null
}
