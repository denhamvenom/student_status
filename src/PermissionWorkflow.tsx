import { userFacingError } from '@/lib/error-message'
import { useLocation } from 'react-router'
import { Component, Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { useAction, useMutation, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import type { ConsentSnapshot, MedicationChoices } from '../convex/lib/consentSnapshot'
import { onsiteLocation } from '../convex/lib/transportation'
import { onsitePlace, transportationLabel } from './lib/event-place'
import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { permissionWorkflowCopy as copy } from './lib/permission-workflow-copy'
import { ConsentProfileV2Form } from './ConsentProfileV2Form'
import { SecurePermissionPdf } from './SecurePermissionPdf'
import { fieldTripApproved } from './lib/field-trip-approved'
import styles from './PermissionWorkflow.module.css'

type MedicationKey=keyof MedicationChoices
type ChoiceDraft=Record<MedicationKey,MedicationChoices[MedicationKey]|''>
type Workspace=FunctionReturnType<typeof api.permissions.workspace>
type CorrectionField=NonNullable<Workspace['coverage'][number]['field']>
type Receipt=FunctionReturnType<typeof api.permissions.receipt>
type ExportPage=FunctionReturnType<typeof api.permissions.exportPacket>
type ExportArgs=FunctionArgs<typeof api.permissions.exportPacket>
const workspaceQuery=api.permissions.workspace
const receiptQuery=api.permissions.receipt
const reviewMutation=api.permissions.review
const requestMutation=api.permissions.requestNewSignature
const exportMutation=api.permissions.exportPacket
const emptyChoices=():ChoiceDraft=>({pain:'',allergy:'',cold:''})
const when=(at:number)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(at)
const date=(at:number)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'short',day:'numeric'}).format(at)
export const eventDateRange=(startsAt:number,endsAt:number)=>{const start=date(startsAt),end=date(endsAt);return start===end?start:start+' – '+end}
const healthText=(report:ConsentSnapshot['health']['allergies'])=>report.state==='none'?copy.healthOptions.none:report.text??copy.healthOptions.reported
const errorText=(error:unknown,fallback:string)=>userFacingError(error, fallback)

class PermissionBoundary extends Component<{children:ReactNode;retry:()=>void},{error:unknown}>{
  state={error:null as unknown}
  static getDerivedStateFromError(error:unknown){return{error}}
  render(){return this.state.error!==null?<Card className={styles.card}><h2>{copy.unavailable}</h2><p role="alert">{userFacingError(this.state.error, copy.unavailableDescription, false)}</p><Button variant="outline" onClick={this.props.retry}>{copy.retry}</Button></Card>:this.props.children}
}
function WorkspaceBoundary({children}:{children:ReactNode}){const[attempt,setAttempt]=useState(0);return<PermissionBoundary key={attempt} retry={()=>setAttempt(attempt+1)}>{children}</PermissionBoundary>}
function Status({state}:{state:keyof typeof copy.status}){return<span className={`${styles.status} ${state==='accepted'?styles.accepted:state==='correction'?styles.correction:''}`}>{copy.status[state]}</span>}

/** Reference codes let staff match a printed copy; Parents never see them. Unknown roles are treated as Parents. */
export function pdfReferenceRows(role:Workspace['actor']['role']|undefined,codes:{reviewedPdfSha256:string;signedPdfSha256:string}){
  if(role!=='coach'&&role!=='mentor')return[]
  return[{label:copy.reviewedReference,value:codes.reviewedPdfSha256},{label:copy.signedReference,value:codes.signedPdfSha256}]
}

export const receiptHistoryLabels=(row:Pick<Workspace['receipts'][number],'controlledCoverage'>,index:number)=>[...(index>0?[copy.earlierSignedForm]:[]),...(row.controlledCoverage.length===0?[copy.superseded]:[])]

/** Signed snapshots store "On site" as the destination; families read the plainer words. */
const snapshotPlace=(destination:string)=>destination===onsiteLocation?onsitePlace:destination

function EventSelection({events,selected,onChange,disabled=false}:{events:ConsentSnapshot['events'];selected:Id<'events'>[];onChange:(ids:Id<'events'>[])=>void;disabled?:boolean}){
  return <div className={styles.events}>{events.map(event=><label className={`${styles.event} ${styles.checkbox}`} key={event.eventId}><Checkbox checked={selected.includes(event.eventId)} disabled={disabled} onCheckedChange={checked=>onChange(checked?[...selected,event.eventId]:selected.filter(id=>id!==event.eventId))}/><span><strong>{event.name} · {event.type}</strong><br/>{eventDateRange(event.startsAt,event.endsAt)} · {snapshotPlace(event.destination)}<br/><span className={styles.muted}>{transportationLabel(event.travel)}</span></span></label>)}</div>
}

