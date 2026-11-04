import { useId } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, eyebrow, focusRing, inset } from '@/components/dashboard/styles'
import { agendaLine, costLabel, formatWhen, requiredBadge, statusLabel, type AgendaEvent } from '../agenda'
import { homeCopy } from '../copy'

const copy = homeCopy.agenda

export function RequiredBadge({ required }: { required: boolean }) {
  const badge = requiredBadge(required)
  return <StatusBadge tone={required ? 'warning' : 'calm'} title={badge.meaning}>{badge.label}</StatusBadge>
}

/** One "This week" row: a 44px link to the event with its day/time, place and Required/Optional. */
function WeekRow({ event }: { event: AgendaEvent }) {
  return <li>
    <Link to={`/events/${event.eventId}`} aria-label={`${event.name}: ${agendaLine(event)}, ${requiredBadge(event.required).label}`} className={cn('flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-vs-text! no-underline! hover:bg-vs-inset-raised', focusRing)}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold text-vs-text">{event.name}</span>
        <span className="truncate text-[12px] text-vs-muted">{formatWhen(event.startsAt, event.endsAt)} · {event.place}</span>
      </span>
      <RequiredBadge required={event.required} />
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-vs-muted" />
    </Link>
  </li>
}

export function ThisWeekList({ events, className }: { events: AgendaEvent[]; className?: string }) {
  const id = useId()
  return <div className={cn('flex flex-col gap-1', className)}>
    <p id={id} className={cn(eyebrow, 'm-0')}>{copy.thisWeek}</p>
    {events.length
      ? <ul aria-labelledby={id} className={cn(inset, 'm-0 flex list-none flex-col p-1')}>{events.map(event => <WeekRow key={event.eventId} event={event} />)}</ul>
      : <p className="m-0 text-[13px] text-vs-muted">{copy.nothingThisWeek}</p>}
  </div>
}

/**
 * Student Home's first card: the next event the Student is on (or that is required for them) with day/time,
 * place (or Virtual (Discord)), cost, signup status and Required/Optional, then a compact This week list.
 */
export function NextUpCard({ next, week }: { next: AgendaEvent | null; week: AgendaEvent[] }) {
  const id = useId()
  const badge = next ? requiredBadge(next.required) : null
  return <DashboardTile tone={next ? 'urgent' : 'quiet'} aria-labelledby={id} className="gap-3">
    <p className={cn(eyebrow, 'm-0')}>{copy.nextUp}</p>
    {next && badge ? <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TileTitle id={id} className="min-w-0 flex-1">{next.name}</TileTitle>
        <RequiredBadge required={next.required} />
      </div>
      <p className="m-0 text-[15px] font-semibold text-vs-text">{formatWhen(next.startsAt, next.endsAt)}</p>
      <p className="m-0 text-[14px] text-vs-text-2">{next.place} · {costLabel(next.feeCents)}{next.status ? ` · ${statusLabel[next.status]}` : ''}</p>
      <p className="m-0 text-[12px] text-vs-muted">{badge.label}: {badge.meaning}</p>
      <Link to={`/events/${next.eventId}`} className={cn(dashboardButtonVariants({ tone: 'soft' }), 'mt-1 self-start')}>{copy.openEvent(next.name)}</Link>
    </div> : <>
      <TileTitle id={id} className="sr-only">{copy.nextUp}</TileTitle>
      <p className="m-0 text-[14px] text-vs-muted">{copy.nothingNext}</p>
    </>}
    <ThisWeekList events={week} />
  </DashboardTile>
}
