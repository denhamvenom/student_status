import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Pin, X } from 'lucide-react'
import { cn } from 'cn'
import { AskCoachButton } from '@/AskCoachButton'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { TileError, TileErrorBoundary } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { dashboardButtonVariants, eyebrow, focusRing, inset } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { formatShortDate } from '../student-home/format'
import { formatWhen } from '../student-home/agenda'
import type { ClockedInData, MentorHomeData, MentorMeeting } from './contract'
import { homeView, meetingPlace, type AnswerItem } from './logic'
import { MentorSignupWizard, type MentorActions } from './MentorSignupWizard'
import { blockHeading, EventLinkRow, RowList, Tags } from './rows'
import { WhoIsHere } from './WhoIsHere'

const copy = mentorHomeCopy

/** What the Mentor can do from Home and Schedule: their own sign-ups, plus Try again for the Home query. */
export type MentorHomeHandlers = MentorActions & { retry: () => void }

/** Who's here now (mentorClockedIn.mySubteamClockedIn): its own query, so it loads and fails on its own. */
export type HereState = { data: ClockedInData | Error | undefined; retry: () => void }

export type PinnedMessage = { id: string; title: string | null; body: string; authorName: string }

/** The small pinned-announcement banner: who wrote it and its first line, a link to the Inbox, and Dismiss. */
export function PinnedBannerView({ message, onDismiss }: { message: PinnedMessage; onDismiss: () => void }) {
  return <section aria-label={copy.pinned.region} className={cn(inset, 'flex items-center gap-2 py-1 pr-1 pl-3')}>
    <Pin size={16} aria-hidden="true" className="shrink-0 text-vs-accent-text" />
    <Link to="/inbox" className={cn('flex min-h-11 min-w-0 flex-1 items-center rounded-lg text-[14px] text-vs-text! no-underline!', focusRing)}>
      <span className="line-clamp-2"><b>{message.authorName}:</b> {message.title ?? message.body}<span className="sr-only"> ({copy.pinned.open})</span></span>
    </Link>
    <button type="button" aria-label={copy.pinned.dismiss} onClick={onDismiss} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'md' }), 'size-11 px-0')}><X size={18} aria-hidden="true" /></button>
  </section>
}

/** Next event: title, day and time, place and "You're going". The whole card opens the event; no buttons. */
function NextEvent({ next }: { next: MentorMeeting | null }) {
  if (!next) return <DashboardTile tone="quiet" className="gap-1.5" aria-label={copy.next.label}>
    <p className={cn(eyebrow, 'm-0')}>{copy.next.label}</p>
    <p className="m-0 text-[17px] font-semibold text-vs-heading">{copy.next.none}</p>
    <p className="m-0 text-[14px] text-vs-text-2">{copy.next.noneDetail}</p>
  </DashboardTile>
  return <DashboardTile tone="urgent" className="p-0!" aria-label={copy.next.label}>
    <Link to={`/events/${next.eventId}`} className={cn('flex min-h-11 flex-col gap-1 rounded-tile p-4 text-vs-text! no-underline! hover:bg-vs-inset/40', focusRing)}>
      <span className={eyebrow}>{copy.next.label}</span>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading text-[24px] leading-tight text-vs-heading">{next.title}</span>
        <StatusBadge tone="success">✓ {copy.next.going}</StatusBadge>
      </span>
      <span className="text-[15px] text-vs-text">{formatWhen(next.startsAt, next.endsAt)}</span>
      <span className="text-[14px] text-vs-text-2">{meetingPlace(next)}</span>
    </Link>
  </DashboardTile>
}

/** One Needs your answer row: title, date and why, and one Answer button that opens the sign-up wizard. */
function AnswerRow({ item, actions }: { item: AnswerItem; actions: MentorActions }) {
  const [open, setOpen] = useState(false)
  const { meeting } = item
  return <li className="flex items-center gap-3 border-b border-vs-border-subtle px-2 py-2 last:border-b-0">
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[15px] font-semibold text-vs-text">{meeting.title}</span>
      <span className="text-[13px] text-vs-text-2">{formatShortDate(meeting.startsAt)} · {item.reason}</span>
    </span>
    <button type="button" aria-label={copy.answer.buttonLabel(meeting.title)} onClick={() => setOpen(true)} className={dashboardButtonVariants({ tone: 'primary', size: 'md' })}>{copy.answer.button}</button>
    <MentorSignupWizard meeting={meeting} mode={open ? item.mode : null} actions={actions} onClose={() => setOpen(false)} />
  </li>
}

