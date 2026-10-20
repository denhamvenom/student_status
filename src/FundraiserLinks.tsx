import { useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { CreditCard, Share2 } from 'lucide-react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button, buttonVariants } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { shareFundraiser } from './lib/share-fundraiser'
import styles from './FundraiserLinks.module.css'

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

type LinkRow = typeof api.fundraiserLinks.list._returnType['page'][number]
function StudentLinkEditor({ row }: { row: LinkRow }) {
  const save = useMutation(api.fundraiserLinks.save)
  const [url, setUrl] = useState(row.url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className={styles.editor} onSubmit={event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('')
    void save({ studentId: row.studentId, url: url.trim(), expectedRevision: row.revision }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not save the fundraiser link.')).finally(() => setBusy(false))
  }}>
    <label className={styles.linkLabel}>{row.name}<Input aria-label={`${row.name} fundraiser link`} type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.zeffy.com/…" disabled={busy} /></label>
    <Button type="submit" variant="outline" disabled={busy || url.trim() === (row.url ?? '')}>{busy ? 'Saving…' : 'Save link'}</Button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </form>
}

export function FundraiserLinkSettings() {
  const links = usePaginatedQuery(api.fundraiserLinks.list, {}, { initialNumItems: 25 })
  return <Card><CardHeader><CardTitle>Student fundraiser links</CardTitle></CardHeader><CardContent className={styles.content}>
    <p className={styles.note}>Add each student’s Zeffy fundraiser link. Their linked parents use the same link. Clear a link and save to hide Pay Now and Share.</p>
    {links.results.map(row => <StudentLinkEditor key={`${row.studentId}:${row.revision}`} row={row} />)}
    {links.status === 'LoadingFirstPage' ? <p role="status">Loading students…</p> : !links.results.length && <p>No active students in this season.</p>}
    {links.status !== 'Exhausted' && <Button type="button" variant="outline" disabled={links.status !== 'CanLoadMore'} onClick={() => links.loadMore(25)}>Load more students</Button>}
  </CardContent></Card>
}
