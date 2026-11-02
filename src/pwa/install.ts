// Install detection. Each helper takes its browser inputs as an argument so it can be tested without a DOM.

type StandaloneEnv = { matchMedia?: (query: string) => { matches: boolean }; standalone?: boolean }
type DeviceEnv = { userAgent: string; platform?: string; maxTouchPoints?: number }

const browserStandaloneEnv = (): StandaloneEnv => typeof window === 'undefined' ? {} : { matchMedia: query => window.matchMedia(query), standalone: (window.navigator as Navigator & { standalone?: boolean }).standalone }
const browserDeviceEnv = (): DeviceEnv => typeof navigator === 'undefined' ? { userAgent: '' } : navigator

/** True when the app runs from the home screen / as an installed app rather than in a browser tab. */
export function isStandalone(env: StandaloneEnv = browserStandaloneEnv()): boolean {
  if (env.standalone === true) return true // iOS Safari home-screen apps
  return ['standalone', 'fullscreen', 'minimal-ui'].some(mode => env.matchMedia?.(`(display-mode: ${mode})`).matches === true)
}

/** iPhone, iPod and iPad, including iPadOS 13+ which reports a desktop Mac user agent but has a touch screen. */
export function isIOS(env: DeviceEnv = browserDeviceEnv()): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true
  return env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1
}

export type DeviceOS = 'ios' | 'android' | 'windows' | 'mac' | 'other'

/** The operating system, for showing only the matching help steps. iPadOS with a Mac user agent counts as iOS. */
export function detectOS(env: DeviceEnv = browserDeviceEnv()): DeviceOS {
  if (isIOS(env)) return 'ios'
  if (/Android/.test(env.userAgent)) return 'android'
  if (/Windows/.test(env.userAgent)) return 'windows'
  if (/Macintosh|Mac OS X/.test(env.userAgent)) return 'mac'
  return 'other'
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'
export type InstallView = 'none' | 'ios' | 'prompt' | 'accepted' | 'dismissed' | 'manual'

/**
 * Which install help to show. iPhone/iPad outside the Home Screen app get the Add to Home Screen walkthrough; browsers with an
 * install prompt get a button; after the prompt, the result stays on screen (accepted, or dismissed with the button kept);
 * with no prompt the card explains the browser menu instead of disappearing.
 */
export function chooseInstallView(input: { device: DeviceEnv; installed: boolean; canInstall: boolean; outcome: InstallOutcome | null }): InstallView {
  if (input.outcome === 'accepted') return 'accepted'
  if (input.installed) return 'none'
  if (isIOS(input.device)) return 'ios'
  if (input.outcome === 'unavailable') return 'manual'
  if (input.outcome === 'dismissed') return 'dismissed'
  return input.canInstall ? 'prompt' : 'manual'
}

export type ManualInstallKind = 'chromium' | 'android' | 'safariMac' | 'firefox'

/** Which "install from the browser menu" instructions fit this browser. */
export function manualInstallKind(env: DeviceEnv = browserDeviceEnv()): ManualInstallKind {
  const ua = env.userAgent
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Android/.test(ua)) return 'android'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'safariMac'
  return 'chromium'
}
