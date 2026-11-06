import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CircleAlert, Minus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { desktopQuery, useMediaQuery } from '@/components/dashboard/useMediaQuery'
import { dashboardButtonVariants, eyebrow, focusRing, inset } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { eventSchedule } from '@/lib/event-schedule'
import { userFacingError } from '@/lib/error-message'
import { formatWhen } from '../student-home/agenda'
import type { MentorMeeting } from './contract'
import { meetingPlace, typeLabel } from './logic'
import {
  MAX_NEXT, MIN_NEXT, clampCount, firstIssue, initialChoice, reviewLines, scopeOptions, stepIssue, wizardCalls, wizardSteps,
  type AnswerArgs, type SeriesScope, type SignupArgs, type WizardCall, type WizardChoice, type WizardMode, type WizardStep,
} from './signup-wizard'

const copy = mentorHomeCopy.signup
const seriesCopy = mentorHomeCopy.series

/** What the Mentor can do with their own sign-ups. Each returns once the server has saved the change, or throws. */
export type MentorActions = {
  signUp: (meeting: MentorMeeting, args: SignupArgs) => Promise<unknown>
  respond: (meeting: MentorMeeting, status: 'accepted' | 'declined', args?: SignupArgs) => Promise<unknown>
  updateAnswers: (meeting: MentorMeeting, answers: AnswerArgs, allMeetingsInSeries: boolean) => Promise<unknown>
  withdraw: (meeting: MentorMeeting) => Promise<unknown>
  skip: (meeting: MentorMeeting) => Promise<unknown>
  /** Leave all meetings in this series; resolves to how many meetings the Mentor left. */
  leaveSeries: (meeting: MentorMeeting) => Promise<number>
}

const big = (tone: 'primary' | 'soft' | 'ghost') => cn(dashboardButtonVariants({ tone, size: 'lg' }), 'min-h-12! lg:min-h-11!')
const errorBox = 'm-0 flex items-start gap-2 rounded-inset border border-vs-urgent-border bg-vs-urgent-soft p-3 text-[14px] font-semibold text-vs-urgent'
const optionCard = cn('flex min-h-14 cursor-pointer items-start gap-3 rounded-inset border border-vs-border bg-vs-inset px-4 py-3 text-vs-text',
  'has-[:checked]:border-vs-accent-text has-[:checked]:bg-vs-inset-raised has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-vs-accent-text')

function perform(actions: MentorActions, meeting: MentorMeeting, call: WizardCall) {
  if (call.kind === 'signUp') return actions.signUp(meeting, call.args)
  if (call.kind === 'respond') return actions.respond(meeting, 'accepted', call.args)
  return actions.updateAnswers(meeting, call.answers, call.allMeetingsInSeries)
}

/** One big radio choice: a label, an optional help line, and room for more below it when chosen. */
function Option({ name, checked, onChange, label, help, children }: { name: string; checked: boolean; onChange: () => void; label: string; help?: string; children?: ReactNode }) {
  return <div className="flex flex-col gap-2">
    <label className={optionCard}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-5 shrink-0 accent-[var(--vs-accent-text)]" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[16px] font-bold">{label}</span>
        {help && <span className="text-[14px] text-vs-text-2">{help}</span>}
      </span>
    </label>
    {checked && children}
  </div>
}

/** "How many meetings?": a number from 1 to 52 with one-tap fewer / more buttons. */
function CountPicker({ id, value, onChange }: { id: string; value: number; onChange: (next: number) => void }) {
  const [text, setText] = useState(String(value))
  const set = (next: number) => { const clamped = clampCount(next); setText(String(clamped)); onChange(clamped) }
  return <div className={cn(inset, 'flex flex-col gap-2 px-4 py-3')}>
    <label htmlFor={id} className="text-[15px] font-semibold text-vs-text">{copy.which.countLabel}</label>
    <div className="flex items-center gap-2">
      <button type="button" aria-label={copy.which.fewer} disabled={value <= MIN_NEXT} onClick={() => set(value - 1)} className={cn(big('soft'), 'size-12 px-0')}><Minus size={20} aria-hidden="true" /></button>
      <input id={id} type="number" inputMode="numeric" min={MIN_NEXT} max={MAX_NEXT} step={1} value={text} aria-describedby={`${id}-help`}
        onChange={e => { setText(e.target.value); onChange(e.target.value === '' ? Number.NaN : Number(e.target.value)) }}
        onBlur={() => { if (text !== '') set(Number(text)) }}
        className={cn('h-12 w-20 rounded-[10px] border border-vs-border bg-vs-card text-center text-[18px] font-bold text-vs-text', focusRing)} />
      <button type="button" aria-label={copy.which.more} disabled={value >= MAX_NEXT} onClick={() => set((Number.isFinite(value) ? value : 0) + 1)} className={cn(big('soft'), 'size-12 px-0')}><Plus size={20} aria-hidden="true" /></button>
    </div>
    <p id={`${id}-help`} className="m-0 text-[13px] text-vs-muted">{copy.which.countHelp}</p>
  </div>
}

