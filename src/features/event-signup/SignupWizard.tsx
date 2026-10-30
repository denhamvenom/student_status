import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CircleAlert, CircleCheck, X } from 'lucide-react'
import { cn } from 'cn'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { desktopQuery, useMediaQuery } from '@/components/dashboard/useMediaQuery'
import { dashboardButtonVariants, eyebrow, focusRing, inset } from '@/components/dashboard/styles'
import { eventSchedule } from '@/lib/event-schedule'
import { userFacingError } from '@/lib/error-message'
import type { Id } from '../../../convex/_generated/dataModel'
import type { SignupAvailability, WhatsLeftItem } from '../student-home/contract'
import { homeCopy } from '../student-home/copy'
import { formatMoney } from '../student-home/format'
import type { SignUpResult } from '../student-home/types'
import { itemHref, itemLabel } from '../student-home/tiles/WhatsLeftTile'
import { signupCopy } from './copy'
import { shiftDay, shiftTimes } from './format'
import { answerIssues, answersToSend, draftsFromSaved, reconcileDrafts, reconcileShifts, shiftBounds, shiftChoiceIssue, unansweredRequired } from './logic'
import { QuestionFields, type Drafts } from './QuestionFields'
import { ShiftPicker } from './ShiftPicker'
import type { EventFacts, SignupChoice, SignupExtras, SignupWizardSource } from './types'
import { answerStepKey, draftText, errorStepKey, offersShifts, sameAnswers, sameIds, stepKey, stillToDo, wizardSteps, type WizardStep } from './wizard'

const copy = signupCopy.wizard
const sheetCopy = homeCopy.signupSheet
type QuestionId = Id<'eventQuestions'>
type Loadable<T> = T | undefined | Error

const button = (tone: 'primary' | 'soft' | 'ghost') => cn(dashboardButtonVariants({ tone, size: 'lg' }), 'min-h-12! lg:min-h-11!')
const sectionTitle = 'm-0! text-[15px]! font-bold text-vs-heading'
const errorBox = 'm-0 rounded-inset border border-vs-urgent-border bg-vs-urgent-soft p-3 text-[14px] text-vs-urgent'

/** Moves focus to a field with a problem so a phone scrolls to it. */
function focusField(id: string) {
  const target = document.getElementById(id)
  const field = target?.matches('input, textarea') ? target : target?.querySelector<HTMLElement>('input, textarea, button:not([disabled])')
  ;(field ?? target)?.focus()
}

/** The signup failed on the server while saving one part (event page Change/Edit). */
class PartSaveError extends Error {
  constructor(readonly part: 'shifts' | 'answers', readonly reason: unknown) { super(part) }
}

/**
 * One screen: step count, a heading that takes focus when the screen changes (so screen readers hear the new step),
 * the step's content, and the buttons pinned at the bottom. `footer` gets the form id for its submit button.
 */
function Screen({ title, headingId, focusKey, step, total, onSubmit, footer, alert, children }: {
  title: string
  headingId?: string
  focusKey: string
  step?: number
  total?: number
  onSubmit?: (event: FormEvent) => void
  footer: (formId: string) => ReactNode
  /** A problem with this step, shown just above the buttons so it is seen when Continue is pressed. */
  alert?: { id: string; text: string } | null
  children: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formId = useId()
  useEffect(() => {
    // Two frames: the sheet moves focus into itself on open; the heading takes it after that.
    let inner = 0
    const outer = window.requestAnimationFrame(() => { inner = window.requestAnimationFrame(() => headingRef.current?.focus()) })
    return () => { window.cancelAnimationFrame(outer); window.cancelAnimationFrame(inner) }
  }, [focusKey])
  const counted = step !== undefined && total !== undefined && total > 1
  // The step count is written once, inside the heading, so it is shown and read a single time.
  const body = <>
    {counted && <div aria-hidden="true" className="flex gap-1">{Array.from({ length: total }, (_, i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < step ? 'bg-vs-accent-text' : 'bg-vs-border')} />)}</div>}
    <h3 ref={headingRef} id={headingId} tabIndex={-1} className="m-0! flex flex-col gap-1 text-[22px]! leading-tight! font-bold text-vs-heading focus:outline-none">
      {counted && <span className="text-[13px] leading-normal font-semibold text-vs-muted">{copy.stepOf(step, total)}<span className="sr-only">:</span></span>}
      <span>{title}</span>
    </h3>
    {children}
  </>
  return <>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-6">
      {onSubmit
        ? <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-5">{body}</form>
        : <div className="flex flex-col gap-5">{body}</div>}
    </div>
    <div className="flex flex-col gap-2 border-t border-vs-border-subtle px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {alert && <p id={alert.id} role="alert" className={cn(errorBox, 'flex items-start gap-2 font-semibold')}><CircleAlert size={18} aria-hidden="true" className="mt-px shrink-0" />{alert.text}</p>}
      <div className="flex gap-2">{footer(formId)}</div>
    </div>
  </>
}

