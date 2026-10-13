import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import type { Doc, Id } from '../convex/_generated/dataModel'
import { Input } from './components/ui/input'
import { Component, useRef, useState, type ReactNode } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { chargeCurrency, parseChargeTarget } from './lib/charge-money'
import { feeAdministrationCopy as copy } from './lib/fee-administration-copy'
import styles from './FeeAdministration.module.css'

export default function FeeAdministration({ isCoach }: { isCoach: boolean }) {
  const [attempt, setAttempt] = useState(0)
  return <FeeQueryBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}><FeeWorkspace isCoach={isCoach} /></FeeQueryBoundary>
}

class FeeQueryBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <Card className={styles.card}><p role="alert">{copy.unavailable}</p><Button type="button" variant="outline" onClick={this.props.onRetry}>{copy.reload}</Button></Card>
    return this.props.children
  }
}

function FeeWorkspace({ isCoach }: { isCoach: boolean }) {
  const maintenance = useQuery(api.feePriorities.maintenance, {})
  const fees = usePaginatedQuery(api.feePriorities.list, {}, { initialNumItems: 20 })
  const move = useMutation(api.feePriorities.move)
  const [review, setReview] = useState<{ definition: Doc<'feeDefinitions'>; direction: 'up' | 'down'; orderRevision: number } | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<Id<'feePriorityJobs'> | null>(null)
  const [mappingJobId, setMappingJobId] = useState<Id<'feeMappingJobs'> | null>(null)
  const [bulkJobId, setBulkJobId] = useState<Id<'feeBulkJobs'> | null>(null)
  const [bulkDraft, setBulkDraft] = useState<{kind:'create'|'edit'|'cancel';definition?:Doc<'feeDefinitions'>}|null>(null)
  const submittedIntent = useRef<{ fingerprint: string; key: string } | null>(null)
  const visibleJobId = jobId ?? maintenance?.control?.priorityJobId
  const visibleMappingJobId = mappingJobId ?? maintenance?.control?.mappingJobId
  const visibleBulkJobId = bulkJobId ?? maintenance?.control?.bulkJobId
  const liveDefinition = review ? fees.results.find(row => row.definition._id === review.definition._id) : null
  const fresh = !!review && maintenance?.canMove === true && maintenance.control?.revision === review.orderRevision && liveDefinition?.definition.revision === review.definition.revision && (review.direction === 'up' ? liveDefinition.canMoveUp : liveDefinition.canMoveDown)
  function open(definition: Doc<'feeDefinitions'>, direction: 'up' | 'down') {
    if (!maintenance?.control || !maintenance.canMove) return
    setReview({ definition, direction, orderRevision: maintenance.control.revision }); setReason(''); setError(null)
  }
  async function submit() {
    if (!review || !fresh || pending || reason.trim().length < 8) return
    setPending(true); setError(null)
    try {
      const fingerprint = JSON.stringify([review.definition._id, review.direction, review.orderRevision, review.definition.revision, reason.trim()])
      if (submittedIntent.current?.fingerprint !== fingerprint) submittedIntent.current = { fingerprint, key: crypto.randomUUID() }
      const id = await move({ feeDefinitionId: review.definition._id, direction: review.direction, expectedOrderRevision: review.orderRevision, expectedDefinitionRevision: review.definition.revision, reason: reason.trim(), idempotencyKey: submittedIntent.current.key })
      setJobId(id); setReview(null)
    } catch (failure) { setError(failure instanceof Error ? failure.message : copy.unavailable) }
    finally { setPending(false) }
  }
  return <div className={styles.root}>
    {maintenance?.control && <FeeMaintenanceNotice state={maintenance.control.state} />}
    <Card className={styles.card}><CardTitle>{copy.title}</CardTitle><p className={styles.muted}>{copy.description} {copy.futureOnly}</p>
      {!maintenance || fees.status === 'LoadingFirstPage' ? <p role="status">{copy.loading}</p> : <>
        {maintenance.mappingState !== 'ready' && <p className={styles.notice}>{maintenance.mappingState === 'uninitialized' ? copy.mappingUnknown : copy.partialOrder}</p>}
        {fees.results.length === 0 && fees.status === 'Exhausted' && <p>{copy.noFees}</p>}
        <FeePriorityRows disabled={pending || maintenance.control?.state !== 'ready'} rows={fees.results.map(row => ({ key: row.definition._id, label: row.definition.label, priority: row.definition.priority, amountCents: row.definition.defaultAmountCents, cancelled: row.definition.state === 'cancelled', actions: {
          view: row.definition.latestJobId ? ()=>{if(row.definition.latestJobId)setBulkJobId(row.definition.latestJobId)} : undefined,
          up: row.canMoveUp ? () => open(row.definition, 'up') : undefined,
          down: row.canMoveDown ? () => open(row.definition, 'down') : undefined,
          edit: isCoach && row.canEdit ? () => setBulkDraft({kind:'edit',definition:row.definition}) : undefined,
          cancel: isCoach && row.canCancel ? () => setBulkDraft({kind:'cancel',definition:row.definition}) : undefined,
        } }))} />
        {isCoach && maintenance.canManageFees && maintenance.mappingState === 'ready' && <Button type="button" onClick={()=>setBulkDraft({kind:'create'})}>{copy.add}</Button>}
        {fees.status !== 'Exhausted' && <Button type="button" variant="outline" disabled={fees.status !== 'CanLoadMore'} onClick={() => fees.loadMore(20)}>{copy.moreFees}</Button>}
      </>}
      {review && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}><strong>{review.definition.label} · {review.direction === 'up' ? copy.up : copy.down}</strong><p>{copy.futureOnly}</p>
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
    {isCoach && bulkDraft && <BulkPreparationForm key={`${bulkDraft.kind}:${bulkDraft.definition?._id??'new'}`} {...bulkDraft} disabled={!maintenance?.canManageFees} onDismiss={()=>setBulkDraft(null)} onJob={id=>{setBulkJobId(id);setBulkDraft(null)}} />}
    {visibleBulkJobId && <BulkJobWorkspace key={visibleBulkJobId} jobId={visibleBulkJobId} isCoach={isCoach} onSelect={setBulkJobId}/>} 
  </div>
}

