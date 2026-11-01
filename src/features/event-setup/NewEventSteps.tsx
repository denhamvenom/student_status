import { useId, useState } from 'react'
import { chicagoInputTime, parseChicagoInput } from '@/lib/chicago-time'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import { Textarea } from '../../components/ui/textarea'
import { ConfirmAction } from '../../ConfirmAction'
import { eventSetupCopy, questionKindLabels } from '../../copy/event-setup-copy'
import styles from './EventSetup.module.css'
import { MAX_QUESTIONS, MAX_REQUIREMENTS, blankQuestion, isChoice, newDraftId, sortedShifts, type DraftQuestion, type DraftRequirement, type DraftShift, type QuestionKind } from './new-event-extras'
import { MAX_SHIFTS, endFollowingStart, eventWindow, nextShiftTimes, overlappingShifts, planShifts, shiftPlaces, shiftTime, shiftTimesIssue, timeSpan } from './shift-plan'

const copy = eventSetupCopy.newEventSteps
const shiftCopy = eventSetupCopy.shifts
const questionCopy = eventSetupCopy.questions
const kinds = Object.keys(questionKindLabels) as QuestionKind[]

type Window = { startsAt: number; endsAt: number }
type Invalid = { field: string | null; message: string }

/** Skip always either advances (nothing to discard) or opens the in-app confirm that names how many unfinished items go. */
function SkipButton({ onSkip, skipCount }: { onSkip: () => void; skipCount: number }) {
  return <div>{skipCount > 0 ? <ConfirmAction description={copy.skipConfirm(skipCount)} onConfirm={async () => onSkip()}>{copy.skip}</ConfirmAction> : <Button type="button" variant="outline" onClick={onSkip}>{copy.skip}</Button>}</div>
}

