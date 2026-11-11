import { useId, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { userFacingError } from '@/lib/error-message'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { ConfirmAction } from '../../ConfirmAction'
import { SeriesScopeDialog } from '../event-setup/audience/SeriesScopeDialog'
import { dateTimeBounds, requiredDayEditHint } from '../event-setup/new-event-defaults'
import { useSeasonYear } from '../event-setup/use-season-year'
import { useChangeOccurrence, type OccurrenceChange } from '../event-setup/series-support'
import { cancelToastText, draftFrom, eventEditBlocker, eventEditCopy as copy, eventEditValues, placeEditable, type EditableEvent, type EventDraft } from './event-edit'
import { ChangeSeriesEndDate } from './SeriesEndDate'
import type { SeriesEndDetails } from './series-end-date'

/**
 * Edit event and Cancel event at the top of an event page, for a Coach and for a Travel Lead where allowed.
 * A meeting from a repeating series first asks "This meeting only" or "This and all future meetings".
 */
export function EventEditActions({ event, isCoach, seriesEnd }: { event: EditableEvent; isCoach: boolean; seriesEnd?: SeriesEndDetails | null }) {
  const id = useId()
  const update = useMutation(api.eventCalendar.update)
  const changeOccurrence = useChangeOccurrence()
  const [draft, setDraft] = useState<EventDraft | null>(null)
  // The event's revision when the form opened: sent with the save so a change someone else saved meanwhile is refused
  // (convex/eventCalendar.ts updateEventDetails) instead of being silently overwritten.
  const [openedRevision, setOpenedRevision] = useState<number | null>(null)
  const [seriesChange, setSeriesChange] = useState<OccurrenceChange | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seasonYear = useSeasonYear()
  const blocker = eventEditBlocker(isCoach, event)
  const eventId = event._id as Id<'events'>
  const expectedRevision = event.calendarRevision ?? 0
  const series = !!event.seriesId && !!event.seriesOccurrenceKey
  // The series' own rule (convex/eventSeries.ts requireSeriesEditor) also applies to its end date.
  const endBlocker = blocker ?? seriesEnd?.blocker ?? null
  const stale = draft !== null && openedRevision !== null && openedRevision !== expectedRevision
  if (event.cancelled) return null
  const openEdit = () => { setError(''); setDraft(draftFrom(event)); setOpenedRevision(expectedRevision) }
  const reload = () => { setError(''); setDraft(draftFrom(event)); setOpenedRevision(expectedRevision) }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft || busy) return
    if (stale) { setError(copy.changedWhileEditing); return }
    const result = eventEditValues(event, draft)
    if ('error' in result) { setError(result.error); return }
    // The scope question is its own dialog; the draft stays so "Go back" returns to the form.
    if (series) { setSeriesChange({ kind: 'edit', values: result.values }); return }
    setBusy(true); setError('')
    try { await update({ eventId, expectedRevision: openedRevision ?? expectedRevision, ...result.values }); toast.success(copy.saved); setDraft(null) }
    catch (cause) { setError(userFacingError(cause, 'The event was not saved. Please try again.')) }
    finally { setBusy(false) }
  }
  const allDay = !!event.calendarAllDayStartDate
  // Note only (no refusal): a Team meeting on Team Calendar set to start on a Required weekday counts as required attendance.
  const requiredDayNote = draft ? requiredDayEditHint({ type: event.type, onTeamCalendar: !!event.calendarChoice }, draft.start, seasonYear) : null
  return <div className="event-actions">
    <div className="action-row" role="group" aria-label="Change this event">
      <Button type="button" disabled={!!blocker} aria-describedby={blocker ? `${id}-blocked` : undefined} onClick={openEdit}>{copy.edit}</Button>
      {series
        ? <Button type="button" variant="outline" disabled={!!blocker} aria-describedby={blocker ? `${id}-blocked` : undefined} onClick={() => setSeriesChange({ kind: 'cancel' })}>{copy.cancel}</Button>
        : <ConfirmAction title="Cancel this event?" disabled={!!blocker} description={copy.cancelConfirm} onConfirm={async () => { await update({ eventId, expectedRevision, cancelled: true }); toast.success(copy.canceled) }}>{copy.cancel}</ConfirmAction>}
      {series && seriesEnd && <ChangeSeriesEndDate seriesId={event.seriesId!} details={seriesEnd} blocker={endBlocker} describedBy={`${id}-blocked`} />}
    </div>
    {(blocker ?? endBlocker) && <p id={`${id}-blocked`} className="muted">{blocker ?? endBlocker}</p>}
    <Dialog open={draft !== null && seriesChange === null} disablePointerDismissal onOpenChange={open => { if (!open && !busy) setDraft(null) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg">
        {draft && <form className="form-grid" onSubmit={e => void save(e)}>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
          <label>{copy.name}<Input value={draft.name} maxLength={250} onChange={e => setDraft({ ...draft, name: e.target.value })} required /></label>
          {allDay && <p className="muted">{copy.allDay}</p>}
          <label>{copy.starts}<Input type="datetime-local" min={dateTimeBounds.min} max={dateTimeBounds.max} value={draft.start} disabled={allDay} aria-describedby={requiredDayNote ? `${id}-required-day` : undefined} onChange={e => setDraft({ ...draft, start: e.target.value })} required /></label>
          {requiredDayNote && <p id={`${id}-required-day`} className="muted">{requiredDayNote}</p>}
          <label>{copy.ends}<Input type="datetime-local" min={dateTimeBounds.min} max={dateTimeBounds.max} value={draft.end} disabled={allDay} onChange={e => setDraft({ ...draft, end: e.target.value })} required /></label>
          {placeEditable(event)
            ? <label>{copy.location}<Input value={draft.destination} maxLength={500} onChange={e => setDraft({ ...draft, destination: e.target.value })} /></label>
            : <p className="muted">{event.locationType === 'virtual' ? copy.virtual : copy.atShop}</p>}
          <label className="checkbox-label"><Checkbox checked={draft.media} onCheckedChange={checked => setDraft({ ...draft, media: checked })} />{copy.media}</label>
          {stale && !error && <p role="alert" className="open-text">{copy.changedWhileEditing}</p>}
          {error && <p role="alert" className="open-text">{error}</p>}
          <div className="action-row">
            {stale && <Button type="button" variant="outline" disabled={busy} onClick={reload}>{copy.reload}</Button>}
            <Button type="submit" disabled={busy || stale}>{busy ? copy.saving : copy.save}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>{copy.close}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
    {series && <SeriesScopeDialog open={seriesChange !== null} mode={seriesChange?.kind === 'cancel' ? 'cancel' : 'edit'} onClose={() => setSeriesChange(null)} onConfirm={async scope => {
      if (!seriesChange) return
      const result = await changeOccurrence({ event: { _id: event._id, seriesId: event.seriesId, seriesOccurrenceKey: event.seriesOccurrenceKey, startsAt: event.startsAt, endsAt: event.endsAt }, expectedRevision: seriesChange.kind === 'edit' ? openedRevision ?? expectedRevision : expectedRevision, scope, change: seriesChange })
      toast.success(seriesChange.kind === 'cancel' ? cancelToastText(result) : copy.saved)
      setDraft(null)
    }} />}
  </div>
}
