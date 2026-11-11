import { userFacingError } from '@/lib/error-message'
import { Component, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useConvex, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardTitle } from './components/ui/card'
import { ReviewRow, StepWizard } from './components/StepWizard'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { chargeCurrency, overpaymentCents, overpaymentQuestion, parseMoneyInput } from './lib/charge-money'
import styles from './ChargeAdministration.module.css'
import { paymentAdministrationCopy as copy } from './lib/payment-admin-copy'
import { FeePaymentImport } from './FeePaymentImport'
import { normalizeEmail } from '../shared/contact-format'
import { chicagoDateString, chicagoMidnight } from '../shared/chicago-time'

export type PaymentMethod = 'cash' | 'check' | 'other'
export type StudentOption = { studentId: Id<'students'>; name: string }
type PaymentRow = { studentEmail?: string; studentId?: Id<'students'>; amountCents: number; method: PaymentMethod; reference: string; occurredAt: number; rowReference: string }
type LabeledRow = PaymentRow & { label: string }
type ReviewedRow = Omit<LabeledRow, 'studentId'> & FunctionReturnType<typeof api.paymentAdministration.previewPayments>[number]
const usd = chargeCurrency
const methods: PaymentMethod[] = ['cash', 'check', 'other']
const methodName = (method: PaymentMethod | null) => method ? copy[method] : '—'
const today = () => chicagoDateString(Date.now())
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
export const shortDate = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' }).format(at)
const when = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(at)
/** Every money reason (edit, cancel, money returned, transfer) needs the same minimum length. */
export function moneyReasonProblem(reason: string): string | null { return reason.trim().length < copy.reasonMinLength ? copy.reasonShort : null }
/** The Balance due line shown on the amount step, or null while the account is still loading. */
export function balanceDueLine(balanceDueCents: number | null | undefined): string | null { return balanceDueCents === null || balanceDueCents === undefined ? null : copy.balanceDue(usd(Math.max(0, balanceDueCents))) }
/** Where a new payment's money goes, estimated from the Balance due before it: fees first, the rest to Unused payments. */
export function paymentOutcome(amountCents: number, balanceDueCents: number | null) {
  if (balanceDueCents === null) return null
  const toFees = Math.min(amountCents, Math.max(0, balanceDueCents))
  return { toFeesCents: toFees, unusedCents: amountCents - toFees }
}
export function recordedMessage(amountCents: number, balanceDueCents: number | null) {
  const outcome = paymentOutcome(amountCents, balanceDueCents)
  if (!outcome) return copy.recordedOne(usd(amountCents))
  return copy.recordedOne(usd(amountCents), outcome.toFeesCents ? usd(outcome.toFeesCents) : '', outcome.unusedCents ? usd(outcome.unusedCents) : '')
}
/** Every line in the running list names its student, so a payment is never read as belonging to the first one. */
export function recordedRowLabel(studentName: string, method: PaymentMethod, number: string) { return [studentName, copy[method], number].filter(Boolean).join(' · ') }
/** The amount problem is already shown under the amount box, so the step's alert doesn't repeat it. */
export function visibleStepError(error: string, amount: ReturnType<typeof parseMoneyInput>) { return !amount.ok && error === amount.message ? '' : error }
export function referenceLabel(method: PaymentMethod | '') { return method === 'check' ? copy.checkNumber : method === 'cash' ? copy.cashReference : copy.receiptNumber }
/** Only cash may leave the check or receipt number empty (owner decision November 9, 2026). */
export function referenceProblem(method: PaymentMethod, reference: string) { return method !== 'cash' && !reference.trim() ? (method === 'check' ? 'Enter the check number.' : 'Enter a receipt number or note for this payment.') : null }
/** Changing a payment to Cash clears the old check or receipt number, as Record payment does; other changes keep it. */
export function referenceAfterMethodChange(method: PaymentMethod, reference: string) { return method === 'cash' ? '' : reference }

/** Amount box that accepts $, thousands commas and cents, refuses anything ambiguous and shows the amount it will save. */
export function MoneyInput({ label, value, onChange, disabled, allowZero, hint }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; allowZero?: boolean; hint?: string }) {
  const id = useId(); const result = value.trim() ? parseMoneyInput(value, { allowZero }) : null
  return <div className={styles.field}>
    <label htmlFor={id}>{label} <span className={styles.muted}>{copy.required}</span></label>
    <Input id={id} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={value} disabled={disabled} aria-invalid={result?.ok === false || undefined} aria-describedby={`${id}-help`} onChange={event => onChange(event.target.value)}/>
    <div id={`${id}-help`} aria-live="polite">{result?.ok ? <p className="m-0"><span className={styles.muted}>{copy.amountPreview} </span><strong className="text-2xl tabular-nums">{usd(result.cents)}</strong></p> : result ? <p className="m-0 text-sm font-semibold text-destructive">{result.message}</p> : <p className={styles.muted}>{hint ?? copy.amountHelp}</p>}</div>
  </div>
}
function MethodFields({ method, reference, onMethod, onReference, disabled, allowUnset, hideCashReference }: { method: PaymentMethod | ''; reference: string; onMethod: (value: PaymentMethod) => void; onReference: (value: string) => void; disabled?: boolean; allowUnset?: boolean; hideCashReference?: boolean }) {
  const id = useId()
  return <>
    <div className={styles.field}><label htmlFor={`${id}-method`}>{copy.method} <span className={styles.muted}>{copy.required}</span></label><NativeSelect id={`${id}-method`} value={method} disabled={disabled} onChange={event => onMethod(event.target.value as PaymentMethod)}>{(allowUnset || method === '') && <NativeSelectOption value="" disabled>{copy.chooseHow}</NativeSelectOption>}{methods.map(item => <NativeSelectOption key={item} value={item}>{copy[item]}</NativeSelectOption>)}</NativeSelect></div>
    {method !== '' && !(hideCashReference && method === 'cash') && <div className={styles.field}><label htmlFor={`${id}-reference`}>{referenceLabel(method)} <span className={styles.muted}>{method === 'cash' ? copy.optional : copy.required}</span></label><Input id={`${id}-reference`} value={reference} maxLength={150} disabled={disabled} onChange={event => onReference(event.target.value)}/></div>}
  </>
}
function StudentSelect({ students, value, onChange, disabled, label }: { students: StudentOption[] | undefined; value: string; onChange: (value: Id<'students'>) => void; disabled?: boolean; label?: string }) {
  const id = useId()
  return <div className={styles.field}><label htmlFor={id}>{label ?? copy.student}{!label && <> <span className={styles.muted}>{copy.required}</span></>}</label><NativeSelect id={id} value={value} disabled={disabled || !students} onChange={event => onChange(event.target.value as Id<'students'>)}><NativeSelectOption value="">{students ? copy.chooseStudent : copy.loading}</NativeSelectOption>{students?.map(student => <NativeSelectOption key={student.studentId} value={student.studentId}>{student.name}</NativeSelectOption>)}</NativeSelect></div>
}

