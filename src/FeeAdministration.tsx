import { userFacingError } from '@/lib/error-message'
import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import type { Doc, Id } from '../convex/_generated/dataModel'
import { Input } from './components/ui/input'
import { Component, Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useConvex, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { chargeCurrency, parseMoneyInput } from './lib/charge-money'
import { EventPicker, type PickerEvent } from './components/EventPicker'
import { ReviewRow, StepWizard } from './components/StepWizard'
import { feeAdministrationCopy as copy } from './lib/fee-administration-copy'
import styles from './FeeAdministration.module.css'
import { dueAtFromInput, dueDateCopy, dueDateInput } from './copy/due-date-copy'

/** canSetDueDates: a Coach, or a Travel Lead with Money editing (the same rule as feeDefinitions.setDueAt). */
export default function FeeAdministration({ isCoach, canSetDueDates = isCoach }: { isCoach: boolean; canSetDueDates?: boolean }) {
  const [attempt, setAttempt] = useState(0)
  return <FeeQueryBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}><FeeWorkspace isCoach={isCoach} canSetDueDates={canSetDueDates} /></FeeQueryBoundary>
}

class FeeQueryBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() {
    if (this.state.error !== null) return <Card className={styles.card}><p role="alert">{userFacingError(this.state.error, copy.unavailable, false)}</p><Button type="button" variant="outline" onClick={this.props.onRetry}>{copy.reload}</Button></Card>
    return this.props.children
  }
}

function FeeWorkspace({ isCoach, canSetDueDates }: { isCoach: boolean; canSetDueDates: boolean }) {
  const maintenance = useQuery(api.feePriorities.maintenance, {})
  const fees = usePaginatedQuery(api.feePriorities.list, {}, { initialNumItems: 20 })
  const move = useMutation(api.feePriorities.move)
  const [review, setReview] = useState<{ definition: Doc<'feeDefinitions'>; eventName: string | null; direction: 'up' | 'down'; orderRevision: number } | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<Id<'feePriorityJobs'> | null>(null)
  const [mappingJobId, setMappingJobId] = useState<Id<'feeMappingJobs'> | null>(null)
  const [bulkJobId, setBulkJobId] = useState<Id<'feeBulkJobs'> | null>(null)
  const [dismissedBulkJobId, setDismissedBulkJobId] = useState<Id<'feeBulkJobs'> | null>(null)
  function openBulkJob(id: Id<'feeBulkJobs'>) { setDismissedBulkJobId(null); setBulkJobId(id) }
  const [bulkDraft, setBulkDraft] = useState<{kind:'create'|'edit'|'cancel';definition?:Doc<'feeDefinitions'>}|null>(null)
  const [dueDateFeeId, setDueDateFeeId] = useState<Id<'feeDefinitions'> | null>(null)
  const submittedIntent = useRef<{ fingerprint: string; key: string } | null>(null)
  const visibleJobId = jobId ?? maintenance?.control?.priorityJobId
  const visibleMappingJobId = mappingJobId ?? maintenance?.control?.mappingJobId
  const automaticBulkJobId = maintenance?.control?.bulkJobId
  const visibleBulkJobId = bulkJobId ?? (automaticBulkJobId !== dismissedBulkJobId ? automaticBulkJobId : null)
  const liveDefinition = review ? fees.results.find(row => row.definition._id === review.definition._id) : null
  const fresh = !!review && maintenance?.canMove === true && maintenance.control?.revision === review.orderRevision && liveDefinition?.definition.revision === review.definition.revision && (review.direction === 'up' ? liveDefinition.canMoveUp : liveDefinition.canMoveDown)
  function open(definition: Doc<'feeDefinitions'>, eventName: string | null, direction: 'up' | 'down') {
    if (!maintenance?.control || !maintenance.canMove) return
    setReview({ definition, eventName, direction, orderRevision: maintenance.control.revision }); setReason(''); setError(null)
  }
  async function submit() {
    if (!review || !fresh || pending || reason.trim().length < 8) return
    setPending(true); setError(null)
    try {
      const fingerprint = JSON.stringify([review.definition._id, review.direction, review.orderRevision, review.definition.revision, reason.trim()])
      if (submittedIntent.current?.fingerprint !== fingerprint) submittedIntent.current = { fingerprint, key: crypto.randomUUID() }
      const id = await move({ feeDefinitionId: review.definition._id, direction: review.direction, expectedOrderRevision: review.orderRevision, expectedDefinitionRevision: review.definition.revision, reason: reason.trim(), idempotencyKey: submittedIntent.current.key })
      setJobId(id); setReview(null)
    } catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { setPending(false) }
  }
  return <div className={styles.root}>
    {maintenance?.control && <FeeMaintenanceNotice state={maintenance.control.state} />}
    <Card className={styles.card}><CardTitle>{copy.title}</CardTitle><p className={styles.muted}>{copy.description} {copy.futureOnly}</p>
      {!maintenance || fees.status === 'LoadingFirstPage' ? <p role="status">{copy.loading}</p> : <>
        {maintenance.mappingState !== 'ready' && <p className={styles.notice}>{maintenance.mappingState === 'uninitialized' ? (isCoach && maintenance.canMap ? copy.mappingUnknown : copy.mappingUnknownViewOnly) : copy.partialOrder}</p>}
        {fees.results.length === 0 && fees.status === 'Exhausted' && <p>{copy.noFees}</p>}
        <FeePriorityRows disabled={pending || maintenance.control?.state !== 'ready'} rows={fees.results.map(row => ({ key: row.definition._id, label: row.definition.label, summary: row.eventName ? `${copy.connectedTo}: ${row.eventName}` : undefined, priority: row.definition.priority, amountCents: row.definition.defaultAmountCents, dueAt: row.definition.dueAt, addedAt: row.definition._creationTime, cancelled: row.definition.state === 'cancelled',
          below: dueDateFeeId === row.definition._id && row.definition.state === 'active' ? <FeeDueDate key={row.definition._id} definition={row.definition} onClose={() => setDueDateFeeId(null)} /> : undefined,
          actions: {
          dueDate: canSetDueDates && row.definition.state === 'active' ? () => setDueDateFeeId(id => id === row.definition._id ? null : row.definition._id) : undefined,
          dueDateOpen: dueDateFeeId === row.definition._id,
          view: row.definition.latestJobId ? ()=>{if(row.definition.latestJobId)openBulkJob(row.definition.latestJobId)} : undefined,
          up: row.canMoveUp ? () => open(row.definition, row.eventName, 'up') : undefined,
          down: row.canMoveDown ? () => open(row.definition, row.eventName, 'down') : undefined,
          edit: isCoach && row.canEdit ? () => setBulkDraft({kind:'edit',definition:row.definition}) : undefined,
          cancel: isCoach && row.canCancel ? () => setBulkDraft({kind:'cancel',definition:row.definition}) : undefined,
        } }))} />
        {isCoach && maintenance.canManageFees && maintenance.mappingState === 'ready' && <Button type="button" onClick={()=>setBulkDraft({kind:'create'})}>{copy.add}</Button>}
        {fees.status !== 'Exhausted' && <Button type="button" variant="outline" disabled={fees.status !== 'CanLoadMore'} onClick={() => fees.loadMore(20)}>{copy.moreFees}</Button>}
      </>}
      {review && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}><strong>{review.definition.label}{review.eventName ? ` · ${review.eventName}` : ''} · {review.direction === 'up' ? copy.up : copy.down}</strong><p>{copy.futureOnly}</p>
        {!fresh && <p role="alert">{copy.staleReview}</p>}
        <label className={styles.field}>{copy.moveReason}<Input value={reason} required maxLength={1000} disabled={pending} onChange={event => setReason(event.target.value)} /></label>
        <Button type="submit" disabled={pending || !fresh || reason.trim().length < 8}>{pending ? copy.submitting : copy.moveConfirm}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setReview(null)}>{copy.dismiss}</Button>
      </form>}
      {error && <p role="alert">{error}</p>}
    </Card>
    {visibleJobId && <LivePriorityReceipt key={visibleJobId} jobId={visibleJobId} />}
    {isCoach && maintenance?.canMap && maintenance.mappingState === 'uninitialized' && <PrepareFeeMapping onJob={setMappingJobId} />}
    {isCoach && maintenance?.canMap && maintenance.mappingState === 'reviewRequired' && <MapHistoricalFees control={maintenance.control} definitions={fees.results.map(row => row.definition)} moreDefinitions={fees.status === 'CanLoadMore'} loadDefinitions={() => fees.loadMore(20)} onJob={setMappingJobId} />}
    {isCoach && visibleMappingJobId && <LiveMappingReceipt key={visibleMappingJobId} jobId={visibleMappingJobId} />}
    {isCoach && bulkDraft && <BulkPreparationForm key={`${bulkDraft.kind}:${bulkDraft.definition?._id??'new'}`} {...bulkDraft} disabled={!maintenance?.canManageFees} onDismiss={()=>setBulkDraft(null)} onJob={id=>{openBulkJob(id);setBulkDraft(null)}} />}
    {visibleBulkJobId && <BulkJobWorkspace key={visibleBulkJobId} jobId={visibleBulkJobId} isCoach={isCoach} onSelect={openBulkJob} onClose={()=>{setDismissedBulkJobId(automaticBulkJobId ?? visibleBulkJobId);setBulkJobId(null)}}/>}
  </div>
}

