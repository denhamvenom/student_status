import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Pin } from 'lucide-react'
import { cn } from 'cn'
import { Avatar } from '@/components/dashboard/Avatar'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { DetailsSheet } from '@/components/dashboard/DetailsSheet'
import { dashboardButtonVariants } from '@/components/dashboard/styles'
import type { PinnedAnnouncement } from '../contract'
import { homeCopy } from '../copy'
import { initialsOf } from '../format'

const copy = homeCopy.announcement

const titleClass = 'm-0! font-heading! text-[20px]! leading-[1.15]! font-normal! tracking-normal! text-vs-heading lg:text-[34px]! lg:tracking-[0.01em]!'

/**
 * A pinned Coach or Travel Lead message. The body is plain text; line breaks are kept. Long messages
 * are clamped (6 lines on phones, 8 on desktop) and open in full in a sheet.
 */
export function AnnouncementCard({ announcement }: { announcement: PinnedAnnouncement }) {
  const labelId = useId()
  const titleId = useId()
  const bodyRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const label = announcement.authorRole === 'coach' ? copy.coach : copy.travelLead

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () => setClamped(body.scrollHeight > body.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [announcement.body])

  return <DashboardTile surface="hero" tone="coach" aria-labelledby={announcement.title ? titleId : labelId} className="lg:px-8 lg:py-7">
    <div className="flex items-center gap-2.5">
      <Avatar tone="coach" size="sm" initials={initialsOf(announcement.authorName)} />
      <div className="min-w-0 flex-1">
        <p id={labelId} className="text-[11px] leading-tight font-bold tracking-[0.04em] text-vs-accent-text uppercase">{label}</p>
        <p className="truncate text-[12px] text-vs-muted">{announcement.authorName}</p>
      </div>
      <Pin size={15} aria-hidden="true" className="shrink-0 text-vs-accent" />
    </div>
    {/* On desktop the hero fills the column, so the message sits in the middle of the card. */}
    <div className="flex min-w-0 flex-col lg:flex-1 lg:justify-center lg:py-4">
      {announcement.title && <h2 id={titleId} className={cn(titleClass, 'mt-3.5! lg:mt-0!')}>{announcement.title}</h2>}
      <p ref={bodyRef} className="mt-2 line-clamp-6 text-[14px] leading-[1.55] whitespace-pre-line text-vs-text-2 lg:mt-3 lg:line-clamp-8 lg:max-w-[60ch] lg:text-[17px]">{announcement.body}</p>
      {clamped && <button type="button" onClick={() => setOpen(true)} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'sm' }), 'mt-1 -ml-3.5 self-start')}>{copy.showFull}</button>}
    </div>
    {(clamped || open) && <DetailsSheet open={open} onOpenChange={setOpen} title={announcement.title ?? label} description={`${label} · ${announcement.authorName}`}>
      <p className="text-[15px] leading-[1.6] whitespace-pre-line text-vs-text-2">{announcement.body}</p>
    </DetailsSheet>}
  </DashboardTile>
}
