import { describe, expect, it } from 'vitest'
import { invitationEmailStatus, invitationState } from './parent-invite-share'

describe('reactive email status labels', () => {
  it.each([
    ['queued','emailQueued'],
    ['sent','emailSent'],
    ['failed','emailFailed'],
    ['not_sent','emailNotSent'],
    [null,'emailChecking'],
    [undefined,'emailUnknown'],
  ])('maps %s to %s', (status,label) => {
    expect(invitationEmailStatus(status)).toBe(label)
  })
})

describe('parent invitation status on the Parents page', () => {
  const now = 1_800_000_000_000
  it.each([
    { name: 'pending and not expired waits for the parent', status: 'pending' as const, expiresAt: now + 1, state: 'waiting' },
    { name: 'pending at its expiry time is expired', status: 'pending' as const, expiresAt: now, state: 'expired' },
    { name: 'pending past its expiry time is expired', status: 'pending' as const, expiresAt: now - 1, state: 'expired' },
    { name: 'accepted stays accepted after the expiry time', status: 'accepted' as const, expiresAt: now - 1, state: 'accepted' },
    { name: 'revoked', status: 'revoked' as const, expiresAt: now + 1, state: 'revoked' },
    { name: 'replaced by a newer invitation', status: 'replaced' as const, expiresAt: now + 1, state: 'replaced' },
  ])('$name', ({ status, expiresAt, state }) => {
    expect(invitationState({ status, expiresAt }, now)).toBe(state)
  })
})