function YesNo({ name, value, onChange, yes, no }: { name: string; value: boolean | null; onChange: (next: boolean) => void; yes: string; no: string }) {
  return <>
    <Option name={name} checked={value === true} onChange={() => onChange(true)} label={yes} />
    <Option name={name} checked={value === false} onChange={() => onChange(false)} label={no} />
  </>
}

const stepTitle: Record<WizardStep, string> = { which: copy.which.title, drive: copy.drive.title, hotel: copy.hotel.title, review: copy.review.title }

/**
 * The steps, one at a time, with Back / Next pinned at the bottom. Next checks only the step on screen; Confirm checks every
 * step again and sends the Mentor's choices. A server error stays on Review so nothing typed is lost.
 */
function Steps({ meeting, mode, actions, onBusyChange, onClose }: { meeting: MentorMeeting; mode: WizardMode; actions: MentorActions; onBusyChange: (busy: boolean) => void; onClose: () => void }) {
  const steps = wizardSteps(meeting, mode)
  const options = scopeOptions(meeting, mode)
  const [current, setCurrent] = useState<WizardStep>(steps[0])
  const [choice, setChoice] = useState<WizardChoice>(() => initialChoice(meeting, mode))
  const [tried, setTried] = useState<ReadonlySet<WizardStep>>(() => new Set())
  const [returnToReview, setReturnToReview] = useState(false)
  const [busy, setBusyState] = useState(false)
  const [error, setError] = useState('')
  const setBusy = (next: boolean) => { setBusyState(next); onBusyChange(next) }
  const formId = useId(), idPrefix = useId()
  const headingId = `${idPrefix}-heading`
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // Two frames: the sheet/dialog moves focus into itself on open; the heading takes it after that.
    let inner = 0
    const outer = window.requestAnimationFrame(() => { inner = window.requestAnimationFrame(() => headingRef.current?.focus()) })
    return () => { window.cancelAnimationFrame(outer); window.cancelAnimationFrame(inner) }
  }, [current])
  const index = Math.max(0, steps.indexOf(current))
  const step = steps[index]
  const last = index === steps.length - 1
  const issue = tried.has(step) ? stepIssue(step, choice, options) : null
  const update = (next: Partial<WizardChoice>) => { setError(''); setChoice(previous => ({ ...previous, ...next })) }
  const go = (next: WizardStep) => { setCurrent(next); if (next === 'review') setReturnToReview(false) }

  const confirm = async () => {
    const bad = firstIssue(steps, choice, options)
    if (bad) { setTried(previous => new Set([...previous, bad])); go(bad); return }
    const calls = wizardCalls(meeting, mode, choice)
    if (!calls.length) { toast.success(copy.done.nothing); onClose(); return }
    setBusy(true); setError('')
    try {
      for (const call of calls) await perform(actions, meeting, call)
      toast.success(copy.done[mode](meeting.title))
      setBusy(false)
      onClose()
    } catch (cause) {
      setError(userFacingError(cause, copy.failed[mode]))
      setBusy(false)
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (stepIssue(step, choice, options)) { setTried(previous => new Set([...previous, step])); return }
    if (last) { void confirm(); return }
    go(returnToReview ? 'review' : steps[index + 1])
  }

  const name = `${idPrefix}-${step}`
  const content = step === 'which' ? <div role="radiogroup" aria-labelledby={headingId} aria-describedby={`${idPrefix}-help`} className="flex flex-col gap-2.5">
    {options.includes('all') && <Option name={name} checked={choice.scope === 'all'} onChange={() => update({ scope: 'all' })} label={copy.which.every} help={copy.which.everyHelp} />}
    {options.includes('one') && <Option name={name} checked={choice.scope === 'one'} onChange={() => update({ scope: 'one' })} label={copy.which.justOne} help={copy.which.justOneHelp(formatWhen(meeting.startsAt, meeting.endsAt))} />}
    {options.includes('next') && <Option name={name} checked={choice.scope === 'next'} onChange={() => update({ scope: 'next' as SeriesScope })} label={copy.which.next} help={copy.which.nextHelp}>
      <CountPicker id={`${idPrefix}-count`} value={choice.count} onChange={count => update({ count })} />
    </Option>}
    {mode === 'change' && <p className="m-0 text-[14px] text-vs-text-2">{copy.which.changeNote}</p>}
    {!options.includes('one') && <p className="m-0 text-[14px] text-vs-text-2">{copy.which.oneUnavailable}</p>}
  </div>
    : step === 'drive' ? <div role="radiogroup" aria-labelledby={headingId} aria-describedby={`${idPrefix}-help`} className="flex flex-col gap-2.5">
      <YesNo name={name} value={choice.canDrive} onChange={canDrive => update({ canDrive })} yes={copy.drive.yes} no={copy.drive.no} />
    </div>
      : step === 'hotel' ? <div role="radiogroup" aria-labelledby={headingId} aria-describedby={`${idPrefix}-help`} className="flex flex-col gap-2.5">
        <YesNo name={name} value={choice.needsHotel} onChange={needsHotel => update({ needsHotel })} yes={copy.hotel.yes} no={copy.hotel.no} />
      </div>
        : <Review meeting={meeting} mode={mode} choice={choice} busy={busy} onEdit={target => { setReturnToReview(true); setCurrent(target) }} />
  const help = step === 'which' ? copy.which.help : step === 'drive' ? copy.drive.help : step === 'hotel' ? copy.hotel.help : null
  const counted = steps.length > 1

  return <>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-6">
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {counted && <div aria-hidden="true" className="flex gap-1">{steps.map((s, i) => <span key={s} className={cn('h-1.5 flex-1 rounded-full', i <= index ? 'bg-vs-accent-text' : 'bg-vs-border')} />)}</div>}
        <h3 ref={headingRef} id={headingId} tabIndex={-1} className="m-0! flex flex-col gap-1 text-[22px]! leading-tight! font-bold text-vs-heading focus:outline-none">
          {counted && <span className="text-[13px] leading-normal font-semibold text-vs-muted">{copy.stepOf(index + 1, steps.length)}<span className="sr-only">:</span></span>}
          <span>{stepTitle[step]}</span>
        </h3>
        {help && <p id={`${idPrefix}-help`} className="m-0 text-[15px] text-vs-text-2">{help}</p>}
        {content}
      </form>
    </div>
    <div className="flex flex-col gap-2 border-t border-vs-border-subtle px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {(issue || error) && <p role="alert" className={errorBox}><CircleAlert size={18} aria-hidden="true" className="mt-px shrink-0" />{issue ?? error}</p>}
      <div className="flex gap-2">
        {index > 0 && <button type="button" disabled={busy} onClick={() => { setReturnToReview(false); setCurrent(steps[index - 1]) }} className={cn(big('soft'), 'flex-1')}>{copy.back}</button>}
        <button type="submit" form={formId} disabled={busy} className={cn(big('primary'), 'flex-[2]')}>{last ? (busy ? copy.saving : copy.confirm[mode]) : copy.next}</button>
      </div>
    </div>
  </>
}

