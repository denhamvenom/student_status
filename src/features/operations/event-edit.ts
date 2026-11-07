// Edit / Cancel at the top of an event page: who may change the event and which details changed.
// Pure (no Convex or React) so the rules are tested directly; the backend checks the same rules again
// (convex/eventCalendar.ts requireEventEditor, convex/eventSeries.ts requireSeriesEditor).
import { chicagoInputTime, parseChicagoInput } from '@/lib/chicago-time'
import type { OccurrenceValues } from '../event-setup/series-support'

export type EditableEvent = {
  _id: string; name: string; destination: string; startsAt: number; endsAt: number
  onsite?: boolean; locationType?: string; cancelled?: boolean; calendarAllDayStartDate?: string
  seriesId?: string; seriesOccurrenceKey?: string; calendarRevision?: number; mediaSupportRequested?: boolean
  assignmentScope?: string; audienceKind?: string; mandatory?: boolean
  /** Event type and Team Calendar link, for the Required-day note (requiredDayEditHint). */
  type?: string; calendarChoice?: string
}

export type EventDraft = { name: string; start: string; end: string; destination: string; media: boolean }

export const eventEditCopy = {
  edit: 'Edit event',
  cancel: 'Cancel event',
  title: 'Edit event',
  description: 'Attendees are notified of time changes.',
  name: 'Name',
  starts: 'Starts (Central Time)',
  ends: 'Ends (Central Time)',
  location: 'Location',
  media: 'Media Support Requested',
  atShop: 'At our shop (DSHS STEM Center). The place can’t be changed here.',
  virtual: 'Virtual (Discord). The place can’t be changed here.',
  allDay: 'This is an all-day Team Calendar entry. Change its dates in Team Calendar.',
  save: 'Save changes',
  saving: 'Saving…',
  close: 'Close',
  saved: 'Changes saved.',
  canceled: 'Event canceled.',
  /** "This and all future meetings" canceled: "3 meetings canceled". */
  meetingsCanceled: (count: number) => `${count} meeting${count === 1 ? '' : 's'} canceled`,
  cancelConfirm: 'Cancel this event? A connected Team Calendar entry is canceled too. Signups and fees are not changed.',
  coachOnlyGroup: 'Only the Coach can change required group meetings.',
  coachOnlyEvent: 'Only the Coach can change this event',
  nothingChanged: 'Nothing has changed yet.',
  invalid: 'Enter a name up to 250 characters, a place up to 500, and an end time after the start.',
  changedWhileEditing: 'Someone else changed this event while you were editing. Reload the latest details, then make your change again.',
  reload: 'Reload latest details',
} as const

/** Why a Travel Lead can't edit or cancel this event (Coach-only groups), or null when they can. A Coach always can. */
export function eventEditBlocker(isCoach: boolean, event: EditableEvent): string | null {
  if (isCoach) return null
  const requiredGroup = event.mandatory === true && (event.audienceKind === 'everyone' || event.audienceKind === 'subteams')
  if (requiredGroup || event.assignmentScope === 'wholeTeam') return eventEditCopy.coachOnlyGroup
  if (event.assignmentScope === 'travelTeam') return eventEditCopy.coachOnlyEvent
  return null
}

/** The toast after canceling: how many meetings a series cancel removed (eventSeries.cancelFuture), else "Event canceled.". */
export function cancelToastText(result: unknown): string {
  const count = (result as { cancelled?: unknown } | null)?.cancelled
  return typeof count === 'number' && count > 0 ? eventEditCopy.meetingsCanceled(count) : eventEditCopy.canceled
}

export const placeEditable = (event: EditableEvent) => !event.onsite && event.locationType !== 'virtual'

export const draftFrom = (event: EditableEvent): EventDraft => ({ name: event.name, start: chicagoInputTime(event.startsAt), end: chicagoInputTime(event.endsAt), destination: event.destination, media: !!event.mediaSupportRequested })

/** Only the details that changed, ready for eventCalendar.update or a series change; or the problem to show. */
export function eventEditValues(event: EditableEvent, draft: EventDraft): { values: OccurrenceValues } | { error: string } {
  const original = draftFrom(event)
  const name = draft.name.trim(), destination = draft.destination.trim()
  const startsAt = draft.start === original.start ? event.startsAt : parseChicagoInput(draft.start)
  const endsAt = draft.end === original.end ? event.endsAt : parseChicagoInput(draft.end)
  if (!name || name.length > 250 || destination.length > 500 || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return { error: eventEditCopy.invalid }
  const values: OccurrenceValues = {
    ...(name !== event.name ? { name } : {}),
    ...(placeEditable(event) && destination !== event.destination ? { destination } : {}),
    ...(startsAt !== event.startsAt ? { startsAt } : {}),
    ...(endsAt !== event.endsAt ? { endsAt } : {}),
    ...(draft.media !== !!event.mediaSupportRequested ? { mediaSupportRequested: draft.media } : {}),
  }
  return Object.keys(values).length ? { values } : { error: eventEditCopy.nothingChanged }
}
