import { cva, type VariantProps } from 'class-variance-authority'

/*
 * src/styles.css (and the shell's CSS modules) are unlayered, so they beat Tailwind utilities on
 * a, button and h1–h4. Properties those rules set (color, font, margin, outline, text-decoration)
 * carry the "!" modifier here so the dashboard looks the same inside any shell.
 */

/** Visible focus that passes 3:1 on light and dark surfaces. */
export const focusRing = 'focus-visible:outline-3! focus-visible:outline-solid! focus-visible:outline-offset-2! focus-visible:outline-vs-accent-text! dark:focus-visible:outline-vs-gold!'

/**
 * Warning text ("Closes Mon, Nov 2", "Due Thu, Oct 29", "2 due soon"). The light --vs-warning passes AA on
 * cards but not on the lavender insets, so light mode darkens it; dark mode uses the token as is.
 */
export const warningText = 'text-[color-mix(in_srgb,var(--vs-warning)_78%,black)] dark:text-vs-warning'

/** Small uppercase label used above values ("YOUR ROOM GROUP", "BALANCE DUE"). */
export const eyebrow = 'text-[10px] leading-[1.4] font-semibold tracking-[0.07em] uppercase text-vs-muted'

/** Inset panel inside a tile (rows, room group, milestones). */
export const inset = 'rounded-inset border border-vs-border-subtle bg-vs-inset shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]'

export const dashboardButtonVariants = cva(
  `inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border text-center font-sans! leading-tight! font-bold! no-underline! transition-[filter,background-color] hover:no-underline! disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`,
  {
    variants: {
      tone: {
        primary: 'border-transparent bg-vs-primary-fill text-vs-on-primary! shadow-[0_2px_10px_color-mix(in_srgb,var(--vs-primary)_32%,transparent)] hover:brightness-95',
        soft: 'border-vs-border bg-vs-inset-raised text-vs-accent-text! hover:brightness-95 dark:hover:brightness-125',
        urgent: 'border-vs-urgent-border bg-vs-urgent-soft text-vs-urgent! hover:brightness-95 dark:hover:brightness-125',
        ghost: 'border-transparent bg-transparent text-vs-accent-text! hover:bg-vs-inset',
      },
      size: {
        sm: 'px-3.5 text-[13px]! lg:text-[12px]!',
        md: 'px-4 text-[13px]!',
        lg: 'min-h-[46px] px-5 text-[15px]! lg:min-h-11 lg:px-[22px] lg:text-[13px]!',
      },
    },
    defaultVariants: { tone: 'primary', size: 'md' },
  },
)

export type DashboardButtonVariants = VariantProps<typeof dashboardButtonVariants>
