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
import { chargeCurrency } from './lib/charge-money'
import { liveCopy } from './lib/live-copy'
import { rosterManagementCopy as copy } from './lib/roster-management-copy'
import { balanceStatusLabel } from './lib/report-state-copy'
import styles from './CoachRoster.module.css'
import { CoachRosterBoundary } from './CoachRosterBoundary'
import { subteamDisplay, subteamOptions } from './lib/subteams'
import { gradeLabel, sortRoster, type Direction, type RosterSort } from './lib/rosterSort'
import { rosterAsOfAtTransition } from './lib/roster-refresh'
import { inRosterGroup, rosterGroupOptions } from './lib/roster-filter'
import { visibleSelection, countRequirements, matchesRequirement, missingProfileItems, requirementChips, type RequirementKey, type RosterQuick } from './features/roster-bulk/roster-requirements'
import { RosterBulkBar } from './features/roster-bulk/RosterBulkBar'

type Row = typeof api.coachRoster.list._returnType['page'][number]
type DirectoryRow = typeof api.coachRoster.directory._returnType['page'][number]
const access=(row:Row)=>row.account.linkage==='unlinked'?'Not connected':row.account.linkage==='unavailable'?'Student sign-in unavailable':row.account.access==='active'?'Connected':row.account.access==='inactive'?'Connected (sign-in turned off)':'Access unknown'
const permissionText=(row:Row)=>row.permission.state==='signed'?'Signed':row.permission.state==='review'?'Signed · needs review':row.permission.state==='notSigned'?'Not signed':'—'
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

