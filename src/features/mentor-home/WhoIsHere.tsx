import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { TileError } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import type { ClockedInData } from './contract'
import { hereGroups, hereScopeLine, type HereGroup } from './logic'
import { blockHeading } from './rows'

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

/** One subteam: "Programming · 3 clocked in" and each student with the time they clocked in; "nobody clocked in" when empty. */
function HereGroupView({ group }: { group: HereGroup }) {
  if (group.count === 0 || group.students.length === 0) return <li className="flex min-h-11 items-center gap-2.5 px-1 text-[15px] text-vs-text-2">
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-vs-border" />{group.label}
  </li>
  return <li className="flex flex-col">
    <p className="m-0 flex min-h-11 items-center gap-2.5 px-1 text-[15px] font-semibold text-vs-text">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-vs-success-fill" />{group.label}
    </p>
    <ul className="m-0 flex list-none flex-col gap-1 pr-1 pb-1 pl-[26px] text-[14px] text-vs-text">
      {group.students.map((student, i) => <li key={`${student.name}-${i}`} className="flex items-baseline justify-between gap-2"><span>{student.name}</span><span className="text-[13px] text-vs-muted">{student.since}</span></li>)}
    </ul>
  </li>
}

/** Who's here now: the Mentor's subteams only, each with the students clocked in (name and time), or a plain "nobody" line. */
export function WhoIsHere({ data, onRetry }: { data: ClockedInData | Error | undefined; onRetry: () => void }) {
  const id = useId()
  if (data === undefined) return <TileSkeleton label={copy.states.loading(copy.here.title)} />
  if (data instanceof Error) return <TileError title={copy.here.title} message={copy.states.failed(copy.here.title)} retryLabel={copy.states.tryAgain} onRetry={onRetry} />
  const groups = hereGroups(data)
  const nobody = groups.length > 0 && data.totalCount === 0 && !data.truncated
  return <DashboardTile surface="compact" aria-labelledby={id} className="gap-1">
    <h2 id={id} className={blockHeading}>{copy.here.title}</h2>
    {groups.length === 0 ? <p className="m-0 text-[14px] text-vs-muted">{copy.here.noSubteams}</p>
      : <>
        <p className="m-0 text-[13px] text-vs-muted">{hereScopeLine(data.subteams.map(group => group.subteam))}</p>
        {nobody ? <p className="m-0 min-h-11 py-2.5 text-[15px] text-vs-text-2">{copy.here.nobodyAll}</p>
          : <ul className="m-0 flex list-none flex-col p-0">{groups.map(group => <HereGroupView key={group.subteam} group={group} />)}</ul>}
      </>}
    {data.truncated && <p className="m-0 text-[13px] text-vs-muted">{copy.here.truncated}</p>}
  </DashboardTile>
}
