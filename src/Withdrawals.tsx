import { userFacingError } from '@/lib/error-message'
import { operationsCopy, operationsText } from './lib/operations-copy'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { ConfirmAction } from './ConfirmAction'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import styles from './features/operations/Operations.module.css'
import { chargeCurrency, parseMoneyInput } from './lib/charge-money'
import { dueAtFromInput, dueDateCopy } from './copy/due-date-copy'
import { chicagoDisplayTime } from './lib/chicago-time'
import { chargeAdministrationCopy } from './lib/charge-administration-copy'
import { EventPicker } from './components/EventPicker'
import { ReviewRow, StepWizard } from './components/StepWizard'

const usd = chargeCurrency
const message = (error:unknown) => userFacingError(error)
const progressLabel = (state:string) => state === 'complete' ? 'Finished' : state === 'failed' ? 'Needs Coach review' : 'In progress'
const key = () => crypto.randomUUID()
const exactCents = (value: string) => {
  if (value.length > 128 || !/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN
  const [whole, fraction = ''] = value.split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : NaN
}

type WithdrawalProgress = FunctionReturnType<typeof api.withdrawals.withdrawalPreview>['progress']
function ProcessingStatus({ progress, canRetry = false, alreadyLeft = false }: { progress: WithdrawalProgress; canRetry?: boolean; alreadyLeft?: boolean }) {
  const retry = useMutation(api.financialOperationsWorker.retry)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!progress) return <p role="status">{alreadyLeft?'Your place has been released. The fee decision is still being finished.':'Your withdrawal is being finished. Your place and room stay the same until it is done.'}</p>
  return <section aria-label="Withdrawal status"><p role="status">Withdrawal: {progressLabel(progress.state)}. Moved to Available funds: {usd(progress.committedCents)} of {usd(progress.totalCents)}. {progress.state !== 'complete' && (alreadyLeft?'Your place has already been released. The remaining fee changes are not finished.':'The rest of the refunds and fee changes are not finished. Your place and room stay the same until it is done.')}</p>{progress.lastError && <p role="alert" className="open-text">{userFacingError(new Error(progress.lastError), 'This stopped before it finished. Check the current status before you try again, or ask a Coach for help.')}</p>}{canRetry && <form className="form-grid" onSubmit={async event => { event.preventDefault(); if (busy || reason.trim().length < 8) return; setBusy(true); setError(''); try { await retry({ jobId: progress.jobId, reason: reason.trim() }); setReason('') } catch (cause) { setError(message(cause)) } finally { setBusy(false) } }}><label>Reason for trying again (at least 8 characters)<Input value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={1000} disabled={busy} required /></label><Button type="submit" disabled={busy || reason.trim().length < 8}>Try again</Button></form>}{error && <p role="alert">{error}</p>}</section>
}