/** Time slots: generate several back-to-back slots, add or remove single ones, and set how many a student picks. Nothing is saved until Create event. */
export function SlotsStep({ event, shifts, onShifts, max, min, onMax, onMin, invalid, onSkip, skipCount }: { event: Window; shifts: DraftShift[]; onShifts: (shifts: DraftShift[]) => void; max: string; min: string; onMax: (v: string) => void; onMin: (v: string) => void; invalid: Invalid; onSkip: () => void; skipCount: number }) {
  const id = useId()
  const startInput = chicagoInputTime(event.startsAt), endInput = chicagoInputTime(event.endsAt)
  const sameDay = startInput.slice(0, 10) === endInput.slice(0, 10)
  const [plan, setPlan] = useState({ day: startInput.slice(0, 10), from: sameDay ? startInput.slice(11) : '09:00', to: sameDay ? endInput.slice(11) : '17:00', blockMinutes: 120, capacity: '' })
  const [draft, setDraft] = useState({ start: '', end: '', suggested: true, label: '', capacity: '' })
  const [tried, setTried] = useState(false)
  const [message, setMessage] = useState('')
  // Right after Generate the preview would only repeat what was just added, so the already-exists and overlap lines wait for the next plan change.
  const [settled, setSettled] = useState(false)
  const generated = planShifts({ ...plan, event, existing: shifts })
  const times = draft.suggested ? nextShiftTimes(event, shifts) : draft
  const timesIssue = shiftTimesIssue(times.start, times.end, event)
  const draftStart = parseChicagoInput(times.start), draftEnd = parseChicagoInput(times.end)
  const draftOverlaps = !timesIssue ? overlappingShifts({ startsAt: draftStart, endsAt: draftEnd }, shifts) : []
  const planOverlaps = 'issue' in generated || settled ? 0 : generated.overlapping
  const changePlan = (change: Partial<typeof plan>) => { setPlan({ ...plan, ...change }); setMessage(''); setSettled(false) }
  const sorted = sortedShifts(shifts)

  const generate = () => {
    if ('issue' in generated) { setMessage(generated.issue); return }
    onShifts([...shifts, ...generated.shifts.map(s => ({ shiftId: newDraftId('slot-'), label: '', startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity }))])
    setMessage(shiftCopy.generated(generated.shifts.length)); setSettled(true)
  }
  const add = () => {
    setTried(true)
    const capacity = shiftPlaces(draft.capacity)
    if (timesIssue) { setMessage(''); return }
    if (Number.isNaN(capacity)) { setMessage(shiftCopy.invalidCapacity); return }
    if (shifts.length >= MAX_SHIFTS) { setMessage(copy.tooManySlots); return }
    onShifts([...shifts, { shiftId: newDraftId('slot-'), label: draft.label.trim(), startsAt: draftStart, endsAt: draftEnd, capacity }])
    setDraft({ start: '', end: '', suggested: true, label: '', capacity: '' }); setTried(false); setMessage(shiftCopy.added); setSettled(false)
  }

  return <div className={styles.stack}>
    <p className={styles.intro}>{copy.slotsPurpose}</p>
    <p className={styles.hint}>{shiftCopy.eventRuns(eventWindow(event))}</p>
    <section className={styles.panel} aria-labelledby={`${id}-gen`}>
      <h3 id={`${id}-gen`}>{shiftCopy.generateTitle}</h3>
      <p className={styles.hint}>{shiftCopy.generateIntro}</p>
      <div className={styles.fields}>
        <label>{shiftCopy.day}<Input type="date" value={plan.day} onChange={e => changePlan({ day: e.target.value })} /></label>
        <label>{shiftCopy.from}<Input type="time" value={plan.from} onChange={e => changePlan({ from: e.target.value })} /></label>
        <label>{shiftCopy.to}<Input type="time" value={plan.to} onChange={e => changePlan({ to: e.target.value })} /></label>
        <label>{shiftCopy.length}<NativeSelect value={String(plan.blockMinutes)} onChange={e => changePlan({ blockMinutes: Number(e.target.value) })}>{shiftCopy.lengths.map(([minutes, label]) => <NativeSelectOption key={minutes} value={String(minutes)}>{label}</NativeSelectOption>)}</NativeSelect></label>
        <label>{shiftCopy.perShift}<Input type="number" min="1" max="500" step="1" inputMode="numeric" value={plan.capacity} onChange={e => changePlan({ capacity: e.target.value })} /></label>
      </div>
      <p className={styles.hint} aria-live="polite">{'issue' in generated ? generated.issue : shiftCopy.preview(generated.shifts.length, settled ? 0 : generated.skipped)}</p>
      {planOverlaps > 0 && <p className={styles.hint} aria-live="polite">{shiftCopy.planOverlaps(planOverlaps)}</p>}
      <div className={styles.formActions}><Button type="button" disabled={'issue' in generated} onClick={generate}>{'issue' in generated ? shiftCopy.generateTitle : shiftCopy.generate(generated.shifts.length)}</Button></div>
    </section>
    <section className={styles.panel} aria-labelledby={`${id}-add`}>
      <h3 id={`${id}-add`}>{copy.slotsAddTitle}</h3>
      <div className={styles.fields}>
        <label>{shiftCopy.starts}<Input type="datetime-local" value={times.start} aria-invalid={tried && !!timesIssue} onChange={e => setDraft(prior => ({ ...prior, suggested: false, start: e.target.value, end: endFollowingStart(times.start, times.end, e.target.value) }))} /></label>
        <label>{shiftCopy.ends}<Input type="datetime-local" value={times.end} aria-invalid={tried && !!timesIssue} onChange={e => setDraft(prior => ({ ...prior, suggested: false, start: times.start, end: e.target.value }))} /></label>
        <label>{shiftCopy.label}<Input value={draft.label} maxLength={80} placeholder={shiftCopy.labelPlaceholder} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
        <label>{shiftCopy.capacity}<Input type="number" min="1" max="500" step="1" inputMode="numeric" value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: e.target.value })} /><span className={styles.hint}>{shiftCopy.capacityHint}</span></label>
      </div>
      {timesIssue && (tried || !draft.suggested) && <p className={styles.hint} role={tried ? 'alert' : undefined}>{timesIssue}</p>}
      {draftOverlaps.length > 0 && <p className={styles.hint} aria-live="polite">{shiftCopy.overlaps(draftOverlaps.length, draftOverlaps.map(o => timeSpan(o.startsAt, o.endsAt)))}</p>}
      <div className={styles.formActions}><Button type="button" onClick={add}>{copy.add}</Button></div>
    </section>
    <div id="new-event-slots" tabIndex={-1}>
      <p role="status" className={styles.intro}>{sorted.length ? copy.slotsCount(sorted.length) : copy.slotsNone}</p>
      {invalid.field === 'new-event-slots' && <p className="open-text">{invalid.message}</p>}
      {sorted.length > 0 && <ul className={styles.list}>{sorted.map(s => {
        const overlaps = overlappingShifts(s, shifts, s.shiftId).length > 0
        const name = s.label || shiftTime(s.startsAt, s.endsAt)
        return <li key={s.shiftId} className={styles.slotRow}>
          <span>{name}<span className={styles.itemMeta}>{s.label ? `${shiftTime(s.startsAt, s.endsAt)} · ` : ''}{s.capacity === null ? copy.noLimit : copy.places(s.capacity)}{overlaps ? ` · ${copy.slotOverlaps}` : ''}</span></span>
          <Button type="button" variant="outline" aria-label={copy.removeItem(name)} onClick={() => { onShifts(shifts.filter(x => x.shiftId !== s.shiftId)); setMessage(''); setSettled(false) }}>{copy.remove}</Button>
        </li>
      })}</ul>}
    </div>
    <div className={styles.fields}>
      <label>{eventSetupCopy.newEvent.maxShifts}<Input id="event-max-shifts" aria-invalid={invalid.field === 'event-max-shifts'} aria-describedby={`${id}-max-hint`} type="number" min="1" max="100" step="1" inputMode="numeric" value={max} onChange={e => onMax(e.target.value)} /><span id={`${id}-max-hint`} className={styles.hint}>{eventSetupCopy.newEvent.maxShiftsHint}</span>{invalid.field === 'event-max-shifts' && <span className="open-text">{invalid.message}</span>}</label>
      <label>{eventSetupCopy.newEvent.minShifts}<Input id="event-min-shifts" aria-invalid={invalid.field === 'event-min-shifts'} aria-describedby={`${id}-min-hint`} type="number" min="0" max="100" step="1" inputMode="numeric" value={min} onChange={e => onMin(e.target.value)} /><span id={`${id}-min-hint`} className={styles.hint}>{copy.minShiftsHint}</span>{invalid.field === 'event-min-shifts' && <span className="open-text">{invalid.message}</span>}</label>
    </div>
    {message && <p role="status" className={styles.hint}>{message}</p>}
    <SkipButton onSkip={onSkip} skipCount={skipCount} />
  </div>
}

