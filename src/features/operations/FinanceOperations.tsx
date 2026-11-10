import { userFacingError } from '@/lib/error-message'
import { operationsCopy } from '../../lib/operations-copy'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import styles from './FinanceOperations.module.css'
import { chargeCurrency, parseMoneyInput } from '../../lib/charge-money'
import { ReviewRow, StepWizard } from '../../components/StepWizard'
import { EditPayments, MoneyInput, referenceLabel, referenceProblem, visibleStepError } from '../../PaymentAdministration'
import { moneyJobStateLabel, moneyReturnedCopy as refundCopy, paymentAdministrationCopy as paymentCopy } from '../../lib/payment-admin-copy'
import { chicagoDateString, chicagoMidnight } from '../../../shared/chicago-time'

const usd = chargeCurrency
const errorText = (error: unknown) => userFacingError(error)
type TeamPreview = FunctionReturnType<typeof api.financeOperations.previewTeamTransfer>
export function teamTransferReviewReady(preview: TeamPreview | null, current: TeamPreview | undefined, amountCents: number | null) {
  return amountCents !== null && Number.isSafeInteger(amountCents) && amountCents > 0 && preview?.state === 'ready' && preview.expectedFinancialRevision !== null && preview.amountCents === amountCents && current?.state === 'ready' && current.amountCents === amountCents && current.expectedFinancialRevision === preview.expectedFinancialRevision
}
export function TeamTransferReview({ preview, current, amountCents, busy, reasonValid, onReview }: { preview: TeamPreview | null; current: TeamPreview | undefined; amountCents: number | null; busy: boolean; reasonValid: boolean; onReview: () => void }) {
  const ready = teamTransferReviewReady(preview, current, amountCents)
  return <><Button type="button" variant="outline" disabled={busy || !current} onClick={onReview}>{operationsCopy.finance.teamTransferPreview}</Button>{preview && <div className={styles.wide}><p>{operationsCopy.finance.teamTransferDestination} · Requested {usd(preview.amountCents)} · Available fundraising {preview.fundraisingAvailableCents === null ? 'Unavailable' : usd(preview.fundraisingAvailableCents)}</p>{preview.message && <p role="status" className={styles.note}>{preview.message}</p>}{!ready && <p role="status" className={styles.note}>This preview is not ready or financial records changed. Review again before confirming.</p>}</div>}<Button type="submit" disabled={busy || !ready || !reasonValid}>{busy ? operationsCopy.finance.recording : operationsCopy.finance.teamTransferConfirm}</Button></>
}
const chicagoDate = () => chicagoDateString(Date.now())
function cents(value: string) {
  const parsed = parseMoneyInput(value)
  return parsed.ok ? parsed.cents : null
}

