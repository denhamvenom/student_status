import { describe, expect, it } from 'vitest'
import { adultInvitationLink, adultInvitationOAuthKey, clearAdultInvitationOAuth, prepareAdultInvitationOAuth, readAdultInvitationToken } from '../src/lib/adult-invitation-token'
function tabStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value)}, removeItem: (key: string) => {values.delete(key)} }
}
const token = 'a'.repeat(64)
describe('adult invitation OAuth transport', () => {
  it('keeps invitation tokens in fragments and sends no token in the OAuth return URL', () => {
    const storage = tabStorage()
    const link = new URL(adultInvitationLink('https://status.example.invalid', token))
    expect(link.search).toBe('')
    expect(`${link.origin}${link.pathname}${link.search}`).not.toContain(token)
    expect(readAdultInvitationToken(link.hash, storage)).toBe(token)
    const redirect = prepareAdultInvitationOAuth(link.origin, token, storage)
    expect(redirect).toBe('https://status.example.invalid/invite-adult')
    expect(redirect).not.toContain(token)
    expect(new URL(redirect).hash).toBe('')
    expect(storage.getItem(adultInvitationOAuthKey)).toBe(token)
  })
  it('restores only in the original tab and clears its temporary OAuth transfer', () => {
    const originalTab = tabStorage(), otherTab = tabStorage()
    prepareAdultInvitationOAuth('https://status.example.invalid', token, originalTab)
    expect(readAdultInvitationToken('', otherTab)).toBeNull()
    const restored = readAdultInvitationToken('', originalTab)
    expect(restored).toBe(token)
    clearAdultInvitationOAuth(originalTab)
    expect(originalTab.getItem(adultInvitationOAuthKey)).toBeNull()
    expect(readAdultInvitationToken('', originalTab)).toBeNull()
    expect(readAdultInvitationToken(new URL(adultInvitationLink('https://status.example.invalid', restored!)).hash, originalTab)).toBe(token)
  })
  it('rejects malformed tokens and permits cancellation cleanup without restoring a token', () => {
    const storage = tabStorage()
    expect(() => prepareAdultInvitationOAuth('https://status.example.invalid', 'invalid', storage)).toThrow('invalid')
    expect(storage.getItem(adultInvitationOAuthKey)).toBeNull()
    storage.setItem(adultInvitationOAuthKey, 'invalid')
    expect(readAdultInvitationToken('', storage)).toBeNull()
    clearAdultInvitationOAuth(storage)
    prepareAdultInvitationOAuth('https://status.example.invalid', token, storage)
    clearAdultInvitationOAuth(storage)
    expect(readAdultInvitationToken('', storage)).toBeNull()
  })
})
