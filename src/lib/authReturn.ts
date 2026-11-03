/**
 * Google sign-in round trip helpers. The OAuth redirect reloads the page, so anything kept in component state is lost.
 * We remember only which sign-in path the person chose ("student" or "adult") for a short time, never tokens, codes,
 * emails or ids, and we never read or write the auth library's own `__convexAuth*` keys.
 */

export type SignInIntent = 'student' | 'adult'
type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const SIGN_IN_INTENT_KEY = 'student-status.sign-in-intent'
export const SIGN_IN_INTENT_TTL_MS = 15 * 60 * 1000
/** Tolerated clock skew for a timestamp written slightly "in the future" (e.g. the device clock moved back). */
const FUTURE_SKEW_MS = 60 * 1000

/** Origin-local storage for the intent; null when the browser blocks storage (e.g. some private modes). */
export function browserIntentStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function writeSignInIntent(storage: IntentStorage, intent: SignInIntent, now: number) {
  try { storage.setItem(SIGN_IN_INTENT_KEY, JSON.stringify({ intent, at: now })) } catch { /* storage unavailable: this visit only */ }
}

export function clearSignInIntent(storage: IntentStorage) {
  try { storage.removeItem(SIGN_IN_INTENT_KEY) } catch { /* storage unavailable */ }
}

/** Returns the remembered intent while it is fresh; removes it when expired or malformed. */
export function readSignInIntent(storage: IntentStorage, now: number): SignInIntent | null {
  let raw: string | null
  try { raw = storage.getItem(SIGN_IN_INTENT_KEY) } catch { return null }
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object') {
      const { intent, at } = value as { intent?: unknown; at?: unknown }
      if ((intent === 'student' || intent === 'adult') && typeof at === 'number' && Number.isFinite(at)
        && now - at <= SIGN_IN_INTENT_TTL_MS && at - now <= FUTURE_SKEW_MS) return intent
    }
  } catch { /* malformed: fall through and clear */ }
  clearSignInIntent(storage)
  return null
}

export function hasOAuthCode(search: string) {
  return new URLSearchParams(search).has('code')
}

/** Same-origin path + query + hash without the `code` parameter, or null when there is nothing to remove. */
export function withoutOAuthCode(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string | null {
  const params = new URLSearchParams(location.search)
  if (!params.has('code')) return null
  params.delete('code')
  const query = params.toString()
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`
}

/**
 * Fallback for when the auth client has finished loading signed out but the viewer query never answers (e.g. a stalled
 * connection): after this long we offer the finish button instead of spinning forever. It never applies while the auth
 * library is still loading, because a slow code exchange is a normal sign-in in progress, not a failure.
 */
export const AUTH_RETURN_GRACE_MS = 10_000

export type AuthReturnPhase = 'none' | 'pending' | 'finish'

/**
 * After returning from Google with `?code`, decide whether to keep waiting, offer "finish signing in", or behave normally.
 * `finish` only appears once the auth client has stopped loading signed out and the viewer is signed out (or the viewer
 * query has not answered within the grace period); it never restarts sign-in itself.
 */
export function authReturnPhase(state: {
  returnedWithCode: boolean
  authLoading: boolean
  authenticated: boolean
  /** `api.app.viewer` status; undefined while the query is loading. */
  viewerStatus: string | undefined
  /** Grace period measured since the auth client stopped loading; ignored while it is loading. */
  graceElapsed: boolean
}): AuthReturnPhase {
  if (!state.returnedWithCode || state.authenticated) return 'none'
  if (state.viewerStatus !== undefined && state.viewerStatus !== 'signedOut') return 'none'
  // The code exchange is still in flight: keep showing "Finishing sign-in…" however long it takes.
  if (state.authLoading) return 'pending'
  if (state.viewerStatus === undefined) return state.graceElapsed ? 'finish' : 'pending'
  return 'finish'
}
