import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { SignupAvailability, WhatsLeftItem } from '../student-home/contract'
import type { SignUpResult } from '../student-home/types'

/** eventQuestions.forSignup: the event's active questions and the Student's saved answers. */
export type SignupQuestions = FunctionReturnType<typeof api.eventQuestions.forSignup>
export type SignupQuestion = SignupQuestions['questions'][number]
export type AnswerValue = SignupQuestions['answers'][number]['value']

/** eventShifts.forEvent: shifts with spots left and the Student's own choice. */
export type EventShifts = FunctionReturnType<typeof api.eventShifts.forEvent>
export type ShiftOption = EventShifts['shifts'][number]

/** What the signup form needs; a part is null when the event doesn't use it. */
export type SignupExtras = { questions: SignupQuestions | null; shifts: EventShifts | null }

/** Sent with participation.signUp in one call. */
export type SignupChoice = { answers: { questionId: Id<'eventQuestions'>; value: AnswerValue }[]; shiftIds: Id<'eventShifts'>[] }

/** Where the event is and how Students get there, for the wizard's Event details. */
export type EventFacts = { place: string; ride: string | null }

type Loadable<T> = T | undefined | Error

/**
 * What the signup wizard reads and calls. Live pages use useLiveSignupSource; the Home preview passes fixtures.
 * The use* members are hooks, called only while the wizard is open.
 */
export type SignupWizardSource = {
  useAvailability: (eventId: Id<'events'>) => Loadable<SignupAvailability>
  useEventFacts: (eventId: Id<'events'>) => Loadable<EventFacts>
  useSignupExtras: (eventId: Id<'events'>, want: { questions: boolean; shifts: boolean }) => Loadable<SignupExtras>
  /** Home's What's left items, read on the "You're signed up" screen. */
  useWhatsLeft: () => Loadable<WhatsLeftItem[]>
  signUp: (eventId: Id<'events'>, choice?: SignupChoice) => Promise<SignUpResult>
  saveShifts: (eventId: Id<'events'>, shiftIds: Id<'eventShifts'>[]) => Promise<unknown>
  saveAnswers: (eventId: Id<'events'>, answers: SignupChoice['answers']) => Promise<unknown>
}
