export type ReadinessPrintInput = {
  eventId: string
  eventName: string
  startsAt: number
  endsAt: number
  destination: string
  generatedAt: number
  students: { studentId: string; name: string; state: string; open: string[] }[]
  transportation: { state: string; seats: number; demand: number; open: string[] } | null
  rooming: { state: string; open: number } | null
  coverage: { participantsComplete: boolean; roomingComplete: boolean } | null
  requirementsComplete: boolean
  overall: string
}

export function readinessPrintSummary(input: ReadinessPrintInput) {
  const unknown = !input.coverage?.participantsComplete || !input.coverage.roomingComplete || !input.requirementsComplete || !input.transportation || !input.rooming
  const open = input.overall !== 'ready' || input.students.length === 0 || input.students.some(student => student.state !== 'ready' || student.open.length > 0) || input.transportation?.state === 'open' || input.rooming?.state === 'open'
  const notes = [
    !input.coverage?.participantsComplete ? 'Some event participants could not be checked.' : null,
    !input.coverage?.roomingComplete ? 'Some room groups could not be checked.' : null,
    !input.requirementsComplete ? 'Some event requirements could not be checked.' : null,
    !input.transportation ? 'Transportation could not be checked.' : null,
    !input.rooming ? 'Rooming could not be checked.' : null,
    input.students.length === 0 ? 'No confirmed participants are in this summary.' : null,
  ].filter((note): note is string => note !== null)
  return { ...input, status: unknown || open ? 'Draft' as const : 'Complete' as const, notes }
}
