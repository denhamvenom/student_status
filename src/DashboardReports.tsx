import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { familyCopy } from './lib/family-copy'
import { reportCopy as copy } from './lib/report-copy'
import styles from './DashboardReports.module.css'

export function reportMoney(cents:number) {
  if (!Number.isSafeInteger(cents)) throw new Error('An exact-cent report amount is required.')
  const exact=BigInt(cents),absolute=exact<0n?-exact:exact
  return `${exact<0n?'-':''}$${new Intl.NumberFormat('en-US').format(absolute/100n)}.${String(absolute%100n).padStart(2,'0')}`
}
const money=reportMoney
const when = (at:number) => new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(at)
const minutes = (ms:number) => `${Math.round(ms/60000)} min`
function Metric({label,value}:{label:string;value:string|number}) {return <div><span>{label}</span><strong className={value===copy.unavailable?styles.unavailable:undefined}>{value}</strong></div>}
export function FinancialMaintenanceNotice({maintenance}:{maintenance?:{state:'ready'|'draining'|'applying'|'failed';revision:number}|null}){
  if(!maintenance||maintenance.state==='ready')return null
  return <p className={styles.note} role={maintenance.state==='failed'?'alert':'status'}>{maintenance.state==='failed'?copy.financialMaintenanceFailed:copy.financialMaintenancePending} {copy.committedTotals}</p>
}
function useReportTime(){const [asOf,setAsOf]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setAsOf(Date.now()),30000);return()=>clearInterval(timer)},[]);return asOf}

export function FamilyFunding({studentId,compact=false}:{studentId:Id<'students'>;compact?:boolean}){
  const data=useQuery(api.dashboardReports.familyFinance,{studentId})
  return <Card className={styles.card}><div className={styles.header}><CardTitle>{compact?familyCopy.dashboard.money:copy.funding}</CardTitle>{compact&&<Link to="/finances">{copy.details}</Link>}</div><FinancialMaintenanceNotice maintenance={data?.maintenance}/>{!data?<p role="status">{copy.loading}</p>:data.state!=='ready'?<p role={data.state==='failed'?'alert':'status'}>{data.state==='failed'?copy.reportFailed:copy.reportUpdating}</p>:<><div className={styles.metrics}><Metric label={copy.raised} value={data.raisedCents===null?copy.unavailable:money(data.raisedCents)}/><Metric label={copy.travelShare} value={money(data.travelShareCents)}/>{compact?<><Metric label={copy.applied} value={money(data.paidCents)}/><Metric label={copy.due} value={money(data.dueCents)}/></>:<Metric label={copy.transfersReceived} value={money(data.transferredInCents)}/>}</div>{data.raisedCents===null&&<p className={styles.note}>{copy.grossUnavailable}</p>}{data.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.updatedAt)}</p>}</>}</Card>
}

export function TeamRosterSummary(){const data=useQuery(api.dashboardReports.team,{});return <Card className={styles.card} aria-label={copy.rosterSummary}>{!data?<p role="status">{copy.loading}</p>:<div className={styles.metrics}><Metric label={copy.activeStudents} value={data.activeStudents}/><Metric label={copy.travelTeam} value={data.travelTeamStudents}/><Metric label={copy.inactiveStudents} value={data.inactiveStudents}/></div>}</Card>}

export function TeamFinanceOverview(){
  const data=useQuery(api.dashboardReports.team,{})
  const start=useMutation(api.financeReportMaintenance.start)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function rebuild(){setBusy(true);setError('');try{await start({})}catch(e){setError(e instanceof Error?e.message:copy.rebuildFailed)}finally{setBusy(false)}}
  return <div className={styles.root}><Card className={styles.card}><CardTitle>{copy.teamOverview}</CardTitle><FinancialMaintenanceNotice maintenance={data?.maintenance}/>{!data?<p role="status">{copy.loading}</p>:data.state!=='ready'?<><p role={data.state==='failed'?'alert':'status'}>{data.state==='failed'?copy.reportFailed:copy.reportUpdating}</p><p className={styles.note}>{data.message}</p>{data.rebuildRunning&&<p role="status">{copy.rebuildProgress} {data.processed}</p>}{data.canRebuild&&<Button disabled={busy} onClick={()=>void rebuild()}>{busy?copy.rebuilding:copy.rebuild}</Button>}{error&&<p role="alert" className="open-text">{error}</p>}</>:<><div className={styles.metrics}><Metric label={copy.grossRaised} value={data.finance.raisedCents===null?copy.unavailable:money(data.finance.raisedCents)}/><Metric label={copy.charged} value={money(data.finance.chargedCents)}/><Metric label={copy.applied} value={money(data.finance.paidCents)}/><Metric label={copy.available} value={money(data.finance.travelBalanceCents)}/><Metric label={copy.due} value={money(data.finance.dueCents)}/></div><div className={styles.metrics}><Metric label={copy.personal} value={money(data.finance.personalAvailableCents)}/><Metric label={copy.fundraising} value={money(data.finance.fundraisingAvailableCents)}/><Metric label={copy.earned} value={money(data.finance.travelShareCents)}/><Metric label={copy.transfersReceived} value={money(data.finance.transferredInCents)}/></div>{data.finance.raisedCents===null&&<p className={styles.note}>{copy.teamGrossUnavailable}</p>}<p className={styles.note}>{copy.teamGrossDefinition}</p><p className={styles.note}>{copy.teamMoneyNote}</p>{data.finance.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.finance.updatedAt)}</p>}</>}</Card></div>
}

