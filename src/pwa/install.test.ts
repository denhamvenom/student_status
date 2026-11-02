import { describe, expect, it } from 'vitest'
import { isIOS, isStandalone } from './install'

const ua = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  oldIPad: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
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
