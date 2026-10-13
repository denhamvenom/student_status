import { useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Card, CardTitle, CardHeader, CardContent } from './components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog'
import { TeamRosterSummary } from './DashboardReports'
import { liveCopy } from './lib/live-copy'
import { rosterManagementCopy as copy } from './lib/roster-management-copy'

type Student = {_id:Id<'students'>;legalName:string;preferredName:string;subteam:string;travelTeam:boolean;active:boolean;profileRevision?:number}
type Selection = {id:Id<'students'>;name:string;active:boolean;revision:number}
const name=(student:Student)=>student.preferredName||student.legalName
const selectionFor=(student:Student):Selection=>({id:student._id,name:name(student),active:student.active,revision:student.profileRevision??0})
const subteams=['Mechanical','Programming','Electrical','Outreach','Business','Other'] as const

function RosterRow({student,onSelect}:{student:Student;onSelect:(student:Student,trigger:HTMLButtonElement)=>void}){
  const update=useMutation(api.admin.updateRoster)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const change=async(fields:{subteam?:string;travelTeam?:boolean})=>{setBusy(true);setError('');try{await update({studentId:student._id,expectedRevision:student.profileRevision??0,...fields})}catch(e){setError(e instanceof Error?e.message:copy.failed)}finally{setBusy(false)}}
  return <tr><td data-label={liveCopy.roster.student}><strong>{name(student)}</strong>{error&&<p role="alert" className="open-text">{error}</p>}</td>
    <td data-label={liveCopy.roster.subteam}><NativeSelect aria-label={`${name(student)} ${liveCopy.roster.subteamSuffix}`} value={student.subteam} disabled={busy||!student.active} onChange={e=>void change({subteam:e.target.value})}><NativeSelectOption value="">{copy.unassigned}</NativeSelectOption>{student.subteam&&!subteams.some(s=>s===student.subteam)&&<NativeSelectOption value={student.subteam}>{student.subteam}</NativeSelectOption>}{subteams.map(value=><NativeSelectOption key={value} value={value}>{liveCopy.roster.subteamLabels[value]}</NativeSelectOption>)}</NativeSelect></td>
    <td data-label={liveCopy.roster.travelTeam}><label className="checkbox-label"><Checkbox checked={student.travelTeam} disabled={busy||!student.active} onCheckedChange={checked=>void change({travelTeam:checked})}/> {liveCopy.roster.travelTeam}</label></td>
    <td data-label={copy.status}><span className={`badge ${student.active?'badge-ready':'badge-pending'}`}>{student.active?copy.active:copy.archived}</span></td>
    <td data-label={copy.actions}><DialogTrigger render={<Button type="button" variant="outline" disabled={busy} onClick={event=>onSelect(student,event.currentTarget)}/>}>{student.active?copy.archive:copy.reactivate}</DialogTrigger></td>
  </tr>
}

