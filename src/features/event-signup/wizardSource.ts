import { useMemo } from 'react'
import { useMutation, useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { eventLocation, transportationLabel } from '@/lib/event-place'
import type { SignupAvailability, StudentHomeSummary } from '../student-home/contract'
import { chicagoDateKey } from '../student-home/format'
import type { EventFacts, SignupWizardSource } from './types'
import { useSignupExtras } from './useSignupExtras'

type Loadable<T> = T | undefined | Error

function useAvailability(eventId: Id<'events'>): Loadable<SignupAvailability> {
  const queries = useMemo(() => ({ availability: { query: api.participation.signupAvailability, args: { eventId } } }), [eventId])
  return useQueries(queries).availability as Loadable<SignupAvailability>
}

type EventDoc = { destination?: string; onsite?: boolean; travel?: string }

/** Place and transport from app.eventDetail (the event page's own query). */
function useEventFacts(eventId: Id<'events'>): Loadable<EventFacts> {
  const queries = useMemo(() => ({ detail: { query: api.app.eventDetail, args: { eventId } } }), [eventId])
  const detail = useQueries(queries).detail as Loadable<{ event: EventDoc }>
  if (detail === undefined || detail instanceof Error) return detail
  const { event } = detail
  return { place: eventLocation({ destination: event.destination ?? '', onsite: event.onsite }), ride: event.onsite || !event.travel ? null : transportationLabel(event.travel) }
}

/** Home's summary (shared with Home when it is open, since the query and day match). */
function useWhatsLeft() {
  const queries = useMemo(() => ({ summary: { query: api.studentHome.summary, args: { asOfDay: chicagoDateKey(Date.now()) } } }), [])
  const summary = useQueries(queries).summary as Loadable<StudentHomeSummary>
  return summary === undefined || summary instanceof Error ? summary : summary.whatsLeft
}

/** The signup wizard's live data and mutations for the signed-in Student. */
export function useLiveSignupSource(): SignupWizardSource {
  const signUp = useMutation(api.participation.signUp)
  const setMyShifts = useMutation(api.eventShifts.setMyShifts)
  const saveMyAnswers = useMutation(api.eventQuestions.saveMyAnswers)
  return useMemo(() => ({
    useAvailability,
    useEventFacts,
    useSignupExtras,
    useWhatsLeft,
    signUp: (eventId, choice) => signUp({ eventId, ...choice }),
    saveShifts: (eventId, shiftIds) => setMyShifts({ eventId, shiftIds }),
    saveAnswers: (eventId, answers) => saveMyAnswers({ eventId, answers }),
  }), [signUp, setMyShifts, saveMyAnswers])
}