/** Signup questions: add, remove and reorder drafts. Nothing is saved until Create event. */
export function QuestionsStep({ questions, onQuestions, invalid, onSkip, skipCount }: { questions: DraftQuestion[]; onQuestions: (questions: DraftQuestion[]) => void; invalid: Invalid; onSkip: () => void; skipCount: number }) {
  const change = (qid: string, patch: Partial<DraftQuestion>) => onQuestions(questions.map(q => q.id === qid ? { ...q, ...patch } : q))
  const move = (index: number, by: -1 | 1) => { const next = [...questions]; [next[index], next[index + by]] = [next[index + by], next[index]]; onQuestions(next) }
  return <div className={styles.stack}>
    <p className={styles.intro}>{copy.questionsPurpose}</p>
    <p className={styles.hint}>{questionCopy.healthNote}</p>
    <p id="new-event-questions" tabIndex={-1} role="status" className={styles.intro}>{questions.length ? copy.questionsCount(questions.length) : copy.questionsNone}</p>
    {invalid.field === 'new-event-questions' && <p className="open-text">{invalid.message}</p>}
    {questions.map((q, i) => {
      const fieldId = `new-event-question-${q.id}`, issueOnPrompt = invalid.field === fieldId, issueOnOption = !!invalid.field?.startsWith(`${fieldId}-option-`), bad = issueOnPrompt || issueOnOption, name = q.prompt || copy.questionLabel(i + 1)
      return <section key={q.id} className={styles.panel} aria-label={copy.questionLabel(i + 1)}>
        <h3>{copy.questionLabel(i + 1)}</h3>
        <label>{questionCopy.kind}<NativeSelect value={q.kind} onChange={e => { const kind = e.target.value as QuestionKind; change(q.id, { kind, options: isChoice(kind) && q.options.length < 2 ? ['', ''] : q.options }) }}>{kinds.map(kind => <NativeSelectOption key={kind} value={kind}>{questionKindLabels[kind]}</NativeSelectOption>)}</NativeSelect></label>
        <label>{questionCopy.prompt}<Textarea id={fieldId} aria-invalid={issueOnPrompt} aria-describedby={issueOnPrompt ? `${fieldId}-error` : undefined} value={q.prompt} maxLength={300} rows={2} placeholder={questionCopy.promptPlaceholder} onChange={e => change(q.id, { prompt: e.target.value })} /></label>
        {isChoice(q.kind) && <fieldset className={styles.options}>
          <legend>{questionCopy.options}</legend>
          {q.options.map((option, j) => <div className={styles.optionRow} key={j}>
            <Input id={`${fieldId}-option-${j}`} aria-label={questionCopy.option(j + 1)} aria-invalid={invalid.field === `${fieldId}-option-${j}`} aria-describedby={invalid.field === `${fieldId}-option-${j}` ? `${fieldId}-error` : undefined} value={option} maxLength={100} onChange={e => change(q.id, { options: q.options.map((o, k) => k === j ? e.target.value : o) })} />
            <Button type="button" variant="outline" aria-disabled={q.options.length <= 2} title={q.options.length <= 2 ? copy.removeOptionDisabled : undefined} className={q.options.length <= 2 ? 'cursor-not-allowed opacity-50' : undefined} aria-label={q.options.length <= 2 ? `${questionCopy.removeOption(j + 1)}. ${copy.removeOptionDisabled}` : questionCopy.removeOption(j + 1)} onClick={() => { if (q.options.length > 2) change(q.id, { options: q.options.filter((_, k) => k !== j) }) }}>×</Button>
          </div>)}
          <p className={styles.hint}>{questionCopy.optionsHint}</p>
          <div><Button type="button" variant="outline" disabled={q.options.length >= 20} onClick={() => change(q.id, { options: [...q.options, ''] })}>{questionCopy.addOption}</Button></div>
        </fieldset>}
        <label className={styles.check}><Checkbox checked={q.required} onCheckedChange={checked => change(q.id, { required: checked })} />{questionCopy.requiredToggle}</label>
        {bad && <p id={`${fieldId}-error`} className="open-text">{invalid.message}</p>}
        <div className={styles.formActions}>
          <Button type="button" variant="outline" disabled={i === 0} aria-label={questionCopy.moveUp(name)} onClick={() => move(i, -1)}>{questionCopy.up}</Button>
          <Button type="button" variant="outline" disabled={i === questions.length - 1} aria-label={questionCopy.moveDown(name)} onClick={() => move(i, 1)}>{questionCopy.down}</Button>
          <Button type="button" variant="outline" aria-label={copy.removeItem(name)} onClick={() => onQuestions(questions.filter(x => x.id !== q.id))}>{copy.remove}</Button>
        </div>
      </section>
    })}
    <div><Button type="button" variant="outline" disabled={questions.length >= MAX_QUESTIONS} onClick={() => onQuestions([...questions, blankQuestion(newDraftId('q'))])}>{copy.addQuestion}</Button></div>
    <SkipButton onSkip={onSkip} skipCount={skipCount} />
  </div>
}

