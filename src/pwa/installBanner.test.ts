import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseHomeBanner, installBannerHideMs, installPromptTimeoutMs, installTapAction, isInstallPromptEvent, isIOSSafari, isMobileDevice, opensStepsAfterPrompt, runInstallPrompt, type HomeBannerInput } from './installBanner'

const now = Date.UTC(2026, 10, 2, 18)
const day = 24 * 60 * 60 * 1000
const phone: HomeBannerInput = {
  role: 'student', isMobile: true, standalone: false, ios: false, safari: false, hasPrompt: false, installed: false,
  installOutcome: null, dismissedAt: null, notificationsDismissed: false, pushState: 'off', now,
}

describe('chooseHomeBanner', () => {
  it.each<[string, Partial<HomeBannerInput>, ReturnType<typeof chooseHomeBanner>]>([
    ['Android Chrome with a captured prompt', { hasPrompt: true }, 'installPrompt'],
    ['Android without a prompt gets menu steps', {}, 'installManual'],
    ['Parent on Android with a prompt', { role: 'parent', hasPrompt: true }, 'installPrompt'],
    ['iPhone Safari', { ios: true, safari: true }, 'installIos'],
    ['Chrome on iPhone', { ios: true, safari: false }, 'openInSafari'],
    ['prompt accepted', { installOutcome: 'accepted', installed: true }, 'installed'],
    ['prompt dismissed keeps the banner (now menu steps)', { installOutcome: 'dismissed' }, 'installManual'],
    ['installed from the browser menu while the tab is open', { installed: true }, 'none'],
    // Never for staff, never on desktop.
    ['Coach on a phone', { role: 'coach', hasPrompt: true }, 'none'],
    ['Mentor on a phone', { role: 'mentor', hasPrompt: true }, 'none'],
    ['Travel Lead on a phone', { role: 'travelLead', ios: true, safari: true }, 'none'],
    ['Student on desktop with a prompt', { isMobile: false, hasPrompt: true }, 'none'],
    ['Staff opened from the home screen with notifications off', { role: 'coach', standalone: true }, 'none'],
    ['Desktop installed app with notifications off', { isMobile: false, standalone: true }, 'none'],
    // 14-day hide after X.
    ['hidden 1 day ago', { hasPrompt: true, dismissedAt: now - day }, 'none'],
    ['hidden just under 14 days ago', { hasPrompt: true, dismissedAt: now - installBannerHideMs + 1 }, 'none'],
    ['shows again 14 days after hiding', { hasPrompt: true, dismissedAt: now - installBannerHideMs }, 'installPrompt'],
    ['shows again 30 days after hiding', { ios: true, safari: true, dismissedAt: now - 30 * day }, 'installIos'],
    ['a hide time in the future (clock changed) does not hide it', { hasPrompt: true, dismissedAt: now + day }, 'installPrompt'],
    // Inside the installed app: never an install banner; notifications card once.
    ['home screen app, notifications off', { standalone: true }, 'turnOnNotifications'],
    ['home screen app, notifications card dismissed', { standalone: true, notificationsDismissed: true }, 'none'],
    ['home screen app, notifications card ignores the install hide', { standalone: true, dismissedAt: now - day }, 'turnOnNotifications'],
    ['home screen app, notifications already on', { standalone: true, pushState: 'on' }, 'none'],
    ['home screen app, still checking', { standalone: true, pushState: 'checking' }, 'none'],
    ['home screen app, notifications blocked', { standalone: true, pushState: 'blocked' }, 'none'],
    ['home screen app, team has not set up notifications', { standalone: true, pushState: 'notReady' }, 'none'],
    ['home screen app, browser cannot get notifications', { standalone: true, pushState: 'unsupported' }, 'none'],
  ])('%s', (_name, overrides, expected) => expect(chooseHomeBanner({ ...phone, ...overrides })).toBe(expected))
})

// Student tester: Android without a captured prompt tapped Install app and nothing appeared.
describe('tapping Install app', () => {
  it.each<[string, Partial<HomeBannerInput>, ReturnType<typeof installTapAction>]>([
    ['Android without a prompt shows the menu steps', {}, 'showSteps'],
    ['Android after the prompt was dismissed shows the menu steps', { installOutcome: 'dismissed' }, 'showSteps'],
    ['Android after the prompt was already used shows the menu steps', { installOutcome: 'unavailable' }, 'showSteps'],
    ['Android with a captured prompt opens the prompt', { hasPrompt: true }, 'prompt'],
    ['iPhone Safari shows the Share steps', { ios: true, safari: true }, 'showSteps'],
    ['Chrome on iPhone has no button', { ios: true }, 'none'],
  ])('%s', (_name, overrides, expected) => expect(installTapAction(chooseHomeBanner({ ...phone, ...overrides }))).toBe(expected))

  it.each([['dismissed', true], ['unavailable', true], ['accepted', false], [null, false]] as const)(
    'prompt outcome %s opens the menu steps: %s', (outcome, expected) => expect(opensStepsAfterPrompt(outcome)).toBe(expected))
})