/** Loading or a load failure, with Close pinned at the bottom. */
function Message({ text, failed, onClose }: { text: string; failed?: boolean; onClose: () => void }) {
  return <>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <p role={failed ? 'alert' : 'status'} className="m-0 text-[15px] text-vs-text-2">{text}</p>
    </div>
    <div className="flex border-t border-vs-border-subtle px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button type="button" onClick={onClose} className={cn(button('soft'), 'flex-1')}>{copy.close}</button>
    </div>
  </>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-0.5 border-b border-vs-border-subtle py-3 last:border-b-0">
    <dt className={eyebrow}>{label}</dt>
    <dd className="m-0 text-[16px] text-vs-text">{children}</dd>
  </div>
}

function outcomeText(availability: SignupAvailability) {
  if (availability.outcome === 'closed') return availability.signupMode === 'assigned' ? sheetCopy.outcome.assigned : sheetCopy.outcome.closed
  if (availability.outcome === 'waitlisted') return sheetCopy.outcome.waitlisted
  if (availability.outcome === 'waitingForApproval') return sheetCopy.outcome.waitingForApproval
  return availability.feeCents > 0 ? sheetCopy.outcome.signedUp : sheetCopy.outcome.signedUpNoFee
}

function spotsText(availability: SignupAvailability) {
  if (availability.capacity === null || availability.spotsLeft === null) return null
  return availability.spotsLeft > 0 ? sheetCopy.spotsLeft(availability.spotsLeft) : sheetCopy.full
}

/** `outcome` is false when a review step follows: what Sign up does is said once, on the screen whose button does it. */
function EventDetails({ availability, facts, shiftsLater, outcome }: { availability: SignupAvailability; facts: Loadable<EventFacts>; shiftsLater: boolean; outcome: boolean }) {
  const spots = spotsText(availability)
  const closed = availability.outcome === 'closed'
  return <>
    <dl className="m-0">
      <Fact label={copy.facts.when}>{eventSchedule(availability)}</Fact>
      {!(facts instanceof Error) && <Fact label={copy.facts.where}>{facts === undefined ? copy.loading : facts.place}</Fact>}
      <Fact label={copy.facts.cost}>{availability.feeCents > 0 ? formatMoney(availability.feeCents) : copy.facts.free}</Fact>
      {facts && !(facts instanceof Error) && facts.ride && <Fact label={copy.facts.ride}>{facts.ride}</Fact>}
      {spots && !closed && <Fact label={copy.facts.spots}>{spots}</Fact>}
      {(outcome || closed) && <Fact label={closed ? sheetCopy.whatHappens : copy.facts.whatHappens}>{outcomeText(availability)}</Fact>}
    </dl>
    {shiftsLater && <p className="m-0 text-[15px] text-vs-text-2">{signupCopy.shifts.waitlist}</p>}
  </>
}

