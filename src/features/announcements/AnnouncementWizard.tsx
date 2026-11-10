import { userFacingError } from '@/lib/error-message'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { ReviewRow } from '../../components/StepWizard'
import { chicagoDateString, endOfChicagoDay } from '../../../shared/chicago-time'
import { announcementsCopy as copy } from './copy'
import { COACH_AUDIENCES, hasPinRoom, TRAVEL_LEAD_AUDIENCES, type Audience } from './audience'

export type NewAnnouncement = { title?: string; body: string; showUntil?: number; pin: boolean; audience: Audience; urgent?: boolean }
type Pinned = { audience: Audience }[]

const TITLE_MAX = 80
const BODY_MAX = 500
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' })

/** Why the Message or Audience step cannot continue yet, or '' when it can. */
/** `keepDate` is a Show until date already saved on an announcement being edited; it stays allowed even after it has passed. */
export function announcementStepIssue(step: number, values: { body: string; date: string }, today: string, keepDate = ''): string {
  if (step === 0 && !values.body.trim()) return copy.wizard.messageRequired
  if (step === 1 && values.date !== '') {
    if (Number.isNaN(endOfChicagoDay(values.date))) return copy.invalidDate
    if (values.date < today && values.date !== keepDate) return copy.wizard.datePast
  }
  return ''
}

/**
 * New announcement as four steps ending in a preview; nothing is published until the last button.
 * With `initial` it edits an existing announcement in three steps (no Options: pinning and urgency are not changed here).
 */