type UnmappedRow = FunctionReturnType<typeof api.feeDefinitions.unmapped>['page'][number]

function BulkPreparationForm({ kind, definition, disabled, onDismiss, onJob }: {
  kind:'create'|'edit'|'cancel'
  definition?:Doc<'feeDefinitions'>
  disabled:boolean
  onDismiss:()=>void
  onJob:(id:Id<'feeBulkJobs'>)=>void
}) {
  const prepare=useMutation(api.feeDefinitions.prepareBulk)
  const latest=useQuery(api.feeDefinitions.bulkStatus,definition?.latestJobId?{jobId:definition.latestJobId}:'skip')
  const events=usePaginatedQuery(api.feeDefinitions.events,{}, {initialNumItems:20})
  const students=usePaginatedQuery(api.feeDefinitions.students,{}, {initialNumItems:20})
  const [label,setLabel]=useState(definition?.label??'')
  const [amount,setAmount]=useState(definition?`${BigInt(definition.defaultAmountCents)/100n}.${String(BigInt(definition.defaultAmountCents)%100n).padStart(2,'0')}`:'')
  const [reason,setReason]=useState('')
  const [scope,setScope]=useState<'allActive'|'selected'>('allActive')
  const [existingScope,setExistingScope]=useState(kind!=='create')
  const [eventId,setEventId]=useState<Id<'events'>|null>(definition?.eventId??null)
  const [studentIds,setStudentIds]=useState<ReadonlyArray<Id<'students'>>>([])
  const [pending,setPending]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [reviewedPrior,setReviewedPrior]=useState<{jobId:Id<'feeBulkJobs'>;held:number}|null>(null)
  const intent=useRef<{fingerprint:string;key:string}|null>(null)
  const cents=kind==='cancel'?0:parseChargeTarget(amount)
  const effectiveScope=existingScope?'existingCharges':eventId?'confirmedEvent':scope
  const scopeValid=effectiveScope!=='selected'||studentIds.length>0
  const priorReady=(!definition?.latestJobId||!!latest)&&(kind!=='cancel'||latest?.job.state!=='held'||reviewedPrior?.jobId===latest.job._id&&reviewedPrior.held===latest.job.held)
  async function submit(){
    if(disabled||pending||!label.trim()||cents===null||!scopeValid||!priorReady||reason.trim().length<8)return
    setPending(true);setError(null)
    const input={kind,feeDefinitionId:definition?._id,label:kind==='create'?label.trim():undefined,targetAmountCents:cents,scope:effectiveScope,studentIds:effectiveScope==='selected'?[...studentIds]:undefined,eventId:eventId??undefined,supersedeHeldJobId:latest?.job.state==='held'?reviewedPrior?.jobId:undefined,expectedHeldRows:latest?.job.state==='held'?reviewedPrior?.held:undefined,reason:reason.trim()} as const
    const fingerprint=JSON.stringify(input)
    if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,key:crypto.randomUUID()}
    try{onJob(await prepare({...input,idempotencyKey:intent.current.key}))}
    catch(failure){setError(failure instanceof Error?failure.message:copy.unavailable)}
    finally{setPending(false)}
  }
  return <Card className={`${styles.card} ${styles.formCard}`}><CardTitle>{kind==='create'?copy.add:kind==='cancel'?copy.cancel:copy.edit}</CardTitle><p>{copy.prepareBulkNote} {copy.scopeNote}</p>
    {kind==='cancel'&&latest?.job.state==='held'&&<PriorHeldScopeReview key={latest.job._id} jobId={latest.job._id} held={latest.job.held} disabled={disabled||pending} onReviewed={()=>setReviewedPrior({jobId:latest.job._id,held:latest.job.held})}/>}
    <form className={styles.form} onSubmit={event=>{event.preventDefault();void submit()}}>
      <label className={styles.field}>{copy.name}<Input value={label} required maxLength={150} disabled={disabled||pending||kind!=='create'} onChange={event=>setLabel(event.target.value)}/></label>
      {kind!=='cancel'&&<label className={styles.field}>{copy.amount}<Input value={amount} required inputMode="decimal" disabled={disabled||pending} onChange={event=>setAmount(event.target.value)}/></label>}
      {kind==='cancel'?<p>{copy.cancelNote} {copy.cancelTarget}</p>:<>
        {definition&&<div className={styles.scope}><Button type="button" variant={existingScope?'default':'outline'} disabled={disabled||pending} onClick={()=>setExistingScope(true)}>{copy.existingCharges}</Button><Button type="button" variant={!existingScope?'default':'outline'} disabled={disabled||pending} onClick={()=>setExistingScope(false)}>{copy.changeScope}</Button></div>}
        {existingScope?<p>{copy.existingScopeNote}</p>:<FeeScopeFields eventSelectionDisabled={!!definition} eventId={eventId} events={events.results.filter(event=>!event.archived).map(event=>({id:event.eventId,name:event.name}))} onEventChange={setEventId} scope={scope} onScopeChange={setScope} students={students.results.map(student=>({id:student.studentId,name:student.name,checked:studentIds.includes(student.studentId),disabled:studentIds.length>=500&&!studentIds.includes(student.studentId)}))} onStudentChange={(id,checked)=>setStudentIds(previous=>checked?previous.includes(id)?previous:previous.length<500?[...previous,id]:previous:previous.filter(value=>value!==id))} disabled={disabled||pending} loadingStudents={students.status==='LoadingFirstPage'||students.status==='LoadingMore'} moreStudents={students.status!=='Exhausted'} loadStudents={()=>students.loadMore(20)} loadingEvents={events.status==='LoadingFirstPage'||events.status==='LoadingMore'} moreEvents={events.status!=='Exhausted'} loadEvents={()=>events.loadMore(20)}/>}
      </>}
      {effectiveScope==='selected'&&<p>{copy.studentsSelected}: {studentIds.length} / 500</p>}<label className={styles.field}>{copy.reason}<Input value={reason} required maxLength={1000} disabled={disabled||pending} onChange={event=>setReason(event.target.value)}/></label>
      <Button type="submit" disabled={disabled||pending||!label.trim()||cents===null||!scopeValid||!priorReady||reason.trim().length<8}>{pending?copy.submitting:copy.prepareBulk}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={onDismiss}>{copy.dismiss}</Button>
      {error&&<p role="alert">{error}</p>}
    </form>
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

