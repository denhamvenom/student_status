export type Audience = 'students' | 'parents' | 'both'

export function hasPinRoom(rows: { audience: Audience }[], audience: Audience, limit: number) {
  return (['students', 'parents'] as const).every(home => {
    if (audience !== 'both' && audience !== home) return true
    return rows.filter(row => row.audience === 'both' || row.audience === home).length < limit
  })
}
