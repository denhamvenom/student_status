import { ParentStaffAccess } from "./ParentStaffAccess"
import { ContactAdminFor } from './ContactAdminButton'
import { userFacingError } from '@/lib/error-message'
import { ParentEmailSignIn } from './ParentInvites'
import { Component, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Link, useNavigate } from 'react-router'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import { accountCopy } from './lib/account-copy'
import styles from './Adults.module.css'
import { adultInvitationLandingUrl, readAdultInvitationToken, prepareAdultInvitationOAuth, clearAdultInvitationOAuth } from './lib/adult-invitation-token'

const copy = accountCopy.adults
const message = (error: unknown) => userFacingError(error, copy.failed)
const when = (time: number) => new Date(time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
type Adult = { userId: Id<'appUsers'>; name: string; email: string; role: 'coach' | 'mentor'; travelLead: boolean; financialEdit: boolean; healthExport: boolean; active: boolean; revision: number }
type AccessChoice = 'coach' | 'mentor' | 'lead'
const roleLabel = (adult: {role: 'coach' | 'mentor'; travelLead: boolean}) => adult.role === 'coach' ? copy.coach : adult.travelLead ? copy.mentorLead : copy.mentor

class AccountsBoundary extends Component<{children: ReactNode}, {error: unknown}> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() { return this.state.error !== null ? <Card><CardContent><p role="alert">{userFacingError(this.state.error, copy.failed, false)}</p><Button variant="outline" onClick={() => window.location.reload()}>{copy.retry}</Button></CardContent></Card> : this.props.children }
}

function AccessFields({choice, setChoice, finance, setFinance, health, setHealth, busy}: {choice: AccessChoice; setChoice: (value: AccessChoice) => void; finance: boolean; setFinance: (value: boolean) => void; health: boolean; setHealth: (value: boolean) => void; busy: boolean}) {
  return <><label>{copy.role}<NativeSelect value={choice} disabled={busy} onChange={event => {setChoice(event.target.value as AccessChoice); setFinance(false); setHealth(false)}}><NativeSelectOption value="coach">{copy.coach}</NativeSelectOption><NativeSelectOption value="mentor">{copy.mentor}</NativeSelectOption><NativeSelectOption value="lead">{copy.mentorLead}</NativeSelectOption></NativeSelect></label>{choice === 'coach' ? <p className="muted">{copy.coachAccess}</p> : <><p className="muted">{copy.grantNotice}</p><label className={styles.check}><Checkbox checked={finance} disabled={busy || choice !== 'lead'} onCheckedChange={setFinance}/><span>{copy.finance}</span></label><label className={styles.check}><Checkbox checked={health} disabled={busy || choice !== 'lead'} onCheckedChange={setHealth}/><span>{copy.health}</span></label></>}</>
}

function EditAdult({adult, done, cancel, busyChanged}: {adult: Adult; done: () => void; cancel: () => void; busyChanged: (busy: boolean) => void}) {
  const update = useMutation(api.accounts.updateAdult)
  const [choice, setChoice] = useState<AccessChoice>(adult.role === 'coach' ? 'coach' : adult.travelLead ? 'lead' : 'mentor')
  const [finance, setFinance] = useState(adult.financialEdit)
  const [health, setHealth] = useState(adult.healthExport)
  const [active, setActive] = useState(adult.active)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return
    setBusy(true); busyChanged(true); setError(null)
    try { await update({ userId: adult.userId, expectedRevision: adult.revision, role: choice === 'coach' ? 'coach' : 'mentor', travelLead: choice === 'lead', financialEdit: choice === 'lead' && finance, healthExport: choice === 'lead' && health, active, reason: reason.trim() }); done() } catch (error) { setError(error) } finally { setBusy(false); busyChanged(false) }
  }
  return <form className={styles.form} onSubmit={event => void submit(event)}><p><strong>{adult.name}</strong><br/>{adult.email}</p><AccessFields {...{choice, setChoice, finance, setFinance, health, setHealth, busy}}/><label className={styles.check}><Checkbox checked={active} disabled={busy} onCheckedChange={setActive}/><span>{copy.active}</span></label><label>{copy.reason}<Input value={reason} disabled={busy} required maxLength={1000} onChange={event => setReason(event.target.value)}/></label>{error !== null && <><p role="alert" className="open-text">{message(error)}</p><ContactAdminFor error={error}/></>}<div className={styles.actions}><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{copy.cancel}</Button><Button type="submit" disabled={busy || !reason.trim()}>{busy ? copy.saving : copy.save}</Button></div></form>
}

