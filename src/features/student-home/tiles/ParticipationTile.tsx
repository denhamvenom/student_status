import { useId } from 'react'
import { cn } from 'cn'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { ProgressRings } from '@/components/dashboard/ProgressRings'
import type { HomeAttendance } from '../contract'
import { homeCopy } from '../copy'
import { formatHours } from '../format'
import { participationView } from '../logic'

const copy = homeCopy.participation

type Stat = { key: string; dot: string; label: string; value: string; text: boolean; detail: string | null }

/** Meetings, Outreach and Build hours rings with the numbers beside them. Never urgent. */
export function ParticipationTile({ attendance }: { attendance: HomeAttendance }) {
  const titleId = useId()
  const view = participationView(attendance)
  const hours = formatHours(view.build.minutes)
  const stats: Stat[] = [
    view.meetings.percent === null
      ? { key: 'meetings', dot: 'bg-vs-gold', label: copy.meetings, value: copy.noMeetings, text: true, detail: null }
      : { key: 'meetings', dot: 'bg-vs-gold', label: copy.meetings, value: copy.percent(view.meetings.percent), text: false, detail: copy.attended(view.meetings.attended, view.meetings.held) },
    { key: 'outreach', dot: 'bg-vs-accent', label: copy.outreach, value: String(view.outreach.attended), text: false, detail: copy.ofEvents(view.outreach.held) },
    view.build.started
      ? { key: 'build', dot: 'bg-vs-success-fill', label: copy.buildHours, value: copy.hours(hours), text: false, detail: view.build.target ? copy.ofTarget(view.build.target) : copy.sinceKickoff }
      : { key: 'build', dot: 'bg-vs-success-fill', label: copy.buildHours, value: copy.startsAtKickoff, text: true, detail: null },
  ]
  const ringsLabel = copy.ringsLabel(
    [stats[0].value, stats[0].detail].filter(Boolean).join(', '),
    `${stats[1].value} ${stats[1].detail}`,
    [stats[2].value, stats[2].detail].filter(Boolean).join(' '),
  )

  return <DashboardTile tone="quiet" aria-labelledby={titleId} className="lg:px-[26px] lg:pt-5 lg:pb-7">
    <div className="flex items-center justify-between gap-3">
      <TileTitle id={titleId}>{copy.title}</TileTitle>
      {attendance.state === 'updating' && <span role="status" className="text-[11px] font-semibold text-vs-muted">{copy.updating}</span>}
    </div>
    {attendance.state === 'unavailable' && <p className="mt-0.5 text-[13px] text-vs-muted">{copy.unavailable}</p>}
    <div className="mt-4 flex items-center gap-[18px] lg:mt-3.5 lg:gap-9">
      <ProgressRings label={ringsLabel} rings={[
        { key: 'meetings', fraction: view.meetings.fraction, className: 'stroke-vs-gold' },
        { key: 'outreach', fraction: view.outreach.fraction, className: 'stroke-vs-accent' },
        { key: 'build', fraction: view.build.fraction, className: 'stroke-vs-success-fill' },
      ]} />
      <dl className="m-0 flex min-w-0 flex-1 flex-col gap-3.5 lg:grid lg:grid-cols-3 lg:gap-0">
        {stats.map((stat, position) => <div key={stat.key} className={cn('min-w-0', position > 0 && 'lg:border-l lg:border-vs-border-subtle lg:pl-7')}>
          <dt className="flex items-center gap-1.5 text-[10px] leading-[1.4] font-semibold tracking-[0.06em] text-vs-muted uppercase lg:gap-2 lg:tracking-[0.07em]">
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full lg:size-3', stat.dot)} />{stat.label}
          </dt>
          <dd className="m-0 mt-1 flex flex-wrap items-baseline gap-x-1.5 lg:mt-2 lg:block">
            <span className={cn('font-heading leading-none text-vs-heading', stat.text ? 'text-[17px] lg:text-[22px]' : 'text-[19px] lg:text-[38px]')}>{stat.value}</span>
            {stat.detail && <span className="text-[11px] text-vs-muted lg:mt-1 lg:block lg:text-[12px]">{stat.detail}</span>}
          </dd>
        </div>)}
      </dl>
    </div>
  </DashboardTile>
}
