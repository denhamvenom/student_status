import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import { ReviewRow, StepWizard } from './components/StepWizard'
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

/**
 * Keep the profile the Coach opened; a live change to the fields they are editing shows a notice instead of silently
 * replacing their edits. A revision bump that leaves those fields the same (another screen touched the record, or the
 * first result was a cached one) is not a change: the new revision is used for saving and no notice appears.
 */
function useOpenedSnapshot<T extends { profileRevision: number }>(live: T | undefined, fields: (profile: T) => string) {
  const [opened, setOpened] = useState<T | null>(null)
  useEffect(() => { if (live && !opened) setOpened(live) }, [live, opened])
  const sameFields = !!live && !!opened && fields(live) === fields(opened)
  const stale = !!live && !!opened && live.profileRevision !== opened.profileRevision && !sameFields
  const profile = opened && live && sameFields ? { ...opened, profileRevision: live.profileRevision } : opened
  return { opened: profile, key: opened?.profileRevision, stale, reload: () => { if (live) setOpened(live) } }
}

function EmailField({ value, original, onChange, disabled, note }: { value: string; original: string; onChange: (value: string) => void; disabled: boolean; note?: string }) {
  const changed = emailKey(value) !== emailKey(original)
  return <div className={styles.field}>
    <label className={styles.field}>Sign-in email<Input type="email" autoComplete="off" required maxLength={254} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} aria-describedby={changed ? 'coach-profile-email-warning' : undefined}/></label>
    {changed && <p id="coach-profile-email-warning" role="status" className={styles.warning}><strong>Sign-in email is changing.</strong> {note ?? signInWarning}</p>}
  </div>
}

/** A reason is optional for ordinary edits and required, for the audit trail, when the email changes. */
function ReasonField({ value, onChange, disabled, emailChanged }: { value: string; onChange: (value: string) => void; disabled: boolean; emailChanged: boolean }) {
  return <label className={styles.field}>{emailChanged ? 'Reason for the email change' : 'Reason (optional)'}<Input value={value} required={emailChanged} maxLength={REASON_MAX} disabled={disabled} onChange={event => onChange(event.target.value)}/></label>
}

export const profileWizardCopy = {
  title: 'Edit profile',
  reason: 'Reason',
  review: 'Review',
  next: 'Continue',
  save: 'Save profile',
  saving: 'Saving…',
  stale: 'This profile changed since you opened it. Load the latest before saving.',
  loadLatest: 'Load latest',
  reasonHint: 'The reason is saved with the change so other Coaches can see why.',
  changed: 'changed',
  empty: 'Not provided',
} as const

type ReviewLine = { label: string; value: string; changed: boolean; page: number }
type Page = { heading: string; valid: boolean; body: ReactNode }

/** Each field's value for the Review step, marked when it differs from what the Coach opened. */
export function reviewLines(fields: { label: string; original: string; value: string; page: number }[]): ReviewLine[] {
  return fields.map(({ label, original, value, page }) => ({ label, page, value: value.trim() || profileWizardCopy.empty, changed: value.trim() !== original.trim() }))
}

/**
 * Edit profile, one question at a time: each page of fields, then Reason, then Review. Nothing is saved until
 * Save profile on Review, and a changed sign-in email is called out there, so the Review step is the confirmation.
 */
