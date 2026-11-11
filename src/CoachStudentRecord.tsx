import { userFacingError } from '@/lib/error-message'
import { FirstStudentVerification } from './FirstRegistration'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import { FamilyAttendanceSummary } from './DashboardReports'
import { chargeCurrency } from './lib/charge-money'
import { rosterManagementCopy as copy } from './lib/roster-management-copy'
import { balanceStatusLabel } from './lib/report-state-copy'
import styles from './CoachRoster.module.css'
import { CoachRosterBoundary } from './CoachRosterBoundary'
import { StudentGroupsEditor, studentGroupsSummary, type StudentGroupFields } from './StudentGroups'
import { EditStudentProfileButton, LinkedParentProfileEditors } from './CoachProfileEdit'

const date=(at:number)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric'}).format(at)
const value=(text:string|null)=>text?.trim()||'Not provided'
const profileItem=(item:string)=>item==='Room category'?'Room type':item
function Fact({label,children}:{label:string;children:React.ReactNode}){return <div><dt>{label}</dt><dd>{children}</dd></div>}
function Money({label,cents}:{label:string;cents:number|null}){return <Fact label={label}>{cents===null?'Unavailable':chargeCurrency(cents)}</Fact>}
/** The last loaded answer of a reloading query, remembered with the key (here the student) it was loaded for. */
export type LoadedFor<K,T>={key:K;value:T}|null
export function rememberLoaded<K,T>(kept:LoadedFor<K,T>,key:K,latest:T|undefined):LoadedFor<K,T>{return latest===undefined||(kept?.key===key&&kept.value===latest)?kept:{key,value:latest}}
/** The live answer, else the remembered one only when it belongs to `key`: another student's record is never shown. */
export function shownLoaded<K,T>(kept:LoadedFor<K,T>,key:K,latest:T|undefined):T|undefined{return latest??(kept?.key===key?kept.value:undefined)}
function RecordContent({studentId}:{studentId:Id<'students'>}){
  const archiveTrigger=useRef<HTMLButtonElement|null>(null); const [asOf,setAsOf]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setAsOf(Date.now()),60000);return()=>clearInterval(timer)},[])
  const healthStatus=useQuery(api.workflowSummaries.healthStatus,{studentId});const latest=useQuery(api.coachRoster.detail,{studentId,asOf}),update=useMutation(api.admin.updateRoster)
  // The minute tick changes `asOf`, and useQuery answers undefined until the new result arrives. Keep this student's last
  // record so the page, and any open dialog such as Edit profile with the Coach's typed values, is not unmounted every minute.
  const [loaded,setLoaded]=useState<LoadedFor<Id<'students'>,NonNullable<typeof latest>>>(null)
  const remembered=rememberLoaded(loaded,studentId,latest)
  if(remembered!==loaded)setLoaded(remembered)
  const data=shownLoaded(loaded,studentId,latest)
  const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[selectedRevision,setSelectedRevision]=useState<number|null>(null)
  if(!data)return <div className={styles.root}><Link to="/team">← Team</Link><p role="status">Loading student record…</p></div>
  const stale=open&&selectedRevision!==data.profileRevision
  const submit=async()=>{if(!reason.trim()||busy||stale)return;setBusy(true);setError('');try{await update({studentId,expectedRevision:data.profileRevision,active:!data.active,reason});setSaved(data.active?copy.archiveSaved:copy.reactivateSaved);setOpen(false);setReason('')}catch(e){setError(userFacingError(e, copy.failed))}finally{setBusy(false)}}
  const balance=data.balance,account=data.account
  const groups:StudentGroupFields={secondarySubteam:data.secondarySubteam,leadership:data.leadership,profileRevision:data.profileRevision}
  const groupsSummary=studentGroupsSummary(groups)
  const accountText=account.linkage==='unlinked'?'None linked':account.linkage==='unavailable'?'Linked account record unavailable':account.access==='active'?'Can sign in':account.access==='inactive'?'Sign-in turned off':'Linked student account · access unknown'
  const event=data.nextEvent
  const eventState=!data.active?'Not applicable while archived':event?event.state==='ready'?'Ready':event.state==='open'?'Needs attention':'Unknown':data.readinessCoverage==='unknown'?'Upcoming event coverage incomplete':'No upcoming enrolled event'
  const health=(report:{state:string;text?:string})=>report.state==='none'?'None reported':report.state==='reported'?report.text?.trim()||'Reported details unavailable':'Unknown'
  return <div className={styles.root}><Link to="/team">← Team</Link><header className={styles.header}><div><h1>{data.name}</h1><p>{data.subteam||'Subteam unassigned'} · {data.travelTeam?'Travel Team':'Team member'} · {data.active?'Active':'Archived'}</p>{groupsSummary&&<p className="muted">{groupsSummary}</p>}</div><div className={styles.actions}>{data.active&&<EditStudentProfileButton key={studentId} studentId={studentId} name={data.name}/>}<Button ref={archiveTrigger} type="button" variant="outline" onClick={()=>{setSelectedRevision(data.profileRevision);setReason('');setError('');setSaved('');setOpen(true)}}>{data.active?copy.archive:copy.reactivate}</Button></div></header>{saved&&<p role="status" className="ready-text">{saved}</p>}
    <div className={styles.grid}><Card><CardHeader><CardTitle>Status</CardTitle></CardHeader><CardContent><dl className={styles.facts}><Fact label="Roster">{data.active?'Active':'Archived'}</Fact><Fact label="Student sign-in">{accountText}</Fact><Fact label="Student setup">{data.profileSetupRequired?'Not done':'Done'}</Fact><Fact label="Missing profile information">{data.missingSummary.length?`${data.missingSummary.length} missing`:'Nothing missing'}</Fact></dl>{data.missingSummary.length>0&&<ul className={styles.missing}>{data.missingSummary.map(item=><li key={item}>{profileItem(item)}</li>)}</ul>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Money</CardTitle></CardHeader><CardContent><p className={styles.note}>{balance.state==='ready'?'Current balance':`${balanceStatusLabel(balance.state)}. Review the Coach finance workspace.`}</p><dl className={styles.facts}><Money label="Balance due" cents={balance.dueCents}/><Money label="Unused payments" cents={balance.personalAvailableCents}/><Money label="Unused fundraising credit" cents={balance.fundraisingAvailableCents}/></dl><Link to="/finances">Open Money</Link>{!data.active&&<p className={styles.note}>Archived profiles remain visible here. Current finance editing requires an active profile.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Next event readiness</CardTitle></CardHeader><CardContent><div className={styles.events}><strong>{event?.name??'No event identified'}</strong><p>{event?date(event.startsAt):''}</p><span className={`badge ${event?.state==='ready'?'badge-ready':'badge-pending'}`}>{eventState}</span>{event&&<p>Participation: {event.participation??'Not signed up'}</p>}{event?.open.map(item=><p key={item}>• {item}</p>)}{data.readinessCoverage==='unknown'&&<p className={styles.note}>Some upcoming events could not be checked. Review the event before treating this record as ready.</p>}{event&&<Link to={`/events/${event.eventId}`}>Open event details</Link>}<Link to="/readiness">Open Readiness</Link></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Health information</CardTitle></CardHeader><CardContent>{healthStatus==='entered'&&<p role="status">Entered, waiting for a parent to confirm.</p>}<dl className={styles.facts}><Fact label="Legal name">{data.legalName}</Fact><Fact label="Preferred name">{data.preferredName}</Fact><Fact label="Email">{data.email}</Fact><Fact label="Shirt size">{value(data.shirtSize)}</Fact><Fact label="Room type">{value(data.roomCategory)}</Fact><Fact label="Emergency name">{value(data.emergencyName)}</Fact><Fact label="Emergency relationship">{value(data.emergencyRelationship)}</Fact><Fact label="Emergency phone">{value(data.emergencyPhone)}</Fact><Fact label="Allergies">{health(data.allergies)}</Fact><Fact label="Medications">{health(data.medications)}</Fact></dl><Link to="/adults">Open profile corrections</Link></CardContent></Card>
    <Card><CardHeader><CardTitle>Parents &amp; guardian</CardTitle></CardHeader><CardContent><dl className={styles.facts}><Fact label="Guardian">{value(data.guardianName)}</Fact><Fact label="Relationship">{value(data.guardianRelationship)}</Fact><Fact label="Phone">{value(data.guardianPhone)}</Fact></dl>{data.parents.length?<ul className={styles.missing}>{data.parents.map((parent,index)=><li key={`${parent.name}:${index}`}>{parent.name} · {parent.linked?'Linked':'Link inactive'} · {parent.access==='active'?'Access active':parent.access==='inactive'?'Access inactive':'Access unknown'}</li>)}</ul>:<p>No parent account links recorded.</p>}{data.parentCoverage==='unknown'&&<p className={styles.note}>Additional parent links may exist beyond this bounded view.</p>}{data.active&&<LinkedParentProfileEditors key={studentId} studentId={studentId}/>}<Link to="/enroll">Open family link management</Link></CardContent></Card>
    <Card><CardHeader><CardTitle>Subteams &amp; Leadership</CardTitle></CardHeader><CardContent><StudentGroupsEditor studentId={studentId} studentName={data.name} student={groups} canEdit={data.active}/></CardContent></Card>
    <Card><CardHeader><CardTitle>Permission form</CardTitle></CardHeader><CardContent><Link to="/permissions">Open permission forms</Link></CardContent></Card></div>
    {data.active&&<FirstStudentVerification studentId={studentId}/>}
    <section>{data.active?<><FamilyAttendanceSummary studentId={studentId} headingLabel="Attendance"/><Link to="/attendance">Open Attendance</Link></>:<><h2>Attendance</h2><p>Attendance reporting for an archived profile is unavailable in the current season. Existing records are retained.</p></>}</section>
    <Dialog open={open} onOpenChange={next=>{if(!next&&!busy)setOpen(false)}}><DialogContent showCloseButton={!busy} finalFocus={()=>archiveTrigger.current?.isConnected?archiveTrigger.current:null}><DialogHeader><DialogTitle>{data.active?copy.archive:copy.reactivate}: {data.name}</DialogTitle><DialogDescription>{data.active?copy.archiveDescription:copy.reactivateDescription}</DialogDescription></DialogHeader><label className="form-grid">{copy.reason}<Input value={reason} maxLength={1000} disabled={busy||stale} onChange={e=>setReason(e.target.value)} required/></label>{stale&&<p role="status" className="open-text">{copy.changed}</p>}{error&&<p role="alert" className="open-text">{error}</p>}<div className="action-row"><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{copy.cancel}</Button>{stale&&<Button ref={archiveTrigger} type="button" variant="outline" onClick={()=>{setSelectedRevision(data.profileRevision);setError('')}}>{copy.reviewLatest}</Button>}<Button type="button" disabled={busy||stale||!reason.trim()} onClick={()=>void submit()}>{busy?copy.saving:data.active?copy.archive:copy.reactivate}</Button></div></DialogContent></Dialog>
  </div>
}
export function CoachStudentRecord({studentId}:{studentId:Id<'students'>}){return <CoachRosterBoundary><RecordContent key={studentId} studentId={studentId}/></CoachRosterBoundary>}
