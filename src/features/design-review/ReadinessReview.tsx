import { userFacingError } from '@/lib/error-message'
import { EventEnrollmentNotice } from '../../EventEnrollmentNotice'
import { eventCopy } from '../../lib/event-copy'
import { AppShell } from '../../AppShell'
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { readinessCopy as copy } from './readinessCopy'
import { readinessPrintSummary } from './readinessPrint'
import styles from './ReadinessReview.module.css'

type EventChoice = { event: { _id: Id<'events'>; name: string; type: string; startsAt: number; endsAt: number; destination: string; permissionRequired: boolean; firstRequired: boolean; overnight: boolean; roomingEnabled: boolean; feeCents: number }; participation: string | null }
type StudentRow = { student: { _id: Id<'students'>; preferredName: string; legalName?: string }; state: 'ready' | 'open' | 'notApplicable'; open: string[]; firstRegistrationState?: 'needsCompletion'|'awaitingVerification'|'verified'; permissionStatus?: 'unknown'|'notApplicable'|'notRequired'|'accepted'|'missing' }
type Transport = { state: 'ready' | 'open' | 'notApplicable'; seats: number; demand: number; open: string[] }
type Rooming = { state: 'ready' | 'open' | 'notApplicable'; open: number }
type Readiness = { event: { _id: Id<'events'>; name: string }; students: StudentRow[]; transportation: Transport | null; rooming: Rooming | null; overall: 'open' | 'ready'; enrollmentState?: 'running' | 'failed' | 'complete'; coverage?: { participantsComplete: boolean; roomingComplete: boolean } }
type Viewer = { status: string; user: { name: string; email: string; role: string; travelLead: boolean; theme: string } | null; season: { name: string } | null }
type EventDetail = { requirements?: { key: string; label: string }[] }

const fmtDate = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(value)
const fmtGenerated = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(value)
const statusText = (state: string, open = 0) => state === 'empty' ? 'No students yet' : state === 'unknown' ? copy.unavailable : state === 'notApplicable' ? copy.notApplicable : state === 'ready' ? copy.ready : copy.openCount(open)
const statusIcon = (state: string) => state === 'empty' ? '–' : state === 'ready' ? '✓' : state === 'notApplicable' ? '–' : state === 'unknown' ? '?' : '×'