function ProfileWizard({ stale, onReload, onCancel, busy, error, pages, emailChanged, emailNote, reason, onReason, lines, onSave }: { stale: boolean; onReload: () => void; onCancel: () => void; busy: boolean; error: string; pages: Page[]; emailChanged: boolean; emailNote: string; reason: string; onReason: (value: string) => void; lines: ReviewLine[]; onSave: () => void }) {
  const [step, setStep] = useState(0)
  const reasonMissing = emailChanged && !reason.trim()
  const reasonAt = pages.length, reviewAt = pages.length + 1
  const allValid = pages.every(page => page.valid)
  const headings = [...pages.map(page => page.heading), profileWizardCopy.reason, profileWizardCopy.review]
  const ready = [...pages.map(page => page.valid), !reasonMissing, allValid && !reasonMissing && !stale]
  const last = step === reviewAt
  return <div className={styles.form}>
    {stale && <p role="status" className={styles.warning}>{profileWizardCopy.stale} <Button type="button" variant="outline" onClick={onReload}>{profileWizardCopy.loadLatest}</Button></p>}
    <StepWizard title={profileWizardCopy.title} step={step + 1} total={headings.length} heading={headings[step]!} nextLabel={last ? (busy ? profileWizardCopy.saving : profileWizardCopy.save) : profileWizardCopy.next} nextDisabled={!ready[step]} onNext={last ? onSave : () => setStep(step + 1)} onBack={step > 0 ? () => setStep(step - 1) : undefined} onCancel={onCancel} busy={busy} error={error} className={styles.form}>
      {step < reasonAt && pages[step]!.body}
      {step === reasonAt && <><ReasonField value={reason} onChange={onReason} disabled={busy} emailChanged={emailChanged}/><p className={styles.muted}>{profileWizardCopy.reasonHint}</p></>}
      {step === reviewAt && <>
        <dl className="m-0">{lines.map(line => <ReviewRow key={line.label} label={line.label} value={<>{line.value}{line.changed && <span className={styles.muted}> · {profileWizardCopy.changed}</span>}</>} onEdit={() => setStep(line.page)} disabled={busy}/>)}
          <ReviewRow label={profileWizardCopy.reason} value={reason.trim() || profileWizardCopy.empty} onEdit={() => setStep(reasonAt)} disabled={busy}/></dl>
        {emailChanged && <p role="status" className={styles.warning}><strong>Sign-in email is changing.</strong> {emailNote}</p>}
      </>}
    </StepWizard>
  </div>
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
    if (busy || stale) return
    setBusy(true); onBusy(true); setError('')
    try {
      const result = await update({ userId: profile.userId, expectedProfileRevision: profile.profileRevision, name, email, phone, reason: reason.trim() || undefined })
      onSaved(savedMessage(result, email))
    } catch (cause) { setError(userFacingError(cause, failed)) } finally { setBusy(false); onBusy(false) }
  }
  const pages: Page[] = [
    { heading: 'Name', valid: !!name.trim(), body: <>
      <p className={styles.muted}>{roleName[profile.role]}{profile.active ? '' : ' · Inactive account'}</p>
      <label className={styles.field}>Name<Input value={name} required maxLength={100} disabled={busy} onChange={event => setName(event.target.value)}/></label>
    </> },
    { heading: 'Sign-in email', valid: !!email.trim(), body: <>
      <EmailField value={email} original={profile.email} onChange={setEmail} disabled={busy || profile.isSelf}/>
      {profile.isSelf && <p className={styles.muted}>Ask another Coach to change your own sign-in email.</p>}
    </> },
    { heading: 'Phone', valid: true, body: <label className={styles.field}>Phone<Input type="tel" autoComplete="off" maxLength={50} value={phone} disabled={busy} onChange={event => setPhone(event.target.value)}/></label> },
  ]
  return <ProfileWizard stale={stale} onReload={onReload} onCancel={onCancel} busy={busy} error={error} pages={pages} emailChanged={emailChanged} emailNote={signInWarning} reason={reason} onReason={setReason} onSave={() => void save()}
    lines={reviewLines([{ label: 'Name', original: profile.name, value: name, page: 0 }, { label: 'Sign-in email', original: profile.email, value: email, page: 1 }, { label: 'Phone', original: profile.phone, value: phone, page: 2 }])}/>
}

function AdultEditor({ userId, onCancel, onSaved, onBusy }: { userId: Id<'appUsers'>; onCancel: () => void; onSaved: (message: string) => void; onBusy: (busy: boolean) => void }) {
  const live = useQuery(api.coachProfileEdit.adultProfile, { userId })
  const { opened, key, stale, reload } = useOpenedSnapshot(live, p => JSON.stringify([p.name, p.email, p.phone, p.active, p.role]))
  if (!opened) return <p role="status">Loading profile…</p>
  return <AdultFields key={key} profile={opened} stale={stale} onReload={reload} onCancel={onCancel} onSaved={onSaved} onBusy={onBusy}/>
}

type EditorBody = (close: (message?: string) => void, setBusy: (busy: boolean) => void) => ReactNode

/** The edit box itself. It closes only through `onDone`: Cancel, the close button, Escape or a successful save. */
function EditDialogFrame({ title, open, onDone, finalFocus, children }: { title: string; open: boolean; onDone: (message?: string) => void; finalFocus?: () => HTMLElement | null; children: EditorBody }) {
  const [busy, setBusy] = useState(false)
  const close = (message?: string) => { setBusy(false); onDone(message) }
  // A stray click outside must not discard typed values.
  return <Dialog open={open} disablePointerDismissal onOpenChange={next => { if (!next && !busy) close() }}>
    <DialogContent showCloseButton={!busy} className={styles.dialog} finalFocus={finalFocus}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Changes apply right away. Changing the email also changes how this person signs in.</DialogDescription></DialogHeader>
      {open && children(close, setBusy)}
    </DialogContent>
  </Dialog>
}

