import { useCallback, useSyncExternalStore } from 'react'
import { isStandalone } from './install'

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
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
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); update({ prompt: event as BeforeInstallPromptEvent }) })
  window.addEventListener('appinstalled', () => update({ prompt: null, installed: true }))
}

const subscribe = (listener: () => void) => { captureInstallPrompt(); listeners.add(listener); return () => { listeners.delete(listener) } }
const serverState: InstallState = { prompt: null, installed: false }

/** The deferred install prompt (desktop and Android Chromium) and whether the app is already installed. */
export function useInstallPrompt() {
  const current = useSyncExternalStore(subscribe, () => state, () => serverState)
  const install = useCallback(async () => {
    const prompt = state.prompt
    if (!prompt) return 'unavailable' as const
    update({ prompt: null }) // A prompt can be shown only once.
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    return outcome
  }, [])
  return { canInstall: current.prompt !== null, installed: current.installed || isStandalone(), install }
}
