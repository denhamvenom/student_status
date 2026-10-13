import { operationsCopy } from '../../lib/operations-copy'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import styles from './FinanceOperations.module.css'

const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
function chicagoDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
function chicagoStartOfDay(date: string) {
  const guess = Date.parse(`${date}T06:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess))
  const number = (type: string) => Number(parts.find(value => value.type === type)?.value)
  const localAtGuess = Date.UTC(number('year'), number('month') - 1, number('day'), number('hour'), number('minute'))
  return Date.parse(`${date}T00:00:00Z`) - (localAtGuess - guess)
}
function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [dollars, fraction = ''] = value.split('.')
  const result = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, '0'))
  return result > 0n && result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null
}

export function FinanceOperations({ studentId }: { studentId: Id<'students'> }) {
  return <FinanceOperationsForStudent key={studentId} studentId={studentId} />
}

function FinanceOperationsForStudent({ studentId }: { studentId: Id<'students'> }) {
  const options = useQuery(api.financeOperations.operationOptions, { studentId })
  const [operationId, setOperationId] = useState<Id<'financeOperations'> | null>(null)
  const activeOperation = useQuery(api.financialOperationsWorker.status, { studentId })
  const receipt = useQuery(api.financialOperationsWorker.status, operationId ? { studentId, operationId } : 'skip')
  const operation = activeOperation?.job ? activeOperation : receipt ?? activeOperation
  const retry = useMutation(api.financialOperationsWorker.retry)
  const payout = useMutation(api.financeOperations.recordPayout)
  const transfer = useMutation(api.financeOperations.transferFundraising)
  const [mode, setMode] = useState<'payout' | 'transfer'>('payout')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<'cash' | 'check' | 'other'>('check')
  const [reference, setReference] = useState('')
  const [occurredDate, setOccurredDate] = useState(chicagoDate)
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [retryReason, setRetryReason] = useState('')
  const pendingKey = useRef<string | null>(null)
  const change = (setter: (value: string) => void, value: string) => { pendingKey.current = null; setter(value); setError(''); setSaved('') }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || options?.state !== 'ready') return
    const amountCents = cents(amount)
    if (amountCents === null) { setError(operationsCopy.finance.enterAPositiveAmountWithAtMostTwoDecimalPlaces); return }
    if (!reason.trim()) { setError(operationsCopy.finance.enterAReason); return }
    if (mode === 'payout' && (!reference.trim() || !occurredDate)) { setError(operationsCopy.finance.enterTheDateAndMethodReference); return }
    if (mode === 'transfer' && !recipient) { setError(operationsCopy.finance.chooseARecipientStudent); return }
    const idempotencyKey = pendingKey.current ?? crypto.randomUUID()
    pendingKey.current = idempotencyKey
    setBusy(true); setError(''); setSaved('')
    try {
      if (mode === 'payout') {
        const occurredAt = chicagoStartOfDay(occurredDate)
        setOperationId(await payout({ studentId, amountCents, reason: reason.trim(), method, reference: reference.trim(), occurredAt, idempotencyKey }))
        setSaved('Refund record submitted. Financial processing must finish before this account is available again.')
      } else {
        setOperationId(await transfer({ studentId, recipientStudentId: recipient as Id<'students'>, amountCents, reason: reason.trim(), idempotencyKey }))
        setSaved('Transfer submitted. Committed amounts and remaining work are shown below while processing continues.')
      }
      pendingKey.current = null; setAmount(''); setReason(''); setReference('')
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  return <section className={styles.panel} aria-label={operationsCopy.finance.financialOperations}>
    <h2>{operationsCopy.finance.moneyReturnedAndFundraisingTransfers}</h2>
    <p className={styles.note}>{operationsCopy.finance.recordMoneyAlreadyGivenToAFamilyThisAppRecordsTheRefundItDoesNotTransferMoneyFun}</p>
    {options === undefined ? <p>{operationsCopy.finance.loadingAvailableFunds}</p> : <>
      {options.state !== 'ready' && <p role="status" className={styles.note}>{options.state === 'failed' ? 'Financial processing stopped. A Coach must review and retry the remaining work.' : 'Financial processing is updating. These are committed balances; this account is not ready for another operation.'}</p>}
      <div className={styles.balances}><span>{operationsCopy.finance.unallocatedPersonal} <strong>{usd(options.personalAvailableCents)}</strong></span><span>{operationsCopy.finance.availableFundraising} <strong>{usd(options.fundraisingAvailableCents)}</strong></span></div>
      {operation?.job && <section aria-label="Financial processing status"><h3>{operation.job.kind === 'payout' ? 'Refund recording' : operation.job.kind === 'transfer' ? 'Travel credit transfer' : 'Withdrawal processing'} · {operation.job.state}</h3><p role="status">Committed {usd(operation.job.committedCents)} of {usd(operation.job.amountCents)}. {operation.job.state !== 'complete' && 'Remaining amounts have not been committed.'}</p>{operation.job.lastError && <p className={styles.error}>{operation.job.lastError}</p>}{operation.canRetry && <form className={styles.form} onSubmit={async event => { event.preventDefault(); if (!operation.job || busy || retryReason.trim().length < 8) return; setBusy(true); setError(''); try { await retry({ jobId: operation.job._id, reason: retryReason.trim() }); setRetryReason('') } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) } }}><label>Reason for retry<Input value={retryReason} onChange={event => setRetryReason(event.target.value)} minLength={8} maxLength={1000} required disabled={busy} /></label><Button disabled={busy || retryReason.trim().length < 8}>Retry remaining work</Button></form>}</section>}
      <div className={styles.switch} role="group" aria-label={operationsCopy.finance.chooseFinancialOperation}>
        <Button type="button" disabled={busy} variant={mode === 'payout' ? 'default' : 'outline'} onClick={() => { setMode('payout'); pendingKey.current = null; setError(''); setSaved('') }}>{operationsCopy.finance.recordCashCheckRefund}</Button>
        <Button type="button" disabled={busy} variant={mode === 'transfer' ? 'default' : 'outline'} onClick={() => { setMode('transfer'); pendingKey.current = null; setError(''); setSaved('') }}>{operationsCopy.finance.transferFundraisingCredit}</Button>
      </div>
      <form className={styles.form} onSubmit={event => void submit(event)}>
        <fieldset className={styles.fields} disabled={busy || options.state !== 'ready'}>
        <label>{operationsCopy.finance.amountUSD}<Input type="text" inputMode="decimal" value={amount} onChange={event => change(setAmount, event.target.value)} placeholder="0.00" required /></label>
        {mode === 'payout' ? <>
          <label>{operationsCopy.finance.howWasMoneyReturned}<NativeSelect value={method} onChange={event => { setMethod(event.target.value as 'cash' | 'check' | 'other'); pendingKey.current = null }}><NativeSelectOption value="check">{operationsCopy.finance.check}</NativeSelectOption><NativeSelectOption value="cash">{operationsCopy.finance.cash}</NativeSelectOption><NativeSelectOption value="other">{operationsCopy.finance.otherExternalMethod}</NativeSelectOption></NativeSelect></label>
          <label>{operationsCopy.finance.dateMoneyWasReturned}<Input type="date" value={occurredDate} max={chicagoDate()} onChange={event => change(setOccurredDate, event.target.value)} required /></label>
          <label>{operationsCopy.finance.methodReference}<Input value={reference} maxLength={150} onChange={event => change(setReference, event.target.value)} placeholder={operationsCopy.finance.checkNumberOrReceiptReference} required /></label>
        </> : <label>{operationsCopy.finance.recipientStudent}<NativeSelect value={recipient} onChange={event => change(setRecipient, event.target.value)} required><NativeSelectOption value="">{operationsCopy.finance.chooseAnActiveStudent}</NativeSelectOption>{options.recipients.map(student => <NativeSelectOption key={student._id} value={student._id}>{student.name}</NativeSelectOption>)}</NativeSelect></label>}
        <label className={styles.wide}>{operationsCopy.finance.reason}<Input value={reason} maxLength={500} onChange={event => change(setReason, event.target.value)} required /></label>
        <Button type="submit" disabled={busy || (mode === 'payout' ? options.personalAvailableCents <= 0 : options.fundraisingAvailableCents <= 0)}>{busy ? operationsCopy.finance.recording : mode === 'payout' ? operationsCopy.finance.recordMoneyReturned : operationsCopy.finance.transferFundraisingCredit}</Button>
        </fieldset>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {saved && <p role="status" className={styles.success}>{receipt?.operation && (receipt.operation.state ?? 'complete') === 'complete' ? receipt.operation.kind === 'payout' ? operationsCopy.finance.cashCheckRefundRecordedThisRecordDoesNotSendMoney : 'Travel credit transfer recorded. Recipient allocations may still be processing; check the recipient account for readiness.' : saved}</p>}
    </>}
  </section>
}