type FlowProps = {
  eventId: Id<'events'>
  steps: WizardStep<QuestionId>[]
  extras: SignupExtras
  initialKey: string
  /** Signup only: the Event details step's facts. */
  details: { availability: SignupAvailability; facts: Loadable<EventFacts> } | null
  /** Signs up (or saves); throws to show the error on its step. */
  onFinish: (choice: SignupChoice) => Promise<void>
  /** True while the signup or save is sending, so the wizard can't be dismissed and lose its result. */
  onBusyChange: (busy: boolean) => void
  onClose: () => void
}

/**
 * The steps, one at a time. Continue checks only the step on screen; the last step checks everything again
 * (the questions and shifts are live) and sends it all at once. A server error opens the step it belongs to.
 */
function StepsFlow({ eventId, steps, extras, initialKey, details, onFinish, onBusyChange, onClose }: FlowProps) {
  const questions = extras.questions?.questions ?? []
  const saved = extras.questions?.answers ?? []
  const shifts = extras.shifts
  const hasShiftStep = steps.some(s => s.kind === 'shifts')
  const [current, setCurrent] = useState(initialKey)
  const [returnToReview, setReturnToReview] = useState(false)
  const [picked, setPicked] = useState<Id<'eventShifts'>[]>(() => shifts?.selectedShiftIds ?? [])
  const [typed, setTyped] = useState<Drafts>(() => draftsFromSaved(questions, saved))
  const [tried, setTried] = useState<ReadonlySet<string>>(() => new Set())
  const [serverError, setServerError] = useState<{ key: string; message: string } | null>(null)
  const [busy, setBusyState] = useState(false)
  const setBusy = (next: boolean) => { setBusyState(next); onBusyChange(next) }
  // The queries are live: drop choices that vanished and default new questions without wiping the rest.
  const selected = reconcileShifts(picked, shifts?.shifts ?? [])
  const drafts = reconcileDrafts(questions, typed, saved)
  const bounds = shifts ? shiftBounds(shifts, shifts.shifts.length) : { min: 0, max: null }
  const shiftIssue = hasShiftStep ? shiftChoiceIssue(selected.length, bounds) : null
  const issues = answerIssues(questions, drafts)
  const index = Math.max(0, steps.findIndex(s => stepKey(s) === current))
  const step = steps[index]
  const key = stepKey(step)
  const last = index === steps.length - 1
  const edit = !details
  const closed = details?.availability.outcome === 'closed'
  const idPrefix = `signup-wizard-${eventId}`
  const headingId = `${idPrefix}-heading`

  /** The field to focus when a step can't be left yet, or null when it's fine. */
  const problem = (s: WizardStep<QuestionId>): string | null => {
    if (s.kind === 'shifts') return shiftIssue ? `${idPrefix}-shifts` : null
    if (s.kind === 'question') return issues[s.questionId] ? `${idPrefix}-${s.questionId}` : null
    if (s.kind === 'questions') { const bad = questions.find(q => issues[q.questionId]); return bad ? `${idPrefix}-${bad.questionId}` : null }
    return null
  }
  const go = (next: string) => { setCurrent(next); if (next === 'review') setReturnToReview(false) }
  const markTried = (k: string) => setTried(previous => new Set([...previous, k]))

  const finish = async () => {
    const bad = steps.find(s => problem(s))
    if (bad) { markTried(stepKey(bad)); go(stepKey(bad)); return }
    setBusy(true); setServerError(null)
    try {
      await onFinish({ answers: answersToSend(questions, drafts), shiftIds: hasShiftStep ? selected : [] })
    } catch (cause) {
      const part = cause instanceof PartSaveError ? cause.part : null
      const fallback = part === 'shifts' ? signupCopy.shifts.failed : part === 'answers' ? signupCopy.questions.failed : sheetCopy.failed
      const message = userFacingError(cause instanceof PartSaveError ? cause.reason : cause, fallback)
      const target = errorStepKey(steps, message, questions, part) ?? key
      setServerError({ key: target, message })
      go(target)
    } finally { setBusy(false) }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const field = problem(step)
    if (field) { markTried(key); focusField(field); return }
    if (serverError?.key === key) setServerError(null)
    if (last) { void finish(); return }
    go(returnToReview && steps.some(s => s.kind === 'review') ? 'review' : stepKey(steps[index + 1]))
  }
  const editStep = (k: string | null) => { if (!k) return; setReturnToReview(true); setCurrent(k) }

  const questionSteps = steps.filter(s => s.kind === 'question')
  const title = step.kind === 'details' ? copy.steps.details
    : step.kind === 'shifts' ? copy.steps.shifts
      : step.kind === 'question' && questionSteps.length > 1 ? copy.steps.question(questionSteps.indexOf(step) + 1, questionSteps.length)
        : step.kind === 'review' ? (edit ? copy.steps.reviewEdit : copy.steps.review) : copy.steps.questions
  const finishLabel = edit ? (busy ? copy.saving : copy.save) : (busy ? copy.signingUp : copy.signUp)
  const shown = tried.has(key) ? issues : {}
  const pickedShifts = shifts?.shifts.filter(s => selected.includes(s.shiftId)) ?? []
  const shiftAlert = step.kind === 'shifts' && tried.has(key) && shiftIssue ? { id: `${idPrefix}-shift-error`, text: shiftIssue } : null

  const content = (() => {
    switch (step.kind) {
      case 'details': return details && <EventDetails availability={details.availability} facts={details.facts}
        shiftsLater={details.availability.outcome === 'waitlisted' && offersShifts(extras)} outcome={last} />
      case 'shifts': return shifts && <div id={`${idPrefix}-shifts`}>
        <ShiftPicker shifts={shifts.shifts} bounds={bounds} selected={selected} held={shifts.selectedShiftIds} onChange={setPicked}
          errorId={shiftAlert ? shiftAlert.id : undefined} labelledBy={headingId} />
      </div>
      case 'question': {
        const question = questions.find(q => q.questionId === step.questionId)
        return question && <QuestionFields questions={[question]} drafts={drafts} issues={shown} idPrefix={idPrefix} title={null}
          onChange={(questionId, draft) => setTyped({ ...drafts, [questionId]: draft })} />
      }
      case 'questions': return <QuestionFields questions={questions} drafts={drafts} issues={shown} idPrefix={idPrefix} title={null}
        onChange={(questionId, draft) => setTyped({ ...drafts, [questionId]: draft })} />
      case 'review': return <div className="flex flex-col gap-6">
        {details && <p className="m-0 text-[15px] text-vs-text-2">{outcomeText(details.availability)}</p>}
        {hasShiftStep && <section className="flex flex-col gap-2" aria-labelledby={`${idPrefix}-review-shifts`}>
          <div className="flex items-center justify-between gap-3">
            <h4 id={`${idPrefix}-review-shifts`} className={sectionTitle}>{copy.yourShifts}</h4>
            <button type="button" aria-label={copy.editShifts} disabled={busy} onClick={() => editStep('shifts')} className={dashboardButtonVariants({ tone: 'soft', size: 'md' })}>{copy.edit}</button>
          </div>
          {pickedShifts.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pickedShifts.map(s => <li key={s.shiftId} className={cn(inset, 'px-3.5 py-2.5')}>
              <span className="block text-[15px] font-bold text-vs-text">{shiftDay(s.startsAt)} · {shiftTimes(s)}</span>
              {s.label && <span className="block text-[14px] text-vs-text-2">{s.label}</span>}
            </li>)}
          </ul> : <p className="m-0 text-[15px] text-vs-text-2">{copy.noShifts}</p>}
        </section>}
        {questions.length > 0 && <section className="flex flex-col gap-1" aria-labelledby={`${idPrefix}-review-answers`}>
          <h4 id={`${idPrefix}-review-answers`} className={sectionTitle}>{copy.yourAnswers}</h4>
          <dl className="m-0 flex flex-col">
            {questions.map(q => <div key={q.questionId} className="flex flex-col gap-1 border-b border-vs-border-subtle py-2.5 last:border-b-0">
              <dt className="text-[14px] text-vs-muted">{q.prompt}</dt>
              <dd className="m-0 flex items-center justify-between gap-3">
                <span className="min-w-0 text-[15px] font-semibold break-words text-vs-text">{draftText(drafts[q.questionId])}</span>
                <button type="button" aria-label={copy.editAnswer(q.prompt)} disabled={busy} onClick={() => editStep(answerStepKey(steps, q.questionId))} className={dashboardButtonVariants({ tone: 'soft', size: 'md' })}>{copy.edit}</button>
              </dd>
            </div>)}
          </dl>
        </section>}
      </div>
    }
  })()

  return <Screen title={title} headingId={headingId} focusKey={key} step={index + 1} total={steps.length} onSubmit={submit} alert={shiftAlert}
    footer={formId => <>
      {index > 0 && <button type="button" disabled={busy} onClick={() => { setReturnToReview(false); setCurrent(stepKey(steps[index - 1])) }} className={cn(button('soft'), 'flex-1')}>{copy.back}</button>}
      {closed
        ? <button type="button" onClick={onClose} className={cn(button('soft'), 'flex-1')}>{copy.close}</button>
        : <button type="submit" form={formId} disabled={busy} className={cn(button('primary'), 'flex-[2]')}>{last ? finishLabel : copy.next}</button>}
    </>}>
    {content}
    {serverError?.key === key && <p role="alert" className={errorBox}>{serverError.message}</p>}
  </Screen>
}