/**
 * Each row gets its own lasting id when the spreadsheet is read (unless the file has a rowReference column),
 * so removing a row never makes another payment look like one already saved.
 * Spreadsheet text stays in memory; quoted commas, quotes, CRLF and multiline cells are supported. Student is a name (matched to active students) or an email. */
export function parsePaymentCsv(text: string, students: StudentOption[] = []): LabeledRow[] {
  if (text.length > 1_000_000) throw new Error(copy.csvTooLarge)
  const records: { line: number; cells: string[] }[] = []; let record: string[] = []; let field = ''; let quoted = false; let closedQuote = false; let line = 1; let recordLine = 1
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') { if (quoted && text[index + 1] === '"') { field += '"'; index++ } else if (quoted) { quoted = false; closedQuote = true } else { if (field || closedQuote) throw new Error(copy.invalidQuotes); quoted = true } }
    else if (char === ',' && !quoted) { record.push(field); field = ''; closedQuote = false }
    else if ((char === '\n' || char === '\r') && !quoted) { record.push(field); if (record.some(value => value.trim())) records.push({ line: recordLine, cells: record }); record = []; field = ''; closedQuote = false; if (char === '\r' && text[index + 1] === '\n') index++; line++; recordLine = line }
    else { if (char === '\n') line++; if (closedQuote && char.trim()) throw new Error(copy.invalidQuotes); if (!closedQuote) field += char }
  }
  if (quoted) throw new Error(copy.unfinishedCsv)
  record.push(field); if (record.some(value => value.trim())) records.push({ line: recordLine, cells: record })
  // "check or receipt number" is the column name people see; "reference" stays accepted for older files.
  const header = records.shift()?.cells.map(value => value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '')).map(name => name === 'checkorreceiptnumber' ? 'reference' : name)
  const studentColumn = header?.includes('student') ? 'student' : 'studentemail'
  const required = [studentColumn, 'amount', 'method', 'date']; const known = new Set([...required, 'reference', 'rowreference'])
  if (!header || new Set(header).size !== header.length || required.some(name => !header.includes(name)) || header.some(name => !known.has(name))) throw new Error(copy.columns)
  if (!records.length || records.length > 500) throw new Error(copy.rowLimit)
  const byName = new Map<string, StudentOption[]>(); for (const student of students) { const key = student.name.trim().toLowerCase(); byName.set(key, [...byName.get(key) ?? [], student]) }
  return records.map(({ line, cells }) => {
    if (cells.length !== header.length) throw new Error(copy.badColumns(line))
    const value = (key: string) => header.includes(key) ? cells[header.indexOf(key)].trim() : ''
    const label = copy.csvLine(line)
    const amount = parseMoneyInput(value('amount')); if (!amount.ok) throw new Error(copy.badAmount(label, amount.message))
    const method = value('method').toLowerCase(); if (!methods.includes(method as PaymentMethod)) throw new Error(copy.badMethod(line))
    const date = value('date'); if (!validDate(date)) throw new Error(copy.badDate(line))
    const reference = value('reference'); if (referenceProblem(method as PaymentMethod, reference)) throw new Error(copy.missingReference(label))
    const who = value(studentColumn); if (!who) throw new Error(copy.missingStudent(label))
    let student: Pick<PaymentRow, 'studentEmail' | 'studentId'>
    if (who.includes('@')) student = { studentEmail: normalizeEmail(who, `${label} student email`) }
    else { const matches = byName.get(who.toLowerCase()) ?? []; if (matches.length > 1) throw new Error(copy.sameName(label, who)); if (!matches.length) throw new Error(copy.unknownStudent(label, who)); student = { studentId: matches[0].studentId } }
    return { ...student, label, amountCents: amount.cents, method: method as PaymentMethod, reference, occurredAt: chicagoMidnight(date), rowReference: value('rowreference') || crypto.randomUUID() }
  })
}
/** `id` is made when the row is added and kept through edits; it is the row's part of the save key. */
export type Draft = { id: string; studentId: string; amount: string; method: PaymentMethod | ''; reference: string; date: string }
/** Typed payments become rows labeled "Payment N" so every message matches what is on screen. Returns every problem at once. */
export function draftRows(drafts: Draft[]): { rows: LabeledRow[]; problems: string[] } {
  const rows: LabeledRow[] = []; const problems: string[] = []
  drafts.forEach((draft, index) => {
    const label = copy.paymentRow(index + 1); const amount = parseMoneyInput(draft.amount); const reference = draft.method ? referenceProblem(draft.method, draft.reference) : null
    if (!draft.studentId) problems.push(copy.missingStudent(label))
    if (!amount.ok) problems.push(copy.badAmount(label, amount.message))
    if (!draft.method) problems.push(`${label}: ${copy.chooseMethod}`)
    if (reference) problems.push(`${label}: ${reference}`)
    if (!validDate(draft.date)) problems.push(`${label}: choose the date received.`)
    if (draft.studentId && amount.ok && draft.method && !reference && validDate(draft.date)) rows.push({ label, studentId: draft.studentId as Id<'students'>, amountCents: amount.cents, method: draft.method, reference: draft.reference.trim(), occurredAt: chicagoMidnight(draft.date), rowReference: draft.id })
  })
  return { rows, problems }
}
/** The reason saved with a list of payments: the note when it is long enough, the default when empty, otherwise a problem to show. */
export function bulkNoteReason(note: string): { ok: true; reason: string } | { ok: false; message: string } {
  const text = note.trim()
  if (!text) return { ok: true, reason: copy.bulkNoteDefault }
  return text.length < 8 ? { ok: false, message: copy.bulkNoteShort } : { ok: true, reason: text }
}
/** Students a reviewed list would leave $1,000 or more over their Balance due. */
export function bulkOverpayments(rows: Pick<ReviewedRow, 'studentId' | 'studentName' | 'amountCents' | 'balanceDueCents'>[]) {
  const totals = new Map<string, { name: string; amountCents: number; dueCents: number | null }>()
  for (const row of rows) { if (!row.studentId) continue; const current = totals.get(row.studentId) ?? { name: row.studentName, amountCents: 0, dueCents: row.balanceDueCents }; current.amountCents += row.amountCents; totals.set(row.studentId, current) }
  return [...totals.values()].flatMap(item => { const extra = overpaymentCents(item.amountCents, item.dueCents); return extra === null ? [] : [{ name: item.name, extraCents: extra }] })
}

