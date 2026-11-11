import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Button } from './ui/button'

export const stepWizardCopy = {
  stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
  back: 'Back',
  cancel: 'Cancel',
  edit: 'Edit',
} as const

/**
 * One screen of a step-by-step form: a step count, a heading that takes focus when the step changes,
 * the step's fields, a problem message just above the buttons, and Back / Continue / Cancel.
 * The caller owns the step number and checks it: Continue stays disabled until `nextDisabled` is false.
 * Pressing Enter in a field does the same as Continue.
 */
export function StepWizard({ title, step, total, heading, onNext, nextLabel, nextDisabled = false, onBack, onCancel, busy = false, error, className, children }: {
  /** The card's name, for screen readers (for example "Add a fee"). */
  title: string
  step: number
  total: number
  /** This step's heading. */
  heading: string
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
  /** Omit on the first step. */
  onBack?: () => void
  onCancel: () => void
  busy?: boolean
  error?: string | null
  className?: string
  children: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [step])
  const submit = (event: FormEvent) => { event.preventDefault(); if (!busy && !nextDisabled) onNext() }
  return <section aria-label={title} className={className}>
    <form noValidate onSubmit={submit} className="grid min-w-0 gap-4">
      <div aria-hidden="true" className="flex gap-1">{Array.from({ length: total }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-border'}`} />)}</div>
      <h3 ref={headingRef} tabIndex={-1} className="m-0 grid gap-1 text-xl font-bold focus:outline-none">
        {total > 1 && <span className="text-sm font-semibold text-muted-foreground">{stepWizardCopy.stepOf(step, total)}<span className="sr-only">:</span></span>}
        <span>{heading}</span>
      </h3>
      {children}
      {error && <p role="alert" className="m-0 rounded-sm border border-destructive p-3 text-sm font-semibold text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {onBack && <Button type="button" variant="outline" disabled={busy} onClick={onBack}>{stepWizardCopy.back}</Button>}
        <Button type="submit" disabled={busy || nextDisabled}>{nextLabel}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{stepWizardCopy.cancel}</Button>
      </div>
    </form>
  </section>
}

/** A review row: what was entered, with an Edit button that goes back to the step it came from. */
export function ReviewRow({ label, value, onEdit, disabled }: { label: string; value: ReactNode; onEdit?: () => void; disabled?: boolean }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0">
    <div className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="m-0 font-semibold break-words">{value}</dd></div>
    {onEdit && <Button type="button" variant="outline" disabled={disabled} aria-label={`${stepWizardCopy.edit} ${label}`} onClick={onEdit}>{stepWizardCopy.edit}</Button>}
  </div>
}
