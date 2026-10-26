import { userFacingError } from '@/lib/error-message'
import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import styles from './SecurePermissionPdf.module.css'

type Scope = { draftId: Id<'permissionDrafts'>; submissionId?: never } | { submissionId: Id<'permissionSubmissions'>; draftId?: never }
type Props = Scope & { rendition: 'reviewed' | 'signed'; expectedSha256: string; onReady?: (ready: boolean) => void }

/** The server rechecks access on each fetch. The object URL lives only while this view is mounted. */
export function SecurePermissionPdf({ draftId, submissionId, rendition, expectedSha256, onReady }: Props) {
  const fetchPdf = useAction(api.permissionsV2Pdf.pdf)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    onReady?.(false)
    setUrl(null)
    setError('')
    void fetchPdf({ ...(draftId ? { draftId } : { submissionId: submissionId! }), rendition }).then(result => {
      if (!alive) return
      if (result.sha256 !== expectedSha256) throw new Error('The form changed. Open it again to review the latest version.')
      objectUrl = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }))
      setUrl(objectUrl)
      onReady?.(true)
    }).catch(cause => { if (alive) { setError(userFacingError(cause, "The form couldn't be opened. Try again, or go back and prepare it again.")); onReady?.(false) } })
    return () => { alive = false; onReady?.(false); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [draftId, submissionId, rendition, expectedSha256, fetchPdf, onReady])
  return <section className={styles.preview} aria-label={rendition === 'reviewed' ? 'Permission form to review' : 'Signed permission form'}>
    {url ? <><iframe className={styles.frame} src={url} title={rendition === 'reviewed' ? 'Permission form to review' : 'Signed permission form'} /><a className={styles.download} href={url} download={rendition === 'reviewed' ? 'permission-form-review.pdf' : 'permission-form-signed.pdf'}>Download PDF</a></> : <p role={error ? 'alert' : 'status'}>{error || 'Loading the form…'}</p>}
  </section>
}
