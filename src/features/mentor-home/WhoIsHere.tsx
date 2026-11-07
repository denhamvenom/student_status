import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useQueries } from 'convex/react'
import { cn } from 'cn'
import { api } from '../../../convex/_generated/api'
import { ChevronRight } from 'lucide-react'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { TileError } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { focusRing } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import type { ClockedInData } from './contract'
import { hereGroups, type HereGroup } from './logic'
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

/** One subteam: "Programming · 3 clocked in". With students in, tapping the line shows or hides their names. */
function HereLine({ group }: { group: HereGroup }) {
  const [open, setOpen] = useState(false)
  const namesId = useId()
  if (group.count === 0 || group.names.length === 0) return <li className="flex min-h-11 items-center gap-2.5 px-1 text-[15px] text-vs-text-2">
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-vs-border" />{group.label}
  </li>
  return <li className="flex flex-col">
    <button type="button" aria-expanded={open} aria-controls={namesId} onClick={() => setOpen(value => !value)}
      className={cn('flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-1 text-left text-[15px] font-semibold text-vs-text! hover:bg-vs-inset', focusRing)}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-vs-success-fill" />
      <span className="min-w-0 flex-1">{group.label}</span>
      <ChevronRight size={16} aria-hidden="true" className={cn('shrink-0 text-vs-muted transition-transform', open && 'rotate-90')} />
    </button>
    <ul id={namesId} hidden={!open} className="m-0 flex list-none flex-col gap-1 py-1 pr-1 pl-[26px] text-[14px] text-vs-text">
      {group.names.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}
    </ul>
  </li>
}

/** Who's here now: one line per Mentor subteam with how many students are clocked in; tap a line for the names. */
export function WhoIsHere({ data, onRetry }: { data: ClockedInData | Error | undefined; onRetry: () => void }) {
  const id = useId()
  if (data === undefined) return <TileSkeleton label={copy.states.loading(copy.here.title)} />
  if (data instanceof Error) return <TileError title={copy.here.title} message={copy.states.failed(copy.here.title)} retryLabel={copy.states.tryAgain} onRetry={onRetry} />
  const groups = hereGroups(data)
  return <DashboardTile surface="compact" aria-labelledby={id} className="gap-1">
    <h2 id={id} className={blockHeading}>{copy.here.title}</h2>
    {groups.length === 0 ? <p className="m-0 text-[14px] text-vs-muted">{copy.here.noSubteams}</p>
      : <ul className="m-0 flex list-none flex-col p-0">{groups.map(group => <HereLine key={group.subteam} group={group} />)}</ul>}
    {data.truncated && <p className="m-0 text-[13px] text-vs-muted">{copy.here.truncated}</p>}
  </DashboardTile>
}