function requirementText(row: StudentRow, column: string): string {
  if (column === 'FIRST registration and Consent & Release') return row.state==='notApplicable'?'Not participating':row.firstRegistrationState==='verified'?'Verified':row.firstRegistrationState==='awaitingVerification'?'Awaiting Coach verification':'Needs completion'
  if (column === copy.permission) {
    const labels = { accepted: 'Accepted', missing: 'Missing', notRequired: 'Not required', notApplicable: 'Not participating', unknown: 'Unavailable' }
    return labels[row.permissionStatus ?? 'unknown']
  }
  return row.open.includes(column) ? copy.open : '—'
}

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
    catch (cause) { setError(userFacingError(cause, copy.updateFailed)) }
    finally { setBusy(false) }
  }
  return <span className={styles.firstAction}>
    <Button type="button" className={styles.smallAction} variant="outline" disabled={busy} aria-label={copy.firstActionName(open, (row.student.legalName||row.student.preferredName))} onClick={() => void change()}>{open ? copy.firstDone : copy.firstReopen}</Button>
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
  const [printSummary, setPrintSummary] = useState<ReturnType<typeof readinessPrintSummary> | null>(null)
  if (!viewer || !choices) return <div className={styles.review}><main className={styles.main}><p role="status">{copy.loading}</p></main></div>
  if (viewer.user?.role !== 'coach' && !viewer.user?.travelLead) return <div className={styles.review}><main className={styles.main}><h1>{copy.title}</h1><p role="alert">{copy.coachOnly}</p></main></div>
  const event = choices.find(choice => choice.event._id === eventId)?.event
  const rows = [...(readiness?.students ?? [])].sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open'))
  const emptyParticipants = rows.length === 0 && !!readiness?.coverage?.participantsComplete
  const openItems = rows.reduce((count, row) => count + row.open.length, 0)
  const readyStudents = rows.filter(row => row.state === 'ready').length
  const columns = event ? [...new Set([
    ...(event.feeCents > 0 || rows.some(row => row.open.includes(copy.payment)) ? [copy.payment] : []),
    ...(event.permissionRequired ? [copy.permission] : []),
    ...(event.type==='Competition' ? ['FIRST registration and Consent & Release'] : event.firstRequired ? [copy.first] : []),
    ...(detail?.requirements?.map(requirement => requirement.label) ?? []),
    ...(event.overnight && event.roomingEnabled ? [copy.roomSelection] : []),
    ...rows.flatMap(row => row.open),
  ])] : []
  const roomState = emptyParticipants ? 'empty' : !readiness?.coverage?.roomingComplete || !readiness?.coverage?.participantsComplete ? 'unknown' : readiness.rooming?.state ?? 'unknown'
  const transportState = emptyParticipants ? 'empty' : !readiness?.coverage?.participantsComplete ? 'unknown' : readiness.transportation?.state ?? 'unknown'
  const preview = printSummary?.eventId === eventId ? printSummary : null
  const preparePrint = () => {
    if (!event || !eventId || !readiness) return
    setPrintSummary(readinessPrintSummary({ eventId, eventName: event.name, startsAt: event.startsAt, endsAt: event.endsAt, destination: event.destination, generatedAt: Date.now(), students: readiness.students.map(row => ({ studentId: row.student._id, name: (row.student.legalName||row.student.preferredName), state: row.state, open: [...row.open] })), transportation: readiness.transportation ? { state: readiness.transportation.state, seats: readiness.transportation.seats, demand: readiness.transportation.demand, open: [...readiness.transportation.open] } : null, rooming: readiness.rooming ? { state: readiness.rooming.state, open: readiness.rooming.open } : null, coverage: readiness.coverage ?? null, requirementsComplete: !!detail && (detail.requirements?.length ?? 0) < 100, overall: readiness.overall }))
  }
  return <AppShell viewer={viewer} role={viewer.user?.role==='coach'?'coach':'travelLead'}><div className={styles.content}>
    <h1>{copy.title}</h1>
    {choices.length === 0 ? <section className={styles.panel}><p>{copy.noEvents}</p></section> : <>
      <div className={styles.eventChoices} role="group" aria-label={copy.chooseEvent}>{choices.map(choice => <button type="button" key={choice.event._id} className={choice.event._id === eventId ? styles.selectedEvent : ''} aria-pressed={choice.event._id === eventId} onClick={() => { setSelected(choice.event._id); setPrintSummary(null) }}><strong>{choice.event.name}</strong><span>{choice.event._id === eventId && readiness ? (readiness.enrollmentState === 'running' ? eventCopy.enrollment.running : readiness.enrollmentState === 'failed' ? eventCopy.enrollment.failed : emptyParticipants ? 'Selected' : statusText(readiness.overall, openItems + (readiness.transportation?.open.length ?? 0) + (readiness.rooming?.open ?? 0))) : copy.selectToView}</span></button>)}</div>
      {!event || !eventId || !readiness ? <section className={styles.panel}><p role="status">{copy.loadingSelected}</p></section> : readiness.enrollmentState === 'running' || readiness.enrollmentState === 'failed' ? <EventEnrollmentNotice eventId={eventId} staff coach={viewer.user?.role === 'coach'} failed={readiness.enrollmentState === 'failed'}/> : <>
        <section className={styles.eventSummary} aria-label={copy.selectedEvent}><div className={styles.eventTop}><div><span className={styles.eventType}>{event.type === 'Team' ? 'Team activity' : event.type}</span><h2>{event.name}</h2><p>{fmtDate(event.startsAt)}{event.endsAt !== event.startsAt ? ` – ${fmtDate(event.endsAt)}` : ''} · {event.destination}</p></div><Link to={`/events/${eventId}`}>{copy.manageEvent}</Link></div>{!emptyParticipants&&<div className={styles.chips}><StatusChip label={copy.students} state={!readiness.coverage?.participantsComplete ? 'unknown' : rows.length===0 ? 'empty' : openItems ? 'open' : 'ready'} open={openItems} /><StatusChip label={copy.transportation} state={transportState} open={readiness.transportation?.open.length ?? 0} /><StatusChip label={copy.rooming} state={roomState} open={readiness.rooming?.open ?? 0} /></div>}</section>
        {emptyParticipants?<section className={styles.panel}><p>No students yet. Readiness appears when students join this event.</p></section>:<><section className={styles.studentsPanel} aria-labelledby="readiness-students"><div className={styles.panelHeader}><h2 id="readiness-students">{copy.students}</h2><span>{copy.readyCount(readyStudents, rows.length)}</span></div>{rows.length === 0 ? <p className={styles.empty}>{copy.noParticipants}</p> : <>{openItems>0&&<p className={styles.legend}>{copy.openEvidence}</p>}<div className={styles.desktopTable}><table><thead><tr><th>{copy.student}</th>{columns.map(column => <th key={column}>{column===copy.permission?'Permission form':column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.student._id}><td><span className={`${styles.studentName} ${row.state === 'ready' ? styles.readyName : styles.openName}`}><span aria-hidden="true">{statusIcon(row.state)}</span>{(row.student.legalName||row.student.preferredName)}</span></td>{columns.map(column => <td className={row.open.includes(column) ? styles.openCell : ''} key={column}><span className={row.open.includes(column)?styles.cellState:styles.unknownCell}>{requirementText(row,column)}</span>{column === 'FIRST registration and Consent & Release' && event.type==='Competition' && viewer.user?.role==='coach' && <Link className={styles.firstReviewLink} to={`/team/${row.student._id}`}>Open student record</Link>}{column === copy.permission && <Link className={styles.firstReviewLink} to={`/permissions?student=${row.student._id}`}>Open permission forms</Link>}{column === copy.first && event.firstRequired && event.type!=='Competition' && <FirstAction eventId={eventId} row={row} />}</td>)}</tr>)}</tbody></table></div><div className={styles.mobileStudents}>{rows.map(row => <article key={row.student._id} className={styles.studentCard}><h3 className={row.state === 'ready' ? styles.readyName : styles.openName}><span aria-hidden="true">{statusIcon(row.state)}</span> {(row.student.legalName||row.student.preferredName)}</h3>{columns.map(column => <div className={styles.studentField} key={column}><span>{column===copy.permission?'Permission form':column}</span><span className={row.open.includes(column) ? styles.openValue : styles.unknownCell}>{requirementText(row,column)}</span>{column === 'FIRST registration and Consent & Release' && event.type==='Competition' && viewer.user?.role==='coach' && <Link className={styles.firstReviewLink} to={`/team/${row.student._id}`}>Open student record</Link>}{column === copy.permission && <Link className={styles.firstReviewLink} to={`/permissions?student=${row.student._id}`}>Open permission forms</Link>}{column === copy.first && event.firstRequired && event.type!=='Competition' && <FirstAction eventId={eventId} row={row} />}</div>)}</article>)}</div></>}</section>
        <div className={styles.detailGrid}><section className={styles.panel}><div className={styles.detailHeading}><h2>{copy.transportation}</h2><StatusChip label={copy.transportation} state={transportState} open={readiness.transportation?.open.length ?? 0} /></div>{transportState === 'empty' ? <p className={styles.muted}>{copy.noParticipants}</p> : transportState === 'unknown' ? <p className={styles.muted}>{copy.unavailable}</p> : transportState === 'notApplicable' ? <p className={styles.muted}>{copy.notApplicableEvent}</p> : <><p className={styles.muted}>{copy.seatCount(readiness.transportation!.seats, readiness.transportation!.demand)}</p>{readiness.transportation!.open.length ? <ul>{readiness.transportation!.open.map(item => <li key={item}>{item}</li>)}</ul> : <p>{copy.noTransportIssues}</p>}</>}</section><section className={styles.panel}><div className={styles.detailHeading}><h2>{copy.rooming}</h2><StatusChip label={copy.rooming} state={roomState} open={readiness.rooming?.open ?? 0} /></div>{roomState === 'empty' ? <p className={styles.muted}>{copy.noParticipants}</p> : roomState === 'unknown' ? <p className={styles.muted}>{copy.unavailable}</p> : roomState === 'notApplicable' ? <p className={styles.muted}>{copy.notApplicableEvent}</p> : <p>{roomState === 'ready' ? copy.roomReady : copy.roomOpenCount(readiness.rooming?.open ?? 0)}</p>}</section></div></>}
        <section className={`${styles.panel} ${styles.printControls}`}><h2>{copy.printSummary}</h2><p className={styles.muted}>{copy.printDescription} <Link to="/permissions">{copy.permissionPackets}</Link>.</p><Button type="button" variant="outline" onClick={preparePrint}>{copy.preparePrint}</Button>{preview && <Button type="button" onClick={() => window.print()}>{copy.print}</Button>}</section>
        {preview && <section className={styles.printRegion} aria-label={copy.printSummary}><header><p>{copy.printSummary} · {preview.status === 'Draft' ? copy.draft : copy.complete}</p><h2>{preview.eventName}</h2><p>{fmtDate(preview.startsAt)}{preview.endsAt !== preview.startsAt ? ` – ${fmtDate(preview.endsAt)}` : ''} · {preview.destination}</p><p>{copy.generatedAt}: {fmtGenerated(preview.generatedAt)}</p></header>{preview.notes.length > 0 && <ul>{preview.notes.map(note => <li key={note}>{note}</li>)}</ul>}<h3>{copy.students}</h3><table><thead><tr><th>{copy.student}</th><th>{copy.ready}</th><th>{copy.outstanding}</th></tr></thead><tbody>{preview.students.map(student => <tr key={student.studentId}><td>{student.name}</td><td>{statusText(student.state, student.open.length)}</td><td>{student.open.length ? student.open.join('; ') : copy.noneOutstanding}</td></tr>)}</tbody></table><div className={styles.printDetails}><section><h3>{copy.transportation}</h3><p>{preview.transportation ? statusText(preview.transportation.state, preview.transportation.open.length) : copy.unavailable}</p>{preview.transportation && preview.transportation.state !== 'notApplicable' && <><p>{copy.seatCount(preview.transportation.seats, preview.transportation.demand)}</p><ul>{preview.transportation.open.map(item => <li key={item}>{item}</li>)}</ul></>}</section><section><h3>{copy.rooming}</h3><p>{preview.rooming ? statusText(preview.rooming.state, preview.rooming.open) : copy.unavailable}</p></section></div></section>}
      </>}
    </>}
  </div></AppShell>
}