function BulkJobWorkspace({jobId,isCoach,onSelect}:{jobId:Id<'feeBulkJobs'>;isCoach:boolean;onSelect:(id:Id<'feeBulkJobs'>)=>void}){
  const status=useQuery(api.feeDefinitions.bulkStatus,{jobId})
  if(!status)return <p role="status">{copy.loading}</p>
  return <BulkJobSummary {...status}>
    {status.job.supersededByJobId&&<Button type="button" variant="outline" onClick={()=>{if(status.job.supersededByJobId)onSelect(status.job.supersededByJobId)}}>{copy.openSupersedingOperation}</Button>}
    {isCoach&&<BulkJobReview jobId={jobId} canCancel={status.canCancel} canRetry={status.canRetry}/>}
    <BulkJobHistory definitionId={status.job.feeDefinitionId} onSelect={onSelect}/>
  </BulkJobSummary>
}

function BulkJobHistory({definitionId,onSelect}:{definitionId:Id<'feeDefinitions'>;onSelect:(id:Id<'feeBulkJobs'>)=>void}){
  const history=usePaginatedQuery(api.feeDefinitions.bulkJobs,{feeDefinitionId:definitionId},{initialNumItems:20})
  return <div className={styles.form}><strong>{copy.history}</strong>{history.status==='LoadingFirstPage'?<p role="status">{copy.loading}</p>:<>{history.results.length===0&&<p>{copy.noHistory}</p>}{history.results.map(job=><div className={styles.historyRow} key={job._id}><strong>{copy.bulkStates[job.state]}</strong><span>{copy.bulkKinds[job.kind]} · {copy.bulkScopes[job.scope]} · {copy.targetAmount}: {chargeCurrency(job.targetAmountCents)}</span><span>{new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(job.createdAt)}</span><p>{copy.reason}: {job.reason}</p><Button type="button" variant="outline" onClick={()=>onSelect(job._id)}>{copy.details}</Button></div>)}{history.status!=='Exhausted'&&<Button type="button" variant="outline" disabled={history.status!=='CanLoadMore'} onClick={()=>history.loadMore(20)}>{copy.moreHistory}</Button>}</>}</div>
}

