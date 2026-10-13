import { AppShell } from '../../AppShell'
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { readinessCopy as copy } from './readinessCopy'
import styles from './ReadinessReview.module.css'

type EventChoice = { event: { _id: Id<'events'>; name: string; type: string; startsAt: number; endsAt: number; destination: string; permissionRequired: boolean; firstRequired: boolean; overnight: boolean; roomingEnabled: boolean; feeCents: number }; participation: string | null }
type StudentRow = { student: { _id: Id<'students'>; preferredName: string; legalName?: string }; state: 'ready' | 'open' | 'notApplicable'; open: string[] }
type Transport = { state: 'ready' | 'open' | 'notApplicable'; seats: number; demand: number; open: string[] }
type Rooming = { state: 'ready' | 'open' | 'notApplicable'; open: number }
type Readiness = { event: { _id: Id<'events'>; name: string }; students: StudentRow[]; transportation: Transport | null; rooming: Rooming | null; overall: 'open' | 'ready' }
type Viewer = { status: string; user: { name: string; email: string; role: string; travelLead: boolean; theme: string } | null; season: { name: string } | null }
type EventDetail = { requirements?: { key: string; label: string }[] }

const fmtDate = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(value)
const statusText = (state: string, open = 0) => state === 'notApplicable' ? copy.notApplicable : state === 'ready' ? copy.ready : copy.openCount(open)
const statusIcon = (state: string) => state === 'ready' ? '✓' : state === 'notApplicable' ? '–' : '×'

function StatusChip({ label, state, open }: { label: string; state: string; open?: number }) {
  return <span className={`${styles.statusChip} ${state === 'ready' ? styles.ready : state === 'open' ? styles.open : styles.na}`}>
    <span aria-hidden="true" className={styles.statusIcon}>{statusIcon(state)}</span><strong>{label}</strong><span>· {statusText(state, open)}</span>
  </span>
}

function FirstAction({ eventId, row }: { eventId: Id<'events'>; row: StudentRow }) {
  const update = useMutation(api.participation.recordRequirement)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = row.open.includes('FIRST registration')
  const change = async () => {
    setBusy(true); setError('')
    try { await update({ eventId, studentId: row.student._id, key: 'first', complete: open }) }
    catch { setError(copy.updateFailed) }
    finally { setBusy(false) }
  }
  return <span className={styles.firstAction}>
    <Button type="button" className={styles.smallAction} variant="outline" disabled={busy} aria-label={copy.firstActionName(open, row.student.preferredName)} onClick={() => void change()}>{open ? copy.firstDone : copy.firstReopen}</Button>
    {error && <span role="alert" className={styles.actionError}>{error}</span>}
  </span>
}


