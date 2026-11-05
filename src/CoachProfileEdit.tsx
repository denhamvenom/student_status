import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import { ConfirmAction } from './ConfirmAction'
import { userFacingError } from './lib/error-message'
import styles from './CoachProfileEdit.module.css'

type AdultProfile = FunctionReturnType<typeof api.coachProfileEdit.adultProfile>
type StudentProfile = FunctionReturnType<typeof api.coachProfileEdit.studentProfile>
type SaveResult = FunctionReturnType<typeof api.coachProfileEdit.updateAdultProfile>
type Size = NonNullable<StudentProfile['shirtSize']>

const SIZES: readonly Size[] = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
const emailKey = (value: string) => value.trim().toLowerCase()
const failed = 'The profile could not be saved. Please try again.'
const REASON_MAX = 500
const roleName = { coach: 'Coach', mentor: 'Mentor', parent: 'Parent' } as const
const signInWarning = 'They will sign in with the new email from now on. The old email will stop working, and they will be signed out on every device.'

function savedMessage(result: SaveResult, email: string) {
  return result.emailChanged ? `Profile saved. They now sign in with ${emailKey(email)}.` : 'Profile saved.'
}

/** Keep the revision the Coach opened; a live change shows a notice instead of silently replacing their edits. */
function useOpenedSnapshot<T extends { profileRevision: number }>(live: T | undefined) {
  const [opened, setOpened] = useState<T | null>(null)
  useEffect(() => { if (live && !opened) setOpened(live) }, [live, opened])
  return { opened, stale: !!live && !!opened && live.profileRevision !== opened.profileRevision, reload: () => { if (live) setOpened(live) } }
}

function EmailField({ value, original, onChange, disabled, note }: { value: string; original: string; onChange: (value: string) => void; disabled: boolean; note?: string }) {
  const changed = emailKey(value) !== emailKey(original)
  return <div className={styles.field}>
    <label className={styles.field}>Sign-in email<Input type="email" autoComplete="off" required maxLength={254} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} aria-describedby={changed ? 'coach-profile-email-warning' : undefined}/></label>
    {changed && <p id="coach-profile-email-warning" role="status" className={styles.warning}><strong>Login email is changing.</strong> {note ?? signInWarning}</p>}
  </div>
}

/** A reason is optional for ordinary edits and required, for the audit trail, when the email changes. */
function ReasonField({ value, onChange, disabled, emailChanged }: { value: string; onChange: (value: string) => void; disabled: boolean; emailChanged: boolean }) {
  return <label className={styles.field}>{emailChanged ? 'Reason for the email change' : 'Reason (optional)'}<Input value={value} required={emailChanged} maxLength={REASON_MAX} disabled={disabled} onChange={event => onChange(event.target.value)}/></label>
}

/**
 * Runs a confirmed save with the edit box locked (it cannot be dismissed mid-save) and any failure shown inside the
 * box as well as in the confirmation, so it is still there after the Coach closes the confirmation.
 */
function confirmedSave(save: () => Promise<void>, setBusy: (busy: boolean) => void, onBusy: (busy: boolean) => void, setError: (error: string) => void) {
  return async () => {
    setBusy(true); onBusy(true); setError('')
    try { await save() } catch (cause) { setError(userFacingError(cause, failed)); throw cause } finally { setBusy(false); onBusy(false) }
  }
}

/** Save directly, or freeze the change behind ConfirmAction when the login email moves. */
function SaveControls({ busy, stale, emailChanged, invalid, onCancel, onReload, run }: { busy: boolean; stale: boolean; emailChanged: boolean; invalid: boolean; onCancel: () => void; onReload: () => void; run: () => Promise<unknown> }) {
  return <>
    {stale && <p role="status" className={styles.warning}>This profile changed since you opened it. Load the latest before saving.</p>}
    <div className={styles.actions}>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      {stale && <Button type="button" variant="outline" onClick={onReload}>Load latest</Button>}
      {emailChanged
        ? <ConfirmAction disabled={busy || stale || invalid} description={`Change the login email? ${signInWarning}`} onConfirm={run}>Save profile</ConfirmAction>
        : <Button type="submit" disabled={busy || stale || invalid}>{busy ? 'Saving…' : 'Save profile'}</Button>}
    </div>
  </>
}

