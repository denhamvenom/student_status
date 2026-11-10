// "Finish later" on the parent setup wizard ("Complete student information") is remembered on this device for a
// week per account, so signing in or reloading does not send the parent back to setup every time. Same pattern as
// the staff setup skip (src/lib/staff-setup-skip.ts): only a timestamp is stored, keyed by the account id; no
// student or profile data. Home's What's left still lists the unfinished steps.
export { browserStorage } from '@/lib/staff-setup-skip'

export const PARENT_SETUP_SKIP_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export const parentSetupSkipKey = (userId: string) => `venom.parentSetupSkippedAt.${userId}`

export function parentSetupSkipped(storage: KeyValueStorage | null, userId: string | undefined, now: number): boolean {
  if (!storage || !userId) return false
  try {
    const at = Number(storage.getItem(parentSetupSkipKey(userId)))
    return Number.isFinite(at) && at > 0 && at <= now && now - at < PARENT_SETUP_SKIP_DAYS * DAY_MS
  } catch { return false }
}

export function rememberParentSetupSkip(storage: KeyValueStorage | null, userId: string | undefined, now: number) {
  if (!storage || !userId) return
  try { storage.setItem(parentSetupSkipKey(userId), String(now)) } catch { /* Storage can be full or blocked; the skip still lasts this session. */ }
}

/**
 * Whether the setup gate should send this account to /setup on load: only when a linked student still needs setup,
 * the page is not /setup already, and the parent did not choose Finish later in the last week.
 */
export function shouldRedirectToSetup(input: { pathname: string; needsSetup: boolean; role: string | undefined; skipped: boolean }) {
  if (input.pathname === '/setup' || !input.needsSetup) return false
  return !(input.role === 'parent' && input.skipped)
}