/** A Done screen list of What's left items; each opens where it gets done. */
function TodoList({ items, onClose }: { items: WhatsLeftItem[]; onClose: () => void }) {
  const row = cn(inset, 'flex min-h-12 items-center gap-3 rounded-lg px-3.5 py-2.5')
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">{items.map(item => {
    const href = itemHref(item)
    const body = <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold text-vs-text">{itemLabel(item)}</span>
        <span className="text-[13px] text-vs-muted">{homeCopy.whatsLeft.groups[item.owner]}</span>
      </span>
      {href && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-vs-muted" />}
    </>
    return <li key={item.key}>{href
      ? <Link to={href} onClick={onClose} className={cn(row, 'font-normal! text-vs-text! no-underline! hover:no-underline! hover:brightness-110', focusRing)}>{body}</Link>
      : <div className={row}>{body}</div>}</li>
  })}</ul>
}

/**
 * "You're signed up": the result, what's left For this event, and apart from it the Team to-dos (FIRST, health
 * profile, a parent link) that aren't part of this event. From Home's What's left; it updates as the server catches up.
 */
function DoneScreen({ result, eventId, source, eventHref, onClose }: { result: SignUpResult; eventId: Id<'events'>; source: SignupWizardSource; eventHref?: string; onClose: () => void }) {
  const items = source.useWhatsLeft()
  const todo = items === undefined || items instanceof Error ? null : stillToDo(items, eventId)
  return <Screen title={copy.doneTitle[result]} focusKey="done" footer={() =>
    <button type="button" onClick={onClose} className={cn(button('primary'), 'flex-1')}>{copy.done}</button>}>
    <p role="status" className="m-0 flex items-start gap-2.5 rounded-inset border border-vs-success-border bg-vs-success-soft p-3.5 text-[15px] font-semibold text-vs-success">
      <CircleCheck size={20} aria-hidden="true" className="mt-px shrink-0" />{sheetCopy.result[result]}
    </p>
    {!(items instanceof Error) && <section className="flex flex-col gap-2" aria-labelledby={`done-${eventId}-event`}>
      <h4 id={`done-${eventId}-event`} className={sectionTitle}>{copy.forThisEvent}</h4>
      {todo === null ? <p role="status" className="m-0 text-[15px] text-vs-muted">{copy.loading}</p>
        : todo.event.length === 0 ? <p className="m-0 text-[15px] text-vs-text-2">{copy.nothingForEvent}</p>
          : <TodoList items={todo.event} onClose={onClose} />}
    </section>}
    {todo && todo.team.length > 0 && <section className="flex flex-col gap-2" aria-labelledby={`done-${eventId}-team`}>
      <h4 id={`done-${eventId}-team`} className={sectionTitle}>{copy.teamToDos}</h4>
      <TodoList items={todo.team} onClose={onClose} />
    </section>}
    {eventHref && <Link to={eventHref} onClick={onClose} className={cn(dashboardButtonVariants({ tone: 'soft', size: 'md' }), 'self-start')}>{copy.openEvent}</Link>}
  </Screen>
}

