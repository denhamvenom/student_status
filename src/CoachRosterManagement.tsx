import { userFacingError } from '@/lib/error-message'
import { FirstStudentStatus } from './FirstRegistration'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Card, CardTitle, CardHeader, CardContent } from './components/ui/card'
import { TeamRosterSummary, reportMoney } from './DashboardReports'
import { liveCopy } from './lib/live-copy'
import { rosterManagementCopy as copy } from './lib/roster-management-copy'
import { balanceStatusLabel } from './lib/report-state-copy'
import styles from './CoachRoster.module.css'
import { CoachRosterBoundary } from './CoachRosterBoundary'
import { canonicalSubteam, subteamDisplay, subteamOptions } from './lib/subteams'
import { gradeLabel, sortRoster, type Direction, type RosterSort } from './lib/rosterSort'
import { rosterAsOfAtTransition } from './lib/roster-refresh'

type Row = typeof api.coachRoster.list._returnType['page'][number]
type DirectoryRow = typeof api.coachRoster.directory._returnType['page'][number]
type Quick = 'all'|'notReady'|'missing'|'balanceDue'
const access=(row:Row)=>row.account.linkage==='unlinked'?'Not connected':row.account.linkage==='unavailable'?'Student sign-in unavailable':row.account.access==='active'?'Connected':row.account.access==='inactive'?'Connected (sign-in turned off)':'Access unknown'
const profileItem=(item:string)=>item==='Room category'?'Rooming category':item
const eventStatus=(row:Row)=>!row.active?'Archived':row.nextEvent?row.nextEvent.state==='ready'?'Ready':row.nextEvent.state==='open'?'Needs attention':'Unknown':row.readinessCoverage==='unknown'?'Upcoming events not fully checked':'No upcoming enrolled event'
function useAsOf(){
  const [asOf,setAsOf]=useState(()=>Date.now())
  const transitionAt=useQuery(api.coachRoster.nextTransition,{asOf})
  useEffect(()=>{
    let timer: ReturnType<typeof setTimeout>|undefined
    const schedule=()=>{
      if(timer!==undefined)clearTimeout(timer)
      timer=undefined
      if(document.visibilityState==='hidden'||transitionAt===undefined||transitionAt===null)return
      const now=Date.now()
      const next=rosterAsOfAtTransition(asOf,transitionAt,now,true)
      if(next!==asOf){setAsOf(next);return}
      // Browsers cap timeout durations; a distant event needs a timer reset, not a query refresh.
      timer=setTimeout(schedule,Math.min(transitionAt-now,2_147_483_647))
    }
    schedule()
    document.addEventListener('visibilitychange',schedule)
    return()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule)}
  },[asOf,transitionAt])
  return asOf
}

