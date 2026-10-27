import { userFacingError } from '@/lib/error-message'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { familyCopy, moneyMeanings } from './lib/family-copy'
import { reportCopy as copy } from './lib/report-copy'
import styles from './DashboardReports.module.css'

export function reportMoney(cents:number) {
  if (!Number.isSafeInteger(cents)) throw new Error('An exact-cent report amount is required.')
  const exact=BigInt(cents),absolute=exact<0n?-exact:exact
  return `${exact<0n?'-':''}$${new Intl.NumberFormat('en-US').format(absolute/100n)}.${String(absolute%100n).padStart(2,'0')}`
}
const money=reportMoney
export function fundraisingReportValues(earnedCents:number,availableCents:number) {
  return {
    earned: {label:copy.travelShare,value:money(earnedCents)},
    available: {label:copy.fundraising,value:money(availableCents)},
  }
}
const when = (at:number) => new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(at)
function Metric({label,value,meaning}:{label:string;value:string|number;meaning?:string}) {return <div><span>{label}</span><strong className={value===copy.unavailable?styles.unavailable:undefined}>{value}</strong>{meaning&&<p className={styles.note}>{meaning}</p>}</div>}
export function FinancialMaintenanceNotice({maintenance}:{maintenance?:{state:'ready'|'draining'|'applying'|'failed';revision:number}|null}){
  if(!maintenance||maintenance.state==='ready')return null
  return <p className={styles.note} role={maintenance.state==='failed'?'alert':'status'}>{maintenance.state==='failed'?copy.financialMaintenanceFailed:copy.financialMaintenancePending} {copy.committedTotals}</p>
}
function useReportTime(nextRefreshAt:number|null|undefined){
  const [asOf,setAsOf]=useState(()=>Date.now())
  useEffect(()=>{
    const refresh=()=>{if(!document.hidden&&nextRefreshAt!=null&&Date.now()>=nextRefreshAt)setAsOf(Date.now())}
    let timer:number|undefined
    const schedule=()=>{
      if(nextRefreshAt==null)return
      timer=window.setTimeout(()=>{refresh();if(Date.now()<nextRefreshAt)schedule()},Math.min(2147483647,Math.max(0,nextRefreshAt-Date.now())))
    }
    schedule()
    document.addEventListener('visibilitychange',refresh)
    return()=>{if(timer!==undefined)window.clearTimeout(timer);document.removeEventListener('visibilitychange',refresh)}
  },[nextRefreshAt,asOf])
  return asOf
}
function useAttendanceReport(studentId:Id<'students'>){
  const [nextRefreshAt,setNextRefreshAt]=useState<number|null>()
  const asOf=useReportTime(nextRefreshAt)
  const data=useQuery(api.dashboardReports.familyAttendance,{studentId,asOf,includeHistory:false})
  useEffect(()=>setNextRefreshAt(data?.nextRefreshAt),[data?.nextRefreshAt])
  return data
}

export function FamilyFunding({studentId,compact=false}:{studentId:Id<'students'>;compact?:boolean}){
  const data=useQuery(api.dashboardReports.familyFinance,{studentId})
  return <Card className={styles.card}><div className={styles.header}><CardTitle>{compact?familyCopy.dashboard.money:copy.funding}</CardTitle>{compact&&<Link to="/finances">{copy.details}</Link>}</div><FinancialMaintenanceNotice maintenance={data?.maintenance}/>{!data?<p role="status">{copy.loading}</p>:data.state!=='ready'?<p role={data.state==='failed'?'alert':'status'}>{data.state==='failed'?copy.reportFailed:copy.reportUpdating}</p>:<><div className={styles.metrics}>{compact&&<Metric meaning={moneyMeanings.due} label={copy.due} value={money(data.dueCents)}/>}<Metric meaning={moneyMeanings.raised} label={copy.raised} value={data.raisedCents===null?copy.unavailable:money(data.raisedCents)}/><Metric meaning={moneyMeanings.earned} {...fundraisingReportValues(data.travelShareCents,data.fundraisingAvailableCents).earned}/>{compact?<Metric meaning={moneyMeanings.applied} label={copy.applied} value={money(data.paidCents)}/>:<Metric meaning={moneyMeanings.transfers} label={copy.transfersReceived} value={money(data.transferredInCents)}/>}{compact&&data.travelBalanceCents>0&&<Metric label={copy.available} value={money(data.travelBalanceCents)} meaning={moneyMeanings.available}/>}</div>{data.raisedCents===null&&<p className={styles.note}>{copy.grossUnavailable}</p>}{data.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.updatedAt)}</p>}</>}</Card>
}

export function TeamRosterSummary(){const data=useQuery(api.dashboardReports.team,{});return <Card className={styles.card} aria-label={copy.rosterSummary}>{!data?<p role="status">{copy.loading}</p>:<div className={styles.metrics}><Metric label={copy.activeStudents} value={data.activeStudents}/><Metric label={copy.travelTeam} value={data.travelTeamStudents}/><Metric label={copy.inactiveStudents} value={data.inactiveStudents}/></div>}</Card>}

