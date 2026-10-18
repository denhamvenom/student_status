export type RetentionDraft = { fingerprint: string; latestEventId: string | null; action: 'hold' | 'release' }

export function startRetentionDraft(candidate: { archiveFingerprint: string | null; latestHoldEventId: string | null; held: boolean; status: string; archivedAt: number | null }): RetentionDraft | null {
  if (!candidate.archiveFingerprint || (!candidate.held && (candidate.status === 'active' || candidate.archivedAt === null))) return null
  return { fingerprint: candidate.archiveFingerprint, latestEventId: candidate.latestHoldEventId, action: candidate.held ? 'release' : 'hold' }
}

export function retentionDraftCurrent(draft: RetentionDraft, candidate: { archiveFingerprint: string | null; latestHoldEventId: string | null; held: boolean }) {
  return draft.fingerprint === candidate.archiveFingerprint && draft.latestEventId === candidate.latestHoldEventId && draft.action === (candidate.held ? 'release' : 'hold')
}
