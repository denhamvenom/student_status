import { describe, expect, it } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'
import { answerLabels, groupMentors, joinedLabels, totalsLine, type EventMentor } from './coach-view'
import { eventMentorsCopy as copy } from './copy'

const mentor = (name: string, overrides: Partial<EventMentor> = {}): EventMentor => ({
  mentorUserId: `fixture_user_${name}` as Id<'appUsers'>, name, status: 'accepted', source: 'individual',
  canDriveStudents: null, needsHotelRoom: null, seriesScope: null, seriesCount: null, ...overrides,
})
const both = { askDrive: true, askHotel: true }
const counts = { accepted: 4, invited: 1, declined: 0, drivers: 3, hotelRooms: 2, unansweredDrive: 1, unansweredHotel: 0 }

describe('Coach view of an event’s Mentors', () => {
  it('groups going, waiting and can’t go, keeping name order', () => {
    const groups = groupMentors([mentor('Ana', { status: 'declined' }), mentor('Ben'), mentor('Cy', { status: 'invited' }), mentor('Dee')])
    expect(groups.going.map(m => m.name)).toEqual(['Ben', 'Dee'])
    expect(groups.waiting.map(m => m.name)).toEqual(['Cy'])
    expect(groups.declined.map(m => m.name)).toEqual(['Ana'])
  })

  it.each([
    { name: 'invited by name', row: { source: 'individual', seriesScope: null, seriesCount: null }, labels: ['Invited'] },
    { name: 'invited with subteam', row: { source: 'subteam', seriesScope: null, seriesCount: null }, labels: ['Invited with subteam'] },
    { name: 'signed up, every meeting', row: { source: 'self', seriesScope: 'all', seriesCount: null }, labels: ['Signed up themselves', 'Series: every meeting'] },
    { name: 'signed up, next 4', row: { source: 'self', seriesScope: 'next', seriesCount: 4 }, labels: ['Signed up themselves', 'Series: next 4'] },
    { name: 'invited, just this one', row: { source: 'individual', seriesScope: 'one', seriesCount: null }, labels: ['Invited', 'Series: just this one'] },
  ] as const)('how they joined: $name', ({ row, labels }) => {
    expect(joinedLabels(row)).toEqual(labels)
  })

  it('shows a going Mentor’s answers only for the questions asked, and flags missing ones', () => {
    expect(answerLabels(mentor('A', { canDriveStudents: true, needsHotelRoom: true }), both).map(a => a.text)).toEqual([copy.answers.canDrive, copy.answers.needsHotel])
    expect(answerLabels(mentor('B', { canDriveStudents: false, needsHotelRoom: null }), both).map(a => a.text)).toEqual([copy.answers.hotelUnanswered])
    expect(answerLabels(mentor('C', { canDriveStudents: true }), { askDrive: false, askHotel: false })).toEqual([])
    expect(answerLabels(mentor('D', { status: 'invited', canDriveStudents: true }), both)).toEqual([])
  })

  it('totals only the questions the event asks', () => {
    expect(totalsLine({ questions: both, counts })).toBe('3 Mentors can drive · 2 hotel rooms needed')
    expect(totalsLine({ questions: { askDrive: true, askHotel: false }, counts: { ...counts, drivers: 1 } })).toBe('1 Mentor can drive')
    expect(totalsLine({ questions: { askDrive: false, askHotel: true }, counts: { ...counts, hotelRooms: 1 } })).toBe('1 hotel room needed')
    expect(totalsLine({ questions: { askDrive: false, askHotel: false }, counts })).toBeNull()
  })
})
