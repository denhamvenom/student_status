import { seriesProgressNote, type SeriesProgress } from '../event-setup/event-audience-wiring'
import { EventEditActions } from './EventEditActions'
import { HelpToggle } from './HelpToggle'
import { displayBadges } from './event-page'
import type { EditableEvent } from './event-edit'

type HeaderEvent = EditableEvent & { signupMode?: string; audienceSubteams?: string[] }

/** Compact badges under an event title (who it's for, Required/Optional, Virtual). Legacy audience names are mapped. */
export function EventBadges({ event }: { event: Parameters<typeof displayBadges>[0] }) {
  const badges = displayBadges(event)
  return badges.length ? <ul className="event-badges" aria-label="About this event">{badges.map(badge => <li key={badge} className="badge">{badge}</li>)}</ul> : null
}

/** Under the event page title: badges, a "?" for how a repeating series keeps adding meetings, and Edit / Cancel for staff. */
export function EventPageHeader({ event, series, staff, isCoach }: { event: HeaderEvent; series?: SeriesProgress | null; staff: boolean; isCoach: boolean }) {
  const note = staff ? seriesProgressNote(series) : null
  return <>
    <EventBadges event={event} />
    {note && <p className="muted">Repeating meeting<HelpToggle label="About this repeating meeting">{note}</HelpToggle></p>}
    {staff && <EventEditActions event={event} isCoach={isCoach} />}
  </>
}
