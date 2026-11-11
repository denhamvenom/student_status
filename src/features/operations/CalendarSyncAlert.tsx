import { useId, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { chicagoDisplayTime } from '../../lib/chicago-time'
import styles from './Operations.module.css'
import { calendarChipCopy, TEAM_CALENDAR_ANCHOR } from './event-page'

export const calendarSyncAlertCopy = {
  heading: 'Team Calendar needs attention',
  description: 'These upcoming events didn’t update on Team Calendar. Open each one to try again or reload its Calendar details.',
  open: 'Open Team Calendar controls',
  more: 'More events need attention. Fix these first to see the rest.',
} as const

/**
 * Coach and Travel Lead Home: upcoming events whose Team Calendar update failed or conflicts (eventCalendar.syncProblems,
 * staff-only), each linking to its Team Calendar controls. Renders nothing while there are none.
 */
export function CalendarSyncAlert() {
  const headingId = useId()
  // The browser's clock, read once (queries can't read it); a reload picks up meetings that have ended since.
  const [asOf] = useState(() => Date.now())
  const problems = useQuery(api.eventCalendar.syncProblems, { asOf })
  if (!problems?.items.length) return null
  return <section className="card mb-5 grid gap-3" aria-labelledby={headingId}>
    <h2 id={headingId} className="m-0">{calendarSyncAlertCopy.heading}</h2>
    <p className="m-0">{calendarSyncAlertCopy.description}</p>
    <ul className="m-0 grid gap-3 p-0" role="list">
      {problems.items.map(item => <li key={item.eventId} className="grid gap-1">
        <span><strong>{item.name}</strong> · {chicagoDisplayTime(item.startsAt)} <span className={`${styles.chip} ${styles.chipAttention}`}>{calendarChipCopy.attention}</span></span>
        <span className="muted">{item.reason ?? (item.state === 'conflict' ? calendarChipCopy.conflict : calendarChipCopy.failed)}</span>
        <Link to={`/events/${item.eventId}#${TEAM_CALENDAR_ANCHOR}`} className="inline-flex min-h-11 items-center font-semibold">{calendarSyncAlertCopy.open}<span className="sr-only">: {item.name}</span></Link>
      </li>)}
    </ul>
    {problems.more && <p className="m-0 muted">{calendarSyncAlertCopy.more}</p>}
  </section>
}