function AdultFields({ profile, stale, onReload, onCancel, onSaved, onBusy }: { profile: AdultProfile; stale: boolean; onReload: () => void; onCancel: () => void; onSaved: (message: string) => void; onBusy: (busy: boolean) => void }) {
  const update = useMutation(api.coachProfileEdit.updateAdultProfile)
  const [name, setName] = useState(profile.name)
  const [email, setEmail] = useState(profile.email)
  const [phone, setPhone] = useState(profile.phone)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const emailChanged = emailKey(email) !== emailKey(profile.email)
  const save = async () => {
    const result = await update({ userId: profile.userId, expectedProfileRevision: profile.profileRevision, name, email, phone, reason: reason.trim() || undefined })
    onSaved(savedMessage(result, email))
  }
  const confirmed = confirmedSave(save, setBusy, onBusy, setError)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || stale || emailChanged) return
    setBusy(true); onBusy(true); setError('')
    try { await save() } catch (cause) { setError(userFacingError(cause, failed)) } finally { setBusy(false); onBusy(false) }
  }
  return <form className={styles.form} onSubmit={event => void submit(event)}>
    <p className={styles.muted}>{roleName[profile.role]}{profile.active ? '' : ' · Inactive account'}</p>
    <label className={styles.field}>Name<Input value={name} required maxLength={100} disabled={busy} onChange={event => setName(event.target.value)}/></label>
    <EmailField value={email} original={profile.email} onChange={setEmail} disabled={busy || profile.isSelf}/>
    {profile.isSelf && <p className={styles.muted}>Ask another Coach to change your own sign-in email.</p>}
    <label className={styles.field}>Phone<Input type="tel" autoComplete="off" maxLength={50} value={phone} disabled={busy} onChange={event => setPhone(event.target.value)}/></label>
    <ReasonField value={reason} onChange={setReason} disabled={busy} emailChanged={emailChanged}/>
    {error && <p role="alert" className="open-text">{error}</p>}
    <SaveControls busy={busy} stale={stale} emailChanged={emailChanged} invalid={!name.trim() || !email.trim() || (emailChanged && !reason.trim())} onCancel={onCancel} onReload={onReload} run={confirmed}/>
  </form>
}

function AdultEditor({ userId, onCancel, onSaved, onBusy }: { userId: Id<'appUsers'>; onCancel: () => void; onSaved: (message: string) => void; onBusy: (busy: boolean) => void }) {
  const live = useQuery(api.coachProfileEdit.adultProfile, { userId })
  const { opened, stale, reload } = useOpenedSnapshot(live)
  if (!opened) return <p role="status">Loading profile…</p>
  return <AdultFields key={opened.profileRevision} profile={opened} stale={stale} onReload={reload} onCancel={onCancel} onSaved={onSaved} onBusy={onBusy}/>
}

