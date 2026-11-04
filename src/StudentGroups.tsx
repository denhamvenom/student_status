import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { userFacingError } from '@/lib/error-message'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'

/** Secondary subteam and Leadership as a roster query returns them; either may be missing on older projections. */
export type StudentGroupFields = { secondarySubteam?: string | null; leadership?: boolean; profileRevision?: number }

export const studentGroupsCopy = {
  secondary: 'Second subteam',
  leadership: 'Leadership',
  alsoCad: 'Also on CAD',
  none: 'None',
  yes: 'Yes',
  no: 'No',
  unavailable: 'Not available yet',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Not saved. Reload to see the latest, then try again.',
  stale: 'This student changed since this page loaded, so nothing was saved. Reload to see the latest, then try again.',
  reload: 'Reload',
  editHint: 'Only a Coach or Travel Lead can change these.',
  editSummary: 'Change second subteam or Leadership',
} as const

const copy = studentGroupsCopy
/** Both values are known only when the query returned them; an unknown value must never be saved over. */
export const studentGroupsKnown = (student: StudentGroupFields) => student.secondarySubteam !== undefined && student.leadership !== undefined
export const secondaryLabel = (student: StudentGroupFields) => !studentGroupsKnown(student) ? copy.unavailable : student.secondarySubteam?.trim() || copy.none
export const leadershipLabel = (student: StudentGroupFields) => !studentGroupsKnown(student) ? copy.unavailable : student.leadership ? copy.yes : copy.no

/** Only the groups that are set, e.g. "Second subteam: CAD · Leadership"; empty when neither is set or known. */
export function studentGroupsSummary(student: StudentGroupFields): string {
  if (!studentGroupsKnown(student)) return ''
  const secondary = student.secondarySubteam?.trim()
  return [secondary ? `${copy.secondary}: ${secondary}` : '', student.leadership ? copy.leadership : ''].filter(Boolean).join(' · ')
}

/** Read-only second subteam / Leadership line; renders nothing when neither is set. */
export function StudentGroupsText({ student }: { student: StudentGroupFields }) {
  const summary = studentGroupsSummary(student)
  return summary ? <>{summary}</> : null
}

const staleRevision = (cause: unknown) => cause instanceof ConvexError && typeof cause.data === 'string' && /changed since/i.test(cause.data)

type Groups = { cad: boolean; leadership: boolean }

/**
 * Coach / Travel Lead checkboxes for "Also on CAD" and Leadership. Each change saves immediately against the
 * revision the page loaded. Falls back to read-only text when the viewer can't edit or the values or revision weren't returned.
 */
export function StudentGroupsEditor({ studentId, studentName, student, canEdit }: { studentId: Id<'students'>; studentName: string; student: StudentGroupFields; canEdit: boolean }) {
  const save = useMutation(api.studentSubteams.setStudentSecondaryAndLeadership)
  const [pending, setPending] = useState<Groups | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [saved, setSaved] = useState(false)
  const editable = canEdit && studentGroupsKnown(student) && student.profileRevision !== undefined
  if (!editable) return <div><div className="detail"><span>{copy.secondary}</span><strong>{secondaryLabel(student)}</strong></div><div className="detail"><span>{copy.leadership}</span><strong>{leadershipLabel(student)}</strong></div></div>
  const busy = pending !== null
  const current: Groups = pending ?? { cad: student.secondarySubteam === 'CAD', leadership: !!student.leadership }
  const apply = async (next: Groups) => {
    if (busy || stale) return
    setPending(next); setError(''); setSaved(false)
    try {
      await save({ studentId, secondarySubteam: next.cad ? 'CAD' : null, leadership: next.leadership, expectedRevision: student.profileRevision ?? 0 })
      setSaved(true)
    } catch (cause) {
      if (staleRevision(cause)) setStale(true)
      else setError(userFacingError(cause, copy.failed))
    } finally { setPending(null) }
  }
  const disabled = busy || stale
  return <div className="form-grid">
    <label className="checkbox-label"><Checkbox aria-label={`${studentName} · ${copy.alsoCad}`} checked={current.cad} disabled={disabled} onCheckedChange={checked => void apply({ ...current, cad: checked })}/> {copy.alsoCad}</label>
    <label className="checkbox-label"><Checkbox aria-label={`${studentName} · ${copy.leadership}`} checked={current.leadership} disabled={disabled} onCheckedChange={checked => void apply({ ...current, leadership: checked })}/> {copy.leadership}</label>
    <p role="status" className={busy ? 'muted' : 'ready-text'}>{busy ? copy.saving : saved ? copy.saved : ''}</p>
    {stale && <div role="alert" className="action-row"><p className="open-text">{copy.stale}</p><Button type="button" variant="outline" onClick={() => window.location.reload()}>{copy.reload}</Button></div>}
    {error && <p role="alert" className="open-text">{error}</p>}
  </div>
}
