export type ExportMember = { studentId: string; name: string; generation: number; financialRevision: number; chargeCount: number; capturedAt: number }
export type ExportCharge = { studentId: string; chargeId: string; csvLine: string }
export type ExportPage<T> = { page: T[]; isDone: boolean; continueCursor: string; scopeHash: string; collectedAt: number }
export type ExportReader = {
  members: (cursor: string | null) => Promise<ExportPage<ExportMember>>
  charges: (studentId: string, cursor: string | null) => Promise<ExportPage<ExportCharge>>
  verify: (cursor: string | null) => Promise<ExportPage<ExportMember>>
}

/** Keep data only in this call; return nothing until every scope/revision check succeeds. */
export async function collectFinanceExport(reader: ExportReader, expected: { scopeHash: string; memberCount: number; columns: string[] }, signal: AbortSignal) {
  const check = () => signal.throwIfAborted()
  const times: number[] = []
  async function pages<T>(read: (cursor: string | null) => Promise<ExportPage<T>>) {
    const rows: T[] = []; const seen = new Set<string>(); let cursor: string | null = null
    for (;;) {
      check(); const result = await read(cursor); check()
      if (result.scopeHash !== expected.scopeHash) throw new Error('Export scope changed. Prepare a new export.')
      times.push(result.collectedAt); rows.push(...result.page)
      if (result.isDone) return rows
      if (!result.continueCursor || seen.has(result.continueCursor)) throw new Error('Export could not finish paging. Try again.')
      seen.add(result.continueCursor); cursor = result.continueCursor
    }
  }
  const members = await pages(reader.members)
  if (members.length !== expected.memberCount || new Set(members.map(row => row.studentId)).size !== members.length) throw new Error('Export membership is incomplete. Prepare a new export.')
  const lines: string[] = []
  for (const member of members) {
    const charges = await pages(cursor => reader.charges(member.studentId, cursor))
    if (charges.length !== member.chargeCount || new Set(charges.map(row => row.chargeId)).size !== charges.length || charges.some(row => row.studentId !== member.studentId)) throw new Error('Export charges changed. Prepare a new export.')
    lines.push(...charges.map(row => row.csvLine))
  }
  const verified = await pages(reader.verify)
  const byId = new Map(verified.map(row => [row.studentId, row]))
  if (verified.length !== members.length || byId.size !== members.length || members.some(row => {
    const latest = byId.get(row.studentId)
    return !latest || latest.generation !== row.generation || latest.financialRevision !== row.financialRevision || latest.chargeCount !== row.chargeCount
  })) throw new Error('Accounts changed during collection. Prepare a new export.')
  check()
  const header = expected.columns.map(value => `"${value.replaceAll('"', '""')}"`).join(',')
  return {
    csv: [header, ...lines].join('\r\n') + '\r\n',
    manifest: { schemaVersion: 1, scopeHash: expected.scopeHash, collectionStartedAt: Math.min(...times), collectionCompletedAt: Math.max(...times), members, chargeCount: lines.length },
  }
}
