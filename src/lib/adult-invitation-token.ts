/** Only invitation tokens cross OAuth through this tab's temporary session storage. */
export const adultInvitationOAuthKey = 'student-status-adult-invite-oauth'
type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function adultInvitationLink(origin: string, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Invitation token is invalid.')
  return `${origin}/invite-adult#token=${encodeURIComponent(token)}`
}
export function readAdultInvitationToken(hash: string, storage: TokenStorage) {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? storage.getItem(adultInvitationOAuthKey)
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null
}
export function prepareAdultInvitationOAuth(origin: string, token: string, storage: TokenStorage) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Invitation token is invalid.')
  storage.setItem(adultInvitationOAuthKey, token)
  return `${origin}/invite-adult`
}
export function clearAdultInvitationOAuth(storage: TokenStorage) {storage.removeItem(adultInvitationOAuthKey)}
