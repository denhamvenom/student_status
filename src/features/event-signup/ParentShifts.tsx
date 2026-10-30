import { useMemo } from 'react'
import { useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { signupCopy } from './copy'
import type { EventShifts } from './types'

const copy = signupCopy.parent
const longDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' })
const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })

/**
 * Read-only for a Parent: the time slots their student chose at this event, first and with full dates, then a note
 * that the student only needs to be there for them. Nothing when the event has no time slots.
 */
export function ParentShifts({ eventId, studentId, studentName }: { eventId: Id<'events'>; studentId: Id<'students'>; studentName: string }) {
  const queries = useMemo(() => ({ shifts: { query: api.eventShifts.forEvent, args: { eventId, studentId } } }), [eventId, studentId])
  const data = useQueries(queries).shifts as EventShifts | undefined | Error
  if (data === undefined) return null
  const title = <div className="card-head"><h2>{copy.title(studentName)}</h2></div>
  if (data instanceof Error) return <section className="card">{title}<p className="muted">{copy.loadFailed}</p></section>
  if (!data.shiftsEnabled || !data.shifts.length) return null
  const chosen = data.shifts.filter(s => data.selectedShiftIds.includes(s.shiftId))
  return <section className="card">
    {title}
    {chosen.length ? <>
      <ul className="simple-list m-0 list-none p-0">
        {chosen.map(s => <li key={s.shiftId} className="flex flex-col gap-0.5 border-b border-vs-border-subtle py-2.5 last:border-b-0">
          <strong className="text-[17px]">{longDay.format(s.startsAt)}</strong>
          <span className="text-[16px] font-semibold">{time.format(s.startsAt)} to {longDay.format(s.endsAt) === longDay.format(s.startsAt) ? time.format(s.endsAt) : `${longDay.format(s.endsAt)}, ${time.format(s.endsAt)}`}</span>
          {s.label && <span className="muted">{s.label}</span>}
        </li>)}
      </ul>
      <p>{copy.onlyDuring(studentName)}</p>
    </> : <p>{copy.none(studentName)}</p>}
  </section>
}