export function StudentWithdrawal({eventId,studentId}:{eventId:Id<'events'>;studentId:Id<'students'>}) {
  const data = useQuery(api.withdrawals.withdrawalPreview,{eventId,studentId})
  const request = useMutation(api.withdrawals.requestWithdrawal)
  const leaveWholeTeam = useMutation(api.withdrawals.leaveWholeTeam)
  const undo = useMutation(api.withdrawals.undoWithdrawal)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  if (!data) return <p>{operationsCopy.withdrawals.loadingWithdrawalStatus}</p>
  if (data.wholeTeamLeft) return <section className={`${styles.root} card`}><p role="status">You have left this event. Your Coach has been told.</p>{data.requestStatus==='pending'&&<p>The fee decision is waiting for Coach review.</p>}{data.requestStatus==='processing'&&<ProcessingStatus progress={data.progress} alreadyLeft/>}</section>
  const undoNow = async () => {setBusy(true);setError('');try{await undo({eventId})}catch(e){setError(message(e))}finally{setBusy(false)}}
  if (data.status === 'withdrawn' && data.withdrawnImmediately && data.canUndo) return <section className={`${styles.root} card`}><p role="status">{operationsText.withdrawals.withdrawnNow(data.eventName)}</p><p>{operationsText.withdrawals.undoHint(chicagoDisplayTime(data.undoUntil))}</p><Button className="button button-outline" disabled={busy} onClick={()=>void undoNow()}>{busy?operationsCopy.withdrawals.undoing:operationsCopy.withdrawals.undoWithdrawal}</Button>{error && <p role="alert" className="open-text">{error}</p>}</section>
  if (data.status === 'withdrawn' && data.withdrawnImmediately && data.undoBlocked) return <section className={`${styles.root} card`}><p role="status">{operationsText.withdrawals.withdrawnNow(data.eventName)}</p><p>{data.undoBlocked}</p></section>
  if (data.status === 'withdrawn') return <p role="status">{data.withdrawnImmediately?operationsText.withdrawals.withdrawnNow(data.eventName):operationsCopy.withdrawals.withdrawalApprovedYourPlaceHasBeenReleased}</p>
  if (data.wholeTeam && data.status === 'confirmed') return <section className={`${styles.root} card`} aria-labelledby="withdraw-title"><h2 id="withdraw-title">Leave this event</h2><p>{operationsText.withdrawals.leaveWholeTeamHint}</p><ConfirmAction title={operationsText.withdrawals.leaveWholeTeamTitle} description={operationsText.withdrawals.leaveWholeTeam(data.eventName)} onConfirm={()=>leaveWholeTeam({eventId})}>Leave this event</ConfirmAction></section>
  if (!data.allowWithdrawal) return null
  return <section className={`${styles.root} card`} aria-labelledby="withdraw-title"><h2 id="withdraw-title">{operationsCopy.withdrawals.withdrawal}</h2>
    {data.requestStatus === 'processing' ? <ProcessingStatus progress={data.progress} /> : data.requestStatus === 'pending' ? <p role="status">{operationsCopy.withdrawals.yourWithdrawalRequestIsAwaitingCoachOrTravelLeadReviewYourParticipationStatusAnd}</p> : data.reviewRequired === false ? <><p>{operationsText.withdrawals.leaveNow(data.eventName)}</p><ConfirmAction title={operationsText.withdrawals.withdrawNowTitle} description={operationsText.withdrawals.confirmLeaveNow(data.eventName,chicagoDisplayTime(data.undoUntil))} onConfirm={()=>request({eventId,idempotencyKey:key()})}>{operationsCopy.withdrawals.withdrawNow}</ConfirmAction></> : <><p>{operationsText.withdrawals.requestToLeave(data.eventName)}</p>{data.coachAssigned && <p>{operationsText.withdrawals.coachAssignedReview}</p>}{data.requestStatus === 'denied' && <p role="status">{operationsCopy.withdrawals.aPreviousRequestWasDeniedYouMaySubmitAnotherRequest}</p>}<ConfirmAction title={operationsText.withdrawals.requestWithdrawalTitle} description={operationsText.withdrawals.requestWithdrawal(data.eventName)} onConfirm={()=>request({eventId,idempotencyKey:key()})}>{operationsCopy.withdrawals.requestWithdrawal}</ConfirmAction></>}
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
  if (data.requestStatus === 'processing') return <section className={`${styles.root} card`}><h2>{data.studentName} · {data.eventName}</h2><ProcessingStatus progress={data.progress} canRetry={data.canRetry} alreadyLeft={data.wholeTeamLeft} /></section>
  if (data.requestStatus !== 'pending' || data.requestId !== requestId) return <section className={`${styles.root} card`}><h2>{data.studentName} · {data.eventName}</h2><p role="status">This request is no longer awaiting review. Reload the queue for its current status.</p></section>
  const paid = data.paidMainCents + data.paidExtraCents
  const parsed = exactCents(partial)
  const returned = choice === 'full' ? paid : choice === 'partial' ? parsed : 0
  const valid = choice !== 'partial' || Number.isSafeInteger(parsed) && parsed > 0 && parsed <= paid
  const submit = async (event:FormEvent) => {event.preventDefault();if (!valid || reason.trim().length < 8) return;setBusy(true);setError('');try{await decide({requestId,decision:choice,...(choice==='partial'?{returnCents:parsed}:{}),cancelUnpaidMain:choice==='deny'?false:cancelMain,reason:reason.trim(),expectedRevision:data.revision})}catch(e){setError(message(e))}finally{setBusy(false)}}
  return <section className={`${styles.root} card`} aria-labelledby={`withdraw-review-${requestId}`}><h2 id={`withdraw-review-${requestId}`}>{data.studentName} · {data.eventName}</h2>
    <p className="muted">{data.wholeTeamLeft?'The student has already left this Whole Team event. This decision covers fees only.':operationsCopy.withdrawals.participationStatusAndAnyReservedRoomPlaceRemainUnchangedWhileThisRequestIsPendi}</p>
    <div className="table-wrap"><table><thead><tr><th>{operationsCopy.withdrawals.charge}</th><th>{operationsCopy.withdrawals.category}</th><th>{operationsCopy.withdrawals.charged}</th><th>{operationsCopy.withdrawals.paid}</th><th>{operationsCopy.withdrawals.unpaid}</th></tr></thead><tbody>{data.charges.map(c=><tr key={c.id}><td data-label={operationsCopy.withdrawals.charge}>{c.label}{(c.adjustedCents!==0||c.cancelledCents>0)&&<p className="muted">{operationsCopy.withdrawals.originalCharge}: {usd(c.originalChargedCents)} · {operationsCopy.withdrawals.adjustment}: {usd(c.adjustedCents)} · {operationsCopy.withdrawals.cancelledObligation}: {usd(c.cancelledCents)}</p>}</td><td data-label={operationsCopy.withdrawals.category}>{c.category==='extra'?operationsCopy.withdrawals.extra:operationsCopy.withdrawals.mainEventTravel}</td><td data-label={operationsCopy.withdrawals.charged}>{usd(c.chargedCents)}</td><td data-label={operationsCopy.withdrawals.paid}>{usd(c.paidCents)}</td><td data-label={operationsCopy.withdrawals.unpaid}>{usd(c.unpaidCents)}</td></tr>)}</tbody></table></div>
    <p>{operationsCopy.withdrawals.paidMain} {usd(data.paidMainCents)}{operationsCopy.withdrawals.paidExtras} {usd(data.paidExtraCents)}{operationsCopy.withdrawals.paidTotal} {usd(paid)}</p>
    <p>{operationsCopy.withdrawals.unpaidMain} {usd(data.unpaidMainCents)}{operationsCopy.withdrawals.paidExtras} {usd(data.unpaidExtraCents)}</p>
    <form onSubmit={e=>void submit(e)} className="form-grid">
      <label>{operationsCopy.withdrawals.decision} <NativeSelect value={choice} onChange={e=>setChoice(e.target.value as typeof choice)}><NativeSelectOption value="full">{operationsCopy.withdrawals.approveReturnAllPaid}</NativeSelectOption><NativeSelectOption value="retain">{operationsCopy.withdrawals.approveRetainPaidAsNonRefundable}</NativeSelectOption><NativeSelectOption value="partial">{operationsCopy.withdrawals.approveReturnAChosenAmount}</NativeSelectOption><NativeSelectOption value="deny">{data.wholeTeamLeft?"Deny fee adjustment":operationsCopy.withdrawals.denyRequest}</NativeSelectOption></NativeSelect></label>
      {choice==='partial' && <label>{operationsCopy.withdrawals.amountToReturn} <Input type="text" inputMode="decimal" value={partial} onChange={e=>setPartial(e.target.value)} required aria-invalid={!valid} placeholder="0.00"/></label>}
      {choice!=='deny' && <label className="checkbox-label"><Checkbox checked={cancelMain} onCheckedChange={checked=>setCancelMain(checked)}/> {operationsCopy.withdrawals.cancelUnpaidMain}</label>}
      {choice!=='deny' && <p role="status">{operationsText.withdrawals.disposition(valid?usd(returned):operationsCopy.withdrawals.enterAValidAmount,valid?usd(paid-returned):'—',usd(data.unpaidExtraCents))}</p>}
      {choice!=='deny' && <p className="muted">{operationsText.withdrawals.unpaidMain(cancelMain?operationsCopy.withdrawals.willBeCanceled:operationsCopy.withdrawals.willRemainOwed)}</p>}
      <label>{operationsCopy.withdrawals.explanation} <Input value={reason} onChange={e=>setReason(e.target.value)} minLength={8} maxLength={1000} required/></label>
      <Button className="button button-primary" type="submit" disabled={busy || !valid || reason.trim().length<8}>{busy?operationsCopy.withdrawals.saving:choice==='deny'?(data.wholeTeamLeft?'Deny fee adjustment':operationsCopy.withdrawals.denyWithdrawal):data.wholeTeamLeft?'Save fee decision':operationsCopy.withdrawals.approveWithdrawal}</Button>
      {error && <p role="alert" className="open-text">{error}</p>}
    </form>
  </section>
}

