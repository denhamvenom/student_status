import { useEffect, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { ConfirmAction } from './ConfirmAction'
import { downloadInviteCsv, inviteCsv, MAX_INVITE_CSV_BYTES, parseInviteCsv, type InviteCsvRow } from './lib/bulk-invite-csv'
import styles from './BulkInvite.module.css'

type Decision = { resolution: 'skip' | 'create' | 'link'; existingStudentId?: Id<'students'>; confirmDuplicate?: boolean }
const shortDate = (value: number) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const expiry = (value: number | null) => value === null ? 'Season close' : shortDate(value)

function BatchDetails({ batchId }: { batchId: Id<'bulkInviteBatches'> }) {
  const [asOf, setAsOf] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setAsOf(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const detail = useQuery(api.bulkInvites.batchDetail, { batchId, asOf })
  const revoke = useMutation(api.bulkInvites.revoke)
  const replace = useMutation(api.bulkInvites.replace)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!detail) return <p className="muted">Loading invitations…</p>
  const usable = (invite: { status: string; code: string | null; expiresAt: number | null }) => invite.status === 'pending' && !!invite.code && (invite.expiresAt === null || invite.expiresAt > Date.now())
  const unused = detail.invites.filter(usable)
  const download = () => {
    const current = detail.invites.filter(usable)
    if (!current.length) return
    downloadInviteCsv(`student-invitations-${shortDate(detail.createdAt).replaceAll(' ', '-')}.csv`, inviteCsv(current.map(invite => ({ firstName: invite.firstName, lastName: invite.lastName, code: invite.code ?? '' })), true))
  }
  async function change(inviteId: Id<'bulkStudentInvites'>, expectedCode: string, kind: 'revoke' | 'replace') {
    setBusy(inviteId); setError('')
    try {
      if (kind === 'revoke') await revoke({ inviteId, expectedCode })
      else await replace({ inviteId, expectedCode })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(null) }
  }
  return <div className={styles.details}>
    <div className={styles.batchSummary}><span>{detail.invites.length} invitations · {unused.length} usable codes · Valid until {expiry(detail.expiresAt)}</span><Button variant="outline" disabled={!unused.length} onClick={download}>Download unused codes</Button></div>
    <div className="table-wrap"><table><thead><tr><th>Student</th><th>Code</th><th>Status</th><th>Actions</th></tr></thead><tbody>{detail.invites.map(invite => <tr key={invite.inviteId}><td data-label="Student">{invite.studentName}</td><td data-label="Code" className={styles.code}>{usable(invite) ? invite.code : '—'}</td><td data-label="Status">{invite.status === 'pending' && !usable(invite) ? 'Expired' : invite.status}</td><td data-label="Actions">{usable(invite) && <div className={styles.rowActions}><ConfirmAction disabled={busy !== null} description={`Revoke the unused code for ${invite.studentName}? It will no longer connect an account.`} onConfirm={() => change(invite.inviteId, invite.code ?? '', 'revoke')}>Revoke</ConfirmAction><ConfirmAction disabled={busy !== null} description={`Replace the unused code for ${invite.studentName}? The old code will stop working.`} onConfirm={() => change(invite.inviteId, invite.code ?? '', 'replace')}>Replace</ConfirmAction></div>}{busy === invite.inviteId && <span className="muted">Updating…</span>}</td></tr>)}</tbody></table></div>
    {error && <p role="alert" className="open-text">{error}</p>}
  </div>
}

export function BulkInvite() {
  const [rows, setRows] = useState<InviteCsvRow[]>([])
  const [filename, setFilename] = useState('')
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<Id<'bulkInviteBatches'> | null>(null)
  const [createdBatch, setCreatedBatch] = useState<Id<'bulkInviteBatches'> | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const preview = useQuery(api.bulkInvites.preview, rows.length ? { students: rows } : 'skip')
  const batches = useQuery(api.bulkInvites.listBatches, {})
  const createBatch = useMutation(api.bulkInvites.createBatch)

  async function load(event: ChangeEvent<HTMLInputElement>) {
    setError(''); setConfirm(false); setRows([]); setDecisions({}); setCreatedBatch(null)
    const file = event.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    try {
      if (file.size > MAX_INVITE_CSV_BYTES) throw new Error('The CSV is too large. Use a file under 128 KB.')
      setRows(parseInviteCsv(await file.text()))
      setIdempotencyKey(crypto.randomUUID())
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    event.target.value = ''
  }

  function decision(index: number): Decision {
    const row = preview?.rows[index]
    return decisions[index] ?? (row?.duplicateInUpload || row?.matches.length ? { resolution: 'skip' } : { resolution: 'create' })
  }
  const entries = preview?.rows.map((row, index) => ({ firstName: row.firstName, lastName: row.lastName, ...decision(index) })) ?? []
  const toCreate = entries.filter(entry => entry.resolution !== 'skip').length
  const linkedIds = entries.filter(entry => entry.resolution === 'link').map(entry => entry.existingStudentId).filter(Boolean)
  const repeatedLink = new Set(linkedIds).size !== linkedIds.length
  const unresolved = repeatedLink || (preview?.rows.some((row, index) => {
    const choice = decision(index)
    return choice.resolution === 'link' && !choice.existingStudentId || choice.resolution === 'create' && (row.duplicateInUpload || row.matches.length > 0) && !choice.confirmDuplicate
  }) ?? true)

  async function submit() {
    if (!preview || unresolved || !toCreate) return
    setBusy(true); setError('')
    try {
      const result = await createBatch({ entries, idempotencyKey })
      setCreatedBatch(result.batchId)
      setSelectedBatch(result.batchId)
      setConfirm(false)
      setRows([])
      setDecisions({})
      setIdempotencyKey(crypto.randomUUID())
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  return <div className={styles.workspace}>
    <section className="card"><h2>Prepare invitations</h2><p>Upload student names to preview matches. No student records or codes are created until you confirm.</p><div className="action-row"><Button variant="outline" onClick={() => downloadInviteCsv('student-invite-template.csv', inviteCsv([]))}>Download CSV template</Button><label className={styles.upload}>Upload completed CSV<input aria-label="Upload student names CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => void load(event)} /></label></div><p className="muted tiny">Use the columns First Name,Last Name. Up to 100 students per file.</p>{filename && rows.length > 0 && <p role="status">{filename}: {rows.length} student{rows.length === 1 ? '' : 's'} ready to review.</p>}{error && <p role="alert" className="open-text">{error}</p>}</section>
    {rows.length > 0 && <section className="card" inert={busy} aria-busy={busy} onChangeCapture={() => setConfirm(false)}><h2>Review matches</h2>{!preview ? <p className="muted">Checking current student records…</p> : <><p>Choose how to handle each name. A match can be linked only when its student record has no connected account. Choose “New, distinct student” only when two students share a name.</p><div className={styles.reviewList}>{preview.rows.map((row, index) => { const choice = decision(index); const duplicate = row.duplicateInUpload || row.matches.length > 0; const unlinked = row.matches.filter(match => !match.linked && match.active); return <div className={styles.reviewRow} key={index}><div><strong>{index + 1}. {row.firstName} {row.lastName}</strong>{row.duplicateInUpload && <p className="open-text">This name appears more than once in the file.</p>}{row.matches.length > 0 && <p className="muted">Current records: {row.matches.map(match => `${match.legalName}${match.linked ? ' (connected)' : match.active ? ' (unlinked)' : ' (inactive)'}`).join(', ')}</p>}</div><div className={styles.choice}><label>Resolution<NativeSelect value={choice.resolution} onChange={event => { const resolution = event.target.value as Decision['resolution']; setDecisions(old => ({ ...old, [index]: resolution === 'link' ? { resolution, existingStudentId: unlinked[0]?.studentId } : { resolution } })); setConfirm(false) }}><NativeSelectOption value="skip">Skip</NativeSelectOption>{unlinked.length > 0 && <NativeSelectOption value="link">Link existing unconnected student</NativeSelectOption>}<NativeSelectOption value="create">{duplicate ? 'New, distinct student' : 'Create student'}</NativeSelectOption></NativeSelect></label>{choice.resolution === 'link' && <label>Student record<NativeSelect value={choice.existingStudentId ?? ''} onChange={event => setDecisions(old => ({ ...old, [index]: { resolution: 'link', existingStudentId: event.target.value as Id<'students'> } }))}>{unlinked.map(match => <NativeSelectOption key={match.studentId} value={match.studentId}>{match.legalName}{match.email ? ` · ${match.email}` : ''}</NativeSelectOption>)}</NativeSelect></label>}{choice.resolution === 'create' && duplicate && <label className={styles.confirmDuplicate}><input type="checkbox" checked={!!choice.confirmDuplicate} onChange={event => setDecisions(old => ({ ...old, [index]: { resolution: 'create', confirmDuplicate: event.target.checked } }))} />I confirm this is a distinct student</label>}</div></div> })}</div><div className="action-row"><Button className="button button-primary" disabled={unresolved || !toCreate} onClick={() => setConfirm(true)}>Review {toCreate} invitation{toCreate === 1 ? '' : 's'}</Button></div>{unresolved && <p className="muted">Resolve every selected match or same-name student before continuing.</p>}</>}</section>}
    {confirm && <section className="card"><h2>Confirm batch</h2><p>This will create {toCreate} student invitation{toCreate === 1 ? '' : 's'} and skip {entries.length - toCreate} row{entries.length - toCreate === 1 ? '' : 's'}. Give each code privately to the matching student.</p><div className="action-row"><Button className="button button-primary" disabled={busy || unresolved} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create invitations'}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Back to preview</Button></div></section>}
    {createdBatch && <p role="status" className={styles.success}>Invitations created. Download the codes below and give each one to its named student.</p>}
    <section className="card"><h2>Previous batches</h2>{!batches ? <p className="muted">Loading batches…</p> : batches.length ? <div className={styles.batchList}>{batches.map(batch => <div key={batch.batchId} className={styles.batch}><div><strong>{shortDate(batch.createdAt)}</strong><p className="muted">{batch.inviteCount} invited · {batch.connectedCount} connected · {batch.pendingCount} unredeemed · Valid until {expiry(batch.expiresAt)}</p></div><Button variant="outline" onClick={() => setSelectedBatch(selectedBatch === batch.batchId ? null : batch.batchId)}>{selectedBatch === batch.batchId ? 'Hide codes' : 'View codes'}</Button>{selectedBatch === batch.batchId && <BatchDetails batchId={batch.batchId} />}</div>)}</div> : <p className="muted">No invitation batches yet.</p>}</section>
  </div>
}