function SignupSteps({ eventId, availability, facts, source, onSending, onSignedUp, onBusyChange, onClose }: {
  eventId: Id<'events'>
  availability: SignupAvailability
  facts: Loadable<EventFacts>
  source: SignupWizardSource
  onSending: (sending: boolean) => void
  onBusyChange: (busy: boolean) => void
  onSignedUp: (result: SignUpResult) => void
  onClose: () => void
}) {
  const closed = availability.outcome === 'closed'
  const extras = source.useSignupExtras(eventId, { questions: !closed && availability.hasQuestions, shifts: !closed && availability.shiftsEnabled })
  if (extras === undefined) return <Message text={copy.loading} onClose={onClose} />
  if (extras instanceof Error) return <Message text={copy.loadFailed} failed onClose={onClose} />
  const steps = wizardSteps({ edit: false, closed, waitlisted: availability.outcome === 'waitlisted', shiftsOffered: offersShifts(extras),
    questionIds: extras.questions?.questions.map(q => q.questionId) ?? [] })
  const plain = steps.length === 1
  return <StepsFlow eventId={eventId} steps={steps} extras={extras} initialKey="details" details={{ availability, facts }} onClose={onClose} onBusyChange={onBusyChange}
    onFinish={async choice => {
      onSending(true)
      try { onSignedUp(await source.signUp(eventId, plain ? undefined : choice)) }
      finally { onSending(false) }
    }} />
}

