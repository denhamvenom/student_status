import { SignupWizard } from '../../event-signup/SignupWizard'
import type { OpenSignup } from '../contract'
import type { SignUpResult, StudentHomeHandlers } from '../types'

/** Sign up from Home: the card's Sign up opens the signup wizard straight away (Event details first). */
export function SignupSheet({ signup, open, onOpenChange, onSignedUp, returnFocus, handlers }: {
  signup: OpenSignup | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSignedUp: (signup: OpenSignup, result: SignUpResult) => void
  /** Where focus goes when the wizard closes (the Sign up button that opened it leaves once the signup lands). */
  returnFocus: () => HTMLElement | null
  handlers: StudentHomeHandlers
}) {
  if (!signup) return null
  return <SignupWizard key={signup.eventId} eventId={signup.eventId} eventName={signup.name} open={open} onOpenChange={onOpenChange}
    mode={{ kind: 'signup' }} source={handlers.signup} eventHref={`/events/${signup.eventId}`} onSignedUp={result => onSignedUp(signup, result)} returnFocus={returnFocus} />
}
