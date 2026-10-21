import { userFacingError } from '@/lib/error-message'
import { useRef, useState } from 'react'
import { useConvex, useMutation, usePaginatedQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardTitle } from './components/ui/card'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { chargeCurrency } from './lib/charge-money'
import { downloadInviteCsv } from './lib/bulk-invite-csv'
import { collectFeeExport, feePaymentCsv, parseFeePaymentCsv, type FeeCsvRow, type PaymentManifestRow } from './lib/fee-payment-csv'
import styles from './ChargeAdministration.module.css'

type Filter = 'all' | 'paid' | 'unpaid'
type Method = 'cash' | 'check' | 'other'
type Review = { exportId: string; feeDefinitionId: Id<'feeDefinitions'>; feeLabel: string; rows: FeeCsvRow[]; payments: PaymentManifestRow[]; method: Method; reference: string; occurredAt: number; states: Array<{ rowKey: string; state: 'ready' | 'recorded' | 'stale' | 'invalid'; message: string | null; studentName: string | null; chargedCents: number | null; appliedCents: number | null; owedCents: number | null }> }
const serverRows = (rows: PaymentManifestRow[]) => rows.map(row => ({ ...row, studentId: row.studentId as Id<'students'>, chargeId: row.chargeId as Id<'charges'> }))
const errorText = (failure: unknown) => userFacingError(failure)
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function teamMidnight(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('Choose a valid payment date.')
  const utcMidnight = Date.parse(date + 'T00:00:00Z')
  const guess = Date.parse(date + 'T06:00:00Z')
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess))
  const number = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return utcMidnight - (Date.UTC(number('year'), number('month') - 1, number('day'), number('hour'), number('minute')) - guess)
}

