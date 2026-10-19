import { describe, expect, it } from 'vitest'
import { isIndividualInvitation, isValidIndividualInvitation } from './invitation-code'

describe('invitation routing', () => {
  it('routes five digits to individual linking and six digits to team requests', () => {
    expect(isIndividualInvitation(' 12345 ')).toBe(true)
    expect(isValidIndividualInvitation('12345')).toBe(true)
    expect(isIndividualInvitation(' 123456 ')).toBe(false)
    expect(isValidIndividualInvitation('123456')).toBe(false)
    expect(isIndividualInvitation('1234')).toBe(true)
    expect(isValidIndividualInvitation('1234')).toBe(false)
    expect(isIndividualInvitation('VENOM-0123456789ABCDEF')).toBe(false)
    expect(isValidIndividualInvitation('DV-' + 'A'.repeat(32))).toBe(true)
  })
})
