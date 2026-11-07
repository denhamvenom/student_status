import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { focusRing, inset } from '@/components/dashboard/styles'

/** A block's small label heading ("NEXT EVENT", "COMING UP"). Global h2 rules are unlayered, so each property is forced. */
export const blockHeading = 'm-0! font-sans! text-[11px]! leading-[1.4]! font-semibold! tracking-[0.07em]! uppercase text-vs-muted!'

/** A list of rows inside one inset panel (Coming up, Going, Created by me). */
export function RowList({ label, children }: { label?: string; children: ReactNode }) {
  return <ul aria-label={label} className={cn(inset, 'm-0 flex list-none flex-col px-1.5 py-0.5')}>{children}</ul>
}

/** Small tags on a row (Travel, Your subteam, Canceled). */
export function Tags({ tags, tone = 'calm' }: { tags: readonly string[]; tone?: 'calm' | 'warning' | 'success' | 'urgent' }) {
  if (!tags.length) return null
  return <span className="flex shrink-0 flex-wrap justify-end gap-1">{tags.map(tag => <StatusBadge key={tag} tone={tone}>{tag}</StatusBadge>)}</span>
}

/** One row that opens an event: title, one muted line, optional tags and a chevron. The whole row is the 44px link. */
export function EventLinkRow({ to, title, sub, tags, struck = false }: { to: string; title: string; sub: string; tags?: ReactNode; struck?: boolean }) {
  return <li className="border-b border-vs-border-subtle last:border-b-0">
    <Link to={to} className={cn('flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 text-vs-text! no-underline! hover:bg-vs-inset-raised', focusRing)}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('text-[15px] font-semibold text-vs-text', struck && 'line-through')}>{title}</span>
        <span className="text-[13px] text-vs-text-2">{sub}</span>
      </span>
      {tags}
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-vs-muted" />
    </Link>
  </li>
}