function EditDialog({ label, title, trigger, children }: { label: string; title: string; trigger?: 'outline' | 'default'; children: (close: (message?: string) => void, setBusy: (busy: boolean) => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const close = (message?: string) => { setOpen(false); setBusy(false); if (message) setSaved(message) }
  return <>
    <Button ref={triggerRef} type="button" variant={trigger ?? 'outline'} className={styles.trigger} onClick={() => { setSaved(''); setOpen(true) }}>{label}</Button>
    {saved && <p role="status" className="ready-text">{saved}</p>}
    {/* A stray click outside must not discard typed values: the box closes only on Cancel, the close button, Escape or a successful save. */}
    <Dialog open={open} disablePointerDismissal onOpenChange={next => { if (!next && !busy) setOpen(false) }}>
      <DialogContent showCloseButton={!busy} className={styles.dialog} finalFocus={() => triggerRef.current?.isConnected ? triggerRef.current : null}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Changes apply right away. Changing the email also changes how this person signs in.</DialogDescription></DialogHeader>
        {open && children(close, setBusy)}
      </DialogContent>
    </Dialog>
  </>
}

/** Coach-only "Edit profile" for a Coach, Mentor or Parent account. The server enforces the Coach role. */
export function EditAdultProfileButton({ userId, name, label = 'Edit profile' }: { userId: Id<'appUsers'>; name: string; label?: string }) {
  return <EditDialog label={label} title={`Edit profile: ${name}`}>{(close, setBusy) => <AdultEditor userId={userId} onCancel={() => close()} onSaved={close} onBusy={setBusy}/>}</EditDialog>
}

function StudentFields({ profile, stale, onReload, onCancel, onSaved, onBusy }: { profile: StudentProfile; stale: boolean; onReload: () => void; onCancel: () => void; onSaved: (message: string) => void; onBusy: (busy: boolean) => void }) {
  const update = useMutation(api.coachProfileEdit.updateStudentProfile)
  const [legalName, setLegalName] = useState(profile.legalName)
  const [preferredName, setPreferredName] = useState(profile.preferredName)
  const [email, setEmail] = useState(profile.email)
  const [shirtSize, setShirtSize] = useState<Size | ''>(profile.shirtSize ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const emailChanged = emailKey(email) !== emailKey(profile.email)
  const save = async () => {
    const result = await update({ studentId: profile.studentId, expectedRevision: profile.profileRevision, legalName, preferredName, email, shirtSize: shirtSize || null, reason: reason.trim() || undefined })
    onSaved(profile.signIn === 'linked' ? savedMessage(result, email) : 'Profile saved.')
  }
  const confirmed = confirmedSave(save, setBusy, onBusy, setError)
  const confirmEmail = emailChanged && profile.signIn === 'linked'
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || stale || confirmEmail) return
    setBusy(true); onBusy(true); setError('')
    try { await save() } catch (cause) { setError(userFacingError(cause, failed)) } finally { setBusy(false); onBusy(false) }
  }
  return <form className={styles.form} onSubmit={event => void submit(event)}>
    <div className={styles.row}>
      <label className={styles.field}>Legal name<Input value={legalName} required maxLength={160} disabled={busy} onChange={event => setLegalName(event.target.value)}/></label>
      <label className={styles.field}>Preferred name<Input value={preferredName} required maxLength={80} disabled={busy} onChange={event => setPreferredName(event.target.value)}/></label>
    </div>
    <EmailField value={email} original={profile.email} onChange={setEmail} disabled={busy} note={profile.signIn === 'linked' ? undefined : 'No student sign-in is linked yet, so this changes the roster email only.'}/>
    <label className={styles.field}>Shirt size<NativeSelect value={shirtSize} disabled={busy} onChange={event => setShirtSize(event.target.value as Size | '')}><NativeSelectOption value="" disabled={profile.shirtSize !== null}>Not provided</NativeSelectOption>{SIZES.map(size => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}</NativeSelect></label>
    <p className={styles.muted}>Health, emergency and guardian details stay with the permission form.</p>
    <ReasonField value={reason} onChange={setReason} disabled={busy} emailChanged={emailChanged}/>
    {error && <p role="alert" className="open-text">{error}</p>}
    <SaveControls busy={busy} stale={stale} emailChanged={confirmEmail} invalid={!legalName.trim() || !preferredName.trim() || !email.trim() || (emailChanged && !reason.trim())} onCancel={onCancel} onReload={onReload} run={confirmed}/>
  </form>
}

function StudentEditor({ studentId, onCancel, onSaved, onBusy }: { studentId: Id<'students'>; onCancel: () => void; onSaved: (message: string) => void; onBusy: (busy: boolean) => void }) {
  const live = useQuery(api.coachProfileEdit.studentProfile, { studentId })
  const { opened, stale, reload } = useOpenedSnapshot(live)
  if (!opened) return <p role="status">Loading profile…</p>
  return <StudentFields key={opened.profileRevision} profile={opened} stale={stale} onReload={reload} onCancel={onCancel} onSaved={onSaved} onBusy={onBusy}/>
}

/** Coach-only "Edit profile" for an active student record. */
export function EditStudentProfileButton({ studentId, name }: { studentId: Id<'students'>; name: string }) {
  return <EditDialog label="Edit profile" title={`Edit profile: ${name}`}>{(close, setBusy) => <StudentEditor studentId={studentId} onCancel={() => close()} onSaved={close} onBusy={setBusy}/>}</EditDialog>
}

/** Edit buttons for each Parent account actively linked to the student this season. */
export function LinkedParentProfileEditors({ studentId }: { studentId: Id<'students'> }) {
  const profile = useQuery(api.coachProfileEdit.studentProfile, { studentId })
  if (!profile || profile.parents.length === 0) return null
  return <div className={styles.parents}><p className={styles.muted}>Edit a linked Parent's profile or sign-in email:</p>{profile.parents.map(parent => <div key={parent.userId} className={styles.parent}><span><strong>{parent.name}</strong><br/><span className={styles.muted}>{parent.email}</span></span><EditAdultProfileButton userId={parent.userId} name={parent.name} label={`Edit ${parent.name}`}/></div>)}{profile.parentCoverage === 'unknown' && <p className={styles.muted}>More Parent links may exist than are shown here.</p>}</div>
}