export function ReadinessReview() {
  const viewer = useQuery(api.app.viewer, {}) as Viewer | undefined
  const choices = useQuery(api.app.listEvents, {}) as EventChoice[] | undefined
  const [selected, setSelected] = useState<Id<'events'> | null>(null)
  const eventId = selected && choices?.some(choice => choice.event._id === selected) ? selected : choices?.[0]?.event._id
  const readiness = useQuery(api.app.eventReadiness, eventId ? { eventId } : 'skip') as Readiness | undefined
  const detail = useQuery(api.app.eventDetail, eventId ? { eventId } : 'skip') as EventDetail | undefined
  if (!viewer || !choices) return <div className={styles.review}><main className={styles.main}><p role="status">{copy.loading}</p></main></div>
  if (viewer.user?.role !== 'coach' && !viewer.user?.travelLead) return <div className={styles.review}><main className={styles.main}><h1>{copy.title}</h1><p role="alert">{copy.coachOnly}</p></main></div>
  const event = choices.find(choice => choice.event._id === eventId)?.event
  const rows = [...(readiness?.students ?? [])].sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open'))
  const openItems = rows.reduce((count, row) => count + row.open.length, 0)
  const readyStudents = rows.filter(row => row.state === 'ready').length
  const columns = event ? [...new Set([
    ...(event.feeCents > 0 || rows.some(row => row.open.includes(copy.payment)) ? [copy.payment] : []),
    ...(event.permissionRequired ? [copy.permission] : []),
    ...(event.firstRequired ? [copy.first] : []),
    ...(detail?.requirements?.map(requirement => requirement.label) ?? []),
    ...(event.overnight && event.roomingEnabled ? [copy.roomSelection] : []),
    ...rows.flatMap(row => row.open),
  ])] : []
  const roomState = readiness?.rooming?.state ?? 'notApplicable'
  const transportState = readiness?.transportation?.state ?? 'notApplicable'
  return <AppShell viewer={viewer} role={viewer.user?.role==='coach'?'coach':'travelLead'}><div className={styles.content}>
    <h1>{copy.title}</h1>
    {choices.length === 0 ? <section className={styles.panel}><p>{copy.noEvents}</p></section> : <>
      <div className={styles.eventChoices} role="group" aria-label={copy.chooseEvent}>{choices.map(choice => <button type="button" key={choice.event._id} className={choice.event._id === eventId ? styles.selectedEvent : ''} aria-pressed={choice.event._id === eventId} onClick={() => setSelected(choice.event._id)}><strong>{choice.event.name}</strong><span>{choice.event._id === eventId && readiness ? statusText(readiness.overall, openItems + (readiness.transportation?.open.length ?? 0) + (readiness.rooming?.open ?? 0)) : copy.selectToView}</span></button>)}</div>
      {!event || !eventId || !readiness ? <section className={styles.panel}><p role="status">{copy.loadingSelected}</p></section> : <>
        <section className={styles.eventSummary} aria-label={copy.selectedEvent}><div className={styles.eventTop}><div><span className={styles.eventType}>{event.type}</span><h2>{event.name}</h2><p>{fmtDate(event.startsAt)}{event.endsAt !== event.startsAt ? ` – ${fmtDate(event.endsAt)}` : ''} · {event.destination}</p></div><Link to={`/events/${eventId}`}>{copy.manageEvent}</Link></div><div className={styles.chips}><StatusChip label={copy.students} state={openItems ? 'open' : 'ready'} open={openItems} /><StatusChip label={copy.transportation} state={transportState} open={readiness.transportation?.open.length ?? 0} /><StatusChip label={copy.rooming} state={roomState} open={readiness.rooming?.open ?? 0} /></div></section>
        <section className={styles.studentsPanel} aria-labelledby="readiness-students"><div className={styles.panelHeader}><h2 id="readiness-students">{copy.students}</h2><span>{copy.readyCount(readyStudents, rows.length)}</span></div>{rows.length === 0 ? <p className={styles.empty}>{copy.noParticipants}</p> : <><p className={styles.legend}>{copy.openEvidence}</p><div className={styles.desktopTable}><table><thead><tr><th>{copy.student}</th>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.student._id}><td><span className={`${styles.studentName} ${row.state === 'ready' ? styles.readyName : styles.openName}`}><span aria-hidden="true">{statusIcon(row.state)}</span>{row.student.preferredName}</span></td>{columns.map(column => <td className={row.open.includes(column) ? styles.openCell : ''} key={column}>{row.open.includes(column) ? <span className={styles.cellState}><span aria-hidden="true">×</span> {copy.open}</span> : <span className={styles.unknownCell}>—</span>}{column === copy.first && event.firstRequired && <FirstAction eventId={eventId} row={row} />}</td>)}</tr>)}</tbody></table></div><div className={styles.mobileStudents}>{rows.map(row => <article key={row.student._id} className={styles.studentCard}><h3 className={row.state === 'ready' ? styles.readyName : styles.openName}><span aria-hidden="true">{statusIcon(row.state)}</span> {row.student.preferredName}</h3>{columns.map(column => <div className={styles.studentField} key={column}><span>{column}</span><span className={row.open.includes(column) ? styles.openValue : styles.unknownCell}>{row.open.includes(column) ? copy.open : '—'}</span>{column === copy.first && event.firstRequired && <FirstAction eventId={eventId} row={row} />}</div>)}</article>)}</div></>}</section>
        <div className={styles.detailGrid}><section className={styles.panel}><div className={styles.detailHeading}><h2>{copy.transportation}</h2><StatusChip label={copy.transportation} state={transportState} open={readiness.transportation?.open.length ?? 0} /></div>{transportState === 'notApplicable' ? <p className={styles.muted}>{copy.notApplicableEvent}</p> : <><p className={styles.muted}>{copy.seatCount(readiness.transportation?.seats ?? 0, readiness.transportation?.demand ?? 0)}</p>{readiness.transportation?.open.length ? <ul>{readiness.transportation.open.map(item => <li key={item}>{item}</li>)}</ul> : <p>{copy.noTransportIssues}</p>}</>}</section><section className={styles.panel}><div className={styles.detailHeading}><h2>{copy.rooming}</h2><StatusChip label={copy.rooming} state={roomState} open={readiness.rooming?.open ?? 0} /></div>{roomState === 'notApplicable' ? <p className={styles.muted}>{copy.notApplicableEvent}</p> : <p>{roomState === 'ready' ? copy.roomReady : copy.roomOpenCount(readiness.rooming?.open ?? 0)}</p>}</section></div>
        <section className={styles.panel}><h2>{copy.pdf}</h2><p className={styles.muted}>{copy.pdfUnavailable}</p></section>
      </>}
    </>}
  </div></AppShell>
}
