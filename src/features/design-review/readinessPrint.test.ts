import { describe, expect, it } from 'vitest'
import { readinessPrintSummary, type ReadinessPrintInput } from './readinessPrint'

const complete: ReadinessPrintInput = {
  eventId: 'event', eventName: 'Regional', startsAt: 1000, endsAt: 2000, destination: 'City', generatedAt: 3000,
  students: [{ studentId: 'student', name: 'Student', state: 'ready', open: [] }],
  transportation: { state: 'ready', seats: 4, demand: 1, open: [] },
  rooming: { state: 'notApplicable', open: 0 },
  coverage: { participantsComplete: true, roomingComplete: true }, requirementsComplete: true, overall: 'ready',
}

describe('printable readiness summary', () => {
  it('requires verified coverage and does not treat skipped transportation as not applicable', () => {
    expect(readinessPrintSummary(complete).status).toBe('Complete')
    const partial = readinessPrintSummary({ ...complete, transportation: null, coverage: { participantsComplete: false, roomingComplete: true } })
    expect(partial.status).toBe('Draft')
    expect(partial.notes).toContain('Transportation could not be checked.')
    expect(partial.notes).toContain('Some event participants could not be checked.')
  })

  it('marks open requirements, empty rosters, and incomplete room or requirement coverage Draft', () => {
    expect(readinessPrintSummary({ ...complete, students: [{ studentId: 'student', name: 'Student', state: 'open', open: ['FIRST registration'] }] }).status).toBe('Draft')
    expect(readinessPrintSummary({ ...complete, students: [] }).status).toBe('Draft')
    expect(readinessPrintSummary({ ...complete, coverage: { participantsComplete: true, roomingComplete: false }, requirementsComplete: false }).notes).toEqual(expect.arrayContaining(['Some room groups could not be checked.', 'Some event requirements could not be checked.']))
  })
})
