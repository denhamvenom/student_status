import { userFacingError } from '@/lib/error-message'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { ConfirmAction } from './ConfirmAction'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { seasonAdminCopy as copy } from './lib/season-admin-copy'
import styles from './SeasonAdministration.module.css'
import { SeasonReviewSteps, SeasonTransitionProgress, SeasonHistory } from './SeasonReviewSteps'

type Plan = { id: Id<'seasonTransitionPlans'>; targetName: string; targetCompetitionYear: number; targetStartDate: string; targetEndDate: string; revision: number; state: string; updatedAt: number }
const message = (error: unknown) => userFacingError(error, copy.retry)
const steps = [copy.newSeason, copy.returningStudents, copy.archiveDeparting, copy.balances, copy.retainReset, copy.confirm]

function DraftForm({plan, sourceYear, onSaved, onDiscarded}: {plan: Plan | null; sourceYear: number; onSaved: () => void; onDiscarded: () => void}) {
  const create = useMutation(api.seasonAdmin.createDraft)
  const update = useMutation(api.seasonAdmin.updateDraft)
  const discard = useMutation(api.seasonAdmin.discardDraft)
  const key = useRef(crypto.randomUUID())
  const [baseRevision, setBaseRevision] = useState(plan?.revision ?? null)
  const [name, setName] = useState(plan?.targetName ?? '')
  const [year, setYear] = useState(plan?.targetCompetitionYear.toString() ?? (sourceYear + 1).toString())
  const [startDate, setStartDate] = useState(plan?.targetStartDate ?? '')
  const [endDate, setEndDate] = useState(plan?.targetEndDate ?? '')
  const [discardReason, setDiscardReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const stale = !!plan && baseRevision !== plan.revision
  const reload = () => {
    if (!plan) return
    setName(plan.targetName); setYear(plan.targetCompetitionYear.toString()); setStartDate(plan.targetStartDate); setEndDate(plan.targetEndDate)
    setBaseRevision(plan.revision); setError(''); setSaved('')
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || stale) return
    setBusy(true); setError(''); setSaved('')
    const values = { targetName: name, targetCompetitionYear: Number(year), targetStartDate: startDate, targetEndDate: endDate }
    try {
      if (plan) {
        const revision = await update({ planId: plan.id, expectedRevision: baseRevision ?? plan.revision, ...values })
        setBaseRevision(revision)
      } else await create({ ...values, idempotencyKey: key.current })
      setSaved(copy.saved)
      onSaved()
    } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!plan || busy || stale) return
    setBusy(true); setError(''); setSaved('')
    try { await discard({ planId: plan.id, expectedRevision: baseRevision ?? plan.revision, reason: discardReason }); key.current = crypto.randomUUID(); onDiscarded() }
    finally { setBusy(false) }
  }
  return <form className={styles.section} onSubmit={event => void submit(event)}>
    <h2>{copy.newSeason}</h2>
    <div className={styles.fields}>
      <label className={styles.field}>{copy.seasonName}<Input value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy || stale} /></label>
      <label className={styles.field}>{copy.competitionYear}<Input type="number" min={sourceYear + 1} max={9999} step={1} value={year} onChange={event => setYear(event.target.value)} required disabled={busy || stale} /></label>
      <label className={styles.field}>{copy.startDate}<Input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required disabled={busy || stale} /></label>
      <label className={styles.field}>{copy.endDate}<Input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} required disabled={busy || stale} /></label>
    </div>
    {stale && <p className={styles.error} role="status">{copy.changeConflict} <Button type="button" variant="outline" onClick={reload}>{copy.retry}</Button></p>}
    {plan && <label className={styles.field}>{copy.discardReason}<Input value={discardReason} onChange={event => setDiscardReason(event.target.value)} maxLength={500} disabled={busy || stale} /></label>}
    {error && <p className={styles.error} role="alert">{error}</p>}{saved && <p role="status">{saved}</p>}
    <div className={styles.actions}>
      {plan && <ConfirmAction title="Discard this season draft?" disabled={busy || stale || discardReason.trim().length < 8} description={copy.discardConfirm(discardReason)} onConfirm={remove}>{copy.discardDraft}</ConfirmAction>}
      <Button type="submit" disabled={busy || stale || !name.trim() || !year || !startDate || !endDate}>{plan ? copy.saveAndContinue : copy.createDraft}</Button>
    </div>
  </form>
}