export function CoachRosterManagement(){
  const rows=useQuery(api.app.teamRoster,{}) as Student[]|undefined
  const update=useMutation(api.admin.updateRoster)
  const viewToggle=useRef<HTMLButtonElement|null>(null)
  const selectedTrigger=useRef<HTMLButtonElement|null>(null)
  const [search,setSearch]=useState(''),[subteam,setSubteam]=useState(''),[travelOnly,setTravelOnly]=useState(false),[showArchived,setShowArchived]=useState(false)
  const [selection,setSelection]=useState<Selection|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const latest=selection?rows?.find(row=>row._id===selection.id):undefined
  const stale=!!selection&&(!latest||latest.active!==selection.active||(latest.profileRevision??0)!==selection.revision)
  const select=(student:Student,trigger:HTMLButtonElement)=>{selectedTrigger.current=trigger;setSelection(selectionFor(student));setReason('');setError('');setSaved('')}
  const reviewLatest=()=>{if(latest){if(selection&&latest.active!==selection.active){selectedTrigger.current=null;setSelection(null);setShowArchived(!latest.active);setSaved(copy.statusChanged)}else setSelection(selectionFor(latest));setError('')}}
  const submit=async()=>{if(!selection||stale||busy||!reason.trim())return;setBusy(true);setError('');try{await update({studentId:selection.id,expectedRevision:selection.revision,active:!selection.active,reason});selectedTrigger.current=null;setSaved(selection.active?copy.archiveSaved:copy.reactivateSaved);setSelection(null);setReason('')}catch(e){setError(e instanceof Error?e.message:copy.failed)}finally{setBusy(false)}}
  if(!rows)return <p role="status">{liveCopy.states.loadingTeam}</p>
  const filtered=rows.filter(student=>student.active!==showArchived&&(!search||name(student).toLowerCase().includes(search.toLowerCase()))&&(!subteam||student.subteam===subteam)&&(!travelOnly||student.travelTeam))
  return <Dialog open={selection!==null} onOpenChange={open=>{if(!open&&!busy)setSelection(null)}}><TeamRosterSummary/>
    <div className="roster-filters"><Input aria-label={liveCopy.roster.search} placeholder={liveCopy.roster.search} value={search} onChange={e=>setSearch(e.target.value)}/><NativeSelect aria-label={liveCopy.roster.filterSubteam} value={subteam} onChange={e=>setSubteam(e.target.value)}><NativeSelectOption value="">{liveCopy.roster.allSubteams}</NativeSelectOption>{Array.from(new Set(rows.map(s=>s.subteam).filter(Boolean))).map(value=><NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect><Button variant="outline" aria-pressed={travelOnly} onClick={()=>setTravelOnly(!travelOnly)}>{liveCopy.roster.travelTeam}</Button><Button ref={viewToggle} variant="outline" aria-pressed={showArchived} onClick={()=>setShowArchived(!showArchived)}>{showArchived?copy.showActive:copy.showArchived}</Button></div>
    {saved&&<p role="status" className="ready-text">{saved}</p>}
    <Card><CardHeader><CardTitle>{showArchived?copy.archived:copy.active} · {liveCopy.roster.heading}</CardTitle></CardHeader><CardContent><div className="table-wrap"><table><thead><tr><th>{liveCopy.roster.student}</th><th>{liveCopy.roster.subteam}</th><th>{liveCopy.roster.travelTeam}</th><th>{copy.status}</th><th>{copy.actions}</th></tr></thead><tbody>{filtered.length?filtered.map(student=><RosterRow key={student._id} student={student} onSelect={select}/>):<tr><td colSpan={5}>{liveCopy.roster.noMatches}</td></tr>}</tbody></table></div></CardContent></Card>
    <DialogContent showCloseButton={!busy} finalFocus={()=>selectedTrigger.current?.isConnected&&!selectedTrigger.current.disabled?selectedTrigger.current:viewToggle.current}><DialogHeader><DialogTitle>{selection?.active?copy.archive:copy.reactivate}: {selection?.name}</DialogTitle><DialogDescription>{selection?.active?copy.archiveDescription:copy.reactivateDescription}</DialogDescription></DialogHeader>
      <label className="form-grid">{copy.reason}<Input value={reason} maxLength={1000} disabled={busy||stale} onChange={e=>setReason(e.target.value)} required/></label>
      {stale&&<p role="status" className="open-text">{latest?copy.changed:copy.unavailable}</p>}{error&&<p role="alert" className="open-text">{error}</p>}
      <div className="action-row"><Button type="button" variant="outline" disabled={busy} onClick={()=>setSelection(null)}>{copy.cancel}</Button>{stale&&latest&&<Button type="button" variant="outline" disabled={busy} onClick={reviewLatest}>{copy.reviewLatest}</Button>}<Button type="button" disabled={busy||stale||!reason.trim()} onClick={()=>void submit()}>{busy?copy.saving:selection?.active?copy.archive:copy.reactivate}</Button></div>
    </DialogContent>
  </Dialog>
}
