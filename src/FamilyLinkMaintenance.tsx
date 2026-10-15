import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { familyLinkMaintenanceCopy as copy } from './lib/family-link-maintenance-copy'

export function FamilyLinkMaintenance() {
  const [attempt, setAttempt] = useState(0)
  return <MaintenanceBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}><MaintenanceContent/></MaintenanceBoundary>
}
class MaintenanceBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Card><CardContent><p role="alert">{copy.unavailable}</p><Button type="button" variant="outline" onClick={this.props.onRetry}>{copy.recover}</Button></CardContent></Card> : this.props.children }
}
function MaintenanceContent() {
  const status = useQuery(api.familyLinkSeasonMigration.status, {})
  const start = useMutation(api.familyLinkSeasonMigration.start)
  const retry = useMutation(api.familyLinkSeasonMigration.retry)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const retryValid = reason.trim().length >= 8 && reason.trim().length <= 500
  if (status?.state === 'complete' && status.unresolved === 0) return null
  async function request(event?: FormEvent) {
    event?.preventDefault()
    if (pending.current || status === undefined || status?.state === 'running' || status?.state === 'complete' || status?.state === 'failed' && !retryValid) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (status?.state === 'failed') await retry({ reason: reason.trim() })
      else await start({})
      if (mounted.current) { setNotice(copy.requested); setReason('') }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : copy.error) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <Card><CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
    <p>{copy.description}</p>
    {status === undefined ? <p role="status">{copy.loading}</p> : <>
      {!status || status.state === 'pending' ? <p>{copy.pending}</p> : status.state === 'complete' ? <p role="status">{status.unresolved} family link{status.unresolved===1?'':'s'} need attention.</p> : status.state === 'failed' ? <p role="alert">{copy.failed}</p> : <p role="status">{copy.running} {status.phase === 'backfill' ? copy.backfill : copy.verify}.</p>}
      {status && status.state !== 'complete' && <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1"><dt>{copy.scanned}</dt><dd>{status.scanned}</dd><dt>{copy.unresolved}</dt><dd>{status.unresolved}</dd></dl>}
      {(!status || status.state === 'pending') && <Button className="self-start" type="button" disabled={busy} onClick={() => void request()}>{busy ? copy.starting : copy.start}</Button>}
      {status?.state === 'failed' && <>
        {status.lastError && <p role="alert">{status.lastError}</p>}
        <form className="flex flex-col gap-2" onSubmit={event => void request(event)}>
          <label className="flex flex-col gap-1">{copy.retryReason}<Input value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={500} required disabled={busy}/></label>
          <p className="text-sm text-muted-foreground">{copy.reasonHelp}</p>
          <Button className="self-start" type="submit" disabled={busy || !retryValid}>{busy ? copy.starting : copy.retry}</Button>
        </form>
      </>}
    </>}
    {error && <p role="alert">{error}</p>}{notice && status?.state !== 'complete' && <p role="status">{notice}</p>}
  </CardContent></Card>
}
