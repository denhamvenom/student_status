import { useCallback } from 'react'
import { useMutation } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../convex/_generated/api'
import { browserIntentStorage, clearEmailCodeStep } from '../lib/authReturn'
import { getCurrentSubscription, unsubscribe } from './pushClient'

export const CLEANUP_TIMEOUT_MS = 3000
/** The server sign-out call goes over the Convex WebSocket; if that socket is stuck the library's signOut never settles. */
export const SIGN_OUT_TIMEOUT_MS = 8000
/** Every key @convex-dev/auth keeps in localStorage starts with this (JWT, refresh token, OAuth verifier). */
const AUTH_STORAGE_PREFIX = '__convexAuth'

type Settled<T> = { ok: true; value: T } | { ok: false }

/** Runs `work` and waits at most `ms`. Never rejects, including when `work` throws synchronously. */
async function settleWithin<T>(work: () => Promise<T>, ms: number): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Settled<T>>(resolve => { timer = setTimeout(() => resolve({ ok: false }), ms) })
  const attempt = Promise.resolve().then(work).then(value => ({ ok: true, value }) as Settled<T>, () => ({ ok: false }) as Settled<T>)
  try { return await Promise.race([attempt, timeout]) } finally { clearTimeout(timer) }
}

/** Tab-only developer sign-in key (see DeveloperSignIn.tsx). Defined here so production code never imports the dev-only panel. */
export const DEVELOPER_KEY_STORAGE = 'student-status.developer-sign-in-key'

/** Turns off notifications on this browser. The local unsubscribe runs first so pushes stop even if the server call is slow or fails;
 * the server row is then removed best-effort (a dead endpoint is pruned on the next 404/410). Resolves false when the local
 * unsubscribe failed, so the caller can retry it after sign-out. Sign-out must not depend on it. */
async function removeThisDevice(deleteSubscription: (args: { endpoint: string }) => Promise<unknown>): Promise<boolean> {
  let endpoint: string | undefined
  try {
    endpoint = (await getCurrentSubscription())?.endpoint
    if (endpoint) await unsubscribe()
  } catch { return false }
  if (!endpoint) return true
  try { await deleteSubscription({ endpoint }) } catch { /* server prunes it later */ }
  return true
}

/** Second local-only attempt after sign-out; needs no session. */
async function unsubscribeLocally() {
  if (await getCurrentSubscription()) await unsubscribe()
}

type KeyStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>

function removeDeveloperKey(session?: Pick<Storage, 'removeItem'>) {
  try { (session ?? window.sessionStorage).removeItem(DEVELOPER_KEY_STORAGE) } catch { /* storage unavailable */ }
}

/** Removes every Convex Auth key. Re-reads the key list on each call, so it also catches keys written since the last pass. */
export function clearAuthKeys(storage: KeyStorage = window.localStorage) {
  try {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(AUTH_STORAGE_PREFIX)) keys.push(key) }
    for (const key of keys) storage.removeItem(key)
  } catch { /* storage unavailable; the restart still drops the in-memory session */ }
}

/** Last resort when the server sign-out cannot finish: drop this browser's auth tokens (checked again right now, in case a stalled
 * sign-out or refresh wrote them back meanwhile) and the developer key, then restart the app signed out. */
export function forceLocalSignOut(storage: KeyStorage = window.localStorage, restart: () => void = () => window.location.replace('/'), session?: Pick<Storage, 'removeItem'>) {
  clearAuthKeys(storage)
  removeDeveloperKey(session)
  restart()
}

export type SignOutSteps = {
  /** Resolves false when the local push unsubscribe failed. */
  cleanup: () => Promise<unknown>
  /** Second local unsubscribe attempt, run after sign-out when `cleanup` timed out or failed. */
  retryCleanup?: () => Promise<unknown>
  signOut: () => Promise<unknown>
  /** Runs once the server sign-out has settled, before any retry. `forced` is true when it failed or stalled. */
  clearLocal?: (forced: boolean) => void
  /** Clears auth keys again immediately before restarting the app. Only used when the server sign-out failed. */
  forceLocal: () => void
  cleanupTimeoutMs?: number
  signOutTimeoutMs?: number
}

/** Bounded sign-out: push cleanup gets at most `cleanupTimeoutMs`, the server sign-out at most `signOutTimeoutMs`, and a retry of a
 * failed cleanup at most `cleanupTimeoutMs` more. If the server sign-out fails or stalls, the local session is cleared anyway.
 * Never hangs and never rejects. */
export async function signOutSafely({ cleanup, retryCleanup, signOut, clearLocal, forceLocal, cleanupTimeoutMs = CLEANUP_TIMEOUT_MS, signOutTimeoutMs = SIGN_OUT_TIMEOUT_MS }: SignOutSteps): Promise<'signedOut' | 'forced'> {
  const cleaned = await settleWithin(cleanup, cleanupTimeoutMs)
  const needsRetry = !cleaned.ok || cleaned.value === false
  const signedOut = (await settleWithin(signOut, signOutTimeoutMs)).ok
  try { clearLocal?.(!signedOut) } catch { /* best effort */ }
  if (needsRetry && retryCleanup) await settleWithin(retryCleanup, cleanupTimeoutMs)
  if (signedOut) return 'signedOut'
  forceLocal()
  return 'forced'
}

/** The saved "Code sent to <address>" step must not outlive the session, or the next person on a shared device sees it. */
function clearSavedEmailStep() {
  const storage = browserIntentStorage()
  if (storage) clearEmailCodeStep(storage)
}

/** What runs once the server sign-out settles. When it was forced the page is about to reload to '/', so `onForced` (for example
 * discarding a saved invitation token) must run here: the caller's code after `await signOut()` will never run. */
export function localClearer(forced: boolean, onForced?: () => void, clearAuth: () => void = clearAuthKeys, clearKey: () => void = removeDeveloperKey, clearStep: () => void = clearSavedEmailStep) {
  clearStep()
  if (forced) { clearAuth(); try { onForced?.() } catch { /* best effort */ } }
  clearKey()
}

/** Sign out, first turning off notifications on this device so the next person to use it does not get this account's pushes.
 * Use this for every Sign out control; it resolves within about CLEANUP_TIMEOUT_MS + SIGN_OUT_TIMEOUT_MS. */
export function useSignOut(onForced?: () => void) {
  const signOut = useSignOutResult(onForced)
  return useCallback(async () => { await signOut() }, [signOut])
}

/** Same as useSignOut, but reports whether the sign-out was forced (the app is then already reloading at '/'). */
export function useSignOutResult(onForced?: () => void) {
  const { signOut } = useAuthActions()
  const deleteSubscription = useMutation(api.push.deleteSubscription)
  return useCallback(async () => {
    return signOutSafely({
      cleanup: () => removeThisDevice(deleteSubscription),
      retryCleanup: unsubscribeLocally,
      signOut,
      clearLocal: forced => localClearer(forced, onForced),
      forceLocal: () => forceLocalSignOut(),
    })
  }, [deleteSubscription, signOut, onForced])
}
