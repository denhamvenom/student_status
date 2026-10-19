import { Component, Fragment, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useConvex, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { chargeAdministrationCopy as copy } from './lib/charge-administration-copy'
import styles from './ChargeAdministration.module.css'
import { chargeCurrency, parseChargeTarget } from './lib/charge-money'
export { chargeCurrency, parseChargeTarget } from './lib/charge-money'

export function ChargeAmountFacts({ values }: { values: ReadonlyArray<{ label: string; cents: number }> }) {
  return <dl className={styles.details} aria-label={copy.title}>{values.map(value => <Fragment key={value.label}><dt>{value.label}</dt><dd>{chargeCurrency(value.cents)}</dd></Fragment>)}</dl>
}

type ChargePreview = FunctionReturnType<typeof api.chargeAdmin.previewCorrection>
const when = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at)
const errorText = (error: unknown) => error instanceof Error ? error.message : copy.unavailable
const processLabel = (state: string) => state === 'complete' ? 'Complete' : state === 'failed' ? 'Needs Coach review' : 'In progress'
const revisionLabel = (kind: string) => kind === 'cancellation' ? 'Charge cancellation' : kind === 'adjustment' ? 'Charge adjustment' : 'Charge correction'

export function ChargeAdministration({ chargeId, allowEditing = false, onClose }: { chargeId: Id<'charges'>; allowEditing?: boolean; onClose?: () => void }) {
  const [attempt, setAttempt] = useState(0)
  return <ChargeBoundary key={`${chargeId}:${attempt}`} retry={() => setAttempt(value => value + 1)}><ChargeAdministrationContent chargeId={chargeId} allowEditing={allowEditing} onClose={onClose} /></ChargeBoundary>
}

class ChargeBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <section className={styles.root}><p className={styles.error} role="alert">{copy.unavailable}</p><Button type="button" variant="outline" onClick={this.props.retry}>Try again</Button></section> : this.props.children }
}

