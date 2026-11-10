import { describe, expect, it } from 'vitest'
import { shouldRedirectToSetup } from './setup-landing'
import { setupOpen } from './logic'

describe('Where unfinished setup lands', () => {
  it.each([
    { pathname: '/', needsSetup: true, role: 'parent', redirect: false },
    { pathname: '/forms', needsSetup: true, role: 'parent', redirect: false },
    { pathname: '/', needsSetup: true, role: 'student', redirect: true },
    { pathname: '/setup', needsSetup: true, role: 'student', redirect: false },
    { pathname: '/', needsSetup: false, role: 'student', redirect: false },
  ])('$role on $pathname (needs setup $needsSetup) redirects: $redirect', ({ redirect, ...input }) => {
    expect(shouldRedirectToSetup(input)).toBe(redirect)
  })

  it.each([
    ['studentDetails', true], ['contacts', true], ['medical', true], ['first', true], ['finishSetup', true],
    ['waitingCoach', false], ['done', false], [undefined, false],
  ] as const)('shows Finish setup on Home for %s: %s', (next, open) => {
    expect(setupOpen(next)).toBe(open)
  })
})
