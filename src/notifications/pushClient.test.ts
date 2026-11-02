import { describe, expect, it } from 'vitest'
import { deviceLabel, urlBase64ToUint8Array } from './pushClient'

const ua = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  oldIPad: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
}

describe('deviceLabel', () => {
  it.each([
    ['iPhone', { userAgent: ua.iPhone, platform: 'iPhone', maxTouchPoints: 5 }, 'iPhone'],
    ['iPad with an iPad user agent', { userAgent: ua.oldIPad, platform: 'iPad', maxTouchPoints: 5 }, 'iPad'],
    ['iPadOS reporting a desktop Mac user agent', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 5 }, 'iPad'],
    ['Android Chrome', { userAgent: ua.android, platform: 'Linux armv8l', maxTouchPoints: 5 }, 'Android'],
    ['Edge, which also says Chrome and Safari', { userAgent: ua.edge, platform: 'Win32' }, 'Desktop Edge'],
    ['Chrome, which also says Safari', { userAgent: ua.chrome, platform: 'Win32' }, 'Desktop Chrome'],
    ['Firefox', { userAgent: ua.firefox, platform: 'Win32' }, 'Desktop Firefox'],
    ['Safari on a real Mac', { userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 0 }, 'Desktop Safari'],
    ['an unknown browser', { userAgent: 'SomethingElse/1.0' }, 'This device'],
  ])('%s', (_name, env, expected) => expect(deviceLabel(env)).toBe(expected))
})

describe('urlBase64ToUint8Array', () => {
  it.each([
    ['unpadded base64url with - and _', '-_8', [0xfb, 0xff]],
    ['one padding character needed', 'AQID', [1, 2, 3]],
    ['two padding characters needed', 'AQIDBA', [1, 2, 3, 4]],
  ])('%s', (_name, input, expected) => expect(Array.from(urlBase64ToUint8Array(input))).toEqual(expected))

  it('decodes a 65-byte uncompressed P-256 VAPID public key', () => {
    const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(0x04)
  })
})