/**
 * Active season's Build hours goal for Student Home. An empty box clears it.
 * Keyed by season; the box follows the saved value (including another Coach's save) until this Coach types an unsaved change.
 */
function BuildHoursTarget({ current }: { current: number | null }) {
  const save = useMutation(api.seasonAdmin.setBuildHoursTarget)
  const savedValue = current?.toString() ?? ''
  // null while the box matches the saved value; otherwise the unsaved text.
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const hours = draft ?? savedValue
  const unchanged = hours.trim() === savedValue
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || unchanged) return
    setBusy(true); setError(''); setSaved('')
    try { await save({ hours: hours.trim() === '' ? null : Number(hours) }); setDraft(null); setSaved(copy.saved) }
    catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }
  return <form className={styles.section} onSubmit={event => void submit(event)}>
    <div className={styles.targetRow}>
      <label className={styles.field}>{copy.buildHoursTarget}<Input type="number" inputMode="numeric" min={1} max={2000} step={1} value={hours} onChange={event => { const next = event.target.value; setDraft(next === savedValue ? null : next); setSaved('') }} disabled={busy} aria-describedby="build-hours-target-help build-hours-target-current" /></label>
      <Button type="submit" disabled={busy || unchanged}>{copy.save}</Button>
    </div>
    <p id="build-hours-target-help" className={styles.muted}>{copy.buildHoursHelp}</p>
    <p id="build-hours-target-current" className={styles.muted}>{copy.buildHoursCurrent(current)}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}{saved && <p role="status">{saved}</p>}
  </form>
}

