import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { userFacingError } from '@/lib/error-message'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { MentorInvitePicker } from '../event-setup/audience/MentorInvitePicker'
import { defaultAudience, defaultMentorInvite } from '../event-setup/audience/audience-rules'
import styles from './Operations.module.css'
import { answerLabels, groupMentors, headerLine, joinedLabels, mentorsOpenByDefault, totalsLine, type EventMentor, type EventMentorSummary } from '../mentor-invites/coach-view'
import { eventMentorsCopy as copy } from '../mentor-invites/copy'

/**
 * Coach / Travel Lead event page: the event's own "Mentors" section (owner decision, Nov 7 2026; it used to sit inside
 * "Who it's for", where testers couldn't find it). The header line always shows the totals ("3 going · 2 can drive ·
 * 1 hotel room"); the section starts open when a Mentor is going or waiting. Inside: going, waiting for an answer and can't
 * go, each with how they joined and their answers, then the invite controls while the event is open. A Parent acting as
 * Travel Lead gets the same section. If the list can't load (the event moved, or access changed), a short reload message is
 * shown in place.
 */
export function EventMentorsSection({ eventId, open }: { eventId: Id<'events'>; open: boolean }) {
  const results = useQueries(useMemo(() => ({ summary: { query: api.mentorInvites.forEventSummary, args: { eventId } } }), [eventId]))
  const summary = results.summary as EventMentorSummary | Error | undefined
  const loaded = summary !== undefined && !(summary instanceof Error) ? summary : null
  // Null until the section first opens or closes (by the reader, a link, or opening by default once the list loads); after
  // that it stays as it is, so a Mentor's answer arriving never closes the section under the reader.
  const [chosen, setChosen] = useState<boolean | null>(null)
  const isOpen = chosen ?? (loaded ? mentorsOpenByDefault(loaded) : false)
  const line = summary === undefined ? copy.header.loading : summary instanceof Error ? copy.header.unavailable : headerLine(summary)
  return <details id="event-mentors" className={styles.disclosure} open={isOpen} onToggle={event => setChosen(event.currentTarget.open)}>
    <summary><strong>{copy.mentorsTitle}</strong><span>{line}</span></summary>
    <div className={styles.disclosureBody}><Card><CardContent className="space-y-4">
      <EventMentorsList summary={summary} />
      {open && <InviteMoreMentors eventId={eventId} />}
    </CardContent></Card></div>
  </details>
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

/** Going, waiting for an answer and can't go, each with how they joined and, for going Mentors, Can drive / Needs hotel room. */
function EventMentorsList({ summary }: { summary: EventMentorSummary | Error | undefined }) {
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
  return <section aria-label={copy.mentorsTitle} className="space-y-2">
    <p className="m-0">{copy.counts(summary.counts.accepted, summary.counts.invited, summary.counts.declined)}</p>
    {totals && <p className="m-0 font-semibold">{totals}</p>}
    {unanswered && <p className="muted m-0 text-sm">{unanswered}</p>}
    {group('going')}{group('waiting')}{group('declined')}
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
