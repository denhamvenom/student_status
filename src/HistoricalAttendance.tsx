import { HistoricalFinancialCorrections } from './HistoricalFinancialCorrections'
import { HistoricalRosterCorrection } from './HistoricalRosterCorrection'
import { useRef, useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { historicalCopy as copy } from './lib/historical-copy'
import styles from './SeasonAdministration.module.css'

type Session = { id: Id<'timeclockSessions'>; title: string; revision: number; start: number; end: number; state: string }
const date = (value: number) => new Date(value).toLocaleString()
const local = (value: number) => { const d = new Date(value); return new Date(value - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Unable to save correction.'

function CorrectionForm({ session, studentId, grantId, onReview }: { onReview: () => void; session: Session; studentId: Id<'students'>; grantId: Id<'historicalCorrectionSessions'> }) {
  const evidence = useQuery(api.timeclock.correctionEvidence, { sessionId: session.id, studentId })
  const save = useMutation(api.historicalCorrections.correctAttendance)
  const key = useRef(crypto.randomUUID())
  const [revision] = useState(session.revision)
  const [kind, setKind] = useState<'add' | 'replace' | 'void'>('add')
  const [target, setTarget] = useState<{ originalIntervalId?: Id<'timeclockIntervals'>; targetCorrectionId?: Id<'timeclockCorrections'> }>({})
  const [start, setStart] = useState(local(session.start)); const [end, setEnd] = useState(local(session.end))
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  const submit = async () => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      if (kind !== 'add' && !target.originalIntervalId && !target.targetCorrectionId) throw new Error(copy.noTarget)
      await save({ correctionSessionId: grantId, expectedRevision: revision, sessionId: session.id, studentId, kind, ...(kind === 'add' ? {} : target), ...(kind === 'void' ? {} : { inAt: new Date(start).getTime(), outAt: new Date(end).getTime() }), reason, key: key.current })
      setMessage(copy.saved)
    } catch (error) { setMessage(errorText(error)) } finally { setBusy(false) }
  }
  return <section className={styles.section}><h3>{session.title}</h3><p>{copy.review}</p>
    {!evidence ? <p role="status">{copy.loading}</p> : <>
      <h4>{copy.originals}</h4>{!evidence.intervals.length && <p>{copy.none}</p>}
      {evidence.intervals.map(row => <Button key={row.intervalId} variant={target.originalIntervalId === row.intervalId ? 'default' : 'outline'} disabled={busy} onClick={() => { setTarget({ originalIntervalId: row.intervalId }); setKind('replace'); setStart(local(row.inAt)); setEnd(local(row.outAt ?? session.end)) }}>{date(row.inAt)} — {row.outAt === null ? 'Open' : date(row.outAt)}</Button>)}
      <h4>{copy.corrections}</h4>{evidence.corrections.map(row => <div key={row.correctionId}><p>{copy[row.kind]}: {row.inAt === null ? '—' : date(row.inAt)} — {row.outAt === null ? '—' : date(row.outAt)} · {row.reason}</p>{row.kind === 'add' && <Button variant="outline" disabled={busy} onClick={() => { setTarget({ targetCorrectionId: row.correctionId }); setKind('replace'); setStart(local(row.inAt!)); setEnd(local(row.outAt!)) }}>{copy.replace}</Button>}</div>)}
    </>}
    <div className={styles.choices}>{(['add', 'replace', 'void'] as const).map(value => <Button key={value} variant={kind === value ? 'default' : 'outline'} disabled={busy} onClick={() => setKind(value)}>{copy[value]}</Button>)}</div>
    {kind !== 'void' && <div className={styles.fields}><label className={styles.field}>{copy.start}<Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} disabled={busy} /></label><label className={styles.field}>{copy.end}<Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} disabled={busy} /></label></div>}
    <label className={styles.field}>{copy.reason}<Input value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} disabled={busy} /></label>
    <Button variant="outline" disabled={busy} onClick={onReview}>{copy.reviewLatest}</Button>
    <Button disabled={busy || reason.trim().length < 5 || !evidence || message === copy.saved} onClick={() => void submit()}>{copy.save}</Button>{message && <p role="status">{message}</p>}
  </section>
}

export function HistoricalAttendance({ seasonId }: { seasonId: Id<'seasons'> }) {
  const open = useMutation(api.historicalCorrections.open); const close = useMutation(api.historicalCorrections.close)
  const students = usePaginatedQuery(api.seasonHistory.roster, { seasonId }, { initialNumItems: 20 })
  const sessions = usePaginatedQuery(api.historicalCorrections.sessions, { seasonId }, { initialNumItems: 20 })
  const [grant, setGrant] = useState<{ id: Id<'historicalCorrectionSessions'>; expiresAt: number } | null>(null)
  const [studentId, setStudentId] = useState<Id<'students'> | null>(null); const [session, setSession] = useState<Session | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [reason, setReason] = useState(''); const [acknowledged, setAcknowledged] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const toggle = async () => { setBusy(true); setError(''); try { if (grant) { await close({ correctionSessionId: grant.id }); setGrant(null) } else setGrant(await open({ seasonId, reason, acknowledged })) } catch (e) { setError(errorText(e)) } finally { setBusy(false) } }
  return <section className={styles.section}><h3>{copy.title}</h3><p>{copy.warning}</p>
    {!grant ? <><label className={styles.field}>{copy.reason}<Input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label><label><Checkbox checked={acknowledged} onCheckedChange={setAcknowledged} /> {copy.acknowledge}</label><Button disabled={busy || !acknowledged || reason.trim().length < 8} onClick={() => void toggle()}>{copy.open}</Button></> : <><p>{copy.accessUntil}: {date(grant.expiresAt)}</p><Button variant="outline" disabled={busy} onClick={() => void toggle()}>{copy.close}</Button><h4>{copy.chooseStudent}</h4><div className={styles.choices}>{students.results.map(row => <Button key={row.id} variant={studentId === row.id ? 'default' : 'outline'} onClick={() => setStudentId(row.id)}>{row.name}</Button>)}</div>{students.status === 'CanLoadMore' && <Button onClick={() => students.loadMore(20)}>{copy.more}</Button>}{studentId && <HistoricalRosterCorrection seasonId={seasonId} studentId={studentId} grantId={grant.id}/>}{studentId && <HistoricalFinancialCorrections seasonId={seasonId} studentId={studentId} grantId={grant.id}/>}<h4>{copy.chooseSession}</h4><div className={styles.choices}>{sessions.results.map(row => <Button key={row.id} variant={session?.id === row.id ? 'default' : 'outline'} disabled={row.state === 'open'} onClick={() => setSession(row)}>{row.title} · {date(row.start)}</Button>)}</div>{sessions.status === 'LoadingFirstPage' && <p>{copy.loading}</p>}{sessions.status === 'Exhausted' && !sessions.results.length && <p>{copy.empty}</p>}{sessions.status === 'CanLoadMore' && <Button onClick={() => sessions.loadMore(20)}>{copy.more}</Button>}{studentId && session && <CorrectionForm key={`${grant.id}:${studentId}:${session.id}:${formVersion}`} grantId={grant.id} studentId={studentId} session={session} onReview={() => { const latest = sessions.results.find(row => row.id === session.id); if (latest) { setSession(latest); setFormVersion(value => value + 1) } }} />}</>}{error && <p role="alert">{error}</p>}
  </section>
}