function RosterReview({ plan }: { plan: Plan }) {
  const rows = usePaginatedQuery(api.seasonAdmin.rosterPage, { planId: plan.id }, { initialNumItems: 20 })
  const save = useMutation(api.seasonAdmin.saveRosterDecision)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const pick = async (row: typeof rows.results[number], choice: 'return' | 'depart' | null) => {
    if (busyId) return
    setBusyId(row.studentId); setError(''); setSavedId(null)
    try {
      await save({ planId: plan.id, studentId: row.studentId, choice, expectedPlanRevision: plan.revision,
        expectedStudentFingerprint: row.studentFingerprint, expectedDecisionRevision: row.decisionRevision })
      setSavedId(row.studentId)
    } catch (cause) { setError(message(cause)) } finally { setBusyId(null) }
  }
  return <section className={styles.section} aria-labelledby="season-returning-title">
    <h2 id="season-returning-title">{copy.returningStudents}</h2><p className={styles.muted}>{copy.rosterDescription} {copy.choicesSaveAsYouGo}</p>
    {rows.status === 'LoadingFirstPage' && <p role="status">{copy.loadingRoster}</p>}
    {rows.results.length > 0 && <div className={styles.roster}>{rows.results.map(row => <article className={styles.student} key={row.studentId}>
      <div><strong>{row.legalName || row.preferredName}</strong><small>{row.subteam}</small>{row.decisionStale && <small className={styles.error}>{copy.staleDecision}</small>}</div>
      <div className={styles.choices} role="group" aria-label={`${row.legalName || row.preferredName} season decision`}>
        <Button type="button" variant={row.choice === 'return' ? 'default' : 'outline'} aria-pressed={row.choice === 'return'} disabled={busyId !== null} onClick={() => void pick(row, 'return')}>{copy.returning}</Button>
        <Button type="button" variant={row.choice === 'depart' ? 'default' : 'outline'} aria-pressed={row.choice === 'depart'} disabled={busyId !== null} onClick={() => void pick(row, 'depart')}>{copy.departing}</Button>
        <Button type="button" variant={row.choice === null ? 'default' : 'outline'} aria-pressed={row.choice === null} disabled={busyId !== null} onClick={() => void pick(row, null)}>{copy.undecided}</Button>
      </div>{savedId === row.studentId && <small role="status">{copy.saved}</small>}
    </article>)}</div>}
    {rows.status === 'Exhausted' && rows.results.length === 0 && <p>{copy.noStudents}</p>}
    {rows.status !== 'Exhausted' && rows.status !== 'LoadingFirstPage' && <Button type="button" variant="outline" disabled={rows.status === 'LoadingMore'} onClick={() => rows.loadMore(20)}>{rows.status === 'LoadingMore' ? copy.loadingRoster : copy.loadMore}</Button>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>
}

/** Six-step Coach season transition. */
export function SeasonAdministration() {
  const [step, setStep] = useState(0)
  const [furthest, setFurthest] = useState(0)
  const completedSource = useRef<string | null>(null)
  const view = useQuery(api.seasonAdmin.overview, {})
  if (view === undefined) return <p role="status">{copy.loading}</p>
  const plan = view.plan as Plan | null
  if (plan && plan.state !== "draft") completedSource.current = view.source.id
  const completed = completedSource.current !== null && completedSource.current !== view.source.id
  const goTo = (next: number) => { setStep(next); setFurthest(current => Math.max(current, next)) }
  const isDraft = plan?.state === 'draft'
  const finished = steps.map((label, index) => ({ label, index })).filter(item => item.index < furthest && item.index !== step)
  return <div className={styles.page}>
    {completed && <p role="status">Season transition complete. {view.source.name} is now active; historical records remain preserved.</p>}
    <header className={styles.heading}><h1>{copy.title}</h1><p>{copy.description}</p></header>
    <BuildHoursTarget key={view.source.id} current={view.source.buildHoursTarget} />
    <p className={styles.notice}>Save each choice before you confirm. Old records stay with the season they came from.</p>
    <p className={styles.muted}>{copy.activeSeason}: {view.source.name}</p>
    {(!plan || isDraft) && <div role="group" aria-label={copy.stepsLabel} className={styles.section}>
      <ol aria-hidden="true" className={styles.progress}>{steps.map((label, index) => <li key={label} data-done={index <= step} />)}</ol>
      <p className={styles.stepLabel}>{copy.stepOf(step + 1, steps.length)}: {steps[step]}</p>
      {isDraft && finished.length > 0 && <nav aria-label={copy.doneSteps} className={styles.choices}>{finished.map(item => <Button key={item.label} type="button" variant="outline" onClick={() => goTo(item.index)}>{item.index + 1}. {item.label}</Button>)}</nav>}
    </div>}
    {step === 0 && (!plan || isDraft) && <DraftForm key={plan?.id ?? 'new'} plan={plan} sourceYear={view.source.year} onSaved={() => goTo(1)} onDiscarded={() => { setStep(0); setFurthest(0) }} />}
    {view.kickoff?.state === 'verified' && <p>{copy.verifiedKickoff(view.kickoff.kickoffDate)}</p>}
    {view.kickoff?.state === 'unavailable' && <p className={styles.notice}>{copy.unverifiedKickoff}</p>}
    {isDraft && step === 1 && <RosterReview plan={plan} />}
    {isDraft && step >= 2 && <SeasonReviewSteps plan={plan} step={step} onContinue={() => goTo(step + 1)} />}
    {isDraft && step >= 1 && <div className={styles.wizardNav}>
      <Button type="button" variant="outline" onClick={() => goTo(step - 1)}>{copy.back}</Button>
      {step <= 3 && <Button type="button" onClick={() => goTo(step + 1)}>{copy.continue}</Button>}
    </div>}
    {plan && plan.state !== 'draft' && <SeasonTransitionProgress plan={plan} onReview={goTo} />}
    <SeasonHistory />
  </div>
}
