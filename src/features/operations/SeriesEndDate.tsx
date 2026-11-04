import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { userFacingError } from '@/lib/error-message'
import { operationsText } from '@/lib/operations-copy'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { canConfirm, continuesText, defaultEndDate, endDatePreviewNote, endDatePreviewText, type SeriesEndDetails } from './series-end-date'

const copy = operationsText.seriesEnd

/** How the event's series repeats and ends, for Coaches and Travel Leads (null for anyone else or a single event). */
export function useSeriesEndDetails(seriesId: string | undefined, staff: boolean) {
  return useQuery(api.eventSeries.endDateDetails, staff && seriesId ? { seriesId: seriesId as Id<'eventSeries'> } : 'skip') ?? null
}

/**
 * "Change end date" next to Edit / Cancel on a series meeting: a date, a live preview ("Last meeting: … · N meetings will
 * be canceled: …" or "· N more meetings") and confirm. Disabled with `blocker` (the Coach-only message) when this person may not change the series.
 */
export function ChangeSeriesEndDate({ seriesId, details, blocker, describedBy }: { seriesId: string; details: SeriesEndDetails; blocker: string | null; describedBy?: string }) {
  const setEndDate = useMutation(api.eventSeries.setEndDate)
  const [date, setDate] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = seriesId as Id<'eventSeries'>
  const preview = useQuery(api.eventSeries.endDateDetails, date ? { seriesId: id, endDate: date } : 'skip')?.preview ?? null
  const current = preview && preview.endDate === date ? preview : null
  const continues = continuesText(details)
  const note = current ? endDatePreviewNote(current) : null
  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!date || busy || !canConfirm(current)) return
    setBusy(true); setError('')
    try { await setEndDate({ seriesId: id, endDate: date }); toast.success(copy.saved); setDate(null) }
    catch (cause) { setError(userFacingError(cause, 'The end date was not changed. Please try again.')) }
    finally { setBusy(false) }
  }
  return <>
    <Button type="button" variant="outline" disabled={!!blocker} aria-describedby={blocker ? describedBy : undefined} onClick={() => { setError(''); setDate(defaultEndDate(details)) }}>{copy.change}</Button>
    <Dialog open={date !== null} disablePointerDismissal onOpenChange={open => { if (!open && !busy) setDate(null) }}>
      <DialogContent className="sm:max-w-md">
        {date !== null && <form className="form-grid" onSubmit={e => void confirm(e)}>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}{details.onCalendar ? ` ${copy.onCalendar}` : ''}</DialogDescription>
          <label>{copy.endsOn}<Input type="date" min={details.minEndDate} max={details.maxEndDate} value={date} onChange={e => { setError(''); setDate(e.target.value) }} required /></label>
          {continues && <p className="muted">{continues}</p>}
          <p className={current?.problem ? 'open-text' : 'muted'} aria-live="polite">{current ? endDatePreviewText(current) : date ? copy.checking : null}</p>
          {note && <p className="muted">{note}</p>}
          {error && <p role="alert" className="open-text">{error}</p>}
          <div className="action-row">
            <Button type="submit" disabled={busy || !canConfirm(current)}>{busy ? copy.saving : copy.confirm}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDate(null)}>{copy.close}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </>
}