export function FeePaymentImport() {
  const convex = useConvex()
  const beginBatch = useMutation(api.feePayments.beginBatch)
  const recordRow = useMutation(api.feePayments.recordRow)
  const fees = usePaginatedQuery(api.feePriorities.list, {}, { initialNumItems: 20 })
  const [feeId, setFeeId] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [file, setFile] = useState('')
  const [method, setMethod] = useState<Method>('check')
  const [date, setDate] = useState(today)
  const [reference, setReference] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [results, setResults] = useState<Record<string, 'saved' | 'retry'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const guard = useRef(false)
  const selected = fees.results.find(item => item.definition._id === feeId && item.definition.state === 'active')
  function invalidate() { setReview(null); setResults({}); setError('') }
  async function download() {
    if (guard.current || !selected) return
    guard.current = true; setBusy(true); setError('')
    try {
      const { feeLabel, rows } = await collectFeeExport(cursor => convex.query(api.feePayments.exportPage, { feeDefinitionId: selected.definition._id, filter, paginationOpts: { numItems: 30, cursor } }))
      const csv = feePaymentCsv(selected.definition._id, feeLabel, crypto.randomUUID(), rows)
      downloadInviteCsv('fee-payments-' + filter + '.csv', csv)
    } catch (failure) { setError(errorText(failure)) }
    finally { guard.current = false; setBusy(false) }
  }
  async function preview() {
    if (guard.current || !selected) return
    guard.current = true; setBusy(true); setError(''); setReview(null); setResults({})
    try {
      const parsed = parseFeePaymentCsv(file)
      if (parsed.feeDefinitionId !== selected.definition._id) throw new Error('The uploaded CSV belongs to a different fee. Choose the same fee used for export.')
      const occurredAt = teamMidnight(date)
      if (reference.trim().length > 150) throw new Error('The optional receipt reference must be at most 150 characters.')
      const states: Review['states'] = []
      for (let index = 0; index < parsed.payments.length; index += 20) {
        const result = await convex.query(api.feePayments.previewRows, { feeDefinitionId: selected.definition._id, exportId: parsed.exportId, rows: serverRows(parsed.payments.slice(index, index + 20)) })
        states.push(...result)
      }
      setReview({ ...parsed, feeDefinitionId: selected.definition._id, feeLabel: selected.definition.label, method, reference: reference.trim(), occurredAt, states })
    } catch (failure) { setError(errorText(failure)) }
    finally { guard.current = false; setBusy(false) }
  }
  async function confirm() {
    if (guard.current || !review || review.states.some(item => item.state !== 'ready' && item.state !== 'recorded')) return
    guard.current = true; setBusy(true); setError('')
    try {
      const batch = await beginBatch({ feeDefinitionId: review.feeDefinitionId, exportId: review.exportId, rows: serverRows(review.payments), method: review.method, reference: review.reference, occurredAt: review.occurredAt })
      for (const row of review.payments) {
        if (results[row.rowKey] === 'saved' || review.states.find(item => item.rowKey === row.rowKey)?.state === 'recorded') continue
        try { await recordRow({ batchId: batch.batchId, rowKey: row.rowKey }); setResults(previous => ({ ...previous, [row.rowKey]: 'saved' })) }
        catch (failure) { setResults(previous => ({ ...previous, [row.rowKey]: 'retry' })); throw failure }
      }
    } catch (failure) { setError(errorText(failure)) }
    finally { guard.current = false; setBusy(false) }
  }
  const saved = review?.payments.filter(row => results[row.rowKey] === 'saved' || review.states.find(item => item.rowKey === row.rowKey)?.state === 'recorded').length ?? 0
  const blocked = review?.states.some(item => item.state === 'stale' || item.state === 'invalid') ?? false
  return <Card className={styles.card}>
    <CardTitle>Fee payments from CSV</CardTitle>
    <p className={styles.muted}>Choose a fee, download its assessed students, fill only New payment amount, then upload the same file. Payments go directly to this fee. Blank amounts are skipped. Keep Export batch, Row key, IDs, balances, and versions unchanged.</p>
    <div className={styles.fields}>
      <label className={styles.field}>Fee<NativeSelect value={feeId} disabled={busy || !!review} onChange={event => { setFeeId(event.target.value); invalidate() }}><NativeSelectOption value="">Choose a fee</NativeSelectOption>{fees.results.filter(item => item.definition.state === 'active').map(item => <NativeSelectOption key={item.definition._id} value={item.definition._id}>{item.definition.label}</NativeSelectOption>)}</NativeSelect></label>
      <label className={styles.field}>Students to export<NativeSelect value={filter} disabled={busy || !!review} onChange={event => { setFilter(event.target.value as Filter); invalidate() }}><NativeSelectOption value="all">All assessed students</NativeSelectOption><NativeSelectOption value="paid">Fully paid students</NativeSelectOption><NativeSelectOption value="unpaid">Students who still owe</NativeSelectOption></NativeSelect></label>
    </div>
    {fees.status === 'CanLoadMore' && <Button variant="outline" disabled={busy} onClick={() => fees.loadMore(20)}>Load more fees</Button>}
    <p className={styles.muted}>These filters use this fee's assessed charge balance, including money already applied from fundraising. A fully paid fee has no balance for a new payment.</p>
    <Button variant="outline" disabled={busy || !selected} onClick={() => void download()}>{busy ? 'Working…' : 'Download fee CSV'}</Button>
    <div className={styles.fields}>
      <label className={styles.field}>Payment date<Input type="date" value={date} disabled={busy || !!review} onChange={event => { setDate(event.target.value); invalidate() }}/></label>
      <label className={styles.field}>Payment method<NativeSelect value={method} disabled={busy || !!review} onChange={event => { setMethod(event.target.value as Method); invalidate() }}><NativeSelectOption value="check">Check</NativeSelectOption><NativeSelectOption value="cash">Cash</NativeSelectOption><NativeSelectOption value="other">Other</NativeSelectOption></NativeSelect></label>
      <label className={styles.field}>Receipt reference (optional)<Input value={reference} maxLength={150} disabled={busy || !!review} onChange={event => { setReference(event.target.value); invalidate() }} placeholder="One reference for this batch"/></label>
    </div>
    <p className={styles.muted}>If resuming an interrupted upload, use the same payment date, method, and reference.</p>
    <label className={styles.field}>Completed fee CSV<Input type="file" accept=".csv,text/csv" disabled={busy || !!review} onChange={async event => { const chosen = event.target.files?.[0]; if (!chosen) return; invalidate(); setFile(''); try { if (chosen.size > 1_000_000) throw new Error('The fee CSV must be under 1 MB.'); setFile(await chosen.text()) } catch (failure) { setError(errorText(failure)) } }}/></label>
    {file && !review && <Button variant="outline" disabled={busy || !selected} onClick={() => void preview()}>Review payments</Button>}
    {review && <div className={styles.history}>
      <p role="status">{review.feeLabel}: {review.payments.length} payment rows totaling {chargeCurrency(review.payments.reduce((total, row) => total + row.amountCents, 0))}; {review.rows.length - review.payments.length} blank rows skipped; {saved} saved.</p>
      <p className={styles.muted}>Date: {new Date(review.occurredAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}. Method: {review.method}. Reference: {review.reference || 'None'}. The reviewed file and these details are locked until you start over.</p>
      {review.rows.filter(row => row.amountCents !== null).map(row => { const state = review.states.find(item => item.rowKey === row.rowKey); return <div className={styles.historyRow} key={row.rowKey}><strong>{state?.studentName ?? 'Student unavailable'}: new payment {chargeCurrency(row.amountCents!)}</strong><span>Charged {state?.chargedCents === null || state?.chargedCents === undefined ? 'unavailable' : chargeCurrency(state.chargedCents)} · Already applied {state?.appliedCents === null || state?.appliedCents === undefined ? 'unavailable' : chargeCurrency(state.appliedCents)} · Owed {state?.owedCents === null || state?.owedCents === undefined ? 'unavailable' : chargeCurrency(state.owedCents)}</span><span role={state?.state === 'invalid' || state?.state === 'stale' || results[row.rowKey] === 'retry' ? 'alert' : 'status'}>{results[row.rowKey] === 'saved' || state?.state === 'recorded' ? 'Saved' : results[row.rowKey] === 'retry' ? 'Needs retry' : state?.message ?? state?.state ?? 'Ready'}</span></div> })}
      {blocked && <p role="alert" className={styles.error}>Some rows changed or cannot receive this payment. Export a fresh file for those balances. Previously saved rows remain saved.</p>}
      <div className={styles.actions}><Button disabled={busy || blocked || saved === review.payments.length} onClick={() => void confirm()}>{saved ? 'Retry remaining payments' : 'Confirm payments'}</Button><Button variant="outline" disabled={busy} onClick={() => { setReview(null); setFile(''); setResults({}); setError('') }}>Start over</Button></div>
    </div>}
    {error && <p role="alert" className={styles.error}>{error}{review && saved > 0 ? ' Saved rows remain recorded. Retry this same file and batch for remaining rows.' : ''}</p>}
  </Card>
}
