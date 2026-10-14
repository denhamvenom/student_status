import { PendingJoinView } from './PendingJoinView'
import { WithdrawnEventFee } from './WithdrawnEventFee'
import { eventDraftIssue } from './lib/new-event-validation'
import { CoachStudentRecord } from './CoachStudentRecord'
import { TeamReports } from './TeamReports'
import { CoachRosterManagement } from './CoachRosterManagement'
import { rosterManagementCopy } from './lib/roster-management-copy'
import { PaymentAdministration } from './PaymentAdministration'
import { SeasonAdministration } from './SeasonAdministration'
import { FamilyLinkMaintenance } from './FamilyLinkMaintenance'
import { CoachFinanceAccounts, CoachFinanceChanges } from './CoachFinanceWorkspace'
import { FinanceExport } from './FinanceExport'
import financeLayoutStyles from './CoachFinanceTable.module.css'
import { financeWorkspaceCopy } from './lib/finance-admin-copy'
import { AdultProfile } from './AdultProfile'
import { DriverOwnerReconciliation } from './DriverOwnerReconciliation'
import FeeAdministration from './FeeAdministration'
import { RetentionReview } from './RetentionReview'
import { operationsCopy } from './lib/operations-copy'
import { ChargeAdministration, chargeCurrency, parseChargeTarget } from './ChargeAdministration'
import { chargeAdministrationCopy } from './lib/charge-administration-copy'
import { Fundraising } from './Fundraising'
import Adults, { AdultInvitationLanding } from './Adults'
import { RequestProfileCorrection, ProfileCorrectionQueue } from './ProfileCorrections'
import { ProfileSetup } from './ProfileSetup'
import { EventEnrollmentNotice } from './EventEnrollmentNotice'
import { RoomViewBoundary } from './RoomViewBoundary'
import { FamilyAttendancePage, FamilyAttendanceSummary, FamilyFunding, TeamFinanceOverview, TeamRosterSummary } from './DashboardReports'
import { reportCopy } from './lib/report-copy'
import familyStyles from './FamilyDashboard.module.css'
import { familyCopy } from './lib/family-copy'
import { liveCopy } from './lib/live-copy'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { uiCopy, statusLabel, percentageLabel } from './lib/ui-copy'
import newEventStyles from './NewEvent.module.css'
import { eventCopy } from './lib/event-copy'
import { AppShell, menu } from './AppShell'
import { ReadinessReview } from './features/design-review/ReadinessReview'
import { Component, createContext, useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery, usePaginatedQuery } from 'convex/react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { ParentPermissionWorkflow, OperatorPermissionWorkflow } from './PermissionWorkflow'
import { ConsentProfileV2Form } from './ConsentProfileV2Form'
import { AttendanceOperations } from './features/operations/AttendanceOperations'
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from './components/ui/dialog'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import operationsStyles from './features/operations/Operations.module.css'
import { EventOperations } from './features/operations/EventOperations'
import { RoomOperations } from './features/operations/RoomOperations'
import { FinanceOperations } from './features/operations/FinanceOperations'
import { DriversPage, EventTransport, IndependentTravel } from './Travel'
import { StudentWithdrawal, WithdrawalQueue, ChargeEditor } from './Withdrawals'
import { CoachParentAccess, ParentInvitationLanding, StudentParents } from './ParentInvites'

type Student = { _id:string; profileRevision?:number; profileSetupRequired?:boolean; preferredName:string; legalName?:string; subteam:string; travelTeam?:boolean; active?:boolean; roomCategory?:string|null; email?:string; shirtSize?:string|null; allergies?:{state:string;text?:string}; medications?:{state:string;text?:string} }
type Event = { _id:string; name:string; type:string; startsAt:number; endsAt:number; destination:string; travel?:string; overnight?:boolean; roomingEnabled?:boolean; feeCents?:number; signupMode?:string; allowWithdrawal?:boolean; archived?:boolean; enrollmentState?:"running"|"failed"|"complete" }
type Viewer = { status:'signedOut'|'pending'|'active'; user:{id:string;name:string;email:string;role:'student'|'parent'|'coach'|'mentor';travelLead:boolean;financialEdit:boolean;theme:string}|null; students:Student[]; season:{_id?:string;name:string}|null }
const qViewer=api.app.viewer
const qDashboard=api.app.studentDashboard
const qEvents=api.app.listEvents
const qFinances=api.app.studentFinances
const qProfile=api.app.studentProfile
const qRoster=api.app.teamRoster
const qMentor=api.app.mentorReport
const qEventDetail=api.app.eventDetail
const mSignup=api.participation.signUp
const mSetTheme=api.app.setTheme
const mRecordFunds=api.finance.recordFunds
const mUpdateProfile=api.app.updateStudentProfile
const mUpdateRoster=api.admin.updateRoster
const qJoinRequests=api.admin.listJoinRequests
const mJoinDecision=api.admin.approveJoin
const mCreateJoinCode=api.admin.createJoinCode
const mCreateEvent=api.admin.createEvent
const mRequestJoin=api.app.requestJoin
const sid=(id:string)=>id as Id<'students'>
const eid=(id:string)=>id as Id<'events'>

