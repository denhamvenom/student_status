import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { userFacingError } from '@/lib/error-message'
import { ConnectDriveWizard } from './ConnectDriveWizard'
import { spreadsheetCopy as copy } from './copy'
import { commonProblem, eventDateLabel, fileTime, latestFileTime, runInProgress, updatedLabel } from './logic'
import styles from './TeamSpreadsheets.module.css'

/** Events listed before the rest are folded away. */
const EVENTS_SHOWN = 5

type FileStatus = { kind: string; title: string; name: string | null; link: string | null; updatedAt: number | null; checkedAt: number | null; problem: string | null; note: string | null }
type EventStatus = { eventId: string; eventName: string; eventStartsAt: number; current: boolean; files: FileStatus[] }

const timeLine = (time: ReturnType<typeof fileTime>) => time.at === null ? copy.neverUpdated : time.kind === 'upToDate' ? copy.upToDate(updatedLabel(time.at)) : copy.updated(updatedLabel(time.at))

const newTab = <span className="sr-only"> (opens in a new tab)</span>

/** One team spreadsheet: name, a tap-friendly Open link, when it was updated, and any note or problem. */
function FileItem({ file, shared }: { file: FileStatus; shared: boolean }) {
  return <li className={styles.file}>
    <div className={styles.fileHead}>
      <span className={styles.fileName}>{file.name ?? file.title}</span>
      {file.link ? <a className={styles.open} href={file.link} target="_blank" rel="noopener noreferrer">{copy.open} {file.title}{newTab}</a> : <span className={styles.muted}>{copy.notMade}</span>}
    </div>
    <p className={styles.muted}>{timeLine(fileTime(file))}</p>
    {file.note && <p className={styles.muted}>{file.note}</p>}
    {file.problem && <p role="alert" className={styles.problem}>{shared ? copy.notUpdated : file.problem}</p>}
  </li>
}

/** One event: its name and date, then up to three links (Event, Fees, Travel emergency; only the ones this person may open). */
function EventItem({ event, shared }: { event: EventStatus; shared: boolean }) {
  const linkText = (file: FileStatus) => copy.eventLinks[file.kind] ?? `${copy.open} ${file.title}`
  const label = (file: FileStatus) => copy.eventNames[file.kind] ?? file.title
  return <li className={styles.file}>
    <div className={styles.fileHead}>
      <span className={styles.fileName}>{event.eventName}</span>
    </div>
    {event.eventStartsAt > 0 && <p className={styles.muted}>{eventDateLabel(event.eventStartsAt)}</p>}
    <div className={styles.links}>{event.files.map(file => file.link
      ? <a key={file.kind} className={styles.open} href={file.link} target="_blank" rel="noopener noreferrer">{linkText(file)}<span className="sr-only">{copy.openFor(event.eventName)}</span>{newTab}</a>
      : <span key={file.kind} className={styles.muted}>{copy.eventLinkMissing(label(file))}</span>)}</div>
    <p className={styles.muted}>{timeLine(latestFileTime(event.files))}</p>
    {!event.current && <p className={styles.muted}>{copy.eventFrozen}</p>}
    {event.files.map(file => file.note && <p key={`${file.kind}:note`} className={styles.muted}>{copy.eventFileNote(label(file), file.note)}</p>)}
    {event.files.map(file => file.problem && <p key={`${file.kind}:problem`} role="alert" className={styles.problem}>{copy.eventFileNote(label(file), shared ? copy.notUpdated : file.problem)}</p>)}
  </li>
}

