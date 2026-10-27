import { useState, type ReactNode } from 'react'
import { CircleCheck } from 'lucide-react'
import { cn } from 'cn'
import { DetailsSheet } from '@/components/dashboard/DetailsSheet'
import { dashboardButtonVariants, eyebrow } from '@/components/dashboard/styles'
import { eventSchedule } from '@/lib/event-schedule'
import { userFacingError } from '@/lib/error-message'
import type { OpenSignup, SignupAvailability } from '../contract'
import { homeCopy } from '../copy'
import { formatMoney } from '../format'
import type { SignUpResult, StudentHomeHandlers } from '../types'

const copy = homeCopy.signupSheet

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-0.5 border-b border-vs-border-subtle py-3 last:border-b-0">
    <dt className={eyebrow}>{label}</dt>
    <dd className="m-0 text-[15px] text-vs-text-2">{children}</dd>
  </div>
}

function outcomeText(availability: SignupAvailability) {
  if (availability.outcome === 'closed') return copy.outcome.closed
  if (availability.outcome === 'waitlisted') return copy.outcome.waitlisted
  if (availability.outcome === 'waitingForApproval') return copy.outcome.waitingForApproval
  return availability.feeCents > 0 ? copy.outcome.signedUp : copy.outcome.signedUpNoFee
}

function spotsText(availability: SignupAvailability) {
  if (availability.capacity === null || availability.spotsLeft === null) return null
  return availability.spotsLeft > 0 ? copy.spotsLeft(availability.spotsLeft) : copy.full
}

type Submit = { kind: 'idle' } | { kind: 'busy' } | { kind: 'failed'; message: string } | { kind: 'done'; result: SignUpResult }

/** Loaded only while the sheet is open (the sheet unmounts its content when closed). */
function SignupDetails({ signup, handlers, onDone }: { signup: OpenSignup; handlers: StudentHomeHandlers; onDone: () => void }) {
  const availability = handlers.useAvailability(signup.eventId)
  const [submit, setSubmit] = useState<Submit>({ kind: 'idle' })

  const signUp = async () => {
    setSubmit({ kind: 'busy' })
    try { setSubmit({ kind: 'done', result: await handlers.signUp(signup.eventId) }) }
    catch (error) { setSubmit({ kind: 'failed', message: userFacingError(error, copy.failed) }) }
  }

  if (submit.kind === 'done') return <div className="flex flex-col gap-4 pt-2">
    <p role="status" className="flex items-start gap-2.5 rounded-inset border border-vs-success-border bg-vs-success-soft p-3.5 text-[15px] font-semibold text-vs-success">
      <CircleCheck size={20} aria-hidden="true" className="mt-px shrink-0" />{copy.result[submit.result]}
    </p>
    <button type="button" onClick={onDone} className={cn(dashboardButtonVariants({ tone: 'soft', size: 'md' }), 'w-full')}>{copy.done}</button>
  </div>

  if (availability === undefined) return <p role="status" className="py-4 text-[14px] text-vs-muted">{copy.loading}</p>
  if (availability instanceof Error) return <p role="alert" className="py-4 text-[14px] text-vs-text-2">{copy.loadFailed}</p>

  const spots = spotsText(availability)
  const closed = availability.outcome === 'closed'
  return <div className="flex flex-col gap-4">
    <dl className="m-0">
      <Fact label={copy.when}>{eventSchedule(availability)}</Fact>
      <Fact label={copy.fee}>{availability.feeCents > 0 ? formatMoney(availability.feeCents) : copy.noFee}</Fact>
      {spots && <Fact label={copy.spots}>{spots}</Fact>}
      <Fact label={copy.whatHappens}>{outcomeText(availability)}</Fact>
    </dl>
    {submit.kind === 'failed' && <p role="alert" className="m-0 rounded-inset border border-vs-urgent-border bg-vs-urgent-soft p-3 text-[14px] text-vs-urgent">{submit.message}</p>}
    <button type="button" disabled={closed || submit.kind === 'busy'} onClick={() => void signUp()} className={cn(dashboardButtonVariants({ tone: 'primary', size: 'lg' }), 'w-full')}>
      {submit.kind === 'busy' ? copy.signingUp : copy.signUp}
    </button>
  </div>
}

/** Sign up from Home: fee, spots left (counts only) and what will happen, then Sign up. */
export function SignupSheet({ signup, open, onOpenChange, handlers }: { signup: OpenSignup | null; open: boolean; onOpenChange: (open: boolean) => void; handlers: StudentHomeHandlers }) {
  if (!signup) return null
  return <DetailsSheet open={open} onOpenChange={onOpenChange} title={signup.name}>
    <SignupDetails key={signup.eventId} signup={signup} handlers={handlers} onDone={() => onOpenChange(false)} />
  </DetailsSheet>
}
