import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { formatDeadline } from '../student-home/format'
import { roomStatusLines } from './logic'

/** Read-only room status for one event. Parents cannot change rooms; the Student chooses them. */
export function ParentRoomStatus({ eventId, studentId, studentName }: { eventId: Id<'events'>; studentId: Id<'students'>; studentName: string }) {
  const room = useQuery(api.rooms.parentRoomStatus, { eventId, studentId })
  if (room === undefined) return null
  return <>{roomStatusLines(room, studentName, formatDeadline).map(line => <span key={line} className="block text-[13px] text-vs-text-2">{line}</span>)}</>
}