function SignupBody({ eventId, source, eventHref, onSignedUp, onBusyChange, onClose }: {
  eventId: Id<'events'>
  source: SignupWizardSource
  eventHref?: string
  onSignedUp?: (result: SignUpResult) => void
  onBusyChange: (busy: boolean) => void
  onClose: () => void
}) {
  const live = source.useAvailability(eventId)
  const facts = source.useEventFacts(eventId)
  const [result, setResult] = useState<SignUpResult | null>(null)
  // While Sign up is sending, keep the availability it was pressed with: the live one turns 'closed' once it lands.
  const [frozen, setFrozen] = useState<SignupAvailability | null>(null)
  const availability = frozen ?? live
  if (result) return <DoneScreen result={result} eventId={eventId} source={source} eventHref={eventHref} onClose={onClose} />
  if (availability === undefined) return <Message text={copy.loading} onClose={onClose} />
  if (availability instanceof Error) return <Message text={sheetCopy.loadFailed} failed onClose={onClose} />
  return <SignupSteps eventId={eventId} availability={availability} facts={facts} source={source} onClose={onClose}
    onSending={sending => setFrozen(sending ? availability : null)} onBusyChange={onBusyChange}
    onSignedUp={next => { setResult(next); onSignedUp?.(next) }} />
}