export function TeamFinanceOverview(){
  const data=useQuery(api.dashboardReports.team,{})
  const start=useMutation(api.financeReportMaintenance.start)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function rebuild(){setBusy(true);setError('');try{await start({})}catch(e){setError(userFacingError(e, copy.rebuildFailed))}finally{setBusy(false)}}
  return <div className={styles.root}><Card className={styles.card}><CardTitle>{copy.teamOverview}</CardTitle><FinancialMaintenanceNotice maintenance={data?.maintenance}/>{!data?<p role="status">{copy.loading}</p>:data.state!=='ready'?<><p role={data.state==='failed'?'alert':'status'}>{data.state==='failed'?copy.reportFailed:copy.reportUpdating}</p><p className={styles.note}>{data.message}</p>{data.rebuildRunning&&<p role="status">{copy.rebuildProgress} {data.processed}</p>}{data.canRebuild&&<details><summary>More options</summary><Button disabled={busy} onClick={()=>void rebuild()}>{busy?copy.rebuilding:copy.rebuild}</Button></details>}{error&&<p role="alert" className="open-text">{error}</p>}</>:<><div className={styles.metrics}><Metric label={copy.grossRaised} value={data.finance.raisedCents===null?copy.unavailable:money(data.finance.raisedCents)}/><Metric label={copy.charged} value={money(data.finance.chargedCents)}/><Metric label={copy.applied} value={money(data.finance.paidCents)}/><Metric label={copy.available} value={money(data.finance.travelBalanceCents)}/><Metric label={copy.due} value={money(data.finance.dueCents)}/></div><div className={styles.metrics}><Metric label={copy.personal} value={money(data.finance.personalAvailableCents)}/><Metric {...fundraisingReportValues(data.finance.travelShareCents,data.finance.fundraisingAvailableCents).available}/><Metric {...fundraisingReportValues(data.finance.travelShareCents,data.finance.fundraisingAvailableCents).earned}/><Metric label={copy.transfersReceived} value={money(data.finance.transferredInCents)}/></div>{data.finance.raisedCents===null&&<p className={styles.note}>{copy.teamGrossUnavailable}</p>}<p className={styles.note}>{copy.teamGrossDefinition}</p><p className={styles.note}>{copy.teamMoneyNote}</p>{data.finance.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.finance.updatedAt)}</p>}</>}</Card></div>
}