export function AnnouncementWizard({ pinned, pinLimit, coach, onSubmit, initial, onCancel }: {
  pinned: Pinned
  pinLimit: number
  coach: boolean
  onSubmit: (values: NewAnnouncement) => Promise<string>
  initial?: { title: string | null; body: string; showUntil: number | null; audience: Audience }
  onCancel?: () => void
}) {
  const editing = initial !== undefined
  const steps = editing ? copy.wizard.editSteps : copy.wizard.steps
  const initialDate = initial?.showUntil == null ? '' : chicagoDateString(initial.showUntil)
  const id = useId()
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [date, setDate] = useState(initialDate)
  const [audience, setAudience] = useState<Audience>(initial?.audience ?? 'students')
  const [pin, setPin] = useState(true)
  const [urgent, setUrgent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  const last = steps.length - 1
  const pinAvailable = hasPinRoom(pinned, audience, pinLimit)
  const willPin = pin && pinAvailable
  const sendUrgent = coach && urgent
  // Keep an unchanged date exactly as saved, so an edit does not move it.
  const showUntil = date === '' ? undefined : editing && date === initialDate && initial.showUntil !== null ? initial.showUntil : endOfChicagoDay(date)

  const next = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (step < last) {
      const issue = announcementStepIssue(step, { body, date }, chicagoDateString(Date.now()), initialDate)
      setProblem(issue)
      if (!issue) { setDone(''); setStep(step + 1) }
      return
    }
    void publish()
  }
  async function publish() {
    setBusy(true); setProblem('')
    try {
      const message = await onSubmit({ title: title.trim() || undefined, body, showUntil, pin: willPin, audience, ...(sendUrgent ? { urgent: true } : {}) })
      if (editing) { setDone(message); return }
      setTitle(''); setBody(''); setDate(''); setPin(true); setAudience('students'); setUrgent(false); setStep(0); setDone(message)
    } catch (cause) { setProblem(userFacingError(cause, copy.failed)) } finally { setBusy(false) }
  }

  const fact = (label: string, value: string, editStep: number) => <ReviewRow label={label} value={<span className="whitespace-pre-line">{value}</span>} disabled={busy} onEdit={() => { setProblem(''); setStep(editStep) }} />
  return <form className="grid gap-4" noValidate onSubmit={next}>
    <h3 className="mb-0" tabIndex={-1} ref={element => element?.focus()} key={step}><span className="block text-sm font-semibold text-muted-foreground">{copy.wizard.stepOf(step + 1, steps.length)}<span className="sr-only">:</span></span>{steps[step]}</h3>
    {step === 0 && <>
      <label className="grid gap-2 font-semibold">{copy.titleLabel}<Input value={title} maxLength={TITLE_MAX} disabled={busy} onChange={event => setTitle(event.target.value)}/></label>
      <label className="grid gap-2 font-semibold">{copy.messageLabel}<Textarea value={body} required maxLength={BODY_MAX} rows={4} disabled={busy} aria-describedby={`${id}-count`} aria-invalid={problem === copy.wizard.messageRequired || undefined} onChange={event => setBody(event.target.value)}/></label>
      <p id={`${id}-count`} className="-mt-2 text-sm text-muted-foreground">{copy.characters(body.length, BODY_MAX)}</p>
    </>}
    {step === 1 && <>
      <label className="grid gap-2 font-semibold">{copy.audienceLabel}<select className="min-h-11 rounded-md border border-input bg-background px-3 text-foreground" value={audience} disabled={busy} onChange={event => setAudience(event.target.value as Audience)}>{(coach ? COACH_AUDIENCES : TRAVEL_LEAD_AUDIENCES).map(value => <option key={value} value={value}>{copy.audiences[value]}</option>)}</select></label>
      <label className="grid gap-2 font-semibold">{copy.showUntilLabel}<Input type="date" value={date} min={date !== initialDate ? chicagoDateString(Date.now()) : undefined} disabled={busy} aria-describedby={`${id}-until`} onChange={event => setDate(event.target.value)}/></label>
      <p id={`${id}-until`} className="-mt-2 text-sm text-muted-foreground">{copy.showUntilHint}</p>
    </>}
    {!editing && step === 2 && <>
      <label className="flex min-h-11 items-center gap-3"><Checkbox className="size-6" checked={willPin} disabled={busy || !pinAvailable} aria-describedby={pinAvailable ? undefined : `${id}-limit`} onCheckedChange={setPin}/><span>{copy.pinLabel}</span></label>
      {!pinAvailable && <p id={`${id}-limit`} className="-mt-2 text-sm text-muted-foreground">{copy.limitReached}</p>}
      {coach ? <>
        <label className="flex min-h-11 items-center gap-3"><Checkbox className="size-6" checked={urgent} disabled={busy} aria-describedby={`${id}-urgent`} onCheckedChange={setUrgent}/><span>{copy.urgentLabel}</span></label>
        <p id={`${id}-urgent`} className="-mt-2 text-sm text-muted-foreground">{copy.urgentHint}</p>
      </> : <p className="text-sm text-muted-foreground">{copy.wizard.noOptionsForTravelLead}</p>}
    </>}
    {step === last && <>
      <dl className="m-0 grid">
        {title.trim() && fact(copy.titleLabel.replace(' (optional)', ''), title.trim(), 0)}
        {fact(copy.messageLabel, body, 0)}
        {fact(copy.audienceLabel, copy.audiences[audience], 1)}
        {fact(copy.wizard.hiddenAfter, showUntil === undefined ? copy.wizard.untilUnpinned : dateFormat.format(showUntil), 1)}
        {!editing && fact(copy.wizard.homeLabel, willPin ? copy.wizard.willPin : copy.wizard.willNotPin, 2)}
        {!editing && sendUrgent && fact(copy.urgentBadge, copy.wizard.urgentSent, 2)}
      </dl>
      <p className="m-0 text-sm text-muted-foreground">{editing ? copy.wizard.editNote : willPin ? copy.wizard.publishNote : copy.savedNotPinned}</p>
    </>}
    {problem && <p role="alert" className="open-text">{problem}</p>}
    {done && step === 0 && <p role="status" className="ready-text">{done}</p>}
    <div className="flex flex-wrap gap-2">
      {step > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => { setProblem(''); setStep(step - 1) }}>{copy.wizard.back}</Button>}
      <Button type="submit" disabled={busy}>{step < last ? copy.wizard.next : busy ? copy.saving : editing ? copy.wizard.saveChanges : willPin ? copy.wizard.publish : copy.save}</Button>
      {onCancel && <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{copy.wizard.cancel}</Button>}
    </div>
  </form>
}
