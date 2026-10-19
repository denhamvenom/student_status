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
