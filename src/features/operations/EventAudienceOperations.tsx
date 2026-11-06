import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery } from 'convex/react'
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
import { answerLabels, groupMentors, joinedLabels, totalsLine, type EventMentor, type EventMentorSummary } from '../mentor-invites/coach-view'
import { eventMentorsCopy } from '../mentor-invites/copy'

type AudienceEvent = AudienceEventFields & { locationType?: string; archived?: boolean; cancelled?: boolean }

const copy = eventMentorsCopy

/** Coach / Travel Lead event page: audience, required, in person or virtual, the event's Mentors (with answers) and invitations. */
export function EventAudienceOperations({ eventId, event }: { eventId: Id<'events'>; event: AudienceEvent }) {
  const open = !event.archived && !event.cancelled
  const audience = audienceDisplayLabel(event, eventAudienceLabel(event))
  return <details className={styles.disclosure}><summary><strong>{copy.title}</strong><span>{audience} · {eventLocationTypeLabel(event)}</span></summary><div className={styles.disclosureBody}><Card><CardContent className="space-y-4">
    <div className="detail"><span>{copy.audience}</span><strong>{audience}</strong></div>
    <div className="detail"><span>{copy.required}</span><strong>{eventRequiredLabel(event)}</strong></div>
    <div className="detail"><span>{copy.where}</span><strong>{eventLocationTypeLabel(event)}</strong></div>
    <EventMentors eventId={eventId} />
    {open && <InviteMoreMentors eventId={eventId} />}
  </CardContent></Card></div></details>
}

const badge = (tone: 'ready' | 'pending' | 'open') => `badge badge-${tone}`

function MentorRow({ mentor, questions }: { mentor: EventMentor; questions: EventMentorSummary['questions'] }) {
  const answers = answerLabels(mentor, questions)
  return <li className="flex flex-col gap-1.5 border-b border-[var(--border-default)] py-2.5 last:border-b-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="min-w-0 break-words">{mentor.name}</strong>
      <span className={badge(mentor.status === 'accepted' ? 'ready' : mentor.status === 'declined' ? 'open' : 'pending')}>{copy.status[mentor.status]}</span>
    </div>
    <p className="muted m-0 text-sm">{joinedLabels(mentor).join(' · ')}</p>
    {answers.length > 0 && <p className="m-0 flex flex-wrap gap-1.5">{answers.map(answer => <span key={answer.text} className={badge(answer.tone === 'yes' ? 'ready' : 'pending')}>{answer.text}</span>)}</p>}
  </li>
}

/**
 * The event's Mentors for a Coach or Travel Lead: going, waiting for an answer and can't go, each with how they joined
 * (invited, signed up themselves, series choice) and, for going Mentors, Can drive / Needs hotel room; totals on top.
 * A Parent acting as Travel Lead gets the same list. If the list can't load (the event moved, or access changed), a short
 * reload message is shown in place.
 */
function EventMentors({ eventId }: { eventId: Id<'events'> }) {
  const results = useQueries(useMemo(() => ({ summary: { query: api.mentorInvites.forEventSummary, args: { eventId } } }), [eventId]))
  const summary = results.summary as EventMentorSummary | Error | undefined
  const body = (() => {
    if (summary === undefined) return <p className="muted" role="status">{copy.loading}</p>
    if (summary instanceof Error) return <p className="muted">{copy.unavailable}</p>
    if (!summary.mentors.length) return <p className="muted">{copy.none}</p>
    const groups = groupMentors(summary.mentors)
    const totals = totalsLine(summary)
    const unanswered = copy.unanswered(summary.counts.unansweredDrive, summary.counts.unansweredHotel)
    const group = (key: keyof typeof groups) => groups[key].length > 0 && <section key={key} aria-label={copy.groups[key]} className="space-y-1">
      <h4 className="m-0 text-sm font-semibold">{copy.groups[key]} · {groups[key].length}</h4>
      <ul className="m-0 list-none p-0">{groups[key].map(mentor => <MentorRow key={mentor.mentorUserId} mentor={mentor} questions={summary.questions} />)}</ul>
    </section>
    return <>
      <p className="m-0">{copy.counts(summary.counts.accepted, summary.counts.invited, summary.counts.declined)}</p>
      {totals && <p className="m-0 font-semibold">{totals}</p>}
      {unanswered && <p className="muted m-0 text-sm">{unanswered}</p>}
      {group('going')}{group('waiting')}{group('declined')}
    </>
  })()
  return <section aria-label={copy.mentorsTitle} className="space-y-2">
    <h3 className="font-semibold">{copy.mentorsTitle}</h3>
    {body}
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
