// "Skip for now" on the staff profile setup is remembered on this device for a week per account, so it doesn't
// reappear on every page load. Only a timestamp is stored, keyed by the account id; no profile data. The permanent
// "Don't ask me again" choice stays on the server (adultProfile.dismissSetup).
export const STAFF_SETUP_SKIP_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export const staffSetupSkipKey = (userId: string) => `venom.staffSetupSkippedAt.${userId}`

export function staffSetupSkipped(storage: KeyValueStorage | null, userId: string | undefined, now: number): boolean {
  if (!storage || !userId) return false
  try {
    const at = Number(storage.getItem(staffSetupSkipKey(userId)))
    return Number.isFinite(at) && at > 0 && at <= now && now - at < STAFF_SETUP_SKIP_DAYS * DAY_MS
  } catch { return false }
}

export function rememberStaffSetupSkip(storage: KeyValueStorage | null, userId: string | undefined, now: number) {
  if (!storage || !userId) return
  try { storage.setItem(staffSetupSkipKey(userId), String(now)) } catch { /* Storage can be full or blocked; the skip still lasts this session. */ }
}

/** localStorage when the browser allows it. */
export function browserStorage(): KeyValueStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}
