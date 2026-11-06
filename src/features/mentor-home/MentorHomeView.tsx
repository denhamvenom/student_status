import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarPlus } from 'lucide-react'
import { cn } from 'cn'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { TileError, TileErrorBoundary } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { dashboardButtonVariants, eyebrow, inset } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { formatLongDate } from '../student-home/format'
import type { MentorHomeData } from './contract'
import { MeetingActions, MeetingBadges, MentorMeetingRow, type MentorHomeHandlers, type RowAction } from './MentorMeetingRow'
import { createdList, joinable, meetingLine, pendingCount, scheduleView, seriesLine, startsWhen, subteamsLine } from './logic'

const copy = mentorHomeCopy

export type MentorHomeViewProps = {
  name: string
  now: number
  /** mentorHome.mentorHome: undefined while loading, an Error when it failed. */
  data: MentorHomeData | Error | undefined
  handlers: MentorHomeHandlers
  /** Pinned staff announcements (StaffHomeAnnouncements); the preview leaves it out. */
  announcements?: ReactNode
}

function List({ rows, action, handlers, label }: { rows: MentorHomeData['scheduled']; action: RowAction; handlers: MentorHomeHandlers; label: string }) {
  return <ul aria-label={label} className={cn(inset, 'm-0 flex list-none flex-col px-1.5 py-0.5')}>{rows.map(row => <MentorMeetingRow key={row.eventId} meeting={row} action={action} handlers={handlers} />)}</ul>
}

const more = (count: number, text: (count: number) => string) => count > 0 ? <p className="m-0 text-[13px] text-vs-muted">{text(count)}</p> : null
const seeAll = (to: string, label: string) => <Link to={to} className="inline-flex min-h-11 items-center self-start text-[14px] font-semibold">{label}</Link>

/** The one big action every Mentor has: open the New meeting wizard in Mentor mode. */
function CreateMeeting() {
  return <DashboardTile surface="hero" tone="hero" className="gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="m-0! font-heading! text-[24px]! font-normal! text-vs-heading lg:text-[28px]!">{copy.create.title}</h2>
      <p className="m-0 max-w-[52ch] text-[14px] text-vs-text-2">{copy.create.detail}</p>
    </div>
    <Link to="/events/new" className={cn(dashboardButtonVariants({ tone: 'primary', size: 'lg' }), 'w-full gap-2 lg:w-auto')}><CalendarPlus size={18} aria-hidden="true" />{copy.create.button}</Link>
  </DashboardTile>
}

function NextUp({ data, now, handlers }: { data: MentorHomeData; now: number; handlers: MentorHomeHandlers }) {
  const { next } = scheduleView(data, now)
  const [error, setError] = useState('')
  if (!next) return <DashboardTile tone="quiet" className="gap-2" aria-label={copy.next.region}>
    <p className={cn(eyebrow, 'm-0')}>{copy.next.label}</p>
    <h2 className="m-0! font-heading! text-[22px]! font-normal! text-vs-heading">{copy.next.none}</h2>
    <p className="m-0 text-[14px] text-vs-text-2">{copy.next.noneDetail}</p>
  </DashboardTile>
  return <DashboardTile tone="urgent" className="gap-2.5 lg:px-6" aria-label={copy.next.region}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className={cn(eyebrow, 'm-0')}>{copy.next.label}</p><StatusBadge tone="warning">{copy.next.startsIn(startsWhen(next.startsAt, now))}</StatusBadge></div>
    <h2 className="m-0! font-heading! text-[26px]! font-normal! text-vs-heading lg:text-[32px]!">{next.title}</h2>
    <p className="m-0 text-[15px] text-vs-text">{meetingLine(next)}</p>
    <MeetingBadges meeting={next} />
    <div className="flex flex-wrap gap-2" role="group" aria-label={next.title}>
      <Link to={`/events/${next.eventId}`} className={dashboardButtonVariants({ tone: 'soft' })}>{copy.next.open}</Link>
      <MeetingActions meeting={next} action="going" actions={handlers} size="md" onError={setError} />
    </div>
    {error && <p role="alert" className="m-0 text-[13px] text-vs-urgent">{error}</p>}
  </DashboardTile>
}

function Scheduled({ data, now, handlers }: { data: MentorHomeData; now: number; handlers: MentorHomeHandlers }) {
  const id = useId()
  const view = scheduleView(data, now)
  const empty = !view.next && !view.invites.length && !view.skipped.length
  return <DashboardTile tone={view.invites.length ? 'urgent' : 'quiet'} aria-labelledby={id} className="gap-3">
    <TileTitle id={id}>{copy.scheduled.title}</TileTitle>
    {view.invites.length > 0 && <div className="flex flex-col gap-1.5">
      <p className={cn(eyebrow, 'm-0')}>{copy.scheduled.invitesHeading}</p>
      <List rows={view.invites} action="invite" handlers={handlers} label={copy.scheduled.invitesHeading} />
    </div>}
    {view.going.length > 0 && <div className="flex flex-col gap-1.5">
      <p className={cn(eyebrow, 'm-0')}>{copy.scheduled.goingHeading}</p>
      <List rows={view.going} action="going" handlers={handlers} label={copy.scheduled.goingHeading} />
      {more(view.moreGoing, copy.scheduled.more)}
    </div>}
    {view.skipped.length > 0 && <div className="flex flex-col gap-1.5">
      <p className={cn(eyebrow, 'm-0')}>{copy.series.skippedHeading}</p>
      <List rows={view.skipped} action="skipped" handlers={handlers} label={copy.series.skippedHeading} />
    </div>}
    {empty && <p className="m-0 text-[14px] text-vs-muted">{copy.scheduled.none}</p>}
    {view.next && !view.going.length && <p className="m-0 text-[13px] text-vs-muted">{copy.scheduled.nothingElse}</p>}
    <Link to="/invited" className="inline-flex min-h-11 items-center self-start text-[14px] font-semibold">{copy.scheduled.seeAll}</Link>
  </DashboardTile>
}