const money=(n:number)=> (n/100).toLocaleString('en-US',{style:'currency',currency:'USD'})
const date=(n:number)=>new Date(n).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
const status=statusLabel
const name=(s:Student)=>s.preferredName||s.legalName||'Student'
const role=(v:Viewer)=>v.user?.travelLead?'travelLead':v.user?.role??'student'
const SeasonContext=createContext('Current season')
function Heading({title,description}:{title:string;description?:string}){const season=useContext(SeasonContext);return <div className="page-head"><div><p className="eyebrow">{season}</p><h1>{title}</h1>{description&&<p className="muted lead">{description}</p>}</div></div>}
function Box({title,children}:{title?:string;children:React.ReactNode}){return <section className="card">{title&&<div className="card-head"><h2>{title}</h2></div>}{children}</section>}
function State({children}:{children:React.ReactNode}){return <div className="card"><p>{children}</p></div>}
function SignIn(){const {signIn}=useAuthActions();const [error,setError]=useState('');return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>{liveCopy.signIn.title}</h1><p>{liveCopy.signIn.description}</p><div className="signin-card"><h2>{liveCopy.signIn.heading}</h2><p>{liveCopy.signIn.instruction}</p><Button className="button button-primary" onClick={()=>void signIn('google').catch(()=>setError(uiCopy.errors.signIn))}><img className="icon" src="/assets/icons/google-g.svg" alt=""/>{liveCopy.signIn.action}</Button>{error&&<p role="alert" className="open-text">{error}</p>}</div></div></div>}
function PendingJoin(){
  const request=useMutation(mRequestJoin)
  const {signOut}=useAuthActions()
  const [code,setCode]=useState(''),[first,setFirst]=useState(''),[last,setLast]=useState('')
  const [submitted,setSubmitted]=useState(false),[error,setError]=useState(''),[signOutError,setSignOutError]=useState(''),[busy,setBusy]=useState(false)
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const requestId=await request({code:code.trim(),firstName:first.trim(),lastName:last.trim()});if(!requestId){setError(liveCopy.join.invalidCode);return}setSubmitted(true)}catch(err){setError(err instanceof Error?err.message:String(err))}finally{setBusy(false)}}
  const exit=async()=>{setBusy(true);setSignOutError('');try{await signOut()}catch{setSignOutError(liveCopy.join.signOutFailed)}finally{setBusy(false)}}
  return <PendingJoinView submitted={submitted} busy={busy} signOutError={signOutError} onSignOut={()=>void exit()}><Box title={liveCopy.join.heading}><p>{liveCopy.join.instruction}</p><form className="form-grid" onSubmit={e=>void submit(e)}><label>{liveCopy.join.code} <Input value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" required/></label><label>{liveCopy.join.first} <Input value={first} onChange={e=>setFirst(e.target.value)} required/></label><label>{liveCopy.join.last} <Input value={last} onChange={e=>setLast(e.target.value)} required/></label><p className="muted">{liveCopy.join.studentNote}</p><Button className="button button-primary" type="submit" disabled={busy}>{liveCopy.join.submit}</Button></form>{error&&<p role="alert" className="open-text">{error}</p>}</Box></PendingJoinView>
}
function Home({viewer,studentId}:{viewer:Viewer;studentId:string|null}){const r=role(viewer);if(r==='mentor')return <Mentor/>;if(r==='coach'||r==='travelLead')return <Roster viewer={viewer}/>;if(!studentId)return <State>{liveCopy.states.noLinkedStudent}</State>;return <DashboardPage studentId={studentId}/>}
function DashboardPage({studentId}:{studentId:string}) {
  const data=useQuery(qDashboard,{studentId:sid(studentId)})
  if(!data)return <State>{familyCopy.dashboard.loading}</State>
  const todoGroups=Array.from(new Set(data.todos.map(t=>t.eventId))).map(eventId=>({eventId,todos:data.todos.filter(t=>t.eventId===eventId)}))
  return <>
    <Heading title={name(data.student)}/>
    <div className="section-head"><h2>{familyCopy.dashboard.toDo} · {data.todos.length}</h2></div>
    {data.todos.length?<div className={familyStyles.todoGroups}>{todoGroups.map(group=><section key={group.eventId??'profile'} className={familyStyles.todoGroup}><h3>{group.todos[0].eventName}</h3><div className={familyStyles.todoCards}>{group.todos.map((t,i)=><article key={i} className={`card ${familyStyles.todoCard}`}><strong>{t.label}</strong>{t.dueAt&&<span className="muted">{familyCopy.dashboard.duePrefix} {date(t.dueAt)}</span>}{t.href&&!t.blocked&&<Link className="button button-primary" to={t.href}>{t.href==='/profile'?'Open profile':t.href==='/forms'?'Open permission form':t.href==='/finances'?'Open Money':'View event'}</Link>}</article>)}</div></section>)}</div>:<State>{familyCopy.dashboard.caughtUp}</State>}
    <div className="summary-grid">
      <FamilyFunding studentId={sid(studentId)} compact/>
      <section className="card"><div className="card-head"><h2>{familyCopy.dashboard.events}</h2><Link to="/events">{familyCopy.dashboard.allEvents}</Link></div><div className="event-mini-list">{data.events.length?data.events.map(x=><Link key={x.event._id} className="event-mini" to={`/events/${x.event._id}`}><div><strong>{x.event.name}</strong><span>{date(x.event.startsAt)} · {status(x.participation)}</span></div>{x.readiness.state!=='notApplicable'&&<span className={`badge badge-${x.readiness.state==='ready'?'ready':x.readiness.state==='open'?'open':'pending'}`}>{x.readiness.state==='open'?`${x.readiness.open.length} ${uiCopy.status.open.toLowerCase()}`:status(x.readiness.state)}</span>}</Link>):<p className="muted">{familyCopy.dashboard.noEvents}</p>}</div></section>
      <FamilyAttendanceSummary studentId={sid(studentId)} compact/>
    </div>
  </>
}
function EventList({viewer,studentId}:{viewer:Viewer;studentId:string|null}){const location=useLocation();const restoredFocus=useRef(false);const listed=useQuery(qEvents,{});useEffect(()=>{if(listed&&location.pathname==='/events'&&location.state?.focusNewEvent&&!restoredFocus.current){document.getElementById('new-event-link')?.focus();restoredFocus.current=true}},[listed,location.pathname,location.state]);const dashboard=useQuery(qDashboard,studentId&&(viewer.user?.role==='student'||viewer.user?.role==='parent')?{studentId:sid(studentId)}:'skip');const rows=listed?.map(row=>({...row,participation:dashboard?.events.find(item=>item.event._id===row.event._id)?.participation??row.participation}));if(!rows||(studentId&&(viewer.user?.role==='student'||viewer.user?.role==='parent')&&dashboard===undefined))return <State>{liveCopy.states.loadingEvents}</State>;return <><Heading title={liveCopy.events.title} description={liveCopy.events.description}/>{viewer.user?.role==='coach'&&<p><Link id="new-event-link" className="button button-primary" to="/events/new">{liveCopy.events.newEvent}</Link></p>}{['Competition','Outreach','Team'].filter(type=>rows.some(x=>x.event.type===type)).map(type=><div key={type}><div className="section-head"><h2>{type==='Competition'?liveCopy.events.competitions:type}</h2></div><div className="event-grid">{rows.filter(x=>x.event.type===type).map(x=><Box key={x.event._id}><span className="eyebrow">{x.event.type}</span><h3>{x.event.name}</h3><p>{date(x.event.startsAt)}{date(x.event.endsAt)!==date(x.event.startsAt)?` – ${date(x.event.endsAt)}`:''}</p><p className="muted">{x.event.destination} · {'travel' in x.event ? x.event.travel : liveCopy.events.travelUnavailable}</p>{(viewer.user?.role==='student'||viewer.user?.role==='parent')&&<p><span className="badge badge-pending">{status(x.participation)}</span></p>}<Link className="button button-outline" to={`/events/${x.event._id}`}>{liveCopy.events.viewEvent}</Link></Box>)}</div></div>)}</>}
function EventPage({eventId,viewer,studentId}:{eventId:string;viewer:Viewer;studentId:string|null}){const args={eventId:eid(eventId),...(studentId?{studentId:sid(studentId)}:{})};const detail=useQuery(qEventDetail,args);const signup=useMutation(mSignup);const [error,setError]=useState(''),[busy,setBusy]=useState(false);if(!detail)return <State>{liveCopy.states.loadingEvent}</State>;const e:Event=detail.event;const adult=viewer.user?.role==='coach'||!!viewer.user?.travelLead;const canSign=viewer.user?.role==='student'&&e.signupMode!=='assigned'&&!detail.participation;const change=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn()}catch(err){setError(err instanceof Error?err.message:String(err))}finally{setBusy(false)}};if(e.enrollmentState==="running"||e.enrollmentState==="failed")return <><Link className="back" to="/events">{liveCopy.events.back}</Link><Heading title={e.name} description={`${date(e.startsAt)} · ${e.destination}`}/><EventEnrollmentNotice eventId={eid(eventId)} staff={!!adult} coach={viewer.user?.role==="coach"} failed={e.enrollmentState==="failed"}/></>;return <><Link className="back" to="/events">{liveCopy.events.back}</Link><Heading title={e.name} description={`${date(e.startsAt)} · ${e.destination}`}/>{adult&&<nav className="event-workspace-nav" aria-label={liveCopy.events.sections} onClick={ev=>{const target=ev.target;if(target instanceof HTMLAnchorElement){const section=document.getElementById(target.hash.slice(1));if(section instanceof HTMLDetailsElement)section.open=true}}}><a href="#event-overview">{uiCopy.event.overview}</a><a href="#event-participants">{uiCopy.event.participants}</a><a href={viewer.user?.role==='coach'?'#event-requirements':'#event-overview-requirements'}>{uiCopy.event.requirements}</a><a href="#event-transport">{uiCopy.event.transport}</a>{e.overnight&&e.roomingEnabled&&<a href="#event-rooming">{uiCopy.event.rooming}</a>}</nav>}<div className="two-col" id="event-overview"><Box title={liveCopy.events.details}><div className="detail"><span>{liveCopy.events.type}</span><strong>{e.type}</strong></div><div className="detail"><span>{liveCopy.events.travel}</span><strong>{e.travel}</strong></div>{(viewer.user?.role==='student'||viewer.user?.role==='parent')&&<div className="detail"><span>{liveCopy.events.participation}</span><strong>{status(detail.participation)}</strong></div>}<div className="detail"><span>{liveCopy.events.fee}</span><strong>{detail.participation==='withdrawn'&&studentId?<WithdrawnEventFee eventId={eid(eventId)} studentId={sid(studentId)} feeCents={e.feeCents??0}/>:money(e.feeCents??0)}</strong></div>{detail.participation==='pending'&&<p className="muted">{liveCopy.events.feePending}</p>}{canSign&&<button className="button button-primary" disabled={busy} onClick={()=>void change(()=>signup({eventId:eid(eventId)}))}>{liveCopy.events.signup}</button>}{e.overnight&&e.roomingEnabled&&viewer.user?.role==='student'&&detail.participation==='confirmed'&&<p><Link className="button button-outline" to={`/events/${eventId}/rooming`}>{liveCopy.events.chooseRoommates}</Link></p>}{error&&<p role="alert" className="open-text">{error}</p>}</Box><div id="event-overview-requirements"><Box title={liveCopy.events.requirements}>{detail.readiness?<><span className={`badge badge-${detail.readiness.state==='ready'?'ready':detail.readiness.state==='open'?'open':'pending'}`}>{status(detail.readiness.state)}</span>{detail.readiness.open.length?<div className="simple-list">{detail.readiness.open.map((x:string)=><div className="split-line" key={x}><span>{x}</span><span className="badge badge-open">{liveCopy.events.open}</span></div>)}</div>:<p>{detail.readiness.state==='notApplicable'?uiCopy.event.noRequirements:uiCopy.readiness.allComplete}</p>}</>:<p className="muted">{viewer.user?.role==='coach'||viewer.user?.travelLead?<Link to="/readiness">{uiCopy.event.staffRequirements}</Link>:liveCopy.events.selectStudent}</p>}</Box></div></div>{viewer.user?.role==='student'&&studentId&&detail.participation&&<StudentWithdrawal key={`withdrawal:${eventId}-${studentId}`} eventId={eid(eventId)} studentId={sid(studentId)}/>} {(viewer.user?.role==='coach'||viewer.user?.travelLead)&&<><EventOperations key={`operations:${eventId}`} eventId={eid(eventId)}/><details id="event-transport" className={operationsStyles.disclosure}><summary><strong>{uiCopy.event.transport}</strong><span>{e.travel||liveCopy.events.travelUnavailable}</span></summary><div className={operationsStyles.disclosureBody}><EventTransport key={`transport:${eventId}`} id={eventId}/></div></details>{e.overnight&&e.roomingEnabled&&<details id="event-rooming" className={operationsStyles.disclosure}><summary><strong>{uiCopy.event.rooming}</strong><span>{eventCopy.workspace.roomingSummary}</span></summary><div className={operationsStyles.disclosureBody}><RoomOperations key={`room:${eventId}`} eventId={eid(eventId)} mode="adult"/></div></details>}</>} {studentId&&(viewer.user?.role==='student'||viewer.user?.role==='parent')&&<IndependentTravel key={`independent:${eventId}-${studentId}`} id={eventId} student={studentId} ownProfile={viewer.user?.role==='student'}/>}</>}
function FinancePage({studentId,showHeading=true,allowChargeEditing=false}:{studentId:string|null;showHeading?:boolean;allowChargeEditing?:boolean}) {
  const [chargeDetail,setChargeDetail]=useState<{studentId:string;chargeId:Id<'charges'>}|null>(null)
  const events=useQuery(qEvents,{})
  const data=useQuery(qFinances,studentId?{studentId:sid(studentId)}:'skip')
  const chargesPage=usePaginatedQuery(api.financeDetails.charges,studentId?{studentId:sid(studentId)}:'skip',{initialNumItems:25})
  const historyPage=usePaginatedQuery(api.financeDetails.history,studentId?{studentId:sid(studentId)}:'skip',{initialNumItems:25})
  if(!studentId)return <State>{familyCopy.finance.selectStudent}</State>
  if(!data)return <State>{familyCopy.finance.loading}</State>
  if(chargesPage.status==='LoadingFirstPage'||historyPage.status==='LoadingFirstPage')return <State>{familyCopy.finance.loading}</State>
  const chargeGroups=Array.from(new Set(chargesPage.results.map(c=>c.eventId??'standalone')))
  return <>
    {showHeading&&<Heading title={familyCopy.finance.title} description={uiCopy.finance.description}/>}
    {data.state==='ready'?<><div className={familyStyles.financeMetrics}>
      <Box><span className="metric-label">{familyCopy.finance.due}</span><strong className="metric-value">{chargeCurrency(data.summary.dueCents)}</strong></Box>

      <Box><span className="metric-label">{familyCopy.finance.charged}</span><strong className="metric-value">{chargeCurrency(data.summary.chargedCents)}</strong></Box>
      <Box><span className="metric-label">{familyCopy.finance.applied}</span><strong className="metric-value">{chargeCurrency(data.summary.paidCents)}</strong></Box>
      <Box><span className="metric-label">{familyCopy.finance.available}</span><strong className="metric-value">{chargeCurrency(data.summary.travelBalanceCents)}</strong></Box>
    </div>
    <Box title={familyCopy.finance.bySource}><div className={familyStyles.sourceBalances}><span>{familyCopy.finance.personal} <strong>{chargeCurrency(data.summary.personalAvailableCents)}</strong></span><span>{familyCopy.finance.fundraising} <strong>{chargeCurrency(data.summary.fundraisingAvailableCents)}</strong></span></div><p className="muted">{familyCopy.finance.returnNote}</p></Box></>:<State>{data.state==='failed'?reportCopy.reportFailed:reportCopy.reportUpdating}</State>}
    <FamilyFunding studentId={sid(studentId)}/>
    <section className={familyStyles.chargeGroups} aria-label={familyCopy.finance.charges}>
      {chargeGroups.some(group=>group!=='standalone')&&<h2>{familyCopy.finance.chargesByEvent}</h2>}
      {chargeGroups.length?chargeGroups.map(group=><div className={familyStyles.chargeGroup} key={group}>
        <h3>{group==='standalone'?familyCopy.finance.otherCharges:events?.find(row=>row.event._id===group)?.event.name??familyCopy.finance.eventCharges}</h3>
        <div className={familyStyles.chargeCards}>{chargesPage.results.filter(c=>(c.eventId??'standalone')===group).map(c=>{
          const charged=c.amountCents+(c.adjustedCents??0)-(c.cancelledCents??0)
          const due=charged-c.appliedCents
          return <article className={`card ${familyStyles.chargeCard}`} key={c._id}>
            <div className={familyStyles.chargeCardHead}>{(group==='standalone'||c.label!==events?.find(row=>row.event._id===group)?.event.name)&&<strong>{c.label}</strong>}<span className={`badge ${due<=0?'badge-done':'badge-todo'}`}>{charged===0&&(c.cancelledCents??0)>0?familyCopy.finance.canceled:due<=0?familyCopy.finance.covered:familyCopy.finance.balanceDue}</span></div>
            {!(charged===0&&c.appliedCents===0&&(c.cancelledCents??0)>0)&&<div className={familyStyles.chargeAmounts}><div><span>{familyCopy.finance.charge}</span><strong>{chargeCurrency(charged)}</strong></div><div><span>{familyCopy.finance.appliedShort}</span><strong>{chargeCurrency(c.appliedCents)}</strong></div><div><span>{familyCopy.finance.dueShort}</span><strong>{chargeCurrency(due)}</strong></div></div>}
            {(c.adjustedCents??0)!==0&&<p className="muted">{chargeCurrency(c.adjustedCents??0)} {chargeAdministrationCopy.adjusted}</p>}
            <Button type="button" variant="outline" onClick={()=>setChargeDetail({studentId,chargeId:c._id})}>{chargeAdministrationCopy.details}</Button>
            {(c.cancelledCents??0)>0&&<p className="muted">{chargeCurrency(c.cancelledCents??0)} {familyCopy.finance.canceledLower}</p>}
          </article>
        })}</div>
      </div>):<Box title={familyCopy.finance.charges}><p className="muted">{familyCopy.finance.noCharges}</p></Box>}
    </section>
    {chargesPage.status!=='Exhausted'&&<Button disabled={chargesPage.status!=='CanLoadMore'} onClick={()=>chargesPage.loadMore(25)}>{reportCopy.moreCharges}</Button>}
    {chargeDetail?.studentId===studentId&&<ChargeAdministration key={chargeDetail.chargeId} chargeId={chargeDetail.chargeId} allowEditing={allowChargeEditing} onClose={()=>setChargeDetail(null)}/>}
    <Box title={familyCopy.finance.history}>{historyPage.results.length?<div className="simple-list">{historyPage.results.map(x=><div className="split-line" key={x._id}><span>{date(x.recordedAt)} · {x.safeDescription}{x.method?' / '+status(x.method):''}{!showHeading&&'reason' in x&&x.reason&&<span className="muted"> · {x.reason}</span>}</span><strong>{chargeCurrency(x.amountCents)}</strong></div>)}</div>:<p className="muted">{familyCopy.finance.noTransactions}</p>}</Box>{historyPage.status!=='Exhausted'&&<Button disabled={historyPage.status!=='CanLoadMore'} onClick={()=>historyPage.loadMore(25)}>{reportCopy.moreHistory}</Button>}
  </>
}
function AdminFinance({viewer}:{viewer:Viewer}) {
  const [details,setDetails]=useState<{id:string;name:string}|null>(null)
  const [selection,setSelection]=useState<{id:string;name:string;mode:'details'|'record'}|null>(null)
  const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const [busy,setBusy]=useState(false)
  const pending=useRef<{key:string|null;busy:boolean}>({key:null,busy:false})
  const accountHeading=useRef<HTMLHeadingElement>(null)
  const accountTrigger=useRef<HTMLElement|null>(null)
  const paymentTrigger=useRef<HTMLElement|null>(null)
  useEffect(()=>{if(details){accountHeading.current?.scrollIntoView({block:'start'});accountHeading.current?.focus({preventScroll:true})}},[details])
  const closeDetails=()=>{setDetails(null);accountTrigger.current?.focus()}
  const closePayment=()=>{if(!pending.current.busy){setSelection(null);requestAnimationFrame(()=>paymentTrigger.current?.focus())}}
  const record=useMutation(mRecordFunds)
  const studentId=selection?.id
  const canEdit=viewer.user?.role==='coach'||!!viewer.user?.financialEdit
  const accountState=useQuery(api.financeOperations.operationOptions,canEdit&&studentId?{studentId:sid(studentId)}:'skip')
  const changed=()=>{pending.current.key=null;setError('');setSaved('')}
  const open=(id:string,name:string,mode:'details'|'record')=>{if(pending.current.busy)return;changed();setAmount('');setReason('');if(mode==='details'){accountTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDetails({id,name})}else{paymentTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSelection({id,name,mode})}}
  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(!canEdit||!studentId||pending.current.busy||accountState?.state!=='ready')return
    const amountCents=parseChargeTarget(amount)
    if(amountCents===null||amountCents<=0){setError(liveCopy.financeAdmin.positiveAmount);return}
    const idempotencyKey=pending.current.key??crypto.randomUUID()
    pending.current.key=idempotencyKey;pending.current.busy=true;setBusy(true);setError('');setSaved('')
    try{await record({studentId:sid(studentId),kind:'payment',amountCents,reason:reason.trim(),idempotencyKey});pending.current.key=null;setSaved(liveCopy.financeAdmin.recorded);setAmount('');setReason('')}
    catch(err){setError(err instanceof Error?err.message:String(err))}
    finally{pending.current.busy=false;setBusy(false)}
  }
  return <>
    <Heading title={familyCopy.finance.title} description={canEdit?financeWorkspaceCopy.description:"View balances and account history. You do not have financial editing access."}/>
    <div className={financeLayoutStyles.workspace}>
      <CoachFinanceAccounts onOpen={(id,name)=>open(id,name,'details')} onRecord={(id,name)=>open(id,name,'record')}/>
      <aside><FeeAdministration isCoach={viewer.user?.role==='coach'}/></aside>
    </div>
    {details&&<section aria-label={financeWorkspaceCopy.accountDetails}>
      <h2 className="detail-focus-heading" ref={accountHeading} tabIndex={-1}>{details.name} · {financeWorkspaceCopy.accountDetails}</h2><Button variant="outline" onClick={closeDetails}>Close account</Button>
      <FinancePage key={details.id} studentId={details.id} showHeading={false} allowChargeEditing={viewer.user?.role==='coach'}/>
      {viewer.user?.role==='coach'&&<PaymentAdministration key={`payment:${details.id}`} studentId={sid(details.id)} mode="correction"/>}
      {canEdit&&<><ChargeEditor key={`charge:${details.id}`} studentId={sid(details.id)}/><FinanceOperations key={`finance:${details.id}`} studentId={sid(details.id)}/></>}
    </section>}
    {canEdit&&<PaymentAdministration mode="bulk"/>}
    <TeamFinanceOverview/>
    <FinanceExport selectedStudentId={details?sid(details.id):undefined} selectedStudentName={details?.name}/>
    <CoachFinanceChanges/>
    <Dialog open={!!selection} onOpenChange={value=>{if(!value)closePayment()}}>
      <DialogPortal><DialogOverlay className={newEventStyles.overlay}/><DialogPrimitive.Popup className={newEventStyles.panel}>
        <DialogTitle>{selection?.name} · {selection?.mode==='record'?liveCopy.financeAdmin.recordPayment:financeWorkspaceCopy.accountDetails}</DialogTitle>
        {canEdit&&studentId&&selection?.mode==='record'&&<Box title={liveCopy.financeAdmin.recordPayment}>{accountState?.state!=='ready'&&<p role="status" className="muted">{operationsCopy.finance.financialEditsWait}</p>}<form className="form-grid" onSubmit={e=>void submit(e)}><label>{liveCopy.financeAdmin.amount} <Input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} disabled={busy||accountState?.state!=='ready'} onChange={e=>{changed();setAmount(e.target.value)}} required/></label><label>{liveCopy.financeAdmin.reason} <Input value={reason} disabled={busy||accountState?.state!=='ready'} onChange={e=>{changed();setReason(e.target.value)}} required/></label><Button className="button button-primary" type="submit" disabled={busy||accountState?.state!=='ready'}>{liveCopy.financeAdmin.recordPayment}</Button></form>{error&&<p role="alert" className="open-text">{error}</p>}{saved&&<p role="status" className="ready-text">{saved}</p>}</Box>}
        <Button type="button" variant="outline" disabled={busy} onClick={closePayment}>{financeWorkspaceCopy.close}</Button>
      </DialogPrimitive.Popup></DialogPortal>
    </Dialog>
  </>
}
function ProfileEditor({studentId,student}:{studentId:string;student:Student}){
  const update=useMutation(mUpdateProfile)
  const[revision,setRevision]=useState(student.profileRevision??0),[preferred,setPreferred]=useState(student.preferredName),[shirt,setShirt]=useState(student.shirtSize??'')
  const[error,setError]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false)
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');setSaved('');try{await update({studentId:sid(studentId),expectedRevision:revision,preferredName:preferred.trim(),shirtSize:shirt});setRevision(revision+1);setSaved(liveCopy.profile.saved)}catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}}
  return <Box title={liveCopy.profile.edit}><form className="form-grid" onSubmit={event=>void submit(event)}><label>{liveCopy.profile.preferred}<Input required value={preferred} onChange={event=>setPreferred(event.target.value)}/></label><label>{liveCopy.profile.shirt}<NativeSelect value={shirt} onChange={event=>setShirt(event.target.value)}><NativeSelectOption value="">{liveCopy.profile.chooseSize}</NativeSelectOption>{(['XS','S','M','L','XL','2XL','3XL'] as const).map(size=><NativeSelectOption value={size} key={size}>{liveCopy.profile.shirtSizeLabels[size]}</NativeSelectOption>)}</NativeSelect></label><Button type="submit" disabled={busy}>{liveCopy.profile.save}</Button></form>{error&&<p role="alert" className="open-text">{error}</p>}{saved&&<p role="status" className="ready-text">{saved}</p>}</Box>
}
function Profile({studentId,role}:{studentId:string|null;role:'student'|'parent'}){
  const data=useQuery(qProfile,studentId?{studentId:sid(studentId)}:'skip')
  if(!studentId)return <State>{liveCopy.states.noSelectedStudent}</State>
  if(!data)return <State>{liveCopy.states.loadingProfile}</State>
  const report=(value?:{state:string;text?:string})=>value?.state==='none'?liveCopy.profile.none:value?.state==='reported'?value.text||liveCopy.profile.reported:role==='student'?'Your parent fills this in.':liveCopy.profile.unknownPunctuated
  return <><Heading title={liveCopy.profile.title} description={name(data)}/><Box title={liveCopy.profile.studentDetails}><div className="detail"><span>{liveCopy.profile.legalName}</span><strong>{data.legalName}</strong></div><div className="detail"><span>{liveCopy.profile.preferred}</span><strong>{data.preferredName}</strong></div><div className="detail"><span>{liveCopy.profile.subteam}</span><strong>{data.subteam||'Not set. A Coach assigns this.'}</strong></div><div className="detail"><span>{liveCopy.profile.shirt}</span><strong>{data.shirtSize||liveCopy.profile.unknownPunctuated}</strong></div><div className="detail"><span>{liveCopy.profile.roomCategory}</span><strong>{data.roomCategory||liveCopy.profile.unknownPunctuated}</strong></div></Box>
    {role==='parent'?<ConsentProfileV2Form studentId={sid(studentId)}/>:<><Box title={liveCopy.profile.health}><div className="detail"><span>{liveCopy.profile.allergies}</span><strong>{report(data.allergies)}</strong></div><div className="detail"><span>{liveCopy.profile.medications}</span><strong>{report(data.medications)}</strong></div></Box><ProfileEditor key={studentId} studentId={studentId} student={data}/></>}
    <RequestProfileCorrection key={`correction:${studentId}:${data.profileRevision??0}`} studentId={sid(studentId)} revision={data.profileRevision??0} ownProfile={role==='student'}/>
  </>
}
function RosterRow({student,canEdit}:{student:Student;canEdit:boolean}){const update=useMutation(mUpdateRoster);const [error,setError]=useState(''),[busy,setBusy]=useState(false);const change=async(patch:{subteam?:string;travelTeam?:boolean})=>{setError('');setBusy(true);try{await update({studentId:sid(student._id),...patch})}catch(err){setError(err instanceof Error?err.message:String(err))}finally{setBusy(false)}};return <tr><td data-label={liveCopy.roster.student}><strong>{name(student)}</strong>{error&&<span role="alert" className="open-text">{error}</span>}</td><td data-label={liveCopy.roster.subteam}>{canEdit?<NativeSelect aria-label={`${name(student)} ${liveCopy.roster.subteamSuffix}`} value={student.subteam} disabled={busy} onChange={e=>void change({subteam:e.target.value})}>{(['Mechanical','Programming','Electrical','Outreach','Business','Other'] as const).map(x=><NativeSelectOption value={x} key={x}>{liveCopy.roster.subteamLabels[x]}</NativeSelectOption>)}</NativeSelect>:student.subteam||'Not set'}</td><td data-label={liveCopy.roster.travelTeam}>{canEdit?<label className="checkbox-label"><Checkbox checked={!!student.travelTeam} disabled={busy} onCheckedChange={checked=>void change({travelTeam:checked})}/> {liveCopy.roster.travelTeam}</label>:student.travelTeam?liveCopy.roster.yes:liveCopy.roster.no}</td></tr>}
function Roster({viewer}:{viewer:Viewer}){return viewer.user?.role==='coach'?<><Heading title={liveCopy.roster.title} description={rosterManagementCopy.currentSeasonOnly}/><CoachRosterManagement/></>:<ReadOnlyRoster viewer={viewer}/>}
function ReadOnlyRoster({viewer}:{viewer:Viewer}){const rows=useQuery(qRoster,{});const [search,setSearch]=useState('');const [subteam,setSubteam]=useState('');const [travelOnly,setTravelOnly]=useState(false);if(!rows)return <State>{liveCopy.states.loadingTeam}</State>;const filteredRows=rows.filter(student=>(!search||name(student).toLowerCase().includes(search.toLowerCase()))&&(!subteam||student.subteam===subteam)&&(!travelOnly||student.travelTeam));return <><Heading title={liveCopy.roster.title} description={liveCopy.roster.description}/><TeamRosterSummary/><div className="roster-filters"><Input aria-label={liveCopy.roster.search} placeholder={liveCopy.roster.search} value={search} onChange={event=>setSearch(event.target.value)}/><NativeSelect aria-label={liveCopy.roster.filterSubteam} value={subteam} onChange={event=>setSubteam(event.target.value)}><NativeSelectOption value="">{liveCopy.roster.allSubteams}</NativeSelectOption>{Array.from(new Set(rows.map(student=>student.subteam).filter(Boolean))).map(team=><NativeSelectOption key={team} value={team}>{team}</NativeSelectOption>)}</NativeSelect><Button variant="outline" aria-pressed={travelOnly} onClick={()=>setTravelOnly(!travelOnly)}>{liveCopy.roster.travelTeam}</Button></div><Box title={liveCopy.roster.heading}><div className="table-wrap"><table><thead><tr><th>{liveCopy.roster.student}</th><th>{liveCopy.roster.subteam}</th><th>{liveCopy.roster.travelTeam}</th></tr></thead><tbody>{filteredRows.length?filteredRows.map(s=><RosterRow key={s._id} student={s} canEdit={viewer.user?.role==='coach'}/>):<tr><td colSpan={3}>{liveCopy.roster.noMatches}</td></tr>}</tbody></table></div></Box></>}
function JoinRequest({request,matches}:{request:{_id:Id<'joinRequests'>;firstName:string;lastName:string;email:string;createdAt:number};matches:Student[]}){const decide=useMutation(mJoinDecision);const [existing,setExisting]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const act=async(approve:boolean)=>{setBusy(true);setError('');try{await decide({requestId:request._id,approve,...(approve&&existing?{existingStudentId:sid(existing)}:{})})}catch(err){setError(err instanceof Error?err.message:String(err))}finally{setBusy(false)}};return <Box><div className="split-line"><strong>{request.firstName} {request.lastName}</strong><span className="muted">{date(request.createdAt)}</span></div><p>{request.email}</p>{matches.length>0&&<label>{liveCopy.joinReview.existingMatch} <NativeSelect value={existing} onChange={e=>setExisting(e.target.value)}><NativeSelectOption value="">{liveCopy.joinReview.addNew}</NativeSelectOption>{matches.map(s=><NativeSelectOption value={s._id} key={s._id}>{liveCopy.joinReview.link} {name(s)}</NativeSelectOption>)}</NativeSelect></label>}<div className="action-row"><Button className="button button-primary" disabled={busy||matches.length>0&&!existing} onClick={()=>void act(true)}>{liveCopy.joinReview.approve}</Button><Button className="button button-outline" disabled={busy} onClick={()=>void act(false)}>{liveCopy.joinReview.decline}</Button></div>{matches.length>0&&!existing&&<p className="muted tiny">{liveCopy.joinReview.chooseExisting}</p>}{error&&<p role="alert" className="open-text">{error}</p>}</Box>}
function JoinPage({viewer}:{viewer:Viewer}){const requests=useQuery(qJoinRequests,{});const roster=useQuery(qRoster,{});const create=useMutation(mCreateJoinCode);const [duration,setDuration]=useState<'24h'|'1w'|'2w'>('1w'),[code,setCode]=useState(''),[expiry,setExpiry]=useState(0),[error,setError]=useState('');return <><Heading title={liveCopy.joinReview.title} description={liveCopy.joinReview.description}/>{viewer.user?.role==='coach'&&<CoachParentAccess roster={roster?.map(s=>({_id:s._id,name:name(s)}))??[]}/ >}{viewer.user?.role==='coach'&&<Box title={liveCopy.joinReview.teamCode}><div className="picker-row"><label htmlFor="join-duration">{liveCopy.joinReview.expiresAfter}</label><NativeSelect id="join-duration" value={duration} onChange={e=>setDuration(e.target.value as '24h'|'1w'|'2w')}><NativeSelectOption value="24h">{liveCopy.joinReview.day}</NativeSelectOption><NativeSelectOption value="1w">{liveCopy.joinReview.week}</NativeSelectOption><NativeSelectOption value="2w">{liveCopy.joinReview.twoWeeks}</NativeSelectOption></NativeSelect><Button className="button button-primary" onClick={()=>void create({duration}).then(x=>{setCode(x.code);setExpiry(x.expiresAt);setError('')}).catch(e=>setError(e instanceof Error?e.message:String(e)))}>{liveCopy.joinReview.createCode}</Button></div>{code&&<p role="status"><strong>{code}</strong> · {liveCopy.joinReview.expires} {date(expiry)}</p>}{error&&<p role="alert" className="open-text">{error}</p>}</Box>}<div className="section-head"><h2>{liveCopy.joinReview.pending} · {requests?.length??0}</h2></div>{!requests||!roster?<State>{liveCopy.states.loadingRequests}</State>:requests.length?<div className="two-col">{requests.map(req=><JoinRequest key={req._id} request={req} matches={roster.filter(s=>'email' in s&&typeof s.email==='string'&&s.email.toLowerCase()===req.email.toLowerCase())}/>)}</div>:<State>{liveCopy.joinReview.noRequests}</State>}</>}
function NewEvent({viewer,studentId}:{viewer:Viewer;studentId:string|null}){const create=useMutation(mCreateEvent);const navigate=useNavigate();const [step,setStep]=useState(0),[name,setName]=useState(''),[type,setType]=useState<'Competition'|'Outreach'|'Team'>('Competition'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[destination,setDestination]=useState(''),[mode,setMode]=useState<'assigned'|'open'|'approval'>('assigned'),[assignmentScope,setAssignmentScope]=useState<'travelTeam'|'wholeTeam'>('travelTeam'),[capacity,setCapacity]=useState(''),[fee,setFee]=useState('0'),[permission,setPermission]=useState(true),[first,setFirst]=useState(true),[travel,setTravel]=useState(''),[overnight,setOvernight]=useState(false),[rooming,setRooming]=useState(false),[roomDeadline,setRoomDeadline]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const labels=eventCopy.steps;
const [invalidField,setInvalidField]=useState<string|null>(null);
const draft={name,start,end,destination,mode,capacity,fee,travel,overnight,rooming,roomDeadline};
useEffect(()=>{if(invalidField)document.getElementById(invalidField)?.focus()},[invalidField,step]);
const validate=(at?:number)=>{const issue=eventDraftIssue(draft,at);if(issue){setError(issue.message);setStep(issue.step);setInvalidField(issue.field);document.getElementById(issue.field)?.focus();return false}setError('');setInvalidField(null);return true};
const submit=async()=>{if(!validate())return;setError('');const startsAt=Date.parse(start),endsAt=Date.parse(end);const feeCents=Math.round(Number(fee)*100);if(!name.trim()||!destination.trim()||!travel.trim()||!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<startsAt){setError(eventCopy.errors.required);return}if(!Number.isSafeInteger(feeCents)||feeCents<0){setError(eventCopy.errors.fee);return}setBusy(true);try{const id=await create({name:name.trim(),type,startsAt,endsAt,destination:destination.trim(),travel:travel.trim(),overnight,roomingEnabled:overnight&&rooming,...(overnight&&rooming&&roomDeadline?{roomDeadline:Date.parse(roomDeadline)}:{}),feeCents,signupMode:mode,...(mode==='assigned'?{assignmentScope}:{}),...(mode==='open'&&capacity?{capacity:Number(capacity)}:{}),allowWithdrawal:mode!=='assigned',permissionRequired:permission,firstRequired:first,requirements:[]});navigate(`/events/${id}`)}catch(err){setError(err instanceof Error?err.message:String(err))}finally{setBusy(false)}};return <><EventList viewer={viewer} studentId={studentId}/><Dialog open onOpenChange={open=>{if(!open&&!busy)navigate('/events',{state:{focusNewEvent:true}})}}><DialogPortal><DialogOverlay className={newEventStyles.overlay}/><DialogPrimitive.Popup className={newEventStyles.panel}>
    <div className={newEventStyles.stepHeader}>
      <span className={newEventStyles.stepCount}>{eventCopy.stepCount(step + 1, labels.length)}</span>
      <DialogTitle id="new-event-step">{labels[step]}</DialogTitle>
      <div className={newEventStyles.progress} aria-hidden="true">{labels.map((label,i)=><span key={label} data-complete={i<=step}/>)}</div>
    </div>
    <div className={newEventStyles.body}>
      {step===0&&<>
        <label>{eventCopy.fields.name}<Input id="event-name" aria-invalid={invalidField==='event-name'} aria-describedby={invalidField==='event-name'?'new-event-error':undefined} value={name} onChange={e=>setName(e.target.value)} placeholder={eventCopy.placeholders.name} required/>{invalidField==='event-name'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label>
        <label>{eventCopy.fields.type}<NativeSelect value={type} onChange={e=>setType(e.target.value as typeof type)}><NativeSelectOption>{eventCopy.types.competition}</NativeSelectOption><NativeSelectOption>{eventCopy.types.outreach}</NativeSelectOption><NativeSelectOption>{eventCopy.types.team}</NativeSelectOption></NativeSelect></label>
        <div className={newEventStyles.dateGrid}><label>{eventCopy.fields.starts}<Input id="event-start" aria-invalid={invalidField==='event-start'} aria-describedby={invalidField==='event-start'?'new-event-error':undefined} type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/>{invalidField==='event-start'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label><label>{eventCopy.fields.ends}<Input id="event-end" aria-invalid={invalidField==='event-end'} aria-describedby={invalidField==='event-end'?'new-event-error':undefined} type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} required/>{invalidField==='event-end'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label></div>
        <label>{eventCopy.fields.destination}<Input id="event-destination" aria-invalid={invalidField==='event-destination'} aria-describedby={invalidField==='event-destination'?'new-event-error':undefined} value={destination} onChange={e=>setDestination(e.target.value)} placeholder={eventCopy.placeholders.destination} required/>{invalidField==='event-destination'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label>
      </>}
      {step===1&&<>
        <div className={newEventStyles.choices} role="group" aria-label={eventCopy.audiences.group}>
          <button type="button" className={newEventStyles.choice} aria-pressed={mode==='assigned'&&assignmentScope==='travelTeam'} onClick={()=>{setMode('assigned');setAssignmentScope('travelTeam')}}><strong>{eventCopy.audiences.travelTeam}</strong><span>{eventCopy.audiences.travelTeamDetail}</span></button>
          <button type="button" className={newEventStyles.choice} aria-pressed={mode==='assigned'&&assignmentScope==='wholeTeam'} onClick={()=>{setMode('assigned');setAssignmentScope('wholeTeam')}}><strong>{eventCopy.audiences.wholeTeam}</strong><span>{eventCopy.audiences.wholeTeamDetail}</span></button>
          <button type="button" className={newEventStyles.choice} aria-pressed={mode==='open'} onClick={()=>setMode('open')}><strong>{eventCopy.audiences.open}</strong><span>{eventCopy.audiences.openDetail}</span></button>
        </div>
        {mode==='open'&&<label>{eventCopy.fields.capacity}<Input id="event-capacity" aria-invalid={invalidField==='event-capacity'} aria-describedby={invalidField==='event-capacity'?'new-event-error':undefined} type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)} placeholder={eventCopy.placeholders.capacity}/>{invalidField==='event-capacity'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label>}

      </>}
      {step===2&&<><label>{eventCopy.fields.fee}<Input id="event-fee" aria-invalid={invalidField==='event-fee'} aria-describedby={invalidField==='event-fee'?'new-event-error':undefined} type="number" min="0" step="0.01" value={fee} onChange={e=>setFee(e.target.value)}/>{invalidField==='event-fee'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label><p className={newEventStyles.note}>{eventCopy.notes.fee}</p></>}
      {step===3&&<><div className={newEventStyles.checkboxes}><label><Checkbox checked={permission} onCheckedChange={checked=>setPermission(checked)}/>{eventCopy.fields.permission}</label><label><Checkbox checked={first} onCheckedChange={checked=>setFirst(checked)}/>{eventCopy.fields.first}</label></div>{Number(fee)>0&&<p className={newEventStyles.note}>{eventCopy.notes.requiredPayment}</p>}</>}
      {step===4&&<><label>{eventCopy.fields.travelArrangement}<Input id="event-travel" aria-invalid={invalidField==='event-travel'} aria-describedby={invalidField==='event-travel'?'new-event-error':undefined} value={travel} onChange={e=>setTravel(e.target.value)} placeholder={eventCopy.placeholders.travel}/>{invalidField==='event-travel'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label><div className={newEventStyles.checkboxes}><label><Checkbox checked={overnight} onCheckedChange={checked=>setOvernight(checked)}/>{eventCopy.fields.overnight}</label>{overnight&&<label><Checkbox checked={rooming} onCheckedChange={checked=>setRooming(checked)}/>{eventCopy.fields.rooming}</label>}</div>{overnight&&rooming&&<label>{eventCopy.fields.roomDeadline}<Input id="event-room-deadline" aria-invalid={invalidField==='event-room-deadline'} aria-describedby={invalidField==='event-room-deadline'?'new-event-error':undefined} type="datetime-local" value={roomDeadline} onChange={e=>setRoomDeadline(e.target.value)}/>{invalidField==='event-room-deadline'&&error&&<span id="new-event-error" role="alert" className={newEventStyles.error}>{error}</span>}</label>}<p className={newEventStyles.note}>{eventCopy.notes.drivers}</p></>}
      {step===5&&<dl className={newEventStyles.review}><dt>{eventCopy.review.event}</dt><dd>{name||eventCopy.review.notEntered}</dd><dt>{eventCopy.review.type}</dt><dd>{type}</dd><dt>{eventCopy.review.dates}</dt><dd>{start&&end?`${start} – ${end}`:eventCopy.review.notEntered}</dd><dt>{eventCopy.review.destination}</dt><dd>{destination||eventCopy.review.notEntered}</dd><dt>{eventCopy.review.audience}</dt><dd>{mode==='assigned'?(assignmentScope==='wholeTeam'?eventCopy.audiences.wholeTeam:eventCopy.audiences.travelTeam):mode==='open'?eventCopy.audiences.open:status(mode)}</dd><dt>{eventCopy.review.fee}</dt><dd>{money(Math.round(Number(fee||0)*100))}</dd><dt>{eventCopy.review.travel}</dt><dd>{travel||eventCopy.review.notEntered}</dd><dt>{eventCopy.review.rooming}</dt><dd>{overnight&&rooming?eventCopy.review.enabled:eventCopy.review.notEnabled}</dd></dl>}
    </div>
    <div className={newEventStyles.actions}><button type="button" className={newEventStyles.cancel} disabled={busy} onClick={()=>navigate('/events',{state:{focusNewEvent:true}})}>{eventCopy.actions.cancel}</button><span className={newEventStyles.spacer}/>{step>0&&<Button type="button" data-primary={false} disabled={busy} onClick={()=>setStep(step-1)}>{eventCopy.actions.back}</Button>}{step<5?<Button type="button" data-primary={true} onClick={()=>{if(validate(step))setStep(step+1)}}>{eventCopy.actions.continue}</Button>:<Button type="button" data-primary={true} disabled={busy||eventDraftIssue(draft)!==null} onClick={()=>void submit()}>{eventCopy.actions.create}</Button>}</div>
    {error&&!invalidField&&<p role="alert" className={newEventStyles.error}>{error}</p>}
  </DialogPrimitive.Popup></DialogPortal></Dialog></>}
function Mentor(){const rows=useQuery(qMentor,{});if(!rows)return <State>{liveCopy.states.loadingReport}</State>;return <><Heading title={liveCopy.mentor.title} description={liveCopy.mentor.description}/><Box title={liveCopy.mentor.students}><div className="table-wrap"><table><thead><tr><th>{liveCopy.mentor.student}</th><th>{liveCopy.mentor.subteam}</th><th>{liveCopy.mentor.tuesday}</th><th>{liveCopy.mentor.events}</th></tr></thead><tbody>{!rows.length&&<tr><td colSpan={4}>{liveCopy.mentor.noStudents}</td></tr>}{rows.map(x=><tr key={x.student._id}><td data-label={liveCopy.mentor.student}>{name(x.student)}</td><td data-label={liveCopy.mentor.subteam}>{x.student.subteam||'Not set'}</td><td data-label={liveCopy.mentor.tuesday}>{x.attendance.tuesdayPercent==null?'Unavailable':percentageLabel(x.attendance.tuesdayPercent)}</td><td data-label={liveCopy.mentor.events}>{x.events.length}</td></tr>)}</tbody></table></div></Box></>}

function Settings({viewer}:{viewer:Viewer}){const saveTheme=useMutation(mSetTheme);const {theme,setTheme}=useTheme();const {signOut}=useAuthActions();const [error,setError]=useState('');const choose=(choice:'light'|'dark'|'system')=>{setError('');void saveTheme({theme:choice}).then(()=>{setTheme(choice);toast.success(liveCopy.settings.saved)}).catch(e=>setError(String(e)))};return <><Heading title={liveCopy.settings.title}/><Box title={liveCopy.settings.appearance}><p>{liveCopy.settings.description}</p><div className="action-row" role="group" aria-label={liveCopy.settings.theme}>{(['light','dark','system'] as const).map(choice=><Button key={choice} className={`button ${theme===choice?'button-primary':'button-outline'}`} aria-pressed={theme===choice} onClick={()=>choose(choice)}>{liveCopy.settings.themeLabels[choice]}</Button>)}</div>{error&&<p role="alert" className="open-text">{error}</p>}</Box><Box title={liveCopy.settings.account}><p>{viewer.user?.email}</p><Button className="button button-outline" onClick={()=>void signOut().catch(e=>toast.error(e instanceof Error?e.message:String(e)))}>{liveCopy.settings.signOut}</Button></Box></>}
export default function LiveApp(){const viewer=useQuery(qViewer,{}) as Viewer|undefined;const location=useLocation();const {setTheme}=useTheme();useEffect(()=>{if(viewer?.user?.theme)setTheme(viewer.user.theme)},[viewer?.user?.theme,setTheme]);if(location.pathname==='/invite-adult')return <AdultInvitationLanding viewer={viewer}/>;if(location.pathname==='/invite-parent')return <ParentInvitationLanding viewer={viewer}/>;if(!viewer)return <div className="signin-content"><State>{liveCopy.states.connecting}</State></div>;if(viewer.status==='signedOut')return <SignIn/>;if(viewer.status==='pending')return <PendingJoin/>;if(viewer.user?.role==='student'&&viewer.students.some(student=>student.profileSetupRequired))return <ProfileSetup/>;if(viewer.user?.role==='parent')return <ParentRosterGate viewer={viewer}/>;return <LiveRoutes viewer={viewer}/>}
type FamilyPaging = { status: 'LoadingFirstPage'|'LoadingMore'|'CanLoadMore'|'Exhausted'; onMore:()=>void }
function ParentRosterGate({viewer}:{viewer:Viewer}) {
  const [attempt,setAttempt]=useState(0)
  return <ParentRosterBoundary key={`${viewer.user?.id}:${viewer.season?._id}:${attempt}`} onRetry={()=>setAttempt(value=>value+1)}><ParentRoutes viewer={viewer}/></ParentRosterBoundary>
}
class ParentRosterBoundary extends Component<{children:React.ReactNode;onRetry:()=>void},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  render(){return this.state.failed?<div className="content"><p role="alert">{liveCopy.shell.familyUnavailable}</p><Button type="button" variant="outline" onClick={this.props.onRetry}>{liveCopy.shell.retryFamily}</Button></div>:this.props.children}
}
function ParentRoutes({viewer}:{viewer:Viewer}) {
  const linked=usePaginatedQuery(api.seasonFamilyLinks.currentSeasonPage,{}, {initialNumItems:20})
  return <LiveRoutes viewer={{...viewer,students:linked.results}} familyPaging={{status:linked.status,onMore:()=>linked.loadMore(20)}}/>
}
function ParentRosterPaging({status,onMore}:FamilyPaging) {
  if(status==='Exhausted')return null
  return <div className="student-switch">{status==='LoadingFirstPage'?<p role="status">{liveCopy.shell.loadingFamily}</p>:<><p role="status">{status==='LoadingMore'?liveCopy.shell.loadingMoreFamily:liveCopy.shell.moreFamilyAvailable}</p><Button type="button" variant="outline" disabled={status==='LoadingMore'} onClick={onMore}>{liveCopy.shell.moreFamily}</Button></>}</div>
}
function LiveRoutes({viewer,familyPaging}:{viewer:Viewer;familyPaging?:FamilyPaging}) {const location=useLocation();const [studentId,setStudentId]=useState<string|null>(null);const r=role(viewer);const chosen=viewer.students.some(s=>s._id===studentId)?studentId:viewer.students[0]?._id??null;const path=location.pathname;if(path==='/readiness'&&(r==='coach'||r==='travelLead'))return <ReadinessReview/>;let body:React.ReactNode;if(familyPaging&&viewer.students.length===0&&familyPaging.status!=='Exhausted')body=<State>{familyPaging.status==='LoadingFirstPage'?liveCopy.shell.loadingFamily:familyPaging.status==='LoadingMore'?liveCopy.shell.loadingMoreFamily:liveCopy.shell.moreFamilyAvailable}</State>;else if(path==='/'||(path==='/team'&&r==='coach'))body=<Home viewer={viewer} studentId={chosen}/>;else if(/^\/team\/[^/]+$/.test(path)&&r==='coach')body=<CoachStudentRecord key={path} studentId={sid(path.split('/')[2])}/>;else if(path==='/reports'&&(r==='coach'||r==='travelLead'))body=<TeamReports role={r}/>;else if(path==='/myprofile'&&(r==='mentor'||r==='travelLead'))body=<AdultProfile/>;else if(path==='/retention'&&r==='coach')body=<RetentionReview/>;else if(path==='/adults'&&r==='coach')body=<><Adults/><ProfileCorrectionQueue/></>;else if(path==='/events')body=<EventList viewer={viewer} studentId={chosen}/>;else if(path==='/attendance'&&r==='coach')body=<AttendanceOperations/>;else if(path==='/attendance'&&(r==='student'||r==='parent'))body=chosen?<><Heading title={reportCopy.attendance} description={reportCopy.attendanceDescription}/><FamilyAttendancePage key={chosen} studentId={sid(chosen)}/></>:<State>{liveCopy.states.noLinkedStudent}</State>;else if(path.endsWith('/rooming')&&(r==='student'||r==='coach'||r==='travelLead'))body=<RoomViewBoundary key={path} eventId={path.split('/')[2]}><RoomOperations eventId={eid(path.split('/')[2])} mode={r==='student'?'student':'adult'}/></RoomViewBoundary>;else if(path==='/events/new'&&r==='coach')body=<NewEvent viewer={viewer} studentId={chosen}/>;else if(path.startsWith('/events/'))body=<EventPage eventId={path.split('/')[2]} viewer={viewer} studentId={chosen}/>;else if(path==='/fundraising'&&(r==='coach'||r==='travelLead'))body=<Fundraising/>;else if(path==='/finances'&&(r==='coach'||r==='travelLead'))body=<AdminFinance viewer={viewer}/>;else if(path==='/finances'&&r!=='mentor')body=<FinancePage studentId={chosen}/>;else if(path==='/profile'&&r!=='mentor')body=<Profile studentId={chosen} role={viewer.user?.role==='parent'?'parent':'student'}/>;else if(path==='/parents'&&r==='student')body=<StudentParents student={viewer.students.find(s=>s._id===chosen)?{_id:chosen!,name:name(viewer.students.find(s=>s._id===chosen)!)}:null}/>;else if(path==='/enroll'&&(r==='coach'||r==='travelLead'))body=<JoinPage viewer={viewer}/>;else if(path==='/withdrawals'&&(r==='coach'||r==='travelLead'))body=<><Heading title={liveCopy.shell.withdrawalTitle} description={liveCopy.shell.withdrawalDescription}/><WithdrawalQueue/></>;else if(path==='/drivers'&&(r==='coach'||r==='travelLead'))body=<><DriversPage/>{r==='coach'&&<DriverOwnerReconciliation/>}</>;else if(path==='/forms'&&r==='parent')body=<ParentPermissionWorkflow key={chosen??'none'} studentId={chosen?sid(chosen):null}/>;else if(path==='/permissions'&&(r==='coach'||r==='travelLead'))body=<OperatorPermissionWorkflow/>;else if(path==='/season'&&r==='coach')body=<SeasonAdministration/>;else if(path==='/settings')body=<><Settings viewer={viewer}/>{r==='coach'&&<FamilyLinkMaintenance/>}</>;else body=<><Heading title={menu[r].find(x=>x[1]===path)?.[0]??liveCopy.states.pageUnavailable}/><div className="card"><p>{(['/adults','/season','/retention','/events/new','/team'].includes(path)||path.startsWith('/team/')||path==='/attendance'&&(r==='mentor'||r==='travelLead'))?'This page is for Coaches.':liveCopy.states.pageUnavailableDetail}</p><Link to="/">{liveCopy.states.returnHome}</Link></div></>;return <SeasonContext.Provider value={viewer.season?.name??liveCopy.states.currentSeason}><AppShell viewer={viewer} role={r} familyContext={<>{familyPaging&&<ParentRosterPaging status={familyPaging.status} onMore={familyPaging.onMore}/>}{viewer.students.length>1&&<div className="student-switch" role="group" aria-label={liveCopy.shell.chooseStudent}>{viewer.students.map(s=><button key={s._id} className={chosen===s._id?'selected':''} aria-pressed={chosen===s._id} onClick={()=>setStudentId(s._id)}>{name(s)}</button>)}</div>}{viewer.user?.role==='parent'&&chosen&&<p className="viewing" role="status">{liveCopy.shell.viewing} {name(viewer.students.find(s=>s._id===chosen)!)}</p>}</>}>{body}</AppShell></SeasonContext.Provider>}
