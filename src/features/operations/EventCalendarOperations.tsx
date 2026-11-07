import { userFacingError } from '@/lib/error-message'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { chicagoDisplayTime } from '../../lib/chicago-time'
import styles from './Operations.module.css'
import { calendarChip, calendarChipCopy, TEAM_CALENDAR_ANCHOR, type CalendarChip } from './event-page'

const chipClass = (chip: CalendarChip) => `${styles.chip} ${chip.tone === 'ready' ? styles.chipReady : chip.tone === 'attention' ? styles.chipAttention : ''}`

/**
 * Team Calendar section: one status chip, Retry when an update failed, and connect / choose an entry for the Coach.
 * Edit event (EventEditActions, top of the page) is the one place to change the event; saving there updates Calendar.
 */
export function EventCalendarOperations({ eventId, coach, event }: { eventId: Id<'events'>; coach: boolean; event: { startsAt: number; endsAt: number } }) {
  const status = useQuery(api.eventCalendar.status, {eventId})
  const retry = useMutation(api.eventCalendar.retry)
  const connect = useMutation(api.eventCalendar.connect)
  const candidates = useAction(api.eventCalendar.candidates)
  const [matches, setMatches] = useState<Array<{id:string;title:string;location:string;startsAt:number;endsAt:number;allDay:boolean;recurring:boolean}>>([])
  const [choice, setChoice] = useState('create')
  const [lookupError, setLookupError] = useState<string|null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // Home's Team Calendar alert links here with #team-calendar: open this section and bring it into view once loaded.
  const { hash } = useLocation()
  const section = useRef<HTMLDetailsElement>(null)
  const loaded = status !== undefined
  useEffect(()=>{if(!loaded||hash!==`#${TEAM_CALENDAR_ANCHOR}`||!section.current)return;section.current.open=true;section.current.scrollIntoView({block:'start'})},[loaded,hash])
  useEffect(()=>{if(!coach||status?.state!=='unlinked'&&!status?.canReselect)return;let cancelled=false;setLookupBusy(true);void candidates({startsAt:event.startsAt,endsAt:event.endsAt}).then(result=>{if(cancelled)return;setMatches(result.items);setLookupError(result.error)}).catch(cause=>{if(!cancelled)setLookupError(userFacingError(cause, 'Calendar matches could not be checked.'))}).finally(()=>{if(!cancelled)setLookupBusy(false)});return()=>{cancelled=true}},[status?.state,status?.canReselect,coach,candidates,event.startsAt,event.endsAt])
  if (!status) return <p role="status">Loading Team Calendar…</p>
  const chip = calendarChip(status)
  async function act(run:()=>Promise<unknown>,message:string){setBusy(true);setError('');setSuccess('');try{await run();setSuccess(message)}catch(cause){setError(userFacingError(cause, 'Team Calendar could not be updated.'))}finally{setBusy(false)}}
  return <details ref={section} id={TEAM_CALENDAR_ANCHOR} className={styles.disclosure}><summary><strong>Team Calendar</strong><span className={chipClass(chip)}>{chip.label}</span></summary><div className={styles.disclosureBody}>
    <p className={styles.statusLine} role="status"><span className={chipClass(chip)}>{chip.label}</span>{chip.reason&&<span className="muted">{chip.reason}</span>}</p>
    {coach&&chip.canRetry&&<p><Button type="button" variant="outline" disabled={busy} onClick={()=>void act(()=>retry({eventId}),calendarChipCopy.retrying)}>{calendarChipCopy.retry}</Button></p>}
    {coach&&(status.state==='unlinked'||status.canReselect)&&<div className="form-grid"><p>{lookupBusy?'Checking Team Calendar for matching entries…':status.canReselect?'Choose another Team Calendar entry or add a separate one.':'Add this event to Team Calendar.'}</p>{lookupError&&<p role="status">{lookupError}</p>}{matches.map(item=><label key={item.id} className="flex items-start gap-2"><input type="radio" name={`calendar-connect-${eventId}`} checked={choice===item.id} onChange={()=>setChoice(item.id)}/><span>{item.title} · {chicagoDisplayTime(item.startsAt)}{item.location?` · ${item.location}`:''}{item.allDay?' · All-day':''}{item.recurring?' · Repeating occurrence':''}</span></label>)}<label className="flex items-center gap-2"><input type="radio" name={`calendar-connect-${eventId}`} checked={choice==='create'} onChange={()=>setChoice('create')}/>Add a separate Team Calendar entry</label><Button type="button" disabled={busy||lookupBusy} onClick={()=>void act(()=>connect({eventId,calendarChoice:choice==='create'?{kind:'create'}:{kind:'link',eventId:choice}}),'Team Calendar connection requested.')}>{status.canReselect?'Choose Team Calendar entry':'Add to Team Calendar'}</Button></div>}
    {error&&<p role="alert" className="open-text">{error}</p>}{success&&<p role="status" className="ready-text">{success}</p>}
  </div></details>
}
