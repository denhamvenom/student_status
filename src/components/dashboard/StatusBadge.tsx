import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { warningText } from './styles'

const statusBadgeVariants = cva(
  'inline-flex min-h-[23px] w-fit shrink-0 items-center gap-1 rounded-full border px-[9px] py-[3px] text-[11px] leading-[1.35] font-bold whitespace-nowrap lg:min-h-5 lg:px-2 lg:py-0.5 lg:text-[10px]',
  {
    variants: {
      tone: {
        /** Soft red: "Overdue", phone "{n} closing soon". */
        urgent: 'border-vs-urgent-border bg-vs-urgent-soft text-vs-urgent',
        /** Solid red: "CLOSES FRI". */
        urgentStrong: 'border-transparent bg-vs-urgent-fill text-vs-on-urgent',
        /** Soft red on phones, solid red on desktop, as drawn for "{n} closing soon". */
        urgentResponsive: 'border-vs-urgent-border bg-vs-urgent-soft text-vs-urgent lg:border-transparent lg:bg-vs-urgent-fill lg:text-vs-on-urgent',
        warning: `border-[color-mix(in_srgb,var(--vs-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--vs-warning)_10%,transparent)] ${warningText}`,
        success: 'border-vs-success-border bg-vs-success-soft text-vs-success',
        /** Dark mode uses the accent text: muted on this tint is 4.2:1 there. */
        calm: 'border-vs-border bg-[rgba(120,80,200,0.15)] text-vs-muted dark:text-vs-accent-text',
      },
    },
    defaultVariants: { tone: 'calm' },
  },
)

export type StatusBadgeTone = NonNullable<VariantProps<typeof statusBadgeVariants>['tone']>

export function StatusBadge({ tone, className, ...props }: ComponentProps<'span'> & VariantProps<typeof statusBadgeVariants>) {
  return <span className={cn(statusBadgeVariants({ tone }), className)} {...props} />
}
