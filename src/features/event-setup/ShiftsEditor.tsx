import { userFacingError } from '@/lib/error-message'
import { chicagoInputTime, parseChicagoInput } from '@/lib/chicago-time'
import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import { ConfirmAction } from '../../ConfirmAction'
import { eventSetupCopy } from '../../copy/event-setup-copy'
import operationsStyles from '../operations/Operations.module.css'
import styles from './EventSetup.module.css'
import { endFollowingStart, eventWindow, nextShiftTimes, overlappingShifts, planShifts, shiftLimits, shiftLimitsIssue, shiftName, shiftPlaces, shiftTime, shiftTimesIssue, timeSpan } from './shift-plan'

export type ShiftSettings = { shiftsEnabled: boolean; maxShiftsPerStudent: number | null; minShiftsPerStudent: number; shiftCount: number }
// `suggested` means the times haven't been typed yet, so they follow nextShiftTimes as shifts load or change.
type Draft = { shiftId: Id<'eventShifts'> | null; start: string; end: string; suggested: boolean; label: string; capacity: string; locked: boolean }

/** Coach / Travel Lead setup for events where students pick shifts, such as an all-day fundraiser. */
export function ShiftsEditor({ eventId, event, settings }: { eventId: Id<'events'>; event: { startsAt: number; endsAt: number }; settings: ShiftSettings }) {
  const copy = eventSetupCopy.shifts
  const data = useQuery(api.eventShifts.forEvent, { eventId })
  const saveShift = useMutation(api.eventShifts.saveShift)
  const removeShift = useMutation(api.eventShifts.removeShift)
  const updateSettings = useMutation(api.eventShifts.updateShiftSettings)
  const id = useId()
  const newDraft = (): Draft => ({ shiftId: null, start: '', end: '', suggested: true, label: '', capacity: '', locked: false })
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [max, setMax] = useState<string | null>(null)
  const [min, setMin] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(newDraft)
  const startInput = chicagoInputTime(event.startsAt), endInput = chicagoInputTime(event.endsAt)
  const sameDay = startInput.slice(0, 10) === endInput.slice(0, 10)
  const [plan, setPlan] = useState({ day: startInput.slice(0, 10), from: sameDay ? startInput.slice(11) : '09:00', to: sameDay ? endInput.slice(11) : '17:00', blockMinutes: 120, capacity: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [justGenerated, setJustGenerated] = useState(false)
  const [triedShift, setTriedShift] = useState(false)

  async function act(fn: () => Promise<string | void>, message: string) {
    setBusy(true); setError(''); setSuccess(''); setJustGenerated(false)
    try { setSuccess((await fn()) || message) } catch (e) { setError(userFacingError(e)) } finally { setBusy(false) }
  }
  const enabledValue = enabled ?? settings.shiftsEnabled
  const maxValue = max ?? (settings.maxShiftsPerStudent?.toString() ?? '')
  const minValue = min ?? settings.minShiftsPerStudent.toString()
  const limitsIssue = shiftLimitsIssue(minValue, maxValue)
  const shifts = data?.shifts ?? []
  const generated = planShifts({ ...plan, event, existing: shifts })
  const update = (change: Partial<Draft>) => setDraft(prior => ({ ...prior, ...change }))
  const changePlan = (change: Partial<typeof plan>) => { setPlan({ ...plan, ...change }); setJustGenerated(false) }
  const times = draft.suggested ? nextShiftTimes(event, shifts) : draft
  const timesIssue = shiftTimesIssue(times.start, times.end, event)
  const draftStart = parseChicagoInput(times.start), draftEnd = parseChicagoInput(times.end)
  const draftOverlaps = !timesIssue ? overlappingShifts({ startsAt: draftStart, endsAt: draftEnd }, shifts, draft.shiftId) : []
  const planOverlaps = 'issue' in generated ? 0 : generated.overlapping
  // After a generate the new shifts exist, so the plan would say "already exist"; only the success message should show.
  const hideAllExist = justGenerated && 'issue' in generated && generated.issue === eventSetupCopy.plan.allExist

  const submitSettings = (e: FormEvent) => {
    e.preventDefault()
    if (limitsIssue) { setSuccess(''); setError(limitsIssue.message); document.getElementById(`${id}-${limitsIssue.field}`)?.focus(); return }
    const limits = shiftLimits(minValue, maxValue)
    void act(async () => { await updateSettings({ eventId, shiftsEnabled: enabledValue, maxShiftsPerStudent: limits.max, minShiftsPerStudent: limits.min }); setEnabled(null); setMax(null); setMin(null) }, copy.settingsSaved)
  }
  const submitShift = (e: FormEvent) => {
    e.preventDefault()
    const startsAt = draftStart, endsAt = draftEnd, capacity = shiftPlaces(draft.capacity)
    setTriedShift(true)
    if (timesIssue) { setSuccess(''); setError(''); return }
    if (Number.isNaN(capacity)) { setSuccess(''); setError(copy.invalidCapacity); return }
    const editing = draft.shiftId
    void act(async () => { await saveShift({ eventId, ...(editing ? { shiftId: editing } : {}), label: draft.label, startsAt, endsAt, capacity }); setDraft(newDraft()); setTriedShift(false) }, editing ? copy.saved : copy.added)
  }
  const generate = async () => {
    if ('issue' in generated) { setSuccess(''); setError(generated.issue); return }
    setBusy(true); setError(''); setSuccess(''); setJustGenerated(false)
    let added = 0
    try {
      for (const shift of generated.shifts) { await saveShift({ eventId, startsAt: shift.startsAt, endsAt: shift.endsAt, capacity: shift.capacity }); added++ }
      setSuccess(copy.generated(added)); setJustGenerated(true)
    } catch (e) { setError(added ? copy.partlyGenerated(added, generated.shifts.length, userFacingError(e)) : userFacingError(e)) } finally { setBusy(false) }
  }
  const showShifts = settings.shiftsEnabled || shifts.length > 0

  return <details id="event-shifts" className={operationsStyles.disclosure}><summary><strong>{copy.title}</strong><span>{settings.shiftsEnabled ? copy.summaryOn(data ? shifts.length : settings.shiftCount) : copy.summaryOff}</span></summary><div className={operationsStyles.disclosureBody}><Card><CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader><CardContent className={styles.stack}>
    <form className={styles.panel} onSubmit={submitSettings}>
      <label className={styles.check}><Checkbox checked={enabledValue} onCheckedChange={checked => setEnabled(checked)} />{copy.enable}</label>
      <p className={styles.hint}>{copy.enableHint}</p>
      {enabledValue && <div className={styles.fields}>
        <label>{copy.max}<Input id={`${id}-max`} type="number" min="1" max="100" step="1" inputMode="numeric" value={maxValue} aria-invalid={limitsIssue?.field === 'max'} aria-describedby={`${id}-max-hint`} onChange={e => setMax(e.target.value)} /><span id={`${id}-max-hint`} className={styles.hint}>{copy.maxHint}</span></label>
        <label>{copy.min}<Input id={`${id}-min`} type="number" min="0" max="100" step="1" inputMode="numeric" value={minValue} aria-invalid={limitsIssue?.field === 'min'} aria-describedby={`${id}-min-hint`} onChange={e => setMin(e.target.value)} /><span id={`${id}-min-hint`} className={styles.hint}>{copy.minHint}</span></label>
      </div>}
      <div className={styles.formActions}><Button type="submit" disabled={busy}>{copy.saveSettings}</Button></div>
    </form>
    {showShifts && <>
      {!data ? <p role="status">{copy.loading}</p> : shifts.length === 0 ? <p className="muted">{copy.none}</p> : <ul className={`${operationsStyles.sectionRows} ${styles.list}`}>{shifts.map(s => <li className={operationsStyles.sectionRow} key={s.shiftId}>
        <span>{s.label ?? shiftTime(s.startsAt, s.endsAt)}{(s.startsAt < event.startsAt || s.endsAt > event.endsAt) && <> <Badge variant="destructive" title={copy.outsideEventHint}>{copy.outsideEvent}</Badge></>}<span className={styles.itemMeta}>{s.label ? `${shiftTime(s.startsAt, s.endsAt)} · ` : ''}{copy.filled(s.taken, s.capacity)}</span></span>
        <span className={styles.itemActions}>
          <Button variant="outline" disabled={busy} onClick={() => { setError(''); setSuccess(''); setDraft({ shiftId: s.shiftId, start: chicagoInputTime(s.startsAt), end: chicagoInputTime(s.endsAt), suggested: false, label: s.label ?? '', capacity: s.capacity?.toString() ?? '', locked: s.taken > 0 }); document.getElementById(`${id}-label`)?.focus() }}>{copy.edit}</Button>
          {s.taken > 0
            ? <ConfirmAction disabled={busy} description={copy.removeConfirm(shiftName(s), s.taken)} onConfirm={async () => { const result = await removeShift({ shiftId: s.shiftId, force: true }); if (draft.shiftId === s.shiftId) setDraft(newDraft()); setError(''); setSuccess(copy.removedWithPlaces(result.removedPlaces)) }}>{copy.remove}</ConfirmAction>
            : <ConfirmAction disabled={busy} description={copy.removeEmptyConfirm(shiftName(s))} onConfirm={async () => { await removeShift({ shiftId: s.shiftId }); if (draft.shiftId === s.shiftId) setDraft(newDraft()); setError(''); setSuccess(copy.removed) }}>{copy.remove}</ConfirmAction>}
        </span>
      </li>)}</ul>}
      <form className={styles.panel} onSubmit={submitShift} aria-labelledby={`${id}-shift-title`}>
        <h3 id={`${id}-shift-title`}>{draft.shiftId ? copy.editTitle : copy.addTitle}</h3>
        <p className={styles.hint}>{copy.eventRuns(eventWindow(event))}</p>
        {draft.locked && <p className={styles.locked}>{copy.timesLocked}</p>}
        <div className={styles.fields}>
          <label>{copy.starts}<Input type="datetime-local" value={times.start} readOnly={draft.locked} aria-invalid={triedShift && !!timesIssue} onChange={e => setDraft(prior => ({ ...prior, suggested: false, start: e.target.value, end: endFollowingStart(times.start, times.end, e.target.value) }))} required /></label>
          <label>{copy.ends}<Input type="datetime-local" value={times.end} readOnly={draft.locked} aria-invalid={triedShift && !!timesIssue} onChange={e => update({ suggested: false, start: times.start, end: e.target.value })} required /></label>
          <label>{copy.label}<Input id={`${id}-label`} value={draft.label} maxLength={80} placeholder={copy.labelPlaceholder} onChange={e => update({ label: e.target.value })} /></label>
          <label>{copy.capacity}<Input type="number" min="1" max="500" step="1" inputMode="numeric" value={draft.capacity} aria-describedby={`${id}-capacity-hint`} onChange={e => update({ capacity: e.target.value })} /><span id={`${id}-capacity-hint`} className={styles.hint}>{copy.capacityHint}</span></label>
        </div>
        {timesIssue && (triedShift || !draft.suggested) && <p className={styles.hint} role={triedShift ? 'alert' : undefined}>{timesIssue}</p>}
        {draftOverlaps.length > 0 && <p className={styles.hint} aria-live="polite">{copy.overlaps(draftOverlaps.length, draftOverlaps.map(o => timeSpan(o.startsAt, o.endsAt)))}</p>}
        <div className={styles.formActions}><Button type="submit" disabled={busy}>{draft.shiftId ? copy.save : copy.add}</Button>{draft.shiftId && <Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft(newDraft()); setTriedShift(false) }}>{copy.cancel}</Button>}</div>
      </form>
      <section className={styles.panel} aria-labelledby={`${id}-generate-title`}>
        <h3 id={`${id}-generate-title`}>{copy.generateTitle}</h3>
        <p className={styles.hint}>{copy.generateIntro}</p>
        <div className={styles.fields}>
          <label>{copy.day}<Input type="date" value={plan.day} onChange={e => changePlan({ day: e.target.value })} /></label>
          <label>{copy.from}<Input type="time" value={plan.from} onChange={e => changePlan({ from: e.target.value })} /></label>
          <label>{copy.to}<Input type="time" value={plan.to} onChange={e => changePlan({ to: e.target.value })} /></label>
          <label>{copy.length}<NativeSelect value={String(plan.blockMinutes)} onChange={e => changePlan({ blockMinutes: Number(e.target.value) })}>{copy.lengths.map(([minutes, label]) => <NativeSelectOption key={minutes} value={String(minutes)}>{label}</NativeSelectOption>)}</NativeSelect></label>
          <label>{copy.perShift}<Input type="number" min="1" max="500" step="1" inputMode="numeric" value={plan.capacity} onChange={e => changePlan({ capacity: e.target.value })} /></label>
        </div>
        <p className={styles.hint} aria-live="polite">{hideAllExist ? '' : 'issue' in generated ? generated.issue : copy.preview(generated.shifts.length, generated.skipped)}</p>
        {planOverlaps > 0 && <p className={styles.hint} aria-live="polite">{copy.planOverlaps(planOverlaps)}</p>}
        <div className={styles.formActions}><Button type="button" disabled={busy || !data || 'issue' in generated} onClick={() => void generate()}>{'issue' in generated ? copy.generateTitle : copy.generate(generated.shifts.length)}</Button></div>
      </section>
    </>}
    {error && <p role="alert" className="open-text">{error}</p>}{success && <p role="status" className="ready-text">{success}</p>}
  </CardContent></Card></div></details>
}
