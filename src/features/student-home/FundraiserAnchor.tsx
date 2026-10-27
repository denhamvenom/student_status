import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { reducedMotionQuery } from '@/components/dashboard/useMediaQuery'

/*
 * The Money page fundraiser section, reachable as /finances#fundraiser (Home's "Fundraise" button).
 * React Router does not scroll to a hash on client navigation, and the fundraiser card loads after
 * the page, so this scrolls itself into view once it has content. Hidden while empty (no
 * fundraiser link), so it adds no gap to the page.
 */
export function FundraiserAnchor({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()
  useEffect(() => {
    const element = ref.current
    if (hash !== '#fundraiser' || !element) return
    const reveal = () => element.scrollIntoView({ block: 'start', behavior: window.matchMedia(reducedMotionQuery).matches ? 'auto' : 'smooth' })
    if (element.offsetHeight > 0) { reveal(); return }
    const observer = new ResizeObserver(() => { if (element.offsetHeight > 0) { observer.disconnect(); reveal() } })
    observer.observe(element)
    const stop = window.setTimeout(() => observer.disconnect(), 10_000)
    return () => { observer.disconnect(); window.clearTimeout(stop) }
  }, [hash])
  return <div id="fundraiser" ref={ref} className="scroll-mt-[calc(var(--app-header-height,0px)+16px)] empty:hidden">{children}</div>
}
