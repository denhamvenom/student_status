import { Component, useState, type ReactNode } from 'react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { eventSchedule } from './lib/event-schedule'
import { userFacingError } from './lib/error-message'
import { statusLabel } from './lib/ui-copy'

export class EventAccessBoundary extends Component<{ children: ReactNode; archive?: boolean }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() { return this.state.error ? <div className="card"><h1>Event unavailable</h1><p role="alert">{userFacingError(this.state.error, 'This archived event could not be opened.', false)}</p><Link to={this.props.archive ? "/events/archive" : "/events"}>Back to events</Link><p><Link to="/finances">Open Money</Link> to review any unpaid charges.</p></div> : this.props.children }
}

function ArchiveList() {
  const { results, status, loadMore } = usePaginatedQuery(api.eventArchive.page, {}, { initialNumItems: 20 })
  return <><div className="page-head"><div><h1>Archived events</h1><p className="muted">Past events, including previous seasons. Students and parents cannot open these events. Unpaid charges remain in Money.</p></div></div><p><Link to="/events">Back to current events</Link></p>
    {status === 'LoadingFirstPage' ? <p role="status">Loading archived events…</p> : results.length === 0 ? <div className="card"><p>No archived events yet.</p></div> : <div className="event-grid">{results.map(event => <section className="card" key={event._id}><span className="eyebrow">{event.seasonName} · {event.type}</span><h2>{event.name}</h2><p>{eventSchedule(event)}</p><p className="muted">{event.destination}</p><Link className="button button-outline" to={`/events/archive/${event._id}`}>View archived event</Link></section>)}</div>}
    {status !== 'Exhausted' && status !== 'LoadingFirstPage' && <Button variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(20)}>{status === 'LoadingMore' ? 'Loading…' : 'Load more archived events'}</Button>}
  </>
}

function ArchiveDetail({ eventId }: { eventId: Id<'events'> }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const data = useQuery(api.eventArchive.detail, { eventId, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 20 } })
  if (!data) return <p role="status">Loading archived event…</p>
  const { event, requirements, participants } = data
  return <><p><Link to="/events/archive">Back to archived events</Link></p><div className="page-head"><div><p className="eyebrow">Archived event · {data.seasonName}</p><h1>{event.name}</h1><p className="muted">{eventSchedule(event)} · {event.destination}</p></div></div>
    <div className="card"><p>This event has ended. Event records are retained for staff; students and parents no longer have access.</p><p>Unpaid charges stay on student accounts. <Link to="/finances">Open Money</Link> to review balances.</p><dl><dt>Transportation</dt><dd>{event.travel}</dd><dt>Event fee</dt><dd>{(event.feeCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</dd></dl></div>
    <section className="card"><h2>Participants</h2>{participants.page.length ? <div className="table-wrap"><table><thead><tr><th>Student</th><th>Participation</th></tr></thead><tbody>{participants.page.map(row => <tr key={row.studentId}><td data-label="Student">{row.name}</td><td data-label="Participation">{statusLabel(row.status)}</td></tr>)}</tbody></table></div> : <p>No participants on this page.</p>}<div className="action-row">{cursors.length > 1 && <Button variant="outline" onClick={() => setCursors(previous => previous.slice(0, -1))}>Previous participants</Button>}{!participants.isDone && <Button variant="outline" onClick={() => setCursors(previous => [...previous, participants.continueCursor])}>Next participants</Button>}</div></section>
    <section className="card"><h2>Recorded requirements</h2><p className="muted">Retained for reference. These requirements no longer appear in student or parent tasks.</p>{requirements.length ? <ul>{requirements.map(item => <li key={item._id}>{item.label}</li>)}</ul> : <p>No custom requirements were recorded.</p>}</section>
  </>
}

export function ArchivedEvents({ eventId }: { eventId?: Id<'events'> }) {
  return <EventAccessBoundary archive key={eventId ?? 'list'}>{eventId ? <ArchiveDetail eventId={eventId}/> : <ArchiveList/>}</EventAccessBoundary>
}
