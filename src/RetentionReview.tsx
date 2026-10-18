import { Component, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Textarea } from './components/ui/textarea'
import { retentionCopy as copy, retentionStatus } from './lib/retention-copy'
import { retentionDraftCurrent, startRetentionDraft, type RetentionDraft } from './lib/retention-draft'
import styles from './RetentionReview.module.css'

type Subject = { kind: 'student'; id: Id<'students'> } | { kind: 'account'; id: Id<'appUsers'> }
type Candidate = {
  kind: 'student' | 'account'
  id: Id<'students'> | Id<'appUsers'>
  label: string
  role: string | null
  archivedAt: number | null
  latestRelevantArchiveAt: number | null
  reviewAfter: number | null
  status: 'review' | 'waiting' | 'active' | 'archiveDateMissing' | 'linkedAccountActive' | 'linkedArchiveDateMissing'
  held: boolean
}

function date(value: number | null) {
  return value === null ? copy.unknown : new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function dateTime(value: number) {
  return `${new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : copy.failed }

function CandidateList({ rows, status, loadMore, onOpen }: {
  rows: ReadonlyArray<Candidate>
  status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'
  loadMore: (count: number) => void
  onOpen: (subject: Subject) => void
}) {
  if (status === 'LoadingFirstPage') return <p role="status">{copy.loading}</p>
  return <div className={styles.list}>
    {rows.length === 0 ? <p className={styles.muted}>{copy.noRecords}</p> : rows.map(item => <div className={styles.row} key={`${item.kind}:${item.id}`}>
      <div className={styles.name}><strong>{item.label}</strong><span className={styles.muted}>{item.role ? `${item.role} · ` : ''}{copy.archived}: {date(item.archivedAt)}</span></div>
      <div className={styles.meta}><span>{retentionStatus(item.status)}</span><span className={item.held ? styles.held : styles.muted}>{item.held ? copy.held : copy.unheld}</span></div>
      <Button type="button" variant="outline" onClick={() => onOpen(item.kind === 'student' ? { kind: 'student', id: item.id as Id<'students'> } : { kind: 'account', id: item.id as Id<'appUsers'> })}>{copy.open}</Button>
    </div>)}
    {status !== 'Exhausted' && <Button type="button" variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(20)}>{status === 'LoadingMore' ? copy.loadingMore : copy.loadMore}</Button>}
  </div>
}

function ReviewDialog({ subject, asOf, close }: { subject: Subject; asOf: number; close: () => void }) {
  const preview = useQuery(api.retentionReview.preview, { subject, asOf })
  const { results: history, status: historyStatus, loadMore } = usePaginatedQuery(api.retentionReview.history, { subject }, { initialNumItems: 10 })
  const setHold = useMutation(api.retentionReview.setHold)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [draft, setDraft] = useState<RetentionDraft | null>(null)
  useEffect(() => {
    if (preview && draft === null) setDraft(startRetentionDraft(preview.candidate))
  }, [preview, draft])
  const staleDraft = !!(draft && preview && !retentionDraftCurrent(draft, preview.candidate))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || !preview || staleDraft || busy || !reason.trim()) return
    setBusy(true); setError(''); setSaved(false)
    try {
      await setHold({ subject, expectedArchiveFingerprint: draft.fingerprint, expectedLatestHoldEventId: draft.latestEventId as Id<'retentionHoldEvents'> | null, action: draft.action, reason: reason.trim() })
      setReason(''); setSaved(true)
    } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close() }}><DialogContent showCloseButton={!busy} className={styles.detail}>
    <DialogHeader><DialogTitle>{preview ? preview.candidate.label : copy.open}</DialogTitle><DialogDescription>{copy.description}</DialogDescription></DialogHeader>
    {preview === undefined ? <p role="status">{copy.loading}</p> : <>
      <dl className={styles.facts}>
        <div><dt>{copy.archived}</dt><dd>{date(preview.candidate.archivedAt)}</dd></div>
        <div><dt>{copy.latestArchive}</dt><dd>{date(preview.candidate.latestRelevantArchiveAt)}</dd></div>
        <div><dt>{copy.reviewAfter}</dt><dd>{date(preview.candidate.reviewAfter)}</dd></div>
        <div><dt>{copy.status}</dt><dd>{retentionStatus(preview.candidate.status)}</dd></div>
      </dl>
      <p className={preview.candidate.held ? styles.held : styles.muted}>{preview.candidate.held ? copy.held : copy.unheld}</p>
      <section className={styles.notice} aria-label={copy.policyStatus}><p>{copy.unresolved}</p><p><strong>{copy.disabled}</strong></p></section>
      <section><h3>{copy.affected}</h3><ul className={styles.classes}>{preview.affectedRecordClasses.map(name => <li key={name}>{name}</li>)}</ul></section>
      {draft && <form className={styles.form} onSubmit={event => void submit(event)}>
        <label>{copy.reason}<Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required disabled={busy} /></label>
        <p className={styles.muted}>{copy.reasonHelp}</p>
        {staleDraft && <p role="alert">{copy.staleDraft}</p>}
        <Button type="submit" disabled={busy || staleDraft || !reason.trim()}>{busy ? copy.saving : draft.action === 'release' ? copy.release : copy.hold}</Button>
      </form>}
      {error && <p role="alert">{error}</p>}{saved && <p role="status">{copy.saved}</p>}
      <section className={styles.history}><h3>{copy.history}</h3>
        {historyStatus === 'LoadingFirstPage' ? <p role="status">{copy.loading}</p> : history.length === 0 ? <p className={styles.muted}>{copy.noHistory}</p> : history.map(item => <div className={styles.historyItem} key={item.id}><strong>{item.action === 'hold' ? copy.hold : copy.release}</strong><p>{item.reason}</p><span className={styles.muted}>{item.actorName} · {dateTime(item.recordedAt)} · {copy.archived}: {date(item.archivedAt)}</span></div>)}
        {historyStatus !== 'Exhausted' && historyStatus !== 'LoadingFirstPage' && <Button type="button" variant="outline" disabled={historyStatus === 'LoadingMore'} onClick={() => loadMore(10)}>{historyStatus === 'LoadingMore' ? copy.loadingMore : copy.loadMore}</Button>}
      </section>
      <Button type="button" variant="outline" onClick={close} disabled={busy}>{copy.close}</Button>
    </>}
  </DialogContent></Dialog>
}

/** Coach route content. Parent routing must restrict this component to Coach. Server APIs enforce the same role. */
function RetentionContent() {
  const [kind, setKind] = useState<'student' | 'account'>('student')
  const [asOf, setAsOf] = useState(() => Date.now())
  const [selected, setSelected] = useState<Subject | null>(null)
  const studentList = usePaginatedQuery(api.retentionReview.students, kind === 'student' ? { asOf } : 'skip', { initialNumItems: 20 })
  const accountList = usePaginatedQuery(api.retentionReview.accounts, kind === 'account' ? { asOf } : 'skip', { initialNumItems: 20 })
  const list = kind === 'student' ? studentList : accountList
  return <div className={styles.page}>
    <div className={styles.header}><div><h1>{copy.title}</h1><p>{copy.description}</p><p className={styles.muted}>{copy.asOf} {date(asOf)}</p></div><Button type="button" variant="outline" onClick={() => setAsOf(Date.now())}>{copy.refresh}</Button></div>
    <Card><CardHeader><CardTitle>{kind === 'student' ? copy.students : copy.accounts}</CardTitle><CardDescription>{copy.disabled}</CardDescription></CardHeader><CardContent>
      <div className={styles.tabs} role="group" aria-label={copy.recordType}><Button type="button" variant={kind === 'student' ? 'default' : 'outline'} aria-pressed={kind === 'student'} onClick={() => setKind('student')}>{copy.students}</Button><Button type="button" variant={kind === 'account' ? 'default' : 'outline'} aria-pressed={kind === 'account'} onClick={() => setKind('account')}>{copy.accounts}</Button></div>
      <CandidateList rows={list.results} status={list.status} loadMore={list.loadMore} onOpen={setSelected} />
    </CardContent></Card>
    {selected && <ReviewDialog key={`${selected.kind}:${selected.id}`} subject={selected} asOf={asOf} close={() => setSelected(null)} />}
  </div>
}

class RetentionBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <section role="alert"><h1>{copy.title}</h1><p>{copy.failed}</p><Button type="button" onClick={this.props.retry}>{copy.retry}</Button></section> : this.props.children
  }
}

export function RetentionReview() {
  const [attempt, setAttempt] = useState(0)
  return <RetentionBoundary key={attempt} retry={() => setAttempt(value => value + 1)}><RetentionContent /></RetentionBoundary>
}