type PhaseAttendance = {tuesdayHeld:number;tuesdayAttended:number;tuesdayPercent:number|null;thursdayAttended:number;outreachAttended:number;updatedAt:number|null}
function AttendancePhaseCards({label,totals,build=false}:{label:string;totals:PhaseAttendance;build?:boolean}){
  return <section className={styles.phaseSection} aria-label={label}><h3 className={styles.phaseTitle}>{label}</h3>{build&&<p className={styles.note}>{copy.buildCountingPending}</p>}<div className={styles.attendanceCards}>
    <Card className={styles.card}><h4 className={styles.metricLabel}>{copy.tuesday}</h4><div className={styles.attendanceBig}><strong>{totals.tuesdayPercent===null?copy.unavailable:`${totals.tuesdayPercent}%`}</strong><span>{copy.attendedCount(totals.tuesdayAttended,totals.tuesdayHeld)}</span></div><div className="progress-track" role="progressbar" aria-label={`${label}: ${copy.tuesday}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.tuesdayPercent??undefined} aria-valuetext={totals.tuesdayPercent===null?copy.unavailable:undefined}><div style={{width:`${totals.tuesdayPercent??0}%`}}/><i/></div><p className={styles.note}>{copy.goal}{totals.tuesdayPercent!==null?` - ${totals.tuesdayPercent>=80?copy.goalReached:copy.goalPending}`:''}</p></Card>
    <Card className={styles.card}><h4 className={styles.metricLabel}>{copy.thursday}</h4><div className={styles.attendanceBig}><strong>{totals.thursdayAttended}</strong></div><p className={styles.note}>{copy.meetingsAttended}</p></Card>
    <Card className={styles.card}><h4 className={styles.metricLabel}>{copy.outreach}</h4><div className={styles.attendanceBig}><strong>{totals.outreachAttended}</strong></div><p className={styles.note}>{copy.outreachNamedEvents}</p></Card>
  </div></section>
}
export function FamilyAttendanceSummary({studentId,compact=false}:{studentId:Id<'students'>;compact?:boolean}){
  const asOf=useReportTime();const data=useQuery(api.dashboardReports.familyAttendance,{studentId,asOf})
  const heading=<div className={styles.header}>{compact?<CardTitle>{copy.attendance}</CardTitle>:<h2 className={styles.sectionTitle}>{copy.verified}</h2>}{compact&&<Link to="/attendance">{copy.details}</Link>}</div>
  let content
  if(!data)content=<p role="status">{copy.loading}</p>
  else if(data.state!=='ready')content=<><p role={data.state==='failed'?'alert':'status'}>{data.message}</p><p className={styles.note}>{copy.attendanceUpdatingNote}</p></>
  else if(data.phaseBoundary.state==='unavailable'||!data.phases)content=<><strong className={styles.unavailable}>{copy.unavailable}</strong><p className={styles.note}>{copy.kickoffUnavailable(data.phaseBoundary.competitionYear)}</p><p className={styles.note}>{copy.attendanceEvidenceAvailable}</p></>
  else if(compact){const build=data.phaseBoundary.currentPhase==='buildSeason';const totals=build?data.phases.buildSeason:data.phases.offseason;content=<><p className={styles.phaseLabel}>{build?copy.buildSeason:copy.offseason}</p><div className={styles.attendanceBig}><strong>{totals.tuesdayPercent===null?copy.unavailable:`${totals.tuesdayPercent}%`}</strong><span>{copy.tuesday}</span></div><div className="progress-track" role="progressbar" aria-label={copy.tuesday} aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.tuesdayPercent??undefined} aria-valuetext={totals.tuesdayPercent===null?copy.unavailable:undefined}><div style={{width:`${totals.tuesdayPercent??0}%`}}/><i/></div><div className="goal-row"><span>0%</span><span>{copy.goal}</span><span>100%</span></div><div className="split-line"><span>{copy.tuesday}</span><strong>{totals.tuesdayAttended} / {totals.tuesdayHeld}</strong></div><div className="split-line"><span>{copy.thursday}</span><strong>{totals.thursdayAttended}</strong></div><div className="split-line"><span>{copy.outreach}</span><strong>{totals.outreachAttended}</strong></div><p className={styles.note}>{copy.kickoffBoundary(data.phaseBoundary.kickoffDate)}</p>{build&&<p className={styles.note}>{copy.buildCountingPending}</p>}<p className={styles.note}>{copy.verifiedNote}</p></>}
  else content=<><p className={styles.note}>{copy.kickoffBoundary(data.phaseBoundary.kickoffDate)}</p><AttendancePhaseCards label={copy.offseason} totals={data.phases.offseason}/><AttendancePhaseCards label={copy.buildSeason} totals={data.phases.buildSeason} build/><p className={styles.note}>{copy.verifiedNote}</p>{data.verified.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.verified.updatedAt)}</p>}</>
  return compact?<Card className={styles.card}>{heading}{content}</Card>:<section className={styles.attendanceSection} aria-label={copy.verified}>{heading}{content}</section>
}

export function FamilyAttendancePage({studentId}:{studentId:Id<'students'>}){
  const asOf=useReportTime();const [cursor,setCursor]=useState<string|null>(null);const data=useQuery(api.dashboardReports.familyAttendance,{studentId,asOf,paginationOpts:{numItems:10,cursor}})
  return <div className={styles.root}><FamilyAttendanceSummary studentId={studentId}/><Card className={styles.card}><CardTitle>{copy.legacy}</CardTitle><p className={styles.note}>{copy.legacyNote}</p>{!data?<p role="status">{copy.loading}</p>:<div className={styles.metrics}><Metric label={copy.tuesday} value={data.legacy.tuesdayPercent===null?copy.unavailable:`${data.legacy.tuesdayPercent}% (${data.legacy.tuesdayAttended}/${data.legacy.tuesdayHeld})`}/><Metric label={copy.thursday} value={data.legacy.thursdayAttended}/><Metric label={copy.outreach} value={data.legacy.outreachAttended}/></div>}</Card><h2 className={styles.sectionTitle}>{copy.sessions}</h2><p className={styles.note}>{copy.timezone} {copy.finalizedScope}</p>{!data?<p role="status">{copy.loading}</p>:!data.sessions.length?<Card className={styles.card}><p>{copy.noSessions}</p></Card>:<div className={styles.sessionGrid}>{data.sessions.map(session=><Card key={session.sessionId} className={styles.card}><h3 className={styles.sessionTitle}>{session.title}</h3><p className={styles.note}>{when(session.scheduledStart)}</p><div className={styles.statuses}><span className="badge badge-pending">{copy[session.state]}</span>{session.provisional&&<span className="badge badge-pending">{copy.provisional}</span>}{session.needsReview&&<span className="badge badge-todo">{copy.review}</span>}</div>{session.reportState!=='ready'?<p role="status">{session.reportState==='failed'?copy.attendanceFailed:copy.attendanceUpdating}</p>:<><dl className={styles.sessionMetrics}>{[[copy.total,session.totalMs],[copy.scheduled,session.scheduledMs],[copy.early,session.earlyMs],[copy.extended,session.extendedMs],[copy.longest,session.longestScheduledMs]].map(([label,ms])=><div key={label}><dt>{label}</dt><dd>{ms===null?copy.unavailable:minutes(Number(ms))}</dd></div>)}</dl><strong className={session.qualifies?'ready-text':'muted'}>{session.qualifies?copy.qualifies:copy.doesNotQualify}</strong></>}</Card>)}</div>}{data&&<div className="action-row">{cursor!==null&&<Button variant="outline" onClick={()=>setCursor(null)}>{copy.latestSessions}</Button>}{!data.isDone&&<Button variant="outline" onClick={()=>setCursor(data.continueCursor)}>{copy.olderSessions}</Button>}</div>}</div>
}

export function AttendanceReportRebuild(){
  const data=useQuery(api.attendanceReportMaintenance.status,{})
  const rebuild=useMutation(api.attendanceReportMaintenance.start)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function start(){setBusy(true);setError('');try{await rebuild({})}catch(e){setError(e instanceof Error?e.message:copy.attendanceRebuildFailed)}finally{setBusy(false)}}
  return <Card className={styles.card}><CardTitle>{copy.attendanceReportMaintenance}</CardTitle>{!data?<p role="status">{copy.loading}</p>:<><p className={styles.note}>{copy.attendanceRebuildDescription}</p><p role="status">{copy.attendanceCoverage[data.state]} {data.processed}</p>{data.lastError&&<p role="alert">{data.lastError}</p>}<Button disabled={busy||data.state==='running'} onClick={()=>void start()}>{busy?copy.rebuilding:copy.rebuildAttendance}</Button>{error&&<p role="alert" className="open-text">{error}</p>}</>}</Card>
}
