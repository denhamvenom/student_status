import { useState, type ReactNode } from 'react'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog'

/** Freeze the reviewed action and explanation until confirmed or cancelled. */
export function ConfirmAction({ children, description, disabled, onConfirm }: { children: ReactNode; description: string; disabled?: boolean; onConfirm: () => Promise<unknown> }) {
  const [review, setReview] = useState<{ description: string; run: () => Promise<unknown> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    if (!review || busy) return
    setBusy(true); setError('')
    try { await review.run(); setReview(null) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.') } finally { setBusy(false) }
  }
  return <><Button type="button" variant="outline" disabled={disabled} onClick={() => { setError(''); setReview({ description, run: onConfirm }) }}>{children}</Button>
    <Dialog open={!!review} disablePointerDismissal onOpenChange={open => { if (!open && !busy) setReview(null) }}><DialogContent showCloseButton={false}><DialogTitle>Confirm action</DialogTitle><p>{review?.description}</p>{error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving…' : 'Confirm'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button></div></DialogContent></Dialog></>
}
