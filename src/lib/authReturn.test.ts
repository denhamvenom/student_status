import { describe, expect, it } from 'vitest'
import { authReturnPhase, clearSignInIntent, readSignInIntent, SIGN_IN_INTENT_KEY, SIGN_IN_INTENT_TTL_MS, withoutOAuthCode, writeSignInIntent } from './authReturn'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
}

const NOW = 1_800_000_000_000

describe('sign-in intent', () => {
  it.each([
    { name: 'missing intent', stored: undefined, expected: null, kept: false },
    { name: 'fresh student intent', stored: { intent: 'student', at: NOW - 60_000 }, expected: 'student', kept: true },
    { name: 'fresh adult intent at the TTL edge', stored: { intent: 'adult', at: NOW - SIGN_IN_INTENT_TTL_MS }, expected: 'adult', kept: true },
    { name: 'expired intent', stored: { intent: 'student', at: NOW - SIGN_IN_INTENT_TTL_MS - 1 }, expected: null, kept: false },
    { name: 'timestamp far in the future', stored: { intent: 'adult', at: NOW + 10 * 60_000 }, expected: null, kept: false },
    { name: 'unknown intent value', stored: { intent: 'coach', at: NOW }, expected: null, kept: false },
    { name: 'malformed JSON', stored: '{not json', expected: null, kept: false },
  ])('$name', ({ stored, expected, kept }) => {
    const storage = memoryStorage(stored === undefined ? {} : { [SIGN_IN_INTENT_KEY]: typeof stored === 'string' ? stored : JSON.stringify(stored) })
    expect(readSignInIntent(storage, NOW)).toBe(expected)
    expect(storage.data.has(SIGN_IN_INTENT_KEY)).toBe(kept)
  })

  it('stores only the intent and a timestamp, and clears it', () => {
    const storage = memoryStorage()
    writeSignInIntent(storage, 'adult', NOW)
    expect(JSON.parse(storage.data.get(SIGN_IN_INTENT_KEY)!)).toEqual({ intent: 'adult', at: NOW })
    expect([...storage.data.keys()]).toEqual([SIGN_IN_INTENT_KEY])
    clearSignInIntent(storage)
    expect(storage.data.size).toBe(0)
  })

  it('survives storage that throws', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    expect(() => writeSignInIntent(broken, 'student', NOW)).not.toThrow()
    expect(readSignInIntent(broken, NOW)).toBeNull()
  })
})

describe('authReturnPhase', () => {
  const base = { returnedWithCode: true, authLoading: false, authenticated: false, viewerStatus: 'signedOut' as string | undefined, graceElapsed: false }
  it.each([
    { name: 'no code: normal sign-in screen', state: { ...base, returnedWithCode: false }, expected: 'none' },
    { name: 'no code while loading', state: { ...base, returnedWithCode: false, authLoading: true, viewerStatus: undefined }, expected: 'none' },
    { name: 'code + exchange still running', state: { ...base, authLoading: true }, expected: 'pending' },
    { name: 'code + viewer query loading', state: { ...base, viewerStatus: undefined }, expected: 'pending' },
    { name: 'code + signed in', state: { ...base, authenticated: true }, expected: 'none' },
    { name: 'code + viewer already active', state: { ...base, viewerStatus: 'active' }, expected: 'none' },
    { name: 'code + new account pending setup', state: { ...base, viewerStatus: 'pending' }, expected: 'none' },
    { name: 'code + exchange settled signed out', state: base, expected: 'finish' },
    { name: 'code + in-progress exchange beyond 10s stays pending', state: { ...base, authLoading: true, viewerStatus: undefined, graceElapsed: true }, expected: 'pending' },
    { name: 'code + in-progress exchange beyond 10s with stale signed-out viewer stays pending', state: { ...base, authLoading: true, graceElapsed: true }, expected: 'pending' },
    { name: 'code + auth settled but viewer never answered within grace', state: { ...base, viewerStatus: undefined, graceElapsed: true }, expected: 'finish' },
    { name: 'code + signed in after grace', state: { ...base, authenticated: true, graceElapsed: true }, expected: 'none' },
  ])('$name', ({ state, expected }) => {
    expect(authReturnPhase(state)).toBe(expected)
  })
})

describe('withoutOAuthCode', () => {
  it.each([
    { location: { pathname: '/', search: '', hash: '' }, expected: null },
    { location: { pathname: '/', search: '?code=abc', hash: '' }, expected: '/' },
    { location: { pathname: '/events', search: '?code=abc&tab=2', hash: '#top' }, expected: '/events?tab=2#top' },
  ])('$location.search$location.hash', ({ location, expected }) => {
    expect(withoutOAuthCode(location)).toBe(expected)
  })
})