function ChargeAdministrationContent({ chargeId, allowEditing, onClose }: { chargeId: Id<'charges'>; allowEditing: boolean; onClose?: () => void }) {
  const detail = useQuery(api.chargeAdmin.detail, { chargeId })
  const [jobId, setJobId] = useState<Id<'financialOperationJobs'> | null>(null)
  const status = useQuery(api.chargeAdmin.status, { chargeId, ...(jobId ? { jobId } : {}) })
  const history = usePaginatedQuery(api.chargeAdmin.history, { chargeId }, { initialNumItems: 20 })
  const sources = usePaginatedQuery(api.chargeAdmin.sourceEvidence, { chargeId }, { initialNumItems: 20 })
  const client = useConvex()
  const correct = useMutation(api.chargeAdmin.correct)
  const retry = useMutation(api.financialOperationsWorker.retry)
  const [kind, setKind] = useState<'adjustment' | 'cancellation'>('adjustment')
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<ChargePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryReason, setRetryReason] = useState('')
  const intent = useRef<{ fingerprint: string; key: string } | null>(null)
  const busyGuard = useRef(false)
  const targetCents = parseChargeTarget(target)
  const ready = detail && preview?.state === 'ready' && preview.expectedFinancialRevision !== null && detail.financialState === 'ready' && detail.amounts.revision === preview.expectedChargeRevision && detail.financialRevision === preview.expectedFinancialRevision && preview.targetEffectiveCents === targetCents
  const changed = () => { setPreview(null); intent.current = null; setError('') }
  async function review(event: FormEvent) {
    event.preventDefault()
    if (targetCents === null || busyGuard.current) return
    busyGuard.current = true; setBusy(true); setError(''); setPreview(null)
    try { setPreview(await client.query(api.chargeAdmin.previewCorrection, { chargeId, kind, targetEffectiveCents: targetCents })) }
    catch (cause) { setError(errorText(cause)) }
    finally { busyGuard.current = false; setBusy(false) }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (!preview || !ready || preview.expectedFinancialRevision === null || reason.trim().length < 8 || busyGuard.current) return
    const args: FunctionArgs<typeof api.chargeAdmin.correct> = { chargeId, kind, targetEffectiveCents: preview.targetEffectiveCents, expectedChargeRevision: preview.expectedChargeRevision, expectedFinancialRevision: preview.expectedFinancialRevision, reason: reason.trim(), idempotencyKey: '' }
    const fingerprint = JSON.stringify(args)
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() }
    args.idempotencyKey = intent.current.key
    busyGuard.current = true; setBusy(true); setError('')
    try { const result = await correct(args); setJobId(result.jobId); setPreview(null); setTarget(''); setReason(''); intent.current = null }
    catch (cause) { setError(errorText(cause)) }
    finally { busyGuard.current = false; setBusy(false) }
  }
  if (!detail) return <section className={styles.root}><p role="status">{copy.loading}</p></section>
  const values = [{ label: copy.original, cents: detail.amounts.amountCents }, { label: copy.adjusted, cents: detail.amounts.adjustedCents }, { label: copy.cancelled, cents: detail.amounts.cancelledCents }, { label: copy.effective, cents: detail.amounts.effectiveCents }, { label: copy.applied, cents: detail.amounts.appliedCents }, { label: copy.outstanding, cents: detail.amounts.effectiveCents - detail.amounts.appliedCents }]
  return <section className={styles.root} aria-label={copy.title}>
    <Card className={styles.card}><div className={styles.header}><div><CardTitle>{detail.charge.label} · {copy.title}</CardTitle><p className={styles.muted}>Current recorded amounts</p></div>{onClose && <Button type="button" variant="outline" onClick={onClose}>{copy.close}</Button>}</div><ChargeAmountFacts values={values} />{detail.financialState !== 'ready' && <p className={styles.notice} role="status">{detail.financialState === 'failed' ? copy.failed : copy.updating}</p>}</Card>
    {status?.job && <Card className={styles.card}><CardTitle>{copy.correction} · {processLabel(status.job.state)}</CardTitle><p className={styles.muted}>Requested by {status.originalActorName ?? 'Unavailable Coach'} · Processing by {status.processingActorName ?? 'Unavailable Coach'}</p><ChargeAmountFacts values={[{ label: copy.committedRelease, cents: status.job.committedCents }, { label: copy.release, cents: status.job.releaseRequiredCents ?? status.job.amountCents }, ...(status.job.originalEffectiveCents !== undefined ? [{ label: 'Charge amount before this correction', cents: status.job.originalEffectiveCents }] : []), ...(status.job.targetEffectiveCents !== undefined ? [{ label: 'New charge amount requested', cents: status.job.targetEffectiveCents }] : [])]} /><p role="status" className={status.job.state === 'complete' ? styles.muted : styles.notice}>{status.job.state === 'complete' ? 'The new charge amount is saved. Money may still be applied to other charges.' : copy.planned}</p><p>{status.job.reason}</p>{status.job.lastError && <p role="alert" className={styles.error}>{status.job.lastError}</p>}{allowEditing && status.canRetry && <form className={styles.form} onSubmit={async event => { event.preventDefault(); if (!status.job || busyGuard.current || retryReason.trim().length < 8) return; busyGuard.current = true; setBusy(true); setError(''); try { await retry({ jobId: status.job._id, reason: retryReason.trim() }); setRetryReason('') } catch (cause) { setError(errorText(cause)) } finally { busyGuard.current = false; setBusy(false) } }}><label className={styles.field}>{copy.retryReason}<Input value={retryReason} onChange={event => setRetryReason(event.target.value)} minLength={8} maxLength={1000} required disabled={busy} /></label><Button type="submit" disabled={busy || retryReason.trim().length < 8}>{copy.retry}</Button></form>}</Card>}
    {allowEditing && detail.canCorrect && <Card className={styles.card}><CardTitle>{copy.correction}</CardTitle><form className={styles.form} onSubmit={review}><div className={styles.fields}><label className={styles.field}>Type<NativeSelect value={kind} disabled={busy} onChange={event => { const selected = event.target.value; if (selected !== 'adjustment' && selected !== 'cancellation') return; setKind(selected); setTarget(selected === 'cancellation' ? '0.00' : ''); changed() }}><NativeSelectOption value="adjustment">{copy.correction}</NativeSelectOption><NativeSelectOption value="cancellation">{copy.cancellation}</NativeSelectOption></NativeSelect></label><label className={styles.field}>{copy.target}<Input inputMode="decimal" value={target} onChange={event => { setTarget(event.target.value); changed() }} maxLength={24} disabled={busy} required aria-invalid={target !== '' && targetCents === null} /></label></div><p className={styles.muted}>{copy.targetNote}</p><Button type="submit" disabled={busy || targetCents === null}>{busy ? 'Reviewing…' : copy.preview}</Button></form>{preview && <form className={styles.form} onSubmit={confirm}><ChargeAmountFacts values={[{ label: 'Current charge amount reviewed', cents: preview.amounts.effectiveCents }, { label: 'New charge amount', cents: preview.targetEffectiveCents }, { label: copy.release, cents: preview.releaseRequiredCents }, { label: 'Amount still due after correction', cents: preview.targetOutstandingCents }]} /><p className={styles.muted}>{copy.releaseNote} {copy.futureAllocation}</p>{preview.message && <p role="status" className={styles.notice}>{preview.message}</p>}{!ready && <p className={styles.notice}>The charge or account changed, or this review is no longer ready. Review the amounts again before saving.</p>}<label className={styles.field}>{copy.reason}<Input value={reason} onChange={event => { setReason(event.target.value); intent.current = null }} minLength={8} maxLength={1000} required disabled={busy} /></label><p className={styles.muted}>{copy.noPayment}</p><Button type="submit" disabled={busy || !ready || reason.trim().length < 8}>{copy.confirm}</Button></form>}</Card>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <Card className={styles.card}><CardTitle>{copy.sourceEvidence}</CardTitle><p className={styles.muted}>These records show where the money used on this charge came from. Available money in each record can also be used elsewhere on the account.</p>{sources.results.map(source => <div className={styles.historyRow} key={source.sourceEntryId}><strong>{source.sourceKind === 'payment' ? 'Personal payment' : source.transferred ? 'Transferred fundraising credit' : 'Earned fundraising credit'}{source.recordedAt !== null ? ` · ${when(source.recordedAt)}` : ''}</strong>{source.transferred && <p className={styles.muted}>Transferred money keeps a record of where it originally came from.</p>}<ChargeAmountFacts values={[{ label: 'Received in this source', cents: source.receivedCents }, { label: 'Applied to this charge', cents: source.appliedCents }, { label: 'Available in this source', cents: source.availableCents }]} /></div>)}{sources.status === 'Exhausted' && sources.results.length === 0 && <p>{detail.financialState === 'ready' ? 'No funding sources are recorded for this charge.' : 'Money source details will appear when account records are ready.'}</p>}{['LoadingFirstPage', 'LoadingMore'].includes(sources.status) && <p role="status">{copy.loading}</p>}{sources.status === 'CanLoadMore' && <Button type="button" variant="outline" onClick={() => sources.loadMore(20)}>{copy.moreSources}</Button>}</Card>
    <Card className={styles.card}><CardTitle>{copy.history}</CardTitle>{history.results.map(row => <div className={styles.historyRow} key={row._id}><strong>{when(row.recordedAt)} · {revisionLabel(row.kind)} · Saved</strong><p className={styles.muted}>Requested by {row.originalActorName} · Processing by {row.processingActorName}</p><ChargeAmountFacts values={[{ label: 'Previous charge amount', cents: row.beforeEffectiveCents }, { label: 'New charge amount', cents: row.afterEffectiveCents }, { label: 'Previous adjustment', cents: row.beforeAdjustedCents }, { label: 'Updated adjustment', cents: row.afterAdjustedCents }, { label: 'Previous cancellation', cents: row.beforeCancelledCents }, { label: 'Updated cancellation', cents: row.afterCancelledCents }, { label: 'Previous applied funds', cents: row.beforeAppliedCents }, { label: 'Updated applied funds', cents: row.afterAppliedCents }, { label: 'Returned to available funds', cents: row.releasedCents }]} /><p>{row.reason}</p></div>)}{history.status === 'Exhausted' && history.results.length === 0 && <p>{copy.noHistory}</p>}{['LoadingFirstPage', 'LoadingMore'].includes(history.status) && <p role="status">{copy.loading}</p>}{history.status === 'CanLoadMore' && <Button type="button" variant="outline" onClick={() => history.loadMore(20)}>{copy.moreHistory}</Button>}</Card>
  </section>
}