type UnmappedRow = FunctionReturnType<typeof api.feeDefinitions.unmapped>['page'][number]
export function shouldLoadStudentChoices(kind:'create'|'edit'|'cancel',scope:'allActive'|'selected',existingScope:boolean,eventId:Id<'events'>|null,status:string){
  return kind!=='cancel'&&!existingScope&&scope==='selected'&&!eventId&&status==='CanLoadMore'
}

type FeeStep='fee'|'due'|'who'|'reason'|'review'
const feeSteps=(kind:'create'|'edit'|'cancel'):FeeStep[]=>kind==='create'?['fee','due','who','reason','review']:kind==='edit'?['fee','due','reason','review']:['reason','review']

function BulkPreparationForm({ kind, definition, disabled, onDismiss, onJob }: {
  kind:'create'|'edit'|'cancel'
  definition?:Doc<'feeDefinitions'>
  disabled:boolean
  onDismiss:()=>void
  onJob:(id:Id<'feeBulkJobs'>)=>void
}) {
  const wizard=copy.wizard
  const prepare=useMutation(api.feeDefinitions.prepareBulk)
  const setDueAt=useMutation(api.feeDefinitions.setDueAt)
  const client=useConvex()
  const latest=useQuery(api.feeDefinitions.bulkStatus,definition?.latestJobId?{jobId:definition.latestJobId}:'skip')
  const events=usePaginatedQuery(api.feeDefinitions.events,{}, {initialNumItems:20})
  const students=usePaginatedQuery(api.feeDefinitions.students,{}, {initialNumItems:20})
  const [label,setLabel]=useState(definition?.label??'')
  const [amount,setAmount]=useState(definition?`${BigInt(definition.defaultAmountCents)/100n}.${String(BigInt(definition.defaultAmountCents)%100n).padStart(2,'0')}`:'')
  const [reason,setReason]=useState('')
  const savedDueDate=dueDateInput(definition?.dueAt)
  const [dueDate,setDueDate]=useState(savedDueDate)
  const [dueStatus,setDueStatus]=useState('')
  // Set once the fee change is prepared, so a failed due-date save retries only the due date.
  const prepared=useRef<{jobId:Id<'feeBulkJobs'>;feeDefinitionId:Id<'feeDefinitions'>}|null>(null)
  const [scope,setScope]=useState<'allActive'|'selected'>('allActive')
  const existingScope=kind!=='create'
  const [eventId,setEventId]=useState<Id<'events'>|null>(definition?.eventId??null)
  const [pickingEvent,setPickingEvent]=useState(false)
  const [studentIds,setStudentIds]=useState<ReadonlyArray<Id<'students'>>>([])
  const [pending,setPending]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [reviewedPrior,setReviewedPrior]=useState<{jobId:Id<'feeBulkJobs'>;held:number}|null>(null)
  const [stepIndex,setStepIndex]=useState(0)
  const [backToReview,setBackToReview]=useState(false)
  const intent=useRef<{fingerprint:string;key:string}|null>(null)
  const steps=feeSteps(kind)
  const step=steps[stepIndex]
  const money=kind==='cancel'?null:parseMoneyInput(amount,{allowZero:kind==='edit'})
  const cents=kind==='cancel'?0:money?.ok?money.cents:null
  const effectiveScope=existingScope?'existingCharges':eventId?'confirmedEvent':scope
  const scopeValid=(effectiveScope!=='selected'||studentIds.length>0)&&!(pickingEvent&&!eventId)
  const priorReady=(!definition?.latestJobId||!!latest)&&(kind!=='cancel'||latest?.job.state!=='held'||reviewedPrior?.jobId===latest.job._id&&reviewedPrior.held===latest.job.held)
  useEffect(()=>{if(shouldLoadStudentChoices(kind,scope,existingScope,eventId,students.status))students.loadMore(20)},[kind,scope,existingScope,eventId,students.status,students.loadMore])
  const dueAt=kind==='cancel'?null:dueAtFromInput(dueDate)
  const dueInvalid=dueAt!==null&&Number.isNaN(dueAt)
  const reasonValid=reason.trim().length>=8
  const allValid=!!label.trim()&&cents!==null&&scopeValid&&priorReady&&reasonValid&&!dueInvalid
  const stepReady:Record<FeeStep,boolean>={fee:!!label.trim()&&cents!==null,due:!dueInvalid,who:scopeValid,reason:reasonValid&&priorReady,review:allValid}
  const [clock]=useState(()=>Date.now())
  const pickerEvents=events.results.filter(event=>!event.archived).map(event=>({_id:event.eventId as string,name:event.name,startsAt:event.startsAt}))
  async function saveDueDateOnly(){
    if(!definition||pending||dueInvalid||dueDate===savedDueDate)return
    setPending(true);setError(null);setDueStatus('')
    try{await setDueAt({feeDefinitionId:definition._id,dueAt});setDueStatus(dueAt===null?dueDateCopy.cleared:dueDateCopy.saved)}
    catch(failure){setError(userFacingError(failure,dueDateCopy.failed))}
    finally{setPending(false)}
  }
  async function submit(){
    if(disabled||pending||cents===null||!allValid)return
    setPending(true);setError(null)
    if(prepared.current){
      const done=prepared.current
      try{await setDueAt({feeDefinitionId:done.feeDefinitionId,dueAt});onJob(done.jobId)}
      catch(failure){setError(userFacingError(failure,dueDateCopy.savedWithoutDueDate))}
      finally{setPending(false)}
      return
    }
    const input={kind,feeDefinitionId:definition?._id,label:kind==='create'?label.trim():undefined,targetAmountCents:cents,scope:effectiveScope,studentIds:effectiveScope==='selected'?[...studentIds]:undefined,eventId:eventId??undefined,supersedeHeldJobId:latest?.job.state==='held'?reviewedPrior?.jobId:undefined,expectedHeldRows:latest?.job.state==='held'?reviewedPrior?.held:undefined,reason:reason.trim()} as const
    const fingerprint=JSON.stringify(input)
    if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,key:crypto.randomUUID()}
    let jobId:Id<'feeBulkJobs'>
    try{jobId=await prepare({...input,idempotencyKey:intent.current.key})}
    catch(failure){setError(userFacingError(failure, copy.unavailable));setPending(false);return}
    if(kind==='cancel'||dueDate===savedDueDate){setPending(false);onJob(jobId);return}
    try{
      const feeDefinitionId=definition?._id??(await client.query(api.feeDefinitions.bulkStatus,{jobId})).job.feeDefinitionId
      prepared.current={jobId,feeDefinitionId}
      await setDueAt({feeDefinitionId,dueAt})
      onJob(jobId)
    }catch(failure){setError(userFacingError(failure,dueDateCopy.savedWithoutDueDate))}
    finally{setPending(false)}
  }
  const last=stepIndex===steps.length-1
  /** Edit on the review screen: go to that step, and Continue returns straight to the review. */
  const goTo=(target:FeeStep)=>{setError(null);setBackToReview(true);setStepIndex(steps.indexOf(target))}
  const next=()=>{
    if(last){void submit();return}
    setError(null)
    setStepIndex(backToReview?steps.length-1:stepIndex+1)
    setBackToReview(false)
  }
  const back=stepIndex>0?()=>{setError(null);setBackToReview(false);setStepIndex(stepIndex-1)}:undefined
  const eventName=pickerEvents.find(event=>event._id===eventId)?.name
  const whoText=effectiveScope==='existingCharges'?wizard.existing:effectiveScope==='confirmedEvent'?wizard.eventStudents(eventName??'the chosen event'):effectiveScope==='selected'?wizard.selectedStudents(studentIds.length):wizard.allStudents
  const title=kind==='create'?copy.add:kind==='cancel'?copy.cancel:copy.edit
  const amountProblem=money&&amount.trim()!==''&&!money.ok?money.message:null
  const content=(()=>{
    switch(step){
      case 'fee':return <>
        <label className={styles.field}>{copy.name}<Input value={label} required maxLength={150} disabled={disabled||pending||kind!=='create'} onChange={event=>setLabel(event.target.value)}/></label>
        {kind==='create'&&<span className={styles.muted}>{wizard.nameHint}</span>}
        <label className={styles.field}>{copy.amount}<Input value={amount} required inputMode="decimal" disabled={disabled||pending} aria-invalid={!!amountProblem} aria-describedby="fee-amount-hint" onChange={event=>setAmount(event.target.value)}/></label>
        <span id="fee-amount-hint" className={amountProblem?styles.error:styles.muted} role={amountProblem?'alert':undefined}>{amountProblem??wizard.amountExample}</span>
      </>
      case 'due':return <div className={styles.field}>
        <label className={styles.field}>{dueDateCopy.label}<Input type="date" value={dueDate} disabled={disabled||pending} aria-invalid={dueInvalid} aria-describedby="fee-due-date-hint" onChange={event=>{setDueDate(event.target.value);setDueStatus('')}}/></label>
        <span id="fee-due-date-hint" className={styles.muted}>{dueDateCopy.hint}</span>
        {dueInvalid&&<p role="alert" className={styles.error}>{dueDateCopy.invalid}</p>}
        {definition&&<div className={styles.actions}><Button type="button" variant="outline" disabled={disabled||pending||dueInvalid||dueDate===savedDueDate} onClick={()=>void saveDueDateOnly()}>{dueDateCopy.save}</Button>{dueStatus&&<span role="status" className={styles.muted}>{dueStatus}</span>}</div>}
      </div>
      case 'who':return <>
        <FeeScopeFields eventSelectionDisabled={!!definition} eventId={eventId} pickingEvent={pickingEvent} onPickingEventChange={setPickingEvent} asOf={clock} events={pickerEvents} onEventChange={setEventId} scope={scope} onScopeChange={setScope} students={students.results.map(student=>({id:student.studentId,name:student.name,checked:studentIds.includes(student.studentId),disabled:studentIds.length>=500&&!studentIds.includes(student.studentId)}))} onStudentChange={(id,checked)=>setStudentIds(previous=>checked?previous.includes(id)?previous:previous.length<500?[...previous,id]:previous:previous.filter(value=>value!==id))} disabled={disabled||pending} loadingStudents={students.status==='LoadingFirstPage'||students.status==='LoadingMore'} moreStudents={students.status!=='Exhausted'} autoLoadStudents={scope==='selected'&&!eventId&&!pickingEvent} loadStudents={()=>students.loadMore(20)} loadingEvents={events.status==='LoadingFirstPage'||events.status==='LoadingMore'} moreEvents={events.status!=='Exhausted'} loadEvents={()=>events.loadMore(20)}/>
        {effectiveScope==='selected'&&<p>{wizard.studentsLimit(studentIds.length)}</p>}
      </>
      case 'reason':return <>
        {kind==='cancel'&&<><p>{copy.cancelNote} {copy.cancelTarget}</p>{latest?.job.state==='held'&&<PriorHeldScopeReview key={latest.job._id} jobId={latest.job._id} held={latest.job.held} disabled={disabled||pending} onReviewed={()=>setReviewedPrior({jobId:latest.job._id,held:latest.job.held})}/>}{!priorReady&&<p className={styles.notice} role="status">{wizard.priorFirst}</p>}</>}
        <label className={styles.field}>{copy.reasonInput}<Input value={reason} required maxLength={1000} disabled={disabled||pending} onChange={event=>setReason(event.target.value)}/></label>
        <span className={styles.muted}>{wizard.reasonHint}</span>
      </>
      case 'review':return <>
        <dl className="m-0 grid">
          <ReviewRow label={copy.name} value={label}/>
          {kind==='cancel'?<ReviewRow label={copy.amount} value={wizard.cancelSummary}/>:<ReviewRow label={copy.amount} value={cents===null?'—':chargeCurrency(cents)} onEdit={()=>goTo('fee')} disabled={pending}/>}
          {kind!=='cancel'&&<ReviewRow label={dueDateCopy.heading} value={dueAt!==null&&!dueInvalid?dueDateCopy.full(dueAt):wizard.noDue} onEdit={()=>goTo('due')} disabled={pending}/>}
          {kind==='create'?<ReviewRow label={wizard.steps.who} value={whoText} onEdit={()=>goTo('who')} disabled={pending}/>:<ReviewRow label={wizard.steps.who} value={whoText}/>}
          <ReviewRow label={copy.reason} value={reason.trim()} onEdit={()=>goTo('reason')} disabled={pending}/>
        </dl>
        <p className={styles.muted}>{wizard.reviewNote}</p>
      </>
    }
  })()
  return <Card className={`${styles.card} ${styles.formCard}`}><CardTitle>{title}</CardTitle><p>{copy.prepareBulkNote} {copy.scopeNote}</p>
    <StepWizard title={title} step={stepIndex+1} total={steps.length} heading={wizard.steps[step]} nextLabel={last?(pending?wizard.saving:wizard.reviewButton):wizard.next} nextDisabled={disabled||!stepReady[step]} onNext={next} onBack={back} busy={pending} error={error}
      onCancel={()=>{if(prepared.current)onJob(prepared.current.jobId);else onDismiss()}}>
      {content}
    </StepWizard>
  </Card>
}

