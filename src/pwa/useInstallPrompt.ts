import { useCallback, useSyncExternalStore } from 'react'
import { isStandalone, type InstallOutcome } from './install'
import { isInstallPromptEvent, runInstallPrompt, type BeforeInstallPromptEvent } from './installBanner'

type InstallState = { prompt: BeforeInstallPromptEvent | null; installed: boolean }

// Chrome/Edge/Android fire beforeinstallprompt once, often before any install UI mounts, so it is captured app-wide.
let state: InstallState = { prompt: null, installed: false }
const listeners = new Set<() => void>()
const update = (next: Partial<InstallState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()) }
let capturing = false

/** Starts listening for the browser install prompt. Safe to call more than once; main.tsx calls it at startup. */
export function captureInstallPrompt() {
  if (capturing || typeof window === 'undefined') return
  capturing = true
  window.addEventListener('beforeinstallprompt', event => {
    // Only a real prompt counts; a synthetic event without prompt()/userChoice must not turn on the Install button.
    if (!isInstallPromptEvent(event)) return
    event.preventDefault()
    update({ prompt: event })
  })
  window.addEventListener('appinstalled', () => update({ prompt: null, installed: true }))
}

const subscribe = (listener: () => void) => { captureInstallPrompt(); listeners.add(listener); return () => { listeners.delete(listener) } }
const serverState: InstallState = { prompt: null, installed: false }

/** The deferred install prompt (desktop and Android Chromium) and whether the app is already installed. */
export function useInstallPrompt() {
  const current = useSyncExternalStore(subscribe, () => state, () => serverState)
  const install = useCallback(async (): Promise<InstallOutcome> => {
    const prompt = state.prompt
    if (!prompt) return 'unavailable'
    update({ prompt: null }) // A prompt can be shown only once.
    return runInstallPrompt(prompt) // 'unavailable' on error or after the timeout, so callers never stay busy.
  }, [])
  return { canInstall: current.prompt !== null, installed: current.installed || isStandalone(), install }
}