export function BulkJobSummary({job,originalActorName,processingActorName,children}:{job:Doc<'feeBulkJobs'>;originalActorName:string;processingActorName:string;children?:ReactNode}){
  return <Card className={styles.card}><CardTitle>{copy.bulkReceipt}</CardTitle>
    <p role={job.state==='failed'?'alert':'status'}>{copy.bulkStates[job.state]}</p>
    <p>{copy.originalScope}: {copy.bulkScopes[job.scope]} · {copy.scopeMembers}: {job.snapshotComplete?job.snapshotCount:copy.unknownScopeCount}</p>
    <p>{copy.targetAmount}: {chargeCurrency(job.targetAmountCents)}</p>
    <p>{copy.recordsProcessed}: {job.processed} · {copy.committedRows}: {job.committed} · {copy.heldRows}: {job.held}</p>
    {job.priorHeldJobId&&<><p>{copy.plannedSuperseded}: {job.priorHeldRows??copy.unavailable}</p><p>{copy.committedSuperseded}: {job.supersededRows}</p><p className={styles.muted}>{copy.supersedeFinalOnly}</p></>}
    <p>{copy.requestedBy}: {originalActorName} · {copy.processedBy}: {processingActorName}</p><p>{copy.reason}: {job.reason}</p>
    {job.lastError&&<p role="alert">{job.lastError}</p>}
    {children}
  </Card>
}

