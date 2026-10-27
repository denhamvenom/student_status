import type { ReactNode } from 'react'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { HeroStack, type HeroSlide } from '@/components/dashboard/HeroStack'
import { TileError, TileErrorBoundary } from '@/components/dashboard/TileErrorBoundary'
import { RingsSkeleton, TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { homeCopy } from './copy'
import { formatLongDate } from './format'
import { hasOwnWork, heroCards, visibleAnnouncements, type HeroCard } from './logic'
import { AnnouncementCard } from './tiles/AnnouncementCard'
import { BalanceTile } from './tiles/BalanceTile'
import { CountdownCard } from './tiles/CountdownCard'
import { OpenSignupsTile } from './tiles/OpenSignupsTile'
import { ParticipationTile } from './tiles/ParticipationTile'
import { RoomChoiceCard } from './tiles/RoomChoiceCard'
import { WhatsLeftTile } from './tiles/WhatsLeftTile'
import type { HomeTileSource, StudentHomeHandlers, StudentHomeViewProps } from './types'

const copy = homeCopy

function Guard({ title, source, handlers, surface, children }: { title: string; source: HomeTileSource; handlers: StudentHomeHandlers; surface?: 'tile' | 'hero' | 'compact'; children: ReactNode }) {
  return <TileErrorBoundary title={title} message={copy.states.tileFailed(title)} retryLabel={copy.states.tryAgain} surface={surface} onRetry={() => handlers.retry(source)}>{children}</TileErrorBoundary>
}

function failed(title: string, source: HomeTileSource, handlers: StudentHomeHandlers, surface: 'tile' | 'hero' | 'compact' = 'tile', message = copy.states.tileFailed(title)) {
  return <TileError title={title} message={message} retryLabel={copy.states.tryAgain} surface={surface} onRetry={() => handlers.retry(source)} />
}

function Greeting({ summary, now }: { summary: StudentHomeViewProps['summary']; now: number }) {
  const date = formatLongDate(now)
  if (summary === undefined) return <div aria-hidden="true" className="flex flex-col gap-1.5"><span className="block h-4 w-48 rounded-md bg-vs-inset-raised motion-safe:animate-pulse lg:h-7 lg:w-40" /><span className="hidden h-4 w-72 rounded-md bg-vs-inset-raised motion-safe:animate-pulse lg:block" /></div>
  const headingClass = 'm-0! font-sans! text-[12px]! leading-[1.35]! font-normal! tracking-normal! text-vs-muted lg:font-heading! lg:text-[26px]! lg:leading-none! lg:tracking-[0.01em]! lg:text-vs-heading'
  // Without the summary there is no name; the date still anchors the page.
  if (summary instanceof Error) return <header><h1 className={headingClass}>{date}</h1></header>
  return <header className="flex min-w-0 flex-col gap-1">
    <h1 className={headingClass}>
      <span className="lg:hidden">{copy.greeting.phone(date, summary.greetingName)}</span>
      <span className="hidden lg:inline">{copy.greeting.hey(summary.greetingName)}</span>
    </h1>
    <p className="m-0 hidden text-[13px] leading-[1.4] text-vs-muted lg:block">{hasOwnWork(summary.whatsLeft) ? copy.greeting.needsAttention(date) : copy.greeting.allSet(date)}</p>
  </header>
}

function Hero({ summary, announcements, now, handlers }: Pick<StudentHomeViewProps, 'summary' | 'announcements' | 'now' | 'handlers'>) {
  if (summary === undefined || announcements === undefined) return <TileSkeleton surface="hero" rows={3} label={copy.states.loading(copy.hero.region)} className="h-full" />
  // Pinned messages are secondary: if they fail, Home still shows room choice and the countdown.
  const pinned = announcements instanceof Error ? [] : announcements
  if (summary instanceof Error && pinned.length === 0) return failed(copy.hero.region, 'summary', handlers, 'hero')
  const cards: HeroCard[] = summary instanceof Error
    ? visibleAnnouncements(pinned, now).map(announcement => ({ kind: 'announcement', key: `pin:${announcement.id}`, announcement }))
    : heroCards(summary, pinned, now)
  if (cards.length === 0) return <DashboardTile surface="hero" tone="quiet" aria-label={copy.hero.region} className="justify-center"><p className="m-0 text-[14px] text-vs-muted">{copy.hero.empty}</p></DashboardTile>
  const slides: HeroSlide[] = cards.map(card => ({
    key: card.key,
    node: card.kind === 'room' ? <RoomChoiceCard room={card.room} now={now} />
      : card.kind === 'announcement' ? <AnnouncementCard announcement={card.announcement} />
      : summary instanceof Error ? null : <CountdownCard target={card.target} summary={summary} now={now} />,
  }))
  return <HeroStack slides={slides} labels={copy.hero} />
}

function Balance({ finance, handlers }: Pick<StudentHomeViewProps, 'finance' | 'handlers'>) {
  if (finance === undefined) return <TileSkeleton surface="compact" rows={0} label={copy.states.loading(copy.balance.label)} />
  if (finance instanceof Error || finance.state === 'failed') return failed(copy.balance.label, 'finance', handlers, 'compact', copy.balance.failed)
  return <Guard title={copy.balance.label} source="finance" handlers={handlers} surface="compact"><BalanceTile finance={finance} /></Guard>
}

/**
 * Student Home, phone first. Phone: greeting line, hero stack, Open signups, What's left,
 * Participation, Balance due. Desktop (≥1024px): greeting row, then a 2fr/1fr grid with the hero
 * on the left, Open signups / What's left / Balance due on the right and Participation full width.
 * The shell supplies the page gutters (14px phone, 28px desktop in the artboards).
 */
export function StudentHomeView({ summary, attendance, announcements, finance, now, handlers }: StudentHomeViewProps) {
  const signups = summary === undefined ? <TileSkeleton label={copy.states.loading(copy.signups.title)} />
    : summary instanceof Error ? failed(copy.signups.title, 'summary', handlers)
    : <Guard title={copy.signups.title} source="summary" handlers={handlers}><OpenSignupsTile signups={summary.openSignups} now={now} handlers={handlers} /></Guard>
  const whatsLeft = summary === undefined ? <TileSkeleton label={copy.states.loading(copy.whatsLeft.title)} />
    : summary instanceof Error ? failed(copy.whatsLeft.title, 'summary', handlers)
    : <Guard title={copy.whatsLeft.title} source="summary" handlers={handlers}><WhatsLeftTile items={summary.whatsLeft} now={now} /></Guard>
  const participation = attendance === undefined ? <RingsSkeleton label={copy.states.loading(copy.participation.title)} />
    : attendance instanceof Error ? failed(copy.participation.title, 'attendance', handlers)
    : <Guard title={copy.participation.title} source="attendance" handlers={handlers}><ParticipationTile attendance={attendance} /></Guard>

  return <div className="flex min-w-0 flex-col gap-2.5 font-sans text-vs-text lg:gap-4">
    <Greeting summary={summary} now={now} />
    <div className="flex min-w-0 flex-col gap-2.5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-4">
      <div className="flex min-w-0 flex-col [&>*]:flex-1">
        <Guard title={copy.hero.region} source="summary" handlers={handlers} surface="hero"><Hero summary={summary} announcements={announcements} now={now} handlers={handlers} /></Guard>
      </div>
      <div className="flex min-w-0 flex-col gap-2.5 lg:gap-[14px]">
        {signups}
        {whatsLeft}
        {/* Balance due sits in the right column on desktop and last on phones; only one copy is ever displayed. */}
        <div className="hidden lg:block"><Balance finance={finance} handlers={handlers} /></div>
      </div>
      <div className="min-w-0 lg:col-span-2">{participation}</div>
      <div className="lg:hidden"><Balance finance={finance} handlers={handlers} /></div>
    </div>
  </div>
}
