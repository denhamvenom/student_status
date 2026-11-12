import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { userFacingError } from '@/lib/error-message'
import { ConnectDriveWizard } from './ConnectDriveWizard'
import { spreadsheetCopy as copy } from './copy'
import { commonProblem, runInProgress, updatedLabel } from './logic'
import styles from './TeamSpreadsheets.module.css'

/** Event files listed before the rest are folded away. */
const EVENTS_SHOWN = 5

type FileStatus = { kind: string; title: string; name: string | null; link: string | null; updatedAt: number | null; problem: string | null; note: string | null }

/** One spreadsheet: name, a tap-friendly Open link, when it was updated, and any note or problem. */
function FileItem({ file, shared, event }: { file: FileStatus; shared: boolean; event?: { name: string; current: boolean } }) {
  return <li className={styles.file}>
    <div className={styles.fileHead}>
      <span className={styles.fileName}>{file.name ?? (event ? `${event.name}: ${file.title}` : file.title)}</span>
      {file.link ? <a className={styles.open} href={file.link} target="_blank" rel="noopener noreferrer">{copy.open} {file.title}<span className="sr-only">{event ? copy.openFor(event.name) : ''} (opens in a new tab)</span></a> : <span className={styles.muted}>{copy.notMade}</span>}
    </div>
    <p className={styles.muted}>{file.updatedAt ? copy.updated(updatedLabel(file.updatedAt)) : copy.neverUpdated}</p>
    {event && !event.current && <p className={styles.muted}>{copy.eventFrozen}</p>}
    {file.note && <p className={styles.muted}>{file.note}</p>}
    {file.problem && <p role="alert" className={styles.problem}>{shared ? copy.notUpdated : file.problem}</p>}
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
  const shared = commonProblem([...status.files, ...status.eventFiles])
  const shownEvents = allEvents ? status.eventFiles : status.eventFiles.slice(0, EVENTS_SHOWN)
  const skipped = !running && status.run ? status.run.skipped : 0
  const partial = !running && status.run?.state === 'partial'

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
            <p className={styles.status}><span role="status">{running ? copy.updatingNow : status.lastSuccessAt ? copy.updated(updatedLabel(status.lastSuccessAt)) : copy.neverUpdated}</span>{running && status.run ? <span className={styles.muted}> {copy.updatingCount(status.run.finished, status.run.total)}</span> : null}</p>
            <Button type="button" disabled={busy || running || !status.enabled} onClick={() => void press()}>{busy ? copy.starting : copy.update}</Button>
          </div>
          {!status.enabled && <p role="alert" className={styles.problem}>{copy.notTurnedOn}</p>}
          {message && <p role="status" className={styles.status}>{message}</p>}
          {partial && <p role="alert" className={styles.problem}>{shared ?? copy.someFailed}{status.lastTriedAt ? <span className={styles.muted}> {copy.lastTried(updatedLabel(status.lastTriedAt))}</span> : null}</p>}
          <ul className={styles.files} aria-label={copy.filesHeading}>{status.files.map(file => <FileItem key={file.kind} file={file} shared={!!shared} />)}</ul>
          {status.archive && <p role="status" className={styles.muted}>{copy.archived(status.archive.label)}</p>}
          {skipped > 0 && <p role="status" className={styles.muted}>{copy.tooMany(skipped)}</p>}
          {status.eventFiles.length > 0 && <section className={styles.group} aria-labelledby="team-spreadsheets-events">
            <div className={styles.row}>
              <h3 id="team-spreadsheets-events" className={styles.groupHeading}>{copy.eventsHeading}</h3>
              <span className={styles.muted}>{copy.eventsCount(status.eventFiles.length)}</span>
            </div>
            <ul className={styles.files} aria-label={copy.eventsHeading}>{shownEvents.map(file => <FileItem key={`${file.eventId}:${file.kind}`} file={file} shared={!!shared} event={{ name: file.eventName, current: file.current }} />)}</ul>
            {status.eventFiles.length > EVENTS_SHOWN && <div className={styles.actions}><Button type="button" variant="outline" aria-expanded={allEvents} onClick={() => setAllEvents(open => !open)}>{allEvents ? copy.showFewerEvents : copy.showAllEvents(status.eventFiles.length)}</Button></div>}
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
