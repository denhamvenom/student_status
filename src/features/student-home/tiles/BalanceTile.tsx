import { useId } from 'react'
import { Link } from 'react-router'
import { cn } from 'cn'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, eyebrow } from '@/components/dashboard/styles'
import { homeCopy } from '../copy'
import { formatMoney } from '../format'
import type { HomeFinance } from '../types'

const copy = homeCopy.balance
/** Money page anchor added in LiveApp (FundraiserAnchor). */
export const FUNDRAISER_PATH = '/finances#fundraiser'

const labelClass = cn(eyebrow, 'm-0! font-sans! text-[10px]! leading-[1.4]! font-semibold! tracking-[0.07em]!')

/** Compact Balance due card. A parent reviews the payment; the Student can fundraise. */
export function BalanceTile({ finance }: { finance: Exclude<HomeFinance, { state: 'failed' }> }) {
  const titleId = useId()
  if (finance.state === 'updating') return <DashboardTile surface="compact" aria-labelledby={titleId}>
    <h2 id={titleId} className={labelClass}>{copy.label}</h2>
    <p role="status" className="mt-1.5 text-[13px] text-vs-muted">{copy.updating}</p>
  </DashboardTile>

  const due = finance.dueCents > 0
  return <DashboardTile surface="compact" aria-labelledby={titleId}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 id={titleId} className={labelClass}>{copy.label}</h2>
        <p className={cn('mt-1 font-heading text-[28px] leading-none lg:text-[30px]', due ? 'text-vs-urgent' : 'text-vs-muted')}>{formatMoney(Math.max(0, finance.dueCents))}</p>
      </div>
      {due
        ? <Link to={FUNDRAISER_PATH} className={cn(dashboardButtonVariants({ tone: 'urgent', size: 'sm' }), 'px-4')}>{copy.fundraise}</Link>
        : <StatusBadge tone="success" className="min-h-7 px-3 py-[5px] text-[12px] font-semibold lg:min-h-[27px] lg:px-3 lg:py-[5px] lg:text-[11px] lg:font-bold">{copy.allSet}</StatusBadge>}
    </div>
    {due && <p className="mt-2.5 text-[12px] leading-normal text-vs-text-2">{copy.parentReview}</p>}
    {finance.availableCents > 0 && <p className={cn('text-[12px] text-vs-muted', due ? 'mt-0.5' : 'mt-2')}>{copy.available(formatMoney(finance.availableCents))}</p>}
  </DashboardTile>
}
