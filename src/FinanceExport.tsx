import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { collectFinanceExport } from './lib/collect-finance-export'
import { financeExportCopy as copy } from './lib/finance-export-copy'

type Props = { selectedStudentId?: Id<'students'>; selectedStudentName?: string; disabled?: boolean }
export function FinanceExport(props: Props) {
  const [attempt, setAttempt] = useState(0)
  return <ExportBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}><ExportContent key={props.selectedStudentId ?? 'all'} {...props}/></ExportBoundary>
}
class ExportBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Card><CardContent><p role="alert">{copy.unavailable}</p><Button type="button" variant="outline" onClick={this.props.onRetry}>{copy.recover}</Button></CardContent></Card> : this.props.children }
}
function ExportContent({ selectedStudentId, selectedStudentName, disabled = false }: Props) {
  const client = useConvex()
  const prepare = useMutation(api.financeExport.prepare)
  const retry = useMutation(api.financeExport.retry)
  const [scope, setScope] = useState<'allActive' | 'selected'>(selectedStudentId ? 'selected' : 'allActive')
  const [jobId, setJobId] = useState<Id<'financeExportJobs'> | null>(null)
  const job = useQuery(api.financeExport.status, jobId ? { jobId } : 'skip')
  const [busy, setBusy] = useState<'prepare' | 'download' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expiredJob, setExpiredJob] = useState<Id<'financeExportJobs'> | null>(null)
  useEffect(() => { if (!job) return; const timer = window.setTimeout(() => setExpiredJob(job.jobId), Math.max(0, job.expiresAt - Date.now())); return () => window.clearTimeout(timer) }, [job])
  const expired = job?.state === 'expired' || Boolean(job && expiredJob === job.jobId)
  const pending = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  async function start(resume = false) {
    if (pending.current || disabled) return
    pending.current = true; setBusy('prepare'); setError(''); setNotice('')
    try {
      if (resume && jobId) await retry({ jobId })
      else {
        const id = await prepare({ scope, ...(scope === 'selected' && selectedStudentId ? { studentIds: [selectedStudentId] } : {}), idempotencyKey: crypto.randomUUID() })
        if (mounted.current) setJobId(id)
      }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : copy.failed) }
    finally { pending.current = false; if (mounted.current) setBusy(null) }
  }
  async function download(kind: 'csv' | 'manifest') {
    if (pending.current || disabled || job?.state !== 'ready' || expired || !jobId) return
    pending.current = true; setBusy('download'); setError(''); setNotice('')
    const abort = new AbortController(); controller.current = abort
    try {
      const paginationOpts = (cursor: string | null) => ({ numItems: 20, cursor })
      const result = await collectFinanceExport({
        members: cursor => client.mutation(api.financeExport.members, { jobId, paginationOpts: paginationOpts(cursor) }),
        charges: (studentId, cursor) => client.mutation(api.financeExport.charges, { jobId, studentId: studentId as Id<'students'>, paginationOpts: paginationOpts(cursor) }),
        verify: cursor => client.mutation(api.financeExport.verify, { jobId, paginationOpts: paginationOpts(cursor) }),
      }, { scopeHash: job.scopeHash, memberCount: job.memberCount, columns: job.columns }, abort.signal)
      abort.signal.throwIfAborted()
      if (!mounted.current) return
      const manifest = { ...result.manifest, seasonId: job.seasonId, scope: job.scope, preparedAt: job.createdAt, membershipPreparedAt: job.completedAt, consistency: copy.range, nonAdditiveColumns: ['personalAvailableCents', 'fundraisingAvailableCents'] }
      const blob = new Blob([kind === 'csv' ? `\uFEFF${result.csv}` : JSON.stringify(manifest, null, 2)], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `student-finances-${job.seasonId}-${kind === 'csv' ? 'charges.csv' : 'manifest.json'}`
      document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(copy.completed)
    } catch (error) { if (mounted.current) setError(abort.signal.aborted ? copy.cancelled : error instanceof Error ? error.message : copy.failed) }
    finally { pending.current = false; controller.current = null; if (mounted.current) setBusy(null) }
  }
  const capturing = job?.state === 'preparing'
  return <Card><CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
    <p>{copy.description}</p>
    <label className="flex flex-col gap-1">{copy.scope}<NativeSelect value={scope} disabled={Boolean(busy) || capturing || disabled} onChange={event => { controller.current?.abort(); setScope(event.target.value as 'allActive' | 'selected'); setJobId(null); setError(''); setNotice('') }}>
      <NativeSelectOption value="allActive">{copy.allActive}</NativeSelectOption>
      {selectedStudentId && <NativeSelectOption value="selected">{selectedStudentName || copy.selected}</NativeSelectOption>}
    </NativeSelect></label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={Boolean(busy) || capturing || disabled} onClick={() => void start()}>{busy === 'prepare' ? copy.preparing : jobId ? copy.fresh : copy.prepare}</Button>
      {job?.state === 'failed' && !expired && <Button type="button" variant="outline" disabled={Boolean(busy) || disabled} onClick={() => void start(true)}>{copy.retry}</Button>}
      {job?.state === 'ready' && !expired && <><Button type="button" disabled={Boolean(busy) || disabled} onClick={() => void download('csv')}>{copy.csv}</Button><Button type="button" variant="outline" disabled={Boolean(busy) || disabled} onClick={() => void download('manifest')}>{copy.manifest}</Button></>}
      {busy === 'download' && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>{copy.cancel}</Button>}
    </div>
    {jobId && !job && <p role="status">{copy.loading}</p>}
    {capturing && <p role="status">{copy.preparing} {copy.members}: {job.memberCount}</p>}
    {job?.state === 'ready' && !expired && <p>{copy.ready}. {copy.members}: {job.memberCount}</p>}
    {expired && <p role="alert">{copy.expired}</p>}
    {job?.state === 'failed' && !expired && <p role="alert">{job.lastError || copy.failed}</p>}
    {busy === 'download' && <p role="status">{copy.collecting}</p>}
    <p className="text-sm text-muted-foreground">{copy.metadata}</p><p className="text-sm text-muted-foreground">{copy.range}</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </CardContent></Card>
}
