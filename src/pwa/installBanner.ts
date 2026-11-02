// Which install or notifications banner Home shows. Pure: every browser input is passed in, so it is tested without a DOM.
import { isIOS, type InstallOutcome } from './install'

type DeviceEnv = { userAgent: string; platform?: string; maxTouchPoints?: number; matchMedia?: (query: string) => { matches: boolean } }

/** Phones and tablets: iOS or Android, or any other touch screen with a phone/tablet-sized viewport. */
export function isMobileDevice(env: DeviceEnv): boolean {
  if (isIOS(env) || /Android/.test(env.userAgent)) return true
  const touch = (env.maxTouchPoints ?? 0) > 0 || env.matchMedia?.('(pointer: coarse)').matches === true
  return touch && env.matchMedia?.('(max-width: 1024px)').matches === true
}

/** Safari itself on iPhone/iPad. Chrome, Firefox, Edge and in-app browsers on iOS cannot add to the Home Screen the same way. */
export function isIOSSafari(env: DeviceEnv): boolean {
  return isIOS(env) && /Safari\//.test(env.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|FBAN|FBAV|Instagram|Line\//.test(env.userAgent)
}

export const installBannerHideMs = 14 * 24 * 60 * 60 * 1000

export type HomeBanner =
  | 'none'
  | 'installPrompt' // Android/Chrome with a captured install prompt
  | 'installManual' // Android/other without a prompt: browser menu steps
  | 'installIos' // iPhone/iPad Safari: Add to Home Screen walkthrough
  | 'openInSafari' // iPhone/iPad in another browser
  | 'installed' // the install prompt was accepted
  | 'turnOnNotifications' // opened from the home screen, notifications can be turned on but are off

export type HomeBannerInput = {
  role: string
  isMobile: boolean
  standalone: boolean
  ios: boolean
  safari: boolean
  hasPrompt: boolean
  /** The browser reported the app was installed (appinstalled) while this tab is open. */
  installed: boolean
  installOutcome: 'accepted' | 'dismissed' | 'unavailable' | null
  /** When the install banner was hidden with X on this device, in ms; null when never. */
  dismissedAt: number | null
  notificationsDismissed: boolean
  /** This device's notifications state (see notifications/deviceStatus). */
  pushState: 'checking' | 'iosHomeScreen' | 'notReady' | 'unsupported' | 'blocked' | 'off' | 'on'
  now: number
}

const hiddenFor14Days = (dismissedAt: number | null, now: number) => dismissedAt !== null && now >= dismissedAt && now - dismissedAt < installBannerHideMs

/** Students and Parents on a phone or tablet only; never on desktop or for staff. */
export function chooseHomeBanner(input: HomeBannerInput): HomeBanner {
  if (input.role !== 'student' && input.role !== 'parent') return 'none'
  if (!input.isMobile) return 'none'
  if (input.standalone) return input.pushState === 'off' && !input.notificationsDismissed ? 'turnOnNotifications' : 'none'
  if (hiddenFor14Days(input.dismissedAt, input.now)) return 'none'
  if (input.installOutcome === 'accepted') return 'installed'
  if (input.installed) return 'none'
  if (input.ios) return input.safari ? 'installIos' : 'openInSafari'
  return input.hasPrompt ? 'installPrompt' : 'installManual'
}

/**
 * What tapping the banner's main button does: the browser's install prompt when one was captured, otherwise the
 * written steps (Android menu or iPhone Share). Nothing for views without a button.
 */
export function installTapAction(view: HomeBanner): 'prompt' | 'showSteps' | 'none' {
  if (view === 'installPrompt') return 'prompt'
  return view === 'installManual' || view === 'installIos' ? 'showSteps' : 'none'
}

/** After the install prompt closes without installing (or was gone), the menu steps open so there is always a next step on screen. */
export const opensStepsAfterPrompt = (outcome: HomeBannerInput['installOutcome']) => outcome === 'dismissed' || outcome === 'unavailable'

/** Chrome/Edge/Android's deferred install prompt. Only a real one has prompt() and userChoice; anything else is no prompt. */
export type BeforeInstallPromptEvent = Event & { prompt: () => Promise<unknown>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function isInstallPromptEvent(value: unknown): value is BeforeInstallPromptEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as { prompt?: unknown; userChoice?: { then?: unknown } }
  return typeof event.prompt === 'function' && typeof event.userChoice?.then === 'function'
}

/** How long the install prompt may take before the button comes back and the menu steps open instead. */
export const installPromptTimeoutMs = 8000

/**
 * Shows the captured install prompt and resolves with how it ended. Never hangs: with no real prompt, an error, or no answer
 * within the timeout (an emulated or hidden prompt can leave userChoice pending forever), it resolves 'unavailable'.
 */
export async function runInstallPrompt(prompt: unknown, timeoutMs = installPromptTimeoutMs): Promise<InstallOutcome> {
  if (!isInstallPromptEvent(prompt)) return 'unavailable'
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<InstallOutcome>(resolve => { timer = setTimeout(() => resolve('unavailable'), timeoutMs) })
  const choice = (async (): Promise<InstallOutcome> => {
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    return outcome === 'accepted' ? 'accepted' : 'dismissed'
  })()
  try { return await Promise.race([choice, timedOut]) } catch { return 'unavailable' } finally { clearTimeout(timer) }
}
