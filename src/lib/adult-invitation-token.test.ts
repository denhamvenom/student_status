import { describe, expect, it } from 'vitest'
import { adultInvitationOAuthKey, adultInvitationPath, clearParentInvitationOAuth, parentInvitationOAuthKey, parentInvitationPath, prepareAdultInvitationOAuth, prepareParentInvitationOAuth, readAdultInvitationToken } from './adult-invitation-token'

const token = 'a1'.repeat(32)
function memoryStorage() {
  const data = new Map<string, string>()
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
}

describe('keeping an invitation across "Use a different Google account"', () => {
  it('saves the parent token and returns to the parent invitation page', () => {
    const storage = memoryStorage()
    expect(prepareParentInvitationOAuth(token, storage)).toBe(parentInvitationPath)
    expect(parentInvitationPath).toBe('/invite-parent')
    expect(storage.getItem(parentInvitationOAuthKey)).toBe(token)
    clearParentInvitationOAuth(storage)
    expect(storage.data.size).toBe(0)
  })
  it('saves the adult token and returns to the adult invitation page', () => {
    const storage = memoryStorage()
    expect(prepareAdultInvitationOAuth('https://status.example', token, storage)).toBe(`https://status.example${adultInvitationPath}`)
    expect(adultInvitationPath).toBe('/invite-adult')
    expect(readAdultInvitationToken('', storage)).toBe(token)
    expect(storage.getItem(adultInvitationOAuthKey)).toBe(token)
  })
  it('refuses a malformed parent token without saving anything', () => {
    const storage = memoryStorage()
    expect(() => prepareParentInvitationOAuth('nope', storage)).toThrow()
    expect(storage.data.size).toBe(0)
  })
})