function PriorHeldScopeReview({jobId,held,disabled,onReviewed}:{jobId:Id<'feeBulkJobs'>;held:number;disabled:boolean;onReviewed:()=>void}){
  const rows=usePaginatedQuery(api.feeDefinitions.bulkRows,{jobId},{initialNumItems:20})
  return <div className={styles.form}><strong>{copy.priorHeldScope}</strong><p>{copy.supersedeNote} {copy.heldRows}: {held}</p>
    {rows.status==='LoadingFirstPage'?<p role="status">{copy.loading}</p>:rows.results.filter(row=>row.state==='held').map(row=><BulkRowEvidence key={row._id} row={row}/>)}
    {rows.status!=='Exhausted'&&<Button type="button" variant="outline" disabled={disabled||rows.status!=='CanLoadMore'} onClick={()=>rows.loadMore(20)}>{copy.moreRows}</Button>}
    <Button type="button" variant="outline" disabled={disabled||rows.status!=='Exhausted'} onClick={onReviewed}>{copy.reviewPriorHeld}</Button>
  </div>
}

function BulkJobWorkspace({jobId,isCoach,onSelect,onClose}:{onClose:()=>void;jobId:Id<'feeBulkJobs'>;isCoach:boolean;onSelect:(id:Id<'feeBulkJobs'>)=>void}){
  const status=useQuery(api.feeDefinitions.bulkStatus,{jobId})
  if(!status)return <div><Button type="button" variant="outline" onClick={onClose}>{copy.closeDetails}</Button><p role="status">{copy.loading}</p></div>
  return <BulkJobSummary {...status}>
    <Button type="button" variant="outline" onClick={onClose}>{copy.closeDetails}</Button>
    {status.job.supersededByJobId&&<Button type="button" variant="outline" onClick={()=>{if(status.job.supersededByJobId)onSelect(status.job.supersededByJobId)}}>{copy.openSupersedingOperation}</Button>}
    {isCoach&&<BulkJobReview jobId={jobId} canCancel={status.canCancel} canRetry={status.canRetry}/>}
    <BulkJobHistory definitionId={status.job.feeDefinitionId} onSelect={onSelect}/>
  </BulkJobSummary>
}

