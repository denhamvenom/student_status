import { useState, type ReactNode } from 'react'
import { subteamDisplay } from '@/lib/subteams'
import { Link } from 'react-router'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { userFacingError } from '@/lib/error-message'
import { eventSchedule } from '@/lib/event-schedule'
import { mentorInviteCopy as copy } from './copy'
import styles from './MentorInvites.module.css'
import { nextInvites } from './next-invites'

type Invite = { eventId: Id<'events'>; title: string; startsAt: number; endsAt: number; location: string; virtual: boolean; cancelled: boolean; status: 'invited' | 'accepted' | 'declined' }

/** A Mentor's own invitations with Accept / Decline. Shows only title, time, place and status. */
export function MentorInvitedEvents() {
  const invites = useQuery(api.mentorInvites.myInvitedEvents, {})
  return <>
    <div className="page-head"><div><h1>{copy.title}</h1><p className="muted lead">{copy.description}</p></div></div>
    {invites === undefined ? <div className="card"><p role="status">{copy.loading}</p></div>
      : invites.length === 0 ? <div className="card"><p>{copy.none}</p></div>
        : <ul className={styles.list}>{invites.map(invite => <InviteCard key={invite.eventId} invite={invite} />)}</ul>}
  </>
}

/** Mentor Home: the next three upcoming invitations with Accept / Decline, and a link to all of them. */
export function MentorNextInvites() {
  const invites = useQuery(api.mentorInvites.myInvitedEvents, {})
  const [now] = useState(Date.now)
  if (invites === undefined) return null
  const next = nextInvites(invites, now)
  return <section className={styles.home} aria-labelledby="mentor-next-invites">
    <div className="section-head"><h2 id="mentor-next-invites">{copy.homeTitle}</h2><Link className={styles.allLink} to="/invited">{copy.homeAll}</Link></div>
    {next.length ? <ul className={styles.list}>{next.map(invite => <InviteCard key={invite.eventId} invite={invite} level="h3" />)}</ul> : <div className="card"><p>{copy.homeNone}</p></div>}
  </section>
}

/**
 * The Mentor's own subteams at the top of Home. Read defensively: shown only once adultProfile.own returns `subteams`
 * (a Mentor can't read the Coach's mentor list).
 */
export function MentorSubteamsLine() {
  const profile = useQuery(api.adultProfile.own, {}) as { subteams?: string[] } | undefined
  const subteams = profile?.subteams?.filter(Boolean) ?? []
  return subteams.length ? <p className={styles.subteams}>{copy.subteams(subteams.map(subteamDisplay).join(', '))}</p> : null
}

/** Mentor Home keeps the profile form one tap away instead of filling the page. */
export function MentorProfileDisclosure({ children }: { children: ReactNode }) {
  return <details className={`card ${styles.profile}`}><summary>{copy.editProfile}</summary>{children}</details>
}

/** Shown on /events for a Mentor, who answers invitations instead of browsing every event. */
export function MentorEventsNotice() {
  return <p>{copy.eventsUnavailable} <Link to="/invited">{copy.eventsLink}</Link>.</p>
}

function InviteCard({ invite, level: Heading = 'h2' }: { invite: Invite; level?: 'h2' | 'h3' }) {
  const respond = useMutation(api.mentorInvites.respond)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const answer = async (status: 'accepted' | 'declined') => {
    if (busy) return
    setBusy(true); setError('')
    try {
      await respond({ eventId: invite.eventId, status })
      if (status === 'accepted') toast.success(copy.acceptedSaved(invite.title))
      // A declined invitation leaves the list, so the toast offers the way back.
      else toast.success(copy.declinedSaved(invite.title), { duration: 10_000, action: { label: copy.undoDecline, onClick: () => { void respond({ eventId: invite.eventId, status: 'accepted' }).then(() => toast.success(copy.acceptedSaved(invite.title)), cause => toast.error(userFacingError(cause, copy.retry))) } } })
    }
    catch (cause) { setError(userFacingError(cause, copy.retry)) }
    finally { setBusy(false) }
  }
  const place = invite.virtual ? copy.virtual : invite.location.trim() || copy.noPlace
  const headingId = `invite-${invite.eventId}`
  return <li className={`card ${styles.item}`} aria-labelledby={headingId}>
    <Heading id={headingId}>{invite.title}</Heading>
    <p className={styles.facts}>{eventSchedule(invite)}</p>
    <p className={styles.facts}>{place}</p>
    {invite.cancelled ? <p role="status" className="open-text">{copy.cancelled}</p> : <>
      <p><span className={`badge ${invite.status === 'accepted' ? 'badge-ready' : 'badge-pending'}`}>{invite.status === 'accepted' ? copy.accepted : invite.status === 'declined' ? copy.declinedStatus : copy.invited}</span></p>
      <div className={styles.actions} role="group" aria-labelledby={headingId}>
        {invite.status !== 'accepted' && <Button type="button" disabled={busy} onClick={() => void answer('accepted')}>{busy ? copy.saving : invite.status === 'declined' ? copy.undoDecline : copy.accept}</Button>}
        {invite.status !== 'declined' && <Button type="button" variant="outline" disabled={busy} onClick={() => void answer('declined')}>{invite.status === 'accepted' ? copy.changeToDecline : copy.decline}</Button>}
      </div>
    </>}
    {error && <p role="alert" className="open-text">{error}</p>}
  </li>
}
