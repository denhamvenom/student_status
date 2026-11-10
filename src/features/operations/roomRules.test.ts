import { describe, expect, it } from 'vitest'
import { assignIssue, finalizeIssue, roomTypeIssue } from './roomRules'

const open = (memberCount: number) => ({ closed: false, finalized: false, memberCount })

describe('room rules', () => {
  it('lets a room with students be finalized without a student chosen to assign', () => {
    expect(finalizeIssue(open(3), '')).toBe('')
    expect(assignIssue(open(3), false, '')).toBe('Choose a student first.')
  })
  it.each([
    ['empty room', open(0), '', 'Add at least one student before finalizing this room.'],
    ['after the deadline without a reason', { closed: true, finalized: false, memberCount: 2 }, '  ', 'Enter a reason to finalize this room.'],
    ['after the deadline with a reason', { closed: true, finalized: false, memberCount: 2 }, 'Late fix', ''],
    ['full room without a reason', open(5), '', 'Enter a reason to finalize this room.'],
    ['four students, open', open(4), '', ''],
  ])('finalize: %s', (_n, state, reason, expected) => expect(finalizeIssue(state, reason)).toBe(expected))
  it.each([
    ['fifth student needs a reason', open(4), true, '', 'Enter a reason for this room to do this.'],
    ['fifth student with a reason', open(4), true, 'Sibling', ''],
    ['full room', open(5), true, 'Sibling', 'This room already has five students.'],
    ['final room needs a reason', { closed: false, finalized: true, memberCount: 2 }, true, '', 'Enter a reason for this room to do this.'],
    ['plain add', open(2), true, '', ''],
  ])('assign: %s', (_n, state, has, reason, expected) => expect(assignIssue(state, has, reason)).toBe(expected))
  it('requires an explicit room type', () => {
    expect(roomTypeIssue('')).toBe('Choose a room type.')
    expect(roomTypeIssue('Girls')).toBe('')
  })
})