function Review({ meeting, mode, choice, busy, onEdit }: { meeting: MentorMeeting; mode: WizardMode; choice: WizardChoice; busy: boolean; onEdit: (step: WizardStep) => void }) {
  const lines = reviewLines(meeting, mode, choice)
  const type = typeLabel(meeting)
  const fact = (label: string, value: ReactNode, action?: ReactNode) => <div key={label} className="flex flex-col gap-0.5 border-b border-vs-border-subtle py-3 last:border-b-0">
    <dt className={eyebrow}>{label}</dt>
    <dd className="m-0 flex items-center justify-between gap-3 text-[16px] text-vs-text"><span className="min-w-0 break-words">{value}</span>{action}</dd>
  </div>
  return <div className="flex flex-col gap-2">
    <dl className="m-0">
      {fact(copy.review.when, eventSchedule(meeting))}
      {fact(copy.review.where, meetingPlace(meeting))}
      {type && fact(copy.review.type, type)}
      {lines.map(line => fact(line.label, <span className="font-semibold">{line.value}</span>, line.edit && <button type="button" disabled={busy} aria-label={copy.review.editLabel(line.label)} onClick={() => onEdit(line.edit!)} className={dashboardButtonVariants({ tone: 'soft', size: 'md' })}>{copy.review.edit}</button>))}
    </dl>
    {!lines.length && mode === 'join' && <p className="m-0 text-[15px] text-vs-text-2">{copy.review.plain}</p>}
  </div>
}

