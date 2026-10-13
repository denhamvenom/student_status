import { operationsCopy, operationsText } from './lib/operations-copy'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import styles from './features/operations/Operations.module.css'

const usd = (cents:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
const message = (error:unknown) => error instanceof Error ? error.message : String(error)
const key = () => crypto.randomUUID()
const exactCents = (value: string) => {
  if (value.length > 128 || !/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN
  const [whole, fraction = ''] = value.split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : NaN
}

type WithdrawalProgress = FunctionReturnType<typeof api.withdrawals.withdrawalPreview>['progress']
function ProcessingStatus({ progress, canRetry = false }: { progress: WithdrawalProgress; canRetry?: boolean }) {
  const retry = useMutation(api.financialOperationsWorker.retry)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!progress) return <p role="status">Withdrawal processing is underway. Participation and room placement remain unchanged until all work finishes.</p>
  return <section aria-label="Withdrawal processing status"><p role="status">Withdrawal processing: {progress.state}. Returned to travel accounts: {usd(progress.committedCents)} of {usd(progress.totalCents)}. {progress.state !== 'complete' && 'Remaining returns and charge changes are not complete. Participation and room placement remain unchanged until all work finishes.'}</p>{progress.lastError && <p role="alert" className="open-text">{progress.lastError}</p>}{canRetry && <form className="form-grid" onSubmit={async event => { event.preventDefault(); if (busy || reason.trim().length < 8) return; setBusy(true); setError(''); try { await retry({ jobId: progress.jobId, reason: reason.trim() }); setReason('') } catch (cause) { setError(message(cause)) } finally { setBusy(false) } }}><label>Reason for retry<Input value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={1000} disabled={busy} required /></label><Button disabled={busy || reason.trim().length < 8}>Retry remaining withdrawal work</Button></form>}{error && <p role="alert">{error}</p>}</section>
}

export function StudentWithdrawal({eventId,studentId}:{eventId:Id<'events'>;studentId:Id<'students'>}) {
  const data = useQuery(api.withdrawals.withdrawalPreview,{eventId,studentId})
  const request = useMutation(api.withdrawals.requestWithdrawal)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const submit = async () => {setBusy(true);setError('');try{await request({eventId,idempotencyKey:key()})}catch(e){setError(message(e))}finally{setBusy(false)}}
  if (!data) return <p>{operationsCopy.withdrawals.loadingWithdrawalStatus}</p>
  if (data.status === 'withdrawn') return <p role="status">{operationsCopy.withdrawals.withdrawalApprovedYourPlaceHasBeenReleased}</p>
  if (!data.allowWithdrawal) return null
  return <section className={`${styles.root} card`} aria-labelledby="withdraw-title"><h2 id="withdraw-title">{operationsCopy.withdrawals.withdrawal}</h2>
    {data.requestStatus === 'processing' ? <ProcessingStatus progress={data.progress} /> : data.requestStatus === 'pending' ? <p role="status">{operationsCopy.withdrawals.yourWithdrawalRequestIsAwaitingCoachOrTravelLeadReviewYourParticipationStatusAnd}</p> : <><p>{operationsText.withdrawals.requestToLeave(data.eventName)}</p>{data.requestStatus === 'denied' && <p role="status">{operationsCopy.withdrawals.aPreviousRequestWasDeniedYouMaySubmitAnotherRequest}</p>}<Button className="button button-outline" disabled={busy} onClick={()=>void submit()}>{busy?operationsCopy.withdrawals.submitting:operationsCopy.withdrawals.requestWithdrawal}</Button></>}
    {error && <p role="alert" className="open-text">{error}</p>}
  </section>
}

function Review({requestId,eventId,studentId}:{requestId:Id<'withdrawalRequests'>;eventId:Id<'events'>;studentId:Id<'students'>}) {
  const data = useQuery(api.withdrawals.withdrawalPreview,{eventId,studentId})
  const decide = useMutation(api.withdrawals.reviewWithdrawal)
  const [choice,setChoice] = useState<'full'|'retain'|'partial'|'deny'>('full')
  const [partial,setPartial] = useState('')
  const [cancelMain,setCancelMain] = useState(false)
  const [reason,setReason] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  if (!data) return <section className="card"><p>{operationsCopy.withdrawals.loadingWithdrawalReview}</p></section>
  if (data.requestStatus === 'processing') return <section className={`${styles.root} card`}><h2>{data.studentName} · {data.eventName}</h2><ProcessingStatus progress={data.progress} canRetry={data.canRetry} /></section>
  if (data.requestStatus !== 'pending' || data.requestId !== requestId) return <section className={`${styles.root} card`}><h2>{data.studentName} · {data.eventName}</h2><p role="status">This request is no longer awaiting review. Reload the queue for its current status.</p></section>
  const paid = data.paidMainCents + data.paidExtraCents
  const parsed = exactCents(partial)
  const returned = choice === 'full' ? paid : choice === 'partial' ? parsed : 0
  const valid = choice !== 'partial' || Number.isSafeInteger(parsed) && parsed > 0 && parsed <= paid
  const submit = async (event:FormEvent) => {event.preventDefault();if (!valid || reason.trim().length < 8) return;setBusy(true);setError('');try{await decide({requestId,decision:choice,...(choice==='partial'?{returnCents:parsed}:{}),cancelUnpaidMain:choice==='deny'?false:cancelMain,reason:reason.trim(),expectedRevision:data.revision})}catch(e){setError(message(e))}finally{setBusy(false)}}
  return <section className={`${styles.root} card`} aria-labelledby={`withdraw-review-${requestId}`}><h2 id={`withdraw-review-${requestId}`}>{data.studentName} · {data.eventName}</h2>
    <p className="muted">{operationsCopy.withdrawals.participationStatusAndAnyReservedRoomPlaceRemainUnchangedWhileThisRequestIsPendi}</p>
    <div className="table-wrap"><table><thead><tr><th>{operationsCopy.withdrawals.charge}</th><th>{operationsCopy.withdrawals.category}</th><th>{operationsCopy.withdrawals.charged}</th><th>{operationsCopy.withdrawals.paid}</th><th>{operationsCopy.withdrawals.unpaid}</th></tr></thead><tbody>{data.charges.map(c=><tr key={c.id}><td data-label={operationsCopy.withdrawals.charge}>{c.label}</td><td data-label={operationsCopy.withdrawals.category}>{c.category==='extra'?operationsCopy.withdrawals.extra:operationsCopy.withdrawals.mainEventTravel}</td><td data-label={operationsCopy.withdrawals.charged}>{usd(c.chargedCents)}</td><td data-label={operationsCopy.withdrawals.paid}>{usd(c.paidCents)}</td><td data-label={operationsCopy.withdrawals.unpaid}>{usd(c.unpaidCents)}</td></tr>)}</tbody></table></div>
    <p>{operationsCopy.withdrawals.paidMain} {usd(data.paidMainCents)}{operationsCopy.withdrawals.paidExtras} {usd(data.paidExtraCents)}{operationsCopy.withdrawals.paidTotal} {usd(paid)}</p>
    <p>{operationsCopy.withdrawals.unpaidMain} {usd(data.unpaidMainCents)}{operationsCopy.withdrawals.paidExtras} {usd(data.unpaidExtraCents)}</p>
    <form onSubmit={e=>void submit(e)} className="form-grid">
      <label>{operationsCopy.withdrawals.decision} <NativeSelect value={choice} onChange={e=>setChoice(e.target.value as typeof choice)}><NativeSelectOption value="full">{operationsCopy.withdrawals.approveReturnAllPaid}</NativeSelectOption><NativeSelectOption value="retain">{operationsCopy.withdrawals.approveRetainPaidAsNonRefundable}</NativeSelectOption><NativeSelectOption value="partial">{operationsCopy.withdrawals.approveReturnAChosenAmount}</NativeSelectOption><NativeSelectOption value="deny">{operationsCopy.withdrawals.denyRequest}</NativeSelectOption></NativeSelect></label>
      {choice==='partial' && <label>{operationsCopy.withdrawals.amountToReturn} <Input type="text" inputMode="decimal" value={partial} onChange={e=>setPartial(e.target.value)} required aria-invalid={!valid} placeholder="0.00"/></label>}
      {choice!=='deny' && <label className="checkbox-label"><Checkbox checked={cancelMain} onCheckedChange={checked=>setCancelMain(checked)}/> {operationsCopy.withdrawals.cancelUnpaidMain}</label>}
      {choice!=='deny' && <p role="status">{operationsText.withdrawals.disposition(valid?usd(returned):operationsCopy.withdrawals.enterAValidAmount,valid?usd(paid-returned):'—',usd(data.unpaidExtraCents))}</p>}
      {choice!=='deny' && <p className="muted">{operationsText.withdrawals.unpaidMain(cancelMain?operationsCopy.withdrawals.willBeCanceled:operationsCopy.withdrawals.willRemainOwed)}</p>}
      <label>{operationsCopy.withdrawals.explanation} <Input value={reason} onChange={e=>setReason(e.target.value)} minLength={8} maxLength={1000} required/></label>
      <Button className="button button-primary" type="submit" disabled={busy || !valid || reason.trim().length<8}>{busy?operationsCopy.withdrawals.saving:choice==='deny'?operationsCopy.withdrawals.denyWithdrawal:operationsCopy.withdrawals.approveWithdrawal}</Button>
      {error && <p role="alert" className="open-text">{error}</p>}
    </form>
  </section>
}

export function WithdrawalQueue() {
  const queue = useQuery(api.withdrawals.pendingWithdrawals,{})
  if (!queue) return <section className="card"><h2>{operationsCopy.withdrawals.pendingReview}</h2><p>{operationsCopy.withdrawals.loadingRequests}</p></section>
  return <section className={`${styles.root} ${styles.queue}`} aria-labelledby="withdraw-queue-title"><h2 id="withdraw-queue-title">{operationsText.withdrawals.pendingReview(queue.length)}</h2>{queue.length===0?<p className={styles.notice}>{operationsCopy.withdrawals.noRequestsAreWaiting}</p>:<div className="two-col">{queue.map(row=><Review key={row.requestId} {...row}/>)}</div>}</section>
}

export function ChargeEditor({studentId}:{studentId:Id<'students'>}) {
  const events = useQuery(api.app.listEvents,{})
  const create = useMutation(api.finance.createCharge)
  const [eventId,setEventId] = useState('')
  const [category,setCategory] = useState<'main'|'extra'>('extra')
  const [label,setLabel] = useState('')
  const [amount,setAmount] = useState('')
  const [priority,setPriority] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [saved,setSaved] = useState(false)
  const pending = useRef<{key:string|null;busy:boolean}>({key:null,busy:false})
  const changed = () => {pending.current.key=null;setError('');setSaved(false)}
  const cents = exactCents(amount)
  const priorityNumber = Number(priority)
  const valid = label.trim().length>0 && Number.isSafeInteger(cents) && cents>0 && Number.isSafeInteger(priorityNumber) && priority.trim()!==''
  const submit = async (event:FormEvent) => {event.preventDefault();if(!valid||pending.current.busy)return;const idempotencyKey=pending.current.key??key();pending.current.key=idempotencyKey;pending.current.busy=true;setBusy(true);setError('');setSaved(false);try{await create({studentId,...(eventId?{eventId:eventId as Id<'events'>,category}:{}),label:label.trim(),amountCents:cents,priority:priorityNumber,idempotencyKey});pending.current.key=null;setLabel('');setAmount('');setSaved(true)}catch(e){setError(message(e))}finally{pending.current.busy=false;setBusy(false)}}
  return <section className={`${styles.root} card`} aria-labelledby="charge-editor-title"><h2 id="charge-editor-title">{operationsCopy.withdrawals.addACharge}</h2><p>{operationsCopy.withdrawals.classifyEventChargesAsTheMainEventTravelFeeOrAnExtraSuchAsLunchOutstandingCredit}</p><form className="form-grid" onSubmit={e=>void submit(e)}>
    <label>{operationsCopy.withdrawals.eventLabel} <NativeSelect value={eventId} disabled={busy} onChange={e=>{changed();setEventId(e.target.value)}}><NativeSelectOption value="">{operationsCopy.withdrawals.standaloneCharge}</NativeSelectOption>{events?.map(row=><NativeSelectOption key={row.event._id} value={row.event._id}>{row.event.name}</NativeSelectOption>)}</NativeSelect></label>
    {eventId && <label>{operationsCopy.withdrawals.feeCategory} <NativeSelect value={category} disabled={busy} onChange={e=>{changed();setCategory(e.target.value as typeof category)}}><NativeSelectOption value="main">{operationsCopy.withdrawals.mainEventTravel}</NativeSelectOption><NativeSelectOption value="extra">{operationsCopy.withdrawals.extra}</NativeSelectOption></NativeSelect></label>}
    <label>{operationsCopy.withdrawals.chargeLabel} <Input value={label} disabled={busy} maxLength={150} onChange={e=>{changed();setLabel(e.target.value)}} required placeholder={operationsCopy.withdrawals.lunch}/></label>
    <label>{operationsCopy.withdrawals.amountUsd} <Input type="text" inputMode="decimal" value={amount} disabled={busy} onChange={e=>{changed();setAmount(e.target.value)}} required placeholder="0.00"/></label>
    <label>{operationsCopy.withdrawals.priority} <Input type="number" step="1" value={priority} disabled={busy} onChange={e=>{changed();setPriority(e.target.value)}} required/></label>
    <Button className="button button-primary" type="submit" disabled={busy||!valid}>{busy?operationsCopy.withdrawals.saving:operationsCopy.withdrawals.addCharge}</Button>
    {saved && <p role="status">{operationsCopy.withdrawals.chargeRecorded}</p>}{error && <p role="alert" className="open-text">{error}</p>}
  </form></section>
}