function BulkJobHistory({definitionId,onSelect}:{definitionId:Id<'feeDefinitions'>;onSelect:(id:Id<'feeBulkJobs'>)=>void}){
  const history=usePaginatedQuery(api.feeDefinitions.bulkJobs,{feeDefinitionId:definitionId},{initialNumItems:20})
  return <div className={styles.form}><strong>{copy.history}</strong>{history.status==='LoadingFirstPage'?<p role="status">{copy.loading}</p>:<>{history.results.length===0&&<p>{copy.noHistory}</p>}{history.results.map(job=><div className={styles.historyRow} key={job._id}><strong>{copy.bulkStates[job.state]}</strong><span>{copy.bulkKinds[job.kind]} · {copy.bulkScopes[job.scope]} · {copy.targetAmount}: {chargeCurrency(job.targetAmountCents)}</span><span>{new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(job.createdAt)}</span><p>{copy.reason}: {job.reason}</p><Button type="button" variant="outline" onClick={()=>onSelect(job._id)}>{copy.details}</Button></div>)}{history.status!=='Exhausted'&&<Button type="button" variant="outline" disabled={history.status!=='CanLoadMore'} onClick={()=>history.loadMore(20)}>{copy.moreHistory}</Button>}</>}</div>
}

export function BulkJobSummary({job,originalActorName,children}:{job:Doc<'feeBulkJobs'>;originalActorName:string;processingActorName:string;children?:ReactNode}){
  return <Card className={styles.card}><CardTitle>{copy.bulkReceipt}</CardTitle>
    <p role={job.state==='failed'?'alert':'status'}>{copy.bulkStates[job.state]}</p>
    <p>{copy.originalScope}: {copy.bulkScopes[job.scope]} · {copy.scopeMembers}: {job.snapshotComplete?job.snapshotCount:copy.unknownScopeCount}</p>
    <p>{copy.targetAmount}: {chargeCurrency(job.targetAmountCents)}</p>
    <p>{copy.committedRows}: {job.committed} · {copy.heldRows}: {job.held}</p>
    {job.priorHeldJobId&&<><p>{copy.plannedSuperseded}: {job.priorHeldRows??copy.unavailable}</p><p>{copy.committedSuperseded}: {job.supersededRows}</p><p className={styles.muted}>{copy.supersedeFinalOnly}</p></>}
    <p>{copy.requestedBy}: {originalActorName}</p><p>{copy.reason}: {job.reason}</p>
    {job.lastError&&<p role="alert">{userFacingError(new Error(job.lastError), copy.processingFailed)}</p>}
    {children}
  </Card>
}

type BulkPreview=FunctionReturnType<typeof api.feeDefinitions.previewBulk>
export function bulkReviewComplete(preview:BulkPreview|undefined,rowCount:number,rowStatus:string,priorReviewReady:boolean){
  return preview?.canCommit===true&&priorReviewReady&&rowStatus==='Exhausted'&&rowCount===preview.scopeMemberCount
}
export function shouldLoadPreparedRows(preview:BulkPreview|undefined,status:string){
  return preview?.job.state==='prepared'&&status==='CanLoadMore'
}
export function bulkReviewUnchanged(review:BulkPreview|null,preview:BulkPreview|undefined){
  return !!review&&preview?.canCommit===true&&preview.job._id===review.job._id&&preview.expectedScopeHash===review.expectedScopeHash&&preview.expectedOrderRevision===review.expectedOrderRevision&&preview.expectedDefinitionRevision===review.expectedDefinitionRevision&&preview.scopeMemberCount===review.scopeMemberCount
}
export function bulkCommitArgs(review:BulkPreview):FunctionArgs<typeof api.feeDefinitions.commitBulk>{
  return {jobId:review.job._id,expectedScopeHash:review.expectedScopeHash,expectedOrderRevision:review.expectedOrderRevision,expectedDefinitionRevision:review.expectedDefinitionRevision,reason:review.job.reason.trim()}
}
function BulkJobReview({jobId,canCancel,canRetry}:{jobId:Id<'feeBulkJobs'>;canCancel:boolean;canRetry:boolean}){
  const preview=useQuery(api.feeDefinitions.previewBulk,{jobId})
  const rows=usePaginatedQuery(api.feeDefinitions.bulkRows,{jobId},{initialNumItems:20})
  const commit=useMutation(api.feeDefinitions.commitBulk)
  const cancel=useMutation(api.feeDefinitions.cancelPrepared)
  const retry=useMutation(api.feeDefinitions.retryBulk)
  const [review,setReview]=useState<BulkPreview|null>(null)
  const [cancelReason,setCancelReason]=useState('')
  const [retryReason,setRetryReason]=useState('')
  const [pending,setPending]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [retryRows,setRetryRows]=useState<FunctionArgs<typeof api.feeDefinitions.retryBulk>['rows']>([])
  const [priorReviewed,setPriorReviewed]=useState(false)
  const priorReviewReady=!preview?.job.priorHeldJobId||priorReviewed
  const allRowsLoaded=bulkReviewComplete(preview,rows.results.length,rows.status,priorReviewReady)
  useEffect(()=>{if(!review&&allRowsLoaded&&preview)setReview(preview)},[review,allRowsLoaded,preview])
  useEffect(()=>{if(shouldLoadPreparedRows(preview,rows.status))rows.loadMore(20)},[preview,rows.status,rows.loadMore])
  const fresh=bulkReviewUnchanged(review,preview)
  const freshRetry=retryRows.every(selected=>rows.results.some(row=>row._id===selected.rowId&&row.state==='held'&&!row.correctionJobId&&!row.allocationJobId&&row.financialState==='ready'&&row.currentFinancialRevision===selected.expectedFinancialRevision&&row.currentGeneration===selected.expectedGeneration&&row.currentChargeRevision===selected.expectedChargeRevision))
  const unfinishedChild=rows.status!=='Exhausted'||rows.results.some(row=>row.state==='waiting'&&(row.childState!=='complete'||row.financialState!=='ready'))
  async function resume(){
    if(pending||!canRetry||!freshRetry||unfinishedChild||retryReason.trim().length<8||preview?.job.state==='held'&&retryRows.length===0)return
    setPending(true);setError(null)
    try{await retry({jobId,rows:retryRows,reason:retryReason.trim()});setRetryRows([]);setRetryReason('')}
    catch(failure){setError(userFacingError(failure, copy.unavailable))}finally{setPending(false)}
  }
  async function act(action:'commit'|'cancel'){
    if(pending||action==='commit'&&(!review||!fresh||!allRowsLoaded||review.job.reason.trim().length<8)||action==='cancel'&&(!canCancel||cancelReason.trim().length<8))return
    setPending(true);setError(null)
    try{
      if(action==='cancel')await cancel({jobId,reason:cancelReason.trim()})
      else if(review)await commit(bulkCommitArgs(review))
      setReview(null);setCancelReason('')
    }catch(failure){setError(userFacingError(failure, copy.unavailable))}finally{setPending(false)}
  }
  return <div className={styles.form}>
    {preview&&<><strong>{preview.definition.label}</strong>{preview.message&&['prepared','preparing','draining'].includes(preview.job.state)&&<p>{preview.message}</p>}</>}
    {preview?.job.state==='prepared'&&preview.job.priorHeldJobId&&preview.job.priorHeldRows!==undefined&&<PriorHeldScopeReview jobId={preview.job.priorHeldJobId} held={preview.job.priorHeldRows} disabled={pending} onReviewed={()=>setPriorReviewed(true)}/>}
    {preview?.job.state==='prepared'&&<p>{copy.reviewAllRows}</p>}
    {rows.status==='LoadingFirstPage'?<p role="status">{copy.loading}</p>:<>{rows.results.map(row=><BulkRowEvidence key={row._id} row={row}>{row.canRetryChild&&<BulkChildRetry row={row} disabled={pending}/>}</BulkRowEvidence>)}{preview?.job.state==='prepared'&&rows.status!=='Exhausted'&&<p role="status">{copy.loadingReviewRows}</p>}{preview?.job.state!=='prepared'&&rows.status!=='Exhausted'&&<Button type="button" variant="outline" disabled={rows.status!=='CanLoadMore'||pending} onClick={()=>rows.loadMore(20)}>{copy.moreRows}</Button>}</>}
    {review&&<form className={styles.form} onSubmit={event=>{event.preventDefault();void act('commit')}}><p>{copy.reviewedScope}: {review.scopeMemberCount} · {copy.targetAmount}: {chargeCurrency(review.job.targetAmountCents)}</p><p>{copy.reason}: {review.job.reason}</p>{!fresh&&<p role="alert">{copy.staleReview}</p>}<p>{copy.noCash}</p><Button type="submit" disabled={pending||!fresh||!allRowsLoaded}>{pending?copy.submitting:copy.post}</Button></form>}
    {canCancel&&<details><summary>{copy.cancelPreparation}</summary><form className={styles.form} onSubmit={event=>{event.preventDefault();void act('cancel')}}><label className={styles.field}>{copy.cancelReason}<Input value={cancelReason} required maxLength={1000} disabled={pending} onChange={event=>setCancelReason(event.target.value)}/></label><Button type="submit" variant="outline" disabled={pending||cancelReason.trim().length<8}>{copy.cancelPrepared}</Button></form></details>}
    {error&&<p role="alert">{error}</p>}
    {canRetry&&<form className={styles.form} onSubmit={event=>{event.preventDefault();void resume()}}><p>{copy.retryScopeNote}</p>
      {rows.results.filter(row=>row.state==='held'&&!row.correctionJobId&&!row.allocationJobId).map(row=><label className={styles.checkbox} key={row._id}><Checkbox checked={retryRows.some(selected=>selected.rowId===row._id)} disabled={pending||row.financialState!=='ready'||row.currentFinancialRevision===null||row.currentGeneration===null} onCheckedChange={checked=>{
        if(!checked){setRetryRows(previous=>previous.filter(selected=>selected.rowId!==row._id));return}
        const financialRevision=row.currentFinancialRevision,generation=row.currentGeneration
        if(financialRevision!==null&&generation!==null&&retryRows.length<20)setRetryRows(previous=>previous.some(selected=>selected.rowId===row._id)?previous:[...previous,{rowId:row._id,expectedFinancialRevision:financialRevision,expectedGeneration:generation,expectedChargeRevision:row.currentChargeRevision}])
      }}/>{row.name}</label>)}
      {!freshRetry&&<p role="alert">{copy.staleRetry}</p>}
      {unfinishedChild&&<p>{copy.childBeforeParent}</p>}<label className={styles.field}>{copy.retryReason}<Input value={retryReason} maxLength={1000} required disabled={pending} onChange={event=>setRetryReason(event.target.value)}/></label><Button type="submit" disabled={pending||unfinishedChild||!freshRetry||retryReason.trim().length<8||preview?.job.state==='held'&&retryRows.length===0}>{pending?copy.submitting:copy.retry}</Button>
    </form>}
  </div>
}

