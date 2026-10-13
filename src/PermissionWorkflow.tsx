import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import type { ConsentSnapshot, MedicationChoices } from '../convex/lib/consentSnapshot'
import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { permissionWorkflowCopy as copy } from './lib/permission-workflow-copy'
import styles from './PermissionWorkflow.module.css'

type MedicationKey=keyof MedicationChoices
type ChoiceDraft=Record<MedicationKey,MedicationChoices[MedicationKey]|''>
type Workspace=FunctionReturnType<typeof api.permissions.workspace>
type CorrectionField=NonNullable<Workspace['coverage'][number]['field']>
type HealthReport=Workspace['student']['allergies']
type PreparedElectronic=FunctionReturnType<typeof api.permissions.prepare>
type PaperArgs=FunctionArgs<typeof api.permissions.preparePaper>
type PreparedPaper=FunctionReturnType<typeof api.permissions.preparePaper>
type Receipt=FunctionReturnType<typeof api.permissions.receipt>
type ExportPage=FunctionReturnType<typeof api.permissions.exportPacket>
type ExportArgs=FunctionArgs<typeof api.permissions.exportPacket>
const workspaceQuery=api.permissions.workspace
const receiptQuery=api.permissions.receipt
const prepareMutation=api.permissions.prepare
const submitMutation=api.permissions.submitDraft
const preparePaperMutation=api.permissions.preparePaper
const paperMutation=api.permissions.recordPaper
const reviewMutation=api.permissions.review
const requestMutation=api.permissions.requestNewSignature
const exportMutation=api.permissions.exportPacket
const emptyChoices=():ChoiceDraft=>({pain:'',allergy:'',cold:''})
const when=(at:number)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(at)
const date=(at:number)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'short',day:'numeric'}).format(at)
const healthText=(report:ConsentSnapshot['health']['allergies'])=>report.state==='none'?copy.healthOptions.none:report.text??copy.healthOptions.reported
const completeChoices=(draft:ChoiceDraft):MedicationChoices|null=>draft.pain&&draft.allergy&&draft.cold?{pain:draft.pain,allergy:draft.allergy,cold:draft.cold}:null
const errorText=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback

class PermissionBoundary extends Component<{children:ReactNode;retry:()=>void},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  render(){return this.state.failed?<Card className={styles.card}><h2>{copy.unavailable}</h2><p>{copy.unavailableDescription}</p><Button variant="outline" onClick={this.props.retry}>{copy.retry}</Button></Card>:this.props.children}
}
function WorkspaceBoundary({children}:{children:ReactNode}){const[attempt,setAttempt]=useState(0);return<PermissionBoundary key={attempt} retry={()=>setAttempt(attempt+1)}>{children}</PermissionBoundary>}
function Status({state}:{state:keyof typeof copy.status}){return<span className={`${styles.status} ${state==='accepted'?styles.accepted:state==='correction'?styles.correction:''}`}>{copy.status[state]}</span>}

function EventSelection({events,selected,onChange,disabled=false}:{events:ConsentSnapshot['events'];selected:Id<'events'>[];onChange:(ids:Id<'events'>[])=>void;disabled?:boolean}){
  return <div className={styles.events}>{events.map(event=><label className={`${styles.event} ${styles.checkbox}`} key={event.eventId}><Checkbox checked={selected.includes(event.eventId)} disabled={disabled} onCheckedChange={checked=>onChange(checked?[...selected,event.eventId]:selected.filter(id=>id!==event.eventId))}/><span><strong>{event.name} · {event.type}</strong><br/>{date(event.startsAt)} – {date(event.endsAt)} · {event.destination}<br/><span className={styles.muted}>{event.travel}</span></span></label>)}</div>
}

function CurrentCoverage({workspace}:{workspace:Workspace}){
  return <Card className={styles.card}><CardTitle>{copy.currentCoverage}</CardTitle>{workspace.events.length?<div className={styles.events}>{workspace.events.map(event=>{const coverage=workspace.coverage.find(row=>row.eventId===event.eventId);return <div className={styles.event} key={event.eventId}><div className={styles.eventTop}><strong>{event.name}</strong><Status state={coverage?.state??'required'}/></div><span className={styles.muted}>{date(event.startsAt)} · {event.destination}</span>{coverage?.reason&&<p className={styles.notice}>{coverage.reason}</p>}{coverage?.signatureRequestedAt!==null&&coverage?.signatureRequestedAt!==undefined&&<p className={styles.muted}>{copy.requestedAgain} · {when(coverage.signatureRequestedAt)}</p>}</div>})}</div>:<p className={styles.muted}>{copy.noEvents}</p>}</Card>
}

