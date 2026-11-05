import { useId } from 'react'
import { Link } from 'react-router'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { HeroStack } from '@/components/dashboard/HeroStack'
import { ProgressRings } from '@/components/dashboard/ProgressRings'
import { TileError, TileErrorBoundary } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { dashboardButtonVariants, inset } from '@/components/dashboard/styles'
import { officialInstructions } from '@/FirstRegistration'
import { AnnouncementCard } from '../student-home/tiles/AnnouncementCard'
import { formatLongDate, formatMoney, formatShortDate } from '../student-home/format'
import type { WhatsLeftItem } from '../student-home/contract'
import type { ParentHomeFinance, ParentHomeSummary, ParentPinnedAnnouncement } from './contract'
import type { AgendaEvent } from '../student-home/agenda'
import { reportCopy } from '../attendance-report/copy'
import { RequiredBadge, ThisWeekList } from '../student-home/tiles/NextUpCard'
import { groupWork, paidPercent, parentAllSet, parentItemAction, parentItemHref, parentNext, parentWeek, type ParentNext } from './logic'

export type ParentHomeSource = 'summary' | 'announcements' | 'finance' | 'events'
type Loadable<T> = T | Error | undefined
export type ParentHomeViewProps = { studentName: string; now: number; summary: Loadable<ParentHomeSummary>; announcements: Loadable<ParentPinnedAnnouncement[]>; finance: Loadable<ParentHomeFinance>; /** app.listEvents for Next and This week; missing or failed only hides those details. */ events?: Loadable<AgendaEvent[]>; retry: (source: ParentHomeSource) => void }
const errorText = (title: string) => `${title} could not load. Try again. If it keeps happening, contact a Coach.`
const labels = { region: 'Highlights', previous: 'Previous card', next: 'Next card', showCard: (n: number, total: number) => `Show card ${n} of ${total}`, slide: (n: number, total: number) => `${n} of ${total}` }

