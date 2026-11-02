import { describe, expect, it } from 'vitest'
import { chooseInstallView, detectOS, isIOS, isStandalone, manualInstallKind } from './install'

const ua = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  oldIPad: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}
const device = {
  iPhone: { userAgent: ua.iPhone, platform: 'iPhone', maxTouchPoints: 5 },
  iPadDesktopUA: { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 5 },
  mac: { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 0 },
  android: { userAgent: ua.android, platform: 'Linux armv8l', maxTouchPoints: 5 },
  windows: { userAgent: ua.windows, platform: 'Win32', maxTouchPoints: 0 },
}

describe('isIOS', () => {
  it.each([
    ['iPhone', { userAgent: ua.iPhone, platform: 'iPhone', maxTouchPoints: 5 }, true],
    ['iPad with an iPad user agent', { userAgent: ua.oldIPad, platform: 'iPad', maxTouchPoints: 5 }, true],
    ['iPadOS reporting a desktop Mac user agent', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 5 }, true],
    ['a real Mac', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 0 }, false],
    ['Android', { userAgent: ua.android, platform: 'Linux armv8l', maxTouchPoints: 5 }, false],
    ['Windows touch laptop', { userAgent: ua.windows, platform: 'Win32', maxTouchPoints: 10 }, false],
  ])('%s', (_name, env, expected) => expect(isIOS(env)).toBe(expected))
})

describe('isStandalone', () => {
  const media = (...modes: string[]) => (query: string) => ({ matches: modes.some(mode => query === `(display-mode: ${mode})`) })
  it.each([
    ['installed app window', { matchMedia: media('standalone') }, true],
    ['iOS home-screen app', { matchMedia: media('browser'), standalone: true }, true],
    ['browser tab', { matchMedia: media('browser'), standalone: false }, false],
    ['no matchMedia support', {}, false],
  ])('%s', (_name, env, expected) => expect(isStandalone(env)).toBe(expected))
})

describe('chooseInstallView', () => {
  const base = { installed: false, canInstall: false, outcome: null }
  it.each([
    // The iOS walkthrough is the only install path on iPhone and iPad Safari outside the Home Screen app.
    ['iPhone Safari in a tab', { ...base, device: device.iPhone }, 'ios'],
    ['iPad Safari reporting a Mac user agent', { ...base, device: device.iPadDesktopUA }, 'ios'],
    ['iPhone already in the Home Screen app', { ...base, device: device.iPhone, installed: true }, 'none'],
    ['Android Chrome with an install prompt', { ...base, device: device.android, canInstall: true }, 'prompt'],
    ['Windows Edge with an install prompt', { ...base, device: device.windows, canInstall: true }, 'prompt'],
    // Reproduces the vanishing card: after the prompt is used, the card must show the result, not disappear.
    ['install accepted (appinstalled has fired)', { ...base, device: device.windows, installed: true, outcome: 'accepted' as const }, 'accepted'],
    ['prompt dismissed, no new prompt yet', { ...base, device: device.windows, outcome: 'dismissed' as const }, 'dismissed'],
    ['prompt dismissed, then the browser offers it again', { ...base, device: device.windows, canInstall: true, outcome: 'dismissed' as const }, 'dismissed'],
    ['button tapped with no prompt left', { ...base, device: device.windows, outcome: 'unavailable' as const }, 'manual'],
    ['desktop browser without a prompt', { ...base, device: device.mac }, 'manual'],
    ['installed app window on desktop', { ...base, device: device.windows, installed: true }, 'none'],
  ])('%s', (_name, input, expected) => expect(chooseInstallView(input)).toBe(expected))
})

describe('detectOS', () => {
  it.each([
    ['iPhone', device.iPhone, 'ios'],
    ['iPadOS with a Mac user agent', device.iPadDesktopUA, 'ios'],
    ['Android', device.android, 'android'],
    ['Windows', device.windows, 'windows'],
    ['Mac', device.mac, 'mac'],
    ['Linux', { userAgent: ua.linux }, 'other'],
  ])('%s', (_name, env, expected) => expect(detectOS(env)).toBe(expected))
})

describe('manualInstallKind', () => {
  it.each([
    ['Safari on a Mac', ua.mac, 'safariMac'],
    ['Chrome on a Mac', ua.macChrome, 'chromium'],
    ['Edge on Windows', ua.windows, 'chromium'],
    ['Firefox', ua.firefox, 'firefox'],
    ['Android Chrome', ua.android, 'android'],
  ])('%s', (_name, userAgent, expected) => expect(manualInstallKind({ userAgent })).toBe(expected))
})