function CurrentCoverage({workspace}:{workspace:Workspace}){
  if(workspace.actor.role==='parent'&&workspace.signingPaused)return null
  return <Card className={styles.card}><CardTitle>{copy.currentCoverage}</CardTitle>{workspace.events.length?<div className={styles.events}>{workspace.events.map(event=>{const coverage=workspace.coverage.find(row=>row.eventId===event.eventId);return <div className={styles.event} key={event.eventId}><div className={styles.eventTop}><strong>{event.name}</strong><Status state={coverage?.state??'required'}/></div><span className={styles.muted}>{date(event.startsAt)} · {event.destination}</span>{coverage?.reason&&<p className={styles.notice}>{coverage.reason}</p>}{coverage?.signatureRequestedAt!==null&&coverage?.signatureRequestedAt!==undefined&&<p className={styles.muted}>{copy.requestedAgain} · {when(coverage.signatureRequestedAt)}</p>}</div>})}</div>:<p className={styles.muted}>{copy.noEvents}</p>}</Card>
}

export function ParentPermissionWorkflow({studentId}:{studentId:Id<'students'>|null}){
  if(!studentId)return <div className={styles.root}><h1>{copy.title}</h1><p>{copy.noStudent}</p></div>
  return <div className={styles.root}><WorkspaceBoundary key={studentId}><ParentWorkspace studentId={studentId}/></WorkspaceBoundary></div>
}
function ParentWorkspace({studentId}:{studentId:Id<'students'>}){
  const workspace=useQuery(workspaceQuery,{studentId}),profile=useQuery(api.permissionsV2.profile,{studentId})
  const[editing,setEditing]=useState(false),[receipt,setReceipt]=useState<Id<'permissionSubmissions'>|null>(null)
  if(!workspace||!profile)return<p role="status">{copy.loading}</p>
  const v2=workspace.version?.formFormat===2&&workspace.version.version===fieldTripApproved.templateVersion
  const name=workspace.student.preferredName||workspace.student.legalName
  const blocked=!workspace.canSign||!v2||!profile.setupComplete||!profile.completed||workspace.events.length===0
  if(workspace.signingPaused)return <><div className="page-head"><h1>{copy.title}</h1></div><p role="status" className={styles.notice}>{workspace.gateReason}</p><ReceiptHistory workspace={workspace} selected={receipt} choose={setReceipt}/>{receipt&&<ReceiptForFormat submissionId={receipt} format={workspace.receipts.find(row=>row.submissionId===receipt)?.format??0} workspace={workspace}/>}</>
  return <><div className="page-head"><div><h1>{copy.title}</h1><p className="muted">{workspace.student.legalName} · Read the permission form before you sign it.</p></div></div>{workspace.signingMode==="synthetic"&&<p className={styles.notice}>{copy.syntheticNotice}</p>}{workspace.gateReason&&<p role="status" className={styles.notice}>{workspace.gateReason}</p>}
    {editing?<ParentWizard key={studentId} workspace={workspace} cancel={()=>setEditing(false)} submitted={id=>{setEditing(false);setReceipt(id)}}/>:<><CurrentCoverage workspace={workspace}/><Card className={styles.card}><CardTitle>This season's permission form</CardTitle>{v2?<><strong>{workspace.version!.title}</strong><p className={styles.muted}>{workspace.version!.schoolName} · {workspace.version!.teamName}</p></>:<p id="parent-form-not-ready">{copy.parentNoVersion}</p>}<p>{name}'s setup: {profile.setupComplete?'Complete':'Not finished'} · {name}'s profile: {profile.completed?'Confirmed':'Not confirmed yet'}</p><Button disabled={blocked} aria-describedby={blocked?(v2?"parent-pdf-unavailable":"parent-form-not-ready parent-pdf-unavailable"):undefined} onClick={()=>setEditing(true)}>Choose events and review the form</Button><div id="parent-pdf-unavailable">{!profile.setupComplete&&<p className={styles.muted}>{name} needs to finish setup first.</p>}{!profile.completed&&<p className={styles.muted}>Confirm {name}'s profile below before you review the permission form.</p>}{workspace.events.length===0&&<p className={styles.muted}>{copy.noEvents}</p>}{!workspace.canSign&&<p className={styles.muted}>{copy.signingClosed}</p>}</div></Card>{!profile.completed&&<ConsentProfileV2Form studentId={studentId}/>}</>}
    {!editing&&<ReceiptHistory workspace={workspace} selected={receipt} choose={setReceipt}/>}
    {!editing&&receipt&&<ReceiptForFormat submissionId={receipt} format={workspace.receipts.find(row=>row.submissionId===receipt)?.format??0} workspace={workspace}/>}
  </>
}

