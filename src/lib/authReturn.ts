/**
 * Google sign-in round trip helpers. The OAuth redirect reloads the page, so anything kept in component state is lost.
 * We remember only which sign-in path the person chose ("student" or "adult") for a short time, never tokens, codes
 * or ids, and we never read or write the auth library's own `__convexAuth*` keys. The one exception is the email-code step
 * below, which also keeps the address the code was sent to (never the code) so a reload does not force a new code.
 */

/**
 * `email` remembers that the person was on "Sign in by email": an installed phone app is often reloaded while they switch
 * to their mail app for the code, and without this they land back on "How are you signing in?".
 */
export type SignInIntent = 'student' | 'adult' | 'email'
export type GoogleSignInIntent = Exclude<SignInIntent, 'email'>
export const isGoogleIntent = (intent: SignInIntent | null): intent is GoogleSignInIntent => intent === 'student' || intent === 'adult'
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
      if ((intent === 'student' || intent === 'adult' || intent === 'email') && typeof at === 'number' && Number.isFinite(at)
        && now - at <= SIGN_IN_INTENT_TTL_MS && at - now <= FUTURE_SKEW_MS) return intent
    }
  } catch { /* malformed: fall through and clear */ }
  clearSignInIntent(storage)
  return null
}

export const EMAIL_STEP_KEY = 'student-status.email-code-step'
/** Matches how long the emailed code stays valid, like the sign-in intent. */
export const EMAIL_STEP_TTL_MS = 15 * 60 * 1000

export type EmailCodeStep = { email: string; resendAvailableAt: number }

/** Remembers that a code was sent to `email`, so a reload brings the person back to code entry. Never stores the code. */
export function writeEmailCodeStep(storage: IntentStorage, step: EmailCodeStep, now: number) {
  try { storage.setItem(EMAIL_STEP_KEY, JSON.stringify({ email: step.email, resendAvailableAt: step.resendAvailableAt, at: now })) } catch { /* storage unavailable */ }
}

export function clearEmailCodeStep(storage: IntentStorage) {
  try { storage.removeItem(EMAIL_STEP_KEY) } catch { /* storage unavailable */ }
}

/** Returns the saved step while it is fresh; removes it when expired or malformed. */
export function readEmailCodeStep(storage: IntentStorage, now: number): EmailCodeStep | null {
  let raw: string | null
  try { raw = storage.getItem(EMAIL_STEP_KEY) } catch { return null }
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object') {
      const { email, resendAvailableAt, at } = value as { email?: unknown; resendAvailableAt?: unknown; at?: unknown }
      if (typeof email === 'string' && email.length > 0 && email.length <= 320 && typeof resendAvailableAt === 'number' && Number.isFinite(resendAvailableAt)
        && typeof at === 'number' && Number.isFinite(at) && now - at <= EMAIL_STEP_TTL_MS && at - now <= FUTURE_SKEW_MS) return { email, resendAvailableAt }
    }
  } catch { /* malformed: fall through and clear */ }
  clearEmailCodeStep(storage)
  return null
}

/**
 * Storage rules when the sign-in screen changes. Going to "Sign in by email" remembers it; leaving it (Back or another method)
 * forgets both that and the address a code was sent to, so the next person on a shared device does not see "Code sent to <address>".
 */
export function recordSignInScreenChange(storage: IntentStorage, from: string, next: string, now: number) {
  if (next === 'email') writeSignInIntent(storage, 'email', now)
  else if (next === 'choose' || from === 'email') clearSignInIntent(storage)
  if (from === 'email' && next !== 'email') clearEmailCodeStep(storage)
}

export const SIGN_IN_NOTICE_KEY = 'student-status.sign-in-notice'
export const SIGN_IN_NOTICE_TTL_MS = 5 * 60 * 1000

/** A short-lived message for the sign-in screen, e.g. when "Use a different Google account" signed the person out but could not open Google. */
export function writeSignInNotice(storage: IntentStorage, message: string, now: number) {
  try { storage.setItem(SIGN_IN_NOTICE_KEY, JSON.stringify({ message, at: now })) } catch { /* storage unavailable */ }
}

/** Reads and removes the notice; null when missing, expired or malformed. */
export function takeSignInNotice(storage: IntentStorage, now: number): string | null {
  let raw: string | null
  try { raw = storage.getItem(SIGN_IN_NOTICE_KEY) } catch { return null }
  if (raw === null) return null
  try { storage.removeItem(SIGN_IN_NOTICE_KEY) } catch { /* storage unavailable */ }
  try {
    const { message, at } = JSON.parse(raw) as { message?: unknown; at?: unknown }
    if (typeof message === 'string' && message && typeof at === 'number' && Number.isFinite(at) && now - at <= SIGN_IN_NOTICE_TTL_MS && at - now <= FUTURE_SKEW_MS) return message
  } catch { /* malformed */ }
  return null
}

type PersistEnv = {
  standalone: boolean
  storage?: { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> }
}

/** True when running as an installed Home Screen app (Android/desktop display-mode, or iOS `navigator.standalone`). */
export function isInstalledApp(win: Pick<Window, 'matchMedia' | 'navigator'> | undefined = typeof window === 'undefined' ? undefined : window) {
  if (!win) return false
  try { return win.matchMedia?.('(display-mode: standalone)').matches === true || (win.navigator as Navigator & { standalone?: boolean }).standalone === true } catch { return false }
}

/**
 * In an installed app, ask the browser to keep this site's storage (where the sign-in tokens live) instead of clearing it
 * under storage pressure. Never asked in a normal tab, where some browsers would show a permission prompt. Never throws.
 * Resolves true when storage is (now) persistent.
 */
export async function keepSignInStorage(env: PersistEnv): Promise<boolean> {
  if (!env.standalone || !env.storage?.persist) return false
  try {
    if (await env.storage.persisted?.()) return true
    return await env.storage.persist()
  } catch { return false }
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
