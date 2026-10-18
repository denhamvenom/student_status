import { describe, expect, it } from 'vitest'
import { retentionDraftCurrent, startRetentionDraft } from './retention-draft'

describe('retention decision draft', () => {
  it('does not turn a reviewed hold into a release after another Coach places a competing hold', () => {
    const reviewed = { archiveFingerprint: 'archive-one', latestHoldEventId: null, held: false, status: 'review', archivedAt: 1000 }
    const draft = startRetentionDraft(reviewed)
    expect(draft).toEqual({ fingerprint: 'archive-one', latestEventId: null, action: 'hold' })
    if (!draft) throw new Error('Draft missing')
    expect(retentionDraftCurrent(draft, { ...reviewed, latestHoldEventId: 'other-coach-hold', held: true })).toBe(false)
    expect(retentionDraftCurrent(draft, { ...reviewed, archiveFingerprint: 'rearchived' })).toBe(false)
    expect(retentionDraftCurrent(draft, reviewed)).toBe(true)
  })

  it('retains a release intention on reactivation but requires fresh archive review', () => {
    const reviewed = { archiveFingerprint: 'archive-one', latestHoldEventId: 'hold', held: true, status: 'review', archivedAt: 1000 }
    const draft = startRetentionDraft(reviewed)
    expect(draft?.action).toBe('release')
    expect(startRetentionDraft({ ...reviewed, held: false, status: 'active' })).toBeNull()
    expect(retentionDraftCurrent(draft!, { ...reviewed, archiveFingerprint: 'reactivated' })).toBe(false)
  })
})
