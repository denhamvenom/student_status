import { useId, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { AnnouncementCard } from '../student-home/tiles/AnnouncementCard'
import { visibleAnnouncements } from '../student-home/logic'
import { announcementsCopy as copy } from './copy'

/**
 * Pinned Mentors & staff and Everyone messages, shown above the staff Home. Renders nothing until there is one to show.
 * Home lists only pinned messages, so it is labeled Pinned and links to the Inbox, which lists every message.
 */
export function StaffHomeAnnouncements() {
  const headingId = useId()
  const pinned = useQuery(api.announcements.pinnedForStaffHome, {})
  // The browser decides whether Show until has passed; queries cannot read the clock.
  const [now] = useState(() => Date.now())
  const shown = pinned ? visibleAnnouncements(pinned, now) : []
  if (shown.length === 0) return null
  return <section className="mb-5 grid gap-3" aria-labelledby={headingId}>
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={headingId} className="m-0">{copy.staffHomePinned}<span className="sr-only">: {copy.staffHomeHeading}</span></h2>
      <Link to="/inbox" className="inline-flex min-h-11 items-center font-semibold">{copy.seeAllMessages}</Link>
    </div>
    {/* AnnouncementCard renders the Urgent badge itself. */}
    {shown.map(message => <AnnouncementCard key={message.id} announcement={message} />)}
  </section>
}
