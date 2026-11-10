import { userFacingError } from '@/lib/error-message'
import { EventEnrollmentNotice } from '../../EventEnrollmentNotice'
import { eventTypeLabel } from '../../lib/event-copy'
import { eventLocation } from '@/lib/event-place'
import { AppShell } from '../../AppShell'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { defaultEventId, EventPicker } from '../../components/EventPicker'
import { readinessCopy as copy } from './readinessCopy'
import { readinessPrintSummary } from './readinessPrint'
import styles from './ReadinessReview.module.css'

type ListedEvent = { _id: Id<'events'>; name: string; type: string; startsAt: number; endsAt: number; requirements: string[]; isPast: boolean }
type Column = { key: string; label: string }
type Cell = { key: string; state: 'done' | 'open'; text: string }
type StudentRow = { student: { _id: Id<'students'>; preferredName: string; legalName?: string }; state: 'ready' | 'open'; open: string[]; cells: Cell[]; openCount: number }
type Transport = { state: 'ready' | 'open' | 'notApplicable'; seats: number; demand: number; open: string[] }
type Rooming = { state: 'ready' | 'open' | 'notApplicable'; open: number }
type Counts = { students: number; ready: number; open: number; openItems: number }
type Readiness = { event: { _id: Id<'events'>; name: string }; columns: Column[]; counts: Counts | null; students: StudentRow[]; transportation: Transport | null; rooming: Rooming | null; overall: 'open' | 'ready'; permissionFormsClosed?: boolean; studentsAwaitingForms?: number; shifts?: { minimum: number; total: number } | null; notes?: { key: string; label: string; instructions: string | null; url: string | null }[]; enrollmentState?: 'running' | 'failed' | 'complete'; coverage?: { participantsComplete: boolean; roomingComplete: boolean } }
type Viewer = { status: string; user: { name: string; email: string; role: string; travelLead: boolean; theme: string } | null; season: { name: string } | null }
type EventDetail = { event: { destination: string; onsite?: boolean; locationType?: string; shiftsEnabled?: boolean } }

const fmtDate = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(value)
const fmtGenerated = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(value)
const statusText = (state: string, open = 0) => state === 'empty' ? 'No students yet' : state === 'unknown' ? copy.unavailable : state === 'notApplicable' ? copy.notApplicable : state === 'ready' ? copy.ready : copy.openCount(open)
const statusIcon = (state: string) => state === 'empty' ? '–' : state === 'ready' ? '✓' : state === 'notApplicable' ? '–' : state === 'unknown' ? '?' : '×'
const studentName = (row: StudentRow) => row.student.legalName || row.student.preferredName
/** Hour-sized clock so the events query is not re-sent every render. */
const hourNow = () => Math.floor(Date.now() / 3_600_000) * 3_600_000