type BulkRow=FunctionReturnType<typeof api.feeDefinitions.bulkRows>['page'][number]
export function BulkRowEvidence({row,children}:{row:BulkRow;children?:ReactNode}){
  const newCharge = !row.chargeId && row.originalExpectedChargeRevision == null
  const currentChargeAvailable = row.currentEffectiveCents !== null && row.currentAppliedCents !== null
  return <div className={styles.historyRow}><strong>{row.name}</strong><span>{copy.rowStates[row.state]}</span>
    {row.state !== 'committed' && <span>{copy.targetAmount}: {chargeCurrency(row.targetAmountCents)}</span>}
    {currentChargeAvailable ? <>
      <span>{copy.currentEffective}: {chargeCurrency(row.currentEffectiveCents!)} · {copy.currentApplied}: {chargeCurrency(row.currentAppliedCents!)}</span>
    </> : <p>{newCharge ? row.state === 'pending' ? copy.notChargedYet : copy.noLinkedCharge : copy.chargeUnavailable}</p>}
    {row.releaseRequiredCents !== null && row.releaseRequiredCents > 0 && <span>{copy.releaseRequired}: {chargeCurrency(row.releaseRequiredCents)}</span>}
    {row.correctionJobId && row.totalReleaseCents > 0 && <span>{copy.committedRelease}: {chargeCurrency(row.committedReleaseCents)} / {chargeCurrency(row.totalReleaseCents)}</span>}
    {row.financialState!=='ready'&&<p>{copy.rowFinancialPending}</p>}{row.message&&<p>{row.message}</p>}{row.childError&&<p role="alert">{copy.studentProcessingFailed}</p>}{children}
  </div>
}

function BulkChildRetry({row,disabled}:{row:BulkRow;disabled:boolean}){
  const retryCorrection=useMutation(api.financialOperationsWorker.retry)
  const retryAllocation=useMutation(api.financialAllocation.retry)
  const [reason,setReason]=useState('')
  const [pending,setPending]=useState(false)
  const [error,setError]=useState<string|null>(null)
  async function retry(){
    if(disabled||pending||!row.canRetryChild||reason.trim().length<8)return
    setPending(true);setError(null)
    try{
      if(row.correctionJobId)await retryCorrection({jobId:row.correctionJobId,reason:reason.trim()})
      else if(row.allocationJobId)await retryAllocation({studentId:row.studentId,reason:reason.trim()})
      setReason('')
    }catch(failure){setError(userFacingError(failure, copy.unavailable))}finally{setPending(false)}
  }
  return <form className={styles.form} onSubmit={event=>{event.preventDefault();void retry()}}><p>{copy.childRetryNote}</p><label className={styles.field}>{copy.retryReason}<Input value={reason} required maxLength={1000} disabled={disabled||pending} onChange={event=>setReason(event.target.value)}/></label><Button type="submit" disabled={disabled||pending||!row.canRetryChild||reason.trim().length<8}>{pending?copy.submitting:copy.retryChild}</Button>{error&&<p role="alert">{error}</p>}</form>
}