function RosterRow({row,grade}:{row:Row;grade:string|null}){
  const update=useMutation(api.admin.updateRoster),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const change=async(fields:{subteam?:string;travelTeam?:boolean})=>{setBusy(true);setError('');try{await update({studentId:row.studentId,expectedRevision:row.profileRevision,...fields})}catch(e){setError(userFacingError(e, copy.failed))}finally{setBusy(false)}}
  const missingItems=row.missingSummary.filter(item=>item!=='Profile setup').map(profileItem)
  return <tr>
    <td data-label={liveCopy.roster.student}><Link className={styles.name} to={`/team/${row.studentId}`}>{row.name}</Link>{error&&<p role="alert" className="open-text">{error}</p>}</td>
    <td data-label="Grade">{gradeLabel(grade)}</td>
    <td data-label={liveCopy.roster.subteam}><NativeSelect aria-label={`${row.name} ${liveCopy.roster.subteamSuffix}`} value={row.subteam} disabled={busy||!row.active} onChange={e=>void change({subteam:e.target.value})}><NativeSelectOption value="" disabled>Choose a subteam</NativeSelectOption>{row.subteam&&!subteamOptions.some(s=>s===row.subteam)&&<NativeSelectOption value={row.subteam} disabled>{subteamDisplay(row.subteam)} (earlier saved value)</NativeSelectOption>}{subteamOptions.map(value=><NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect></td>
    <td data-label={liveCopy.roster.travelTeam}><label className="checkbox-label"><Checkbox aria-label={`${row.name} · Travel Team`} checked={row.travelTeam} disabled={busy||!row.active} onCheckedChange={checked=>void change({travelTeam:checked})}/> {liveCopy.roster.travelTeam}</label></td>
    <td data-label={copy.status}><span className={`badge ${row.active?'badge-ready':'badge-pending'}`}>{row.active?copy.active:copy.archived}</span></td>
    <td data-label="FIRST registration"><FirstStudentStatus state={row.firstRegistrationState} compact /></td>
    <td data-label="Student sign-in">{access(row)}</td>
    <td data-label="Fundraiser Link">{row.fundraiserConnected?'Connected':'Disconnected'}</td>
    <td data-label="Balance due"><span className={styles.money}>{row.balance.state==='ready'&&row.balance.dueCents!==null?reportMoney(row.balance.dueCents):balanceStatusLabel(row.balance.state)}</span></td>
    <td data-label="Next event readiness"><span className={row.nextEvent?.state==='ready'?styles.ready:styles.pending}>{row.nextEvent?.name??'—'}</span><small>{eventStatus(row)}</small></td>
    <td data-label="Missing profile information">{missingItems.length?missingItems.join(', '):'Nothing missing'}</td>
  </tr>
}

function quickMatches(row:Row,quick:Quick){return quick==='all'||quick==='notReady'&&(row.nextEvent?.state==='open'||row.nextEvent?.state==='unknown'||row.readinessCoverage==='unknown')||quick==='missing'&&row.missingSummary.length>0||quick==='balanceDue'&&row.balance.state==='ready'&&row.balance.dueCents!==null&&row.balance.dueCents>0}

function RosterPage({active,asOf}:{active:boolean;asOf:number}){
  const [connection,setConnection]=useState<'all'|'connected'|'unconnected'>('all')
  const [search,setSearch]=useState(''),[subteam,setSubteam]=useState(''),[travelOnly,setTravelOnly]=useState(false),[quick,setQuick]=useState<Quick>('all')
  const [sort,setSort]=useState<RosterSort>('lastName'),[direction,setDirection]=useState<Direction>('asc'),[pageIndex,setPageIndex]=useState(0)
  const directory=usePaginatedQuery(api.coachRoster.directory,{active},{initialNumItems:100})
  const enriched=usePaginatedQuery(api.coachRoster.list,quick==='all'?'skip':{active,asOf,connection},{initialNumItems:20})
  useEffect(()=>{if(directory.status==='CanLoadMore')directory.loadMore(100)},[directory.status,directory.loadMore])
  useEffect(()=>{if(quick!=='all'&&enriched.status==='CanLoadMore')enriched.loadMore(20)},[quick,enriched.status,enriched.loadMore])
  useEffect(()=>setPageIndex(0),[active,connection,search,subteam,travelOnly,quick,sort,direction])
  const quickIds=useMemo(()=>quick==='all'?null:new Set(enriched.results.filter(row=>quickMatches(row,quick)).map(row=>row.studentId)),[quick,enriched.results])
  const complete=directory.status==='Exhausted'&&(quick==='all'||enriched.status==='Exhausted')
  const filtered=useMemo(()=>directory.results.filter(row=>(connection==='all'||row.connected===(connection==='connected'))&&(!search.trim()||row.name.toLowerCase().includes(search.trim().toLowerCase()))&&(!subteam||canonicalSubteam(row.subteam)===subteam)&&(!travelOnly||row.travelTeam)&&(!quickIds||quickIds.has(row.studentId))),[directory.results,connection,search,subteam,travelOnly,quickIds])
  const ordered=useMemo(()=>sortRoster(filtered,sort,direction),[filtered,sort,direction])
  const effectivePageIndex=Math.min(pageIndex,Math.max(0,Math.ceil(ordered.length/20)-1))
  const visible=complete?ordered.slice(effectivePageIndex*20,(effectivePageIndex+1)*20):[]
  const studentIds=useMemo(()=>visible.map(row=>row.studentId),[visible])
  const details=useQuery(api.coachRoster.rowsByIds,complete&&studentIds.length?{studentIds,asOf}:'skip')
  const detailsById=useMemo(()=>new Map(details?.map(row=>[row.studentId,row])),[details])
  const rows=visible.map(item=>({item,row:detailsById.get(item.studentId)})).filter((value):value is {item:DirectoryRow;row:Row}=>value.row!==undefined)
  const scopeText=!complete?'Loading the full roster for accurate sorting and filters…':`Showing ${rows.length? effectivePageIndex*20+1:0}–${effectivePageIndex*20+rows.length} of ${ordered.length} matching ${active?'active':'archived'} students.`
  return <>
    <TeamRosterSummary/>
    <div className="roster-filters">
      <NativeSelect aria-label="Filter roster by account connection" value={connection} onChange={e=>setConnection(e.target.value as typeof connection)}><NativeSelectOption value="all">All connections</NativeSelectOption><NativeSelectOption value="unconnected">Not connected</NativeSelectOption><NativeSelectOption value="connected">Connected</NativeSelectOption></NativeSelect>
      <Input aria-label="Search students" placeholder="Search students" value={search} onChange={e=>setSearch(e.target.value)}/>
      <NativeSelect aria-label="Filter students by subteam" value={subteam} onChange={e=>setSubteam(e.target.value)}><NativeSelectOption value="">{liveCopy.roster.allSubteams}</NativeSelectOption>{subteamOptions.filter(value=>directory.results.some(row=>canonicalSubteam(row.subteam)===value)).map(value=><NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect>
      <Button variant="outline" aria-pressed={travelOnly} onClick={()=>setTravelOnly(!travelOnly)} aria-describedby="travel-team-help">{liveCopy.roster.travelTeam}</Button>
      <NativeSelect aria-label="Sort roster by" value={sort} onChange={e=>setSort(e.target.value as RosterSort)}><NativeSelectOption value="lastName">Last name</NativeSelectOption><NativeSelectOption value="grade">Grade</NativeSelectOption><NativeSelectOption value="subteam">Subteam</NativeSelectOption></NativeSelect>
      <NativeSelect aria-label="Sort direction" value={direction} onChange={e=>setDirection(e.target.value as Direction)}><NativeSelectOption value="asc">Ascending</NativeSelectOption><NativeSelectOption value="desc">Descending</NativeSelectOption></NativeSelect>
    </div>
    <p id="travel-team-help" className={styles.note}>{copy.travelTeamHelp}</p>
    <div className={styles.chips} aria-label="Filter students">{([['all','All'],['notReady','Needs attention'],['missing','Missing info'],['balanceDue','Balance due']] as const).map(([value,label])=><Button key={value} type="button" variant="outline" aria-pressed={quick===value} onClick={()=>setQuick(value)}>{label}</Button>)}</div>
    <p className={styles.note} role="status">{scopeText}</p>
    <Card><CardHeader><CardTitle>{active?copy.active:copy.archived} · {liveCopy.roster.heading}</CardTitle></CardHeader><CardContent><div className="table-wrap"><table className={styles.table}><thead><tr><th>{liveCopy.roster.student}</th><th>Grade</th><th>{liveCopy.roster.subteam}</th><th aria-describedby="travel-team-help">{liveCopy.roster.travelTeam}</th><th>{copy.status}</th><th>FIRST registration</th><th>Student sign-in</th><th>Fundraiser Link</th><th>Balance due</th><th>Next event readiness</th><th>Missing profile information</th></tr></thead><tbody>{rows.length?rows.map(({item,row})=><RosterRow key={row.studentId} row={row} grade={item.grade}/>):<tr><td colSpan={11}>{!complete||details===undefined&&visible.length?'Loading roster…':ordered.length?'Loading students…':'No members match these filters.'}</td></tr>}</tbody></table></div></CardContent></Card>
    {complete&&effectivePageIndex>0&&<Button type="button" variant="outline" onClick={()=>setPageIndex(effectivePageIndex-1)}>Previous students</Button>}
    {complete&&ordered.length>(effectivePageIndex+1)*20&&<Button type="button" variant="outline" onClick={()=>setPageIndex(effectivePageIndex+1)}>Next students</Button>}
  </>
}
export function CoachRosterManagement(){const asOf=useAsOf(),[showArchived,setShowArchived]=useState(false);return <div className={styles.root}><Button type="button" variant="outline" aria-pressed={showArchived} onClick={()=>setShowArchived(!showArchived)}>{showArchived?copy.showActive:copy.showArchived}</Button><CoachRosterBoundary key={showArchived?'archived':'active'}><RosterPage active={!showArchived} asOf={asOf}/></CoachRosterBoundary></div>}