export function ParentPermissionWorkflow({studentId}:{studentId:Id<'students'>|null}){
  if(!studentId)return <div className={styles.root}><h1>{copy.title}</h1><p>{copy.noStudent}</p></div>
  return <div className={styles.root}><WorkspaceBoundary key={studentId}><ParentWorkspace studentId={studentId}/></WorkspaceBoundary></div>
}
function ParentWorkspace({studentId}:{studentId:Id<'students'>}){
  const workspace=useQuery(workspaceQuery,{studentId});const[editing,setEditing]=useState(false);const[receipt,setReceipt]=useState<Id<'permissionSubmissions'>|null>(null)
  if(!workspace)return<p role="status">{copy.loading}</p>
  return <><div className="page-head"><div><h1>{copy.title}</h1><p className="muted">{workspace.student.legalName} · {copy.parentDescription}</p></div></div><p className={styles.notice}>{copy.syntheticNotice}</p>{workspace.gateReason&&<p role="status" className={styles.notice}>{workspace.gateReason}</p>}
    {editing?<ParentWizard key={studentId} workspace={workspace} cancel={()=>setEditing(false)} submitted={id=>{setEditing(false);setReceipt(id)}}/>:<><CurrentCoverage workspace={workspace}/><Card className={styles.card}><CardTitle>{copy.currentWording}</CardTitle>{workspace.version?<><strong>{workspace.version.title} · {workspace.version.version}</strong><p className={styles.muted}>{workspace.version.schoolName} · {workspace.version.teamName}</p></>:<p>{copy.noVersion}</p>}<Button disabled={!workspace.canSign||!workspace.version||workspace.events.length===0} onClick={()=>setEditing(true)}>{copy.start}</Button>{!workspace.canSign&&<p className={styles.muted}>{copy.signingClosed}</p>}</Card></>}
    {!editing&&<ReceiptHistory workspace={workspace} selected={receipt} choose={setReceipt}/>}{!editing&&receipt&&<ReceiptReader submissionId={receipt} workspace={workspace}/>}
  </>
}