/**
 * The Mentor sign-up wizard: Which meetings? (series), Can you drive students? (travel), Do you need a hotel room?
 * (overnight), then Review and confirm. Only the steps that apply are shown. A bottom sheet on phones, a dialog on desktop.
 * `mode` null keeps it closed; its content unmounts on close, so each open starts from the Mentor's saved answers.
 */
export function MentorSignupWizard({ meeting, mode, actions, onClose }: { meeting: MentorMeeting; mode: WizardMode | null; actions: MentorActions; onClose: () => void }) {
  const desktop = useMediaQuery(desktopQuery)
  // While saving, Escape, the backdrop and X don't close it: the result or error would be lost.
  const [busy, setBusy] = useState(false)
  // Keep the last mode while the closing animation plays.
  const [shown, setShown] = useState<WizardMode>(mode ?? 'join')
  if (mode !== null && mode !== shown) setShown(mode)
  const open = mode !== null
  const change = (next: boolean) => { if (!next && !busy) onClose() }
  const body = <Steps meeting={meeting} mode={mode ?? shown} actions={actions} onBusyChange={setBusy} onClose={onClose} />
  const title = 'm-0! min-w-0 flex-1 pt-2 font-heading! text-[24px]! leading-[1.2]! font-normal! tracking-normal! text-vs-heading'
  if (desktop) return <Dialog open={open} disablePointerDismissal={busy} onOpenChange={change}>
    <DialogContent showCloseButton={false} className="flex max-h-[min(760px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden border border-vs-border bg-vs-card p-0 text-vs-text shadow-vs-hero sm:max-w-[480px]">
      <div className="flex items-start gap-2 px-5 pt-4 pb-2">
        <DialogTitle className={title}>{meeting.title}</DialogTitle>
        <button type="button" aria-label={copy.close} disabled={busy} onClick={onClose} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'md' }), '-mr-2 size-12 px-0')}><X size={22} aria-hidden="true" /></button>
      </div>
      {body}
    </DialogContent>
  </Dialog>
  return <Sheet open={open} onOpenChange={change}>
    <SheetContent side="bottom" showCloseButton={false} className="max-h-[92dvh] gap-0 rounded-t-2xl border-vs-border bg-vs-card text-vs-text shadow-vs-hero">
      <SheetHeader className="flex-row items-start gap-2 px-5 pt-3 pb-2">
        <SheetTitle className={title}>{meeting.title}</SheetTitle>
        <SheetClose aria-label={copy.close} disabled={busy} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'md' }), '-mr-2 size-12 px-0')}><X size={22} aria-hidden="true" /></SheetClose>
      </SheetHeader>
      {body}
    </SheetContent>
  </Sheet>
}

/** "Leave all meetings in this series", confirmed first: it takes the Mentor off every upcoming meeting of the series. */
export function LeaveSeriesButton({ meeting, actions, disabled, size = 'sm' }: { meeting: MentorMeeting; actions: MentorActions; disabled?: boolean; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const leave = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { const left = await actions.leaveSeries(meeting); toast.success(seriesCopy.left(meeting.title, left)); setOpen(false) }
    catch (cause) { setError(userFacingError(cause, seriesCopy.leaveFailed)) }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" disabled={disabled} onClick={() => { setError(''); setOpen(true) }} className={dashboardButtonVariants({ tone: 'ghost', size })}>{seriesCopy.leaveAll}</button>
    <Dialog open={open} disablePointerDismissal onOpenChange={next => { if (!next && !busy) setOpen(false) }}>
      <DialogContent showCloseButton={false} className="gap-3 border border-vs-border bg-vs-card p-5 text-vs-text sm:max-w-[420px]">
        <DialogTitle className="m-0! text-[20px]! font-bold text-vs-heading">{seriesCopy.leaveTitle}</DialogTitle>
        <DialogDescription className="m-0 text-[15px] text-vs-text-2">{seriesCopy.leaveDetail(meeting.title)}</DialogDescription>
        {error && <p role="alert" className={errorBox}><CircleAlert size={18} aria-hidden="true" className="mt-px shrink-0" />{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" disabled={busy} onClick={() => void leave()} className={cn(big('primary'), 'flex-1')}>{busy ? seriesCopy.leaving : seriesCopy.leaveConfirm}</button>
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className={cn(big('soft'), 'flex-1')}>{seriesCopy.leaveKeep}</button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
