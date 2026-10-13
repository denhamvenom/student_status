import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { eventCopy } from './lib/event-copy'

export function EventEnrollmentNotice({ eventId, staff, coach, failed }: { eventId: Id<'events'>; staff: boolean; coach: boolean; failed: boolean }) {
  const progress = useQuery(api.eventEnrollment.status, staff ? { eventId } : 'skip')
  const retry = useMutation(api.eventEnrollment.retry)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = eventCopy.enrollment
  async function retryEnrollment() {
    setBusy(true)
    setError(null)
    try { await retry({ eventId }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : copy.retryError) }
    finally { setBusy(false) }
  }
  return <Card aria-live="polite">
    <CardHeader><CardTitle>{failed ? copy.failed : copy.running}</CardTitle></CardHeader>
    <CardContent>
      <p>{copy.description}</p>
      {progress && <p>{copy.progress(progress.processed, progress.assigned)}</p>}
      {staff && progress?.lastError && <p role="alert">{progress.lastError}</p>}
      {failed && coach && <Button disabled={busy} onClick={() => void retryEnrollment()}>{busy ? copy.retrying : copy.retry}</Button>}
      {error && <p role="alert">{error}</p>}
    </CardContent>
  </Card>
}