class PaymentBoundary extends Component<{ children: ReactNode; retry: () => void }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() { return this.state.error !== null ? <Card className={styles.card}><p role="alert">{userFacingError(this.state.error, copy.unavailable, false)}</p><Button variant="outline" onClick={this.props.retry}>{copy.reload}</Button></Card> : this.props.children }
}
function Recoverable({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  return <PaymentBoundary key={attempt} retry={() => setAttempt(value => value + 1)}>{children}</PaymentBoundary>
}
/**
 * mode "correction" renders nothing: Edit payment now lives in the account's money tools (FinanceOperations),
 * where Coaches and Travel Leads with Money editing access both see it.
 */
export function PaymentAdministration({ mode = 'bulk' }: { studentId?: Id<'students'>; mode?: 'bulk' | 'import' | 'correction' }) {
  const [path, setPath] = useState<'fee' | 'other'>(mode === 'import' ? 'other' : 'fee')
  if (mode === 'correction') return null
  return <section className={styles.root}><Recoverable><p className={styles.muted}>{copy.whoCanAct}</p><div className={styles.actions}><Button variant={path === 'fee' ? 'default' : 'outline'} onClick={() => setPath('fee')}>{copy.feePath}</Button><Button variant={path === 'other' ? 'default' : 'outline'} onClick={() => setPath('other')}>{copy.otherPath}</Button></div>{path === 'fee' ? <FeePaymentImport/> : <BulkPayments key={mode} initialMode={mode === 'import' ? 'import' : 'bulk'}/>}</Recoverable></section>
}

/** Record payment for one student: a short step-by-step flow that stays open after saving and lists what was recorded, with a total. */
export function RecordPaymentForm({ studentId, onClose }: { studentId: Id<'students'>; onClose?: () => void }) {
  return <Recoverable><RecordPayment initialStudentId={studentId} onClose={onClose}/></Recoverable>
}
type RecordStep = keyof typeof copy.recordSteps
/** The optional note is part of Review, so recording takes three steps. */
export const recordSteps: RecordStep[] = ['amount', 'how', 'review']
function RecordPayment({ initialStudentId, onClose }: { initialStudentId: Id<'students'>; onClose?: () => void }) {
  const [studentId, setStudentId] = useState(initialStudentId)
  const context = useQuery(api.paymentAdministration.recordContext, { studentId })
  const students = useQuery(api.paymentAdministration.studentOptions, {})
  const record = useMutation(api.paymentAdministration.recordPayment)
  const [step, setStep] = useState<RecordStep>('amount')
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState<PaymentMethod | ''>(''); const [reference, setReference] = useState(''); const [date, setDate] = useState(today); const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(''); const [confirming, setConfirming] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false); const [discarding, setDiscarding] = useState(false)
  const [recorded, setRecorded] = useState<{ amountCents: number; label: string }[]>([])
  const key = useRef<string | null>(null); const noteId = useId(); const dateId = useId()
  const ready = context?.state === 'ready'
  const parsed = parseMoneyInput(amount)
  const number = method === 'cash' ? '' : reference.trim()
  const studentName = (id: Id<'students'>) => students?.find(item => item.studentId === id)?.name ?? copy.student
  // Any change to what will be saved needs a new save key, so a repeat never saves different details under an old one.
  const change = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); key.current = null; setConfirming(null); setError('') }
  const index = recordSteps.indexOf(step)
  function problem(at: RecordStep) {
    if (at === 'amount') return parsed.ok ? null : parsed.message
    if (at === 'how') return !method ? copy.chooseMethod : referenceProblem(method, number) ?? (!validDate(date) ? copy.dateMissing : null)
    if (at === 'review') return !ready ? copy.accountNotReady : null
    return null
  }
  function next() {
    const found = problem(step); if (found) { setError(found); return }
    setError('')
    if (step !== 'review') { setStep(recordSteps[index + 1]); return }
    void submit(false)
  }
  async function submit(confirmed: boolean) {
    if (busy || !parsed.ok || !method) return
    const extra = overpaymentCents(parsed.cents, context?.balanceDueCents ?? null)
    if (extra !== null && !confirmed) { setConfirming(extra); return }
    key.current ??= crypto.randomUUID(); setBusy(true); setError(''); setConfirming(null)
    try {
      await record({ studentId, amountCents: parsed.cents, method, reference: number, occurredAt: chicagoMidnight(date), note: note.trim(), idempotencyKey: key.current })
      key.current = null
      setRecorded(previous => [...previous, { amountCents: parsed.cents, label: recordedRowLabel(studentName(studentId), method, number) }])
      setSaved(recordedMessage(parsed.cents, context?.balanceDueCents ?? null)); setAmount(''); setReference(''); setNote('')
    } catch (failure) { setError(userFacingError(failure)) } finally { setBusy(false) }
  }
  // Method and date stay for the next payment, which is usually from the same meeting.
  function again(next?: Id<'students'>) { if (next) setStudentId(next); key.current = null; setSaved(''); setChoosing(false); setError(''); setConfirming(null); setStep('amount') }
  // Cancel closes the window; it only asks first when something was typed.
  const entered = !!(amount.trim() || reference.trim() || note.trim())
  function cancel() {
    if (entered && !discarding) { setDiscarding(true); return }
    key.current = null; setDiscarding(false); setAmount(''); setReference(''); setNote(''); setError(''); setConfirming(null); setStep('amount')
    onClose?.()
  }
  const total = recorded.reduce((sum, item) => sum + item.amountCents, 0)
  const name = studentName(studentId)
  return <div className={styles.form}>
    <p className={styles.muted}>{copy.recordPurpose}</p>
    <p className="m-0 text-lg font-bold">{copy.recordingFor(name)}</p>
    {context && !ready && <p role="status" className={styles.notice}>{copy.accountNotReady}</p>}
    {saved && !choosing ? <div className={styles.notice}>
      <p role="status" className="m-0">{saved}</p>
      <div className={styles.actions}><Button type="button" autoFocus onClick={() => setChoosing(true)}>{copy.recordAnother}</Button>{onClose && <Button type="button" variant="outline" onClick={onClose}>{copy.done}</Button>}</div>
    </div>
      : saved ? <div className={styles.notice}>
        <p className="m-0 font-semibold">{copy.sameOrSomeone}</p>
        <div className={styles.actions}><Button type="button" autoFocus onClick={() => again()}>{copy.sameStudent(name)}</Button></div>
        <StudentSelect students={students?.filter(item => item.studentId !== studentId)} value="" label={copy.someoneElse} onChange={id => again(id)}/>
      </div>
      : <StepWizard title={copy.recordTitle} step={index + 1} total={recordSteps.length} heading={copy.recordSteps[step]} nextLabel={step === 'review' ? (busy ? copy.recording : copy.recordButton) : copy.next} nextDisabled={discarding || (step === 'review' && (confirming !== null || !ready))} onNext={next} onBack={index > 0 ? () => { setError(''); setConfirming(null); setDiscarding(false); setStep(recordSteps[index - 1]) } : undefined} onCancel={cancel} busy={busy} error={visibleStepError(error, parsed)}>
        {discarding && <div className={styles.notice} role="alert"><p className="m-0 font-semibold">{copy.discardQuestion}</p><div className={styles.actions}><Button type="button" onClick={cancel}>{copy.discard}</Button><Button type="button" variant="outline" onClick={() => setDiscarding(false)}>{copy.keepEditing}</Button></div></div>}
        {step === 'amount' && <>{balanceDueLine(context?.balanceDueCents) && <p className="m-0 font-semibold">{balanceDueLine(context?.balanceDueCents)}</p>}<MoneyInput label={copy.amount} value={amount} onChange={change(setAmount)}/></>}
        {step === 'how' && <div className={styles.fields}>
          <MethodFields method={method} reference={reference} allowUnset hideCashReference onMethod={change(setMethod)} onReference={change(setReference)}/>
          <div className={styles.field}><label htmlFor={dateId}>{copy.date} <span className={styles.muted}>{copy.required}</span></label><Input id={dateId} type="date" value={date} max={today()} onChange={event => change(setDate)(event.target.value)}/></div>
        </div>}
        {step === 'review' && <>
          <p className="m-0 text-lg font-bold">{parsed.ok ? copy.recordReview(usd(parsed.cents), name) : copy.recordingFor(name)}</p>
          <dl className="m-0">
            <ReviewRow label={copy.student} value={name}/>
            <ReviewRow label={copy.amount} value={parsed.ok ? usd(parsed.cents) : '—'} onEdit={() => setStep('amount')} disabled={busy}/>
            <ReviewRow label={copy.method} value={[method ? copy[method] : null, number || null, validDate(date) ? shortDate(chicagoMidnight(date)) : null].filter(Boolean).join(' · ')} onEdit={() => setStep('how')} disabled={busy}/>
          </dl>
          <div className={styles.field}><label htmlFor={noteId}>{copy.note} <span className={styles.muted}>{copy.optional}</span></label><Input id={noteId} value={note} maxLength={1000} disabled={busy} placeholder={copy.notePlaceholder} onChange={event => change(setNote)(event.target.value)}/></div>
        </>}
        {step === 'review' && confirming !== null && <div className={styles.notice} role="alert"><p>{overpaymentQuestion(confirming, name, 'record')}</p><div className={styles.actions}><Button type="button" disabled={busy} onClick={() => void submit(true)}>{copy.recordAnyway}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setConfirming(null); setStep('amount') }}>{copy.changeAmount}</Button></div></div>}
      </StepWizard>}
    {recorded.length > 0 && <section aria-label={copy.recordedThisVisit} className={styles.history}><strong>{copy.recordedThisVisit}</strong><ul className="m-0 grid gap-1 pl-5">{recorded.map((item, index) => <li key={index}>{usd(item.amountCents)} · {item.label}</li>)}</ul><p className="m-0 font-semibold">{copy.recordedTotal(recorded.length, usd(total))}</p></section>}
  </div>
}

