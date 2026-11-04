import { userFacingError } from '@/lib/error-message'
import { useId, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog'
import { audienceCopy } from './audience-copy'
import styles from './Audience.module.css'
import { RadioChoice } from './RadioChoice'
import type { SeriesScope, SeriesScopeMode } from './types'

type Props = {
  open: boolean
  mode: SeriesScopeMode
  /** Runs the change for the chosen meetings; the dialog stays open and shows the error if it throws. */
  onConfirm: (scope: SeriesScope) => Promise<unknown> | void
  onClose: () => void
}

/** Ask whether an edit or cancellation applies to one meeting or this and all future meetings. */
export function SeriesScopeDialog({ open, mode, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  return <Dialog open={open} disablePointerDismissal onOpenChange={next => { if (!next && !busy) onClose() }}>
    {/* The form mounts each time the dialog opens, so the choice starts at "This meeting only". */}
    <DialogContent showCloseButton={false}><ScopeForm mode={mode} busy={busy} setBusy={setBusy} onConfirm={onConfirm} onClose={onClose} /></DialogContent>
  </Dialog>
}

function ScopeForm({ mode, busy, setBusy, onConfirm, onClose }: Omit<Props, 'open'> & { busy: boolean; setBusy: (busy: boolean) => void }) {
  const copy = audienceCopy.series
  const id = useId()
  const [scope, setScope] = useState<SeriesScope>('this')
  const [error, setError] = useState('')
  const confirmLabel = mode === 'edit' ? copy.confirmEdit : scope === 'this' ? copy.confirmCancelOne : copy.confirmCancel
  async function confirm() {
    if (busy) return
    setBusy(true); setError('')
    try { await onConfirm(scope); onClose() } catch (cause) { setError(userFacingError(cause, 'Please try again.')) } finally { setBusy(false) }
  }
  return <form className={styles.stack} onSubmit={e => { e.preventDefault(); void confirm() }}>
    <DialogTitle>{mode === 'edit' ? copy.editTitle : copy.cancelTitle}</DialogTitle>
    <DialogDescription>{mode === 'edit' ? copy.editDescription : copy.cancelDescription}</DialogDescription>
    <fieldset className={styles.group} disabled={busy}>
      <legend className="sr-only">{copy.legend}</legend>
      <div className={styles.choices}>
        <RadioChoice name={`${id}-scope`} value="this" checked={scope === 'this'} label={copy.thisOnly.label} helper={copy.thisOnly.helper} onSelect={() => setScope('this')} />
        <RadioChoice name={`${id}-scope`} value="thisAndFuture" checked={scope === 'thisAndFuture'} label={copy.future.label} helper={copy.future.helper} onSelect={() => setScope('thisAndFuture')} />
      </div>
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}>
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{copy.back}</Button>
      <Button type="submit" variant={mode === 'cancel' ? 'destructive' : 'default'} disabled={busy}>{busy ? copy.saving : confirmLabel}</Button>
    </div>
  </form>
}