function StatusChip({ label, state, open, text }: { label: string; state: string; open?: number; text?: string }) {
  return <span className={`${styles.statusChip} ${state === 'ready' ? styles.ready : state === 'open' ? styles.open : styles.na}`}>
    <span aria-hidden="true" className={styles.statusIcon}>{statusIcon(state)}</span><strong>{label}</strong><span>· {text ?? statusText(state, open)}</span>
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



function CellValue({ cell, column, row, eventId, canEditFirst, canOpenRecord }: { cell: Cell | undefined; column: Column; row: StudentRow; eventId: Id<'events'>; canEditFirst: boolean; canOpenRecord: boolean }) {
  const open = cell?.state === 'open'
  return <>
    <span className={open ? styles.cellState : styles.unknownCell}><span aria-hidden="true">{open ? '×' : '✓'}</span> {cell?.text ?? copy.unavailable}</span>
    {column.key === 'permission' && <Link className={styles.firstReviewLink} to={`/permissions?student=${row.student._id}`}>Open permission forms</Link>}
    {column.key === 'first' && canOpenRecord && open && <Link className={styles.firstReviewLink} to={`/team/${row.student._id}`}>Open student record</Link>}
    {column.key === 'first' && canEditFirst && <FirstAction eventId={eventId} row={row} />}
  </>
}

export function ReadinessReview() {
  const viewer = useQuery(api.app.viewer, {}) as Viewer | undefined
  const [asOf, setAsOf] = useState(hourNow)
  useEffect(() => { const timer = window.setInterval(() => setAsOf(hourNow()), 60_000); return () => window.clearInterval(timer) }, [])
  const listed = useQuery(api.app.readinessEvents, { asOf }) as ListedEvent[] | undefined
  const [params, setParams] = useSearchParams()
  const selected = params.get('event')
  const [changing, setChanging] = useState(false)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const pickable = listed?.map(item => ({ _id: item._id as string, name: item.name, startsAt: item.startsAt, endsAt: item.endsAt, detail: item.requirements.join(', ') }))
  const eventId = (selected && listed?.some(item => item._id === selected) ? selected : pickable ? defaultEventId(pickable, asOf) : null) as Id<'events'> | null
  const readiness = useQuery(api.app.eventReadiness, eventId ? { eventId } : 'skip') as Readiness | undefined
  const detail = useQuery(api.app.eventDetail, eventId ? { eventId } : 'skip') as EventDetail | undefined
  const [printSummary, setPrintSummary] = useState<ReturnType<typeof readinessPrintSummary> | null>(null)
  if (!viewer || !listed) return <div className={styles.review}><main className={styles.main}><p role="status">{copy.loading}</p></main></div>
  if (viewer.user?.role !== 'coach' && !viewer.user?.travelLead) return <div className={styles.review}><main className={styles.main}><h1>{copy.title}</h1><p role="alert">{copy.coachOnly}</p></main></div>
  const isCoach = viewer.user?.role === 'coach'
  const event = listed.find(item => item._id === eventId)
  const columns = readiness?.columns ?? []
  const allRows = readiness?.students ?? []
  const rows = onlyOpen ? allRows.filter(row => row.state === 'open') : allRows
  const notes = readiness?.notes ?? []
  const counts = readiness?.counts ?? { students: 0, ready: 0, open: 0, openItems: 0 }
  const emptyParticipants = allRows.length === 0 && !!readiness?.coverage?.participantsComplete
  const roomState = emptyParticipants ? 'empty' : !readiness?.coverage?.roomingComplete || !readiness?.coverage?.participantsComplete ? 'unknown' : readiness.rooming?.state ?? 'unknown'
  const transportState = emptyParticipants ? 'empty' : !readiness?.coverage?.participantsComplete ? 'unknown' : readiness.transportation?.state ?? 'unknown'
  const preview = printSummary?.eventId === eventId ? printSummary : null
  const destination = detail ? eventLocation(detail.event) : ''
  const labelOf = (key: string) => columns.find(column => column.key === key)?.label ?? key
  const preparePrint = () => {
    if (!event || !eventId || !readiness) return
    setPrintSummary(readinessPrintSummary({
      eventId, eventName: event.name, startsAt: event.startsAt, endsAt: event.endsAt, destination, generatedAt: Date.now(),
      students: readiness.students.map(row => ({ studentId: row.student._id, name: studentName(row), state: row.state, open: row.cells.filter(cell => cell.state === 'open').map(cell => `${labelOf(cell.key)}: ${cell.text}`) })),
      transportation: readiness.transportation ? { state: readiness.transportation.state, seats: readiness.transportation.seats, demand: readiness.transportation.demand, open: [...readiness.transportation.open] } : null,
      rooming: readiness.rooming ? { state: readiness.rooming.state, open: readiness.rooming.open } : null,
      coverage: readiness.coverage ?? null, requirementsComplete: true, overall: readiness.overall,
    }))
  }
  const choose = (id: string) => { setParams(previous => { const next = new URLSearchParams(previous); next.set('event', id); return next }); setChanging(false); setPrintSummary(null) }
  const picked = !!selected && selected === eventId
  const canEditFirst = (column: Column) => column.key === 'first' && event?.type !== 'Competition'
  const nameLink = (row: StudentRow) => isCoach ? <Link to={`/team/${row.student._id}`}>{studentName(row)}</Link> : studentName(row)
  const cellsFor = (row: StudentRow, column: Column) => <CellValue cell={row.cells.find(item => item.key === column.key)} column={column} row={row} eventId={eventId!} canEditFirst={canEditFirst(column)} canOpenRecord={isCoach && event?.type === 'Competition'} />
  const isOpen = (row: StudentRow, column: Column) => row.cells.find(item => item.key === column.key)?.state === 'open'
  return <AppShell viewer={viewer} role={isCoach ? 'coach' : 'travelLead'}><div className={styles.content}>
    <h1>{copy.title}</h1>
    {listed.length === 0 ? <section className={styles.panel}><p role="status">{copy.noEvents}</p></section> : <>
      {picked && event && !changing
        ? <section className={styles.chosenEvent} aria-label={copy.selectedEvent}><span><strong>{event.name}</strong> · {fmtDate(event.startsAt)}</span><Button type="button" variant="outline" onClick={() => setChanging(true)}>{copy.changeEvent}</Button></section>
        : <section className={styles.panel}><EventPicker events={pickable ?? []} value={eventId} onChange={choose} asOf={asOf} label={copy.chooseEvent} /></section>}
      {!event || !eventId || !readiness ? <section className={styles.panel}><p role="status">{copy.loadingSelected}</p></section> : readiness.enrollmentState === 'running' || readiness.enrollmentState === 'failed' ? <EventEnrollmentNotice eventId={eventId} staff coach={isCoach} failed={readiness.enrollmentState === 'failed'} /> : <>
        <section className={styles.eventSummary} aria-label={copy.selectedEvent}>
          <div className={styles.eventTop}>
            <div><span className={styles.eventType}>{eventTypeLabel(event.type)}</span><h2>{event.name}</h2><p>{fmtDate(event.startsAt)}{event.endsAt !== event.startsAt ? ` – ${fmtDate(event.endsAt)}` : ''}{destination ? ` · ${destination}` : ''}</p></div>
            <div className={styles.eventLinks}>
              <Link to={`/events/${eventId}`}>{copy.manageEvent}</Link>
              {readiness.shifts && <Link to={`/events/${eventId}#shifts`}>{copy.shiftSignups}</Link>}
            </div>
          </div>
          {!emptyParticipants && <div className={styles.chips}><StatusChip label={copy.students} state={!readiness.coverage?.participantsComplete ? 'unknown' : counts.openItems ? 'open' : 'ready'} text={counts.openItems ? copy.thingsOpen(counts.openItems) : undefined} />{transportState !== 'notApplicable' && <StatusChip label={copy.transportation} state={transportState} open={readiness.transportation?.open.length ?? 0} />}{roomState !== 'notApplicable' && <StatusChip label={copy.rooming} state={roomState} open={readiness.rooming?.open ?? 0} />}</div>}
          {notes.length > 0 && <div className={styles.notes}><h3>{copy.notesHeading}</h3><ul>{notes.map(note => <li key={note.key}><strong>{note.label}</strong>{note.instructions ? `: ${note.instructions}` : ''}{note.url && /^https?:\/\//i.test(note.url) && <> · <a href={note.url} target="_blank" rel="noopener noreferrer">{copy.openLink}</a></>}</li>)}</ul></div>}
        </section>
        {emptyParticipants ? <section className={styles.panel}><p>{copy.noStudentsYet}</p></section> : <>
          <section className={styles.studentsPanel} aria-labelledby="readiness-students">
            <div className={styles.panelHeader}>
              <h2 id="readiness-students">{copy.students}</h2>
              <span>{onlyOpen ? copy.shownCount(rows.length, counts.students) : counts.openItems ? `${copy.thingsOpen(counts.openItems)} · ${copy.readyCount(counts.ready, counts.students)}` : copy.readyCount(counts.ready, counts.students)}</span>
            </div>
            {readiness.permissionFormsClosed && <p className={styles.muted}>{copy.permissionFormsClosed(readiness.studentsAwaitingForms ?? 0)}</p>}
            <label className={styles.filter}><Checkbox checked={onlyOpen} onCheckedChange={checked => setOnlyOpen(checked === true)} /><span>{copy.showOnlyOpen}</span></label>
            {onlyOpen && rows.length > 0 && rows.length === allRows.length && <p className={styles.allOpen} role="status">{copy.allStillOpen}</p>}
            {rows.length === 0 ? <p className={styles.empty}>{onlyOpen ? copy.nothingOpen : copy.noParticipants}</p> : <>
              <div className={styles.desktopTable}><table><thead><tr><th>{copy.student}</th>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.student._id}><td><span className={`${styles.studentName} ${row.state === 'ready' ? styles.readyName : styles.openName}`}><span aria-hidden="true">{statusIcon(row.state)}</span>{nameLink(row)}</span></td>{columns.map(column => <td className={isOpen(row, column) ? styles.openCell : ''} key={column.key}>{cellsFor(row, column)}</td>)}</tr>)}</tbody></table></div>
              <div className={styles.mobileStudents}>{rows.map(row => <article key={row.student._id} className={styles.studentCard}><h3 className={row.state === 'ready' ? styles.readyName : styles.openName}><span aria-hidden="true">{statusIcon(row.state)}</span> {nameLink(row)}</h3>{columns.map(column => <div className={styles.studentField} key={column.key}><span>{column.label}</span><span className={isOpen(row, column) ? styles.openValue : styles.unknownCell}>{cellsFor(row, column)}</span></div>)}</article>)}</div>
            </>}
          </section>
          <div className={styles.detailGrid}>
            {transportState !== 'notApplicable' && <section className={styles.panel}><div className={styles.detailHeading}><h2>{copy.transportation}</h2><StatusChip label={copy.transportation} state={transportState} open={readiness.transportation?.open.length ?? 0} /></div>{transportState === 'empty' ? <p className={styles.muted}>{copy.noParticipants}</p> : transportState === 'unknown' ? <p className={styles.muted}>{copy.unavailable}</p> : <><p className={styles.muted}>{copy.seatCount(readiness.transportation!.seats, readiness.transportation!.demand)}</p>{readiness.transportation!.open.length ? <ul>{readiness.transportation!.open.map(item => <li key={item}>{item}</li>)}</ul> : <p>{copy.noTransportIssues}</p>}</>}</section>}
            {readiness.rooming?.state !== 'notApplicable' && <section className={styles.panel}><div className={styles.detailHeading}><h2>{copy.rooming}</h2><StatusChip label={copy.rooming} state={roomState} open={readiness.rooming?.open ?? 0} /></div>{roomState === 'empty' ? <p className={styles.muted}>{copy.noParticipants}</p> : roomState === 'unknown' ? <p className={styles.muted}>{copy.unavailable}</p> : <p>{roomState === 'ready' ? copy.roomReady : copy.roomOpenCount(readiness.rooming?.open ?? 0)}</p>}</section>}
          </div>
        </>}
        <section className={`${styles.panel} ${styles.printControls}`}><h2>{copy.printSummary}</h2><p className={styles.muted}>{copy.printDescription} <Link to="/permissions">{copy.permissionPackets}</Link>.</p><Button type="button" variant="outline" onClick={preparePrint}>{copy.preparePrint}</Button>{preview && <Button type="button" onClick={() => window.print()}>{copy.print}</Button>}</section>
        {preview && <section className={styles.printRegion} aria-label={copy.printSummary}><header><p>{copy.printSummary} · {preview.status === 'Draft' ? copy.draft : copy.complete}</p><h2>{preview.eventName}</h2><p>{fmtDate(preview.startsAt)}{preview.endsAt !== preview.startsAt ? ` – ${fmtDate(preview.endsAt)}` : ''} · {preview.destination}</p><p>{copy.generatedAt}: {fmtGenerated(preview.generatedAt)}</p></header>{preview.notes.length > 0 && <ul>{preview.notes.map(note => <li key={note}>{note}</li>)}</ul>}<h3>{copy.students}</h3><table><thead><tr><th>{copy.student}</th><th>{copy.ready}</th><th>{copy.outstanding}</th></tr></thead><tbody>{preview.students.map(student => <tr key={student.studentId}><td>{student.name}</td><td>{statusText(student.state, student.open.length)}</td><td>{student.open.length ? student.open.join('; ') : copy.noneOutstanding}</td></tr>)}</tbody></table><div className={styles.printDetails}>{preview.transportation?.state !== 'notApplicable' && <section><h3>{copy.transportation}</h3><p>{preview.transportation ? statusText(preview.transportation.state, preview.transportation.open.length) : copy.unavailable}</p>{preview.transportation && preview.transportation.state !== 'notApplicable' && <><p>{copy.seatCount(preview.transportation.seats, preview.transportation.demand)}</p><ul>{preview.transportation.open.map(item => <li key={item}>{item}</li>)}</ul></>}</section>}{preview.rooming?.state !== 'notApplicable' && <section><h3>{copy.rooming}</h3><p>{preview.rooming ? statusText(preview.rooming.state, preview.rooming.open) : copy.unavailable}</p></section>}</div></section>}
      </>}
    </>}
  </div></AppShell>
}
