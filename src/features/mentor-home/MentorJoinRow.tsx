import { useId, useState } from 'react'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import type { JoinEntry } from './contract'
import { joinEntryLines, MAX_TAGS, showsSubteamTag, type JoinSections } from './logic'
import { MeetingActions } from './MentorMeetingRow'
import type { MentorActions } from './MentorSignupWizard'
import { Tags } from './rows'

const copy = mentorHomeCopy

/**
 * One Schedule › Join row: a whole repeating series ("Mondays at 6:00 PM · Repeats weekly", N upcoming) or a one-time event,
 * and Sign up. Sign up opens the sign-up wizard on the next meeting; for a series it starts with "Which meetings?".
 */
export function MentorJoinRow({ entry, actions }: { entry: JoinEntry; actions: MentorActions }) {
  const [error, setError] = useState('')
  const headingId = `mentor-join-${entry.seriesId ?? entry.nextEventId}`
  const { line, detail } = joinEntryLines(entry)
  const meeting = entry.next
  const tags = [...(showsSubteamTag(entry) ? [copy.join.yourSubteam] : []), ...(meeting.questions.askDrive || meeting.questions.askHotel ? [copy.tags.travel] : [])].slice(0, MAX_TAGS)
  return <li className="flex flex-col gap-1 border-b border-vs-border-subtle px-2 py-2.5 last:border-b-0">
    <div className="flex items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={headingId} className="text-[15px] font-semibold text-vs-text">{entry.title}</span>
        <span className="text-[13px] text-vs-text-2">{line}</span>
        {detail && <span className="text-[13px] text-vs-muted">{detail}</span>}
        {(tags.length > 0 || entry.hasSeriesSignup) && <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Tags tags={tags} />
          {entry.hasSeriesSignup && <span className="text-[12px] font-semibold text-vs-success">{copy.join.onSeries}</span>}
        </span>}
      </span>
      <MeetingActions meeting={meeting} action="join" actions={actions} size="md" label={copy.join.signUpLabel(entry.title)} onError={setError} />
    </div>
    {error && <p role="alert" className="m-0 text-[13px] text-vs-urgent">{error}</p>}
  </li>
}

function Group({ title, none, rows, actions }: { title: string; none: string; rows: JoinEntry[]; actions: MentorActions }) {
  const id = useId()
  return <section aria-labelledby={id} className="flex flex-col gap-2">
    <h2 id={id} className="m-0! font-sans! text-[16px]! font-bold! text-vs-heading">{title}</h2>
    {rows.length
      ? <DashboardTile className="px-1.5! py-1!"><ul aria-labelledby={id} className="m-0 flex list-none flex-col p-0">{rows.map(entry => <MentorJoinRow key={entry.seriesId ?? entry.nextEventId} entry={entry} actions={actions} />)}</ul></DashboardTile>
      : <p className="m-0 text-[14px] text-vs-muted">{none}</p>}
  </section>
}

/** Competitions & trips first, then Meetings & events; one line when both are empty. */
export function JoinSectionsList({ sections, actions }: { sections: JoinSections; actions: MentorActions }) {
  if (!sections.competitions.length && !sections.meetings.length) return <p className="m-0 text-[14px] text-vs-muted">{copy.join.none}</p>
  return <>
    <Group title={copy.join.competitions} none={copy.join.noCompetitions} rows={sections.competitions} actions={actions} />
    <Group title={copy.join.meetings} none={copy.join.noMeetings} rows={sections.meetings} actions={actions} />
  </>
}