type BulkPreview=FunctionReturnType<typeof api.feeDefinitions.previewBulk>
function BulkJobReview({jobId,canCancel,canRetry}:{jobId:Id<'feeBulkJobs'>;canCancel:boolean;canRetry:boolean}){
  const preview=useQuery(api.feeDefinitions.previewBulk,{jobId})
  const rows=usePaginatedQuery(api.feeDefinitions.bulkRows,{jobId},{initialNumItems:20})
  const commit=useMutation(api.feeDefinitions.commitBulk)
  const cancel=useMutation(api.feeDefinitions.cancelPrepared)
  const retry=useMutation(api.feeDefinitions.retryBulk)
  const [review,setReview]=useState<BulkPreview|null>(null)
  const [reason,setReason]=useState('')
  const [pending,setPending]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [retryRows,setRetryRows]=useState<FunctionArgs<typeof api.feeDefinitions.retryBulk>['rows']>([])
  const [priorReviewed,setPriorReviewed]=useState(false)
  const priorReviewReady=!preview?.job.priorHeldJobId||priorReviewed
  const fresh=!!review&&preview?.canCommit===true&&preview.expectedScopeHash===review.expectedScopeHash&&preview.expectedOrderRevision===review.expectedOrderRevision&&preview.expectedDefinitionRevision===review.expectedDefinitionRevision
  const freshRetry=retryRows.every(selected=>rows.results.some(row=>row._id===selected.rowId&&row.state==='held'&&!row.correctionJobId&&!row.allocationJobId&&row.financialState==='ready'&&row.currentFinancialRevision===selected.expectedFinancialRevision&&row.currentGeneration===selected.expectedGeneration&&row.currentChargeRevision===selected.expectedChargeRevision))
  const unfinishedChild=rows.status!=='Exhausted'||rows.results.some(row=>row.state==='waiting'&&(row.childState!=='complete'||row.financialState!=='ready'))
  async function resume(){
    if(pending||!canRetry||!freshRetry||unfinishedChild||reason.trim().length<8||preview?.job.state==='held'&&retryRows.length===0)return
    setPending(true);setError(null)
    try{await retry({jobId,rows:retryRows,reason:reason.trim()});setRetryRows([]);setReason('')}
    catch(failure){setError(failure instanceof Error?failure.message:copy.unavailable)}finally{setPending(false)}
  }
  async function act(action:'commit'|'cancel'){
    if(pending||reason.trim().length<8||action==='commit'&&(!review||!fresh||!priorReviewReady)||action==='cancel'&&!canCancel)return
    setPending(true);setError(null)
    try{
      if(action==='cancel')await cancel({jobId,reason:reason.trim()})
      else if(review)await commit({jobId,expectedScopeHash:review.expectedScopeHash,expectedOrderRevision:review.expectedOrderRevision,expectedDefinitionRevision:review.expectedDefinitionRevision,reason:reason.trim()})
      setReview(null);setReason('')
    }catch(failure){setError(failure instanceof Error?failure.message:copy.unavailable)}finally{setPending(false)}
  }
  return <div className={styles.form}>
    {preview&&<><strong>{preview.definition.label}</strong>{preview.message&&['prepared','preparing','draining'].includes(preview.job.state)&&<p>{preview.message}</p>}</>}
    {preview?.job.state==='prepared'&&preview.job.priorHeldJobId&&preview.job.priorHeldRows!==undefined&&<PriorHeldScopeReview jobId={preview.job.priorHeldJobId} held={preview.job.priorHeldRows} disabled={pending} onReviewed={()=>setPriorReviewed(true)}/>}
    {rows.status==='LoadingFirstPage'?<p role="status">{copy.loading}</p>:<>{rows.results.map(row=><BulkRowEvidence key={row._id} row={row}>{row.canRetryChild&&<BulkChildRetry row={row} disabled={pending}/>}</BulkRowEvidence>)}{rows.status!=='Exhausted'&&<Button type="button" variant="outline" disabled={rows.status!=='CanLoadMore'||pending} onClick={()=>rows.loadMore(20)}>{copy.moreRows}</Button>}</>}
    {preview?.canCommit&&!review&&<Button type="button" disabled={pending||!priorReviewReady||rows.status!=='Exhausted'} onClick={()=>{setReview(preview);setReason('')}}>{copy.preview}</Button>}
    {(review||canCancel)&&<form className={styles.form} onSubmit={event=>{event.preventDefault();void act(review?'commit':'cancel')}}>{review&&<><p>{copy.reviewedScope}: {review.scopeMemberCount} · {copy.targetAmount}: {chargeCurrency(review.job.targetAmountCents)}</p>{!fresh&&<p role="alert">{copy.staleReview}</p>}<p>{copy.noCash}</p></>}<label className={styles.field}>{copy.reason}<Input value={reason} required maxLength={1000} disabled={pending} onChange={event=>setReason(event.target.value)}/></label>{review&&<Button type="submit" disabled={pending||!fresh||reason.trim().length<8}>{pending?copy.submitting:copy.post}</Button>}{canCancel&&<Button type={review?'button':'submit'} variant="outline" disabled={pending||reason.trim().length<8} onClick={()=>{if(review)void act('cancel')}}>{copy.cancelPrepared}</Button>}</form>}
    {error&&<p role="alert">{error}</p>}
    {canRetry&&<form className={styles.form} onSubmit={event=>{event.preventDefault();void resume()}}><p>{copy.retryScopeNote}</p>
      {rows.results.filter(row=>row.state==='held'&&!row.correctionJobId&&!row.allocationJobId).map(row=><label className={styles.checkbox} key={row._id}><Checkbox checked={retryRows.some(selected=>selected.rowId===row._id)} disabled={pending||row.financialState!=='ready'||row.currentFinancialRevision===null||row.currentGeneration===null} onCheckedChange={checked=>{
        if(!checked){setRetryRows(previous=>previous.filter(selected=>selected.rowId!==row._id));return}
        const financialRevision=row.currentFinancialRevision,generation=row.currentGeneration
        if(financialRevision!==null&&generation!==null&&retryRows.length<20)setRetryRows(previous=>previous.some(selected=>selected.rowId===row._id)?previous:[...previous,{rowId:row._id,expectedFinancialRevision:financialRevision,expectedGeneration:generation,expectedChargeRevision:row.currentChargeRevision}])
      }}/>{row.name} · {copy.refreshedFinancialRevision}: {row.currentFinancialRevision??copy.unavailable} · {copy.chargeRevision}: {row.currentChargeRevision??copy.unavailable}</label>)}
      {!freshRetry&&<p role="alert">{copy.staleRetry}</p>}
      {unfinishedChild&&<p>{copy.childBeforeParent}</p>}<label className={styles.field}>{copy.retryReason}<Input value={reason} maxLength={1000} required disabled={pending} onChange={event=>setReason(event.target.value)}/></label><Button type="submit" disabled={pending||unfinishedChild||!freshRetry||reason.trim().length<8||preview?.job.state==='held'&&retryRows.length===0}>{pending?copy.submitting:copy.retry}</Button>
    </form>}
  </div>
}

