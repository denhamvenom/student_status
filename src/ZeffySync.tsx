import { useState } from 'react'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { userFacingError } from './lib/error-message'
import { ConfirmAction } from './ConfirmAction'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import styles from './ZeffySync.module.css'

const chicagoDate = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago',
})

function dollars(cents: number) {
  if (!Number.isSafeInteger(cents)) return 'Amount needs review'
  const amount = BigInt(cents)
  const absolute = amount < 0n ? -amount : amount
  return `${amount < 0n ? '-' : ''}$${new Intl.NumberFormat('en-US').format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`
}

function when(value: number | null | undefined) {
  return value ? `${chicagoDate.format(value)} Central` : 'Never'
}

function outcome(value: string) {
  if (value === 'eligible') return 'Ready to record'
  if (value === 'unchanged') return 'Unchanged · no credit added'
  return 'Needs Coach review · no change'
}

/** Coach-only controls; the server independently enforces the Coach role. */
export function ZeffySync() {
  const status = useQuery(api.zeffy.status)
  const exceptions = usePaginatedQuery(api.zeffy.exceptionsPage, {}, { initialNumItems: 50 })
  const previewDonations = useAction(api.zeffyActions.preview)
  const run = useAction(api.zeffyActions.run)
  const setEnabled = useMutation(api.zeffy.setEnabled)
  const [preview, setPreview] = useState<typeof api.zeffyActions.preview._returnType | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const previewReady = !!preview?.safeToRun && preview.paymentCount === preview.rows.length

  async function review() {
    if (busy) return
    setBusy(true); setError(''); setNotice(''); setPreview(null)
    try {
      setPreview(await previewDonations({}))
    } catch (cause) { setError(userFacingError(cause, 'Could not preview Zeffy donations.')) }
    finally { setBusy(false) }
  }

  async function toggle(enabled: boolean) {
    await setEnabled({ enabled, reason: enabled
      ? 'Coach confirmed the Zeffy donation preview and enabled scheduled checks.'
      : 'Coach confirmed scheduled Zeffy checks should stop.' })
    setPreview(null)
    setNotice(enabled ? 'Automatic checks are on.' : 'Automatic checks are off.')
  }

  async function checkNow() {
    if (busy || !status?.enabled || !previewReady) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await run({})
      if (result.reason) setError(result.reason)
      else setNotice(result.started ? 'Check finished. Review the updated status and items needing review.' : 'A check could not start. Review the status and try again.')
      setPreview(null)
    } catch (cause) { setError(userFacingError(cause, 'Could not start a Zeffy check.')) }
    finally { setBusy(false) }
  }

  return <Card className={styles.card}>
    <CardHeader><CardTitle>Zeffy donation checks</CardTitle></CardHeader>
    <CardContent className={styles.content}>
      <p className={styles.muted}>Review donations before turning on automatic checks. Checks run at 7 AM and 7 PM Central time, including daylight saving changes. Existing student fundraiser links determine matches; update links in Student fundraiser links on this page.</p>
      {!status ? <p role="status">Loading Zeffy status…</p> : <>
        <dl className={styles.status}>
          <dt>Automatic checks</dt><dd>{status.enabled ? 'On' : 'Off'}</dd>
          <dt>Last successful check</dt><dd>{when(status.lastSuccessfulAt)}</dd>
          <dt>Current check</dt><dd>{status.running ? 'In progress' : 'Idle'}</dd>
          <dt>Last check</dt><dd>{status.lastRunAt ? `${when(status.lastRunAt)} · ${status.lastRunStatus === 'complete' ? 'Complete' : status.lastRunStatus === 'failed' ? 'Stopped' : 'In progress'}` : 'Never'}</dd>
        </dl>
        {status.lastSummary && <p className={styles.muted}>Last check: {status.lastSummary.credited} recorded · {status.lastSummary.unchanged} unchanged · {status.lastSummary.review} need review.</p>}
        {!status.configured && <p className={styles.notice}>Zeffy checks are not ready yet. A Coach can still see the current status here.</p>}
        {status.lastRunStatus === 'failed' && <p className={styles.error} role="alert">The last check stopped before completion. {status.lastError ?? 'Review the items below and try again.'}</p>}
        {exceptions.results.length > 0 && <section aria-label="Zeffy items needing review" className={styles.review}>
          <h3>Needs Coach review</h3>
          <ul>{exceptions.results.map(item => <li key={item._id}>{item.message}{item.paymentId ? <span className={styles.rowNote}>Zeffy payment reference: {item.paymentId}</span> : item.campaignId ? <span className={styles.rowNote}>Zeffy campaign reference: {item.campaignId}</span> : null}</li>)}</ul>
          {exceptions.status === 'CanLoadMore' && <Button type="button" variant="outline" onClick={() => exceptions.loadMore(50)}>Load more review items</Button>}
          {exceptions.status === 'LoadingMore' && <p role="status">Loading more review items…</p>}
          <p className={styles.muted}>Unmatched donations, changed payments and refunds stay in review. Financial records are not changed for these items.</p>
        </section>}
        <div className={styles.actions}>
          <Button type="button" variant="outline" disabled={busy || !status.configured} onClick={() => void review()}>{busy ? 'Working…' : 'Preview donations'}</Button>
          {status.enabled ? <>
            <Button type="button" disabled={busy || status.running || !previewReady} onClick={() => void checkNow()}>Check now</Button>
            <ConfirmAction disabled={busy} description="Turn off Zeffy automatic donation checks? Future 7 AM and 7 PM checks will stop. Existing financial records stay as they are." onConfirm={() => toggle(false)}>Turn off automatic checks</ConfirmAction>
          </> : <ConfirmAction disabled={busy || !status.configured || !previewReady} description="Turn on automatic Zeffy donation checks at 7 AM and 7 PM Central time? Only matched, eligible donations can be recorded automatically. Items needing review will not change financial records." onConfirm={() => toggle(true)}>Turn on automatic checks</ConfirmAction>}
        </div>
      </>}
      {preview && <section aria-label="Donation preview" className={styles.review}>
        <h3>Donation preview · no financial changes</h3>
        <p>{preview.eligibleCount} ready to record · {preview.reviewCount} need review · {preview.rows.filter(row => row.outcome === 'unchanged').length} unchanged</p>
        <p className={styles.muted}>Student links and donation details were checked here. Student financial readiness is checked again when a donation is recorded; any problem stays in Coach review.</p>
        {preview.paymentCount > preview.rows.length && <p className={styles.notice}>Only {preview.rows.length} of {preview.paymentCount} donations fit in this review. Ask for a complete review before turning on checks.</p>}
        {!preview.safeToRun && <p className={styles.notice}>Resolve the items needing review before starting checks.</p>}
        {preview.rows.length > 0 ? <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th scope="col">Student</th><th scope="col">Amount</th><th scope="col">Outcome</th></tr></thead>
          <tbody>{preview.rows.map(row => <tr key={row.paymentId}><td>{row.studentName ?? 'Unmatched'}</td><td>{dollars(row.amountCents)}</td><td>{outcome(row.outcome)}{row.message ? <span className={styles.rowNote}>{row.message}</span> : null}{row.outcome === 'review' ? <span className={styles.rowNote}>Zeffy payment reference: {row.paymentId}</span> : null}</td></tr>)}</tbody>
        </table></div> : <p>No donations found to review.</p>}
        {preview.exceptions.length > 0 && <ul>{preview.exceptions.map((item, index) => <li key={`${item.code}-${item.paymentId ?? item.campaignId ?? index}`}>{item.message}</li>)}</ul>}
      </section>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </CardContent>
  </Card>
}