function AdultList() {
  const [role, setRole] = useState<'coach' | 'mentor'>('mentor')
  const { results, status, loadMore } = usePaginatedQuery(api.accounts.workspace, {role}, {initialNumItems: 20})
  const [editing, setEditing] = useState<Adult | null>(null)
  const [saved, setSaved] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  return <Card className={styles.surface}><CardHeader><CardTitle>{copy.list}</CardTitle></CardHeader><CardContent><label className={styles.rolePicker}>{copy.chooseRole}<NativeSelect value={role} onChange={event => {setRole(event.target.value as 'coach' | 'mentor'); setSaved('')}}><NativeSelectOption value="mentor">{copy.mentor}</NativeSelectOption><NativeSelectOption value="coach">{copy.coach}</NativeSelectOption></NativeSelect></label>{status === 'LoadingFirstPage' ? <p role="status">{copy.loading}</p> : results.length === 0 ? <p className="muted">{copy.noAccounts}</p> : <div className={styles.table}><table><thead><tr><th>{copy.name}</th><th>{copy.role}</th><th>{copy.access}</th><th><span className="sr-only">{copy.edit}</span></th></tr></thead><tbody>{results.map(adult => <tr key={adult.userId}><td data-label={copy.name}><strong>{adult.name}</strong><span className="muted">{adult.email}</span></td><td data-label={copy.role}>{roleLabel(adult)}</td><td data-label={copy.access}><span>{adult.active ? copy.activeStatus : copy.inactive}</span>{adult.role === 'coach' ? <span className="muted tiny">{copy.coachAccess}</span> : <>{adult.financialEdit && <span className="muted tiny">{copy.finance}</span>}{adult.healthExport && <span className="muted tiny">{copy.health}</span>}</>}</td><td><Button variant="outline" onClick={() => {setEditing({...adult}); setSaved('')}}>{copy.edit}</Button></td></tr>)}</tbody></table></div>}{status !== 'Exhausted' && status !== 'LoadingFirstPage' && <Button variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(20)}>{status === 'LoadingMore' ? copy.loadingMore : copy.loadMore}</Button>}{saved && <p role="status" className="ready-text">{saved}</p>}<Dialog open={editing !== null} onOpenChange={open => {if (!open && !editBusy) setEditing(null)}}><DialogContent showCloseButton={!editBusy} className={styles.dialog}><DialogHeader><DialogTitle>{copy.edit}</DialogTitle><DialogDescription>{copy.editDescription}</DialogDescription></DialogHeader>{editing && <EditAdult key={`${editing.userId}:${editing.revision}`} adult={editing} busyChanged={setEditBusy} cancel={() => setEditing(null)} done={() => {setEditing(null); setSaved(copy.saved)}}/>}</DialogContent></Dialog></CardContent></Card>
}

function InviteAdult() {
  const create = useMutation(api.accounts.inviteAdult)
  const [email, setEmail] = useState('')
  const [choice, setChoice] = useState<AccessChoice>('mentor')
  const [finance, setFinance] = useState(false)
  const [health, setHealth] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [queued, setQueued] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return
    setBusy(true); setError(null); setQueued('')
    const recipient = email.trim()
    try {
      await create({email: recipient, role: choice === 'coach' ? 'coach' : 'mentor', travelLead: choice === 'lead', financialEdit: choice === 'lead' && finance, healthExport: choice === 'lead' && health})
      setQueued(recipient); setEmail('')
    } catch (error) {setError(error)} finally {setBusy(false)}
  }
  return <Card className={styles.surface}><CardHeader><CardTitle>{copy.invite}</CardTitle><CardDescription>{copy.sevenDays}</CardDescription></CardHeader><CardContent><form className={styles.form} onSubmit={event => void submit(event)}><label>{copy.email}<Input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></label><AccessFields {...{choice, setChoice, finance, setFinance, health, setHealth, busy}}/><Button type="submit" disabled={busy}>{busy ? copy.sending : copy.sendInvitation}</Button></form><p className="muted tiny">{copy.emailInstructions}</p>{queued && <p role="status">{copy.queuedFor(queued)}</p>}{error !== null && <><p role="alert" className="open-text">{message(error)}</p><ContactAdminFor error={error}/></>}</CardContent></Card>
}