type BulkRow=FunctionReturnType<typeof api.feeDefinitions.bulkRows>['page'][number]
export function BulkRowEvidence({row,children}:{row:BulkRow;children?:ReactNode}){
  return <div className={styles.historyRow}><strong>{row.name}</strong><span>{copy.rowStates[row.state]}</span>
    <span>{copy.originalEffective}: {row.beforeEffectiveCents===undefined?copy.unavailable:chargeCurrency(row.beforeEffectiveCents)} · {copy.originalApplied}: {row.beforeAppliedCents===undefined?copy.unavailable:chargeCurrency(row.beforeAppliedCents)}</span>
    <span>{copy.originalFinancialRevision}: {row.originalExpectedFinancialRevision??copy.unavailable} · {copy.originalChargeRevision}: {row.originalExpectedChargeRevision??copy.unavailable}</span>
    <span>{copy.targetAmount}: {chargeCurrency(row.targetAmountCents)}</span>
    <span>{copy.currentEffective}: {row.currentEffectiveCents===null?copy.unavailable:chargeCurrency(row.currentEffectiveCents)} · {copy.currentApplied}: {row.currentAppliedCents===null?copy.unavailable:chargeCurrency(row.currentAppliedCents)}</span>
    <span>{copy.releaseRequired}: {row.releaseRequiredCents===null?copy.unavailable:chargeCurrency(row.releaseRequiredCents)}</span>
    {row.childState&&<span>{copy.childStates[row.childState]}</span>}
    {row.correctionJobId&&<span>{copy.committedRelease}: {chargeCurrency(row.committedReleaseCents)} / {chargeCurrency(row.totalReleaseCents)}</span>}
    {row.financialState!=='ready'&&<p>{copy.rowFinancialPending}</p>}{row.message&&<p>{row.message}</p>}{row.childError&&<p role="alert">{row.childError}</p>}{children}
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
    }catch(failure){setError(failure instanceof Error?failure.message:copy.unavailable)}finally{setPending(false)}
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
    } catch (failure) { setError(failure instanceof Error ? failure.message : copy.unavailable) }
    finally { setPending(false) }
  }
  return <Card className={styles.card}><CardTitle>{copy.legacy}</CardTitle><p>{copy.legacyNote}</p>
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
      {reviewed && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}><strong>{copy.mappingTarget}: {reviewed.definition.label}</strong><UnmappedFeeEvidence rows={reviewed.rows.map(row => ({ ...row, selected: true }))} disabled onSelect={() => undefined} /><p>{copy.mappingNoMoney}</p>{!fresh && <p role="alert">{copy.staleReview}</p>}<label className={styles.field}>{copy.reason}<Input value={reason} maxLength={1000} required disabled={pending} onChange={event => setReason(event.target.value)} /></label><Button type="submit" disabled={pending || !fresh || reason.trim().length < 8}>{pending ? copy.submitting : copy.mapConfirm}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setReviewed(null)}>{copy.dismiss}</Button></form>}
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
  const cents = parseChargeTarget(amount)
  async function submit() {
    if (disabled || pending || !label.trim() || cents === null || reason.trim().length < 8) return
    setPending(true); setError(null)
    const fingerprint = JSON.stringify([label.trim(), cents, eventId, orderRevision, reason.trim()])
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() }
    try { const id = await create({ label: label.trim(), kind: eventId ? 'eventExtra' : 'custom', eventId, defaultAmountCents: cents, expectedOrderRevision: orderRevision, reason: reason.trim(), idempotencyKey: intent.current.key }); onCreated(id); setCreated(true); setOpen(false) }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.unavailable) }
    finally { setPending(false) }
  }
  return <div className={styles.form}><Button type="button" variant="outline" disabled={disabled || pending || created} onClick={() => setOpen(value => !value)}>{copy.createMappingDefinition}</Button>
    {open && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}><p>{copy.mappingDefinitionNote}</p><label className={styles.field}>{copy.name}<Input value={label} required maxLength={150} disabled={disabled || pending} onChange={event => setLabel(event.target.value)} /></label><label className={styles.field}>{copy.defaultAmount}<Input value={amount} required inputMode="decimal" disabled={disabled || pending} onChange={event => setAmount(event.target.value)} /></label><label className={styles.field}>{copy.reason}<Input value={reason} required maxLength={1000} disabled={disabled || pending} onChange={event => setReason(event.target.value)} /></label><Button type="submit" disabled={disabled || pending || !label.trim() || cents === null || reason.trim().length < 8}>{pending ? copy.submitting : copy.createMappingDefinition}</Button></form>}
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
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.unavailable) }
    finally { setPending(false) }
  }
  return <Card className={styles.card}><CardTitle>{copy.prepareMapping}</CardTitle><p>{copy.proofNote}</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}>
      <label className={styles.field}>{copy.reason}<Input value={reason} maxLength={1000} required disabled={pending || !!jobId} onChange={event => setReason(event.target.value)} /></label>
      <Button type="submit" disabled={pending || !!jobId || reason.trim().length < 8}>{pending ? copy.submitting : copy.prepareMapping}</Button>
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
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.unavailable) }
    finally { setPending(false) }
  }
  if (!result) return <p role="status">{copy.loading}</p>
  return <Card className={styles.card}><CardTitle>{copy.mappingReceipt}</CardTitle>
    <p role={result.job.state === 'failed' ? 'alert' : 'status'}>{result.job.state === 'cancelled' ? copy.mappingCancelled : result.job.state === 'complete' ? copy.mappingPassComplete : result.job.state === 'failed' ? copy.failed : result.job.state === 'draining' ? copy.draining : copy.applying}</p>
    <p>{copy.recordsProcessed}: {result.job.processed} · {copy.mapped}: {result.job.mapped} · {copy.unmapped}: {result.job.unmapped}</p>
    <p>{copy.requestedBy}: {result.originalActorName} · {copy.processedBy}: {result.processingActorName}</p><p>{copy.reason}: {result.job.reason}</p>
    {result.job.lastError && <p role="alert">{result.job.lastError}</p>}
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
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.unavailable) }
    finally { setPending(false) }
  }
  return <><FeePriorityReceipt {...result} retryReason={reason} onRetryReasonChange={setReason} onRetry={() => void resume()} submitting={pending} />{error && <p role="alert">{error}</p>}</>
}

