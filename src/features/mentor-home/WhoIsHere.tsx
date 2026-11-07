import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useQueries } from 'convex/react'
import { cn } from 'cn'
import { api } from '../../../convex/_generated/api'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { TileError } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { inset } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import type { ClockedInData } from './contract'
import { hereGroups } from './logic'

const copy = mentorHomeCopy

/** mentorClockedIn.mySubteamClockedIn with the time rounded down to the minute; "Try again" re-subscribes (same as Home). */
export function useClockedIn(now: number) {
  const asOf = Math.floor(now / 60_000) * 60_000
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!paused) return
    const timer = window.setTimeout(() => setPaused(false), 0)
    return () => window.clearTimeout(timer)
  }, [paused])
  const queries = useMemo(() => Object.fromEntries(paused ? [] : [['here', { query: api.mentorClockedIn.mySubteamClockedIn, args: { asOf } }]]), [paused, asOf])
  const results = useQueries(queries)
  const retry = useCallback(() => setPaused(true), [])
  return { data: results.here as ClockedInData | Error | undefined, retry }
}

const names = (list: string[]) => <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[14px] text-vs-text">{list.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}</ul>

/**
 * Who's here now: for each of the Mentor's subteams, "Programming · 3 clocked in" and the names. On a phone each name list is
 * collapsed under its count; from tablet width up the names are listed openly.
 */
export function WhoIsHere({ data, onRetry }: { data: ClockedInData | Error | undefined; onRetry: () => void }) {
  const id = useId()
  if (data === undefined) return <TileSkeleton label={copy.states.loading(copy.here.title)} />
  if (data instanceof Error) return <TileError title={copy.here.title} message={copy.states.failed(copy.here.title)} retryLabel={copy.states.tryAgain} onRetry={onRetry} />
  const groups = hereGroups(data)
  return <DashboardTile tone="quiet" aria-labelledby={id} className="gap-3">
    <TileTitle id={id}>{copy.here.title}</TileTitle>
    {groups.length === 0 && <p className="m-0 text-[14px] text-vs-muted">{copy.here.noSubteams}</p>}
    {groups.length > 0 && <ul className={cn(inset, 'm-0 flex list-none flex-col gap-0 px-3 py-1')}>
      {groups.map(group => <li key={group.subteam} className="flex flex-col gap-1 border-b border-vs-border-subtle py-2 last:border-b-0">
        {group.count === 0 ? <>
          <p className="m-0 text-[15px] font-semibold text-vs-text">{group.label}</p>
          <p className="m-0 text-[13px] text-vs-muted">{group.empty}</p>
        </> : <>
          <details className="group md:hidden">
            <summary aria-label={`${group.label}. ${copy.here.showNames(group.subteam)}`} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[15px] font-semibold text-vs-text [&::-webkit-details-marker]:hidden">
              <span>{group.label}</span><span aria-hidden="true" className="text-vs-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            {names(group.names)}
          </details>
          <div className="hidden flex-col gap-1 md:flex">
            <p className="m-0 text-[15px] font-semibold text-vs-text">{group.label}</p>
            {names(group.names)}
          </div>
        </>}
      </li>)}
    </ul>}
    {data.truncated && <p className="m-0 text-[13px] text-vs-muted">{copy.here.truncated}</p>}
  </DashboardTile>
}