function MapHistoricalFees({ control, definitions, moreDefinitions, loadDefinitions, onJob }: {
  control: Doc<'seasonFinanceControls'> | null
  definitions: ReadonlyArray<Doc<'feeDefinitions'>>
  moreDefinitions: boolean
  loadDefinitions: () => void
  onJob: (jobId: Id<'feeMappingJobs'>) => void
}) {
  const evidence = usePaginatedQuery(api.feeDefinitions.unmapped, {}, { initialNumItems: 20 })
  const map = useMutation(api.feeDefinitions.mapCharges)
  const [selected, setSelected] = useState<ReadonlyArray<UnmappedRow>>([])
  const [definitionId, setDefinitionId] = useState<Id<'feeDefinitions'> | null>(null)
  const [reviewed, setReviewed] = useState<{ rows: ReadonlyArray<UnmappedRow>; definition: Doc<'feeDefinitions'>; orderRevision: number } | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intent = useRef<{ fingerprint: string; key: string } | null>(null)
  const eligible = definitions.filter(definition => selected.length > 0 && selected.every(row => row.charge.eventId === definition.eventId))
  const target = eligible.find(definition => definition._id === definitionId)
  const fresh = !!reviewed && control?.state === 'ready' && control.revision === reviewed.orderRevision && definitions.some(definition => definition._id === reviewed.definition._id && definition.revision === reviewed.definition.revision) && reviewed.rows.every(row => evidence.results.some(current => current.charge._id === row.charge._id && (current.charge.revision ?? 0) === (row.charge.revision ?? 0)))
  function select(chargeId: Id<'charges'>, checked: boolean) {
    if (pending || reviewed) return
    const row = evidence.results.find(item => item.charge._id === chargeId)
    if (!checked) setSelected(previous => previous.filter(item => item.charge._id !== chargeId))
    else if (row && selected.length < 20 && !selected.some(item => item.charge._id === chargeId)) setSelected(previous => [...previous, row])
    setDefinitionId(null)
  }
  async function submit() {
    if (!reviewed || !fresh || pending || reason.trim().length < 8) return
    setPending(true); setError(null)
    const chargeIds = reviewed.rows.map(row => ({ chargeId: row.charge._id, expectedChargeRevision: row.charge.revision ?? 0 }))
    const fingerprint = JSON.stringify([chargeIds, reviewed.definition._id, reviewed.orderRevision, reason.trim()])
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() }
    try {
      onJob(await map({ chargeIds, feeDefinitionId: reviewed.definition._id, expectedOrderRevision: reviewed.orderRevision, reason: reason.trim(), idempotencyKey: intent.current.key }))
      setReviewed(null); setSelected([]); setReason(''); setDefinitionId(null)
    } catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { setPending(false) }
  }
  return <Card className={styles.card}><CardTitle>{copy.legacy}</CardTitle><p>{copy.legacyNote}</p><p className={styles.muted}>{copy.recordedPriorityNote}</p>
    {evidence.status === 'LoadingFirstPage' ? <p role="status">{copy.loading}</p> : <>
      <UnmappedFeeEvidence rows={evidence.results.map(row => ({ ...row, selected: selected.some(item => item.charge._id === row.charge._id), disabled: selected.length >= 20 && !selected.some(item => item.charge._id === row.charge._id) }))} disabled={pending || !!reviewed} onSelect={select} />
      {evidence.results.length === 0 && <p>{copy.noLegacy}</p>}
      {evidence.status !== 'Exhausted' && <Button type="button" variant="outline" disabled={evidence.status !== 'CanLoadMore' || pending || !!reviewed} onClick={() => evidence.loadMore(20)}>{copy.moreLegacy}</Button>}
      <p>{copy.selectedCount}: {selected.length} / 20</p>
      {!reviewed && <><label className={styles.field}>{copy.mappingTarget}<NativeSelect value={definitionId ?? ''} disabled={pending || selected.length === 0} onChange={event => setDefinitionId(eligible.find(definition => definition._id === event.target.value)?._id ?? null)}><NativeSelectOption value="">{copy.chooseDefinition}</NativeSelectOption>{eligible.map(definition => <NativeSelectOption key={definition._id} value={definition._id}>{definition.label} · {copy.recordedPriority} {definition.priority}</NativeSelectOption>)}</NativeSelect></label>
        {moreDefinitions && <Button type="button" variant="outline" disabled={pending} onClick={loadDefinitions}>{copy.moreFees}</Button>}
        {selected.length > 0 && !target && <p>{copy.sameScope}</p>}
        {selected.length > 0 && control && selected.every(row => row.charge.eventId === selected[0].charge.eventId) && <CreateMappingDestination key={selected[0].charge.eventId ?? 'standalone'} eventId={selected[0].charge.eventId} orderRevision={control.revision} disabled={pending} onCreated={setDefinitionId} />}
        <Button type="button" disabled={!target || !control || pending} onClick={() => { if (target && control) { setReviewed({ rows: selected, definition: target, orderRevision: control.revision }); setError(null) } }}>{copy.map}</Button>
      </>}
      {reviewed && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}><strong>{copy.mappingTarget}: {reviewed.definition.label}</strong><UnmappedFeeEvidence rows={reviewed.rows.map(row => ({ ...row, selected: true }))} disabled onSelect={() => undefined} /><p>{copy.mappingNoMoney}</p>{!fresh && <p role="alert">{copy.staleReview}</p>}<label className={styles.field}>{copy.reasonInput}<Input value={reason} maxLength={1000} required disabled={pending} onChange={event => setReason(event.target.value)} /></label><Button type="submit" disabled={pending || !fresh || reason.trim().length < 8}>{pending ? copy.submitting : copy.mapConfirm}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setReviewed(null)}>{copy.dismiss}</Button></form>}
    </>}{error && <p role="alert">{error}</p>}
  </Card>
}

function CreateMappingDestination({ eventId, orderRevision, disabled, onCreated }: {
  eventId?: Id<'events'>
  orderRevision: number
  disabled: boolean
  onCreated: (definitionId: Id<'feeDefinitions'>) => void
}) {
  const create = useMutation(api.feeDefinitions.createMappingDefinition)
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intent = useRef<{ fingerprint: string; key: string } | null>(null)
  const money = parseMoneyInput(amount)
  const cents = money.ok ? money.cents : null
  async function submit() {
    if (disabled || pending || !label.trim() || cents === null || reason.trim().length < 8) return
    setPending(true); setError(null)
    const fingerprint = JSON.stringify([label.trim(), cents, eventId, orderRevision, reason.trim()])
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() }
    try { const id = await create({ label: label.trim(), kind: eventId ? 'eventExtra' : 'custom', eventId, defaultAmountCents: cents, expectedOrderRevision: orderRevision, reason: reason.trim(), idempotencyKey: intent.current.key }); onCreated(id); setCreated(true); setOpen(false) }
    catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { setPending(false) }
  }
  return <div className={styles.form}><Button type="button" variant="outline" disabled={disabled || pending || created} onClick={() => setOpen(value => !value)}>{copy.createMappingDefinition}</Button>
    {open && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}><p>{copy.mappingDefinitionNote}</p><label className={styles.field}>{copy.name}<Input value={label} required maxLength={150} disabled={disabled || pending} onChange={event => setLabel(event.target.value)} /></label><label className={styles.field}>{copy.defaultAmount}<Input value={amount} required inputMode="decimal" disabled={disabled || pending} onChange={event => setAmount(event.target.value)} /></label>{amount.trim() !== '' && !money.ok && <span role="alert" className={styles.error}>{money.message}</span>}<label className={styles.field}>{copy.reasonInput}<Input value={reason} required maxLength={1000} disabled={disabled || pending} onChange={event => setReason(event.target.value)} /></label><Button type="submit" disabled={disabled || pending || !label.trim() || cents === null || reason.trim().length < 8}>{pending ? copy.submitting : copy.createMappingDefinition}</Button></form>}
    {created && <p role="status">{copy.mappingDefinitionCreated}</p>}{error && <p role="alert">{error}</p>}
  </div>
}

function PrepareFeeMapping({ onJob }: { onJob: (jobId: Id<'feeMappingJobs'>) => void }) {
  const prepare = useMutation(api.feeDefinitions.prepareMapping)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<Id<'feeMappingJobs'> | null>(null)
  const intent = useRef<{ reason: string; key: string } | null>(null)
  async function submit() {
    if (pending || reason.trim().length < 8) return
    setPending(true); setError(null)
    if (intent.current?.reason !== reason.trim()) intent.current = { reason: reason.trim(), key: crypto.randomUUID() }
    try { const id = await prepare({ reason: reason.trim(), idempotencyKey: intent.current.key }); setJobId(id); onJob(id) }
    catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { setPending(false) }
  }
  return <Card className={styles.card}><CardTitle>{copy.prepareMapping}</CardTitle><p>{copy.proofNote}</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}>
      <label className={styles.field}>{copy.reasonInput}<Input value={reason} maxLength={1000} required disabled={pending || !!jobId} onChange={event => setReason(event.target.value)} /></label>
      <Button type="submit" variant="outline" disabled={pending || !!jobId || reason.trim().length < 8}>{pending ? copy.submitting : copy.prepareMapping}</Button>
    </form>{error && <p role="alert">{error}</p>}
  </Card>
}

export function LiveMappingReceipt({ jobId }: { jobId: Id<'feeMappingJobs'> }) {
  const result = useQuery(api.feeDefinitions.mappingStatus, { jobId })
  const retry = useMutation(api.feeDefinitions.retryMapping)
  const cancel = useMutation(api.feeDefinitions.cancelMapping)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function resume(action: 'retry' | 'cancel' = 'retry') {
    if (pending || reason.trim().length < 8 || (action === 'cancel' ? !result?.canCancel : !result?.canRetry)) return
    setPending(true); setError(null)
    try { await (action === 'cancel' ? cancel : retry)({ jobId, reason: reason.trim() }); setReason('') }
    catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { setPending(false) }
  }
  if (!result) return <p role="status">{copy.loading}</p>
  return <Card className={styles.card}><CardTitle>{copy.mappingReceipt}</CardTitle>
    <p role={result.job.state === 'failed' ? 'alert' : 'status'}>{result.job.state === 'cancelled' ? copy.mappingCancelled : result.job.state === 'complete' ? copy.mappingPassComplete : result.job.state === 'failed' ? copy.failed : result.job.state === 'draining' ? copy.draining : copy.applying}</p>
    <p>{copy.recordsProcessed}: {result.job.processed} · {copy.mapped}: {result.job.mapped} · {copy.unmapped}: {result.job.unmapped}</p>
    <p>{copy.requestedBy}: {result.originalActorName} · {copy.processedBy}: {result.processingActorName}</p><p>{copy.reason}: {result.job.reason}</p>
    {result.job.lastError && <p role="alert">{userFacingError(new Error(result.job.lastError), copy.unavailable)}</p>}
    {(result.canRetry || result.canCancel) && <form className={styles.form} onSubmit={event => { event.preventDefault(); void resume() }}><label className={styles.field}>{copy.mappingRecoveryReason}<Input value={reason} maxLength={1000} required disabled={pending} onChange={event => setReason(event.target.value)} /></label><div className={styles.actions}>{result.canRetry && <Button type="submit" disabled={pending || reason.trim().length < 8}>{pending ? copy.submitting : copy.retry}</Button>}{result.canCancel && <Button type="button" variant="outline" disabled={pending || reason.trim().length < 8} onClick={() => void resume('cancel')}>{copy.cancelMapping}</Button>}</div>{result.canCancel && <p>{copy.cancelMappingNote}</p>}</form>}
    {error && <p role="alert">{error}</p>}
  </Card>
}

