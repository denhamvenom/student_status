import { userFacingError } from '@/lib/error-message'
import { Component, useRef, useState, type ReactNode } from 'react'
import { useConvex, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardTitle } from './components/ui/card'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { parseFundraisingDecimal, formatFundraisingCents } from './Fundraising'
import styles from './ChargeAdministration.module.css'
import { paymentAdministrationCopy as copy } from './lib/payment-admin-copy'
import { FeePaymentImport } from './FeePaymentImport'
import { normalizeEmail } from '../shared/contact-format'
type PaymentRow = { studentEmail: string; amountCents: number; method: 'cash' | 'check' | 'other'; reference: string; occurredAt: number; rowReference: string }
type ReviewedRow = PaymentRow & FunctionReturnType<typeof api.paymentAdministration.previewPayments>[number]
const message = (error: unknown) => userFacingError(error)
const usd = formatFundraisingCents

/** CSV stays in memory; quoted commas, quotes, CRLF and multiline fields are supported. */
export function parsePaymentCsv(text: string): PaymentRow[] {
  if (text.length > 1_000_000) throw new Error(copy.csvTooLarge)
  const records: string[][] = []; let record: string[] = []; let field = ''; let quoted = false; let closedQuote = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') { if (quoted && text[index + 1] === '"') { field += '"'; index++ } else if (quoted) { quoted = false; closedQuote = true } else { if (field || closedQuote) throw new Error(copy.invalidQuotes); quoted = true } }
    else if (char === ',' && !quoted) { record.push(field); field = ''; closedQuote = false }
    else if ((char === '\n' || char === '\r') && !quoted) { record.push(field); if (record.some(value => value.trim())) records.push(record); record = []; field = ''; closedQuote = false; if (char === '\r' && text[index + 1] === '\n') index++ }
    else { if (closedQuote && char.trim()) throw new Error(copy.invalidQuotes); if (!closedQuote) field += char }
  }
  if (quoted) throw new Error(copy.unfinishedCsv)
  record.push(field); if (record.some(value => value.trim())) records.push(record)
  const header = records.shift()?.map(value => value.replace(/^\uFEFF/, '').trim().toLowerCase())
  const required = ['studentemail', 'amount', 'method', 'reference', 'date', 'rowreference']
  if (!header || header.length !== required.length || new Set(header).size !== required.length || required.some(name => !header.includes(name))) throw new Error(copy.columns)
  if (!records.length || records.length > 500) throw new Error(copy.rowLimit)
  return records.map((cells, index) => {
    if (cells.length !== header.length) throw new Error(copy.badColumns(index + 2))
    const value = (key: string) => cells[header.indexOf(key)].trim()
    const amountCents = parseFundraisingDecimal(value('amount')); const method = value('method').toLowerCase(); const date = value('date')
    const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN
    if (!amountCents || !Number.isSafeInteger(occurredAt) || new Date(occurredAt).toISOString().slice(0, 10) !== date || !['cash', 'check', 'other'].includes(method)) throw new Error(copy.badRow(index + 2))
    const guess = Date.parse(`${date}T06:00:00Z`)
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess))
    const number = (type: string) => Number(parts.find(part => part.type === type)?.value)
    const localAtGuess = Date.UTC(number('year'), number('month') - 1, number('day'), number('hour'), number('minute'))
    const teamMidnight = occurredAt - (localAtGuess - guess)
    const studentEmail = normalizeEmail(value('studentemail'), `Row ${index + 2} student email`)
    if (!studentEmail) throw new Error(`Row ${index + 2}: student email is required.`)
    return { studentEmail, amountCents, method: method as PaymentRow['method'], reference: value('reference'), occurredAt: teamMidnight, rowReference: value('rowreference') }
  })
}
class PaymentBoundary extends Component<{ children: ReactNode; retry: () => void }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() { return this.state.error !== null ? <Card className={styles.card}><p role="alert">{userFacingError(this.state.error, copy.unavailable, false)}</p><Button variant="outline" onClick={this.props.retry}>{copy.reload}</Button></Card> : this.props.children }
}
export function PaymentAdministration({ studentId, mode = 'bulk' }: { studentId?: Id<'students'>; mode?: 'bulk' | 'import' | 'correction' }) {
  const [attempt, setAttempt] = useState(0)
  const [path, setPath] = useState<'fee' | 'other'>(mode === 'import' ? 'other' : 'fee')
  return <section className={styles.root}><PaymentBoundary key={attempt} retry={() => setAttempt(value => value + 1)}>{mode === 'correction' && studentId ? <PaymentCorrections studentId={studentId}/> : <><div className={styles.actions}><Button variant={path === 'fee' ? 'default' : 'outline'} onClick={() => setPath('fee')}>Pay a selected fee from CSV</Button><Button variant={path === 'other' ? 'default' : 'outline'} onClick={() => setPath('other')}>Other bulk payments</Button></div>{path === 'fee' ? <FeePaymentImport/> : <BulkPayments key={mode} initialMode={mode === 'import' ? 'import' : 'bulk'}/>}</>}</PaymentBoundary></section>
}
function BulkPayments({ initialMode }: { initialMode: 'bulk' | 'import' }) {
  const convex = useConvex(); const post = useMutation(api.paymentAdministration.recordPaymentRow)
  const [mode, setMode] = useState(initialMode); const [csv, setCsv] = useState('')
  const [drafts, setDrafts] = useState([{ studentEmail: '', amount: '', method: 'check', reference: '', date: new Date().toISOString().slice(0, 10), rowReference: '1' }])
  const [batch, setBatch] = useState(''); const [reason, setReason] = useState(''); const [review, setReview] = useState<ReviewedRow[] | null>(null)
  const [results, setResults] = useState<Record<number, string>>({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const guard = useRef(false)
  function invalidate() { setReview(null); setResults({}); setError('') }
  async function preview() {
    if (guard.current) return; guard.current = true; setBusy(true); setError('')
    try {
      if (!batch.trim() || reason.trim().length < 8) throw new Error(copy.invalidReview)
      const rows = mode === 'import' ? parsePaymentCsv(csv) : parsePaymentCsv('studentEmail,amount,method,reference,date,rowReference\n' + drafts.map(item => [item.studentEmail, item.amount, item.method, item.reference, item.date, item.rowReference].map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n'))
      const preview = await convex.query(api.paymentAdministration.previewPayments, { rows })
      setReview(rows.map((row, index) => ({ ...row, ...preview[index] }))); setResults({})
    } catch (failure) { setError(message(failure)); setReview(null) }
    finally { guard.current = false; setBusy(false) }
  }
  async function record() {
    if (guard.current || !review || review.some(row => row.error)) return
    guard.current = true; setBusy(true); setError('')
    try {
      for (let index = 0; index < review.length; index++) {
        if (results[index] === copy.recorded) continue
        const row = review[index]
        if (!row.studentId || row.expectedGeneration === null) throw new Error(copy.unmatched)
        setResults(previous => ({ ...previous, [index]: copy.recording }))
        try { await post({ studentId: row.studentId, amountCents: row.amountCents, method: row.method, reference: row.reference, occurredAt: row.occurredAt, rowReference: row.rowReference, batchReference: batch.trim(), reason: reason.trim(), expectedGeneration: row.expectedGeneration }); setResults(previous => ({ ...previous, [index]: copy.recorded })) }
        catch (failure) { setResults(previous => ({ ...previous, [index]: copy.needsRetry })); throw failure }
      }
    } catch (failure) { setError(message(failure)) }
    finally { guard.current = false; setBusy(false) }
  }
  const recorded = Object.values(results).filter(value => value === copy.recorded).length
  return <Card className={styles.card}><CardTitle>{mode === 'import' ? copy.importTitle : copy.bulkTitle}</CardTitle><p className={styles.muted}>{copy.purpose}</p>
    <div className={styles.actions}><Button variant={mode === 'bulk' ? 'default' : 'outline'} disabled={busy} onClick={() => { setMode('bulk'); invalidate() }}>{copy.enterRows}</Button><Button variant={mode === 'import' ? 'default' : 'outline'} disabled={busy} onClick={() => { setMode('import'); invalidate() }}>{copy.importCsv}</Button></div>
    <div className={styles.fields}><label className={styles.field}>{copy.batchReference}<Input value={batch} maxLength={150} disabled={busy} onChange={event => { setBatch(event.target.value); invalidate() }}/></label><label className={styles.field}>{copy.reason}<Input value={reason} maxLength={1000} disabled={busy} onChange={event => { setReason(event.target.value); invalidate() }}/></label></div>
    {mode === 'import' ? <><label className={styles.field}>{copy.chooseFile}<Input type="file" accept=".csv,text/csv" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 1_000_000) throw new Error(copy.csvTooLarge); const value = await file.text(); setCsv(value); invalidate() } catch (failure) { setError(message(failure)) } }}/></label><p className={styles.muted}>{copy.csvHelp}</p><label className={styles.field}>{copy.pasteCsv}<textarea rows={7} value={csv} disabled={busy} onChange={event => { setCsv(event.target.value); invalidate() }} className="rounded border p-3 font-mono text-sm"/></label></> : <>{drafts.map((row, index) => <fieldset key={index} className={styles.form}><legend>{copy.paymentRow(index + 1)}</legend><div className={styles.fields}>{(['studentEmail', 'amount', 'reference', 'date', 'rowReference'] as const).map(key => <label key={key} className={styles.field}>{({ studentEmail: copy.studentEmail, amount: copy.amount, reference: copy.reference, date: copy.date, rowReference: copy.rowReference })[key]}<Input type={key === 'date' ? 'date' : key === 'studentEmail' ? 'email' : 'text'} value={row[key]} maxLength={150} disabled={busy} onChange={event => { setDrafts(previous => previous.map((item, rowIndex) => rowIndex === index ? { ...item, [key]: event.target.value } : item)); invalidate() }}/></label>)}<label className={styles.field}>{copy.method}<NativeSelect value={row.method} disabled={busy} onChange={event => { setDrafts(previous => previous.map((item, rowIndex) => rowIndex === index ? { ...item, method: event.target.value } : item)); invalidate() }}>{['cash', 'check', 'other'].map(method => <NativeSelectOption key={method} value={method}>{copy[method as 'cash' | 'check' | 'other']}</NativeSelectOption>)}</NativeSelect></label></div>{drafts.length > 1 && <Button variant="outline" disabled={busy} onClick={() => { setDrafts(previous => previous.filter((_, rowIndex) => rowIndex !== index)); invalidate() }}>{copy.removeRow}</Button>}</fieldset>)}<Button variant="outline" disabled={busy || drafts.length >= 500} onClick={() => { setDrafts(previous => [...previous, { studentEmail: '', amount: '', method: 'check', reference: '', date: new Date().toISOString().slice(0, 10), rowReference: String(previous.length + 1) }]); invalidate() }}>{copy.addRow}</Button></>}
    <Button disabled={busy} variant="outline" onClick={() => void preview()}>{busy ? copy.working : copy.review}</Button>
    {review && <div className={styles.history}><p role="status">{copy.progress(review.length, recorded)}</p>{review.map((row, index) => <div className={styles.historyRow} key={index}><strong>{row.studentName} / {usd(row.amountCents)}</strong><span>{row.method==='cash'?copy.cash:row.method==='check'?copy.check:copy.other} / {row.reference} / {new Date(row.occurredAt).toISOString().slice(0, 10)}</span><span role={row.error ? 'alert' : 'status'}>{row.error ?? results[index] ?? copy.ready}</span></div>)}<Button disabled={busy || review.some(row => !!row.error) || recorded === review.length} onClick={() => void record()}>{recorded ? copy.recordRemaining : copy.recordReviewed}</Button></div>}
    {error && <p className={styles.error} role="alert">{error} {copy.partialFailure}</p>}
  </Card>
}
function PaymentCorrections({ studentId }: { studentId: Id<'students'> }) {
  const page = usePaginatedQuery(api.paymentAdministration.receipts, { studentId }, { initialNumItems: 20 })
  const [selected, setSelected] = useState<Id<'ledgerEntries'> | null>(null)
  return <Card className={styles.card}><CardTitle>{copy.correctionTitle}</CardTitle><p className={styles.muted}>{copy.correctionPurpose}</p><div className={styles.history}>{page.results.map(row => <div className={styles.historyRow} key={row.sourceEntryId}><strong>{row.reference} / {usd(row.currentAmountCents)}</strong><span>{copy.original} {usd(row.originalAmountCents)} / {copy.available} {usd(row.availableCents)} / {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago' }).format(new Date(row.occurredAt))}</span><Button variant="outline" disabled={row.carried} onClick={() => setSelected(row.sourceEntryId)}>{row.carried ? copy.linkedCarryover : copy.reviewCorrection}</Button></div>)}</div>{page.status === 'CanLoadMore' && <Button variant="outline" onClick={() => page.loadMore(20)}>{copy.loadMore}</Button>}{page.status === 'LoadingFirstPage' && <p role="status">{copy.loading}</p>}{page.status !== 'LoadingFirstPage' && !page.results.length && <p>{copy.noPayments}</p>}{selected && <CorrectionForm key={selected} studentId={studentId} sourceEntryId={selected}/>}</Card>
}
function CorrectionForm({ sourceEntryId, studentId }: { sourceEntryId: Id<'ledgerEntries'>; studentId: Id<'students'> }) {
  const [amount, setAmount] = useState(''); const target = parseFundraisingDecimal(amount); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [jobId, setJobId] = useState<Id<'financialOperationJobs'> | null>(null); const key = useRef(crypto.randomUUID()); const guard = useRef(false)
  const current = useQuery(api.paymentAdministration.previewCorrection, target === null ? 'skip' : { sourceEntryId, targetAmountCents: target })
  const [review, setReview] = useState<FunctionReturnType<typeof api.paymentAdministration.previewCorrection> | null>(null)
  const job = useQuery(api.paymentAdministration.correctionStatus, jobId ? { jobId } : 'skip')
  const correct = useMutation(api.paymentAdministration.correct); const retry = useMutation(api.paymentAdministration.retryCorrection); const rebuild = useMutation(api.financialSources.rebuild)
  const ready = review?.state === 'ready' && current?.state === 'ready' && review.targetAmountCents === target && review.expectedSourceRevision === current.expectedSourceRevision && review.expectedFinancialRevision === current.expectedFinancialRevision
  async function commit() { if (guard.current || !ready || target === null || review?.expectedSourceRevision === null || review?.expectedFinancialRevision === null || !review) return; guard.current = true; setBusy(true); setError(''); try { setJobId(await correct({ sourceEntryId, targetAmountCents: target, expectedSourceRevision: review.expectedSourceRevision, expectedFinancialRevision: review.expectedFinancialRevision, reason, idempotencyKey: key.current })) } catch (failure) { setError(message(failure)) } finally { guard.current = false; setBusy(false) } }
  async function recover() { if (!jobId) return; setBusy(true); setError(''); try { await retry({ jobId, reason: reason || copy.retryReason }) } catch (failure) { setError(message(failure)) } finally { setBusy(false) } }
  return <div className={styles.form}><div className={styles.fields}><label className={styles.field}>{copy.targetAmount}<Input inputMode="decimal" value={amount} disabled={busy || !!jobId} onChange={event => { setAmount(event.target.value); setReview(null); key.current = crypto.randomUUID() }}/></label><label className={styles.field}>{copy.correctionReason}<Input value={reason} maxLength={1000} disabled={busy || !!jobId} onChange={event => { setReason(event.target.value); setReview(null); key.current = crypto.randomUUID() }}/></label></div>
    {!jobId && <Button variant="outline" disabled={!current || busy || reason.trim().length < 8} onClick={() => setReview(current!)}>{copy.previewCorrection}</Button>}
    {review && <div className={styles.notice}><p>{copy.original} {usd(review.originalAmountCents)} / {copy.current} {review.currentAmountCents === null ? copy.notAvailable : usd(review.currentAmountCents)} / {copy.corrected} {usd(review.targetAmountCents)}</p><p>{copy.release(review.releaseRequiredCents === null ? copy.notAvailable : usd(review.releaseRequiredCents))}</p>{review.message && <p role="status">{review.message}</p>}</div>}
    {current?.state === 'updating' && <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await rebuild({ studentId }) } catch (failure) { setError(message(failure)) } finally { setBusy(false) } }}>{copy.rebuild}</Button>}
    {!jobId && <Button disabled={!ready || busy || reason.trim().length < 8} onClick={() => void commit()}>{copy.confirm}</Button>}
    {job && <p role={job.state === 'failed' ? 'alert' : 'status'}>{job.state === 'complete' ? copy.correctionComplete : job.state === 'failed' ? userFacingError(new Error(job.lastError ?? ''), copy.correctionFailed) : copy.correcting}</p>}{job?.state === 'failed' && <Button disabled={busy} onClick={() => void recover()}>{copy.retryCorrection}</Button>}{error && <p className={styles.error} role="alert">{error}</p>}
  </div>
}