function Joinable({ data, now, handlers }: { data: MentorHomeData; now: number; handlers: MentorHomeHandlers }) {
  const id = useId()
  const { shown, more: extra } = joinable(data.signUpAvailable, now)
  return <DashboardTile tone="quiet" aria-labelledby={id} className="gap-3">
    <TileTitle id={id}>{copy.join.title}</TileTitle>
    {shown.length ? <List rows={shown} action="join" handlers={handlers} label={copy.join.title} /> : <p className="m-0 text-[14px] text-vs-muted">{copy.join.none}</p>}
    {more(extra, copy.join.more)}
    {extra > 0 && seeAll('/invited#join', copy.join.seeAll)}
  </DashboardTile>
}

function Created({ data, now, handlers }: { data: MentorHomeData; now: number; handlers: MentorHomeHandlers }) {
  const id = useId()
  const { shown, more: extra } = createdList(data.created, now)
  return <DashboardTile tone="quiet" aria-labelledby={id} className="gap-3">
    <TileTitle id={id}>{copy.created.title}</TileTitle>
    {shown.length ? <List rows={shown} action="created" handlers={handlers} label={copy.created.title} /> : <p className="m-0 text-[14px] text-vs-muted">{copy.created.none}</p>}
    {more(extra, copy.created.more)}
    {extra > 0 && seeAll('/invited#created', copy.created.seeAll)}
    {data.createdSeries.length > 0 && <div className="flex flex-col gap-1">
      <p className={cn(eyebrow, 'm-0')}>{copy.created.seriesTitle}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">{data.createdSeries.map(series => <li key={series.seriesId} className="text-[13px] text-vs-text-2"><span className="font-semibold text-vs-text">{series.name}</span> · {seriesLine(series)}</li>)}</ul>
    </div>}
  </DashboardTile>
}

/** Subteams and the profile stay reachable even while the meetings load or fail. */
function About({ subteams }: { subteams: readonly string[] | null }) {
  const id = useId()
  return <DashboardTile surface="compact" aria-labelledby={id} className="gap-2">
    <TileTitle id={id}>{copy.about.title}</TileTitle>
    {subteams && <p className="m-0 text-[14px] text-vs-text">{subteamsLine(subteams)}</p>}
    <div className="flex flex-wrap gap-2">
      <Link to="/myprofile" className={dashboardButtonVariants({ tone: 'soft', size: 'sm' })}>{copy.about.profile}</Link>
      <Link to="/report" className={dashboardButtonVariants({ tone: 'ghost', size: 'sm' })}>{copy.about.report}</Link>
    </div>
  </DashboardTile>
}

/**
 * Mentor Home, phone first (390px): greeting, Create a meeting, Next up, Where you're scheduled (invitations first),
 * Events and meetings you can join, Meetings you created, About you, then pinned announcements. Tablet: the phone layout, at most
 * 720px wide and centered. Desktop (≥1024px): Create a meeting full width, then a 2fr/1fr grid with the schedule on the
 * left and joining / created / about on the right.
 */
export function MentorHomeView({ name, now, data, handlers, announcements }: MentorHomeViewProps) {
  const failed = data instanceof Error
  const loading = data === undefined
  const guard = (title: string, node: ReactNode) => <TileErrorBoundary title={title} message={copy.states.failed(title)} retryLabel={copy.states.tryAgain} onRetry={handlers.retry}>{node}</TileErrorBoundary>
  const tile = (title: string, render: (data: MentorHomeData) => ReactNode) => loading ? <TileSkeleton label={copy.states.loading(title)} />
    : failed ? null : guard(title, render(data))
  const date = formatLongDate(now)
  return <div className="flex min-w-0 flex-col gap-3 pb-24 font-sans text-vs-text md:mx-auto md:w-full md:max-w-[720px] lg:mx-0 lg:max-w-none lg:gap-4 lg:pb-6">
    <header className="flex min-w-0 flex-col gap-1">
      <h1 className="m-0! font-heading! text-[26px]! font-normal! text-vs-heading lg:text-[34px]!">{copy.greeting(name)}</h1>
      <p className="m-0 text-[13px] text-vs-muted">{loading || failed ? date : copy.subtitle(date, pendingCount(data, now))}</p>
    </header>
    <CreateMeeting />
    {/* One query feeds every list, so a failure is one card instead of four. */}
    {failed && <TileError title={copy.states.homeTitle} message={copy.states.homeFailed} retryLabel={copy.states.tryAgain} onRetry={handlers.retry} />}
    <div className="flex min-w-0 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:gap-4">
      <div className="flex min-w-0 flex-col gap-3 empty:hidden lg:gap-4">
        {tile(copy.next.region, data => <NextUp data={data} now={now} handlers={handlers} />)}
        {tile(copy.scheduled.title, data => <Scheduled data={data} now={now} handlers={handlers} />)}
      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
        {tile(copy.join.title, data => <Joinable data={data} now={now} handlers={handlers} />)}
        {tile(copy.created.title, data => <Created data={data} now={now} handlers={handlers} />)}
        <About subteams={loading || failed ? null : data.subteams} />
      </div>
    </div>
    {!loading && !failed && data.truncated && <p className="m-0 text-[13px] text-vs-muted">{copy.states.truncated}</p>}
    {announcements}
  </div>
}
