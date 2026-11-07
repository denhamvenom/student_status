import { Fragment, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '../../components/ui/button'
import { eventSchedule } from '@/lib/event-schedule'
import { eventLocation } from '@/lib/event-place'
import { eventTypeLabel } from '@/lib/event-copy'
import { familyParticipationLabel } from '@/lib/ui-copy'
import { canceledCount, eventListCopy as copy, eventListItems, eventListSections, seriesPattern, typeFilterOptions, type ListItem, type ListedRow } from '@/lib/event-list'
import { eventCreatorCopy } from '../mentor-invites/copy'
import styles from './EventListSections.module.css'

type Row = ListedRow & {
  participation?: string | null
  event: ListedRow['event'] & { type: string; name: string; destination: string; onsite?: boolean; locationType?: string; calendarAllDayStartDate?: string; calendarAllDayEndDate?: string }
}

/** "Mentor meeting" tag on Coach and Travel Lead event cards for a meeting a Mentor created (`createdBy` is staff-only). */
export function MentorMeetingTag({ createdBy }: { createdBy?: { mentorMeeting: boolean } | null }) {
  return createdBy?.mentorMeeting ? <p className={styles.meta}><span className="badge badge-pending">{eventCreatorCopy.mentorMeeting}</span></p> : null
}

/** Solid "Canceled" pill; also for the page's own event cards. */
export function CanceledBadge() {
  return <span className={styles.canceledBadge}>{copy.canceled}</span>
}

/**
 * The Events list by date: "This week", "Coming up" (the next four weeks) and "Later", soonest first, canceled events
 * behind a toggle, and each repeating series as one card ("Every Tuesday · next: …") that expands to its meetings.
 * Staff can narrow it by type. `renderCard` draws a single event's card.
 */
export function EventListSections<R extends Row>({ rows, types, sectionTitle, renderCard, renderSeriesExtras }: {
  rows: readonly R[]; types: readonly string[]; sectionTitle: (type: string) => string
  renderCard: (row: R) => ReactNode; renderSeriesExtras: (next: R) => ReactNode
}) {
  const viewer = useQuery(api.app.viewer, {}) as { user?: { role?: string } | null } | undefined
  const role = viewer?.user?.role
  const family = role === 'student' || role === 'parent'
  const staff = role === 'coach' || role === 'mentor'
  const [showCanceled, setShowCanceled] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [now] = useState(Date.now)
  const present = types.filter(type => rows.some(row => row.event.type === type))
  const filtered = rows.filter(row => types.includes(row.event.type) && (!staff || typeFilter === null || row.event.type === typeFilter))
  const canceled = canceledCount(filtered)
  const sections = eventListSections(eventListItems(filtered, { showCanceled, now }), now)

  const seriesCard = (item: Extract<ListItem<R>, { kind: 'series' | 'canceledSeries' }>) => {
    const lead = item.kind === 'series' ? item.next : item.anchor
    const summary = item.kind === 'series' ? copy.allMeetings(item.total, item.hiddenCanceled) : copy.meetings(item.rows.length)
    return <section key={item.key} className={`card ${styles.series}${item.kind === 'canceledSeries' ? ` ${styles.canceledSeries}` : ''}`} aria-label={lead.event.name}>
      <span className="eyebrow">{eventTypeLabel(lead.event.type)}</span>
      <h3>{lead.event.name}</h3>
      {renderSeriesExtras(lead)}
      {item.kind === 'canceledSeries'
        ? <p className={styles.meta}><CanceledBadge /><span>{copy.allCanceled}</span></p>
        : <p>{seriesPattern(item.rows)} · {copy.next}: {eventSchedule(item.next.event)}</p>}
      <p className="muted">{eventLocation(lead.event)}</p>
      {family && item.kind === 'series' && <p className={styles.meta}><span className="badge badge-pending">{familyParticipationLabel(item.next.participation)}</span></p>}
      {item.kind === 'series' && <Link className="button button-outline" to={`/events/${item.next.event._id}`}>{copy.viewNext}</Link>}
      <details><summary>{summary}</summary><ul className="simple-list">
        {item.rows.map(row => <li key={row.event._id}><Link to={`/events/${row.event._id}`}>{eventSchedule(row.event)}</Link>{row.event.cancelled && <CanceledBadge />}</li>)}
      </ul></details>
    </section>
  }

  return <>
    {staff && present.length > 1 && <div className={styles.chips} role="group" aria-label={copy.filterLabel}>
      {typeFilterOptions(present, sectionTitle).map(option => <Button key={option.value ?? 'all'} type="button" variant="outline" size="sm" aria-pressed={typeFilter === option.value} onClick={() => setTypeFilter(option.value)}>{option.label}</Button>)}
    </div>}
    {(canceled > 0 || showCanceled) && <div className={styles.toolbar}><Button type="button" variant="outline" aria-pressed={showCanceled} onClick={() => setShowCanceled(value => !value)}>{showCanceled ? copy.hideCanceled : copy.showCanceled(canceled)}</Button></div>}
    {!sections.length && <p className="muted">{copy.empty}</p>}
    {sections.map(section => <section key={section.bucket} aria-labelledby={`events-${section.bucket}`}>
      <div className={styles.sectionHead}><h2 id={`events-${section.bucket}`}>{copy.buckets[section.bucket]}</h2><span className="muted">{section.items.length}</span></div>
      <div className="event-grid">
        {section.items.map(item => item.kind === 'single'
          ? <Fragment key={item.key}>{item.row.event.cancelled ? <div className={styles.canceledCard}>{renderCard(item.row)}</div> : renderCard(item.row)}</Fragment>
          : seriesCard(item))}
      </div>
    </section>)}
  </>
}
