import type { EventCreator } from '../../../convex/lib/eventCreator'
import { eventCreatorCopy } from '../mentor-invites/copy'
import { seriesProgressNote, type SeriesProgress } from '../event-setup/event-audience-wiring'
import { EventEditActions } from './EventEditActions'
import { HelpToggle } from './HelpToggle'
import { displayBadges } from './event-page'
import type { EditableEvent } from './event-edit'
import { useSeriesEndDetails } from './SeriesEndDate'
import { repeatsText } from './series-end-date'

type HeaderEvent = EditableEvent & { signupMode?: string; audienceSubteams?: string[] }

/** Compact badges under an event title (who it's for, Required/Optional, Virtual). Legacy audience names are mapped. */
export function EventBadges({ event }: { event: Parameters<typeof displayBadges>[0] }) {
  const badges = displayBadges(event)
  return badges.length ? <ul className="event-badges" aria-label="About this event">{badges.map(badge => <li key={badge} className="badge">{badge}</li>)}</ul> : null
}

/**
 * Under the event page title: badges, how a repeating series repeats and ends ("Repeats every Tuesday until May 31, 2027")
 * with a "?" for how it keeps adding meetings, and for staff "Created by <name> (Mentor)" and Edit / Cancel / Change end date.
 */
export function EventPageHeader({ event, series, staff, isCoach, creator }: { event: HeaderEvent; series?: SeriesProgress | null; staff: boolean; isCoach: boolean; creator?: EventCreator | null }) {
  const seriesEnd = useSeriesEndDetails(event.seriesOccurrenceKey ? event.seriesId : undefined, staff)
  // A canceled series adds no more meetings, so its "?" about adding them is left out.
  const note = staff && seriesEnd?.status !== 'cancelled' ? seriesProgressNote(series) : null
  const repeats = seriesEnd ? repeatsText(seriesEnd) : null
  return <>
    <EventBadges event={event} />
    {staff && creator && <p className="muted">{eventCreatorCopy.createdBy(creator.name, creator.roleLabel)}</p>}
    {(note || repeats) && <p className="muted">{repeats ?? 'Repeating meeting'}{note && <HelpToggle label="About this repeating meeting">{note}</HelpToggle>}</p>}
    {staff && <EventEditActions event={event} isCoach={isCoach} seriesEnd={seriesEnd} />}
  </>
}
