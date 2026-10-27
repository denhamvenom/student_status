import { useEffect, useState } from 'react'

export const NOW_TICK_MS = 30_000

/**
 * The browser clock for "soon" and "past" decisions, refreshed every 30 seconds and whenever the
 * tab becomes visible again (timers are throttled in background tabs).
 */
export function useNow(tickMs = NOW_TICK_MS) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, tickMs)
    const onVisible = () => { if (document.visibilityState === 'visible') update() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [tickMs])
  return now
}