function ParentWizard({workspace,cancel,submitted}:{workspace:Workspace;cancel:()=>void;submitted:(id:Id<'permissionSubmissions'>)=>void}){
  const[selected,setSelected]=useState<Id<'events'>[]>([]),[prepared,setPrepared]=useState<FunctionReturnType<typeof api.permissionsV2Pdf.prepare>|null>(null)
  const[typedName,setTypedName]=useState(''),[acknowledged,setAcknowledged]=useState(false),[pdfReady,setPdfReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const prepare=useAction(api.permissionsV2Pdf.prepare),submit=useAction(api.permissionsV2Pdf.submit)
  async function advance(event:FormEvent){
    event.preventDefault();setError('');setBusy(true)
    try{
      if(!prepared){if(!selected.length)throw new Error(copy.selectAtLeastOne);setPrepared(await prepare({studentId:workspace.student.studentId,eventIds:selected}));setTypedName('');setAcknowledged(false)}
      else {if(!pdfReady)throw new Error('Wait for the form to open, then read it before you sign.');if(typedName.trim()!==prepared.snapshot.signer.name.trim()||!acknowledged)throw new Error(copy.signerNameMismatch(prepared.snapshot.signer.name));submitted(await submit({draftId:prepared.draftId,typedName,acknowledged:true}))}
    }catch(cause){setError(errorText(cause,prepared?copy.submitFailed:copy.prepareFailed))}finally{setBusy(false)}
  }
  return <Card className={styles.card}><CardTitle>{prepared?'Review and sign the permission form':'Choose events'}</CardTitle><form onSubmit={event=>void advance(event)}><fieldset className={styles.form} disabled={busy}>
    {!prepared?<><p>Choose the confirmed events this form covers. If the profile or an event changes before you sign, you'll need to prepare the form again.</p><EventSelection events={workspace.events} selected={selected} onChange={setSelected}/></>:<><p className={styles.notice}>Read every page of the form before you sign. Sign by {when(prepared.expiresAt)}; after that, prepare it again.</p><SecurePermissionPdf key={prepared.draftId} draftId={prepared.draftId} rendition="reviewed" expectedSha256={prepared.pdfSha256} onReady={setPdfReady}/><p id="signer-name-reason">{copy.signerNameReason}</p><label className={styles.field}>Type your name: {prepared.snapshot.signer.name}<Input autoComplete="name" required maxLength={254} aria-describedby="signer-name-reason" value={typedName} onChange={event=>setTypedName(event.target.value)} placeholder={prepared.snapshot.signer.name}/></label><label className={styles.checkbox}><Checkbox checked={acknowledged} onCheckedChange={setAcknowledged}/><span>{prepared.snapshot.version.acknowledgmentText}</span></label></>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><Button type="button" variant="outline" onClick={cancel}>{copy.cancel}</Button>{prepared&&<Button type="button" variant="outline" onClick={()=>{setPrepared(null);setPdfReady(false);setError('')}}>{copy.back}</Button>}<Button type="submit" disabled={prepared?!pdfReady||!acknowledged||typedName.trim()!==prepared.snapshot.signer.name.trim():!selected.length} aria-describedby={(prepared?(!pdfReady||!acknowledged||typedName.trim()!==prepared.snapshot.signer.name.trim()):!selected.length)?'parent-submit-hint':undefined}>{busy?copy.preparing:prepared?(prepared.snapshot.synthetic?copy.sign:"Submit signature"):'Prepare the form'}</Button></div>{!busy&&(prepared?(!pdfReady||!acknowledged||typedName.trim()!==prepared.snapshot.signer.name.trim()):!selected.length)&&<p id="parent-submit-hint" className={styles.muted}>{prepared?'Read the form, type your name exactly as shown, and check the box to agree.':copy.selectAtLeastOne}</p>}
  </fieldset></form></Card>
}

function ReceiptHistory({workspace,selected,choose}:{workspace:Workspace;selected:Id<'permissionSubmissions'>|null;choose:(id:Id<'permissionSubmissions'>)=>void}){
  return <Card className={styles.card}><CardTitle>{workspace.actor.role==='parent'?copy.parentHistory:copy.history}</CardTitle>{workspace.receipts.length?<div className={styles.receiptList}>{workspace.receipts.map((row,index)=><button type="button" key={row.submissionId} className={styles.receiptButton} aria-pressed={row.submissionId===selected} onClick={()=>choose(row.submissionId)}><span><strong>{row.signerName} · {row.format===2?copy.title:copy.earlierFormVersion}</strong><span className={styles.muted}>{when(row.signedAt)} · {row.source==='paper'?copy.paper:row.source==='electronic'?copy.electronic:copy.sourceUnknown}{row.synthetic?` · ${copy.synthetic}`:''}</span>{receiptHistoryLabels(row,index).map(label=><span key={label} className={styles.muted}>{label}</span>)}</span><Status state={row.legacy?'legacy':row.latestReviewStatus??'pending'}/></button>)}</div>:<p className={styles.muted}>{workspace.actor.role==='parent'?copy.parentNoHistory:copy.noHistory}</p>}</Card>
}
function ReceiptForFormat({submissionId,format,workspace}:{submissionId:Id<'permissionSubmissions'>;format:number;workspace?:Workspace}){
  return format===2?<PdfReceipt key={submissionId} submissionId={submissionId} workspace={workspace}/>:<ReceiptReader key={submissionId} submissionId={submissionId} workspace={workspace}/>
}
function PdfReceipt({submissionId,workspace}:{submissionId:Id<'permissionSubmissions'>;workspace?:Workspace}){
  const canRead=workspace?.actor.role==='parent'||workspace?.canHealthExport===true
  return <PdfReceiptContent submissionId={submissionId} workspace={workspace} canRead={canRead}/>
}
function PdfReceiptContent({submissionId,workspace,canRead}:{submissionId:Id<'permissionSubmissions'>;workspace?:Workspace;canRead:boolean}){
  const summary=useQuery(receiptQuery,{submissionId})
  if(!canRead)return<Card className={styles.card}><CardTitle>Signed permission form</CardTitle><p>Opening signed forms needs Health export access. Ask a Coach for it.</p>{summary&&<Status state={summary.summary.latestReviewStatus??'pending'}/>}</Card>
  return <AuthorizedPdfReceipt submissionId={submissionId} workspace={workspace} summary={summary}/>
}
function AuthorizedPdfReceipt({submissionId,workspace,summary}:{submissionId:Id<'permissionSubmissions'>;workspace?:Workspace;summary:Receipt|undefined}){
  const receipt=useQuery(api.permissionsV2.receipt,{submissionId})
  if(!receipt||!summary)return<Card className={styles.card}><p role="status">{copy.loading}</p></Card>
  const references=pdfReferenceRows(workspace?.actor.role,receipt)
  return <Card className={styles.card}><CardTitle>Signed permission form</CardTitle><Status state={summary.summary.latestReviewStatus??'pending'}/>{summary.summary.note&&<p className={styles.notice}>Latest review: {summary.summary.note}</p>}{receipt.snapshot.synthetic&&<p className={styles.notice}>{copy.synthetic}.</p>}<dl className={styles.details}><dt>Student</dt><dd>{receipt.snapshot.student.legalName}</dd><dt>Signed by</dt><dd>{receipt.snapshot.signer.name}</dd><dt>Signed</dt><dd>{receipt.snapshot.signedAt?when(receipt.snapshot.signedAt):'Not recorded'}</dd></dl>{references.length>0&&<details><summary>{copy.referenceCodes}</summary><dl className={styles.details}>{references.map(row=><Fragment key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></Fragment>)}</dl></details>}<SecurePermissionPdf submissionId={submissionId} rendition="signed" expectedSha256={receipt.signedPdfSha256}/>{workspace&&<section className={styles.form}><h3>{copy.currentScope}</h3>{summary.summary.controlledCoverage.length?<div className={styles.events}>{summary.summary.controlledCoverage.map(row=><div className={styles.event} key={row.eventId}><strong>{workspace.events.find(event=>event.eventId===row.eventId)?.name??receipt.snapshot.events.find(event=>event.eventId===row.eventId)?.name??copy.event}</strong><Status state={workspace.coverage.find(item=>item.eventId===row.eventId)?.state??'required'}/></div>)}</div>:<p className={styles.muted}>{copy.superseded}</p>}</section>}{workspace?.canReview&&<ReviewActions workspace={workspace} receipt={summary}/>}</Card>
}
function ReceiptReader({submissionId,workspace}:{submissionId:Id<'permissionSubmissions'>;workspace?:Workspace}){
  const receipt=useQuery(receiptQuery,{submissionId});if(!receipt)return<Card className={styles.card}><p role="status">{copy.loading}</p></Card>
  const otherEvents=workspace?.events.filter(event=>!receipt.snapshot?.events.some(original=>original.eventId===event.eventId)&&workspace.coverage.find(row=>row.eventId===event.eventId)?.state!=='accepted')??[]
  return <Card className={styles.card}><CardTitle>{copy.earlierFormVersion}</CardTitle><Status state={receipt.summary.legacy?'legacy':receipt.summary.latestReviewStatus??'pending'}/>{receipt.summary.note&&<p className={styles.notice}>{receipt.summary.note}</p>}{receipt.snapshot?<><p className={styles.muted}>{copy.recorder}: {receipt.recorderName}</p><ConsentSnapshotDetails snapshot={receipt.snapshot}/></>:<p className={styles.muted}>{copy.legacyReceipt}</p>}{workspace&&<section className={styles.form}><h3>{copy.currentScope}</h3>{receipt.summary.controlledCoverage.length?<div className={styles.events}>{receipt.summary.controlledCoverage.map(row=><div className={styles.event} key={row.eventId}>{workspace.events.find(event=>event.eventId===row.eventId)?.name??receipt.snapshot?.events.find(event=>event.eventId===row.eventId)?.name??copy.event}<Status state={workspace.coverage.find(item=>item.eventId===row.eventId)?.state??'required'}/></div>)}</div>:<p className={styles.muted}>{copy.superseded}</p>}{otherEvents.length>0&&<><h3>{copy.laterEvents}</h3>{otherEvents.map(event=><div className={styles.event} key={event.eventId}>{event.name}<Status state={workspace.coverage.find(row=>row.eventId===event.eventId)?.state??'required'}/></div>)}</>}</section>}{workspace?.canReview&&<ReviewActions key={submissionId} workspace={workspace} receipt={receipt}/>}</Card>
}

export function OperatorPermissionWorkflow(){const {search}=useLocation();return<div className={styles.root}><WorkspaceBoundary><OperatorWorkspace key={search} requestedStudent={new URLSearchParams(search).get("student")}/></WorkspaceBoundary></div>}
function OperatorWorkspace({requestedStudent}:{requestedStudent:string|null}){
  const signing=useQuery(api.permissions.signingSettings,{}),setSigning=useMutation(api.permissions.setSigningPaused),[signingBusy,setSigningBusy]=useState(false),[signingError,setSigningError]=useState('')
  const viewer=useQuery(api.app.viewer,{}) as {user:{role:'coach'|'mentor'|'parent'|'student'}|null}|undefined
  const roster=useQuery(api.app.teamRoster,{}) as {_id:Id<'students'>;preferredName:string;legalName?:string}[]|undefined;const[selected,setSelected]=useState<Id<'students'>|null>(requestedStudent as Id<'students'>|null)
  const studentId=selected?(roster?.some(row=>row._id===selected)?selected:null):roster?.[0]?._id??null
  return <><div className="page-head"><div><h1>{copy.reviewTitle}</h1><p className="muted">{copy.reviewDescription}</p></div></div><Card className={styles.card}><CardTitle>Parent permission signing</CardTitle><label className={styles.checkbox}><Checkbox checked={signing ? !signing.paused : false} disabled={!signing||signingBusy} onCheckedChange={async enabled=>{setSigningBusy(true);setSigningError('');try{await setSigning({paused:!enabled})}catch(cause){setSigningError(errorText(cause,'Could not change parent signing.'))}finally{setSigningBusy(false)}}}/><span>Parent permission signing: {signing?.paused===false?'On — parents can be asked to sign':'Off — parents are not asked to sign'}</span></label>{signingError&&<p role="alert" className={styles.error}>{signingError}</p>}</Card>{viewer?.user?.role==='coach'&&<PermissionVersionAuthoring/>}{!roster?<p role="status">{copy.loading}</p>:!roster.length?<p>{copy.noStudents}</p>:<>{selected&&!studentId&&<p role="status">The linked student is not available in this roster. Choose a student below.</p>}<label className={styles.field}>{copy.chooseStudent}<NativeSelect value={studentId??''} onChange={event=>setSelected(event.target.value as Id<'students'>)}>{!studentId&&<NativeSelectOption value="" disabled>Choose a student</NativeSelectOption>}{roster.map(row=><NativeSelectOption value={row._id} key={row._id}>{row.legalName||row.preferredName}</NativeSelectOption>)}</NativeSelect></label>{studentId&&<OperatorStudent key={studentId} studentId={studentId}/>}</>}</>
}
function OperatorStudent({studentId}:{studentId:Id<'students'>}){
  const workspace=useQuery(workspaceQuery,{studentId});const[selected,setSelected]=useState<Id<'permissionSubmissions'>|null>(null),[paper,setPaper]=useState(false)
  if(!workspace)return<p role="status">{copy.loading}</p>
  return <>{workspace.signingMode==="synthetic"&&<p className={styles.notice}>{copy.syntheticNotice}</p>}<CurrentCoverage workspace={workspace}/><div className={styles.actions}><Button variant="outline" disabled={!workspace.canRecordPaper||workspace.version?.version!==fieldTripApproved.templateVersion||!workspace.events.length} aria-describedby={!workspace.canRecordPaper||workspace.version?.version!==fieldTripApproved.templateVersion||!workspace.events.length?"paper-action-hint":undefined} onClick={()=>setPaper(!paper)}>{paper?copy.cancel:copy.paperAction}</Button></div>{(!workspace.canRecordPaper||workspace.version?.version!==fieldTripApproved.templateVersion||!workspace.events.length)&&<p id="paper-action-hint" className={styles.muted}>{workspace.gateReason??(workspace.events.length===0?copy.noEvents:copy.noVersion)}</p>}{paper&&<PaperForm workspace={workspace} recorded={id=>{setPaper(false);setSelected(id)}}/>}<div className={styles.twoColumns}><ReceiptHistory workspace={workspace} selected={selected} choose={setSelected}/>{selected&&<ReceiptForFormat submissionId={selected} format={workspace.receipts.find(row=>row.submissionId===selected)?.format??0} workspace={workspace}/>}</div><RequestSignature workspace={workspace}/><PermissionExport workspace={workspace}/></>
}

function useRetryKey(){const pending=useRef<{fingerprint:string;key:string}|null>(null);return{get:(fingerprint:string)=>{if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()};return pending.current.key},clear:()=>{pending.current=null}}}
function PaperForm({workspace,recorded}:{workspace:Workspace;recorded:(id:Id<'permissionSubmissions'>)=>void}){
  const[events,setEvents]=useState<Id<'events'>[]>([]),[signer,setSigner]=useState(''),[email,setEmail]=useState(''),[signedAt,setSignedAt]=useState(''),[reference,setReference]=useState('')
  const[prepared,setPrepared]=useState<FunctionReturnType<typeof api.permissionsV2Pdf.preparePaper>|null>(null),[attested,setAttested]=useState(false),[pdfReady,setPdfReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const prepare=useAction(api.permissionsV2Pdf.preparePaper),record=useAction(api.permissionsV2Pdf.submitPaper)
  const paperSignedAt=new Date(signedAt).getTime()
  async function submit(event:FormEvent){event.preventDefault();setError('');setBusy(true);try{
    if(!prepared){if(!events.length)throw new Error(copy.selectAtLeastOne);if(!Number.isFinite(paperSignedAt)||paperSignedAt>Date.now())throw new Error("Enter the date the paper form was signed. It can't be in the future.");setPrepared(await prepare({studentId:workspace.student.studentId,eventIds:events,signerName:signer,...(email.trim()?{signerEmail:email.trim()}: {})}));setAttested(false)}
    else{if(!pdfReady||!attested)throw new Error('Read the prepared form and confirm it matches the signed paper copy, then record it.');recorded(await record({draftId:prepared.draftId,typedName:prepared.snapshot.signer.name,acknowledged:true,paperReference:reference,paperSignedAt}))}
  }catch(cause){setError(errorText(cause,copy.paperFailed))}finally{setBusy(false)}}
  return <Card className={styles.card}><CardTitle>Record a paper permission form</CardTitle><p>The student must have finished setup and a parent must have confirmed the student's profile. Then compare the prepared form with the signed paper copy.</p><form onSubmit={event=>void submit(event)}><fieldset className={styles.form} disabled={busy}>{!prepared?<><EventSelection events={workspace.events} selected={events} onChange={setEvents}/><div className={styles.fields}><label>{copy.paperSigner}<Input required value={signer} maxLength={160} onChange={event=>setSigner(event.target.value)}/></label><label>{copy.paperSignerEmail}<Input type="email" value={email} maxLength={254} onChange={event=>setEmail(event.target.value)}/></label><label>{copy.paperSignedAt}<Input type="datetime-local" required value={signedAt} onChange={event=>setSignedAt(event.target.value)}/><span className={styles.muted}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></label><label>{copy.paperReference}<Input required value={reference} maxLength={254} onChange={event=>setReference(event.target.value)}/></label></div></>:<><dl className={styles.details}><dt>Paper reference</dt><dd>{reference}</dd><dt>Paper signed</dt><dd>{when(paperSignedAt)}</dd><dt>Recorded by</dt><dd>{workspace.actor.name}</dd></dl><SecurePermissionPdf key={prepared.draftId} draftId={prepared.draftId} rendition="reviewed" expectedSha256={prepared.pdfSha256} onReady={setPdfReady}/><p className={styles.muted}>{copy.paperReferenceCode}: {prepared.pdfSha256}</p><label className={styles.checkbox}><Checkbox checked={attested} onCheckedChange={setAttested}/><span>I checked the signed paper copy. The signer, events and prepared form match it.</span></label></>}{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}>{prepared&&<Button type="button" variant="outline" onClick={()=>{setPrepared(null);setPdfReady(false);setError('')}}>{copy.back}</Button>}<Button type="submit" disabled={prepared?!pdfReady||!attested:!events.length} aria-describedby={(prepared?(!pdfReady||!attested):!events.length)?'paper-submit-hint':undefined}>{busy?copy.preparing:prepared?(prepared.snapshot.synthetic?copy.recordPaper:"Record paper form"):'Prepare the form'}</Button></div>{!busy&&(prepared?(!pdfReady||!attested):!events.length)&&<p id="paper-submit-hint" className={styles.muted}>{prepared?'Read the form and confirm it matches the signed paper copy, then record it.':copy.selectAtLeastOne}</p>}</fieldset></form></Card>
}

function ReviewActions({workspace,receipt}:{workspace:Workspace;receipt:Receipt}){
  const[note,setNote]=useState(''),[field,setField]=useState<CorrectionField>('general'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const review=useMutation(reviewMutation),retry=useRetryKey()
  const controlled=receipt.summary.controlledCoverage
  const actionable=workspace.canReview&&!receipt.summary.legacy&&controlled.length>0&&controlled.every(expected=>workspace.coverage.some(row=>row.eventId===expected.eventId&&row.revision===expected.revision&&row.signatureRequestedAt===null))
  async function save(status:'accepted'|'correction'){setBusy(true);setError('');setSaved('');try{if(status==='correction'&&!note.trim())throw new Error(copy.correctionRequired);const request={submissionId:receipt.summary.submissionId,status,...(note.trim()?{note:note.trim()}:{}),...(status==='correction'?{field}:{}),expectedLatestReviewId:receipt.summary.latestReviewId,expectedCoverage:controlled};await review({...request,idempotencyKey:retry.get(JSON.stringify(request))});retry.clear();setSaved(copy.reviewSaved)}catch(cause){setError(errorText(cause,copy.reviewFailed))}finally{setBusy(false)}}
  return <section className={styles.form}><fieldset className={styles.form} disabled={busy||!actionable}><label className={styles.field}>{copy.correctionNote}<Textarea value={note} maxLength={1000} onChange={event=>setNote(event.target.value)}/></label><label className={styles.field}>{copy.correctedField}<NativeSelect value={field} onChange={event=>setField(event.target.value as CorrectionField)}>{Object.entries(copy.fields).filter(([value])=>receipt.summary.format!==2||value!=='medicationChoices').map(([value,label])=><NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>)}</NativeSelect></label><div className={styles.actions}><Button aria-describedby={!actionable?'review-action-hint':undefined} onClick={()=>void save('accepted')}>{copy.accept}</Button><Button variant="outline" aria-describedby={!actionable?'review-action-hint':undefined} onClick={()=>void save('correction')}>{copy.sendBack}</Button></div></fieldset>{!actionable&&<p id="review-action-hint" className={styles.muted}>{copy.reviewNotActionable}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}{saved&&<p role="status" className={styles.success}>{saved}</p>}</section>
}
function RequestSignature({workspace}:{workspace:Workspace}){
  const[selected,setSelected]=useState<Id<'events'>[]>([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');const request=useMutation(requestMutation)
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');setSaved('');try{if(!selected.length)throw new Error(copy.selectAtLeastOne);await request({studentId:workspace.student.studentId,eventIds:selected,expectedCoverage:selected.map(eventId=>({eventId,revision:workspace.coverage.find(row=>row.eventId===eventId)?.revision??0})),reason});setSaved(copy.requestSaved);setSelected([]);setReason('')}catch(cause){setError(errorText(cause,copy.requestFailed))}finally{setBusy(false)}}
  return <Card className={styles.card}><CardTitle>{copy.requestSignature}</CardTitle><form onSubmit={event=>void submit(event)}><fieldset className={styles.form} disabled={busy||!workspace.canReview||workspace.signingPaused}><EventSelection events={workspace.events} selected={selected} onChange={setSelected} disabled={busy}/><label className={styles.field}>{copy.signatureReason}<Textarea required value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)}/></label><Button type="submit" aria-describedby={!workspace.canReview||workspace.signingPaused?"signature-access-hint":undefined}>{copy.requestSignature}</Button></fieldset></form>{(!workspace.canReview||workspace.signingPaused)&&<p id="signature-access-hint" className={styles.muted}>{workspace.signingPaused?'Turn parent permission signing on before requesting a signature.':copy.reviewAccessRequired}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}{saved&&<p role="status" className={styles.success}>{saved}</p>}</Card>
}
function PermissionExport({workspace}:{workspace:Workspace}){
  const events=useQuery(api.app.listEvents,{}) as {event:{_id:Id<'events'>;name:string}}[]|undefined
  const[selected,setSelected]=useState<Id<'events'>|null>(null),[includeHealth,setIncludeHealth]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[collected,setCollected]=useState(0),[completedCount,setCompletedCount]=useState<number|null>(null);const packet=useMutation(exportMutation)
  const active=useRef<{cancelled:boolean}|null>(null)
  useEffect(()=>()=>{if(active.current)active.current.cancelled=true},[])
  async function download(){
    if(!selected||active.current)return
    const collection={cancelled:false};active.current=collection;setBusy(true);setError('');setCollected(0);setCompletedCount(null)
    try{
      if(includeHealth&&!workspace.canHealthExport)throw new Error(copy.healthGrantRequired)
      const data=await collectPermissionExport(packet,{eventId:selected,includeHealth},{cancelled:()=>collection.cancelled,progress:setCollected})
      if(collection.cancelled)return
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`permission-${data.event.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()||'event'}-${includeHealth?'health-packet':'manifest'}.json`;anchor.click();setCompletedCount(data.records.length);setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(cause){if(!collection.cancelled)setError(errorText(cause,copy.exportFailed))}finally{active.current=null;setBusy(false);setCollected(0)}
  }
  function cancel(){if(active.current)active.current.cancelled=true;setCollected(0);setError(copy.exportCancelled)}
  return <Card className={styles.card}><CardTitle>{copy.export}</CardTitle><p className={styles.muted}>{copy.exportDescription}</p><p className={styles.muted}>{copy.collectionSemantics}</p><label className={styles.field}>{copy.exportEvent}<NativeSelect disabled={!events||busy} value={selected??''} onChange={event=>{setCompletedCount(null);setError('');setSelected(event.target.value?event.target.value as Id<'events'>:null)}}><NativeSelectOption value="">{copy.chooseEvent}</NativeSelectOption>{events?.map(({event})=><NativeSelectOption value={event._id} key={event._id}>{event.name}</NativeSelectOption>)}</NativeSelect></label><label className={styles.checkbox}><Checkbox checked={includeHealth} disabled={!workspace.canHealthExport||busy} aria-describedby={!workspace.canHealthExport?"health-export-hint":undefined} onCheckedChange={value=>{setCompletedCount(null);setError('');setIncludeHealth(value)}}/><span>{copy.includeHealth}</span></label>{!workspace.canHealthExport&&<p id="health-export-hint" className={styles.muted}>{copy.healthGrantRequired}</p>}<div className={styles.actions}><Button disabled={busy||!selected||!workspace.canReview} aria-describedby={[!selected?'export-event-hint':null,!workspace.canReview?'export-access-hint':null].filter(Boolean).join(' ')||undefined} onClick={()=>void download()}>{busy?copy.downloading:includeHealth?copy.downloadHealth:copy.download}</Button>{busy&&<Button variant="outline" onClick={cancel}>{copy.cancelExport}</Button>}</div>{!selected&&<p id="export-event-hint" className={styles.muted}>{copy.chooseEventFirst}</p>}{!workspace.canReview&&<p id="export-access-hint" className={styles.muted}>{copy.reviewAccessRequired}</p>}{busy&&<p role="status">{copy.exportProgress(collected)}</p>}{completedCount!==null&&<p role="status" className={styles.success}>{copy.exportPrepared(completedCount)}</p>}{workspace.receipts.some(row=>row.synthetic)&&<p className={styles.muted}>{copy.exportSynthetic}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}</Card>
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
      if(page.schemaVersion!==1||page.event.eventId!==scope.eventId||page.synthetic!==(page.records.length>0&&page.records.every(record=>record.synthetic===true))||page.records.length>10)throw new Error(copy.exportScopeChanged)
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
    return{schemaVersion:1 as const,synthetic:records.length>0&&records.every(record=>record.synthetic===true),event:first.event,includeHealth:scope.includeHealth,collectionStartedAt:first.generatedAt,collectionCompletedAt:completedAt,collectionSemantics:copy.collectionSemantics,records}
  }finally{
    // Failures, grant revocation and cancellation keep no partial packet available.
    if(!complete)records.length=0
  }
}

export function PermissionVersionAuthoring(){
  const current=useQuery(api.permissionVersions.current,{})
  const select=useMutation(api.permissionVersions.selectApprovedFieldTripTemplate)
  const[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  const active=current?.formFormat===2&&current.version===fieldTripApproved.templateVersion
  async function useApproved(){setBusy(true);setError('');setSaved(false);try{await select({});setSaved(true)}catch(error){setError(userFacingError(error, "The approved permission form couldn't be set up. Reload the page, then try again."))}finally{setBusy(false)}}
  return <Card className={styles.card}><CardTitle>Permission form setup</CardTitle><p className={styles.notice}>This is the approved permission form. It keeps the original one-page layout and wording, including minor first aid.</p>{current===undefined?<p role="status">{copy.loading}</p>:<><p><strong>{fieldTripApproved.title}</strong> · Version: {fieldTripApproved.templateVersion}</p><p className={styles.muted}>{fieldTripApproved.schoolName} · {fieldTripApproved.teamName}</p><p id="approved-template-status" role="status">{active?'New forms will use this form.':current?`Currently in use: ${current.title} · Version: ${current.version}`:"No permission form is set up for this season yet. Parents can't sign until you choose one."}</p><Button variant="outline" disabled={busy||active} aria-describedby={active?"approved-template-status":undefined} onClick={()=>void useApproved()}>{busy?'Setting up…':'Use the approved permission form'}</Button>{saved&&<p role="status" className={styles.success}>The approved permission form is now in use. Forms already signed keep their original layout and wording.</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}</>}</Card>
}

export function ConsentSnapshotDetails({snapshot}:{snapshot:ConsentSnapshot}){
  return <div className={styles.receipt}>
    <p className={styles.notice} role="status">{copy.syntheticNotice}</p>
    <dl className={styles.details}><dt>{copy.student}</dt><dd>{snapshot.student.legalName}</dd><dt>{copy.subteam}</dt><dd>{snapshot.student.subteam}</dd><dt>{copy.signer}</dt><dd>{snapshot.signer.name}</dd>{snapshot.signer.email&&<><dt>{copy.signerEmail}</dt><dd>{snapshot.signer.email}</dd></>}<dt>{copy.source}</dt><dd>{snapshot.signer.source==='electronic'?copy.electronic:copy.paper}</dd><dt>{copy.version}</dt><dd>{snapshot.version.version}</dd>{snapshot.signedAt!==null&&<><dt>{copy.signedAt}</dt><dd>{when(snapshot.signedAt)}</dd></>}{snapshot.recordedAt!==null&&<><dt>{copy.recordedAt}</dt><dd>{when(snapshot.recordedAt)}</dd></>}{snapshot.paper&&<><dt>{copy.paperReference}</dt><dd>{snapshot.paper.reference}</dd><dt>{copy.paperSignedAt}</dt><dd>{when(snapshot.paper.signedAt)}</dd></>}</dl>
    <section><h3>{copy.originalScope}</h3><div className={styles.events}>{snapshot.events.map(event=><div className={styles.event} key={event.eventId}><strong>{event.name} · {event.type}</strong><span>{eventDateRange(event.startsAt,event.endsAt)} · {snapshotPlace(event.destination)}</span><span className={styles.muted}>{transportationLabel(event.travel)}</span><dl className={styles.details}><dt>{copy.eventFee}</dt><dd>{(event.feeCents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})}</dd><dt>{copy.overnight}</dt><dd>{event.overnight?copy.yes:copy.no}</dd><dt>{copy.independentTravel}</dt><dd>{event.independentTravel?copy.yes:copy.no}</dd><dt>{copy.teamTransport}</dt><dd>{event.transportEnabled?copy.yes:copy.no}</dd>{event.busSeats!==null&&<><dt>{copy.busSeats}</dt><dd>{event.busSeats}</dd></>}{event.additionalAdults!==null&&<><dt>{copy.additionalAdults}</dt><dd>{event.additionalAdults}</dd></>}<dt>{copy.trailerRequired}</dt><dd>{event.trailerRequired?copy.yes:copy.no}</dd></dl></div>)}</div></section>
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
