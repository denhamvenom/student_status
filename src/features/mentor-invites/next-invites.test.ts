import { describe, expect, it } from 'vitest'
import { nextInvites } from './next-invites'

const at = (id: string, startsAt: number, cancelled = false) => ({ id, startsAt, endsAt: startsAt + 10, cancelled })

describe('nextInvites', () => {
  it('keeps the three soonest upcoming invitations and drops past or canceled ones', () => {
    const invites = [at('later', 500), at('past', 10), at('canceled', 150, true), at('soon', 200), at('ongoing', 95), at('next', 300), at('fourth', 400)]
    expect(nextInvites(invites, 100).map(invite => invite.id)).toEqual(['ongoing', 'soon', 'next'])
  })
  it('skips invitations the Mentor declined', () => {
    expect(nextInvites([{ ...at('no', 200), status: 'declined' }, { ...at('yes', 300), status: 'invited' }], 100).map(invite => invite.id)).toEqual(['yes'])
  })
  it('returns nothing when no invitation is upcoming', () => {
    expect(nextInvites([at('past', 10)], 100)).toEqual([])
  })
})
