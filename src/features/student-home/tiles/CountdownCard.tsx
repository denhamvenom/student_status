import { useId } from 'react'
import { Timer } from 'lucide-react'
import { cn } from 'cn'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { eyebrow, inset } from '@/components/dashboard/styles'
import type { StudentHomeSummary } from '../contract'
import { homeCopy } from '../copy'
import { formatDateRange, formatMonthDay } from '../format'
import { countdownValue, progressFraction, upcomingMilestones, type CountdownTarget } from '../logic'

const copy = homeCopy.countdown

/** Days (hours under 48) to kickoff, or from kickoff on to the next Competition. Always the last hero card. */
export function CountdownCard({ target, summary, now }: { target: CountdownTarget; summary: Pick<StudentHomeSummary, 'season' | 'competitions'>; now: number }) {
  const labelId = useId()
  const { unit, value } = countdownValue(target.at, now)
  const targetName = target.kind === 'kickoff' ? copy.kickoff : target.name
  const fraction = progressFraction(target.from, target.at, now)
  const milestones = upcomingMilestones(summary.season, summary.competitions, now)
  return <DashboardTile surface="hero" tone="coach" aria-labelledby={labelId} className="lg:px-8 lg:py-7">
    <p id={labelId} className="flex items-center gap-2 text-[11px] leading-tight font-bold tracking-[0.06em] text-vs-accent-text uppercase"><Timer size={14} aria-hidden="true" />{copy.label}</p>

    {/* On desktop the hero fills the column: the countdown sits in the middle, milestones at the bottom. */}
    <div className="flex flex-col lg:flex-1 lg:justify-center lg:py-6">
    <p className="mt-3 flex flex-col items-center text-center lg:mt-0 lg:flex-row lg:items-center lg:gap-4 lg:text-left">
      <span className="font-heading text-[64px] leading-none text-vs-purple lg:text-[96px] lg:tracking-[-0.01em] dark:text-vs-gold dark:drop-shadow-[0_0_24px_color-mix(in_srgb,var(--vs-gold)_25%,transparent)]">{value}</span>
      <span className="mt-1.5 text-[11px] font-bold tracking-[0.12em] text-vs-muted uppercase lg:mt-0 lg:max-w-[18ch] lg:font-heading lg:text-[20px] lg:leading-[1.2] lg:font-normal lg:tracking-[0.08em]">
        {copy.unit(unit, value)} {target.kind === 'kickoff' ? copy.toKickoff : copy.toEvent(target.name)}
      </span>
    </p>

    <div aria-hidden="true" className="mt-4 h-[3px] overflow-hidden rounded-full bg-[rgba(139,92,246,0.2)] lg:mt-7 lg:h-2">
      <div className="h-full rounded-full bg-vs-coach-bar" style={{ width: `${Math.round(fraction * 1000) / 10}%` }} />
    </div>
    <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[10px] lg:mt-2 lg:text-[11px]">
      <span className="text-vs-muted">{copy.now}</span>
      <span className="text-right font-bold text-vs-heading dark:text-vs-gold">{copy.target(targetName, formatMonthDay(target.at))}</span>
    </div>
    </div>

    {milestones.length > 0 && <div className={cn(inset, 'mt-4 px-4 py-3 lg:mt-0 lg:rounded-xl lg:py-3.5')}>
      <p className={eyebrow}>{copy.milestones}</p>
      <ul className="mt-1.5 flex flex-col">{milestones.map(milestone => <li key={milestone.key} className="flex min-h-7 items-center gap-2.5 text-[13px]">
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', milestone.kind === 'kickoff' ? 'bg-vs-gold' : 'bg-vs-accent')} />
        <span className="min-w-0 flex-1 truncate text-vs-text-2">{milestone.name ?? copy.kickoff}</span>
        <span className="shrink-0 text-[12px] text-vs-muted">{formatDateRange(milestone.startsAt, milestone.endsAt)}</span>
      </li>)}</ul>
    </div>}
  </DashboardTile>
}
