import { cn } from 'cn'

export type Ring = {
  key: string
  /** 0–1; values outside are clamped. */
  fraction: number
  /** Stroke color class, for example "stroke-vs-gold". */
  className: string
}

const radii = [50, 36, 22]

/*
 * Up to three concentric rings in a 120×120 box (outermost first), drawn as in the artboards:
 * radius 50/36/22, round caps, starting at 12 o'clock. The numbers are always shown beside the
 * rings, so color is never the only signal; the label gives screen readers the same values.
 */
export function ProgressRings({ rings, label, className, strokeClassName = 'stroke-8 lg:stroke-9' }: { rings: Ring[]; label: string; className?: string; strokeClassName?: string }) {
  return <svg viewBox="0 0 120 120" role="img" aria-label={label} className={cn('size-[120px] shrink-0', className)}>
    <title>{label}</title>
    {rings.slice(0, radii.length).map((ring, position) => {
      const r = radii[position]
      const circumference = 2 * Math.PI * r
      const fraction = Number.isFinite(ring.fraction) ? Math.min(1, Math.max(0, ring.fraction)) : 0
      return <g key={ring.key}>
        <circle cx="60" cy="60" r={r} fill="none" className={cn('stroke-vs-ring-track', strokeClassName)} />
        {/* A zero-length dash with round caps would still draw a dot, so an empty ring draws no arc. */}
        {fraction > 0 && <circle cx="60" cy="60" r={r} fill="none" strokeLinecap="round" transform="rotate(-90 60 60)" strokeDasharray={`${(circumference * fraction).toFixed(1)} ${circumference.toFixed(1)}`} className={cn(ring.className, strokeClassName)} />}
      </g>
    })}
  </svg>
}
