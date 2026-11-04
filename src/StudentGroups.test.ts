import { describe, expect, it } from 'vitest'
import { leadershipLabel, secondaryLabel, studentGroupsKnown } from './StudentGroups'

describe('second subteam and Leadership wording', () => {
  it.each([
    { name: 'values the roster query did not return are never shown as None / No', student: {}, known: false, secondary: 'Not available yet', leadership: 'Not available yet' },
    { name: 'no second subteam', student: { secondarySubteam: null, leadership: false }, known: true, secondary: 'None', leadership: 'No' },
    { name: 'CAD and Leadership', student: { secondarySubteam: 'CAD', leadership: true }, known: true, secondary: 'CAD', leadership: 'Yes' },
  ])('$name', ({ student, known, secondary, leadership }) => {
    expect([studentGroupsKnown(student), secondaryLabel(student), leadershipLabel(student)]).toEqual([known, secondary, leadership])
  })
})