function RosterRow({row,grade,selected,onSelect,showPermission}:{row:Row;grade:string|null;selected:boolean;onSelect:(checked:boolean)=>void;showPermission:boolean}){
  const update=useMutation(api.admin.updateRoster),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const change=async(fields:{subteam?:string;travelTeam?:boolean})=>{setBusy(true);setError('');try{await update({studentId:row.studentId,expectedRevision:row.profileRevision,...fields})}catch(e){setError(userFacingError(e, copy.failed))}finally{setBusy(false)}}
  const missingItems=missingProfileItems(row)
  return <tr>
    <td data-label={copy.selectColumn} className={styles.selectCell}><Checkbox aria-label={`Select ${row.name}`} checked={selected} onCheckedChange={checked=>onSelect(checked)}/></td>
    <td data-label={liveCopy.roster.student}><Link className={styles.name} to={`/team/${row.studentId}`}>{row.name}</Link>{error&&<p role="alert" className="open-text">{error}</p>}</td>
    <td data-label="Grade">{gradeLabel(grade)}</td>
    <td data-label={liveCopy.roster.subteam}><NativeSelect aria-label={`${row.name} ${liveCopy.roster.subteamSuffix}`} value={row.subteam} disabled={busy||!row.active} onChange={e=>void change({subteam:e.target.value})}><NativeSelectOption value="" disabled>Choose a subteam</NativeSelectOption>{row.subteam&&!subteamOptions.some(s=>s===row.subteam)&&<NativeSelectOption value={row.subteam} disabled>{subteamDisplay(row.subteam)} (earlier saved value)</NativeSelectOption>}{subteamOptions.map(value=><NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect></td>
    <td data-label={liveCopy.roster.travelTeam}><label className="checkbox-label"><Checkbox aria-label={`${row.name} · Travel Team`} checked={row.travelTeam} disabled={busy||!row.active} onCheckedChange={checked=>void change({travelTeam:checked})}/> {liveCopy.roster.travelTeam}</label></td>
    <td data-label={copy.status}><span className={`badge ${row.active?'badge-ready':'badge-pending'}`}>{row.active?copy.active:copy.archived}</span></td>
    <td data-label="FIRST registration"><FirstStudentStatus state={row.firstRegistrationState} compact /></td>
    <td data-label="Student sign-in">{access(row)}</td>
    {showPermission&&<td data-label={copy.permissionColumn}><span>{permissionText(row)}</span>{row.permission.eventName&&<small>{row.permission.eventName}</small>}</td>}
    <td data-label="Fundraiser Link">{row.fundraiserConnected?'Connected':'Disconnected'}</td>
    <td data-label="Balance due"><span className={styles.money}>{row.balance.state==='ready'&&row.balance.dueCents!==null?chargeCurrency(row.balance.dueCents):balanceStatusLabel(row.balance.state)}</span></td>
    <td data-label="Next event readiness"><span className={row.nextEvent?.state==='ready'?styles.ready:styles.pending}>{row.nextEvent?.name??'—'}</span><small>{eventStatus(row)}</small></td>
    <td data-label="Missing profile information">{missingItems.length?missingItems.join(', '):'Nothing missing'}</td>
  </tr>
}

function RosterPage({active,asOf}:{active:boolean;asOf:number}){
  const [connection,setConnection]=useState<'all'|'connected'|'unconnected'>('all')
  const [search,setSearch]=useState(''),[subteam,setSubteam]=useState(''),[travelOnly,setTravelOnly]=useState(false),[quick,setQuick]=useState<RosterQuick>('all')
  const [sort,setSort]=useState<RosterSort>('lastName'),[direction,setDirection]=useState<Direction>('asc'),[pageIndex,setPageIndex]=useState(0)
  const [selectedIds,setSelectedIds]=useState<ReadonlySet<string>>(()=>new Set())
  const directory=usePaginatedQuery(api.coachRoster.directory,{active},{initialNumItems:100})
  // The chips count the same rows the table shows, so every student's requirements load up front.
  const enriched=usePaginatedQuery(api.coachRoster.list,{active,asOf,connection:'all'},{initialNumItems:20})
  useEffect(()=>{if(directory.status==='CanLoadMore')directory.loadMore(100)},[directory.status,directory.loadMore])
  useEffect(()=>{if(enriched.status==='CanLoadMore')enriched.loadMore(20)},[enriched.status,enriched.loadMore])
  useEffect(()=>setPageIndex(0),[active,connection,search,subteam,travelOnly,quick,sort,direction])
  const complete=directory.status==='Exhausted'&&enriched.status==='Exhausted'
  const detailsById=useMemo(()=>new Map(enriched.results.map(row=>[row.studentId,row])),[enriched.results])
  const travelCount=useMemo(()=>directory.results.filter(row=>row.travelTeam).length,[directory.results])
  const base=useMemo(()=>directory.results.filter(row=>(connection==='all'||row.connected===(connection==='connected'))&&(!search.trim()||row.name.toLowerCase().includes(search.trim().toLowerCase()))&&inRosterGroup(row,subteam)&&(!travelOnly||row.travelTeam)),[directory.results,connection,search,subteam,travelOnly])
  const baseRows=useMemo(()=>base.flatMap(item=>{const row=detailsById.get(item.studentId);return row?[{item,row}]:[]}),[base,detailsById])
  const counts=useMemo(()=>countRequirements(baseRows.map(value=>value.row)),[baseRows])
  const signingOpen=enriched.results.some(row=>row.permission.state!=='closed')
  const chips=requirementChips(counts,baseRows.length,signingOpen)
  const quickKey=quick==='permission'&&!signingOpen?'all':quick
  const filtered=useMemo(()=>baseRows.filter(value=>matchesRequirement(value.row,quickKey)).map(value=>value.item),[baseRows,quickKey])
  const ordered=useMemo(()=>sortRoster(filtered,sort,direction),[filtered,sort,direction])
  const effectivePageIndex=Math.min(pageIndex,Math.max(0,Math.ceil(ordered.length/20)-1))
  const visible=complete?ordered.slice(effectivePageIndex*20,(effectivePageIndex+1)*20):[]
  const rows=visible.map(item=>({item,row:detailsById.get(item.studentId)})).filter((value):value is {item:DirectoryRow;row:Row}=>value.row!==undefined)
  const scopeText=!complete?'Loading the full roster for accurate sorting and filters…':`Showing ${rows.length? effectivePageIndex*20+1:0}–${effectivePageIndex*20+rows.length} of ${ordered.length} matching ${active?'active':'archived'} students.`
  // Only students still shown under the current filters count and export; the rest are dropped, not carried along unseen.
  const selectedRows=useMemo(()=>visibleSelection(ordered,selectedIds).flatMap(item=>{const row=detailsById.get(item.studentId);return row?[{...row,subteam:item.subteam,grade:item.grade,travelTeam:item.travelTeam}]:[]}),[ordered,detailsById,selectedIds])
  const toggle=(id:string,checked:boolean)=>setSelectedIds(prev=>{const next=new Set(prev);if(checked)next.add(id);else next.delete(id);return next})
  const pageSelected=rows.length>0&&rows.every(({row})=>selectedIds.has(row.studentId))
  const selectPage=(checked:boolean)=>setSelectedIds(prev=>{const next=new Set(prev);for(const {row} of rows){if(checked)next.add(row.studentId);else next.delete(row.studentId)}return next})
  const selectAllMatching=()=>setSelectedIds(prev=>new Set([...prev,...ordered.map(item=>item.studentId)]))
  const allMatchingSelected=ordered.every(item=>selectedIds.has(item.studentId))
  const defaultItem:RequirementKey=quickKey==='all'?'attention':quickKey
  return <>
    <p className={styles.summary} role="status">{copy.scopeSummary(active,directory.results.length,travelCount)}</p>
    <div className={styles.chips} role="group" aria-label="Filter students by what they still need">{chips.map(chip=><Button key={chip.key} type="button" variant="outline" aria-pressed={quickKey===chip.key} onClick={()=>setQuick(chip.key)}>{chip.label}</Button>)}</div>
    <div className="roster-filters">
      <NativeSelect aria-label="Filter roster by account connection" value={connection} onChange={e=>setConnection(e.target.value as typeof connection)}><NativeSelectOption value="all">All connections</NativeSelectOption><NativeSelectOption value="unconnected">Not connected</NativeSelectOption><NativeSelectOption value="connected">Connected</NativeSelectOption></NativeSelect>
      <Input aria-label="Search students" placeholder="Search students" value={search} onChange={e=>setSearch(e.target.value)}/>
      <NativeSelect aria-label="Filter students by subteam" value={subteam} onChange={e=>setSubteam(e.target.value)}><NativeSelectOption value="">{liveCopy.roster.allSubteams}</NativeSelectOption>{rosterGroupOptions.map(value=><NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect>
      <Button variant="outline" aria-pressed={travelOnly} onClick={()=>setTravelOnly(!travelOnly)} aria-describedby="travel-team-help">{liveCopy.roster.travelTeam} · {travelCount}</Button>
      <NativeSelect aria-label="Sort roster by" value={sort} onChange={e=>setSort(e.target.value as RosterSort)}><NativeSelectOption value="lastName">Last name</NativeSelectOption><NativeSelectOption value="grade">Grade</NativeSelectOption><NativeSelectOption value="subteam">Subteam</NativeSelectOption></NativeSelect>
      <NativeSelect aria-label="Sort direction" value={direction} onChange={e=>setDirection(e.target.value as Direction)}><NativeSelectOption value="asc">Ascending</NativeSelectOption><NativeSelectOption value="desc">Descending</NativeSelectOption></NativeSelect>
    </div>
    <p id="travel-team-help" className={styles.note}>{copy.travelTeamHelp}</p>
    <p className={styles.note}>{copy.selectHelp}</p>
    <p className={styles.note} role="status">{scopeText}</p>
    <div className={styles.selectAllRow}><Button type="button" variant="outline" disabled={!complete||!ordered.length||allMatchingSelected} onClick={selectAllMatching}>{copy.selectAll(ordered.length)}</Button></div>
    <Card><CardHeader><CardTitle>{active?copy.active:copy.archived} · {liveCopy.roster.heading}</CardTitle></CardHeader><CardContent><div className="table-wrap"><table className={styles.table}><thead><tr><th className={styles.selectCell}><Checkbox aria-label={copy.selectPage} checked={pageSelected} disabled={!rows.length} onCheckedChange={selectPage}/></th><th>{liveCopy.roster.student}</th><th>Grade</th><th>{liveCopy.roster.subteam}</th><th aria-describedby="travel-team-help">{liveCopy.roster.travelTeam}</th><th>{copy.status}</th><th>FIRST registration</th><th>Student sign-in</th>{signingOpen&&<th>{copy.permissionColumn}</th>}<th>Fundraiser Link</th><th>Balance due</th><th>Next event readiness</th><th>Missing profile information</th></tr></thead><tbody>{rows.length?rows.map(({item,row})=><RosterRow key={row.studentId} row={row} grade={item.grade} selected={selectedIds.has(row.studentId)} onSelect={checked=>toggle(row.studentId,checked)} showPermission={signingOpen}/>):<tr><td colSpan={signingOpen?13:12}>{!complete?'Loading roster…':ordered.length?'Loading students…':'No members match these filters.'}</td></tr>}</tbody></table></div></CardContent></Card>
    {complete&&effectivePageIndex>0&&<Button type="button" variant="outline" onClick={()=>setPageIndex(effectivePageIndex-1)}>Previous students</Button>}
    {complete&&ordered.length>(effectivePageIndex+1)*20&&<Button type="button" variant="outline" onClick={()=>setPageIndex(effectivePageIndex+1)}>Next students</Button>}
    {selectedRows.length>0&&<RosterBulkBar selected={selectedRows} matching={ordered.length} defaultItem={defaultItem} signingOpen={signingOpen} onSelectAll={selectAllMatching} onClear={()=>setSelectedIds(new Set())}/>}
  </>
}
export function CoachRosterManagement(){const asOf=useAsOf(),[showArchived,setShowArchived]=useState(false);return <div className={styles.root}><Button type="button" variant="outline" aria-pressed={showArchived} onClick={()=>setShowArchived(!showArchived)}>{showArchived?copy.showActive:copy.showArchived}</Button><CoachRosterBoundary key={showArchived?'archived':'active'}><RosterPage active={!showArchived} asOf={asOf}/></CoachRosterBoundary></div>}
