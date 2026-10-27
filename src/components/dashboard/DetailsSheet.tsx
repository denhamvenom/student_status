import type { ReactNode } from 'react'
import { cn } from 'cn'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { desktopQuery, useMediaQuery } from './useMediaQuery'

/*
 * Tile details in the existing shadcn sheet: from the bottom on phones, from the right on desktop.
 * The sheet portals to <body>, so it keeps the Student palette from data-design on <html>.
 */
export function DetailsSheet({ open, onOpenChange, title, description, children, footer, className }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const desktop = useMediaQuery(desktopQuery)
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side={desktop ? 'right' : 'bottom'} className={cn(
      'gap-0 border-vs-border bg-vs-card text-vs-text shadow-vs-hero',
      'data-[side=bottom]:max-h-[88dvh] data-[side=bottom]:rounded-t-hero',
      'data-[side=right]:w-full data-[side=right]:sm:max-w-[420px]',
      className,
    )}>
      <SheetHeader className="gap-1 px-5 pt-5 pr-16 pb-3">
        <SheetTitle className="m-0! font-heading! text-[24px]! leading-[1.2]! font-normal! tracking-normal! text-vs-heading">{title}</SheetTitle>
        {description && <SheetDescription className="m-0 text-[13px] text-vs-muted">{description}</SheetDescription>}
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      {footer && <SheetFooter className="border-t border-vs-border-subtle px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{footer}</SheetFooter>}
    </SheetContent>
  </Sheet>
}
