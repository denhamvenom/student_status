import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const avatarVariants = cva('inline-flex shrink-0 select-none items-center justify-center rounded-full leading-none', {
  variants: {
    tone: {
      /** Teammate invitation: white initials on brand purple. */
      purple: 'bg-vs-purple font-sans text-[11px] font-bold text-white',
      /** Coach or Travel Lead: gold Anton initials on the purple gradient. */
      coach: 'bg-linear-135 from-vs-purple to-vs-accent font-heading text-[10px] text-vs-gold',
      /** Signed-in person: purple Anton initials on gold. */
      gold: 'bg-vs-gold font-heading text-[13px] text-vs-purple-deep',
    },
    size: { sm: 'size-[26px]', md: 'size-[30px]', lg: 'size-[34px]' },
  },
  defaultVariants: { tone: 'purple', size: 'md' },
})

/** Initials only; the person's name is always shown beside it, so the avatar is hidden from screen readers. */
export function Avatar({ initials, tone, size, className }: { initials: string; className?: string } & VariantProps<typeof avatarVariants>) {
  return <span aria-hidden="true" className={cn(avatarVariants({ tone, size }), className)}>{initials}</span>
}