export function FinanceOperations({ studentId }: { studentId: Id<'students'> }) {
  return <><EditPayments key={`payments:${studentId}`} studentId={studentId} /><FinanceOperationsForStudent key={studentId} studentId={studentId} /></>
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
  const teamTransfer = useMutation(api.financeOperations.transferToTeam)
  const [mode, setMode] = useState<'payout' | 'transfer' | 'teamTransfer'>('payout')
  const [amount, setAmount] = useState('')
  const parsedAmount = cents(amount)
  const liveTeamPreview = useQuery(api.financeOperations.previewTeamTransfer, mode === 'teamTransfer' && parsedAmount !== null ? { studentId, amountCents: parsedAmount } : 'skip')
  const [teamPreview, setTeamPreview] = useState<FunctionReturnType<typeof api.financeOperations.previewTeamTransfer> | null>(null)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<'cash' | 'check' | 'other' | ''>('')
  const [step, setStep] = useState<'amount' | 'how' | 'who' | 'reason' | 'review'>('amount')
  const [reference, setReference] = useState('')
  const [occurredDate, setOccurredDate] = useState(chicagoDate)
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [retryReason, setRetryReason] = useState('')
  const pendingKey = useRef<string | null>(null)
  const change = (setter: (value: string) => void, value: string, invalidatePreview = true) => { pendingKey.current = null; setter(value); setError(''); setSaved(''); if (invalidatePreview) setTeamPreview(null) }
  const teamReady = teamTransferReviewReady(teamPreview, liveTeamPreview, parsedAmount)

  const wizardSteps = mode === 'payout' ? ['amount', 'how', 'reason', 'review'] as const : ['amount', 'who', 'reason', 'review'] as const
  const stepIndex = Math.max(0, (wizardSteps as readonly string[]).indexOf(step))
  const parsedMoney = parseMoneyInput(amount)
  const recipientName = options?.state === 'ready' ? options.recipients.find(student => student._id === recipient)?.name ?? '' : ''
  const resetWizard = () => { setStep('amount'); setAmount(''); setReason(''); setReference(''); setMethod(''); setRecipient(''); setError(''); pendingKey.current = null }
  function stepProblem(at: typeof step): string | null {
    if (at === 'amount') return parsedMoney.ok ? null : parsedMoney.message
    if (at === 'how') return !method ? refundCopy.chooseHowReturned : referenceProblem(method, reference) ?? (!occurredDate ? refundCopy.enterDate : null)
    if (at === 'who') return recipient ? null : operationsCopy.finance.chooseARecipientStudent
    if (at === 'reason') return reason.trim() ? null : refundCopy.enterReason
    return null
  }
  function nextStep() {
    const found = stepProblem(step); if (found) { setError(found); return }
    setError('')
    if (step === 'review') { void submit(); return }
    setStep(wizardSteps[stepIndex + 1])
  }
  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (busy || options?.state !== 'ready') return
    const amountCents = cents(amount)
    if (amountCents === null) { const parsed = parseMoneyInput(amount); setError(parsed.ok ? paymentCopy.amountHelp : parsed.message); return }
    if (!reason.trim()) { setError(refundCopy.enterReason); return }
    if (mode === 'payout' && !occurredDate) { setError(refundCopy.enterDate); return }
    if (mode === 'payout' && !method) { setError(refundCopy.chooseHowReturned); return }
    const missingReference = mode === 'payout' && method ? referenceProblem(method, reference) : null
    if (missingReference) { setError(missingReference); return }
    if (mode === 'transfer' && !recipient) { setError(operationsCopy.finance.chooseARecipientStudent); return }
    if (mode === 'teamTransfer' && (!teamReady || !teamPreview || teamPreview.expectedFinancialRevision === null || reason.trim().length < 8)) { setError('Review the transfer and enter a reason of at least eight characters.'); return }
    const idempotencyKey = pendingKey.current ?? crypto.randomUUID()
    pendingKey.current = idempotencyKey
    setBusy(true); setError(''); setSaved('')
    try {
      if (mode === 'payout') {
        const occurredAt = chicagoMidnight(occurredDate)
        setOperationId(await payout({ studentId, amountCents, reason: reason.trim(), method: method || 'other', reference: reference.trim(), occurredAt, idempotencyKey }))
        setSaved(refundCopy.refundSubmitted)
      } else if (mode === 'transfer') {
        setOperationId(await transfer({ studentId, recipientStudentId: recipient as Id<'students'>, amountCents, reason: reason.trim(), idempotencyKey }))
        setSaved('Transfer started. See below for money already moved and work still processing.')
      } else {
        if (!teamPreview || teamPreview.expectedFinancialRevision === null) return
        setOperationId(await teamTransfer({ studentId, amountCents, expectedFinancialRevision: teamPreview.expectedFinancialRevision, reason: reason.trim(), idempotencyKey }))
        setSaved(operationsCopy.finance.teamTransferSubmitted)
        setTeamPreview(null)
      }
      pendingKey.current = null; setAmount(''); setReason(''); setReference(''); setMethod(''); setRecipient(''); setStep('amount')
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  return <section className={styles.panel} aria-label={operationsCopy.finance.financialOperations}>
    <h2>{operationsCopy.finance.moneyReturnedAndFundraisingTransfers}</h2>
    <p className={styles.note}>{operationsCopy.finance.recordMoneyAlreadyGivenToAFamilyThisAppRecordsTheRefundItDoesNotTransferMoneyFun}</p>
    {options === undefined ? <p>{operationsCopy.finance.loadingAvailableFunds}</p> : options.state === 'uninitialized' || options.personalAvailableCents === null || options.fundraisingAvailableCents === null ? <p role={options.state === 'failed' ? 'alert' : 'status'} className={styles.note}>{options.state === 'uninitialized' ? operationsCopy.finance.financialAccountUninitialized : options.state === 'failed' ? operationsCopy.finance.financialAccountPreparationFailed : operationsCopy.finance.financialAccountRebuilding}</p> : <>
      {options.state !== 'ready' && <p role="status" className={styles.note}>{options.state === 'failed' ? 'Money processing stopped. A Coach must review it and try again.' : 'Money records are updating. These amounts are already saved, but this account is not ready for another change.'}</p>}
      <div className={styles.balances}><span>{refundCopy.unusedPayments} <strong>{usd(options.personalAvailableCents)}</strong></span><span>{operationsCopy.finance.availableFundraising} <strong>{usd(options.fundraisingAvailableCents)}</strong></span></div>
      {operation?.job && <section aria-label="Financial processing status"><h3>{operation.job.kind === 'payout' ? refundCopy.status.payout : operation.job.kind === 'transfer' ? refundCopy.status.transfer : operation.job.kind === 'teamTransfer' ? refundCopy.status.teamTransfer : operation.job.kind === 'chargeCorrection' ? refundCopy.status.chargeCorrection : operation.job.kind === 'paymentCorrection' ? refundCopy.status.paymentCorrection : refundCopy.status.withdrawal} · {moneyJobStateLabel(operation.job.kind, operation.job.state)}</h3>{operation.job.kind === 'paymentCorrection' && operation.job.state === 'failed' && <p className={styles.note}>{refundCopy.paymentCorrectionNext}</p>}<p role="status">{operation.job.kind === 'chargeCorrection' ? <>Money already returned to available funds: {usd(operation.job.committedCents)} of {usd(operation.job.releaseRequiredCents ?? operation.job.amountCents)}. {operation.job.state !== 'complete' && 'The new charge amount is not saved yet. The old amount stays on record until the extra money has been returned.'}</> : <>{refundCopy.progress(usd(operation.job.committedCents), usd(operation.job.amountCents))} {operation.job.state !== 'complete' && refundCopy.progressRest}</>}</p>{operation.job.lastError && <p className={styles.error}>{userFacingError(new Error(operation.job.lastError), 'Processing stopped. Check the current status before trying again, or ask a Coach for help.')}</p>}{operation.canRetry && operation.job.kind !== 'paymentCorrection' && <form className={styles.form} onSubmit={async event => { event.preventDefault(); if (!operation.job || busy || retryReason.trim().length < 8) return; setBusy(true); setError(''); try { await retry({ jobId: operation.job._id, reason: retryReason.trim() }); setRetryReason('') } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) } }}><label>Reason for trying again (at least 8 characters)<Input value={retryReason} onChange={event => setRetryReason(event.target.value)} minLength={8} maxLength={1000} required disabled={busy} /></label><Button type="submit" disabled={busy || retryReason.trim().length < 8}>Try again</Button></form>}</section>}
      <div className={styles.switch} role="group" aria-label={operationsCopy.finance.chooseFinancialOperation}>
        <Button type="button" disabled={busy} variant={mode === 'payout' ? 'default' : 'outline'} onClick={() => { setMode('payout'); setStep('amount'); setTeamPreview(null); pendingKey.current = null; setError(''); setSaved('') }}>{refundCopy.recordRefund}</Button>
        <Button type="button" disabled={busy} variant={mode === 'transfer' ? 'default' : 'outline'} onClick={() => { setMode('transfer'); setStep('amount'); setTeamPreview(null); pendingKey.current = null; setError(''); setSaved('') }}>{operationsCopy.finance.transferFundraisingCredit}</Button>
        <Button type="button" disabled={busy} variant={mode === 'teamTransfer' ? 'default' : 'outline'} onClick={() => { setMode('teamTransfer'); setStep('amount'); setTeamPreview(null); pendingKey.current = null; setError(''); setSaved('') }}>{operationsCopy.finance.transferFundraisingToTeam}</Button>
      </div>
      {mode !== 'teamTransfer' ? <StepWizard className={styles.form} title={mode === 'payout' ? refundCopy.recordRefund : operationsCopy.finance.transferFundraisingCredit} step={stepIndex + 1} total={wizardSteps.length} heading={mode === 'payout' ? refundCopy.steps.payout[step as keyof typeof refundCopy.steps.payout] : refundCopy.steps.transfer[step as keyof typeof refundCopy.steps.transfer]} nextLabel={step === 'review' ? (busy ? operationsCopy.finance.recording : mode === 'payout' ? refundCopy.recordRefund : operationsCopy.finance.transferFundraisingCredit) : 'Continue'} nextDisabled={options.state !== 'ready' || (step === 'review' && (mode === 'payout' ? options.personalAvailableCents <= 0 : options.fundraisingAvailableCents <= 0))} onNext={nextStep} onBack={stepIndex > 0 ? () => { setError(''); setStep(wizardSteps[stepIndex - 1]) } : undefined} onCancel={resetWizard} busy={busy} error={visibleStepError(error, parsedMoney)}>
        {step === 'amount' && <MoneyInput label={paymentCopy.amount} value={amount} onChange={value => change(setAmount, value)} />}
        {step === 'how' && <div className={styles.fields}>
          <label>{refundCopy.howReturned} <span className={styles.note}>{paymentCopy.required}</span><NativeSelect value={method} onChange={event => { setMethod(event.target.value as 'cash' | 'check' | 'other'); setError(''); pendingKey.current = null }}><NativeSelectOption value="" disabled>{paymentCopy.chooseHow}</NativeSelectOption><NativeSelectOption value="check">{operationsCopy.finance.check}</NativeSelectOption><NativeSelectOption value="cash">{operationsCopy.finance.cash}</NativeSelectOption><NativeSelectOption value="other">{operationsCopy.finance.otherExternalMethod}</NativeSelectOption></NativeSelect></label>
          {method !== '' && <label>{referenceLabel(method)} <span className={styles.note}>{method === 'cash' ? paymentCopy.optional : paymentCopy.required}</span><Input value={reference} maxLength={150} onChange={event => change(setReference, event.target.value)} /></label>}
          <label>{refundCopy.dateReturned} <span className={styles.note}>{paymentCopy.required}</span><Input type="date" value={occurredDate} max={chicagoDate()} onChange={event => change(setOccurredDate, event.target.value)} required /></label>
        </div>}
        {step === 'who' && <label>{operationsCopy.finance.recipientStudent}<NativeSelect value={recipient} onChange={event => change(setRecipient, event.target.value)}><NativeSelectOption value="">{operationsCopy.finance.chooseAnActiveStudent}</NativeSelectOption>{options.recipients.map(student => <NativeSelectOption key={student._id} value={student._id}>{student.name}</NativeSelectOption>)}</NativeSelect></label>}
        {step === 'reason' && <label>{refundCopy.reason} <span className={styles.note}>{paymentCopy.required}</span><Input value={reason} maxLength={500} onChange={event => change(setReason, event.target.value, false)} /></label>}
        {step === 'review' && <>
          <p className="m-0 text-lg font-bold">{parsedMoney.ok ? (mode === 'payout' ? refundCopy.reviewReturned(usd(parsedMoney.cents)) : refundCopy.reviewTransfer(usd(parsedMoney.cents), recipientName || operationsCopy.finance.recipientStudent)) : ''}</p>
          <dl className="m-0">
            <ReviewRow label={paymentCopy.amount} value={parsedMoney.ok ? usd(parsedMoney.cents) : '—'} onEdit={() => setStep('amount')} disabled={busy} />
            {mode === 'payout' ? <ReviewRow label={refundCopy.howReturned} value={[method ? paymentCopy[method] : null, method === 'cash' ? null : reference.trim() || null, occurredDate].filter(Boolean).join(' · ')} onEdit={() => setStep('how')} disabled={busy} /> : <ReviewRow label={refundCopy.steps.transfer.who} value={recipientName} onEdit={() => setStep('who')} disabled={busy} />}
            <ReviewRow label={refundCopy.reason} value={reason.trim()} onEdit={() => setStep('reason')} disabled={busy} />
          </dl>
        </>}
      </StepWizard> : <form className={styles.form} noValidate onSubmit={event => void submit(event)}>
        <fieldset className={styles.fields} disabled={busy || options.state !== 'ready'}>
        <MoneyInput label={paymentCopy.amount} value={amount} onChange={value => change(setAmount, value)} />
        <p className={styles.wide}>{operationsCopy.finance.teamTransferDestination}. {operationsCopy.finance.teamTransferNote}</p>
        <label className={styles.wide}>{refundCopy.reason} <span className={styles.note}>{paymentCopy.required}</span><Input value={reason} minLength={8} maxLength={1000} onChange={event => change(setReason, event.target.value, false)} required /></label>
        <TeamTransferReview preview={teamPreview} current={liveTeamPreview} amountCents={parsedAmount} busy={busy} reasonValid={reason.trim().length >= 8} onReview={() => { setTeamPreview(liveTeamPreview ?? null); pendingKey.current = null }} />
        </fieldset>
      </form>}
      {mode === 'teamTransfer' && error && <p role="alert" className={styles.error}>{error}</p>}
      {saved && <p role="status" className={styles.success}>{receipt?.operation && (receipt.operation.state ?? 'complete') === 'complete' ? receipt.operation.kind === 'payout' ? refundCopy.refundDone : receipt.operation.kind === 'teamTransfer' ? operationsCopy.finance.teamTransferComplete : 'Travel credit transfer recorded. Recipient allocations may still be processing; check the recipient account for readiness.' : saved}</p>}
    </>}
  </section>
}
