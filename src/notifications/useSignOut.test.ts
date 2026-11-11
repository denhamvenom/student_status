import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLEANUP_TIMEOUT_MS, SIGN_OUT_TIMEOUT_MS, DEVELOPER_KEY_STORAGE, forceLocalSignOut, localClearer, signOutSafely } from './useSignOut'

const never = () => new Promise<never>(() => {})
const fail = () => Promise.reject(new Error('boom'))
const ok = () => Promise.resolve()

afterEach(() => { vi.useRealTimers() })

describe('signOutSafely', () => {
  // Reproduces the dev hang: push cleanup awaiting navigator.serviceWorker.ready when no worker is registered never settles.
  it.each([
    { name: 'cleanup never settles', cleanup: never, signOut: ok, result: 'signedOut', forced: 0, waitMs: CLEANUP_TIMEOUT_MS },
    { name: 'cleanup rejects', cleanup: fail, signOut: ok, result: 'signedOut', forced: 0, waitMs: 0 },
    { name: 'cleanup throws synchronously', cleanup: () => { throw new Error('sync') }, signOut: ok, result: 'signedOut', forced: 0, waitMs: 0 },
    { name: 'server sign-out never settles', cleanup: ok, signOut: never, result: 'forced', forced: 1, waitMs: SIGN_OUT_TIMEOUT_MS },
    { name: 'server sign-out rejects', cleanup: ok, signOut: fail, result: 'forced', forced: 1, waitMs: 0 },
    { name: 'both never settle', cleanup: never, signOut: never, result: 'forced', forced: 1, waitMs: CLEANUP_TIMEOUT_MS + SIGN_OUT_TIMEOUT_MS },
  ])('finishes when $name', async ({ cleanup, signOut, result, forced, waitMs }) => {
    vi.useFakeTimers()
    const forceLocal = vi.fn()
    const signOutSpy = vi.fn(signOut)
    const done = signOutSafely({ cleanup, signOut: signOutSpy, forceLocal })
    await vi.advanceTimersByTimeAsync(waitMs)
    await expect(done).resolves.toBe(result)
    expect(signOutSpy).toHaveBeenCalledTimes(1)
    expect(forceLocal).toHaveBeenCalledTimes(forced)
  })

  it('runs push cleanup before the server sign-out', async () => {
    const order: string[] = []
    await signOutSafely({ cleanup: async () => { order.push('cleanup') }, signOut: async () => { order.push('signOut') }, forceLocal: () => order.push('force') })
    expect(order).toEqual(['cleanup', 'signOut'])
  })
})

describe('signOutSafely push unsubscribe retry', () => {
  it.each([
    { name: 'cleanup never settles', cleanup: never, retries: 1 },
    { name: 'cleanup rejects', cleanup: fail, retries: 1 },
    { name: 'cleanup reports the local unsubscribe failed', cleanup: () => Promise.resolve(false), retries: 1 },
    { name: 'cleanup succeeds', cleanup: () => Promise.resolve(true), retries: 0 },
  ])('retries after sign-out when $name', async ({ cleanup, retries }) => {
    vi.useFakeTimers()
    const order: string[] = []
    const done = signOutSafely({ cleanup, retryCleanup: async () => { order.push('retry') }, signOut: async () => { order.push('signOut') }, forceLocal: () => order.push('force') })
    await vi.advanceTimersByTimeAsync(CLEANUP_TIMEOUT_MS)
    await expect(done).resolves.toBe('signedOut')
    expect(order).toEqual(retries ? ['signOut', 'retry'] : ['signOut'])
  })

  it('retries before the forced restart and stays bounded when the retry hangs', async () => {
    vi.useFakeTimers()
    const order: string[] = []
    const done = signOutSafely({ cleanup: fail, retryCleanup: never, signOut: fail, clearLocal: forced => order.push(`clear:${forced}`), forceLocal: () => order.push('force') })
    await vi.advanceTimersByTimeAsync(CLEANUP_TIMEOUT_MS)
    await expect(done).resolves.toBe('forced')
    expect(order).toEqual(['clear:true', 'force'])
  })
})

describe('forceLocalSignOut', () => {
  it('removes only Convex Auth keys, then restarts the app', () => {
    const data = new Map([['__convexAuthJWT_x', 'a'], ['__convexAuthRefreshToken_x', 'b'], ['__convexAuthOAuthVerifier_x', 'c'], ['theme', 'dark']])
    const storage = { get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null, removeItem: (key: string) => { data.delete(key) } }
    const restart = vi.fn()
    forceLocalSignOut(storage, restart)
    expect([...data.keys()]).toEqual(['theme'])
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('still restarts when storage is unavailable', () => {
    const restart = vi.fn()
    forceLocalSignOut({ get length(): number { throw new Error('denied') }, key: () => null, removeItem: () => {} }, restart)
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('removes auth keys written after an earlier pass and the developer key, right before restarting', () => {
    const data = new Map([['__convexAuthJWT_x', 'a']])
    const session = new Map([[DEVELOPER_KEY_STORAGE, 'k'.repeat(32)]])
    const storage = { get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null, removeItem: (key: string) => { data.delete(key) } }
    // A stalled sign-out writes a fresh token between the first clear and the restart.
    const restart = vi.fn(() => { expect(data.size).toBe(0); expect(session.size).toBe(0) })
    data.set('__convexAuthRefreshToken_late', 'z')
    forceLocalSignOut(storage, restart, { removeItem: key => { session.delete(key) } })
    expect(restart).toHaveBeenCalledTimes(1)
  })
})

describe('localClearer', () => {
  it('runs onForced (invitation token cleanup) only when sign-out was forced', () => {
    const clearAuth = vi.fn(), clearKey = vi.fn(), onForced = vi.fn()
    localClearer(false, onForced, clearAuth, clearKey)
    expect(onForced).not.toHaveBeenCalled(); expect(clearAuth).not.toHaveBeenCalled(); expect(clearKey).toHaveBeenCalledTimes(1)
    localClearer(true, onForced, clearAuth, clearKey)
    expect(onForced).toHaveBeenCalledTimes(1); expect(clearAuth).toHaveBeenCalledTimes(1)
  })
  it('forgets the saved email-code step on both normal and forced sign-out', () => {
    for (const forced of [false, true]) {
      const clearStep = vi.fn()
      localClearer(forced, undefined, () => {}, () => {}, clearStep)
      expect(clearStep).toHaveBeenCalledTimes(1)
    }
  })
  it('still clears everything when onForced throws', () => {
    const clearAuth = vi.fn(), clearKey = vi.fn()
    expect(() => localClearer(true, () => { throw new Error('x') }, clearAuth, clearKey)).not.toThrow()
    expect(clearKey).toHaveBeenCalledTimes(1)
  })
  it('wired into signOutSafely: a stalled sign-out discards the saved token before the restart', async () => {
    const order: string[] = []
    await signOutSafely({ cleanup: ok, signOut: fail, clearLocal: f => localClearer(f, () => order.push('token'), () => {}, () => {}), forceLocal: () => order.push('restart') })
    expect(order).toEqual(['token', 'restart'])
  })
})
