import { describe, expect, it } from 'vitest'
import { parentSetupSkipped, rememberParentSetupSkip, shouldRedirectToSetup } from './parent-setup-skip'

const DAY = 24 * 60 * 60 * 1000
const memory = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) } }

describe('Parent setup Finish later', () => {
  it('lasts a week for the same account only', () => {
    const storage = memory()
    rememberParentSetupSkip(storage, 'parent-1', 1000)
    expect(parentSetupSkipped(storage, 'parent-1', 1000 + 6 * DAY)).toBe(true)
    expect(parentSetupSkipped(storage, 'parent-1', 1000 + 7 * DAY)).toBe(false)
    expect(parentSetupSkipped(storage, 'parent-2', 1000)).toBe(false)
    expect(parentSetupSkipped(null, 'parent-1', 1000)).toBe(false)
  })

  it.each([
    { pathname: '/', needsSetup: true, role: 'parent', skipped: false, redirect: true },
    { pathname: '/', needsSetup: true, role: 'parent', skipped: true, redirect: false },
    { pathname: '/forms', needsSetup: true, role: 'student', skipped: true, redirect: true },
    { pathname: '/setup', needsSetup: true, role: 'parent', skipped: false, redirect: false },
    { pathname: '/', needsSetup: false, role: 'parent', skipped: false, redirect: false },
  ])('redirects $role on $pathname (needs setup $needsSetup, skipped $skipped): $redirect', ({ redirect, ...input }) => {
    expect(shouldRedirectToSetup(input)).toBe(redirect)
  })
})