type BulkStep = keyof typeof copy.bulkSteps
const bulkSteps: BulkStep[] = ['payments', 'note', 'review']
/** A new typed row with its own lasting id; method and date carry over from the row before it. */
export const blankDraft = (previous?: Draft): Draft => ({ id: crypto.randomUUID(), studentId: '', amount: '', method: previous?.method ?? '', reference: '', date: previous?.date ?? today() })
/** Several payments at once: Payments (typed or from a spreadsheet) → Note → Review, then Record. */
function BulkPayments({ initialMode }: { initialMode: 'bulk' | 'import' }) {
  const convex = useConvex(); const post = useMutation(api.paymentAdministration.recordPaymentRow); const students = useQuery(api.paymentAdministration.studentOptions, {})
  const [mode, setMode] = useState(initialMode); const [csv, setCsv] = useState(''); const [imported, setImported] = useState<{ text: string; rows: LabeledRow[] } | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>(() => [blankDraft()])
  const [step, setStep] = useState<BulkStep>('payments')
  const [note, setNote] = useState(''); const [review, setReview] = useState<ReviewedRow[] | null>(null); const [confirmOver, setConfirmOver] = useState(false); const [asking, setAsking] = useState(false)
  // Row results by the row's lasting id; "Recorded" survives edits so a saved row is never shown as ready again.
  const [results, setResults] = useState<Record<string, string>>({}); const [problems, setProblems] = useState<string[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const guard = useRef(false)
  // One list key per list; with each row's id it makes the save key, so trying again never saves a payment twice.
  const listKey = useRef(crypto.randomUUID()); const noteId = useId()
  const isRecorded = (id: string) => results[id] === copy.recorded
  const anyRecorded = Object.values(results).includes(copy.recorded)
  function invalidate() { setReview(null); setError(''); setProblems([]); setConfirmOver(false); setAsking(false); setResults(previous => Object.fromEntries(Object.entries(previous).filter(([, value]) => value === copy.recorded))) }
  const updateDraft = (id: string, patch: Partial<Draft>) => { setDrafts(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item)); invalidate() }
  const index = bulkSteps.indexOf(step)
  function buildRows(): LabeledRow[] | null {
    if (mode === 'bulk') { const built = draftRows(drafts); if (built.problems.length) { setProblems(built.problems); return null } return built.rows }
    // Rows keep the ids they got when the spreadsheet was read until the text changes.
    if (imported && imported.text === csv) return imported.rows
    if (!csv.trim()) { setProblems([copy.pasteOrUpload]); return null }
    try { const rows = parsePaymentCsv(csv, students ?? []); setImported({ text: csv, rows }); return rows } catch (failure) { setProblems([userFacingError(failure)]); return null }
  }
  async function next() {
    if (guard.current) return
    setError(''); setProblems([])
    if (step === 'payments') { const rows = buildRows(); if (!rows) return; if (!rows.length) { setProblems([copy.noPaymentsYet]); return } setStep('note'); return }
    if (step === 'note') {
      const noteCheck = bulkNoteReason(note); if (!noteCheck.ok) { setProblems([noteCheck.message]); return }
      const rows = buildRows(); if (!rows) { setStep('payments'); return }
      guard.current = true; setBusy(true)
      try { const preview = await convex.query(api.paymentAdministration.previewPayments, { rows: rows.map(({ label: _label, ...row }) => row) }); setReview(rows.map((row, at) => ({ ...row, ...preview[at] }))); setConfirmOver(false); setAsking(false); setStep('review') }
      catch (failure) { setError(userFacingError(failure)) } finally { guard.current = false; setBusy(false) }
      return
    }
    if (review && bulkOverpayments(review).length && !confirmOver) { setAsking(true); return }
    await record()
  }
  async function record() {
    const noteCheck = bulkNoteReason(note)
    if (guard.current || !review || review.some(row => row.error) || !noteCheck.ok) return
    guard.current = true; setBusy(true); setError(''); setAsking(false)
    try {
      for (const row of review) {
        if (isRecorded(row.rowReference)) continue
        if (!row.studentId || row.expectedGeneration === null) throw new Error(copy.unmatched)
        setResults(previous => ({ ...previous, [row.rowReference]: copy.recordingRow }))
        try { await post({ studentId: row.studentId, amountCents: row.amountCents, method: row.method, reference: row.reference, occurredAt: row.occurredAt, rowReference: row.rowReference, batchReference: listKey.current, reason: noteCheck.reason, expectedGeneration: row.expectedGeneration }); setResults(previous => ({ ...previous, [row.rowReference]: copy.recorded })) }
        catch (failure) { setResults(previous => ({ ...previous, [row.rowReference]: copy.needsRetry })); throw failure }
      }
    } catch (failure) { setError(userFacingError(failure)) }
    finally { guard.current = false; setBusy(false) }
  }
  function startOver() { listKey.current = crypto.randomUUID(); setDrafts([blankDraft()]); setCsv(''); setImported(null); setNote(''); setResults({}); setStep('payments'); setReview(null); setError(''); setProblems([]); setConfirmOver(false); setAsking(false) }
  const recorded = review?.filter(row => isRecorded(row.rowReference)).length ?? 0
  const over = review ? bulkOverpayments(review) : []
  const total = review?.reduce((sum, row) => sum + row.amountCents, 0) ?? 0
  const allDone = !!review && review.length > 0 && recorded === review.length
  const goTo = (target: BulkStep) => { setError(''); setProblems([]); setAsking(false); setStep(target) }
  const reviewList = review && <dl className="m-0">
    {review.map(row => <ReviewRow key={row.rowReference} label={`${row.label}: ${row.studentName}`} value={<>{usd(row.amountCents)} · {copy[row.method]}{row.reference ? ` · ${row.reference}` : ''} · {shortDate(row.occurredAt)}<span className="block text-sm font-normal" role={row.error ? 'alert' : 'status'}>{row.error ?? results[row.rowReference] ?? copy.ready}</span></>} onEdit={allDone ? undefined : () => goTo('payments')} disabled={busy}/>)}
  </dl>
  const title = mode === 'import' ? copy.importTitle : copy.bulkTitle
  if (allDone) return <Card className={styles.card}><CardTitle>{title}</CardTitle>
    <p role="status" className={styles.notice}><strong>{copy.reviewTotal(review.length, usd(total))}</strong> · {copy.progress(review.length, recorded)}</p>
    {reviewList}
    <div className={styles.actions}><Button autoFocus onClick={startOver}>{copy.startOver}</Button></div>
  </Card>
  return <Card className={styles.card}><CardTitle>{title}</CardTitle><p className={styles.muted}>{copy.purpose}</p>
    <StepWizard title={title} step={index + 1} total={bulkSteps.length} heading={copy.bulkSteps[step]} nextLabel={busy ? copy.working : step === 'review' ? (recorded ? copy.recordRemaining : copy.recordReviewed) : copy.next} nextDisabled={step === 'review' && (asking || !review || review.some(row => !!row.error))} onNext={() => void next()} onBack={index > 0 ? () => goTo(bulkSteps[index - 1]) : undefined} onCancel={startOver} busy={busy} error={error ? `${error} ${review && step === 'review' ? (recorded > 0 ? copy.partialSaved(recorded) : copy.nothingSaved) : ''}`.trim() : null}>
      {step === 'payments' && <>
        <div className={styles.actions}><Button type="button" variant={mode === 'bulk' ? 'default' : 'outline'} disabled={busy || anyRecorded} onClick={() => { setMode('bulk'); invalidate() }}>{copy.enterRows}</Button><Button type="button" variant={mode === 'import' ? 'default' : 'outline'} disabled={busy || anyRecorded} onClick={() => { setMode('import'); invalidate() }}>{copy.importCsv}</Button></div>
        {mode === 'import' ? <>
          {anyRecorded ? <p className={styles.notice}>{copy.csvLocked}</p> : <>
            <label className={styles.field}>{copy.chooseFile}<Input type="file" accept=".csv,text/csv" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 1_000_000) throw new Error(copy.csvTooLarge); setCsv(await file.text()); invalidate() } catch (failure) { setError(userFacingError(failure)) } }}/></label>
            <p className={styles.muted}>{copy.csvHelp}</p>
            <label className={styles.field}>{copy.pasteCsv}<textarea rows={7} value={csv} disabled={busy} onChange={event => { setCsv(event.target.value); invalidate() }} className="rounded border p-3 font-mono text-sm"/></label>
          </>}
          {imported && imported.text === csv && <section aria-label={copy.importedRows(imported.rows.length)} className={styles.history}><strong>{copy.importedRows(imported.rows.length)}</strong>
            {imported.rows.map(row => <div key={row.rowReference} className={styles.historyRow}><span>{row.label} · {usd(row.amountCents)} · {copy[row.method]}{row.reference ? ` · ${row.reference}` : ''} · {shortDate(row.occurredAt)}{isRecorded(row.rowReference) ? ` · ${copy.recorded}` : ''}</span>
              {imported.rows.length > 1 && <Button type="button" variant="outline" disabled={busy} onClick={() => { setImported({ text: csv, rows: imported.rows.filter(item => item.rowReference !== row.rowReference) }); invalidate() }}>{copy.removeRow}</Button>}</div>)}
          </section>}
        </> : <>{drafts.map((row, at) => <fieldset key={row.id} className={styles.form} disabled={busy}><legend className="font-semibold">{copy.paymentRow(at + 1)}{isRecorded(row.id) ? ` · ${copy.recorded}` : ''}</legend>
          <fieldset className={styles.fields} disabled={isRecorded(row.id)}>
            <StudentSelect students={students} value={row.studentId} onChange={studentId => updateDraft(row.id, { studentId })}/>
            <MoneyInput label={copy.amount} value={row.amount} onChange={amount => updateDraft(row.id, { amount })}/>
            <MethodFields method={row.method} reference={row.reference} allowUnset onMethod={method => updateDraft(row.id, { method })} onReference={reference => updateDraft(row.id, { reference })}/>
            <label className={styles.field}><span>{copy.date} <span className={styles.muted}>{copy.required}</span></span><Input type="date" value={row.date} max={today()} onChange={event => updateDraft(row.id, { date: event.target.value })}/></label>
          </fieldset>
          {drafts.length > 1 && <Button type="button" variant="outline" onClick={() => { setDrafts(previous => previous.filter(item => item.id !== row.id)); invalidate() }}>{copy.removeRow}</Button>}</fieldset>)}
          <Button type="button" variant="outline" disabled={busy || drafts.length >= 500} onClick={() => { setDrafts(previous => [...previous, blankDraft(previous.at(-1))]); invalidate() }}>{copy.addRow}</Button></>}
      </>}
      {step === 'note' && <div className={styles.field}><label htmlFor={noteId}>{copy.bulkNote} <span className={styles.muted}>{copy.optional}</span></label><Input id={noteId} value={note} maxLength={1000} placeholder={copy.notePlaceholder} onChange={event => { setNote(event.target.value); invalidate() }}/></div>}
      {step === 'review' && review && <>
        <p role="status" className="m-0"><strong>{copy.reviewTotal(review.length, usd(total))}</strong>{recorded > 0 && <> · {copy.progress(review.length, recorded)}</>}</p>
        {reviewList}
        <dl className="m-0"><ReviewRow label={copy.bulkNote} value={note.trim() || copy.bulkNoteDefault} onEdit={() => goTo('note')} disabled={busy}/></dl>
        {asking && over.length > 0 && <div className={styles.notice} role="alert"><p className="m-0">{copy.bulkOverpayment(over.map(item => ({ name: item.name, amount: usd(item.extraCents) })))}</p><div className={styles.actions}><Button type="button" disabled={busy} onClick={() => { setConfirmOver(true); void record() }}>{copy.recordAllAnyway}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => goTo('payments')}>{copy.changeAmounts}</Button></div></div>}
      </>}
      {problems.length > 0 && <div role="alert" className={styles.error}><ul className="m-0 grid gap-1 pl-5">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul></div>}
    </StepWizard>
  </Card>
}