function LivePriorityReceipt({ jobId }: { jobId: Id<'feePriorityJobs'> }) {
  const result = useQuery(api.feePriorities.status, { jobId })
  const retry = useMutation(api.feePriorities.retry)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!result) return <p role="status">{copy.loading}</p>
  async function resume() {
    if (pending || reason.trim().length < 8) return
    setPending(true); setError(null)
    try { await retry({ jobId, reason: reason.trim() }); setReason('') }
    catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { setPending(false) }
  }
  return <><FeePriorityReceipt {...result} retryReason={reason} onRetryReasonChange={setReason} onRetry={() => void resume()} submitting={pending} />{error && <p role="alert">{error}</p>}</>
}

const addedFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
type FeeRowPresentation = {
  key: string
  label: string
  priority: number
  amountCents: number
  summary?: string
  dueAt?: number
  /** When the fee was added, so two fees with the same name, amount and date can be told apart. */
  addedAt?: number
  cancelled: boolean
  /** Shown directly under the row, e.g. the fee's due date control. */
  below?: ReactNode
  actions?: {
    /** Opens the fee's due date control; only for a Coach or a Travel Lead with Money editing. */
    dueDate?: () => void
    dueDateOpen?: boolean
    view?: () => void
    up?: () => void
    down?: () => void
    edit?: () => void
    cancel?: () => void
  }
}

/** The caller supplies scope controls and authoritative capability; preparation moves no money. */
export function FeeDefinitionDraftForm({ scopeFields, scopeValid, disabled, onPrepare }: {
  scopeFields: ReactNode
  scopeValid: boolean
  disabled: boolean
  onPrepare: (draft: { label: string; targetAmountCents: number; reason: string }) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const money = parseMoneyInput(amount)
  const cents = money.ok ? money.cents : null
  async function prepare() {
    if (pending || disabled || !scopeValid || !label.trim() || cents === null || reason.trim().length < 8) return
    setPending(true); setError(null)
    try { await onPrepare({ label: label.trim(), targetAmountCents: cents, reason: reason.trim() }) }
    catch (failure) { setError(userFacingError(failure, copy.unavailable)) }
    finally { setPending(false) }
  }
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); void prepare() }}>
    <label className={styles.field}>{copy.name}<Input value={label} required disabled={disabled || pending} onChange={event => setLabel(event.target.value)} /></label>
    <label className={styles.field}>{copy.amount}<Input value={amount} required inputMode="decimal" disabled={disabled || pending} onChange={event => setAmount(event.target.value)} /></label>{amount.trim() !== '' && !money.ok && <span role="alert" className={styles.error}>{money.message}</span>}
    <fieldset className={styles.form} disabled={disabled || pending}>{scopeFields}</fieldset>
    <label className={styles.field}>{copy.reasonInput}<Input value={reason} maxLength={1000} required disabled={disabled || pending} onChange={event => setReason(event.target.value)} /></label>
    <p className={styles.muted}>{copy.prepareBulkNote} {copy.append}</p>
    <Button type="submit" disabled={disabled || pending || !scopeValid || !label.trim() || cents === null || reason.trim().length < 8}>{pending ? copy.submitting : copy.prepareBulk}</Button>
    {error && <p role="alert">{error}</p>}
  </form>
}

/** Presentation receives recorded ranks and permitted actions from its caller. */
export function FeePriorityRows({ rows, disabled }: { rows: ReadonlyArray<FeeRowPresentation>; disabled: boolean }) {
  return <div className={styles.order}>{rows.map((row, index) => <Fragment key={row.key}><div className={styles.fee}>
    <span className={styles.rank} aria-label={`Displayed fee order position ${index + 1}`}>{index + 1}</span>
    <div className={styles.feeName}><strong>{row.label}</strong><span className={styles.muted}>{copy.defaultAmount}: {chargeCurrency(row.amountCents)}{row.dueAt !== undefined ? ` · ${dueDateCopy.short(row.dueAt)}` : ''}{row.summary ? ` · ${row.summary}` : ''}{row.addedAt !== undefined ? ` · ${copy.addedAt} ${addedFormat.format(row.addedAt)}` : ''}</span>{row.cancelled && <span className={styles.status}>{copy.cancelled}</span>}</div>
    {row.actions && <div className={styles.feeActions}>
      {row.actions.dueDate && <Button type="button" variant="outline" aria-expanded={row.actions.dueDateOpen ?? false} aria-label={`${row.dueAt !== undefined ? dueDateCopy.changeAction : dueDateCopy.setAction} for ${row.label}`} onClick={row.actions.dueDate}>{row.dueAt !== undefined ? dueDateCopy.changeAction : dueDateCopy.setAction}</Button>}
      {row.actions.view && <Button type="button" variant="outline" aria-label={`${copy.details} ${row.label}`} onClick={row.actions.view}>{copy.details}</Button>}
      {row.actions.edit && <Button type="button" variant="outline" disabled={disabled} aria-label={`${copy.edit} ${row.label}`} onClick={row.actions.edit}>{copy.edit}</Button>}
      {row.actions.cancel && <Button type="button" variant="outline" disabled={disabled} aria-label={`${copy.cancel} ${row.label}`} onClick={row.actions.cancel}>{copy.cancel}</Button>}
      {row.actions.up && <Button type="button" variant="outline" disabled={disabled} aria-label={`Move ${row.label} up`} onClick={row.actions.up}>{copy.up}</Button>}
      {row.actions.down && <Button type="button" variant="outline" disabled={disabled} aria-label={`Move ${row.label} down`} onClick={row.actions.down}>{copy.down}</Button>}
    </div>}
  </div>{row.below}</Fragment>)}</div>
}

/**
 * Set or clear one fee's due date (feeDefinitions.setDueAt). It moves no money and needs no review job;
 * charges without their own due date use it right away, on Money and on Home.
 */