/** Things students must do: custom requirement drafts with the event page's fields. */
export function RequirementsStep({ requirements, onRequirements, invalid, onSkip, skipCount }: { requirements: DraftRequirement[]; onRequirements: (requirements: DraftRequirement[]) => void; invalid: Invalid; onSkip: () => void; skipCount: number }) {
  const change = (rid: string, patch: Partial<DraftRequirement>) => onRequirements(requirements.map(r => r.id === rid ? { ...r, ...patch } : r))
  return <div className={styles.stack}>
    <p className={styles.intro}>{copy.requirementsPurpose}</p>
    <p role="status" className={styles.intro}>{requirements.length ? copy.requirementsCount(requirements.length) : copy.requirementsNone}</p>
    {requirements.map((r, i) => {
      const fieldId = `new-event-requirement-${r.id}`, bad = invalid.field === fieldId, name = r.label || copy.requirementItem(i + 1)
      return <section key={r.id} className={styles.panel} aria-label={copy.requirementItem(i + 1)}>
        <label>{copy.requirementName}<Input id={fieldId} aria-invalid={bad} aria-describedby={bad ? `${fieldId}-error` : undefined} value={r.label} maxLength={100} placeholder={copy.requirementNamePlaceholder} onChange={e => change(r.id, { label: e.target.value })} /></label>
        <label>{copy.requirementInstructions}<Input value={r.instructions} maxLength={1000} onChange={e => change(r.id, { instructions: e.target.value })} /></label>
        <div className={styles.fields}>
          <label>{copy.requirementLink}<Input type="url" inputMode="url" value={r.url} maxLength={500} onChange={e => change(r.id, { url: e.target.value })} /></label>
          <label>{copy.requirementDueLabel}<Input type="datetime-local" value={r.dueAt} onChange={e => change(r.id, { dueAt: e.target.value })} /></label>
        </div>
        {bad && <p id={`${fieldId}-error`} className="open-text">{invalid.message}</p>}
        <div className={styles.formActions}><Button type="button" variant="outline" aria-label={copy.removeItem(name)} onClick={() => onRequirements(requirements.filter(x => x.id !== r.id))}>{copy.remove}</Button></div>
      </section>
    })}
    <div><Button type="button" variant="outline" disabled={requirements.length >= MAX_REQUIREMENTS} onClick={() => onRequirements([...requirements, { id: newDraftId('r'), label: '', instructions: '', url: '', dueAt: '' }])}>{requirements.length ? copy.addRequirement : copy.addFirstRequirement}</Button>{requirements.length >= MAX_REQUIREMENTS && <p role="status" className={styles.intro}>{copy.requirementsFull}</p>}</div>
    <SkipButton onSkip={onSkip} skipCount={skipCount} />
  </div>
}
