import { describe, expect, it } from 'vitest'
import { assignIssue, assignPickerNote, finalizeIssue, roomFieldIssues, roomTypeIssue } from './roomRules'

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
  it('reports every missing room field at once', () => {
    expect(roomFieldIssues('  ', '')).toEqual(['Enter a room name.', 'Choose a room type.'])
    expect(roomFieldIssues('Room 1', '')).toEqual(['Choose a room type.'])
    expect(roomFieldIssues('Room 1', 'Boys')).toEqual([])
  })
  it.each([
    ['matching student exists', 'Boys', [{ category: 'Boys' as const, groupId: null }], ''],
    ['everyone already in this room', 'Boys', [{ category: 'Boys' as const, groupId: 'g' }], ''],
    ['only the other type', 'Boys', [{ category: 'Girls' as const, groupId: null }], 'No Boys students can be assigned to this Boys room. Students with a Girls room type go in Girls rooms.'],
    ['only students with no type', 'Girls', [{ category: null, groupId: null }], 'No Girls students can be assigned to this Girls room. 1 student has no room type yet. Set it on the student record.'],
  ])('picker note: %s', (_n, type, students, expected) => expect(assignPickerNote(type as 'Boys' | 'Girls', students, 'g')).toBe(expected))
})