function InvitationList() {
  const {results, status, loadMore} = usePaginatedQuery(api.accounts.invitations, {}, {initialNumItems: 20})
  const revoke = useMutation(api.accounts.revokeInvitation)
  const resend = useMutation(api.accounts.resendInvitation)
  const [busy, setBusy] = useState<Id<'adultInvitations'> | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer)}, [])
  const act = async (invitationId: Id<'adultInvitations'>, action: 'revoke' | 'resend') => {
    if (busy) return
    setBusy(invitationId); setError(null); setSaved('')
    try {if (action === 'revoke') {await revoke({invitationId}); setSaved(copy.revoked)} else {await resend({invitationId}); setSaved(copy.resendQueued)}} catch (error) {setError(error)} finally {setBusy(null)}
  }
  const labels = {pending: copy.pendingStatus, accepted: copy.acceptedStatus, revoked: copy.revokedStatus, replaced: copy.replacedStatus}
  const emailLabels = {not_sent: copy.emailNotSent, queued: copy.emailQueued, sent: copy.emailSent, failed: copy.emailFailed}
  return <Card className={styles.surface}><CardHeader><CardTitle>{copy.pending}</CardTitle></CardHeader><CardContent>{status === 'LoadingFirstPage' ? <p role="status">{copy.loadingInvitations}</p> : results.length === 0 ? <p className="muted">{copy.noInvitations}</p> : <div className={styles.invites}>{results.map(row => {
    const active = row.status === 'pending' && row.expiresAt > now
    return <div key={row.invitationId}><div><strong>{row.email}</strong><p>{roleLabel(row)}{row.financialEdit && ` · ${copy.finance}`}{row.healthExport && ` · ${copy.health}`}</p><p className="muted tiny">{row.status === 'pending' && !active ? copy.expiredStatus : labels[row.status]}{active && <> · {copy.expires} {when(row.expiresAt)}</>}</p>{active && <><p role="status">{emailLabels[row.emailStatus]}</p>{row.emailError && <p className="open-text">{userFacingError(new Error(row.emailError), copy.failed)}</p>}{row.resendAvailableAt > now && <p className="muted tiny">{copy.resendAfter} {when(row.resendAvailableAt)}</p>}</>}</div>{row.status === 'pending' && <div className={styles.actions}>{active && <Button variant="outline" disabled={busy !== null || row.emailStatus === 'queued' || row.resendAvailableAt > now} onClick={() => void act(row.invitationId, 'resend')}>{copy.resend}</Button>}<Button variant="outline" disabled={busy !== null} onClick={() => void act(row.invitationId, 'revoke')}>{copy.revoke}</Button></div>}</div>
  })}</div>}{status !== 'Exhausted' && status !== 'LoadingFirstPage' && <Button variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(20)}>{status === 'LoadingMore' ? copy.loadingMore : copy.loadMore}</Button>}{error !== null && <><p role="alert" className="open-text">{message(error)}</p><ContactAdminFor error={error}/></>}{saved && <p role="status" className="ready-text">{saved}</p>}</CardContent></Card>
}

export default function Adults() {return <div className={styles.page}><div className="page-head"><div><h1>{copy.title}</h1><p className="muted lead">{copy.description}</p></div></div><AccountsBoundary><AdultList/><ParentStaffAccess/><div className={styles.columns}><InviteAdult/><InvitationList/></div></AccountsBoundary></div>}

