import { describe, expect, it } from 'vitest'
import { invitationEmailStatus } from './parent-invite-share'

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
