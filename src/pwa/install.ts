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
