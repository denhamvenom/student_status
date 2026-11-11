/** When a Coach or Travel Lead must give a reason for a room change (mirrors convex/rooms.ts). */
export type RoomState = { closed: boolean; finalized: boolean; memberCount: number }

/** Adding a student needs a reason after the deadline, in a final room, or for a fifth student. */
export const assignNeedsReason = ({ closed, finalized, memberCount }: RoomState) => closed || finalized || memberCount >= 4

/** Finalizing needs a reason only after the deadline or for a full room of five. */
export const finalizeNeedsReason = ({ closed, memberCount }: RoomState) => closed || memberCount >= 5

/** Why Finalize is unavailable, or "" when it can go ahead. */
export function finalizeIssue(state: RoomState, reason: string): string {
  if (state.memberCount === 0) return 'Add at least one student before finalizing this room.'
  if (finalizeNeedsReason(state) && !reason.trim()) return 'Enter a reason to finalize this room.'
  return ''
}

/** Why Assign is unavailable, or "" when it can go ahead. */
export function assignIssue(state: RoomState, hasStudent: boolean, reason: string): string {
  if (!hasStudent) return 'Choose a student first.'
  if (state.memberCount >= 5) return 'This room already has five students.'
  if (assignNeedsReason(state) && !reason.trim()) return 'Enter a reason for this room to do this.'
  return ''
}

/** The room type must be chosen on purpose; there is no default. */
export const roomTypeIssue = (category: '' | 'Boys' | 'Girls') => category ? '' : 'Choose a room type.'

/** Every missing field on the "Name the room" step, so people fix them in one pass. */
export function roomFieldIssues(name: string, category: '' | 'Boys' | 'Girls'): string[] {
  return [name.trim() ? '' : 'Enter a room name.', roomTypeIssue(category)].filter(Boolean)
}

/** Why a room's student picker is empty: students exist, but none match the room type. "" when the picker has choices or nobody needs placing. */
export function assignPickerNote(roomType: 'Boys' | 'Girls', students: { category: 'Boys' | 'Girls' | null; groupId: string | null }[], groupId: string): string {
  const others = students.filter(student => student.groupId !== groupId)
  if (!others.length || others.some(student => student.category === roomType)) return ''
  const noType = others.filter(student => !student.category).length
  const other = roomType === 'Boys' ? 'Girls' : 'Boys'
  const parts = [`No ${roomType} students can be assigned to this ${roomType} room.`]
  if (others.length > noType) parts.push(`Students with a ${other} room type go in ${other} rooms.`)
  if (noType) parts.push(`${noType} ${noType === 1 ? 'student has' : 'students have'} no room type yet. Set it on the student record.`)
  return parts.join(' ')
}
