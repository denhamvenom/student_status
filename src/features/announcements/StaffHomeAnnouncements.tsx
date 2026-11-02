import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { AnnouncementCard } from '../student-home/tiles/AnnouncementCard'
import { visibleAnnouncements } from '../student-home/logic'
import { announcementsCopy as copy } from './copy'

/** Pinned Mentors & staff and Everyone messages, shown above the staff Home. Renders nothing until there is one to show. */
export function StaffHomeAnnouncements() {
  const pinned = useQuery(api.announcements.pinnedForStaffHome, {})
  // The browser decides whether Show until has passed; queries cannot read the clock.
  const [now] = useState(() => Date.now())
  const shown = pinned ? visibleAnnouncements(pinned, now) : []
  if (shown.length === 0) return null
  return <section className="mb-5 grid gap-3" aria-label={copy.staffHomeHeading}>{shown.map(message => <AnnouncementCard key={message.id} announcement={message} />)}</section>
}
