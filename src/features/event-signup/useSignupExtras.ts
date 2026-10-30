import { useMemo } from 'react'
import { useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { EventShifts, SignupExtras, SignupQuestions } from './types'

/** undefined while loading, an Error when a query failed. */
export type LoadableExtras = SignupExtras | undefined | Error

/**
 * The signed-in Student's questions and shifts for one event. Pass false for a part the event doesn't use
 * (signupAvailability's hasQuestions/shiftsEnabled) to skip its query. Errors come back as values.
 */
export function useSignupExtras(eventId: Id<'events'>, want: { questions: boolean; shifts: boolean }): LoadableExtras {
  const queries = useMemo(() => ({
    ...(want.questions ? { questions: { query: api.eventQuestions.forSignup, args: { eventId } } } : {}),
    ...(want.shifts ? { shifts: { query: api.eventShifts.forEvent, args: { eventId } } } : {}),
  }), [eventId, want.questions, want.shifts])
  const results = useQueries(queries) as { questions?: SignupQuestions | undefined | Error; shifts?: EventShifts | undefined | Error }
  const parts = [want.questions ? results.questions : null, want.shifts ? results.shifts : null]
  const failed = parts.find(part => part instanceof Error)
  if (failed instanceof Error) return failed
  if (parts.some(part => part === undefined)) return undefined
  return { questions: want.questions ? results.questions as SignupQuestions : null, shifts: want.shifts ? results.shifts as EventShifts : null }
}
