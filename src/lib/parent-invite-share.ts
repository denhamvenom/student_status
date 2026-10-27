export function invitationEmailStatus(status: string | null | undefined) {
  switch (status) {
    case 'queued': return 'emailQueued'
    case 'sent': return 'emailSent'
    case 'failed': return 'emailFailed'
    case 'not_sent': return 'emailNotSent'
    case null: return 'emailChecking'
    default: return 'emailUnknown'
  }
}

export type InvitationState = 'waiting' | 'expired' | 'accepted' | 'revoked' | 'replaced'

/** Where a parent invitation stands; a pending invitation past its expiry time is expired. */
export function invitationState(invite: { status: 'pending' | 'accepted' | 'revoked' | 'replaced'; expiresAt: number }, now: number): InvitationState {
  if (invite.status !== 'pending') return invite.status
  return invite.expiresAt <= now ? 'expired' : 'waiting'
}
