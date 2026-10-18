import { driverReconciliationCopy as copy } from './lib/adult-profile-copy'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import styles from './DriverOwnerReconciliation.module.css'

type Candidate = NonNullable<ReturnType<typeof useQuery<typeof api.adultProfile.ownerReconciliationCandidates>>>[number]

function CandidateLink({ candidate }: { candidate: Candidate }) {
  const link = useMutation(api.adultProfile.linkDriverOwner)
  const [reviewed, setReviewed] = useState({ fingerprint: candidate.driverFingerprint, revision: candidate.profileRevision })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stale = reviewed.fingerprint !== candidate.driverFingerprint || reviewed.revision !== candidate.profileRevision
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || stale || reason.trim().length < 10) return
    setBusy(true); setError('')
    try {
      await link({ driverId: candidate.driverId, mentorId: candidate.mentorId, expectedDriverFingerprint: reviewed.fingerprint, expectedProfileRevision: reviewed.revision, reason })
      setReason('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failed) }
    finally { setBusy(false) }
  }
  return <form className={styles.row} onSubmit={event => void submit(event)}>
    <div><strong>{candidate.driverName}</strong><span>{candidate.email}</span></div>
    <div><span>{copy.matchingMentor}</span><strong>{candidate.mentorName}</strong></div>
    <p>{copy.linkNote}</p>
    {stale && <p role="alert">{copy.stale}</p>}
    <label>{copy.reason}<Input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required disabled={busy || stale} /></label>
    <div className={styles.actions}>{stale && <Button type="button" variant="outline" onClick={() => { setReviewed({ fingerprint: candidate.driverFingerprint, revision: candidate.profileRevision }); setReason(''); setError('') }}>{copy.review}</Button>}<Button type="submit" disabled={busy || stale || reason.trim().length < 10}>{busy ? copy.linking : copy.link}</Button></div>
    {error && <p role="alert">{error}</p>}
  </form>
}

/** Coach-only server data and action. Root may mount this panel in Drivers. */
export function DriverOwnerReconciliation() {
  const candidates = useQuery(api.adultProfile.ownerReconciliationCandidates, {})
  if (candidates === undefined) return <p role="status">{copy.loading}</p>
  return <section className={styles.panel} aria-labelledby="driver-reconciliation-title"><h2 id="driver-reconciliation-title">{copy.title}</h2><p>{copy.description}</p>{candidates.length === 0 ? <p>{copy.empty}</p> : candidates.map(candidate => <CandidateLink key={`${candidate.driverId}:${candidate.mentorId}`} candidate={candidate} />)}</section>
}