function ParentWizard({workspace,cancel,submitted}:{workspace:Workspace;cancel:()=>void;submitted:(id:Id<'permissionSubmissions'>)=>void}){
  const[step,setStep]=useState(0),[selected,setSelected]=useState<Id<'events'>[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const[emergencyName,setEmergencyName]=useState(workspace.student.emergencyName??''),[relationship,setRelationship]=useState(workspace.student.emergencyRelationship??''),[phone,setPhone]=useState(workspace.student.emergencyPhone??'')
  const[allergies,setAllergies]=useState(workspace.student.allergies.state),[allergyDetails,setAllergyDetails]=useState(workspace.student.allergies.text??''),[medications,setMedications]=useState(workspace.student.medications.state),[medicationDetails,setMedicationDetails]=useState(workspace.student.medications.text??'')
  const[profileRevision,setProfileRevision]=useState(workspace.student.profileRevision),[prepared,setPrepared]=useState<PreparedElectronic|null>(null),[choices,setChoices]=useState<ChoiceDraft>(emptyChoices),[typedName,setTypedName]=useState(''),[acknowledged,setAcknowledged]=useState(false)
  const saveProfile=useMutation(api.app.updateStudentProfile),prepare=useMutation(prepareMutation),submit=useMutation(submitMutation)
  const flagged=workspace.coverage.find(row=>selected.includes(row.eventId)&&row.state==='correction')
  async function next(event:FormEvent){
    event.preventDefault();setError('')
    if(step===0){setStep(1);return}
    if(step===1){if(!selected.length){setError(copy.selectAtLeastOne);return}setStep(2);return}
    setBusy(true)
    try{
      if(step===2){
        if(!emergencyName.trim()||!relationship.trim()||!phone.trim()||allergies==='unknown'||medications==='unknown'||allergies==='reported'&&!allergyDetails.trim()||medications==='reported'&&!medicationDetails.trim())throw new Error(copy.completeHealth)
        await saveProfile({studentId:workspace.student.studentId,expectedRevision:profileRevision,emergencyName,emergencyRelationship:relationship,emergencyPhone:phone,allergies:{state:allergies,...(allergies==='reported'?{text:allergyDetails}:{})},medications:{state:medications,...(medications==='reported'?{text:medicationDetails}:{})}})
        setProfileRevision(profileRevision+1)
        const draft=await prepare({studentId:workspace.student.studentId,eventIds:selected});setPrepared(draft);setChoices(emptyChoices());setTypedName('');setAcknowledged(false);setStep(3)
      }else if(prepared){
        const selectedChoices=completeChoices(choices);if(!selectedChoices||!acknowledged)throw new Error(copy.completeApproval)
        if(typedName.trim()!==prepared.snapshot.signer.name.trim())throw new Error(copy.matchSignerName)
        submitted(await submit({draftId:prepared.draftId,typedName,acknowledged:true,choices:selectedChoices}))
      }
    }catch(cause){setError(errorText(cause,step===2?copy.prepareFailed:copy.submitFailed))}finally{setBusy(false)}
  }
  return <Card className={styles.card}><div className={styles.stepProgress} aria-hidden="true">{copy.steps.map((label,index)=><span key={label} className={index<=step?styles.active:undefined}/>)}</div><p className={styles.stepLabel}>{copy.step(step+1)}</p><CardTitle>{copy.steps[step]}</CardTitle><form onSubmit={event=>void next(event)}><fieldset disabled={busy} className={styles.form}>
    {step===0&&<dl className={styles.details}><dt>{copy.student}</dt><dd>{workspace.student.legalName} · {workspace.student.preferredName}</dd><dt>{copy.parent}</dt><dd>{workspace.actor.name}</dd><dt>{copy.account}</dt><dd>{workspace.actor.email}</dd></dl>}
    {step===1&&<><p className={styles.muted}>{copy.selectEvents}</p><EventSelection events={workspace.events} selected={selected} onChange={setSelected} disabled={busy}/></>}
    {step===2&&<>{flagged?.reason&&<p className={styles.notice}>{copy.correction}: {flagged.reason}</p>}<div className={styles.fields}><label>{copy.emergencyName}<Input className={flagged?.field==='emergencyName'?styles.flagged:undefined} required value={emergencyName} maxLength={254} onChange={event=>setEmergencyName(event.target.value)}/></label><label>{copy.emergencyRelationship}<Input required value={relationship} maxLength={254} onChange={event=>setRelationship(event.target.value)}/></label><label>{copy.emergencyPhone}<Input className={flagged?.field==='emergencyPhone'?styles.flagged:undefined} type="tel" required value={phone} maxLength={80} onChange={event=>setPhone(event.target.value)}/></label><label>{copy.allergies}<NativeSelect value={allergies} onChange={event=>setAllergies(event.target.value as HealthReport['state'])}>{Object.entries(copy.healthOptions).map(([value,label])=><NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>)}</NativeSelect></label>{allergies==='reported'&&<label>{copy.allergyDetails}<Textarea className={flagged?.field==='allergies'?styles.flagged:undefined} required value={allergyDetails} maxLength={4000} onChange={event=>setAllergyDetails(event.target.value)}/></label>}<label>{copy.medications}<NativeSelect value={medications} onChange={event=>setMedications(event.target.value as HealthReport['state'])}>{Object.entries(copy.healthOptions).map(([value,label])=><NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>)}</NativeSelect></label>{medications==='reported'&&<label>{copy.medicationDetails}<Textarea className={flagged?.field==='medications'?styles.flagged:undefined} required value={medicationDetails} maxLength={4000} onChange={event=>setMedicationDetails(event.target.value)}/></label>}</div></>}
    {step===3&&prepared&&<><p className={styles.muted}>{copy.expires} {when(prepared.expiresAt)}</p><ConsentSnapshotDetails snapshot={prepared.snapshot}/><MedicationChoiceFields definitions={prepared.snapshot.version.medications} choices={choices} onChange={setChoices} disabled={busy}/><label className={styles.field}>{copy.typedName}<Input autoComplete="name" required value={typedName} maxLength={254} onChange={event=>setTypedName(event.target.value)}/></label><label className={styles.checkbox}><Checkbox checked={acknowledged} disabled={busy} onCheckedChange={setAcknowledged}/><span>{prepared.snapshot.version.acknowledgmentText}</span></label></>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><Button type="button" variant="outline" onClick={cancel}>{copy.cancel}</Button>{step>0&&<Button type="button" variant="outline" onClick={()=>{setError('');setStep(step-1);setPrepared(null)}}>{copy.back}</Button>}<Button type="submit">{busy?step===3?copy.signing:copy.preparing:step===3?copy.sign:step===2?copy.saveAndContinue:copy.next}</Button></div>
  </fieldset></form></Card>
}

function ReceiptHistory({workspace,selected,choose}:{workspace:Workspace;selected:Id<'permissionSubmissions'>|null;choose:(id:Id<'permissionSubmissions'>)=>void}){
  return <Card className={styles.card}><CardTitle>{copy.history}</CardTitle>{workspace.receipts.length?<div className={styles.receiptList}>{workspace.receipts.map(row=><button type="button" key={row.submissionId} className={styles.receiptButton} aria-pressed={row.submissionId===selected} onClick={()=>choose(row.submissionId)}><span><strong>{row.signerName} · {row.wordingVersion}</strong><span className={styles.muted}>{when(row.signedAt)} · {row.source==='paper'?copy.paper:row.source==='electronic'?copy.electronic:copy.sourceUnknown}{row.synthetic?` · ${copy.synthetic}`:''}</span></span><Status state={row.legacy?'legacy':row.latestReviewStatus??'pending'}/></button>)}</div>:<p className={styles.muted}>{copy.noHistory}</p>}</Card>
}
function ReceiptReader({submissionId,workspace}:{submissionId:Id<'permissionSubmissions'>;workspace?:Workspace}){
  const receipt=useQuery(receiptQuery,{submissionId});if(!receipt)return<Card className={styles.card}><p role="status">{copy.loading}</p></Card>
  const otherEvents=workspace?.events.filter(event=>!receipt.snapshot?.events.some(original=>original.eventId===event.eventId)&&workspace.coverage.find(row=>row.eventId===event.eventId)?.state!=='accepted')??[]
  return <Card className={styles.card}><CardTitle>{copy.receipt}</CardTitle><Status state={receipt.summary.legacy?'legacy':receipt.summary.latestReviewStatus??'pending'}/>{receipt.summary.note&&<p className={styles.notice}>{receipt.summary.note}</p>}{receipt.snapshot?<><p className={styles.muted}>{copy.recorder}: {receipt.recorderName}</p><ConsentSnapshotDetails snapshot={receipt.snapshot}/></>:<p className={styles.muted}>{copy.legacyReceipt}</p>}{workspace&&<section className={styles.form}><h3>{copy.currentScope}</h3>{receipt.summary.controlledCoverage.length?<div className={styles.events}>{receipt.summary.controlledCoverage.map(row=><div className={styles.event} key={row.eventId}>{workspace.events.find(event=>event.eventId===row.eventId)?.name??receipt.snapshot?.events.find(event=>event.eventId===row.eventId)?.name??copy.event}<Status state={workspace.coverage.find(item=>item.eventId===row.eventId)?.state??'required'}/></div>)}</div>:<p className={styles.muted}>{copy.superseded}</p>}{otherEvents.length>0&&<><h3>{copy.laterEvents}</h3>{otherEvents.map(event=><div className={styles.event} key={event.eventId}>{event.name}<Status state={workspace.coverage.find(row=>row.eventId===event.eventId)?.state??'required'}/></div>)}</>}</section>}{workspace?.canReview&&<ReviewActions key={submissionId} workspace={workspace} receipt={receipt}/>}</Card>
}

export function OperatorPermissionWorkflow(){return<div className={styles.root}><WorkspaceBoundary><OperatorWorkspace/></WorkspaceBoundary></div>}
function OperatorWorkspace(){
  const viewer=useQuery(api.app.viewer,{}) as {user:{role:'coach'|'mentor'|'parent'|'student'}|null}|undefined
  const roster=useQuery(api.app.teamRoster,{}) as {_id:Id<'students'>;preferredName:string;legalName?:string}[]|undefined;const[selected,setSelected]=useState<Id<'students'>|null>(null)
  const studentId=selected&&roster?.some(row=>row._id===selected)?selected:roster?.[0]?._id??null
  return <><div className="page-head"><div><h1>{copy.reviewTitle}</h1><p className="muted">{copy.reviewDescription}</p></div></div>{viewer?.user?.role==='coach'&&<PermissionVersionAuthoring/>}{!roster?<p role="status">{copy.loading}</p>:!roster.length?<p>{copy.noStudents}</p>:<><label className={styles.field}>{copy.chooseStudent}<NativeSelect value={studentId??''} onChange={event=>setSelected(event.target.value as Id<'students'>)}>{roster.map(row=><NativeSelectOption value={row._id} key={row._id}>{row.preferredName||row.legalName}</NativeSelectOption>)}</NativeSelect></label>{studentId&&<OperatorStudent key={studentId} studentId={studentId}/>}</>}</>
}
function OperatorStudent({studentId}:{studentId:Id<'students'>}){
  const workspace=useQuery(workspaceQuery,{studentId});const[selected,setSelected]=useState<Id<'permissionSubmissions'>|null>(null),[paper,setPaper]=useState(false)
  if(!workspace)return<p role="status">{copy.loading}</p>
  return <><p className={styles.notice}>{copy.syntheticNotice}</p><CurrentCoverage workspace={workspace}/><div className={styles.actions}><Button variant="outline" disabled={!workspace.canRecordPaper||!workspace.version||!workspace.events.length} onClick={()=>setPaper(!paper)}>{paper?copy.cancel:copy.paperAction}</Button></div>{workspace.gateReason&&<p className={styles.muted}>{workspace.gateReason}</p>}{paper&&<PaperForm workspace={workspace} recorded={id=>{setPaper(false);setSelected(id)}}/>}<div className={styles.twoColumns}><ReceiptHistory workspace={workspace} selected={selected} choose={setSelected}/>{selected&&<ReceiptReader submissionId={selected} workspace={workspace}/>}</div><RequestSignature workspace={workspace}/><PermissionExport workspace={workspace}/></>
}

function useRetryKey(){const pending=useRef<{fingerprint:string;key:string}|null>(null);return{get:(fingerprint:string)=>{if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()};return pending.current.key},clear:()=>{pending.current=null}}}
function PaperForm({workspace,recorded}:{workspace:Workspace;recorded:(id:Id<'permissionSubmissions'>)=>void}){
  const[events,setEvents]=useState<Id<'events'>[]>([]),[signer,setSigner]=useState(''),[email,setEmail]=useState(''),[signedAt,setSignedAt]=useState(''),[reference,setReference]=useState(''),[prepared,setPrepared]=useState<PreparedPaper|null>(null),[choices,setChoices]=useState<ChoiceDraft>(emptyChoices),[attested,setAttested]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const prepare=useMutation(preparePaperMutation),record=useMutation(paperMutation),retry=useRetryKey()
  const args:PaperArgs={studentId:workspace.student.studentId,eventIds:events,signerName:signer,...(email.trim()?{signerEmail:email.trim()}:{}),paperSignedAt:new Date(signedAt).getTime(),paperReference:reference}
  async function submit(event:FormEvent){event.preventDefault();setError('');setBusy(true);try{
    if(!prepared){if(!events.length)throw new Error(copy.selectAtLeastOne);setPrepared(await prepare(args));setChoices(emptyChoices());setAttested(false)}
    else{const selectedChoices=completeChoices(choices);if(!selectedChoices||!attested)throw new Error(copy.completeApproval);const request={...args,versionId:prepared.versionId,expectedProfileRevision:prepared.expectedProfileRevision,eventFingerprint:prepared.eventFingerprint,expectedCoverage:prepared.expectedCoverage,choices:selectedChoices,paperAttested:true as const};recorded(await record({...request,idempotencyKey:retry.get(JSON.stringify(request))}));retry.clear()}
  }catch(cause){setError(errorText(cause,copy.paperFailed))}finally{setBusy(false)}}
  return <Card className={styles.card}><CardTitle>{copy.paperHeading}</CardTitle><form onSubmit={event=>void submit(event)}><fieldset className={styles.form} disabled={busy}>{!prepared?<><EventSelection events={workspace.events} selected={events} onChange={setEvents} disabled={busy}/><div className={styles.fields}><label>{copy.paperSigner}<Input required value={signer} maxLength={160} onChange={event=>setSigner(event.target.value)}/></label><label>{copy.paperSignerEmail}<Input type="email" value={email} maxLength={254} onChange={event=>setEmail(event.target.value)}/></label><label>{copy.paperSignedAt}<Input type="datetime-local" required value={signedAt} onChange={event=>setSignedAt(event.target.value)}/><span className={styles.muted}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></label><label>{copy.paperReference}<Input required value={reference} maxLength={254} onChange={event=>setReference(event.target.value)}/></label></div></>:<><dl className={styles.details}><dt>{copy.paperReference}</dt><dd>{reference}</dd><dt>{copy.paperSignedAt}</dt><dd>{when(args.paperSignedAt)}</dd><dt>{copy.recorder}</dt><dd>{workspace.actor.name}</dd></dl><ConsentSnapshotDetails snapshot={prepared.snapshot}/><MedicationChoiceFields definitions={prepared.snapshot.version.medications} choices={choices} onChange={setChoices} disabled={busy}/><label className={styles.checkbox}><Checkbox checked={attested} disabled={busy} onCheckedChange={setAttested}/><span>{copy.paperAttestation}</span></label></>}{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}>{prepared&&<Button type="button" variant="outline" onClick={()=>{setPrepared(null);retry.clear();setError('')}}>{copy.back}</Button>}<Button type="submit">{busy?copy.preparing:prepared?copy.recordPaper:copy.prepare}</Button></div></fieldset></form></Card>
}

function ReviewActions({workspace,receipt}:{workspace:Workspace;receipt:Receipt}){
  const[note,setNote]=useState(''),[field,setField]=useState<CorrectionField>('general'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const review=useMutation(reviewMutation),retry=useRetryKey()
  const controlled=receipt.summary.controlledCoverage
  const actionable=workspace.canReview&&!receipt.summary.legacy&&controlled.length>0&&controlled.every(expected=>workspace.coverage.some(row=>row.eventId===expected.eventId&&row.revision===expected.revision&&row.signatureRequestedAt===null))
  async function save(status:'accepted'|'correction'){setBusy(true);setError('');setSaved('');try{if(status==='correction'&&!note.trim())throw new Error(copy.correctionRequired);const request={submissionId:receipt.summary.submissionId,status,...(note.trim()?{note:note.trim()}:{}),...(status==='correction'?{field}:{}),expectedLatestReviewId:receipt.summary.latestReviewId,expectedCoverage:controlled};await review({...request,idempotencyKey:retry.get(JSON.stringify(request))});retry.clear();setSaved(copy.reviewSaved)}catch(cause){setError(errorText(cause,copy.reviewFailed))}finally{setBusy(false)}}
  return <section className={styles.form}><fieldset className={styles.form} disabled={busy||!actionable}><label className={styles.field}>{copy.correctionNote}<Textarea value={note} maxLength={1000} onChange={event=>setNote(event.target.value)}/></label><label className={styles.field}>{copy.correctedField}<NativeSelect value={field} onChange={event=>setField(event.target.value as CorrectionField)}>{Object.entries(copy.fields).map(([value,label])=><NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>)}</NativeSelect></label><div className={styles.actions}><Button onClick={()=>void save('accepted')}>{copy.accept}</Button><Button variant="outline" onClick={()=>void save('correction')}>{copy.sendBack}</Button></div></fieldset>{!actionable&&controlled.length>0&&<p className={styles.muted}>{copy.reviewNotActionable}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}{saved&&<p role="status" className={styles.success}>{saved}</p>}</section>
}
function RequestSignature({workspace}:{workspace:Workspace}){
  const[selected,setSelected]=useState<Id<'events'>[]>([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');const request=useMutation(requestMutation)
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');setSaved('');try{if(!selected.length)throw new Error(copy.selectAtLeastOne);await request({studentId:workspace.student.studentId,eventIds:selected,expectedCoverage:selected.map(eventId=>({eventId,revision:workspace.coverage.find(row=>row.eventId===eventId)?.revision??0})),reason});setSaved(copy.requestSaved);setSelected([]);setReason('')}catch(cause){setError(errorText(cause,copy.requestFailed))}finally{setBusy(false)}}
  return <Card className={styles.card}><CardTitle>{copy.requestSignature}</CardTitle><form onSubmit={event=>void submit(event)}><fieldset className={styles.form} disabled={busy||!workspace.canReview}><EventSelection events={workspace.events} selected={selected} onChange={setSelected} disabled={busy}/><label className={styles.field}>{copy.signatureReason}<Textarea required value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)}/></label><Button type="submit">{copy.requestSignature}</Button></fieldset></form>{error&&<p role="alert" className={styles.error}>{error}</p>}{saved&&<p role="status" className={styles.success}>{saved}</p>}</Card>
}
function PermissionExport({workspace}:{workspace:Workspace}){
  const events=useQuery(api.app.listEvents,{}) as {event:{_id:Id<'events'>;name:string}}[]|undefined
  const[selected,setSelected]=useState<Id<'events'>|null>(null),[includeHealth,setIncludeHealth]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[collected,setCollected]=useState(0);const packet=useMutation(exportMutation)
  const active=useRef<{cancelled:boolean}|null>(null)
  useEffect(()=>()=>{if(active.current)active.current.cancelled=true},[])
  async function download(){
    if(!selected||active.current)return
    const collection={cancelled:false};active.current=collection;setBusy(true);setError('');setCollected(0)
    try{
      if(includeHealth&&!workspace.canHealthExport)throw new Error(copy.healthGrantRequired)
      const data=await collectPermissionExport(packet,{eventId:selected,includeHealth},{cancelled:()=>collection.cancelled,progress:setCollected})
      if(collection.cancelled)return
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`permission-${data.event.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()||'event'}-${includeHealth?'health-packet':'manifest'}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(cause){if(!collection.cancelled)setError(errorText(cause,copy.exportFailed))}finally{active.current=null;setBusy(false);setCollected(0)}
  }
  function cancel(){if(active.current)active.current.cancelled=true;setCollected(0);setError(copy.exportCancelled)}
  return <Card className={styles.card}><CardTitle>{copy.export}</CardTitle><p className={styles.muted}>{copy.exportDescription}</p><p className={styles.muted}>{copy.collectionSemantics}</p><label className={styles.field}>{copy.exportEvent}<NativeSelect disabled={!events||busy} value={selected??''} onChange={event=>setSelected(event.target.value?event.target.value as Id<'events'>:null)}><NativeSelectOption value="">{copy.chooseEvent}</NativeSelectOption>{events?.map(({event})=><NativeSelectOption value={event._id} key={event._id}>{event.name}</NativeSelectOption>)}</NativeSelect></label><label className={styles.checkbox}><Checkbox checked={includeHealth} disabled={!workspace.canHealthExport||busy} onCheckedChange={setIncludeHealth}/><span>{copy.includeHealth}</span></label><div className={styles.actions}><Button disabled={busy||!selected||!workspace.canReview} onClick={()=>void download()}>{busy?copy.downloading:copy.download}</Button>{busy&&<Button variant="outline" onClick={cancel}>{copy.cancelExport}</Button>}</div>{busy&&<p role="status">{copy.exportProgress(collected)}</p>}<p className={styles.muted}>{copy.exportSynthetic}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}</Card>
}

/** Collect every authorized server page before returning any downloadable content. */
export async function collectPermissionExport(fetchPage:(args:ExportArgs)=>Promise<ExportPage>,scope:Pick<ExportArgs,'eventId'|'includeHealth'>,options:{cancelled?:()=>boolean;progress?:(count:number)=>void}={}){
  const records:ExportPage['records']=[],seenStudents=new Set<Id<'students'>>(),seenCursors=new Set<string>()
  let cursor:string|null=null,first:ExportPage|null=null,completedAt:number,complete=false
  try{
    while(true){
      if(options.cancelled?.())throw new Error(copy.exportCancelled)
      const page=await fetchPage({...scope,paginationOpts:{numItems:10,cursor}})
      if(options.cancelled?.())throw new Error(copy.exportCancelled)
      if(page.schemaVersion!==1||page.event.eventId!==scope.eventId||page.synthetic!==true||page.records.length>10)throw new Error(copy.exportScopeChanged)
      first??=page
      for(const record of page.records){
        if(seenStudents.has(record.studentId)||record.collectedAt!==page.generatedAt||!scope.includeHealth&&record.snapshot!==undefined)throw new Error(copy.exportScopeChanged)
        seenStudents.add(record.studentId);records.push(record)
      }
      options.progress?.(records.length)
      if(options.cancelled?.())throw new Error(copy.exportCancelled)
      if(page.isDone){completedAt=page.generatedAt;complete=true;break}
      if(!page.continueCursor||page.continueCursor===cursor||seenCursors.has(page.continueCursor))throw new Error(copy.exportCursorFailed)
      seenCursors.add(page.continueCursor);cursor=page.continueCursor
    }
    if(!first)throw new Error(copy.exportFailed)
    return{schemaVersion:1 as const,synthetic:true as const,event:first.event,includeHealth:scope.includeHealth,collectionStartedAt:first.generatedAt,collectionCompletedAt:completedAt,collectionSemantics:copy.collectionSemantics,records}
  }finally{
    // Failures, grant revocation and cancellation keep no partial packet available.
    if(!complete)records.length=0
  }
}

export function PermissionVersionAuthoring(){
  const current=useQuery(api.permissionVersions.current,{})
  const[editing,setEditing]=useState(false),[saved,setSaved]=useState(false)
  return <Card className={styles.card}><CardTitle>{copy.wordingVersions}</CardTitle><p className={styles.notice}>{copy.versionGate}</p>{current===undefined?<p role="status">{copy.loading}</p>:editing?<VersionForm current={current} cancel={()=>setEditing(false)} created={()=>{setEditing(false);setSaved(true)}}/>:<>{current?<><strong>{current.title} · {current.version}</strong><p className={styles.muted}>{current.schoolName} · {current.teamName}</p></>:<p>{copy.noVersion}</p>}<Button variant="outline" onClick={()=>{setSaved(false);setEditing(true)}}>{copy.createVersion}</Button>{saved&&<p role="status" className={styles.success}>{copy.versionSaved}</p>}</>}</Card>
}
function VersionForm({current,cancel,created}:{current:FunctionReturnType<typeof api.permissionVersions.current>;cancel:()=>void;created:()=>void}){
  const[version,setVersion]=useState(''),[title,setTitle]=useState(current?.title??''),[wording,setWording]=useState(current?.wording??''),[administration,setAdministration]=useState(current?.administrationText??''),[acknowledgment,setAcknowledgment]=useState(current?.acknowledgmentText??''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const[definitions,setDefinitions]=useState(()=>({pain:{productsText:current?.medications.find(item=>item.key==='pain')?.productsText??'',exceptionsText:current?.medications.find(item=>item.key==='pain')?.exceptionsText??''},allergy:{productsText:current?.medications.find(item=>item.key==='allergy')?.productsText??'',exceptionsText:current?.medications.find(item=>item.key==='allergy')?.exceptionsText??''},cold:{productsText:current?.medications.find(item=>item.key==='cold')?.productsText??'',exceptionsText:current?.medications.find(item=>item.key==='cold')?.exceptionsText??''}}))
  const create=useMutation(api.permissionVersions.createVersion)
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await create({version,title,wording,schoolName:copy.schoolName,teamName:copy.teamName,medications:(['pain','allergy','cold'] as const).map(key=>({key,label:copy.medicationCategories[key],...definitions[key]})),administrationText:administration,acknowledgmentText:acknowledgment});created()}catch(cause){setError(errorText(cause,copy.versionFailed))}finally{setBusy(false)}}
  return <form onSubmit={event=>void submit(event)}><fieldset className={styles.form} disabled={busy}><p className={styles.muted}>{copy.immutableVersion}</p><div className={styles.fields}><label>{copy.version}<Input required value={version} maxLength={80} onChange={event=>setVersion(event.target.value)}/></label><label>{copy.formTitle}<Input required value={title} maxLength={160} onChange={event=>setTitle(event.target.value)}/></label><label>{copy.schoolLabel}<Input readOnly value={copy.schoolName}/></label><label>{copy.teamLabel}<Input readOnly value={copy.teamName}/></label></div><label className={styles.field}>{copy.wording}<Textarea required rows={12} value={wording} maxLength={20000} onChange={event=>setWording(event.target.value)}/><span className={styles.muted}>{copy.minorFirstAid}</span></label>{(['pain','allergy','cold'] as const).map(key=><fieldset className={styles.choice} key={key}><legend>{copy.medicationCategories[key]}</legend><div className={styles.fields}><label>{copy.products}<Textarea required value={definitions[key].productsText} maxLength={2000} onChange={event=>setDefinitions({...definitions,[key]:{...definitions[key],productsText:event.target.value}})}/></label><label>{copy.exceptions}<Textarea required value={definitions[key].exceptionsText} maxLength={2000} onChange={event=>setDefinitions({...definitions,[key]:{...definitions[key],exceptionsText:event.target.value}})}/></label></div></fieldset>)}<label className={styles.field}>{copy.administration}<Textarea required value={administration} maxLength={5000} onChange={event=>setAdministration(event.target.value)}/></label><label className={styles.field}>{copy.acknowledgment}<Textarea required value={acknowledgment} maxLength={2000} onChange={event=>setAcknowledgment(event.target.value)}/></label>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><Button type="button" variant="outline" onClick={cancel}>{copy.cancel}</Button><Button type="submit">{busy?copy.creatingVersion:copy.createVersion}</Button></div></fieldset></form>
}

export function ConsentSnapshotDetails({snapshot}:{snapshot:ConsentSnapshot}){
  return <div className={styles.receipt}>
    <p className={styles.notice} role="status">{copy.syntheticNotice}</p>
    <dl className={styles.details}><dt>{copy.student}</dt><dd>{snapshot.student.legalName}</dd><dt>{copy.subteam}</dt><dd>{snapshot.student.subteam}</dd><dt>{copy.signer}</dt><dd>{snapshot.signer.name}</dd>{snapshot.signer.email&&<><dt>{copy.signerEmail}</dt><dd>{snapshot.signer.email}</dd></>}<dt>{copy.source}</dt><dd>{snapshot.signer.source==='electronic'?copy.electronic:copy.paper}</dd><dt>{copy.version}</dt><dd>{snapshot.version.version}</dd>{snapshot.signedAt!==null&&<><dt>{copy.signedAt}</dt><dd>{when(snapshot.signedAt)}</dd></>}{snapshot.recordedAt!==null&&<><dt>{copy.recordedAt}</dt><dd>{when(snapshot.recordedAt)}</dd></>}{snapshot.paper&&<><dt>{copy.paperReference}</dt><dd>{snapshot.paper.reference}</dd><dt>{copy.paperSignedAt}</dt><dd>{when(snapshot.paper.signedAt)}</dd></>}</dl>
    <section><h3>{copy.originalScope}</h3><div className={styles.events}>{snapshot.events.map(event=><div className={styles.event} key={event.eventId}><strong>{event.name} · {event.type}</strong><span>{date(event.startsAt)} – {date(event.endsAt)} · {event.destination}</span><span className={styles.muted}>{event.travel}</span><dl className={styles.details}><dt>{copy.eventFee}</dt><dd>{(event.feeCents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})}</dd><dt>{copy.overnight}</dt><dd>{event.overnight?copy.yes:copy.no}</dd><dt>{copy.independentTravel}</dt><dd>{event.independentTravel?copy.yes:copy.no}</dd><dt>{copy.teamTransport}</dt><dd>{event.transportEnabled?copy.yes:copy.no}</dd>{event.busSeats!==null&&<><dt>{copy.busSeats}</dt><dd>{event.busSeats}</dd></>}{event.additionalAdults!==null&&<><dt>{copy.additionalAdults}</dt><dd>{event.additionalAdults}</dd></>}<dt>{copy.trailerRequired}</dt><dd>{event.trailerRequired?copy.yes:copy.no}</dd></dl></div>)}</div></section>
    <section><h3>{copy.emergency}</h3><dl className={styles.details}><dt>{copy.emergencyName}</dt><dd>{snapshot.emergency.name}</dd><dt>{copy.emergencyRelationship}</dt><dd>{snapshot.emergency.relationship}</dd><dt>{copy.emergencyPhone}</dt><dd>{snapshot.emergency.phone}</dd><dt>{copy.allergies}</dt><dd>{healthText(snapshot.health.allergies)}</dd><dt>{copy.medications}</dt><dd>{healthText(snapshot.health.medications)}</dd></dl></section>
    <section><h3>{copy.wording}</h3><p>{snapshot.version.schoolName} · {snapshot.version.teamName}</p>{!snapshot.version.approved&&<p className={styles.notice}>{copy.unapprovedWording}</p>}<div className={styles.wording}>{snapshot.version.wording}</div><h3>{copy.administration}</h3><div className={styles.wording}>{snapshot.version.administrationText}</div></section>
    {snapshot.choices&&<section><h3>{copy.medicationChoices}</h3>{snapshot.version.medications.map(definition=><div className={styles.choice} key={definition.key}><h3>{definition.label}</h3><p><strong>{copy.products}: </strong>{definition.productsText}</p><p><strong>{copy.exceptions}: </strong>{definition.exceptionsText}</p><strong>{copy.medicationChoiceLabels[snapshot.choices![definition.key]]}</strong></div>)}</section>}
    <section><h3>{copy.acknowledgment}</h3><p>{snapshot.version.acknowledgmentText}</p>{snapshot.typedName&&<p>{copy.typedName}: <strong>{snapshot.typedName}</strong></p>}<p className={styles.muted}>{snapshot.signedAt===null?copy.previewNotice:copy.immutableNotice}</p></section>
  </div>
}

function MedicationChoiceFields({definitions,choices,onChange,disabled=false}:{definitions:ConsentSnapshot['version']['medications'];choices:ChoiceDraft;onChange:(next:ChoiceDraft)=>void;disabled?:boolean}){
  return <section className={styles.events}><h3>{copy.medicationChoices}</h3><p className={styles.muted}>{copy.noPreselected}</p>{definitions.map(definition=><fieldset className={styles.choice} key={definition.key} disabled={disabled}><legend>{definition.label}</legend><p><strong>{copy.products}: </strong>{definition.productsText}</p><p><strong>{copy.exceptions}: </strong>{definition.exceptionsText}</p><RadioGroup<MedicationChoices[MedicationKey]|''> className={styles.radioRow} aria-label={definition.label} name={`medication-${definition.key}`} required disabled={disabled} value={choices[definition.key]} onValueChange={value=>onChange({...choices,[definition.key]:value})}>{(['allow','contact','deny'] as const).map(value=><label key={value}><Radio.Root className={styles.radio} value={value}><Radio.Indicator className={styles.radioDot}/></Radio.Root>{copy.medicationChoiceLabels[value]}</label>)}</RadioGroup></fieldset>)}</section>
}

export { emptyChoices, MedicationChoiceFields }
