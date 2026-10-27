import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { focusRing } from './styles'
import { reducedMotionQuery, useMediaQuery } from './useMediaQuery'

export type HeroSlide = { key: string; node: ReactNode }
export type HeroStackLabels = {
  /** Accessible name of the whole carousel. */
  region: string
  previous: string
  next: string
  /** "Show card 2 of 4" */
  showCard: (position: number, count: number) => string
  /** "2 of 4" */
  slide: (position: number, count: number) => string
}

/*
 * A horizontal scroll-snap track of hero cards. Swipe, the previous/next buttons and the dots move
 * one card; with focus on a dot, the arrow keys move between cards and keep focus on the dots. No auto-advance; no smooth scrolling under prefers-reduced-motion.
 * With one card there is no track and no controls. The stack fills its parent's height, so on
 * desktop the hero matches the right column.
 */
export function HeroStack({ slides, labels, className }: { slides: HeroSlide[]; labels: HeroStackLabels; className?: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const reduceMotion = useMediaQuery(reducedMotionQuery)
  const count = slides.length
  const current = Math.min(index, Math.max(0, count - 1))

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setIndex(nearestSlide(track)))
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => { track.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [count])

  const go = (target: number) => {
    const track = trackRef.current
    const next = Math.max(0, Math.min(count - 1, target))
    const slide = track?.children[next]
    if (!track || !(slide instanceof HTMLElement)) return
    track.scrollTo({ left: slide.offsetLeft - scrollPadding(track), behavior: reduceMotion ? 'auto' : 'smooth' })
    setIndex(next)
  }
  const onDotKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'Home' ? -count : event.key === 'End' ? count : 0
    if (!step) return
    event.preventDefault()
    const next = Math.max(0, Math.min(count - 1, current + step))
    go(next)
    const dot = dotsRef.current?.children[next]
    if (dot instanceof HTMLElement) dot.focus()
  }

  if (count === 0) return null
  if (count === 1) return <section aria-label={labels.region} className={cn('flex h-full min-w-0 flex-col [&>*]:flex-1', className)}>{slides[0].node}</section>

  const control = `inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-vs-border bg-vs-card text-vs-text! transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-40 ${focusRing}`
  return <section aria-roledescription="carousel" aria-label={labels.region} className={cn('flex h-full min-w-0 flex-col', className)}>
    {/* Padding gives the cards' shadows room inside the scroll box (negative margins keep the layout); the gap is never smaller than the side padding, so neighbours never peek. The controls come later in the DOM and are positioned, so they stay on top of the padding. */}
    <div ref={trackRef} className="relative -mx-2.5 -mt-1 -mb-9 flex min-h-0 flex-1 snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain scroll-px-2.5 px-2.5 pt-1 pb-9 [scrollbar-width:none] lg:-mx-3 lg:gap-6 lg:scroll-px-3 lg:px-3 [&::-webkit-scrollbar]:hidden">
      {slides.map((slide, position) => <div key={slide.key} role="group" aria-roledescription="slide" aria-label={labels.slide(position + 1, count)} className="flex w-full shrink-0 snap-start snap-always flex-col [&>*]:flex-1">{slide.node}</div>)}
    </div>
    <div className="relative mt-1.5 flex items-center justify-between gap-2 lg:mt-3">
      <button type="button" className={control} aria-label={labels.previous} disabled={current === 0} onClick={() => go(current - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
      <div ref={dotsRef} onKeyDown={onDotKeyDown} className="flex min-w-0 flex-wrap items-center justify-center">
        {slides.map((slide, position) => <button key={slide.key} type="button" aria-label={labels.showCard(position + 1, count)} aria-current={position === current ? 'true' : undefined} onClick={() => go(position)} className={`group inline-flex h-11 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 ${focusRing}`}>
          <span aria-hidden="true" className={cn('block h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none', position === current ? 'w-5 bg-vs-accent-text dark:bg-vs-gold' : 'w-2 bg-vs-muted/60 group-hover:bg-vs-muted')} />
        </button>)}
      </div>
      <button type="button" className={control} aria-label={labels.next} disabled={current === count - 1} onClick={() => go(current + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
    </div>
  </section>
}

function scrollPadding(track: HTMLElement) {
  return parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0
}

function nearestSlide(track: HTMLElement) {
  const left = track.scrollLeft + scrollPadding(track)
  let best = 0
  let distance = Infinity
  Array.from(track.children).forEach((child, position) => {
    if (!(child instanceof HTMLElement)) return
    const gap = Math.abs(child.offsetLeft - left)
    if (gap < distance) { distance = gap; best = position }
  })
  return best
}
