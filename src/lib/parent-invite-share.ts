export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'copyFailed' | 'shareFailed'

type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>
  clipboard?: {writeText: (text: string) => Promise<void>}
}

/** Call directly from the button handler so native sharing keeps its user activation. */
export async function shareParentInvitation(
  browser: ShareNavigator,
  url: string,
  copy: {title: string; text: string},
): Promise<ShareResult> {
  if (browser.share) {
    try {
      await browser.share({title: copy.title, text: copy.text, url})
      return 'shared'
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'shareFailed'
    }
  }
  try {
    if (!browser.clipboard) return 'copyFailed'
    await browser.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'copyFailed'
  }
}

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
