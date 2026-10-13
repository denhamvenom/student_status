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

const money = (cents:number) => (cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})
const when = (at:number) => new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(at)
const minutes = (ms:number) => `${Math.round(ms/60000)} min`
function Metric({label,value}:{label:string;value:string|number}) {return <div><span>{label}</span><strong className={value===copy.unavailable?styles.unavailable:undefined}>{value}</strong></div>}
function useReportTime(){const [asOf,setAsOf]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setAsOf(Date.now()),30000);return()=>clearInterval(timer)},[]);return asOf}

export function FamilyFunding({studentId,compact=false}:{studentId:Id<'students'>;compact?:boolean}){
  const data=useQuery(api.dashboardReports.familyFinance,{studentId})
  return <Card className={styles.card}><div className={styles.header}><CardTitle>{compact?familyCopy.dashboard.money:copy.funding}</CardTitle>{compact&&<Link to="/finances">{copy.details}</Link>}</div>{!data?<p role="status">{copy.loading}</p>:<><div className={styles.metrics}><Metric label={copy.raised} value={data.raisedCents===null?copy.unavailable:money(data.raisedCents)}/><Metric label={copy.travelShare} value={money(data.travelShareCents)}/>{compact?<><Metric label={copy.applied} value={money(data.paidCents)}/><Metric label={copy.due} value={money(data.dueCents)}/></>:<Metric label={copy.transfersReceived} value={money(data.transferredInCents)}/>}</div>{data.raisedCents===null&&<p className={styles.note}>{copy.grossUnavailable}</p>}{data.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.updatedAt)}</p>}</>}</Card>
}

export function TeamRosterSummary(){const data=useQuery(api.dashboardReports.team,{});return <Card className={styles.card} aria-label={copy.rosterSummary}>{!data?<p role="status">{copy.loading}</p>:<div className={styles.metrics}><Metric label={copy.activeStudents} value={data.activeStudents}/><Metric label={copy.travelTeam} value={data.travelTeamStudents}/><Metric label={copy.inactiveStudents} value={data.inactiveStudents}/></div>}</Card>}

export function TeamFinanceOverview(){
  const data=useQuery(api.dashboardReports.team,{})
  const start=useMutation(api.financeReportMaintenance.start)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function rebuild(){setBusy(true);setError('');try{await start({})}catch(e){setError(e instanceof Error?e.message:copy.rebuildFailed)}finally{setBusy(false)}}
  return <div className={styles.root}><Card className={styles.card}><CardTitle>{copy.teamOverview}</CardTitle>{!data?<p role="status">{copy.loading}</p>:data.state!=='ready'?<><p role={data.state==='failed'?'alert':'status'}>{data.state==='failed'?copy.reportFailed:copy.reportUpdating}</p><p className={styles.note}>{data.message}</p>{data.rebuildRunning&&<p role="status">{copy.rebuildProgress} {data.processed}</p>}{data.canRebuild&&<Button disabled={busy} onClick={()=>void rebuild()}>{busy?copy.rebuilding:copy.rebuild}</Button>}{error&&<p role="alert" className="open-text">{error}</p>}</>:<><div className={styles.metrics}><Metric label={copy.charged} value={money(data.finance.chargedCents)}/><Metric label={copy.applied} value={money(data.finance.paidCents)}/><Metric label={copy.available} value={money(data.finance.travelBalanceCents)}/><Metric label={copy.due} value={money(data.finance.dueCents)}/></div><div className={styles.metrics}><Metric label={copy.personal} value={money(data.finance.personalAvailableCents)}/><Metric label={copy.fundraising} value={money(data.finance.fundraisingAvailableCents)}/><Metric label={copy.earned} value={money(data.finance.travelShareCents)}/></div><p className={styles.note}>{copy.teamMoneyNote}</p>{data.finance.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.finance.updatedAt)}</p>}</>}</Card></div>
}

export function FamilyAttendanceSummary({studentId,compact=false}:{studentId:Id<'students'>;compact?:boolean}){
  const asOf=useReportTime();const data=useQuery(api.dashboardReports.familyAttendance,{studentId,asOf})
  return <Card className={styles.card}><div className={styles.header}><CardTitle>{compact?copy.attendance:copy.verified}</CardTitle>{compact&&<Link to="/attendance">{copy.details}</Link>}</div>{!data?<p role="status">{copy.loading}</p>:data.state!=='ready'?<><p role={data.state==='failed'?'alert':'status'}>{data.message}</p><p className={styles.note}>{copy.attendanceUpdatingNote}</p></>:<><div className={styles.attendanceBig}><strong>{data.verified.tuesdayPercent===null?copy.unavailable:`${data.verified.tuesdayPercent}%`}</strong><span>{copy.tuesday}</span></div><div className="progress-track"><div style={{width:`${data.verified.tuesdayPercent??0}%`}}/><i/></div><div className="goal-row"><span>0%</span><span>{copy.goal}</span><span>100%</span></div><div className="split-line"><span>{copy.tuesday}</span><strong>{data.verified.tuesdayAttended} / {data.verified.tuesdayHeld}</strong></div><div className="split-line"><span>{copy.thursday}</span><strong>{data.verified.thursdayAttended}</strong></div><div className="split-line"><span>{copy.outreach}</span><strong>{copy.unavailable}</strong></div><p className={styles.note}>{copy.verifiedNote}</p>{!compact&&<p className={styles.note}>{copy.outreachUnavailable}</p>}{data.verified.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.verified.updatedAt)}</p>}</>}</Card>
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
