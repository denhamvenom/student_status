import { useMemo, useState } from 'react'
import { useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { SignupAvailability } from '../student-home/contract'
import { signupCopy } from './copy'
import { SignupWizard } from './SignupWizard'
import { useLiveSignupSource } from './wizardSource'

/**
 * The event page's Sign up for a Student: opens the signup wizard, which sends everything in one participation.signUp.
 * Stays mounted after signup (`canSign` turns false) so the wizard can show "You're signed up".
 */
export function EventPageSignup({ eventId, eventName, label, canSign }: { eventId: Id<'events'>; eventName: string; label: string; canSign: boolean }) {
  const queries = useMemo(() => Object.fromEntries(canSign ? [['availability', { query: api.participation.signupAvailability, args: { eventId } }]] : []), [eventId, canSign])
  const availability = (useQueries(queries) as { availability?: SignupAvailability | undefined | Error }).availability
  const source = useLiveSignupSource()
  const [open, setOpen] = useState(false)
  const blocked = availability === undefined ? signupCopy.form.checking : availability instanceof Error ? signupCopy.form.availabilityFailed : availability.outcome === 'closed' ? signupCopy.form.closed : null
  return <>
    {canSign && <>
      <button className="button button-primary" disabled={!!blocked} aria-describedby={blocked ? `event-signup-${eventId}-why` : undefined} onClick={() => setOpen(true)}>{label}</button>
      {blocked && <p id={`event-signup-${eventId}-why`} className="muted">{blocked}</p>}
    </>}
    <SignupWizard eventId={eventId} eventName={eventName} open={open} onOpenChange={setOpen} mode={{ kind: 'signup' }} source={source} />
  </>
}
