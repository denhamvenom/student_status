import { cn } from 'cn'
import { DashboardTile, type TileSurface } from './DashboardTile'

function Bar({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block rounded-md bg-vs-inset-raised motion-safe:animate-pulse', className)} />
}

/** Placeholder with the tile's rough shape while its data loads. */
export function TileSkeleton({ label, surface = 'tile', rows = 2, className }: { label: string; surface?: TileSurface; rows?: number; className?: string }) {
  return <DashboardTile surface={surface} aria-busy="true" aria-label={label} className={cn('gap-3', className)}>
    <span className="sr-only">{label}</span>
    <div className="flex items-center justify-between gap-4"><Bar className="h-6 w-32" /><Bar className="h-5 w-16 rounded-full" /></div>
    {Array.from({ length: rows }, (_, row) => <Bar key={row} className="h-11 w-full rounded-inset" />)}
  </DashboardTile>
}

/** Rings placeholder for the Participation tile. */
export function RingsSkeleton({ label, className }: { label: string; className?: string }) {
  return <DashboardTile aria-busy="true" aria-label={label} className={cn('gap-4 lg:px-[26px] lg:py-5', className)}>
    <span className="sr-only">{label}</span>
    <Bar className="h-6 w-32" />
    <div className="flex items-center gap-5"><span aria-hidden="true" className="size-[120px] shrink-0 rounded-full border-[9px] border-vs-inset-raised motion-safe:animate-pulse" /><div className="flex flex-1 flex-col gap-3"><Bar className="h-5 w-3/4" /><Bar className="h-5 w-2/3" /><Bar className="h-5 w-1/2" /></div></div>
  </DashboardTile>
}