function EditDialog({ label, title, trigger, children }: { label: string; title: string; trigger?: 'outline' | 'default'; children: EditorBody }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  return <>
    <Button ref={triggerRef} type="button" variant={trigger ?? 'outline'} className={styles.trigger} onClick={() => { setSaved(''); setOpen(true) }}>{label}</Button>
    {saved && <p role="status" className="ready-text">{saved}</p>}
    <EditDialogFrame title={title} open={open} onDone={message => { setOpen(false); if (message) setSaved(message) }} finalFocus={() => triggerRef.current?.isConnected ? triggerRef.current : null}>{children}</EditDialogFrame>
  </>
}

export type AdultProfileTarget = { userId: Id<'appUsers'>; name: string }

/**
 * Controlled "Edit profile" box for a Coach, Mentor or Parent account, for hosts whose rows can unmount while it is
 * open (a paginated list reloading). Render it outside those rows; it closes only through `onDone`.
 */
export function AdultProfileDialog({ target, onDone }: { target: AdultProfileTarget | null; onDone: (message?: string) => void }) {
  return <EditDialogFrame title={`Edit profile: ${target?.name ?? ''}`} open={target !== null} onDone={onDone}>{(close, setBusy) => target && <AdultEditor key={target.userId} userId={target.userId} onCancel={() => close()} onSaved={close} onBusy={setBusy}/>}</EditDialogFrame>
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
  const linked = profile.signIn === 'linked'
  const save = async () => {
    if (busy || stale) return
    setBusy(true); onBusy(true); setError('')
    try {
      const result = await update({ studentId: profile.studentId, expectedRevision: profile.profileRevision, legalName, preferredName, email, shirtSize: shirtSize || null, reason: reason.trim() || undefined })
      onSaved(linked ? savedMessage(result, email) : 'Profile saved.')
    } catch (cause) { setError(userFacingError(cause, failed)) } finally { setBusy(false); onBusy(false) }
  }
  const emailNote = linked ? signInWarning : 'No student sign-in is linked yet, so this changes the roster email only.'
  const pages: Page[] = [
    { heading: 'Names', valid: !!legalName.trim() && !!preferredName.trim(), body: <>
      <label className={styles.field}>Legal name<Input value={legalName} required maxLength={160} disabled={busy} onChange={event => setLegalName(event.target.value)}/></label>
      <label className={styles.field}>Preferred name<Input value={preferredName} required maxLength={80} disabled={busy} onChange={event => setPreferredName(event.target.value)}/></label>
    </> },
    { heading: 'Sign-in email', valid: !!email.trim(), body: <EmailField value={email} original={profile.email} onChange={setEmail} disabled={busy} note={linked ? undefined : emailNote}/> },
    { heading: 'Shirt size', valid: true, body: <>
      <label className={styles.field}>Shirt size<NativeSelect value={shirtSize} disabled={busy} onChange={event => setShirtSize(event.target.value as Size | '')}><NativeSelectOption value="" disabled={profile.shirtSize !== null}>Not provided</NativeSelectOption>{SIZES.map(size => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}</NativeSelect></label>
      <p className={styles.muted}>Health, emergency and guardian details stay with the permission form.</p>
    </> },
  ]
  return <ProfileWizard stale={stale} onReload={onReload} onCancel={onCancel} busy={busy} error={error} pages={pages} emailChanged={emailChanged} emailNote={emailNote} reason={reason} onReason={setReason} onSave={() => void save()}
    lines={reviewLines([{ label: 'Legal name', original: profile.legalName, value: legalName, page: 0 }, { label: 'Preferred name', original: profile.preferredName, value: preferredName, page: 0 }, { label: 'Sign-in email', original: profile.email, value: email, page: 1 }, { label: 'Shirt size', original: profile.shirtSize ?? '', value: shirtSize, page: 2 }])}/>
}

function StudentEditor({ studentId, onCancel, onSaved, onBusy }: { studentId: Id<'students'>; onCancel: () => void; onSaved: (message: string) => void; onBusy: (busy: boolean) => void }) {
  const live = useQuery(api.coachProfileEdit.studentProfile, { studentId })
  const { opened, key, stale, reload } = useOpenedSnapshot(live, p => JSON.stringify([p.legalName, p.preferredName, p.email, p.shirtSize, p.signIn]))
  if (!opened) return <p role="status">Loading profile…</p>
  return <StudentFields key={key} profile={opened} stale={stale} onReload={reload} onCancel={onCancel} onSaved={onSaved} onBusy={onBusy}/>
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
