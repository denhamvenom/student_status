import { useCallback, useSyncExternalStore } from 'react'

/** Live result of a CSS media query; `fallback` is used where there is no window. */
export function useMediaQuery(query: string, fallback = false) {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => fallback)
}

export const desktopQuery = '(min-width: 1024px)'
export const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