type FeeRowPresentation = {
  key: string
  label: string
  priority: number
  amountCents: number
  summary?: string
  cancelled: boolean
  actions?: {
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
  const cents = parseChargeTarget(amount)
  async function prepare() {
    if (pending || disabled || !scopeValid || !label.trim() || cents === null || reason.trim().length < 8) return
    setPending(true); setError(null)
    try { await onPrepare({ label: label.trim(), targetAmountCents: cents, reason: reason.trim() }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.unavailable) }
    finally { setPending(false) }
  }
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); void prepare() }}>
    <label className={styles.field}>{copy.name}<Input value={label} required disabled={disabled || pending} onChange={event => setLabel(event.target.value)} /></label>
    <label className={styles.field}>{copy.amount}<Input value={amount} required inputMode="decimal" disabled={disabled || pending} onChange={event => setAmount(event.target.value)} /></label>
    <fieldset className={styles.form} disabled={disabled || pending}>{scopeFields}</fieldset>
    <label className={styles.field}>{copy.reason}<Input value={reason} maxLength={1000} required disabled={disabled || pending} onChange={event => setReason(event.target.value)} /></label>
    <p className={styles.muted}>{copy.prepareBulkNote} {copy.append}</p>
    <Button type="submit" disabled={disabled || pending || !scopeValid || !label.trim() || cents === null || reason.trim().length < 8}>{pending ? copy.submitting : copy.prepareBulk}</Button>
    {error && <p role="alert">{error}</p>}
  </form>
}

