import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { cn } from 'cn'
import { TileError } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { focusRing } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { formatWhen } from '../student-home/agenda'
import { useNow } from '../student-home/useNow'
import type { MentorHomeData } from './contract'
import { useMentorHomeData } from './MentorHome'
import { NeedsAnswer, type MentorHomeHandlers } from './MentorHomeView'
import { JoinSectionsList } from './MentorJoinRow'
import { createdList, goingList, joinSections, meetingLine, needsAnswer, SCHEDULE_TABS, seriesLine, subteamsList, tabFromHash, type ScheduleTab } from './logic'
import { blockHeading, EventLinkRow, RowList, Tags } from './rows'

const copy = mentorHomeCopy

function Going({ data, now, handlers }: { data: MentorHomeData; now: number; handlers: MentorHomeHandlers }) {
  const rows = goingList(data, now)
  return <>
    <NeedsAnswer items={needsAnswer(data, now)} actions={handlers} />
    {rows.length
      ? <RowList label={copy.schedule.tabs.going}>{rows.map(({ meeting, skipping }) => <EventLinkRow key={meeting.eventId} to={`/events/${meeting.eventId}`} title={meeting.title}
        sub={skipping ? `${formatWhen(meeting.startsAt, meeting.endsAt)} · ${copy.schedule.skipping}` : meetingLine(meeting)} />)}</RowList>
      : <p className="m-0 text-[14px] text-vs-muted">{copy.schedule.goingNone}</p>}
  </>
}

function Created({ data, now, createHint }: { data: MentorHomeData; now: number; createHint: string }) {
  const rows = createdList(data.created, now)
  return <>
    {rows.length
      ? <RowList label={copy.schedule.tabs.created}>{rows.map(meeting => <EventLinkRow key={meeting.eventId} to={`/events/${meeting.eventId}`} title={meeting.title} sub={meetingLine(meeting)} struck={meeting.cancelled}
        tags={meeting.cancelled ? <Tags tone="urgent" tags={[copy.created.canceled]} /> : undefined} />)}</RowList>
      : <p className="m-0 text-[14px] text-vs-muted">{copy.schedule.createdNone}</p>}
    {data.createdSeries.length > 0 && <div className="flex flex-col gap-1">
      <h2 className={blockHeading}>{copy.created.seriesTitle}</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">{data.createdSeries.map(series => <li key={series.seriesId} className="text-[14px] text-vs-text-2"><span className="font-semibold text-vs-text">{series.name}</span> · {seriesLine(series)}</li>)}</ul>
    </div>}
    <p className="m-0 text-[13px] text-vs-muted">{createHint}</p>
  </>
}

/** Join: the Mentor's subteams and whole-team items; "Show all subteams" widens it. The line only appears when something is hidden. */
function JoinPanel({ data, now, handlers }: { data: MentorHomeData; now: number; handlers: MentorHomeHandlers }) {
  const [showAll, setShowAll] = useState(false)
  const sections = joinSections(data.joinable, now, data.subteams, showAll)
  const list = subteamsList(data.subteams)
  return <>
    <p className="m-0 text-[14px] text-vs-text-2">{copy.schedule.joinHint}</p>
    {(sections.hidden > 0 || showAll) && <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-vs-muted">
      <span>{showAll ? copy.scope.showingAll : copy.scope.showing(list)}</span>
      <button type="button" aria-pressed={showAll} onClick={() => setShowAll(value => !value)} className={cn('min-h-11 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-vs-accent-text underline', focusRing)}>{showAll ? copy.scope.mine : copy.scope.all}</button>
    </p>}
    <JoinSectionsList sections={sections} actions={handlers} />
  </>
}

/** Tabs that follow the URL hash (#going, #join, #created) so Home's "→" links land on the right one. Arrow keys move between tabs. */
function ScheduleTabs({ tab, onChange, idPrefix }: { tab: ScheduleTab; onChange: (next: ScheduleTab) => void; idPrefix: string }) {
  const refs = useRef<Partial<Record<ScheduleTab, HTMLButtonElement | null>>>({})
  const move = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? SCHEDULE_TABS.length - 1 : step ? (SCHEDULE_TABS.indexOf(tab) + step + SCHEDULE_TABS.length) % SCHEDULE_TABS.length : -1
    if (index < 0) return
    event.preventDefault()
    const next = SCHEDULE_TABS[index]
    onChange(next)
    refs.current[next]?.focus()
  }
  return <div role="tablist" aria-label={copy.schedule.tabsLabel} onKeyDown={move} className="flex rounded-[12px] border border-vs-border-subtle bg-vs-inset p-1">
    {SCHEDULE_TABS.map(name => <button key={name} ref={node => { refs.current[name] = node }} type="button" role="tab" id={`${idPrefix}-tab-${name}`} aria-controls={`${idPrefix}-panel`}
      aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onClick={() => onChange(name)}
      className={cn('min-h-11 flex-1 cursor-pointer rounded-[9px] border-0 bg-transparent px-2 text-[14px] font-semibold text-vs-text-2!', focusRing,
        'aria-selected:bg-vs-card aria-selected:text-vs-heading! aria-selected:shadow-vs-compact')}>{copy.schedule.tabs[name]}</button>)}
  </div>
}

/**
 * Schedule (/invited) for Mentors and Travel Leads: Going (their schedule, with anything that needs an answer first), Join
 * (Competitions & trips, then Meetings & events, one row per series) and Created by me.
 */
export function MentorSchedule({ createHint }: { createHint: string }) {
  const now = useNow()
  const { data, handlers } = useMentorHomeData(now)
  const location = useLocation()
  const navigate = useNavigate()
  const idPrefix = useId()
  const tab = tabFromHash(location.hash)
  const choose = (next: ScheduleTab) => { if (next !== tab) void navigate({ hash: `#${next}` }, { replace: true }) }
  let panel
  if (data === undefined) panel = <TileSkeleton label={copy.states.loading(copy.schedule.title)} />
  else if (data instanceof Error) panel = <TileError title={copy.states.homeTitle} message={copy.states.homeFailed} retryLabel={copy.states.tryAgain} onRetry={handlers.retry} />
  else if (tab === 'join') panel = <JoinPanel data={data} now={now} handlers={handlers} />
  else if (tab === 'created') panel = <Created data={data} now={now} createHint={createHint} />
  else panel = <Going data={data} now={now} handlers={handlers} />
  return <div className="flex min-w-0 flex-col gap-3 pb-24 font-sans text-vs-text md:mx-auto md:w-full md:max-w-[720px] lg:pb-6">
    <h1 className="m-0! font-heading! text-[28px]! font-normal! text-vs-heading">{copy.schedule.title}</h1>
    <ScheduleTabs tab={tab} onChange={choose} idPrefix={idPrefix} />
    <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${tab}`} className="flex flex-col gap-3">
      {data !== undefined && !(data instanceof Error) && data.truncated && <p className="m-0 text-[13px] text-vs-muted">{copy.states.listTruncated}</p>}
      {panel}
    </div>
  </div>
}
