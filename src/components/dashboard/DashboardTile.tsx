import type { ComponentProps, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

/*
 * One card shell for every dashboard tile. Tone sets the 3px accent bar across the top:
 * urgent = gold, overdue = red, done = green, quiet = subtle purple, coach = announcement
 * gradient, hero = gold gradient (urgent hero cards), none = no bar.
 */
const tileVariants = cva('relative isolate flex min-w-0 flex-col overflow-hidden border text-vs-text', {
  variants: {
    surface: {
      tile: 'rounded-tile border-vs-border bg-vs-card-fill p-4 shadow-vs-card',
      hero: 'rounded-hero border-vs-border bg-vs-hero-fill p-[18px] shadow-vs-hero lg:p-6',
      compact: 'rounded-[14px] border-vs-border-subtle bg-vs-compact px-4 py-3.5 shadow-vs-compact',
    },
  },
  defaultVariants: { surface: 'tile' },
})

const barVariants = cva('pointer-events-none absolute inset-x-0 top-0 h-[3px]', {
  variants: {
    tone: {
      none: 'hidden',
      urgent: 'bg-vs-gold shadow-[0_0_10px_color-mix(in_srgb,var(--vs-gold)_45%,transparent)]',
      overdue: 'bg-vs-urgent-fill shadow-[0_0_10px_color-mix(in_srgb,var(--vs-urgent-fill)_40%,transparent)]',
      done: 'bg-vs-success-fill',
      quiet: 'bg-[rgba(120,80,200,0.4)]',
      coach: 'bg-vs-coach-bar',
      hero: 'h-1 bg-vs-hero-bar shadow-[0_0_14px_color-mix(in_srgb,var(--vs-gold)_50%,transparent)] lg:h-[3px]',
    },
  },
  defaultVariants: { tone: 'none' },
})

export type TileTone = NonNullable<VariantProps<typeof barVariants>['tone']>
export type TileSurface = NonNullable<VariantProps<typeof tileVariants>['surface']>

type DashboardTileProps = Omit<ComponentProps<'section'>, 'children'> & {
  tone?: TileTone
  surface?: TileSurface
  children: ReactNode
}

export function DashboardTile({ tone = 'none', surface = 'tile', className, children, ...props }: DashboardTileProps) {
  return <section data-tone={tone} className={cn(tileVariants({ surface }), className)} {...props}>
    <span aria-hidden="true" className={barVariants({ tone })} />
    {children}
  </section>
}

/** Tile heading: Anton 22px on phones, 18px on desktop (as drawn). */
export function TileTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('m-0! font-heading! text-[22px]! leading-[1.35]! font-normal! tracking-normal! text-vs-heading lg:text-[18px]! lg:tracking-[0.01em]!', className)} {...props} />
}
