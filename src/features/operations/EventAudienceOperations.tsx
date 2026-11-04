import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { AudienceEventFields } from '../../../convex/lib/eventAudienceRules'
import { userFacingError } from '@/lib/error-message'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { MentorInvitePicker } from '../event-setup/audience/MentorInvitePicker'
import { defaultAudience, defaultMentorInvite } from '../event-setup/audience/audience-rules'
import { eventAudienceLabel, eventLocationTypeLabel, eventRequiredLabel } from '../event-setup/event-audience-wiring'
import styles from './Operations.module.css'
import { audienceDisplayLabel } from './event-page'

type AudienceEvent = AudienceEventFields & { locationType?: string; archived?: boolean; cancelled?: boolean }

const copy = {
  title: 'Who it’s for',
  audience: 'Who it’s for',
  required: 'Required',
  where: 'Where',
  invite: 'Invite more mentors',
  inviteButton: 'Send invitations',
  inviting: 'Sending…',
  invited: (count: number) => count === 0 ? 'Those mentors were already invited.' : count === 1 ? '1 mentor invited.' : `${count} mentors invited.`,
  invitedTitle: 'Invited mentors',
  loadingInvites: 'Loading invited mentors…',
  noInvites: 'No mentors invited yet.',
  status: { invited: 'No answer yet', accepted: 'Accepted', declined: 'Declined' },
  source: { individual: 'Invited by name', subteam: 'Invited with subteam' },
  failed: 'Invitations were not sent. Please try again.',
} as const

/** Coach / Travel Lead event page: audience, required, in person or virtual, and mentor invitations. */
export function EventAudienceOperations({ eventId, event }: { eventId: Id<'events'>; event: AudienceEvent }) {
  const open = !event.archived && !event.cancelled
  const audience = audienceDisplayLabel(event, eventAudienceLabel(event))
  return <details className={styles.disclosure}><summary><strong>{copy.title}</strong><span>{audience} · {eventLocationTypeLabel(event)}</span></summary><div className={styles.disclosureBody}><Card><CardContent className="space-y-4">
    <div className="detail"><span>{copy.audience}</span><strong>{audience}</strong></div>
    <div className="detail"><span>{copy.required}</span><strong>{eventRequiredLabel(event)}</strong></div>
    <div className="detail"><span>{copy.where}</span><strong>{eventLocationTypeLabel(event)}</strong></div>
    <InvitedMentors eventId={eventId} />
    {open && <InviteMoreMentors eventId={eventId} />}
  </CardContent></Card></div></details>
}

function InvitedMentors({ eventId }: { eventId: Id<'events'> }) {
  const invites = useQuery(api.mentorInvites.forEvent, { eventId })
  return <section aria-label={copy.invitedTitle} className="space-y-2">
    <h3 className="font-semibold">{copy.invitedTitle}</h3>
    {invites === undefined ? <p className="muted" role="status">{copy.loadingInvites}</p>
      : invites.length === 0 ? <p className="muted">{copy.noInvites}</p>
      : <ul className="simple-list">{invites.map(invite => <li key={invite.mentorUserId} className="split-line"><span>{invite.name} <small className="muted">· {copy.source[invite.source]}</small></span><span className={`badge ${invite.status === 'accepted' ? 'badge-ready' : invite.status === 'declined' ? 'badge-open' : 'badge-pending'}`}>{copy.status[invite.status]}</span></li>)}</ul>}
  </section>
}

function InviteMoreMentors({ eventId }: { eventId: Id<'events'> }) {
  const mentors = useQuery(api.studentSubteams.listMentorsForInvite, {})
  const add = useMutation(api.mentorInvites.addMentorInvites)
  const [value, setValue] = useState(defaultMentorInvite)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  if (mentors === undefined) return null
  const submit = async () => {
    if (busy || !value.mentorIds.length) return
    setBusy(true); setError(''); setSaved('')
    try { const count = await add({ eventId, mentorUserIds: value.mentorIds as Id<'appUsers'>[] }); setValue(defaultMentorInvite()); setSaved(copy.invited(count)) }
    catch (cause) { setError(userFacingError(cause, copy.failed)) } finally { setBusy(false) }
  }
  return <section aria-label={copy.invite} className="space-y-4">
    <h3 className="font-semibold">{copy.invite}</h3>
    {/* Everyone keeps the picker to individual mentors; subteam mentors are chosen when the event is created. */}
    <MentorInvitePicker id={`event-${eventId}-invite`} value={value} onChange={next => { setSaved(''); setValue(next) }} mentors={mentors} audience={defaultAudience()} />
    <Button type="button" disabled={busy || !value.mentorIds.length} onClick={() => void submit()}>{busy ? copy.inviting : copy.inviteButton}</Button>
    {error && <p role="alert" className="open-text">{error}</p>}
    {saved && <p role="status" className="ready-text">{saved}</p>}
  </section>
}