type PhaseAttendance = {tuesdayHeld:number;tuesdayAttended:number;tuesdayPercent:number|null;thursdayAttended:number;outreachAttended:number;buildWeekdayHeld:number;buildWeekdayAttended:number;buildSaturdayHeld:number;buildSaturdayAttended:number;buildSundayHeld:number;updatedAt:number|null}
function AttendancePhaseCards({label,totals,build=false}:{label:string;totals:PhaseAttendance;build?:boolean}){
  return <section className={styles.phaseSection} aria-label={label}><h3 className={styles.phaseTitle}>{label}</h3>{build&&<p className={styles.note}>{copy.buildNamedEvents}</p>}<div className={styles.attendanceCards}>
    <Card className={styles.card}><h4 className={styles.metricLabel}>{build?copy.buildWeekday:copy.tuesday}</h4>{build?<><div className={styles.attendanceBig}><strong>{totals.buildWeekdayAttended}</strong></div><p className={styles.note}>{copy.attendedCount(totals.buildWeekdayAttended,totals.buildWeekdayHeld)}</p></>:<><div className={styles.attendanceBig}><strong>{totals.tuesdayPercent===null?'Not counted yet':`${totals.tuesdayPercent}%`}</strong><span>{copy.attendedCount(totals.tuesdayAttended,totals.tuesdayHeld)}</span></div><div className="progress-track" role="progressbar" aria-label={`${label}: ${copy.tuesday}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.tuesdayPercent??undefined} aria-valuetext={totals.tuesdayPercent===null?'Not counted yet':undefined}><div style={{width:`${totals.tuesdayPercent??0}%`}}/><i/></div><p className={styles.note}>{copy.goal}{totals.tuesdayPercent!==null?` - ${totals.tuesdayPercent>=80?copy.goalReached:copy.goalPending}`:''}</p></>}</Card>
    <Card className={styles.card}><h4 className={styles.metricLabel}>{build?copy.buildSaturday:copy.thursday}</h4><div className={styles.attendanceBig}><strong>{build?totals.buildSaturdayAttended:totals.thursdayAttended}</strong></div><p className={styles.note}>{build?copy.attendedCount(totals.buildSaturdayAttended,totals.buildSaturdayHeld):copy.meetingsAttended}</p></Card>
    <Card className={styles.card}><h4 className={styles.metricLabel}>{copy.outreach}</h4><div className={styles.attendanceBig}><strong>{totals.outreachAttended}</strong></div><p className={styles.note}>{copy.outreachNamedEvents}</p></Card>
  </div>{build&&totals.buildSundayHeld>0&&<p className={styles.note}>{copy.buildSundaySeparate(totals.buildSundayHeld)}</p>}</section>
}
export function FamilyAttendanceSummary({studentId,compact=false,showDetailsBelow=false,headingLabel=copy.verified}:{studentId:Id<'students'>;compact?:boolean;showDetailsBelow?:boolean;headingLabel?:string}){
  const data=useAttendanceReport(studentId)
  return <AttendanceSummary data={data} compact={compact} showDetailsBelow={showDetailsBelow} headingLabel={headingLabel}/>
}
function AttendanceSummary({data,compact=false,showDetailsBelow=false,headingLabel=copy.verified}:{data:ReturnType<typeof useAttendanceReport>;compact?:boolean;showDetailsBelow?:boolean;headingLabel?:string}){
  const heading=<div className={styles.header}>{compact?<CardTitle>{copy.attendance}</CardTitle>:<h2 className={styles.sectionTitle}>{headingLabel}</h2>}{compact&&<Link to="/attendance">{copy.details}</Link>}</div>
  let content
  if(!data)content=<p role="status">{copy.loading}</p>
  else if(data.state!=='ready')content=<><p role={data.state==='failed'?'alert':'status'}>{data.message}</p>{showDetailsBelow&&<p className={styles.note}>{copy.attendanceUpdatingNote}</p>}</>
  else if(data.phaseBoundary.state==='unavailable'||!data.phases)content=<><strong className={styles.unavailable}>{copy.unavailable}</strong><p className={styles.note}>{copy.kickoffUnavailable(data.phaseBoundary.competitionYear)}</p>{showDetailsBelow&&<p className={styles.note}>{copy.attendanceEvidenceAvailable}</p>}</>
  else if(compact){const build=data.phaseBoundary.currentPhase==='buildSeason';const totals=build?data.phases.buildSeason:data.phases.offseason;content=<><p className={styles.phaseLabel}>{build?copy.buildSeason:copy.offseason}</p>{build?<><div className="split-line"><span>{copy.buildWeekday}</span><strong>{totals.buildWeekdayAttended} / {totals.buildWeekdayHeld}</strong></div><div className="split-line"><span>{copy.buildSaturday}</span><strong>{totals.buildSaturdayAttended} / {totals.buildSaturdayHeld}</strong></div><p className={styles.note}>{copy.buildNamedEvents}</p>{totals.buildSundayHeld>0&&<p className={styles.note}>{copy.buildSundaySeparate(totals.buildSundayHeld)}</p>}</>:<><div className={styles.attendanceBig}><strong>{totals.tuesdayPercent===null?'Not counted yet':`${totals.tuesdayPercent}%`}</strong><span>{copy.tuesday}</span></div><div className="progress-track" role="progressbar" aria-label={copy.tuesday} aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.tuesdayPercent??undefined} aria-valuetext={totals.tuesdayPercent===null?'Not counted yet':undefined}><div style={{width:`${totals.tuesdayPercent??0}%`}}/><i/></div><div className="goal-row"><span>0%</span><span>{copy.goal}</span><span>100%</span></div><div className="split-line"><span>{copy.tuesday}</span><strong>{totals.tuesdayAttended} / {totals.tuesdayHeld}</strong></div><div className="split-line"><span>{copy.thursday}</span><strong>{totals.thursdayAttended}</strong></div></>}<div className="split-line"><span>{copy.outreach}</span><strong>{totals.outreachAttended}</strong></div><p className={styles.note}>{copy.kickoffBoundary(data.phaseBoundary.kickoffDate)}</p><p className={styles.note}>{copy.verifiedNote}</p></>}
  else content=<><p className={styles.note}>{copy.kickoffBoundary(data.phaseBoundary.kickoffDate)}</p><AttendancePhaseCards label={copy.offseason} totals={data.phases.offseason}/><AttendancePhaseCards label={copy.buildSeason} totals={data.phases.buildSeason} build/><p className={styles.note}>{copy.verifiedNote}</p>{data.verified.updatedAt!==null&&<p className={styles.note}>{copy.updated} {when(data.verified.updatedAt)}</p>}</>
  return compact?<Card className={styles.card}>{heading}{content}</Card>:<section className={styles.attendanceSection} aria-label={headingLabel}>{heading}{content}</section>
}

export function AttendanceReportRebuild(){
  const data=useQuery(api.attendanceReportMaintenance.status,{})
  const rebuild=useMutation(api.attendanceReportMaintenance.start)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function start(){setBusy(true);setError('');try{await rebuild({})}catch(e){setError(userFacingError(e, copy.attendanceRebuildFailed))}finally{setBusy(false)}}
  return <Card className={styles.card}><CardTitle>{copy.attendanceReportMaintenance}</CardTitle>{!data?<p role="status">{copy.loading}</p>:<><p className={styles.note}>{copy.attendanceRebuildDescription}</p><p role="status">{copy.attendanceCoverage[data.state]} {data.state==='uninitialized'?'':data.processed}</p>{data.lastError&&<p role="alert">{userFacingError(new Error(data.lastError), 'Processing stopped. Check the current status before retrying, or ask a Coach for help.')}</p>}<details><summary>More options</summary><Button disabled={busy||data.state==='running'} onClick={()=>void start()}>{busy?copy.rebuilding:copy.rebuildAttendance}</Button></details>{error&&<p role="alert" className="open-text">{error}</p>}</>}</Card>
}
