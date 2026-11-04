import { describe, expect, it } from 'vitest'
import { STAFF_SETUP_SKIP_DAYS, rememberStaffSetupSkip, staffSetupSkipped } from './staff-setup-skip'

const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } } }
const day = 24 * 60 * 60 * 1000

describe('staff setup Skip for now', () => {
  it('is remembered per account across page loads for a week', () => {
    const storage = memory()
    rememberStaffSetupSkip(storage, 'user-a', 1_000)
    expect(staffSetupSkipped(storage, 'user-a', 1_000 + day)).toBe(true)
    expect(staffSetupSkipped(storage, 'user-b', 1_000 + day)).toBe(false)
    expect(staffSetupSkipped(storage, 'user-a', 1_000 + STAFF_SETUP_SKIP_DAYS * day)).toBe(false)
  })
  it('asks again when storage is unavailable or the account is unknown', () => {
    expect(staffSetupSkipped(null, 'user-a', 1_000)).toBe(false)
    const storage = memory()
    rememberStaffSetupSkip(storage, undefined, 1_000)
    expect(staffSetupSkipped(storage, undefined, 1_000)).toBe(false)
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => rememberStaffSetupSkip(blocked, 'user-a', 1_000)).not.toThrow()
    expect(staffSetupSkipped(blocked, 'user-a', 1_000)).toBe(false)
  })
})
