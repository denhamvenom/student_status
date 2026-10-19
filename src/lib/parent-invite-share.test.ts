import { describe, expect, it, vi } from 'vitest'
import { invitationEmailStatus, shareParentInvitation } from './parent-invite-share'

const url = 'https://example.test/invite-parent#token=synthetic-token'
const copy = {title:'Parent invitation',text:'Sign in with the invited Google account.'}

describe('parent invitation sharing', () => {
  it('passes the private link to native sharing on an explicit invocation', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const clipboard = {writeText:vi.fn()}
    expect(await shareParentInvitation({share,clipboard},url,copy)).toBe('shared')
    expect(share).toHaveBeenCalledWith({...copy,url})
    expect(clipboard.writeText).not.toHaveBeenCalled()
  })

  it('treats cancelling the share sheet as a quiet cancellation', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled','AbortError'))
    expect(await shareParentInvitation({share},url,copy)).toBe('cancelled')
  })

  it('copies the link when native sharing is unsupported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await shareParentInvitation({clipboard:{writeText}},url,copy)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(url)
  })

  it('reports share and fallback copy failures honestly', async () => {
    expect(await shareParentInvitation({share:vi.fn().mockRejectedValue(new Error('failed'))},url,copy)).toBe('shareFailed')
    expect(await shareParentInvitation({clipboard:{writeText:vi.fn().mockRejectedValue(new Error('failed'))}},url,copy)).toBe('copyFailed')
    expect(await shareParentInvitation({},url,copy)).toBe('copyFailed')
  })
})

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