/** Needs your answer: shown only when an invitation waits or a drive / hotel answer is missing. */
export function NeedsAnswer({ items, actions }: { items: readonly AnswerItem[]; actions: MentorActions }) {
  const id = useId()
  if (!items.length) return null
  return <DashboardTile tone="quiet" aria-labelledby={id} className="gap-2">
    <h2 id={id} className={blockHeading}>{copy.answer.title}</h2>
    <ul className={cn(inset, 'm-0 flex list-none flex-col px-1.5 py-0.5')}>{items.map(item => <AnswerRow key={`${item.mode}:${item.meeting.eventId}`} item={item} actions={actions} />)}</ul>
  </DashboardTile>
}

function ComingUp({ rows }: { rows: ReturnType<typeof homeView>['comingUp'] }) {
  const id = useId()
  if (!rows.length) return null
  return <DashboardTile aria-labelledby={id} className="gap-2">
    <h2 id={id} className={blockHeading}>{copy.comingUp.title}</h2>
    <RowList>{rows.map(({ meeting, tags }) => <EventLinkRow key={meeting.eventId} to={`/events/${meeting.eventId}`} title={meeting.title} sub={formatShortDate(meeting.startsAt)} tags={<Tags tags={tags} />} />)}</RowList>
    <Link to="/invited#going" className="inline-flex min-h-11 items-center gap-1 self-start text-[14px] font-semibold">{copy.comingUp.seeAll}<ArrowRight size={15} aria-hidden="true" /></Link>
  </DashboardTile>
}

/** A small link: "12 events you could help with", opening Schedule › Join. Hidden when there is nothing to join. */
function HelpLink({ count }: { count: number }) {
  if (count <= 0) return null
  return <Link to="/invited#join" className="inline-flex min-h-11 items-center gap-1 self-start text-[13px] font-semibold">{copy.helpTile(count)}<ArrowRight size={14} aria-hidden="true" /></Link>
}

export type MentorHomeBlocksProps = {
  now: number
  /** mentorHome.mentorHome: undefined while loading, an Error when it failed. */
  data: MentorHomeData | Error | undefined
  handlers: MentorHomeHandlers
  here: HereState
  /** The sign-in email, passed to Ask a Coach so a reply reaches the Mentor. */
  email?: string
}

/**
 * The Mentor Home blocks, in order: Next event, Who's here now, Needs your answer (only when something waits), Coming up (the
 * next three) and the events-you-could-help-with tile. Shared by Mentor Home and the Travel Lead's My schedule.
 */
export function MentorHomeBlocks({ now, data, handlers, here }: Omit<MentorHomeBlocksProps, 'email'>) {
  const loading = data === undefined
  const failed = data instanceof Error
  const view = loading || failed ? null : homeView(data, now)
  const guard = (title: string, node: ReactNode) => <TileErrorBoundary title={title} message={copy.states.failed(title)} retryLabel={copy.states.tryAgain} onRetry={handlers.retry}>{node}</TileErrorBoundary>
  return <>
    {/* One query feeds every block but Who's here now, so a failure is one card. */}
    {failed && <TileError title={copy.states.homeTitle} message={copy.states.homeFailed} retryLabel={copy.states.tryAgain} onRetry={handlers.retry} />}
    {loading && <TileSkeleton label={copy.states.loading(copy.next.label)} />}
    {view && guard(copy.next.label, <NextEvent next={view.next} />)}
    <TileErrorBoundary title={copy.here.title} message={copy.states.failed(copy.here.title)} retryLabel={copy.states.tryAgain} onRetry={here.retry}><WhoIsHere data={here.data} onRetry={here.retry} /></TileErrorBoundary>
    {view && guard(copy.answer.title, <NeedsAnswer items={view.needsAnswer} actions={handlers} />)}
    {view && guard(copy.comingUp.title, <ComingUp rows={view.comingUp} />)}
    {view && <HelpLink count={view.joinCount} />}
    {!loading && !failed && data.truncated && <p className="m-0 text-[13px] text-vs-muted">{copy.states.truncated}</p>}
  </>
}

export type MentorHomeViewProps = MentorHomeBlocksProps & {
  name: string
  /** The pinned-announcement banner (PinnedBanner); the preview passes PinnedBannerView or nothing. */
  banner?: ReactNode
}

/**
 * Mentor Home, phone first: an optional pinned-announcement banner, the date and greeting, then the Home blocks. Tablet and
 * desktop keep the same single column, at most 720px wide.
 */
export function MentorHomeView({ name, banner, email, ...blocks }: MentorHomeViewProps) {
  return <div className="flex min-w-0 flex-col gap-3 pb-24 font-sans text-vs-text md:mx-auto md:w-full md:max-w-[720px] lg:pb-6">
    {banner}
    <h1 className="m-0! font-sans! text-[14px]! leading-normal! font-semibold! text-vs-text-2">{copy.greeting(formatShortDate(blocks.now), name)}</h1>
    <MentorHomeBlocks {...blocks} />
    <div className="flex flex-wrap items-center gap-2 pt-1 text-[13px] text-vs-muted"><span>{copy.askCoach}</span><AskCoachButton email={email} /></div>
  </div>
}
