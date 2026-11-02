import { describe, expect, it } from 'vitest'
import { hasPinRoom } from './audience'

describe('announcement pin room', () => {
  it.each([
    { pinned: ['students', 'students'], target: 'parents', expected: true },
    { pinned: ['students', 'students'], target: 'students', expected: false },
    { pinned: ['students', 'students'], target: 'both', expected: false },
    { pinned: ['both', 'parents'], target: 'parents', expected: false },
    { pinned: ['both', 'parents'], target: 'students', expected: true },
    { pinned: ['both', 'parents'], target: 'staff', expected: true },
    { pinned: ['everyone', 'staff'], target: 'staff', expected: false },
    { pinned: ['everyone', 'staff'], target: 'parents', expected: true },
    { pinned: ['staff', 'staff'], target: 'everyone', expected: false },
    { pinned: ['staff', 'staff'], target: 'both', expected: true },
  ] as const)('$target with $pinned', ({ pinned, target, expected }) => {
    expect(hasPinRoom(pinned.map(audience => ({ audience })), target, 2)).toBe(expected)
  })
})