function ItemLink({ item, help = false, studentName = 'your student', studentId }: { item: WhatsLeftItem; help?: boolean; studentName?: string; studentId?: string }) {
  const href = help ? (item.owner === 'student' && item.eventId ? `/events/${item.eventId}` : null) : parentItemHref(item, studentId)
  const label = item.kind === 'healthProfile' ? 'Health information' : item.kind === 'firstRegistration' || item.kind === 'firstVerification' ? 'FIRST registration' : item.kind === 'permissionForm' || item.kind === 'permissionReview' ? 'Permission form' : item.kind === 'requiredPayment' ? 'Balance due' : item.kind === 'studentSetup' ? 'Finish setup' : item.kind === 'roomChoice' ? 'Choose a room' : item.kind === 'signupApproval' ? 'Event signup' : item.label ?? 'Event requirement'
  const explanation = item.kind === 'firstRegistration' ? 'Create or finish the FIRST account and Consent & Release form.' : item.owner === 'student' && item.kind === 'roomChoice' ? `Ask ${studentName} to choose a room.` : null
  const content = <><span className="font-semibold">{label}</span>{item.eventName && <span className="text-vs-muted"> · {item.eventName}</span>}{item.dueAt && <span className="block text-[13px] text-vs-text-2">{item.dateKind === 'eventStart' ? 'Event starts' : 'Due'} {formatShortDate(item.dueAt)}</span>}{explanation && <span className="block text-[13px] text-vs-text-2">{explanation}</span>}</>
  const className = `${inset} rounded-lg px-3 py-2 text-[13px] text-vs-text-2`
  return <div className={className}>{content}{href && <div className="mt-2 flex flex-wrap gap-2"><Link to={href} className={dashboardButtonVariants({ tone: 'soft' })}>{help ? 'Open event' : parentItemAction(item) ?? 'Open event'}</Link>{!help && item.kind === 'firstRegistration' && <a href={officialInstructions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">FIRST registration site</a>}</div>}</div>
}

/** Required or Optional, and what it means for this Student. */
function RequiredLine({ required, studentName }: { required: boolean; studentName: string }) {
  return <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-vs-muted"><RequiredBadge required={required} /><span>{required ? `${studentName} is expected to go.` : `${studentName} can choose whether to go.`}</span></p>
}

/** "Next: Tue Nov 3, 6–8 PM · DSHS STEM Center (on site) · Free · Signed up" with Required/Optional. */
function NextLine({ next, studentName }: { next: ParentNext; studentName: string }) {
  return <div className="flex flex-col gap-1">
    <p className="m-0 text-[14px] text-vs-text-2">Next: <Link to={`/events/${next.eventId}`} className="inline-flex min-h-11 items-center font-semibold">{next.name}</Link></p>
    <p className="m-0 text-[14px] text-vs-text">{next.line}</p>
    {next.required !== null && <RequiredLine required={next.required} studentName={studentName} />}
  </div>
}

function SummarySlides({ summary, announcements, studentName, now, events }: { summary: ParentHomeSummary; announcements: ParentPinnedAnnouncement[]; studentName: string; now: number; events: AgendaEvent[] | null }) {
  const parent = groupWork(summary.whatsLeft).parent
  const next = parentNext(summary, events ?? [], now)
  const slides = [
    { key: 'parent', node: <DashboardTile surface="hero" tone={parent.length ? 'urgent' : 'done'} aria-label="Highlights" className="min-h-[235px] justify-center gap-3 lg:min-h-[275px] lg:px-8">
      <p className="m-0 text-[11px] font-bold tracking-wider text-vs-muted uppercase">Highlights</p>
      <h2 className="m-0! font-heading! text-[28px]! font-normal! text-vs-heading lg:text-[38px]!">{parent.length ? `${studentName} still needs…` : "You're all set"}</h2>
      {parent.length ? <ul className="m-0 flex flex-col gap-2 p-0 list-none">{parent.map(item => <li key={item.key}><ItemLink item={item} studentId={summary.studentId} /></li>)}</ul> : <p className="m-0 text-[14px] text-vs-muted">Nothing left for you right now.</p>}
      {next && <NextLine next={next} studentName={studentName} />}
      {events && <ThisWeekList events={parentWeek(events, next, now)} />}
    </DashboardTile> },
    ...(next ? [{ key: 'event', node: <DashboardTile surface="hero" tone="quiet" className="min-h-[235px] justify-center gap-3 lg:min-h-[275px] lg:px-8"><p className="m-0 text-[11px] font-bold tracking-wider text-vs-muted uppercase">Next event</p><h2 className="m-0! font-heading! text-[28px]! font-normal! text-vs-heading lg:text-[38px]!">{next.name}</h2><p className="m-0 text-[14px] text-vs-text-2">{next.line}</p>{next.required !== null && <RequiredLine required={next.required} studentName={studentName} />}<Link to={`/events/${next.eventId}`} className={dashboardButtonVariants({ tone: 'soft' })}>Open event</Link></DashboardTile> }] : []),
    ...announcements.map(message => ({ key: `announcement:${message.id}`, node: <AnnouncementCard announcement={message} /> })),
  ]
  return <HeroStack slides={slides} labels={labels} />
}

function StudentWork({ items, studentName }: { items: WhatsLeftItem[]; studentName: string }) {
  const id = useId()
  const { student, coach, parent } = groupWork(items)
  return <DashboardTile tone="quiet" aria-labelledby={id} className="gap-3"><TileTitle id={id}>What {studentName} needs to do</TileTitle>{student.length ? <ul className="m-0 flex flex-col gap-2 p-0 list-none">{student.map(item => <li key={item.key}><ItemLink item={item} help studentName={studentName} /></li>)}</ul> : <p className="m-0 text-[13px] text-vs-muted">{parent.length ? `Nothing for ${studentName} to do right now. Your items are in Highlights.` : `Nothing left for ${studentName} right now.`}</p>}{coach.length > 0 && <div className="border-t border-vs-border pt-3"><p className="m-0 mb-2 text-[13px] font-semibold text-vs-text-2">Waiting for Coach approval</p><p className="m-0 mb-2 text-[13px] text-vs-text-2">Nothing to do while a Coach reviews it.</p><ul className="m-0 flex flex-col gap-2 p-0 list-none">{coach.map(item => <li key={item.key}><ItemLink item={item} help /></li>)}</ul></div>}</DashboardTile>
}

function Finance({ finance, retry }: { finance: ParentHomeFinance; retry: () => void }) {
  const id = useId()
  if (finance.state !== 'ready') return <TileError title="Money" message="Money is updating. Try again. If it keeps happening, contact a Coach." retryLabel="Try again" onRetry={retry} />
  const percent = paidPercent(finance.chargedCents, finance.paidCents)
  const available = finance.personalAvailableCents + finance.fundraisingAvailableCents
  return <DashboardTile tone={finance.dueCents > 0 ? 'urgent' : 'quiet'} aria-labelledby={id} className="gap-3"><TileTitle id={id}>Money</TileTitle><div className="flex items-center gap-3"><div className="relative size-[96px] shrink-0 lg:size-[120px]"><ProgressRings rings={[{ key: 'paid', fraction: percent / 100, className: 'stroke-vs-gold' }]} label={finance.chargedCents > 0 ? `${percent}% of fees paid` : 'No fees yet'} className="size-full" /><span aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-vs-heading">{finance.chargedCents > 0 ? <><strong className="font-heading text-[23px] leading-none lg:text-[29px]">{percent}%</strong><span className="text-[12px] font-semibold">paid</span></> : <span className="max-w-16 text-center text-[12px] font-semibold leading-tight">No fees yet</span>}</span></div><dl className="m-0 grid flex-1 gap-2"><div><dt className="text-[14px] font-semibold text-vs-text-2">Paid so far</dt><dd className="m-0 font-heading text-[25px] text-vs-heading">{formatMoney(finance.paidCents)}</dd></div><div><dt className="text-[14px] font-semibold text-vs-text-2">Balance due</dt><dd className="m-0 font-heading text-[25px] text-vs-heading">{formatMoney(Math.max(0, finance.dueCents))}</dd></div></dl></div><div className={`${inset} rounded-lg p-3`}><p className="m-0 text-[14px] text-vs-text-2">Available funds</p><p className="m-0 font-heading text-[24px] text-vs-heading">{formatMoney(available)}</p><p className="m-0 text-[13px] text-vs-text-2">Money already on the account for future fees.</p><p className="m-0 text-[14px] text-vs-text-2">Unused payments {formatMoney(finance.personalAvailableCents)} · Fundraising credit {formatMoney(finance.fundraisingAvailableCents)}</p></div><Link to="/finances" className={dashboardButtonVariants({ tone: 'soft' })}>Review balance</Link></DashboardTile>
}

export function ParentHomeView({ studentName, now, summary, announcements, finance, events, retry }: ParentHomeViewProps) {
  const agenda = events === undefined || events instanceof Error ? null : events
  const summaryError = summary instanceof Error
  const pins = announcements instanceof Error || announcements === undefined ? [] : announcements
  const hero = summary === undefined || (announcements === undefined && !summaryError && parentAllSet(summary.whatsLeft)) ? <TileSkeleton surface="hero" label="Loading Highlights…" /> : summaryError ? <TileError title="Highlights" message={errorText('Highlights')} retryLabel="Try again" surface="hero" onRetry={() => retry('summary')} /> : <TileErrorBoundary title="Highlights" message={errorText('Highlights')} retryLabel="Try again" surface="hero" onRetry={() => retry('summary')}><SummarySlides summary={summary} announcements={pins} studentName={studentName} now={now} events={agenda} /></TileErrorBoundary>
  const work = summary === undefined ? <TileSkeleton label="Loading student work…" /> : summaryError ? <TileError title={`What ${studentName} needs to do`} message={errorText('Student work')} retryLabel="Try again" onRetry={() => retry('summary')} /> : <TileErrorBoundary title={`What ${studentName} needs to do`} message={errorText('Student work')} retryLabel="Try again" onRetry={() => retry('summary')}><StudentWork items={summary.whatsLeft} studentName={studentName} /></TileErrorBoundary>
  const money = finance === undefined ? <TileSkeleton label="Loading Money…" /> : finance instanceof Error ? <TileError title="Money" message={errorText('Money')} retryLabel="Try again" onRetry={() => retry('finance')} /> : <TileErrorBoundary title="Money" message={errorText('Money')} retryLabel="Try again" onRetry={() => retry('finance')}><Finance finance={finance} retry={() => retry('finance')} /></TileErrorBoundary>
  return <div className="flex min-w-0 flex-col gap-3 pb-24 font-sans text-vs-text md:mx-auto md:max-w-[720px] lg:max-w-none lg:gap-4"><header><h1 className="m-0! font-heading! text-[26px]! font-normal! text-vs-heading lg:text-[34px]!">{studentName}&apos;s Home</h1><p className="m-0 text-[12px] text-vs-muted">{formatLongDate(now)} · {announcements === undefined ? 'Loading Coach announcements…' : summary && !summaryError && parentAllSet(summary.whatsLeft) ? 'Your tasks are done' : 'Here’s what needs your attention'}</p></header><div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:gap-4"><div className="min-w-0">{hero}</div><div className="flex min-w-0 flex-col gap-3 lg:gap-4">{work}{money}<Link to="/attendance/report" className={dashboardButtonVariants({ tone: 'soft' })}>{reportCopy.seeFullReport}</Link></div></div>{announcements === undefined && <TileSkeleton label="Loading Coach announcements…" />}{announcements instanceof Error && <TileError title="Coach announcements" message={errorText('Coach announcements')} retryLabel="Try again" onRetry={() => retry('announcements')} />}</div>
}
