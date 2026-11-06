import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../../components/ui/button'
import { userFacingError } from '@/lib/error-message'
import { eventSchedule } from '@/lib/event-schedule'
import type { MentorMeetingDetail } from '../mentor-home/contract'
import { useMentorActions } from '../mentor-home/MentorHome'
import { MentorMeetingSections } from '../mentor-home/MentorMeetingSections'
import { MentorSignupWizard } from '../mentor-home/MentorSignupWizard'
import { useNow } from '../student-home/useNow'
import { mentorInviteCopy as copy } from './copy'
import styles from './MentorInvites.module.css'

type Invite = { eventId: Id<'events'>; title: string; startsAt: number; endsAt: number; location: string; virtual: boolean; cancelled: boolean; status: 'invited' | 'accepted' | 'declined' }

/**
 * Schedule (/invited): every current meeting a Mentor is invited to or signed up for, with Accept / Decline. Shows only
 * title, time, place and status. Mentor Home (src/features/mentor-home) shows the next ones and meetings to join.
 */
export function MentorInvitedEvents() {
  const invites = useQuery(api.mentorInvites.myInvitedEvents, {})
  return <>
    <div className="page-head"><div><h1>{copy.title}</h1><p className="muted lead">{copy.description}</p></div></div>
    {invites === undefined ? <div className="card"><p role="status">{copy.loading}</p></div>
      : invites.length === 0 ? <div className="card"><p>{copy.none}</p></div>
        : <ul className={styles.list}>{invites.map(invite => <InviteCard key={invite.eventId} invite={invite} />)}</ul>}
    <MentorMeetingSections />
  </>
}

/**
 * "I'll be there" opens the Mentor sign-up wizard (Which meetings? / Can you drive students? / Do you need a hotel room? /
 * Review), so it first loads the event's minimized summary (mentorMeetings.view) for the questions it asks.
 */
function AcceptWizard({ eventId, onClose }: { eventId: Id<'events'>; onClose: () => void }) {
  const now = useNow()
  const asOf = Math.floor(now / 60_000) * 60_000
  const results = useQueries(useMemo(() => ({ view: { query: api.mentorMeetings.view, args: { eventId, asOf } } }), [eventId, asOf]))
  const actions = useMentorActions()
  const detail = results.view as MentorMeetingDetail | Error | undefined
  if (detail === undefined) return <p role="status" className={styles.facts}>{copy.opening}</p>
  if (detail instanceof Error) return <p role="alert" className="open-text">{userFacingError(detail, copy.openFailed)}</p>
  return <MentorSignupWizard meeting={detail.meeting} mode="accept" actions={actions} onClose={onClose} />
}

function InviteCard({ invite, level: Heading = 'h2' }: { invite: Invite; level?: 'h2' | 'h3' }) {
  const respond = useMutation(api.mentorInvites.respond)
  const [busy, setBusy] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const decline = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await respond({ eventId: invite.eventId, status: 'declined' }); toast.success(copy.declinedSaved(invite.title)) }
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
        {invite.status !== 'accepted' && <Button type="button" className="min-h-11" disabled={busy || accepting} onClick={() => { setError(''); setAccepting(true) }}>{accepting ? copy.saving : invite.status === 'declined' ? copy.undoDecline : copy.accept}</Button>}
        {invite.status !== 'declined' && <Button type="button" className="min-h-11" variant="outline" disabled={busy} onClick={() => void decline()}>{busy ? copy.saving : invite.status === 'accepted' ? copy.changeToDecline : copy.decline}</Button>}
      </div>
    </>}
    {accepting && <AcceptWizard eventId={invite.eventId} onClose={() => setAccepting(false)} />}
    {error && <p role="alert" className="open-text">{error}</p>}
  </li>
}