const ua = {
  iPhoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iPhoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  iPhoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
  iPhoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}
const media = (...matching: string[]) => (query: string) => ({ matches: matching.includes(query) })

describe('isMobileDevice', () => {
  it.each([
    ['iPhone', { userAgent: ua.iPhoneSafari, platform: 'iPhone', maxTouchPoints: 5 }, true],
    ['iPad reporting a Mac user agent', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 5, matchMedia: media() }, true],
    ['Android phone', { userAgent: ua.android, maxTouchPoints: 5 }, true],
    ['other touch tablet with a small viewport', { userAgent: ua.windows, maxTouchPoints: 10, matchMedia: media('(pointer: coarse)', '(max-width: 1024px)') }, true],
    ['Windows touch laptop with a wide window', { userAgent: ua.windows, maxTouchPoints: 10, matchMedia: media('(pointer: coarse)') }, false],
    ['desktop browser in a narrow window', { userAgent: ua.windows, maxTouchPoints: 0, matchMedia: media('(max-width: 1024px)') }, false],
    ['a real Mac', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 0, matchMedia: media('(max-width: 1024px)') }, false],
  ])('%s', (_name, env, expected) => expect(isMobileDevice(env)).toBe(expected))
})

describe('isIOSSafari', () => {
  it.each([
    ['Safari on iPhone', { userAgent: ua.iPhoneSafari, platform: 'iPhone' }, true],
    ['Safari on iPad with a Mac user agent', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 5 }, true],
    ['Chrome on iPhone', { userAgent: ua.iPhoneChrome, platform: 'iPhone' }, false],
    ['Firefox on iPhone', { userAgent: ua.iPhoneFirefox, platform: 'iPhone' }, false],
    ['Instagram in-app browser', { userAgent: ua.iPhoneInstagram, platform: 'iPhone' }, false],
    ['Safari on a real Mac', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 0 }, false],
  ])('%s', (_name, env, expected) => expect(isIOSSafari(env)).toBe(expected))
})

// Student tester: in Android emulation, Install app turned into a greyed Installing… that never ended and no steps appeared.
describe('running the install prompt', () => {
  afterEach(() => { vi.useRealTimers() })
  const never = () => new Promise<never>(() => {})
  const fakePrompt = (prompt: () => Promise<unknown>, userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>) => Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice })
  const accepted = () => Promise.resolve({ outcome: 'accepted' as const })

  it.each<[string, unknown, boolean]>([
    ['nothing captured', null, false],
    ['a plain beforeinstallprompt Event without prompt()', new Event('beforeinstallprompt'), false],
    ['prompt() but no userChoice', Object.assign(new Event('beforeinstallprompt'), { prompt: () => Promise.resolve() }), false],
    ['a real captured prompt', fakePrompt(() => Promise.resolve(), accepted()), true],
  ])('%s counts as a prompt: %s', (_name, value, expected) => expect(isInstallPromptEvent(value)).toBe(expected))

  it.each<[string, () => unknown, 'accepted' | 'dismissed' | 'unavailable']>([
    ['no prompt: the native prompt is never called', () => null, 'unavailable'],
    ['a fake event without prompt()', () => new Event('beforeinstallprompt'), 'unavailable'],
    ['accepted', () => fakePrompt(() => Promise.resolve(), accepted()), 'accepted'],
    ['dismissed', () => fakePrompt(() => Promise.resolve(), Promise.resolve({ outcome: 'dismissed' })), 'dismissed'],
    ['prompt() throws', () => fakePrompt(() => Promise.reject(new Error('NotAllowedError')), never()), 'unavailable'],
    ['userChoice rejects', () => fakePrompt(() => Promise.resolve(), Promise.reject(new Error('gone'))), 'unavailable'],
  ])('%s → %s', async (_name, makePrompt, expected) => {
    const outcome = await runInstallPrompt(makePrompt())
    expect(outcome).toBe(expected)
    expect(opensStepsAfterPrompt(outcome)).toBe(expected !== 'accepted')
  })

  it.each<[string, () => unknown]>([
    ['userChoice never settles (emulated or hidden prompt)', () => fakePrompt(() => Promise.resolve(), never())],
    ['prompt() never settles', () => fakePrompt(never, never())],
  ])('%s: gives up after the timeout and opens the steps', async (_name, makePrompt) => {
    vi.useFakeTimers()
    let outcome: string | null = null
    void runInstallPrompt(makePrompt()).then(result => { outcome = result })
    await vi.advanceTimersByTimeAsync(installPromptTimeoutMs - 1)
    expect(outcome).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(outcome).toBe('unavailable')
  })

  it('an answer just before the timeout wins', async () => {
    vi.useFakeTimers()
    const choice = new Promise<{ outcome: 'accepted' }>(resolve => setTimeout(() => resolve({ outcome: 'accepted' }), installPromptTimeoutMs - 1))
    const result = runInstallPrompt(fakePrompt(() => Promise.resolve(), choice))
    await vi.advanceTimersByTimeAsync(installPromptTimeoutMs)
    await expect(result).resolves.toBe('accepted')
  })
})