function FeeDueDate({ definition, onClose }: { definition: Doc<'feeDefinitions'>; onClose: () => void }) {
  const save = useMutation(api.feeDefinitions.setDueAt)
  const saved = dueDateInput(definition.dueAt)
  const [date, setDate] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  const next = dueAtFromInput(date)
  const invalid = next !== null && Number.isNaN(next)
  async function submit(value: number | null) {
    if (busy) return
    setBusy(true); setError(''); setStatus('')
    try { await save({ feeDefinitionId: definition._id, dueAt: value }); setStatus(value === null ? dueDateCopy.cleared : dueDateCopy.saved); if (value === null) setDate('') }
    catch (cause) { setError(userFacingError(cause, dueDateCopy.failed)) }
    finally { setBusy(false) }
  }
  return <form className={`${styles.form} ${styles.dueDate}`} aria-label={dueDateCopy.feeHeading(definition.label)} onSubmit={event => { event.preventDefault(); if (invalid) { setError(dueDateCopy.invalid); return } if (date !== saved) void submit(next) }}>
    <strong>{dueDateCopy.feeHeading(definition.label)}</strong>
    <p className={styles.muted}>{definition.dueAt !== undefined ? dueDateCopy.full(definition.dueAt) : dueDateCopy.none} · {dueDateCopy.feeHint}</p>
    <label className={styles.field}>{dueDateCopy.label}<Input ref={input} type="date" value={date} disabled={busy} aria-invalid={invalid} onChange={event => { setDate(event.target.value); setStatus(''); setError('') }} /></label>
    <div className={styles.actions}>
      <Button type="submit" disabled={busy || invalid || date === saved}>{busy ? dueDateCopy.saving : dueDateCopy.save}</Button>
      {definition.dueAt !== undefined && <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(null)}>{dueDateCopy.clear}</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{dueDateCopy.close}</Button>
    </div>
    {status && <p role="status" className={styles.muted}>{status}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </form>
}

export function FeeMaintenanceNotice({ state, message, processed }: { state: 'ready' | 'draining' | 'applying' | 'failed'; message?: string; processed?: number }) {
  if (state === 'ready') return null
  return <Card className={styles.card}><CardTitle>{copy.maintenance}</CardTitle><p className={styles.notice} role={state === 'failed' ? 'alert' : 'status'}>{state === 'draining' ? copy.draining : state === 'failed' ? copy.failed : copy.applying}</p>{message && <p className={styles.muted}>{message}</p>}{processed !== undefined && <p>Records processed: {processed}</p>}<p className={styles.muted}>{copy.pending}</p></Card>
}

/** A durable receipt shows the recorded command and progress, not a local success flag. */
export function FeePriorityReceipt({ job, originalActorName, processingActorName, canRetry, retryReason, onRetryReasonChange, onRetry, submitting }: {
  job: Doc<'feePriorityJobs'>
  originalActorName: string
  processingActorName: string
  canRetry: boolean
  retryReason: string
  onRetryReasonChange: (reason: string) => void
  onRetry: () => void
  submitting: boolean
}) {
  return <Card className={styles.card}><CardTitle>{copy.priorityReceipt}</CardTitle>
    <p role={job.state === 'failed' ? 'alert' : 'status'}>{job.state === 'complete' ? copy.priorityComplete : job.state === 'failed' ? copy.failed : job.state === 'draining' ? copy.draining : copy.applying}</p>
    <p>{copy.recordedOrder}: {job.firstPriority} ↔ {job.secondPriority}</p>
    <p>{copy.recordsProcessed}: {job.processed}</p>
    <p className={styles.muted}>{copy.requestedBy}: {originalActorName} · {copy.processedBy}: {processingActorName}</p>
    <p>{copy.reason}: {job.reason}</p>
    {job.lastError && <p role="alert">{userFacingError(new Error(job.lastError), copy.unavailable)}</p>}
    {job.state !== 'complete' && <p className={styles.muted}>{copy.futureOnly} {copy.pending}</p>}
    {canRetry && <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!submitting && retryReason.trim().length >= 8) onRetry() }}>
      <label className={styles.field}>{copy.retryReason}<Input value={retryReason} maxLength={1000} disabled={submitting} onChange={event => onRetryReasonChange(event.target.value)} required /></label>
      <Button type="submit" disabled={submitting || retryReason.trim().length < 8}>{submitting ? copy.submitting : copy.retry}</Button>
    </form>}
  </Card>
}

export function UnmappedFeeEvidence({ rows, disabled, onSelect }: {
  rows: ReadonlyArray<{ review: Doc<'feeUnmappedCharges'>; charge: Doc<'charges'>; studentName: string; eventName: string | null; effectiveCents: number; selected: boolean; disabled?: boolean }>
  disabled: boolean
  onSelect: (chargeId: Id<'charges'>, selected: boolean) => void
}) {
  return <div className={styles.order}>{rows.map(row => <div className={styles.fee} key={row.charge._id}>
    <Checkbox checked={row.selected} disabled={disabled || row.disabled} aria-label={`${copy.selectCharge} ${row.studentName}: ${row.charge.label}`} onCheckedChange={checked => onSelect(row.charge._id, checked)} />
    <div className={styles.feeName}><strong>{row.studentName} · {row.charge.label}</strong>
      <span className={styles.muted}>{copy.connectedTo}: {row.eventName ?? (row.charge.eventId ? copy.eventUnavailable : copy.noEvent)}</span>
      <span>{copy.originalAmount}: {chargeCurrency(row.charge.amountCents)} · {copy.effectiveAmount}: {chargeCurrency(row.effectiveCents)} · {copy.appliedAmount}: {chargeCurrency(row.charge.appliedCents)}</span>
      <span className={styles.muted}>{copy.recordedPriority}: {row.charge.priority}</span>
    </div>
  </div>)}</div>
}

/** Controlled scope fields; no membership or monetary facts are generated here. */
export function FeeScopeFields({ eventId, pickingEvent, onPickingEventChange, asOf, events, onEventChange, scope, onScopeChange, students, onStudentChange, disabled, loadingStudents, moreStudents, autoLoadStudents=false, loadStudents, loadingEvents, moreEvents, loadEvents, eventSelectionDisabled }: {
  eventId: Id<'events'> | null
  /** True while "For an event" is chosen, even before an event is picked. */
  pickingEvent: boolean
  onPickingEventChange: (picking: boolean) => void
  /** The current time in milliseconds, for sorting events into upcoming and past. */
  asOf: number
  events: ReadonlyArray<PickerEvent>
  onEventChange: (eventId: Id<'events'> | null) => void
  scope: 'allActive' | 'selected'
  onScopeChange: (scope: 'allActive' | 'selected') => void
  students: ReadonlyArray<{ id: Id<'students'>; name: string; checked: boolean; disabled?: boolean }>
  onStudentChange: (studentId: Id<'students'>, checked: boolean) => void
  disabled: boolean
  loadingStudents: boolean
  moreStudents: boolean
  autoLoadStudents?: boolean
  loadStudents: () => void
  loadingEvents?: boolean
  moreEvents?: boolean
  loadEvents?: () => void
  eventSelectionDisabled?: boolean
}) {
  return <div className={styles.form}>
    {eventSelectionDisabled
      ? <p><strong>{copy.connectedTo}:</strong> {eventId ? (events.find(option => option._id === eventId)?.name ?? copy.eventUnavailable) : copy.noEvent}</p>
      : <>
        <div className={styles.scope} role="group" aria-label={copy.connectedTo}>
          <Button type="button" variant={!pickingEvent ? 'default' : 'outline'} aria-pressed={!pickingEvent} disabled={disabled} onClick={() => { onPickingEventChange(false); onEventChange(null) }}>{copy.wizard.notForEvent}</Button>
          <Button type="button" variant={pickingEvent ? 'default' : 'outline'} aria-pressed={pickingEvent} disabled={disabled} onClick={() => onPickingEventChange(true)}>{copy.wizard.forEvent}</Button>
        </div>
        {pickingEvent && <EventPicker events={events} value={eventId} onChange={id => onEventChange(id as Id<'events'>)} asOf={asOf} label={copy.wizard.chooseEvent} emptyText={loadingEvents ? copy.loadingEvents : undefined} />}
      </>}
    {pickingEvent && !eventSelectionDisabled && loadingEvents && <p role="status">{copy.loadingEvents}</p>}
    {pickingEvent && !eventSelectionDisabled && moreEvents && loadEvents && <Button type="button" variant="outline" disabled={disabled || loadingEvents} onClick={loadEvents}>{copy.moreEvents}</Button>}
    {eventId ? <p className={styles.muted}>{copy.confirmedScope}</p> : pickingEvent ? <p className={styles.muted}>{copy.wizard.chooseEvent}.</p> : <>
      <span className={styles.field}>{copy.whoOwes}</span>
      <div className={styles.scope} role="group" aria-label={copy.whoOwes}><Button type="button" variant={scope === 'allActive' ? 'default' : 'outline'} aria-pressed={scope === 'allActive'} disabled={disabled} onClick={() => onScopeChange('allActive')}>{copy.allActive}</Button><Button type="button" variant={scope === 'selected' ? 'default' : 'outline'} aria-pressed={scope === 'selected'} disabled={disabled} onClick={() => onScopeChange('selected')}>{copy.selected}</Button></div>
      {scope === 'allActive' ? <p className={styles.muted}>{copy.allActiveSnapshot}</p> : <>
        <div className={styles.students}>{students.map(student => <label className={styles.checkbox} key={student.id}><Checkbox checked={student.checked} disabled={disabled || student.disabled} onCheckedChange={checked => onStudentChange(student.id, checked)} />{student.name}</label>)}</div>
        {(loadingStudents||autoLoadStudents&&moreStudents) && <p role="status">{copy.loading}</p>}
        {!loadingStudents && !moreStudents && students.length === 0 && <p>{copy.noStudents}</p>}
        {moreStudents&&!autoLoadStudents && <Button type="button" variant="outline" disabled={disabled || loadingStudents} onClick={loadStudents}>{copy.moreStudents}</Button>}
      </>}
    </>}
  </div>
}
