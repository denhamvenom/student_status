import { useId, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Clock } from 'lucide-react'
import { cn } from 'cn'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { DetailsSheet } from '@/components/dashboard/DetailsSheet'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, focusRing, inset, warningText } from '@/components/dashboard/styles'
import type { WhatsLeftItem } from '../contract'
import { homeCopy } from '../copy'
import { formatShortDate } from '../format'
import { dueState, whatsLeftSummary, type WhatsLeftBadge, type WhatsLeftGroup } from '../logic'

const copy = homeCopy.whatsLeft
const INLINE_ROWS = 2
const sheetGroups: WhatsLeftGroup[] = ['student', 'parent', 'coach', 'coachOrTravelLead']

export function itemLabel(item: WhatsLeftItem) {
  return item.kind === 'requirement' ? item.label ?? copy.kinds.requirement : copy.kinds[item.kind]
}

function DueText({ item, now }: { item: WhatsLeftItem; now: number }) {
  if (item.dueAt === null) return null
  const state = dueState(item, now)
  return <span className={cn('shrink-0 text-[12px] lg:text-[11px]', state === 'overdue' ? 'font-semibold text-vs-urgent' : state === 'soon' ? cn('font-semibold', warningText) : 'text-vs-muted')}>{copy.due(formatShortDate(item.dueAt))}</span>
}

/** "Invite a parent" always opens Parents, whatever the backend sends. */
export const itemHref = (item: WhatsLeftItem) => item.kind === 'inviteParent' ? '/parents' : item.href

function ItemRow({ item, now }: { item: WhatsLeftItem; now: number }) {
  const href = itemHref(item)
  const body = <>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-[13px] text-vs-text-2">{itemLabel(item)}</span>
      {item.eventName && <span className="truncate text-[11px] text-vs-muted">{item.eventName}</span>}
    </span>
    <DueText item={item} now={now} />
    {href && <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-vs-muted" />}
  </>
  const row = cn(inset, 'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2')
  return <li>{href
    ? <Link to={href} className={cn(row, 'font-normal! text-vs-text-2! no-underline! hover:no-underline! hover:brightness-110', focusRing)}>{body}</Link>
    : <div className={row}>{body}</div>}</li>
}

function Badge({ badge }: { badge: WhatsLeftBadge }) {
  if (!badge) return null
  if (badge.kind === 'overdue') return <StatusBadge tone="urgent">{copy.overdue}</StatusBadge>
  if (badge.kind === 'dueSoon') return <StatusBadge tone="warning">{copy.dueSoon(badge.count)}</StatusBadge>
  return <StatusBadge tone="success">{copy.allSet}</StatusBadge>
}

/** The Student's own items, plus quiet lines for items waiting on a parent or staff. */
export function WhatsLeftTile({ items, now }: { items: WhatsLeftItem[]; now: number }) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const summary = whatsLeftSummary(items, now)
  const countColor = summary.tone === 'overdue' ? 'text-vs-urgent' : summary.tone === 'urgent' ? 'text-vs-warning dark:text-vs-gold' : summary.tone === 'done' ? 'text-vs-success' : 'text-vs-heading'
  const hidden = summary.count > INLINE_ROWS || summary.waiting.length > 0

  return <DashboardTile tone={summary.tone} aria-labelledby={titleId}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 lg:pt-2">
        <TileTitle id={titleId}>{copy.title}</TileTitle>
        <p className={cn('mt-0.5 text-[13px] text-vs-muted lg:text-[12px]', summary.count > 0 && 'sr-only lg:not-sr-only')}>{summary.count > 0 ? copy.leftForYou(summary.count) : copy.nothingForYou}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span aria-hidden="true" className={cn('font-heading text-[34px] leading-none lg:text-[46px]', countColor)}>{summary.count}</span>
        <Badge badge={summary.badge} />
      </div>
    </div>

    {summary.count > 0 && <ul className="mt-3 flex flex-col gap-1.5">{summary.own.slice(0, INLINE_ROWS).map(item => <ItemRow key={item.key} item={item} now={now} />)}</ul>}
    {summary.waiting.length > 0 && <ul className="mt-2.5 flex flex-col gap-1">{summary.waiting.map(line => <li key={line.group} className="flex items-center gap-2 text-[12px] text-vs-muted">
      <Clock size={13} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">{copy.groups[line.group]}</span>
      <span className="font-semibold text-vs-text-2">{line.count}</span>
    </li>)}</ul>}
    {hidden && <button type="button" onClick={() => setOpen(true)} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'sm' }), 'mt-1.5 -mb-1.5 self-start -ml-3.5')}>{copy.showAll}</button>}

    <DetailsSheet open={open} onOpenChange={setOpen} title={copy.title}>
      {items.length === 0 ? <p className="text-[14px] text-vs-muted">{copy.emptySheet}</p> : <div className="flex flex-col gap-5">
        {sheetGroups.filter(group => summary.groups[group].length > 0).map(group => <section key={group} aria-label={copy.groups[group]}>
          <h3 className="m-0! mb-2! font-sans! text-[12px]! leading-normal! font-semibold! tracking-[0.06em]! text-vs-muted uppercase">{copy.groups[group]}</h3>
          <ul className="flex flex-col gap-1.5">{summary.groups[group].map(item => <ItemRow key={item.key} item={item} now={now} />)}</ul>
        </section>)}
      </div>}
    </DetailsSheet>
  </DashboardTile>
}
