import { userFacingError } from '@/lib/error-message'
import { useState } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { CreditCard, Share2 } from 'lucide-react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button, buttonVariants } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { shareFundraiser } from './lib/share-fundraiser'
import styles from './FundraiserLinks.module.css'
import { collectFundraiserExport, fundraiserCsv, parseFundraiserCsv, FUNDRAISER_CSV_BYTES, type FundraiserCsvRow } from './lib/fundraiser-csv'
import { downloadInviteCsv } from './lib/bulk-invite-csv'

export function FamilyFundraiserLink({ studentId }: { studentId: Id<'students'> }) {
  const url = useQuery(api.fundraiserLinks.forStudent, { studentId })
  return url ? <FundraiserActions key={`${studentId}:${url}`} url={url} /> : null
}

export function FundraiserActions({ url }: { url: string }) {
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)
  async function share() {
    if (busy) return
    setBusy(true); setMessage(''); setManual(false)
    try {
      const result = await shareFundraiser(url)
      setManual(result === 'manual')
      setMessage(result === 'copied' ? 'Fundraiser link copied.' : result === 'shared' ? 'Fundraiser shared.' : result === 'manual' ? 'Copy the link below to share it.' : '')
    } finally { setBusy(false) }
  }
  return <Card><CardHeader><CardTitle>Your fundraiser</CardTitle></CardHeader><CardContent className={styles.content}>
    <div className={styles.actions}>
      <a className={buttonVariants({ size: 'lg' })} href={url} target="_blank" rel="noopener noreferrer"><CreditCard size={24} aria-hidden="true" />Pay Now</a>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void share()}><Share2 size={20} aria-hidden="true" />Share fundraiser</Button>
    </div>
    <p className={styles.note}>Pay Now opens your fundraiser on Zeffy.</p>
    {message && <p role="status">{message}</p>}
    {manual && <label>Fundraiser link<Input readOnly value={url} onFocus={event => event.target.select()} /></label>}
  </CardContent></Card>
}


type PreviewRow = typeof api.fundraiserLinks.previewImport._returnType[number]
export function FundraiserLinkSettings() {
  const convex = useConvex()
  const apply = useMutation(api.fundraiserLinks.importLinks)
  const [rows, setRows] = useState<FundraiserCsvRow[]>([])
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const args = (items: FundraiserCsvRow[]) => ({ rows: items.map(row => ({ studentId: row.studentId as Id<'students'>, url: row.url ?? '', expectedRevision: row.revision })) })
  async function exportCsv() {
    setBusy(true); setError(''); setMessage(''); setPreview(null); setRows([])
    try {
      const exported = await collectFundraiserExport(cursor => convex.query(api.fundraiserLinks.list, { paginationOpts: { cursor, numItems: 100 } }))
      if (!exported.length) throw new Error('No active students in this season.')
      downloadInviteCsv('student-fundraiser-links.csv', fundraiserCsv(exported))
      setMessage(`Exported ${exported.length} students. Edit Fundraiser Link, then upload the CSV to review.`)
    } catch (cause) { setError(userFacingError(cause, 'Could not export links.')) }
    finally { setBusy(false) }
  }
  async function review(file: File) {
    setBusy(true); setError(''); setMessage(''); setPreview(null); setRows([])
    try {
      if (file.size > FUNDRAISER_CSV_BYTES) throw new Error('Use a CSV under 2 MB.')
      const parsed = parseFundraiserCsv(await file.text())
      const checked = await convex.query(api.fundraiserLinks.previewImport, args(parsed))
      setRows(parsed); setPreview(checked)
    } catch (cause) { setError(userFacingError(cause, 'Could not review this CSV.')) }
    finally { setBusy(false) }
  }
  async function saveImport() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await apply(args(rows))
      setMessage(`Import complete: ${result.updated} updated; ${result.unchanged} unchanged. Download a fresh CSV before your next edit.`)
      setPreview(null); setRows([])
    } catch (cause) {
      setError(userFacingError(cause, 'Could not import links. No links were changed.'))
      setPreview(null); setRows([])
    } finally { setBusy(false) }
  }
  const changed = preview?.filter(row => row.changed) ?? []
  const cleared = changed.filter(row => !row.after).length
  return <Card><CardHeader><CardTitle>Student fundraiser links</CardTitle></CardHeader><CardContent className={styles.content}>
    <p className={styles.note}>Download the current student CSV, edit only Fundraiser Link, then upload it to review. Use HTTPS Zeffy links. Each student’s linked parents use the same link.</p>
    <p className={styles.note}>A blank Fundraiser Link removes an existing link and hides Pay Now and Share. Keep Student ID and Link Revision unchanged. Import up to 500 students at a time; remove other rows from larger exports. Students omitted from a file stay unchanged.</p>
    <div className={styles.actions}><Button type="button" variant="outline" disabled={busy} onClick={() => void exportCsv()}>Download current CSV</Button></div>
    <label>Upload fundraiser CSV<Input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void review(file) }} /></label>
    {busy && <p role="status">Working…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {preview && <section aria-label="Review fundraiser import" className={styles.content}>
      <h3>Review fundraiser import</h3>
      <p>{changed.length - cleared} links to connect or update; {cleared} links to remove; {preview.length - changed.length} unchanged.</p>
      <p className={styles.note}>Names below come from the current student records. Confirm each link belongs to the named student.</p>
      <div style={{ maxHeight: 320, overflow: 'auto' }}><table><thead><tr><th>Student</th><th>Current link</th><th>New link</th></tr></thead><tbody>{changed.map(row => <tr key={row.studentId}><td>{row.name}</td><td style={{ overflowWrap: 'anywhere' }}>{row.before ?? 'Disconnected'}</td><td style={{ overflowWrap: 'anywhere' }}>{row.after ?? 'Remove link'}</td></tr>)}</tbody></table></div>
      {!changed.length && <p>No link changes to apply.</p>}
      <div className={styles.actions}><Button type="button" disabled={busy || !changed.length} onClick={() => void saveImport()}>Apply {changed.length} changes</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setPreview(null); setRows([]) }}>Cancel import</Button></div>
    </section>}
  </CardContent></Card>
}
