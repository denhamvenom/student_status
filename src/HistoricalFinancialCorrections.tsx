import { userFacingError } from '@/lib/error-message'
import { Component, useRef, useState, type ReactNode } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardTitle } from './components/ui/card'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { parseFundraisingDecimal, formatFundraisingCents } from './Fundraising'
import { historicalFinanceCopy as copy } from './lib/historical-finance-copy'
import styles from './ChargeAdministration.module.css'
const usd = formatFundraisingCents
class HistoricalFinanceBoundary extends Component<{ children: ReactNode; retry: () => void }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() { return this.state.error !== null ? <p role="alert">{userFacingError(this.state.error, copy.unavailable, false)} <Button variant="outline" onClick={this.props.retry}>{copy.reload}</Button></p> : this.props.children }
}
export function HistoricalFinancialCorrections({ seasonId, studentId, grantId }: { seasonId: Id<'seasons'>; studentId: Id<'students'>; grantId: Id<'historicalCorrectionSessions'> }) {
  const [version, setVersion] = useState(0)
  return <section className={styles.root}><HistoricalFinanceBoundary key={`${studentId}:${version}`} retry={() => setVersion(value => value + 1)}><HistoricalCharges seasonId={seasonId} studentId={studentId} grantId={grantId}/></HistoricalFinanceBoundary></section>
}
function HistoricalCharges({ seasonId, studentId, grantId }: { seasonId: Id<'seasons'>; studentId: Id<'students'>; grantId: Id<'historicalCorrectionSessions'> }) {
  const page = usePaginatedQuery(api.historicalFinancialCorrections.charges, { seasonId, studentId }, { initialNumItems: 20 })
  const [selected, setSelected] = useState<Id<'charges'> | null>(null); const [version, setVersion] = useState(0)
  return <Card className={styles.card}><CardTitle>{copy.title}</CardTitle><p className={styles.muted}>{copy.description}</p><p className={styles.notice}>{copy.linked}</p>
    {page.status === 'LoadingFirstPage' ? <p role="status">{copy.loading}</p> : !page.results.length && <p>{copy.noCharges}</p>}
    <div className={styles.history}>{page.results.map(row => <div className={styles.historyRow} key={row.chargeId}><strong>{row.label}</strong><span>{copy.original} {usd(row.originalCents)} / {copy.effective} {usd(row.effectiveCents)} / {copy.paid} {usd(row.appliedCents)}</span><Button variant="outline" onClick={() => { setSelected(row.chargeId); setVersion(value => value + 1) }}>{copy.review}</Button></div>)}</div>
    {page.status === 'CanLoadMore' && <Button variant="outline" onClick={() => page.loadMore(20)}>{copy.more}</Button>}
    {selected && <CorrectionForm key={`${selected}:${version}`} seasonId={seasonId} chargeId={selected} grantId={grantId} onAnother={() => setVersion(value => value + 1)}/>}
  </Card>
}
function CorrectionForm({ seasonId, chargeId, grantId, onAnother }: { seasonId: Id<'seasons'>; chargeId: Id<'charges'>; grantId: Id<'historicalCorrectionSessions'>; onAnother: () => void }) {
  const [kind, setKind] = useState<'adjustment' | 'cancellation'>('adjustment'); const [amount, setAmount] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [requested, setRequested] = useState<Id<'financialOperationJobs'> | null>(null); const key = useRef(crypto.randomUUID()); const guard = useRef(false)
  const target = parseFundraisingDecimal(amount)
  const preview = useQuery(api.historicalFinancialCorrections.preview, target === null ? 'skip' : { seasonId, chargeId, targetEffectiveCents: target, kind })
  const [review, setReview] = useState<FunctionReturnType<typeof api.historicalFinancialCorrections.preview> | null>(null)
  const status = useQuery(api.historicalFinancialCorrections.status, { seasonId, chargeId, ...(requested ? { jobId: requested } : {}) })
  const correct = useMutation(api.historicalFinancialCorrections.correct); const retry = useMutation(api.historicalFinancialCorrections.retry)
  const pending = !!status?.job && (status.job.state !== 'complete' || status.financialState !== 'ready')
  const finished = !!requested && status?.job?.state === 'complete' && status.financialState === 'ready'
  const ready = review?.ready && preview?.ready && review.targetEffectiveCents === target && review.expectedChargeRevision === preview.expectedChargeRevision && review.expectedFinancialRevision === preview.expectedFinancialRevision
  function changed() { setReview(null); key.current = crypto.randomUUID(); setError('') }
  async function commit() {
    if (guard.current || !ready || !review || review.expectedFinancialRevision === null || target === null || pending || finished) return
    guard.current = true; setBusy(true); setError('')
    try { setRequested(await correct({ correctionSessionId: grantId, chargeId, kind, targetEffectiveCents: target, expectedChargeRevision: review.expectedChargeRevision, expectedFinancialRevision: review.expectedFinancialRevision, reason, idempotencyKey: key.current })) }
    catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { guard.current = false; setBusy(false) }
  }
  async function recover() {
    if (!status?.job || guard.current) return; guard.current = true; setBusy(true); setError('')
    try { await retry({ correctionSessionId: grantId, jobId: status.job._id, reason: reason.trim().length >= 8 ? reason : copy.retryReason }); setRequested(status.job._id) }
    catch (failure) { setError(userFacingError(failure, copy.failed)) }
    finally { guard.current = false; setBusy(false) }
  }
  return <div className={styles.form}><div className={styles.fields}><label className={styles.field}>{copy.kind}<NativeSelect value={kind} disabled={busy || pending || finished} onChange={event => { setKind(event.target.value as typeof kind); changed() }}><NativeSelectOption value="adjustment">{copy.adjustment}</NativeSelectOption><NativeSelectOption value="cancellation">{copy.cancellation}</NativeSelectOption></NativeSelect></label><label className={styles.field}>{copy.target}<Input inputMode="decimal" value={amount} disabled={busy || pending || finished} onChange={event => { setAmount(event.target.value); changed() }}/></label><label className={styles.field}>{copy.reason}<Input value={reason} maxLength={1000} disabled={busy || pending || finished} onChange={event => { setReason(event.target.value); changed() }}/></label></div>
    {preview?.message && <p className={styles.notice} role="status">{preview.message}</p>}
    {!pending && !finished && <Button variant="outline" disabled={!preview || busy || reason.trim().length < 8} onClick={() => setReview(preview!)}>{copy.preview}</Button>}
    {review && <div className={styles.notice}><p>{copy.original} {usd(review.originalCents)} / {copy.current} {usd(review.effectiveCents)} / {copy.targetLabel} {usd(review.targetEffectiveCents)}</p><p>{copy.release} {usd(review.releaseRequiredCents)}</p>{!review.ready && <p>{copy.held}</p>}{review.ready && !ready && !requested && <p role="status">{copy.stale}</p>}</div>}
    {!pending && !finished && <Button disabled={busy || !ready || reason.trim().length < 8} onClick={() => void commit()}>{copy.confirm}</Button>}
    {pending && <p role={status?.canRetry ? 'alert' : 'status'}>{status?.canRetry ? userFacingError(new Error(status.job?.lastError ?? ''), copy.failed) : status?.job?.state === 'complete' ? copy.allocating : copy.working}</p>}
    {status?.canRetry && <Button disabled={busy} onClick={() => void recover()}>{copy.retry}</Button>}
    {finished && <p role="status">{copy.complete}</p>}
    {(finished || error) && <Button variant="outline" disabled={busy} onClick={onAnother}>{copy.another}</Button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>
}
