import { describe, expect, it, vi } from 'vitest'
import { authReturnPhase, signOutThenStart, recordSignInScreenChange, clearEmailCodeStep, clearSignInIntent, EMAIL_STEP_KEY, EMAIL_STEP_TTL_MS, readEmailCodeStep, SIGN_IN_NOTICE_KEY, SIGN_IN_NOTICE_TTL_MS, takeSignInNotice, writeEmailCodeStep, writeSignInNotice, isGoogleIntent, keepSignInStorage, readSignInIntent, SIGN_IN_INTENT_KEY, SIGN_IN_INTENT_TTL_MS, withoutOAuthCode, writeSignInIntent } from './authReturn'

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
    { name: 'fresh email intent (reload while fetching the code)', stored: { intent: 'email', at: NOW - 5 * 60_000 }, expected: 'email', kept: true },
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

describe('Google sign-in never reuses the email intent', () => {
  it.each([['student', true], ['adult', true], ['email', false], [null, false]] as const)('%s', (intent, google) => {
    expect(isGoogleIntent(intent)).toBe(google)
  })
})

describe('keepSignInStorage', () => {
  const storage = (persisted: boolean, grant: boolean | Error) => {
    const calls: string[] = []
    return { calls, api: { persisted: async () => { calls.push('persisted'); return persisted }, persist: async () => { calls.push('persist'); if (grant instanceof Error) throw grant; return grant } } }
  }
  it.each([
    { name: 'browser tab: never asks (some browsers would prompt)', standalone: false, persisted: false, grant: true, result: false, calls: [] },
    { name: 'installed app: asks once', standalone: true, persisted: false, grant: true, result: true, calls: ['persisted', 'persist'] },
    { name: 'installed app already persistent: does not ask again', standalone: true, persisted: true, grant: true, result: true, calls: ['persisted'] },
    { name: 'installed app refused', standalone: true, persisted: false, grant: false, result: false, calls: ['persisted', 'persist'] },
    { name: 'installed app, API throws', standalone: true, persisted: false, grant: new Error('denied'), result: false, calls: ['persisted', 'persist'] },
  ])('$name', async ({ standalone, persisted, grant, result, calls }) => {
    const fake = storage(persisted, grant)
    await expect(keepSignInStorage({ standalone, storage: fake.api })).resolves.toBe(result)
    expect(fake.calls).toEqual(calls)
  })
  it('no Storage API', async () => {
    await expect(keepSignInStorage({ standalone: true, storage: undefined })).resolves.toBe(false)
  })
})

describe('email code step', () => {
  const step = { email: 'parent@example.com', resendAvailableAt: NOW + 30_000 }
  it('saves and restores the address and resend time, and nothing else', () => {
    const storage = memoryStorage()
    writeEmailCodeStep(storage, step, NOW)
    expect(JSON.parse(storage.data.get(EMAIL_STEP_KEY)!)).toEqual({ ...step, at: NOW })
    expect(readEmailCodeStep(storage, NOW + 60_000)).toEqual(step)
  })
  it('is still valid at the TTL edge and expires after it', () => {
    const storage = memoryStorage()
    writeEmailCodeStep(storage, step, NOW)
    expect(readEmailCodeStep(storage, NOW + EMAIL_STEP_TTL_MS)).toEqual(step)
    expect(readEmailCodeStep(storage, NOW + EMAIL_STEP_TTL_MS + 1)).toBeNull()
    expect(storage.data.has(EMAIL_STEP_KEY)).toBe(false)
  })
  it('clears on request', () => {
    const storage = memoryStorage()
    writeEmailCodeStep(storage, step, NOW)
    clearEmailCodeStep(storage)
    expect(readEmailCodeStep(storage, NOW)).toBeNull()
  })
  it.each(['{not json', JSON.stringify({ email: '', resendAvailableAt: 1, at: NOW }), JSON.stringify({ email: 'a@b.co', resendAvailableAt: 'x', at: NOW }), JSON.stringify({ email: 'a@b.co', resendAvailableAt: 1, at: NOW + 10 * 60_000 })])('drops malformed or future data %#', raw => {
    const storage = memoryStorage({ [EMAIL_STEP_KEY]: raw })
    expect(readEmailCodeStep(storage, NOW)).toBeNull()
    expect(storage.data.has(EMAIL_STEP_KEY)).toBe(false)
  })
})

describe('sign-in notice', () => {
  it('is read once, then gone', () => {
    const storage = memoryStorage()
    writeSignInNotice(storage, 'Google could not open.', NOW)
    expect(takeSignInNotice(storage, NOW + 1000)).toBe('Google could not open.')
    expect(takeSignInNotice(storage, NOW + 1000)).toBeNull()
  })
  it('expires and is removed', () => {
    const storage = memoryStorage()
    writeSignInNotice(storage, 'x', NOW)
    expect(takeSignInNotice(storage, NOW + SIGN_IN_NOTICE_TTL_MS + 1)).toBeNull()
    expect(storage.data.has(SIGN_IN_NOTICE_KEY)).toBe(false)
  })
})

describe('leaving the email sign-in', () => {
  const step = { email: 'parent@example.com', resendAvailableAt: NOW + 60_000 }
  it.each(['adult', 'choose'])('forgets the code step and email intent when going to %s', next => {
    const storage = memoryStorage()
    writeSignInIntent(storage, 'email', NOW)
    writeEmailCodeStep(storage, step, NOW)
    recordSignInScreenChange(storage, 'email', next, NOW)
    expect(readEmailCodeStep(storage, NOW)).toBeNull()
    expect(readSignInIntent(storage, NOW)).toBeNull()
  })
  it('keeps the step while moving into or staying on the email screen', () => {
    const storage = memoryStorage()
    writeEmailCodeStep(storage, step, NOW)
    recordSignInScreenChange(storage, 'adult', 'email', NOW)
    expect(readSignInIntent(storage, NOW)).toBe('email')
    expect(readEmailCodeStep(storage, NOW)).toEqual(step)
  })
})

describe('signOutThenStart', () => {
  it('does not start Google when sign-out was forced', async () => {
    const start = vi.fn(async () => {})
    await expect(signOutThenStart(async () => 'forced', start)).resolves.toBe('forced')
    expect(start).not.toHaveBeenCalled()
  })
  it('starts Google after a normal sign-out', async () => {
    const start = vi.fn(async () => {})
    await expect(signOutThenStart(async () => 'signedOut', start)).resolves.toBe('started')
    expect(start).toHaveBeenCalledTimes(1)
  })
})