/** Presentation receives recorded ranks and permitted actions from its caller. */
export function FeePriorityRows({ rows, disabled }: { rows: ReadonlyArray<FeeRowPresentation>; disabled: boolean }) {
  return <div className={styles.order}>{rows.map(row => <div className={styles.fee} key={row.key}>
    <span className={styles.rank} aria-label={`Recorded fee priority ${row.priority}`}>{row.priority}</span>
    <div className={styles.feeName}><strong>{row.label}</strong><span className={styles.muted}>{copy.defaultAmount}: {chargeCurrency(row.amountCents)}{row.summary ? ` · ${row.summary}` : ''}</span>{row.cancelled && <span className={styles.status}>{copy.cancelled}</span>}</div>
    {row.actions && <div className={styles.feeActions}>
      {row.actions.view && <Button type="button" variant="outline" aria-label={`${copy.details} ${row.label}`} onClick={row.actions.view}>{copy.details}</Button>}
      {row.actions.edit && <Button type="button" variant="outline" disabled={disabled} aria-label={`${copy.edit} ${row.label}`} onClick={row.actions.edit}>{copy.edit}</Button>}
      {row.actions.cancel && <Button type="button" variant="outline" disabled={disabled} aria-label={`${copy.cancel} ${row.label}`} onClick={row.actions.cancel}>{copy.cancel}</Button>}
      {row.actions.up && <Button type="button" variant="outline" disabled={disabled} aria-label={`Move ${row.label} up`} onClick={row.actions.up}>{copy.up}</Button>}
      {row.actions.down && <Button type="button" variant="outline" disabled={disabled} aria-label={`Move ${row.label} down`} onClick={row.actions.down}>{copy.down}</Button>}
    </div>}
  </div>)}</div>
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
    {job.lastError && <p role="alert">{job.lastError}</p>}
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
      <span className={styles.muted}>{copy.recordedPriority}: {row.charge.priority} · {copy.chargeRevision}: {row.charge.revision ?? 0}</span>
    </div>
  </div>)}</div>
}

/** Controlled scope fields; no membership or monetary facts are generated here. */
export function FeeScopeFields({ eventId, events, onEventChange, scope, onScopeChange, students, onStudentChange, disabled, loadingStudents, moreStudents, loadStudents, loadingEvents, moreEvents, loadEvents, eventSelectionDisabled }: {
  eventId: Id<'events'> | null
  events: ReadonlyArray<{ id: Id<'events'>; name: string }>
  onEventChange: (eventId: Id<'events'> | null) => void
  scope: 'allActive' | 'selected'
  onScopeChange: (scope: 'allActive' | 'selected') => void
  students: ReadonlyArray<{ id: Id<'students'>; name: string; checked: boolean; disabled?: boolean }>
  onStudentChange: (studentId: Id<'students'>, checked: boolean) => void
  disabled: boolean
  loadingStudents: boolean
  moreStudents: boolean
  loadStudents: () => void
  loadingEvents?: boolean
  moreEvents?: boolean
  loadEvents?: () => void
  eventSelectionDisabled?: boolean
}) {
  return <div className={styles.form}>
    <label className={styles.field}>{copy.connectedTo}<NativeSelect value={eventId ?? ''} disabled={disabled || eventSelectionDisabled} onChange={event => {
      if (!event.target.value) { onEventChange(null); return }
      const selected = events.find(option => option.id === event.target.value)
      if (selected) onEventChange(selected.id)
    }}><NativeSelectOption value="">{copy.noEvent}</NativeSelectOption>{eventId && !events.some(option => option.id === eventId) && <NativeSelectOption value={eventId} disabled>Loading connected event…</NativeSelectOption>}{events.map(event => <NativeSelectOption value={event.id} key={event.id}>{event.name}</NativeSelectOption>)}</NativeSelect></label>
    {loadingEvents && <p role="status">{copy.loadingEvents}</p>}
    {moreEvents && loadEvents && <Button type="button" variant="outline" disabled={disabled || loadingEvents} onClick={loadEvents}>{copy.moreEvents}</Button>}
    {eventId ? <p className={styles.muted}>{copy.confirmedScope}</p> : <>
      <span className={styles.field}>{copy.whoOwes}</span>
      <div className={styles.scope} role="group" aria-label={copy.whoOwes}><Button type="button" variant={scope === 'allActive' ? 'default' : 'outline'} aria-pressed={scope === 'allActive'} disabled={disabled} onClick={() => onScopeChange('allActive')}>{copy.allActive}</Button><Button type="button" variant={scope === 'selected' ? 'default' : 'outline'} aria-pressed={scope === 'selected'} disabled={disabled} onClick={() => onScopeChange('selected')}>{copy.selected}</Button></div>
      {scope === 'allActive' ? <p className={styles.muted}>{copy.allActiveSnapshot}</p> : <>
        <div className={styles.students}>{students.map(student => <label className={styles.checkbox} key={student.id}><Checkbox checked={student.checked} disabled={disabled || student.disabled} onCheckedChange={checked => onStudentChange(student.id, checked)} />{student.name}</label>)}</div>
        {loadingStudents && <p role="status">{copy.loading}</p>}
        {!loadingStudents && !moreStudents && students.length === 0 && <p>{copy.noStudents}</p>}
        {moreStudents && <Button type="button" variant="outline" disabled={disabled || loadingStudents} onClick={loadStudents}>{copy.moreStudents}</Button>}
      </>}
    </>}
  </div>
}