function readToken() {
  return readAdultInvitationToken(window.location.hash, window.sessionStorage)
}
export function AdultInvitationLanding({viewer}: {viewer: {status: 'signedOut' | 'pending' | 'active'; user: {email: string; role: string} | null} | undefined}) {
  const [token] = useState(readToken)
  const [emailMethod, setEmailMethod] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const previewInvite = useMutation(api.accounts.preview)
  const accept = useMutation(api.accounts.accept)
  const {signIn, signOut} = useAuthActions()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewInvite>> | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    window.history.replaceState(window.history.state, '', adultInvitationLandingUrl(window.location.pathname, window.location.search, token))
    clearAdultInvitationOAuth(window.sessionStorage)
  }, [token])
  useEffect(() => {
    if (!token || accepted) return
    let current = true
    void previewInvite({token}).then(result => {if (current) setPreview(result)}).catch(error => {if (current) setError(message(error))})
    return () => {current = false}
  }, [token, viewer?.status, previewInvite, accepted])
  const login = async () => {if (!token || busy) return; setBusy(true); setError(''); try {const redirectTo = prepareAdultInvitationOAuth(window.location.origin, token, window.sessionStorage); await signIn('google', {redirectTo})} catch (error) {clearAdultInvitationOAuth(window.sessionStorage); setError(message(error)); setBusy(false)}}
  const switchAccount = async () => {setBusy(true); setError(''); try {clearAdultInvitationOAuth(window.sessionStorage); await signOut(); setPreview(null)} catch (error) {setError(message(error))} finally {setBusy(false)}}
  const submit = async () => {if (!token || busy) return; setBusy(true); setError(''); try {await accept({token}); clearAdultInvitationOAuth(window.sessionStorage); window.history.replaceState(window.history.state, '', window.location.pathname); setAccepted(true)} catch (error) {clearAdultInvitationOAuth(window.sessionStorage); setError(message(error))} finally {setBusy(false)}}
  return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt="Denham Venom"/></div><main className="signin-content"><h1>{copy.landing}</h1><Card className={styles.surface}><CardContent>{accepted ? <><h2 tabIndex={-1} ref={element => element?.focus()}>{copy.accepted}</h2><p>{copy.acceptedDescription}</p><Button onClick={() => navigate('/', {replace: true})}>{copy.continue}</Button></> : !token ? <><h2>{copy.unavailable}</h2><p>{copy.unavailableDetail}</p></> : !viewer || !preview ? <><p role="status">{copy.checking}</p>{error && <Button variant="outline" disabled={busy} onClick={() => {if (token) {setError(''); void previewInvite({token}).then(setPreview).catch(error => setError(message(error)))}}}>{copy.retry}</Button>}</> : preview.status === 'valid' ? <><h2>{copy.inviteRole}</h2><p>{copy.confirmation}</p><p><strong>{preview.email}</strong></p><p>{roleLabel({role: preview.role!, travelLead: preview.travelLead})}</p>{preview.financialEdit && <p>{copy.finance}</p>}{preview.healthExport && <p>{copy.health}</p>}<p className="muted">{copy.expires} {when(preview.expiresAt!)}</p><Button disabled={busy} onClick={() => void submit()}>{busy ? copy.accepting : copy.accept}</Button></> : viewer.status === 'signedOut' && preview.status === 'verifiedAccountRequired' ? <><h2>Sign in to accept your invitation</h2>{emailMethod?<><ParentEmailSignIn audience="adult" adultInviteToken={token} onBusyChange={setEmailBusy}/><Button variant="link" disabled={emailBusy} onClick={()=>setEmailMethod(false)}>Back</Button></>:<><p>{copy.signInDescription}</p><Button disabled={busy} onClick={() => void login()}>Continue with Google</Button><Button variant="outline" disabled={busy} onClick={()=>setEmailMethod(true)}>Sign in by email</Button></>}</> : <><h2>{copy.unavailable}</h2><p>{preview.status === 'verifiedAccountRequired' ? copy.accountMismatch : preview.status === 'accountConflict' ? copy.accountConflict : copy.unavailableDetail}</p>{preview.status === 'verifiedAccountRequired' && <Button variant="outline" disabled={busy} onClick={() => void switchAccount()}>{copy.switchAccount}</Button>}</>}{error && <p role="alert" className="open-text">{error}</p>}{!accepted && <Link to="/" onClick={() => clearAdultInvitationOAuth(window.sessionStorage)}>{copy.returnHome}</Link>}</CardContent></Card></main></div>
}