/** Payments on one student's account, each with Edit payment and its change history. */
export function EditPayments({ studentId }: { studentId: Id<'students'> }) {
  return <Recoverable><PaymentList studentId={studentId}/></Recoverable>
}
function PaymentList({ studentId }: { studentId: Id<'students'> }) {
  const page = usePaginatedQuery(api.paymentAdministration.receipts, { studentId }, { initialNumItems: 20 })
  const [selected, setSelected] = useState<Id<'ledgerEntries'> | null>(null); const [saved, setSaved] = useState('')
  // The banner clears itself so it never lingers beside a payment that has since changed again.
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(''), 8000); return () => clearTimeout(timer) }, [saved])
  return <Card className={styles.card}><CardTitle>{copy.paymentsTitle}</CardTitle><p className={styles.muted}>{copy.paymentsPurpose}</p>
    {saved && <p role="status" className={styles.notice}>{saved}</p>}
    <div className={styles.history}>{page.results.map(row => <div className={styles.historyRow} key={row.sourceEntryId}>
      <strong>{usd(row.currentAmountCents)} · {methodName(row.method)}{row.reference ? ` · ${row.reference}` : ''}</strong>
      <span className={styles.muted}>{shortDate(row.occurredAt)}{row.currentAmountCents !== row.originalAmountCents ? ` · first recorded as ${usd(row.originalAmountCents)}` : ''}{row.movedToName ? ` · ${copy.movedTo(row.movedToName)}` : ''}{row.carried ? ` · ${copy.fromEarlierSeason}` : ''}</span>
      {row.pending?.state === 'running' && <p role="status" className="m-0">{copy.pendingSaving(row.pending.movingToName)}</p>}
      {row.pending?.state === 'failed' && <RetryEdit sourceEntryId={row.sourceEntryId} movingToName={row.pending.movingToName} onCanceled={() => setSaved(copy.canceled)}/>}
      {row.edits.length > 0 && <details><summary>{copy.changes(row.edits.length)}</summary><ul className="m-0 grid gap-1 pl-5">{row.edits.map(edit => <li key={edit.at}>{when(edit.at)} · {edit.actorName}: {edit.summary}. {edit.reason}</li>)}</ul></details>}
      {!row.carried && !row.movedToName && !row.pending && selected !== row.sourceEntryId && <Button variant="outline" aria-label={copy.editFor(usd(row.currentAmountCents), shortDate(row.occurredAt))} onClick={() => { setSelected(row.sourceEntryId); setSaved('') }}>{copy.editPayment}</Button>}
      {selected === row.sourceEntryId && <EditPaymentForm key={row.sourceEntryId} sourceEntryId={row.sourceEntryId} onDone={message => { setSelected(null); setSaved(message) }} onCancel={() => setSelected(null)}/>}
    </div>)}</div>
    {page.status === 'CanLoadMore' && <Button variant="outline" onClick={() => page.loadMore(20)}>{copy.showMore}</Button>}{page.status === 'LoadingFirstPage' && <p role="status">{copy.loading}</p>}{page.status !== 'LoadingFirstPage' && !page.results.length && <p>{copy.noPayments}</p>}
  </Card>
}
/** A stopped edit, with Try again and Cancel for the same people who can edit payments. */
function RetryEdit({ sourceEntryId, movingToName, onCanceled }: { sourceEntryId: Id<'ledgerEntries'>; movingToName: string | null; onCanceled: () => void }) {
  const retry = useMutation(api.paymentAdministration.retryEdit)
  const cancelEdit = useMutation(api.paymentAdministration.cancelEdit)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [canceling, setCanceling] = useState(false); const [reason, setReason] = useState(''); const reasonId = useId()
  const cancelLabel = movingToName ? copy.cancelMove : copy.cancelEdit
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); return true } catch (failure) { setError(userFacingError(failure)); return false } finally { setBusy(false) } }
  return <div className={styles.notice} role="alert">
    <p className="m-0"><strong>{copy.stopped}</strong></p>
    <p className="m-0">{copy.pendingFailed(movingToName)}</p>
    {canceling ? <form className={styles.form} onSubmit={event => { event.preventDefault(); const short = moneyReasonProblem(reason); if (short) { setError(short); return } void run(() => cancelEdit({ sourceEntryId, reason: reason.trim() })).then(done => { if (done) onCanceled() }) }}>
      <p className="m-0">{copy.cancelConfirm(movingToName)}</p>
      <div className={styles.field}><label htmlFor={reasonId}>{copy.cancelReason} <span className={styles.muted}>{copy.required}</span></label><Input id={reasonId} value={reason} maxLength={1000} disabled={busy} aria-describedby={`${reasonId}-help`} onChange={event => { setReason(event.target.value); setError('') }}/><p id={`${reasonId}-help`} className={styles.muted}>{copy.editReasonHelp}</p></div>
      <div className={styles.actions}><Button type="submit" disabled={busy}>{busy ? copy.canceling : cancelLabel}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setCanceling(false); setReason(''); setError('') }}>{copy.keepEdit}</Button></div>
    </form> : <div className={styles.actions}><Button type="button" disabled={busy} onClick={() => void run(() => retry({ sourceEntryId }))}>{busy ? copy.retrying : copy.tryAgain}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setCanceling(true); setError('') }}>{cancelLabel}</Button></div>}
    {error && <p className={styles.error}>{error}</p>}
  </div>
}
function EditPaymentForm({ sourceEntryId, onDone, onCancel }: { sourceEntryId: Id<'ledgerEntries'>; onDone: (message: string) => void; onCancel: () => void }) {
  const context = useQuery(api.paymentAdministration.editContext, { sourceEntryId })
  // The form keeps the details from when it opened; a later change by someone else stops the save instead of being adopted.
  const [opened, setOpened] = useState<OpenedEdit | null>(null)
  if (!opened && context && !context.lockedMessage && context.expectedSourceRevision !== null) setOpened({ ...context, expectedSourceRevision: context.expectedSourceRevision })
  if (opened) return <EditFields key={`${opened.expectedEditId}:${opened.expectedSourceRevision}`} sourceEntryId={sourceEntryId} initial={opened} stale={context !== undefined && editContextChanged(opened, context)} onReload={() => setOpened(null)} onDone={onDone} onCancel={onCancel}/>
  if (!context) return <p role="status">{copy.loading}</p>
  return <div className={styles.notice}><p role="status">{context.lockedMessage ?? copy.accountNotReady}</p><Button variant="outline" onClick={onCancel}>{copy.cancel}</Button></div>
}
type EditContext = FunctionReturnType<typeof api.paymentAdministration.editContext>
type OpenedEdit = EditContext & { expectedSourceRevision: number }
/** True when the payment changed after the Edit payment form opened, or can't be edited now. */
export function editContextChanged(opened: OpenedEdit, live: EditContext) {
  return !!live.lockedMessage || live.expectedEditId !== opened.expectedEditId || live.expectedSourceRevision !== opened.expectedSourceRevision || live.studentId !== opened.studentId || live.amountCents !== opened.amountCents || live.method !== opened.method || live.reference !== opened.reference
}
type EditStep = keyof typeof copy.editSteps
const editSteps: EditStep[] = ['what', 'why', 'review']
function EditFields({ sourceEntryId, initial, stale: changed, onReload, onDone, onCancel }: { sourceEntryId: Id<'ledgerEntries'>; initial: OpenedEdit; stale: boolean; onReload: () => void; onDone: (message: string) => void; onCancel: () => void }) {
  const students = useQuery(api.paymentAdministration.studentOptions, {})
  const edit = useMutation(api.paymentAdministration.editPayment)
  const [step, setStep] = useState<EditStep>('what')
  const [studentId, setStudentId] = useState<Id<'students'>>(initial.studentId); const [amount, setAmount] = useState((initial.amountCents / 100).toFixed(2))
  const [method, setMethod] = useState<PaymentMethod | ''>(initial.method ?? ''); const [reference, setReference] = useState(initial.reference ?? ''); const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirming, setConfirming] = useState<number | null>(null); const key = useRef<string | null>(null); const reasonId = useId()
  // While this person's own save is running, the change it makes isn't someone else's.
  const [saving, setSaving] = useState(false); const stale = changed && !saving
  const parsed = parseMoneyInput(amount, { allowZero: true }); const moving = studentId !== initial.studentId
  const target = useQuery(api.paymentAdministration.recordContext, { studentId })
  const correction = useQuery(api.paymentAdministration.previewCorrection, parsed.ok && (moving || parsed.cents !== initial.amountCents) ? { sourceEntryId, targetAmountCents: moving ? 0 : parsed.cents } : 'skip')
  // Any change to the edit needs a new save key; the server refuses a reused key with different details.
  const change = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); key.current = null; setConfirming(null); setError('') }
  const studentName = (id: Id<'students'>) => students?.find(item => item.studentId === id)?.name ?? copy.student
  const lines = [parsed.ok && parsed.cents !== initial.amountCents ? `${copy.amount}: ${usd(initial.amountCents)} → ${usd(parsed.cents)}` : null, method && method !== initial.method ? `${copy.method}: ${methodName(initial.method)} → ${copy[method]}` : null, reference.trim() !== (initial.reference ?? '') ? `${referenceLabel(method)}: ${initial.reference || 'none'} → ${reference.trim() || 'none'}` : null, moving ? `${copy.student}: ${studentName(initial.studentId)} → ${studentName(studentId)}` : null].filter((line): line is string => !!line)
  const index = editSteps.indexOf(step)
  function problem(at: EditStep): string | null {
    if (at === 'what') return !parsed.ok ? parsed.message : !method ? copy.chooseMethod : referenceProblem(method, reference) ?? (moving && initial.amountCents === 0 ? copy.moveZero : moving && parsed.cents === 0 ? copy.moveNeedsAmount : !lines.length ? copy.noChange : correction?.state === 'hold' && correction.message ? correction.message : null)
    if (at === 'why') return moneyReasonProblem(reason)
    return problem('what') ?? problem('why')
  }
  function next() {
    const found = problem(step); if (found) { setError(found); return }
    setError('')
    if (step !== 'review') { setStep(editSteps[index + 1]); return }
    void save(false)
  }
  async function save(confirmed: boolean) {
    if (busy || stale || !parsed.ok || !method) return
    const added = moving ? parsed.cents : parsed.cents - initial.amountCents
    const extra = added > 0 ? overpaymentCents(added, target?.balanceDueCents ?? null) : null
    if (extra !== null && !confirmed) { setConfirming(extra); return }
    key.current ??= crypto.randomUUID(); setBusy(true); setSaving(true); setError(''); setConfirming(null)
    try { await edit({ sourceEntryId, studentId, amountCents: parsed.cents, method, reference: reference.trim(), reason: reason.trim(), expectedSourceRevision: initial.expectedSourceRevision, expectedEditId: initial.expectedEditId, expectedBefore: { studentId: initial.studentId, amountCents: initial.amountCents, method: initial.method, reference: initial.reference }, idempotencyKey: key.current }); onDone(copy.edited) }
    catch (failure) { setSaving(false); setError(userFacingError(failure)) } finally { setBusy(false) }
  }
  return <StepWizard title={copy.editTitle} step={index + 1} total={editSteps.length} heading={copy.editSteps[step]} nextLabel={step === 'review' ? (busy ? copy.saving : copy.saveEdit) : copy.next} nextDisabled={stale || (step === 'review' && confirming !== null)} onNext={next} onBack={index > 0 ? () => { setError(''); setConfirming(null); setStep(editSteps[index - 1]) } : undefined} onCancel={onCancel} busy={busy} error={visibleStepError(error, parsed)}>
    {stale && <div className={styles.notice} role="alert"><p className="m-0">{copy.staleEdit}</p><Button type="button" variant="outline" onClick={onReload}>{copy.reload}</Button></div>}
    {step === 'what' && <>
      <div className={styles.fields}>
        <StudentSelect students={students} value={studentId} onChange={change(setStudentId)}/>
        <MoneyInput label={copy.amount} value={amount} allowZero hint={copy.zeroHint} onChange={change(setAmount)}/>
        <MethodFields method={method} reference={reference} allowUnset={!initial.method} onMethod={change((value: PaymentMethod) => { setMethod(value); setReference(previous => referenceAfterMethodChange(value, previous)) })} onReference={change(setReference)}/>
      </div>
      <p className={styles.muted}>{copy.moveHint}</p>
    </>}
    {step === 'why' && <div className={styles.field}><label htmlFor={reasonId}>{copy.editReason} <span className={styles.muted}>{copy.required}</span></label><Input id={reasonId} value={reason} maxLength={1000} aria-describedby={`${reasonId}-help`} onChange={event => change(setReason)(event.target.value)}/><p id={`${reasonId}-help`} className={styles.muted}>{copy.editReasonHelp}</p></div>}
    {step === 'review' && <>
      <dl className="m-0">
        <ReviewRow label={copy.editSteps.what} value={<ul className="m-0 grid gap-1 pl-5">{lines.map(line => <li key={line}>{line}</li>)}</ul>} onEdit={() => setStep('what')} disabled={busy}/>
        <ReviewRow label={copy.editSteps.why} value={reason.trim()} onEdit={() => setStep('why')} disabled={busy}/>
      </dl>
      {(moving || (parsed.ok && parsed.cents < initial.amountCents)) && <p className={styles.notice}>{copy.lowering}</p>}
      {correction?.state === 'hold' && correction.message && <p role="status" className={styles.notice}>{correction.message}</p>}
      {confirming !== null && <div className={styles.notice} role="alert"><p>{overpaymentQuestion(confirming, studentName(studentId), 'save')}</p><div className={styles.actions}><Button type="button" disabled={busy || stale} onClick={() => void save(true)}>{copy.saveAnyway}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setConfirming(null); setStep('what') }}>{copy.changeAmount}</Button></div></div>}
    </>}
  </StepWizard>
}
