import { useState, type FormEvent } from 'react'
import { useMutation, usePaginatedQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Checkbox } from './components/ui/checkbox'
import { Input } from './components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import { userFacingError } from './lib/error-message'
import styles from './Adults.module.css'

type Parent = FunctionReturnType<typeof api.accounts.parents>['page'][number]

function EditParentAccess({ parent, onClose, onSaved, onBusy }: { parent: Parent; onClose: () => void; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const update = useMutation(api.accounts.updateParentStaffAccess)
  const [mentor, setMentor] = useState(parent.staffAccess !== null)
  const [lead, setLead] = useState(parent.staffAccess === 'travelLead')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); onBusy(true); setError('')
    try {
      await update({ userId: parent.userId, expectedRevision: parent.revision, staffAccess: mentor ? lead ? 'travelLead' : 'mentor' : null, reason: reason.trim() })
      onSaved()
    } catch (cause) { setError(userFacingError(cause, 'Access could not be saved. Please try again.')) } finally { setBusy(false); onBusy(false) }
  }
  return <form className={styles.form} onSubmit={event => void save(event)}>
    <p><strong>{parent.name}</strong><br/>{parent.email}</p>
    <label className={styles.check}><Checkbox checked={mentor} disabled={busy || !parent.active && !mentor} onCheckedChange={checked => { setMentor(checked); if (!checked) setLead(false) }}/><span>Mentor access</span></label>
    <p className="muted">Staff profile, team roster, and mentor reports.</p>
    <label className={styles.check}><Checkbox checked={lead} disabled={busy || !mentor || !parent.active && !lead} onCheckedChange={setLead}/><span>Travel Lead access</span></label>
    <p className="muted">Also manage team travel, events, and readiness. Extra finance editing and health exports stay disabled.</p>
    {!parent.active && <p>This account is inactive. You can remove staff access; reactivate the account before adding access.</p>}
    <label>Reason for this change<Input value={reason} required maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)}/></label>
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !reason.trim()}>{busy ? 'Saving…' : 'Save access'}</Button></div>
  </form>
}

export function ParentStaffAccess() {
  const { results, status, loadMore } = usePaginatedQuery(api.accounts.parents, {}, { initialNumItems: 20 })
  const [editing, setEditing] = useState<Parent | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  return <Card className={styles.surface}><CardHeader><CardTitle>Parent staff access</CardTitle><CardDescription>Parents keep their family access. Parents with staff access choose a role when they sign in and can switch roles later.</CardDescription></CardHeader><CardContent>
    {status === 'LoadingFirstPage' ? <p role="status">Loading parent accounts…</p> : results.length === 0 ? <p>No parent accounts yet. Connect the parent to their child first.</p> : <div className={styles.table}><table><thead><tr><th>Name</th><th>Access</th><th><span className="sr-only">Edit access</span></th></tr></thead><tbody>{results.map(parent => <tr key={parent.userId}><td data-label="Name"><strong>{parent.name}</strong><span className="muted">{parent.email}</span></td><td data-label="Access">{parent.staffAccess === 'travelLead' ? 'Parent, Mentor, Travel Lead' : parent.staffAccess === 'mentor' ? 'Parent, Mentor' : 'Parent'}{!parent.active && <span className="muted">Inactive</span>}</td><td><Button type="button" variant="outline" onClick={() => { setEditing(parent); setSaved(false) }}>Edit access</Button></td></tr>)}</tbody></table></div>}
    {status !== 'Exhausted' && status !== 'LoadingFirstPage' && <Button variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(20)}>{status === 'LoadingMore' ? 'Loading…' : 'Load more parents'}</Button>}
    {saved && <p role="status">Parent staff access saved.</p>}
    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !busy) setEditing(null) }}><DialogContent showCloseButton={!busy} className={styles.dialog}><DialogHeader><DialogTitle>Parent staff access</DialogTitle><DialogDescription>Choose the team roles this parent may use. Family connections stay in place.</DialogDescription></DialogHeader>{editing && <EditParentAccess key={`${editing.userId}:${editing.revision}`} parent={editing} onBusy={setBusy} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSaved(true) }}/>}</DialogContent></Dialog>
  </CardContent></Card>
}