/** The Reports page card: update every team spreadsheet, see where they are, and (Coach) connect Google Drive. */
export function TeamSpreadsheetsCard({ coach }: { coach: boolean }) {
  const [asOf, setAsOf] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setAsOf(Date.now()), 30_000); return () => clearInterval(timer) }, [])
  const status = useQuery(api.sheetExports.status, {})
  const requestUpdate = useMutation(api.sheetExports.requestUpdate)
  const [wizard, setWizard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [allEvents, setAllEvents] = useState(false)

  if (!status) return <Card><CardContent><p role="status">{copy.loading}</p></CardContent></Card>
  if (wizard && status.canSetUp) return <ConnectDriveWizard serviceAccountEmail={status.serviceAccountEmail} onClose={() => setWizard(false)} />

  // A Travel Lead can do nothing about a missing connection, so it shrinks to one line.
  if (!status.connected && !coach) return <p className={styles.muted}><strong>{copy.title}.</strong> {copy.notConnectedOther}</p>

  const running = runInProgress(status.run, asOf)
  const press = async () => {
    setBusy(true); setMessage('')
    try {
      const result = await requestUpdate({})
      if (result.status !== 'started') setMessage(result.message)
    } catch (error) { setMessage(userFacingError(error, copy.pressFailed)) } finally { setBusy(false) }
  }
  const shared = commonProblem([...status.files, ...status.events.flatMap(event => event.files)])
  const shownEvents = allEvents ? status.events : status.events.slice(0, EVENTS_SHOWN)
  const skipped = !running && status.run ? status.run.skipped : 0
  const partial = !running && status.run?.state === 'partial'
  const archive = status.archive
  const archiveLine = archive ? (archive.state === 'done' ? copy.archived(archive.label) : archive.state === 'partial' ? copy.archivePartial : copy.archiveSkipped) : null

  return <Card aria-label={copy.title}>
    <CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader>
    <CardContent>
      <div className={styles.root}>
        <p className={styles.muted}>{copy.description}</p>
        {!status.connected ? <>
          <p role="status">{copy.notConnectedCoach}</p>
          {(status.credentialsReady
            ? <div className={styles.actions}><Button type="button" onClick={() => setWizard(true)}>{copy.connect}</Button></div>
            : <p role="alert" className={styles.problem}>{copy.accountMissing}</p>)}
        </> : <>
          <div className={styles.row}>
            <p className={styles.status}><span role="status">{running ? (status.run && status.run.total > 0 ? copy.updatingCount(status.run.finished, status.run.total) : copy.updatingNow) : status.lastSuccessAt ? copy.updated(updatedLabel(status.lastSuccessAt)) : copy.neverUpdated}</span></p>
            <Button type="button" disabled={busy || running || !status.enabled} onClick={() => void press()}>{busy ? copy.starting : copy.update}</Button>
          </div>
          {!status.enabled && <p role="alert" className={styles.problem}>{copy.notTurnedOn}</p>}
          {message && <p role="status" className={styles.status}>{message}</p>}
          {partial && <p role="alert" className={styles.problem}>{shared ?? copy.someFailed}{status.lastTriedAt ? <span className={styles.muted}> {copy.lastTried(updatedLabel(status.lastTriedAt))}</span> : null}</p>}
          <ul className={styles.files} aria-label={copy.filesHeading}>{status.files.map(file => <FileItem key={file.kind} file={file} shared={!!shared} />)}</ul>
          {archiveLine && <p role="status" className={archive?.state === 'done' ? styles.muted : styles.problem}>{archiveLine}</p>}
          {skipped > 0 && <p role="status" className={styles.muted}>{copy.tooMany(skipped)}</p>}
          {status.events.length > 0 && <section className={styles.group} aria-labelledby="team-spreadsheets-events">
            <div className={styles.row}>
              <h3 id="team-spreadsheets-events" className={styles.groupHeading}>{copy.eventsHeading}</h3>
              <span className={styles.muted}>{copy.eventsCount(status.events.length)}</span>
            </div>
            <ul className={styles.files} aria-label={copy.eventsHeading}>{shownEvents.map(event => <EventItem key={event.eventId} event={event} shared={!!shared} />)}</ul>
            {status.events.length > EVENTS_SHOWN && <div className={styles.actions}><Button type="button" variant="outline" aria-expanded={allEvents} onClick={() => setAllEvents(open => !open)}>{allEvents ? copy.showFewerEvents : copy.showAllEvents(status.events.length)}</Button></div>}
          </section>}
          {coach && <>
            <p className={styles.muted}>{copy.healthReminder}</p>
            <div className={styles.actions}><Button type="button" variant="outline" onClick={() => setWizard(true)}>{copy.change}</Button></div>
          </>}
        </>}
      </div>
    </CardContent>
  </Card>
}
