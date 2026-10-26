import { userFacingError } from '@/lib/error-message'
import { useEffect, useState, type FormEvent } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { ConfirmAction } from '../../ConfirmAction'
import { chicagoDisplayTime, chicagoInputTime, parseChicagoInput } from '../../lib/chicago-time'
import styles from './Operations.module.css'

const stateText = {
  unlinked: 'This event is not connected to Team Calendar.',
  pending: 'Calendar update is waiting to finish.',
  synced: 'Connected to Team Calendar.',
  failed: 'Calendar update needs attention.',
  conflict: 'The Calendar entry changed. Review it before retrying.',
  disabled: 'Calendar connection is unavailable.',
} as const

export function EventCalendarOperations({ eventId, coach, event }: { eventId: Id<'events'>; coach: boolean; event: {name:string;destination:string;startsAt:number;endsAt:number} }) {
  const status = useQuery(api.eventCalendar.status, {eventId})
  const update = useMutation(api.eventCalendar.update)
  const retry = useMutation(api.eventCalendar.retry)
  const connect = useMutation(api.eventCalendar.connect)
  const candidates = useAction(api.eventCalendar.candidates)
  const [matches, setMatches] = useState<Array<{id:string;title:string;location:string;startsAt:number;endsAt:number;allDay:boolean;recurring:boolean}>>([])
  const [choice, setChoice] = useState('create')
  const [lookupError, setLookupError] = useState<string|null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [title, setTitle] = useState<string|null>(null)
  const [location, setLocation] = useState<string|null>(null)
  const [start, setStart] = useState<string|null>(null)
  const [end, setEnd] = useState<string|null>(null)
  const [media, setMedia] = useState<boolean|null>(null)
  const [draftRevision, setDraftRevision] = useState<number|null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(()=>{if(!coach||status?.state!=='unlinked'&&!status?.canReselect)return;let cancelled=false;setLookupBusy(true);void candidates({startsAt:event.startsAt,endsAt:event.endsAt}).then(result=>{if(cancelled)return;setMatches(result.items);setLookupError(result.error)}).catch(cause=>{if(!cancelled)setLookupError(userFacingError(cause, 'Calendar matches could not be checked.'))}).finally(()=>{if(!cancelled)setLookupBusy(false)});return()=>{cancelled=true}},[status?.state,status?.canReselect,coach,candidates,event.startsAt,event.endsAt])
  if (!status) return <p role="status">Loading Calendar status…</p>
  const stateLabel = stateText[status.state as keyof typeof stateText] ?? 'Calendar status unavailable.'
  const revision = status.revision
  const staleDraft = draftRevision!==null&&draftRevision!==revision
  const values = {name:title??event.name,destination:location??event.destination,startsAt:start??chicagoInputTime(event.startsAt),endsAt:end??chicagoInputTime(event.endsAt),mediaSupportRequested:media??status.mediaSupportRequested}
  function resetDraft(){setTitle(null);setLocation(null);setStart(null);setEnd(null);setMedia(null);setDraftRevision(null)}
  function edited(){setDraftRevision(current=>current??revision)}
  async function act(run:()=>Promise<unknown>,message:string){setBusy(true);setError('');setSuccess('');try{await run();setSuccess(message);resetDraft()}catch(cause){setError(userFacingError(cause, 'Calendar could not be updated.'))}finally{setBusy(false)}}
  function save(e:FormEvent){e.preventDefault();if(staleDraft){setError('This event changed while you were editing. Reload the latest values before saving.');return}const startsAt=parseChicagoInput(values.startsAt),endsAt=parseChicagoInput(values.endsAt);if(!values.name.trim()||!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=startsAt){setError('Enter a title and an end time after the start in Central Time.');return}void act(()=>update({eventId,expectedRevision:draftRevision??revision,...(title!==null?{name:values.name.trim()}:{}),...(location!==null?{destination:values.destination.trim()}:{}),...(start!==null?{startsAt}:{}),...(end!==null?{endsAt}:{}),...(media!==null?{mediaSupportRequested:values.mediaSupportRequested}:{})}),'Changes saved. Calendar status will update when the write finishes.')}
  return <details className={styles.disclosure}><summary><strong>Team Calendar</strong><span>{stateLabel}</span></summary><div className={styles.disclosureBody}>
    <p role="status">{stateLabel}</p>
    <p>Media Support Requested: <strong>{status.mediaSupportRequested?'Yes':'No'}</strong></p>
    {status.cancelled&&<p role="status">This event is canceled.</p>}
    {status.error&&<p role="alert" className="open-text">{status.error}</p>}
    {coach&&(status.state==='unlinked'||status.canReselect)&&<div className="form-grid"><p>{lookupBusy?'Checking Calendar for matching entries…':status.canReselect?'Choose another Calendar entry or create a separate one for this event.':'Connect this existing event to Team Calendar.'}</p>{lookupError&&<p role="status">{lookupError}</p>}{matches.map(item=><label key={item.id} className="flex items-start gap-2"><input type="radio" name={`calendar-connect-${eventId}`} checked={choice===item.id} onChange={()=>setChoice(item.id)}/><span>{item.title} · {chicagoDisplayTime(item.startsAt)}{item.location?` · ${item.location}`:''}{item.allDay?' · All-day':''}{item.recurring?' · Repeating occurrence':''}</span></label>)}<label className="flex items-center gap-2"><input type="radio" name={`calendar-connect-${eventId}`} checked={choice==='create'} onChange={()=>setChoice('create')}/>Create a separate Calendar entry</label><Button type="button" disabled={busy||lookupBusy} onClick={()=>void act(()=>connect({eventId,calendarChoice:choice==='create'?{kind:'create'}:{kind:'link',eventId:choice}}),'Calendar connection requested.')}>{status.canReselect?'Choose Calendar entry':'Connect Calendar'}</Button></div>}
    {coach&&(status.state==='failed'||status.state==='conflict')&&<><Button type="button" variant="outline" disabled={busy} onClick={()=>void act(()=>retry({eventId}),status.state==='conflict'?'Calendar details are being reloaded.':'Calendar retry requested.')}>{status.state==='conflict'?'Reload Calendar details':'Retry Calendar update'}</Button>{status.state==='conflict'&&<p>Reloading uses the current Calendar entry and discards pending changes from this app.</p>}</>}
    {coach&&!!status.calendarEventId&&status.state==='synced'&&!status.cancelled&&<form className="form-grid" onSubmit={save}>
      {status.allDay&&<p>This is an all-day Calendar entry. Edit its dates in Calendar; its schedule is kept as an all-day entry here.</p>}
      {staleDraft&&<p role="alert">This event changed while you were editing. Reload the latest values before saving.</p>}
      <label>Title <Input value={values.name} onChange={e=>{edited();setTitle(e.target.value)}}/></label>
      <label>Starts (Central Time) <Input type="datetime-local" value={values.startsAt} disabled={status.allDay} onChange={e=>{edited();setStart(e.target.value)}}/></label>
      <label>Ends (Central Time) <Input type="datetime-local" value={values.endsAt} disabled={status.allDay} onChange={e=>{edited();setEnd(e.target.value)}}/></label>
      <label>Location <Input value={values.destination} onChange={e=>{edited();setLocation(e.target.value)}}/></label>
      <label className="flex items-center gap-2"><Checkbox checked={values.mediaSupportRequested} onCheckedChange={value=>{edited();setMedia(value)}}/>Media Support Requested</label>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||staleDraft}>Save event and Calendar changes</Button>{draftRevision!==null&&<Button type="button" variant="outline" disabled={busy} onClick={resetDraft}>Reload latest values</Button>}</div>
    </form>}
    {coach&&!status.cancelled&&<ConfirmAction disabled={busy} description="Cancel this event? A connected Calendar entry will be canceled too. Team participation and fees are not changed by this action." onConfirm={()=>update({eventId,expectedRevision:revision,cancelled:true})}>Cancel event</ConfirmAction>}
    {error&&<p role="alert" className="open-text">{error}</p>}{success&&<p role="status" className="ready-text">{success}</p>}
  </div></details>
}
