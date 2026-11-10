import { userFacingError } from '@/lib/error-message'
import { useState, type ReactNode } from 'react'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog'

const failureMessage = (label: string) => `That change was not saved. Select ${label} to try again. If it keeps happening, contact a Coach.`

/** Freeze the reviewed action and explanation until confirmed or cancelled. */
export function ConfirmAction({ children, title, description, disabled, confirmLabel, onConfirm }: { children: ReactNode; /** The dialog's confirm button. Defaults to the action button's text (for example "Remove"), or "Confirm" when that is not plain text. */ confirmLabel?: string; /** Names the action as a question, like "Discard season draft?". Defaults to the button text with a question mark. */ title?: string; description: string; disabled?: boolean; onConfirm: () => Promise<unknown> }) {
  const [review, setReview] = useState<{ title: string; description: string; run: () => Promise<unknown> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const verb = confirmLabel ?? (typeof children === 'string' ? children.replace(/[.?!…]+$/, '') : 'Confirm')
  async function confirm() {
    if (!review || busy) return
    setBusy(true); setError('')
    try { await review.run(); setReview(null) } catch (cause) { setError(userFacingError(cause, failureMessage(verb))) } finally { setBusy(false) }
  }
  return <><Button type="button" variant="outline" disabled={disabled} onClick={() => { setError(''); setReview({ title: title ?? (typeof children === 'string' ? `${children.replace(/[.?!…]+$/, '')}?` : 'Confirm this change?'), description, run: onConfirm }) }}>{children}</Button>
    <Dialog open={!!review} disablePointerDismissal onOpenChange={open => { if (!open && !busy) setReview(null) }}><DialogContent showCloseButton={false}><DialogTitle>{review?.title}</DialogTitle><p>{review?.description}</p>{error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving…' : verb}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button></div></DialogContent></Dialog></>
}
