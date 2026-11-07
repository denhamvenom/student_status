import { useId, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { eyebrow, focusRing, inset } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import type { JoinEntry } from './contract'
import { joinEntryLines, showsSubteamTag, typeLabel, type JoinSections } from './logic'
import { MeetingActions, type MentorHomeHandlers } from './MentorMeetingRow'

const copy = mentorHomeCopy

/**
 * One "Events you can join" entry: a whole repeating series ("Mondays at 6:00 PM · Repeats weekly", N upcoming) or a one-time
 * event. Sign up opens the sign-up wizard on the next meeting; for a series it starts with "Which meetings?".
 */
export function MentorJoinRow({ entry, handlers }: { entry: JoinEntry; handlers: MentorHomeHandlers }) {
  const [error, setError] = useState('')
  const headingId = `mentor-join-${entry.seriesId ?? entry.nextEventId}`
  const { line, detail } = joinEntryLines(entry)
  const meeting = entry.next
  const subteamTag = showsSubteamTag(entry)
  return <li className="flex flex-col gap-1.5 border-b border-vs-border-subtle py-2 last:border-b-0">
    <Link to={`/events/${meeting.eventId}`} className={cn('flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1 text-vs-text! no-underline! hover:bg-vs-inset-raised', focusRing)}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={headingId} className="text-[15px] font-semibold text-vs-text">{entry.title}</span>
        <span className="text-[13px] text-vs-text-2">{line}</span>
        {detail && <span className="text-[13px] text-vs-muted">{detail}</span>}
      </span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-vs-muted" />
    </Link>
    <div className="flex flex-col gap-2 px-2">
      <span className="flex flex-wrap items-center gap-1.5">
        {subteamTag && <StatusBadge tone="success">{copy.join.yourSubteam}</StatusBadge>}
        <StatusBadge tone="calm">{typeLabel(meeting)}</StatusBadge>
        {meeting.questions.askDrive && <StatusBadge tone="warning">{copy.tags.travel}</StatusBadge>}
        {meeting.questions.askHotel && <StatusBadge tone="warning">{copy.tags.overnight}</StatusBadge>}
        {!subteamTag && <StatusBadge tone={meeting.audience.required ? 'warning' : 'calm'}>{meeting.audience.text}</StatusBadge>}
        {meeting.virtual && <StatusBadge tone="calm">{copy.meeting.virtual}</StatusBadge>}
        {entry.hasSeriesSignup && <StatusBadge tone="success">{copy.join.onSeries}</StatusBadge>}
      </span>
      <span className="flex flex-wrap gap-2 empty:hidden" role="group" aria-labelledby={headingId}>
        <MeetingActions meeting={meeting} action="join" actions={handlers} describedBy={headingId} onError={setError} />
      </span>
    </div>
    {error && <p role="alert" className="m-0 px-2 text-[13px] text-vs-urgent">{error}</p>}
  </li>
}

function Section({ title, none, rows, more, handlers }: { title: string; none: string; rows: JoinEntry[]; more: number; handlers: MentorHomeHandlers }) {
  const id = useId()
  return <section aria-labelledby={id} className="flex flex-col gap-1.5">
    <h3 id={id} className={cn(eyebrow, 'm-0')}>{title}</h3>
    {rows.length
      ? <ul aria-labelledby={id} className={cn(inset, 'm-0 flex list-none flex-col px-1.5 py-0.5')}>{rows.map(entry => <MentorJoinRow key={entry.seriesId ?? entry.nextEventId} entry={entry} handlers={handlers} />)}</ul>
      : <p className="m-0 text-[14px] text-vs-muted">{none}</p>}
    {more > 0 && <p className="m-0 text-[13px] text-vs-muted">{copy.join.more(more)}</p>}
  </section>
}

/** Competitions & trips first, then Meetings (Home shows the first few of each; Your schedule shows all); one line when both are empty. */
export function JoinSectionsList({ sections, handlers }: { sections: JoinSections; handlers: MentorHomeHandlers }) {
  if (!sections.competitions.length && !sections.meetings.length) return <p className="m-0 text-[14px] text-vs-muted">{copy.join.none}</p>
  return <>
    <Section title={copy.join.competitions} none={copy.join.noCompetitions} rows={sections.competitions} more={sections.moreCompetitions} handlers={handlers} />
    <Section title={copy.join.meetings} none={copy.join.noMeetings} rows={sections.meetings} more={sections.moreMeetings} handlers={handlers} />
  </>
}