function EditBody({ eventId, source, start, waitlisted, onSaved, onBusyChange, onClose }: {
  eventId: Id<'events'>
  source: SignupWizardSource
  start: 'shifts' | 'answers'
  waitlisted: boolean
  onSaved?: (saved: { shifts: boolean; answers: boolean }) => void
  onBusyChange: (busy: boolean) => void
  onClose: () => void
}) {
  const extras = source.useSignupExtras(eventId, { questions: true, shifts: true })
  if (extras === undefined) return <Message text={copy.loading} onClose={onClose} />
  if (extras instanceof Error) return <Message text={copy.loadFailed} failed onClose={onClose} />
  const questions = extras.questions?.questions ?? []
  const saved = extras.questions?.answers ?? []
  const steps = wizardSteps({ edit: true, closed: false, waitlisted, shiftsOffered: offersShifts(extras), questionIds: questions.map(q => q.questionId) })
  if (!steps.length) return <Message text={copy.loadFailed} failed onClose={onClose} />
  // Edit answers opens the first required question still unanswered.
  const firstQuestion = unansweredRequired(questions, saved)[0] ?? questions[0]
  const initialKey = start === 'shifts' && steps.some(s => s.kind === 'shifts') ? 'shifts'
    : (firstQuestion && answerStepKey(steps, firstQuestion.questionId)) ?? stepKey(steps[0])
  const hasShiftStep = steps.some(s => s.kind === 'shifts')
  return <StepsFlow eventId={eventId} steps={steps} extras={extras} initialKey={initialKey} details={null} onClose={onClose} onBusyChange={onBusyChange}
    onFinish={async choice => {
      const shifts = hasShiftStep && !sameIds(choice.shiftIds, extras.shifts?.selectedShiftIds ?? [])
      const answers = questions.length > 0 && !sameAnswers(choice.answers, saved)
      if (shifts) await source.saveShifts(eventId, choice.shiftIds).catch((cause: unknown) => { throw new PartSaveError('shifts', cause) })
      if (answers) await source.saveAnswers(eventId, choice.answers).catch((cause: unknown) => { throw new PartSaveError('answers', cause) })
      onSaved?.({ shifts, answers })
      onClose()
    }} />
}

export type SignupWizardMode =
  | { kind: 'signup' }
  /** The event page's Change (shifts) or Edit (answers) for a Student already signed up; saves without signing up again. */
  | { kind: 'edit'; start: 'shifts' | 'answers'; waitlisted: boolean }

/**
 * The step-by-step signup: Event details, shifts, questions, review, then "You're signed up" with what's still to do.
 * Full screen on phones, a side panel on desktop. Its content unmounts when closed, so each open starts fresh.
 */
export function SignupWizard({ eventId, eventName, open, onOpenChange, mode, source, eventHref, onSaved, onSignedUp, returnFocus }: {
  eventId: Id<'events'>
  eventName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: SignupWizardMode
  source: SignupWizardSource
  /** A link to the event page on the done screen (Home only). */
  eventHref?: string
  onSaved?: (saved: { shifts: boolean; answers: boolean }) => void
  /** Signup only: the result as soon as the signup lands (Home confirms it once the wizard closes). */
  onSignedUp?: (result: SignUpResult) => void
  /** Where focus goes on close; when it returns null, back to what opened the wizard. */
  returnFocus?: () => HTMLElement | null
}) {
  const desktop = useMediaQuery(desktopQuery)
  // While the signup or save is sending, Escape, the backdrop and X don't close it: its result or error would be lost.
  const [busy, setBusy] = useState(false)
  const close = () => onOpenChange(false)
  return <Sheet open={open} onOpenChange={next => { if (next || !busy) onOpenChange(next) }}>
    <SheetContent side={desktop ? 'right' : 'bottom'} showCloseButton={false} finalFocus={returnFocus && (() => returnFocus() ?? true)} className={cn(
      'gap-0 border-vs-border bg-vs-card text-vs-text shadow-vs-hero',
      'data-[side=bottom]:h-dvh data-[side=bottom]:max-h-dvh data-[side=bottom]:border-t-0',
      'data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]',
    )}>
      <SheetHeader className="flex-row items-start gap-2 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <SheetTitle className="m-0! min-w-0 flex-1 pt-2 font-heading! text-[24px]! leading-[1.2]! font-normal! tracking-normal! text-vs-heading">{eventName}</SheetTitle>
        <SheetClose aria-label={copy.close} disabled={busy} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'md' }), '-mr-2 size-12 px-0')}><X size={22} aria-hidden="true" /></SheetClose>
      </SheetHeader>
      {mode.kind === 'signup'
        ? <SignupBody eventId={eventId} source={source} eventHref={eventHref} onSignedUp={onSignedUp} onBusyChange={setBusy} onClose={close} />
        : <EditBody eventId={eventId} source={source} start={mode.start} waitlisted={mode.waitlisted} onSaved={onSaved} onBusyChange={setBusy} onClose={close} />}
    </SheetContent>
  </Sheet>
}