export function WholeTeamLeaveNotices({eventId,coach=false}:{eventId?:Id<'events'>;coach?:boolean}) {
  const notices=useQuery(api.withdrawals.wholeTeamLeaveNotices,eventId?{eventId}:{})
  const dismiss=useMutation(api.withdrawals.dismissWholeTeamLeaveNotice)
  const [busy,setBusy]=useState<Id<'wholeTeamLeaveNotices'>|null>(null)
  const [error,setError]=useState('')
  if(!notices)return <section className="card"><h2>Left Whole Team events</h2><p>Loading notices…</p></section>
  return <section className={`${styles.root} card`} aria-label="Left Whole Team events"><h2>Left Whole Team events</h2>{notices.length===0?<p>No unread Whole Team leave notices.</p>:<div className="simple-list">{notices.map(notice=><div className="split-line" key={notice.noticeId}><span><strong>{notice.studentName}</strong> left {notice.eventName} on {new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium'}).format(notice.leftAt)}.</span>{coach&&<Button type="button" variant="outline" disabled={busy!==null} onClick={()=>{setBusy(notice.noticeId);setError('');void dismiss({noticeId:notice.noticeId}).catch(cause=>setError(message(cause))).finally(()=>setBusy(null))}}>Dismiss</Button>}</div>)}</div>}{error&&<p role="alert" className="open-text">{error}</p>}</section>
}

export function WithdrawalQueue({coach=false}:{coach?:boolean}) {
  const queue = useQuery(api.withdrawals.pendingWithdrawals,{})
  if (!queue) return <section className="card"><h2>{operationsCopy.withdrawals.pendingReview}</h2><p>{operationsCopy.withdrawals.loadingRequests}</p></section>
  return <><WholeTeamLeaveNotices coach={coach}/><section className={`${styles.root} ${styles.queue}`} aria-labelledby="withdraw-queue-title"><h2 id="withdraw-queue-title">{operationsText.withdrawals.pendingReview(queue.length)}</h2>{queue.length===0?<p className={styles.notice}>{operationsCopy.withdrawals.noRequestsAreWaiting}</p>:<div className="two-col">{queue.map(row=><Review key={row.requestId} {...row}/>)}</div>}</section></>
}

type FeeStep='what'|'amount'|'review'
const feeSteps:FeeStep[]=['what','amount','review']

export function ChargeEditor({studentId}:{studentId:Id<'students'>}) {
  const text=chargeAdministrationCopy.addFee
  const events=useQuery(api.app.listEvents,{})
  const create=useMutation(api.finance.createCharge)
  const [stepIndex,setStepIndex]=useState(0)
  const [backToReview,setBackToReview]=useState(false)
  const [pickingEvent,setPickingEvent]=useState(false)
  const [eventId,setEventId]=useState<string|null>(null)
  const [category,setCategory]=useState<'main'|'extra'>('extra')
  const [label,setLabel]=useState('')
  const [amount,setAmount]=useState('')
  const [priority,setPriority]=useState('')
  const [dueDate,setDueDate]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [saved,setSaved]=useState(false)
  const [clock]=useState(()=>Date.now())
  const pending=useRef<{key:string|null;busy:boolean}>({key:null,busy:false})
  const changed=()=>{pending.current.key=null;setError('')}
  const step=feeSteps[stepIndex]
  const last=stepIndex===feeSteps.length-1
  const money=parseMoneyInput(amount)
  const cents=money.ok?money.cents:null
  const priorityNumber=priority.trim()===''?undefined:Number(priority)
  const priorityInvalid=priorityNumber!==undefined&&!Number.isSafeInteger(priorityNumber)
  const dueAt=dueAtFromInput(dueDate)
  const dueInvalid=Number.isNaN(dueAt)
  const pickerEvents=(events??[]).map(row=>({_id:row.event._id as string,name:row.event.name,startsAt:row.event.startsAt,endsAt:row.event.endsAt}))
  const eventName=pickerEvents.find(event=>event._id===eventId)?.name
  const ready:Record<FeeStep,boolean>={
    what:label.trim().length>0&&!(pickingEvent&&!eventId),
    amount:cents!==null&&!priorityInvalid&&!dueInvalid,
    review:label.trim().length>0&&cents!==null&&!priorityInvalid&&!dueInvalid&&!(pickingEvent&&!eventId),
  }
  const submit=async()=>{
    if(!ready.review||cents===null||pending.current.busy)return
    const idempotencyKey=pending.current.key??key()
    pending.current.key=idempotencyKey;pending.current.busy=true;setBusy(true);setError('')
    try{
      await create({studentId,...(eventId?{eventId:eventId as Id<'events'>,category}:{}),label:label.trim(),amountCents:cents,...(priorityNumber!==undefined?{priority:priorityNumber}:{}),...(dueAt!==null?{dueAt}:{}),idempotencyKey})
      pending.current.key=null;setSaved(true)
    }catch(e){setError(message(e))}
    finally{pending.current.busy=false;setBusy(false)}
  }
  const reset=()=>{pending.current.key=null;setSaved(false);setStepIndex(0);setBackToReview(false);setPickingEvent(false);setEventId(null);setCategory('extra');setLabel('');setAmount('');setPriority('');setDueDate('');setError('')}
  const goTo=(target:FeeStep)=>{setError('');setBackToReview(true);setStepIndex(feeSteps.indexOf(target))}
  const next=()=>{
    if(last){void submit();return}
    setError('')
    setStepIndex(backToReview?feeSteps.length-1:stepIndex+1)
    setBackToReview(false)
  }
  const back=stepIndex>0?()=>{setError('');setBackToReview(false);setStepIndex(stepIndex-1)}:undefined
  const amountProblem=amount.trim()!==''&&!money.ok?money.message:null
  if(saved)return <section className={`${styles.root} card`} aria-labelledby="charge-editor-title"><h2 id="charge-editor-title">{text.title}</h2><p role="status">{text.added}</p><Button type="button" variant="outline" onClick={reset}>{text.another}</Button></section>
  const content=(()=>{
    switch(step){
      case 'what':return <>
        <div role="group" aria-label={text.event} className="flex flex-wrap gap-2">
          <Button type="button" variant={!pickingEvent?'default':'outline'} aria-pressed={!pickingEvent} disabled={busy} onClick={()=>{changed();setPickingEvent(false);setEventId(null)}}>{text.notForEvent}</Button>
          <Button type="button" variant={pickingEvent?'default':'outline'} aria-pressed={pickingEvent} disabled={busy} onClick={()=>{changed();setPickingEvent(true)}}>{text.forEvent}</Button>
        </div>
        {pickingEvent&&(events===undefined?<p role="status">{chargeAdministrationCopy.addFee.loadingEvents}</p>:<EventPicker events={pickerEvents} value={eventId} onChange={id=>{changed();setEventId(id)}} asOf={clock} label={text.chooseEvent}/>)}
        {pickingEvent&&!eventId&&<p className="muted">{text.chooseEventFirst}</p>}
        {eventId&&<div role="group" aria-label={text.kind} className="flex flex-wrap gap-2">
          <Button type="button" variant={category==='main'?'default':'outline'} aria-pressed={category==='main'} disabled={busy} onClick={()=>{changed();setCategory('main')}}>{text.main}</Button>
          <Button type="button" variant={category==='extra'?'default':'outline'} aria-pressed={category==='extra'} disabled={busy} onClick={()=>{changed();setCategory('extra')}}>{text.extra}</Button>
        </div>}
        <label>{text.name} <Input value={label} disabled={busy} maxLength={150} onChange={e=>{changed();setLabel(e.target.value)}} required placeholder={text.namePlaceholder}/></label>
      </>
      case 'amount':return <>
        <label>{text.amount} <Input type="text" inputMode="decimal" value={amount} disabled={busy} onChange={e=>{changed();setAmount(e.target.value)}} required placeholder="0.00" aria-invalid={!!amountProblem} aria-describedby="add-fee-amount-hint"/></label>
        <p id="add-fee-amount-hint" role={amountProblem?'alert':undefined} className={amountProblem?undefined:'muted'}>{amountProblem??text.amountExample}</p>
        <label>{dueDateCopy.label} <Input type="date" value={dueDate} disabled={busy} aria-invalid={dueInvalid} onChange={e=>{changed();setDueDate(e.target.value)}}/></label>
        {dueInvalid&&<p role="alert">{dueDateCopy.invalid}</p>}
        <details><summary className="min-h-11 cursor-pointer font-bold">{text.order}</summary>
          <label>{text.order} <Input type="number" step="1" value={priority} disabled={busy} aria-invalid={priorityInvalid} aria-describedby="add-fee-order-help" onChange={e=>{changed();setPriority(e.target.value)}}/></label>
          <p id="add-fee-order-help" className="muted">{text.orderHelp}</p>
          {priorityInvalid&&<p role="alert">{text.orderInvalid}</p>}
        </details>
      </>
      case 'review':return <dl className="m-0 grid">
        <ReviewRow label={text.event} value={eventName??text.standalone} onEdit={()=>goTo('what')} disabled={busy}/>
        {eventId&&<ReviewRow label={text.kind} value={category==='main'?text.main:text.extra} onEdit={()=>goTo('what')} disabled={busy}/>}
        <ReviewRow label={text.name} value={label.trim()} onEdit={()=>goTo('what')} disabled={busy}/>
        <ReviewRow label={text.amount} value={cents===null?'—':usd(cents)} onEdit={()=>goTo('amount')} disabled={busy}/>
        <ReviewRow label={dueDateCopy.heading} value={dueAt!==null&&!dueInvalid?dueDateCopy.full(dueAt):text.noDue} onEdit={()=>goTo('amount')} disabled={busy}/>
      </dl>
    }
  })()
  return <section className={`${styles.root} card`} aria-labelledby="charge-editor-title"><h2 id="charge-editor-title">{text.title}</h2><p>{text.intro}</p>
    <StepWizard title={text.title} step={stepIndex+1} total={feeSteps.length} heading={text.steps[step]} nextLabel={last?(busy?text.adding:text.add):text.next} nextDisabled={!ready[step]} onNext={next} onBack={back} busy={busy} error={error}
      onCancel={reset}>{content}</StepWizard>
  </section>
}
