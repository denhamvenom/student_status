import { ConfirmAction } from './ConfirmAction'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import { Link, useNavigate } from 'react-router'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import styles from './FamilyOperations.module.css'
import { familyCopy } from './lib/family-copy'
import { invitationEmailStatus, shareParentInvitation } from './lib/parent-invite-share'

type Viewer = {status:'signedOut'|'pending'|'active'; user:{email:string;role:string}|null}
type RosterStudent = {_id:string;name:string}
const studentId = (value:string) => value as Id<'students'>
const when = (value:number) => new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})
const message = (error:unknown) => error instanceof Error ? error.message : String(error)
const inviteLink = (token:string) => `${window.location.origin}/invite-parent#token=${encodeURIComponent(token)}`
const oauthTokenKey = 'student-status-parent-invite-oauth'
const focusAcceptedHeading = (element:HTMLHeadingElement|null) => element?.focus()
const deliveryText = (status:string|null|undefined) => familyCopy.parent[invitationEmailStatus(status)]
const resendWait = (milliseconds:number) => {
  const seconds = Math.ceil(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`
}

/** A token is intentionally held only in the current page and in the URL fragment. */
function readFragmentToken() {
  const fragment = window.location.hash.replace(/^#/, '')
  const token = new URLSearchParams(fragment).get('token') ?? window.sessionStorage.getItem(oauthTokenKey)
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null
}

function InviteRecords({student}:{student:RosterStudent}) {
  const invites = useQuery(api.parentInvites.listStudentInvites,{studentId:studentId(student._id)})
  const links = useQuery(api.parentInvites.listFamilyLinks,{studentId:studentId(student._id)})
  const revokeInvite = useMutation(api.parentInvites.revokeParentInvite)
  const revokeLink = useMutation(api.parentInvites.revokeFamilyLink)
  const restoreLink = useMutation(api.parentInvites.restoreFamilyLink)
  const allowReinvite = useMutation(api.parentInvites.allowParentReinvite)
  const [busy,setBusy] = useState<string|null>(null)
  const [error,setError] = useState('')
  const [reason,setReason] = useState('')
  const [reinviteReason,setReinviteReason] = useState('')
  const run = async (key:string,action:()=>Promise<unknown>) => {setBusy(key);setError('');try{await action()}catch(e){setError(message(e))}finally{setBusy(null)}}
  return <div className="parent-records">
    <h3>{familyCopy.parent.invitations}</h3>
    {!invites ? <p>{familyCopy.parent.loadingInvitations}</p> : invites.length === 0 ? <p className="muted">{familyCopy.parent.noneInvitations}</p> : <div className="simple-list">{invites.map(invite => <div className="parent-record" key={invite._id}>
      <div><strong>{invite.parentEmail}</strong><p className="muted tiny">{invite.status === 'pending' && invite.expiresAt <= Date.now() ? familyCopy.parent.expired : invite.status} · {familyCopy.parent.expires} {when(invite.expiresAt)}</p><p className="muted tiny">{deliveryText(invite.emailStatus)}</p></div>
      {invite.status === 'pending' && invite.expiresAt > Date.now() && <Button className="button button-outline" disabled={busy !== null} onClick={() => void run(invite._id,()=>revokeInvite({inviteId:invite._id}))}>{familyCopy.parent.revokeInvitation}</Button>}
      {invite.status === 'revoked' && <form className="parent-restore" onSubmit={e=>{e.preventDefault();void run(invite._id,()=>allowReinvite({inviteId:invite._id,reason:reinviteReason.trim()})).then(()=>setReinviteReason(''))}}><label>{familyCopy.parent.reinviteReason} <Input value={reinviteReason} onChange={e=>setReinviteReason(e.target.value)} required/></label><Button className="button button-outline" type="submit" disabled={busy !== null || !reinviteReason.trim()}>{familyCopy.parent.allowReplacement}</Button></form>}
    </div>)}</div>}
    <h3>{familyCopy.parent.access}</h3>
    {!links ? <p>{familyCopy.parent.loadingParents}</p> : links.length === 0 ? <p className="muted">{familyCopy.parent.noLinked}</p> : <div className="simple-list">{links.map(link => <div className="parent-record" key={link._id}>
      <div><strong>{link.parentName}</strong><p className="muted tiny">{link.parentEmail} · {link.active ? familyCopy.parent.accessActive : familyCopy.parent.accessRevoked}</p></div>
      {link.active ? <ConfirmAction disabled={busy !== null} description={`Revoke access for ${link.parentName} to ${student.name}? They will no longer be able to view this student through this link.`} onConfirm={async () => { await revokeLink({linkId:link._id}) }}>{familyCopy.parent.revokeAccess}</ConfirmAction> : <form className="parent-restore" onSubmit={e=>{e.preventDefault();void run(link._id,()=>restoreLink({linkId:link._id,reason:reason.trim()})).then(()=>setReason(''))}}><label>{familyCopy.parent.restoreReason} <Input value={reason} onChange={e=>setReason(e.target.value)} required minLength={8}/></label><Button className="button button-outline" type="submit" disabled={busy !== null || reason.trim().length < 8}>{familyCopy.parent.restoreAccess}</Button></form>}
    </div>)}</div>}
    {error && <p role="alert" className="open-text">{error}</p>}
  </div>
}

export function CoachParentAccess({roster}:{roster:RosterStudent[]}) {
  const settings = useQuery(api.parentInvites.invitationSettings,{})
  const setEnabled = useMutation(api.parentInvites.setInvitationEnabled)
  const [selected,setSelected] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const chosen = roster.find(student=>student._id === selected) ?? roster[0]
  const toggle = async (enabled:boolean) => {setBusy(true);setError('');try{await setEnabled({enabled})}catch(e){setError(message(e))}finally{setBusy(false)}}
  return <section className={`card parent-section ${styles.surface}`} aria-labelledby="parent-settings-title">
    <h2 id="parent-settings-title">{familyCopy.parent.invitationSettings}</h2>
    <p>{familyCopy.parent.settingsDescription}</p>
    {settings ? <label className="checkbox-label"><Checkbox checked={settings.enabled} disabled={busy} onCheckedChange={checked=>void toggle(checked)}/> {familyCopy.parent.allowNew}</label> : <p>{familyCopy.parent.loadingSetting}</p>}
    {settings && <p role="status" className="muted">{familyCopy.parent.newInvitationsAre} {settings.enabled ? familyCopy.parent.enabled : familyCopy.parent.paused}.</p>}
    {error && <p role="alert" className="open-text">{error}</p>}
    <div className="parent-access-controls"><label htmlFor="parent-access-student">{familyCopy.parent.reviewStudent}</label><NativeSelect id="parent-access-student" value={chosen?._id ?? ''} onChange={e=>setSelected(e.target.value)} disabled={roster.length===0}>{roster.map(student=><NativeSelectOption value={student._id} key={student._id}>{student.name}</NativeSelectOption>)}</NativeSelect></div>
    {chosen ? <InviteRecords key={chosen._id} student={chosen}/> : <p className="muted">{familyCopy.parent.noStudents}</p>}
  </section>
}

export function StudentParents({student}:{student:RosterStudent|null}) {
  const settings = useQuery(api.parentInvites.invitationSettings,{})
  const create = useMutation(api.parentInvites.createParentInvite)
  const resend = useMutation(api.parentInvites.resendParentInvite)
  const invites = useQuery(api.parentInvites.listStudentInvites,student?{studentId:studentId(student._id)}:'skip')
  const links = useQuery(api.parentInvites.listFamilyLinks,student?{studentId:studentId(student._id)}:'skip')
  const [email,setEmail] = useState('')
  const [link,setLink] = useState('')
  const [expiry,setExpiry] = useState<number|null>(null)
  const [createdInviteId,setCreatedInviteId] = useState<string|null>(null)
  const [busy,setBusy] = useState(false)
  const [resendingInviteId,setResendingInviteId] = useState<string|null>(null)
  const resendInFlight = useRef(false)
  const [now,setNow] = useState(Date.now)
  const [error,setError] = useState('')
  const [copied,setCopied] = useState(false)
  const [shareNotice,setShareNotice] = useState('')
  useEffect(()=>{setLink('');setExpiry(null);setCreatedInviteId(null);setCopied(false);setShareNotice('');setError('')},[student?._id])
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[])
  const submit = async (event:FormEvent) => {event.preventDefault();if(!student || busy || resendInFlight.current)return;setBusy(true);setError('');setLink('');setCreatedInviteId(null);setCopied(false);setShareNotice('');try{const result=await create({studentId:studentId(student._id),parentEmail:email.trim().toLowerCase()});setLink(inviteLink(result.token));setExpiry(result.expiresAt);setCreatedInviteId(result.inviteId);setEmail('')}catch(e){setError(message(e))}finally{setBusy(false)}}
  const resendInvitation = async (inviteId:Id<'parentInvitations'>) => {
    if (busy || resendInFlight.current) return
    resendInFlight.current = true
    setResendingInviteId(inviteId)
    setError('')
    setShareNotice('')
    try {
      const result = await resend({inviteId})
      setLink(inviteLink(result.token))
      setExpiry(result.expiresAt)
      setCreatedInviteId(result.inviteId)
      setCopied(false)
    } catch (error) {
      setError(message(error))
    } finally {
      resendInFlight.current = false
      setResendingInviteId(null)
    }
  }
  const copy = async () => {setError('');try{await navigator.clipboard.writeText(link);setCopied(true)}catch{setError(familyCopy.parent.copyFailed)}}
  const share = async () => {setError('');setShareNotice('');const result=await shareParentInvitation(navigator,link,{title:familyCopy.parent.landing,text:familyCopy.parent.signInInvitedEmail});if(result==='copied'){setCopied(true);setShareNotice(familyCopy.parent.shareCopied)}else if(result==='shareFailed'){setError(familyCopy.parent.shareFailed)}else if(result==='copyFailed'){setError(familyCopy.parent.copyFailed)}}
  const createdInvite = createdInviteId ? invites?.find(invite=>invite._id===createdInviteId) : undefined
  const emailStatus = createdInviteId && !createdInvite ? null : createdInvite?.emailStatus
  return <><div className="page-head"><div><p className="eyebrow">{familyCopy.parent.access}</p><h1>{familyCopy.parent.heading}</h1><p className="muted lead">{familyCopy.parent.studentDescription}</p></div></div>
    {!student ? <section className="card"><p>{familyCopy.parent.noProfile}</p></section> : <>
      <section className={`card parent-section ${styles.surface}`}><h2>{familyCopy.parent.inviteHeading}</h2><p>{familyCopy.parent.inviteDescription}</p>
        {settings?.enabled === false && <p role="status">{familyCopy.parent.pausedNotice}</p>}
        <form className="parent-invite-form" onSubmit={e=>void submit(e)}><label htmlFor="parent-email">{familyCopy.parent.googleEmail}</label><Input id="parent-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy || resendingInviteId!==null || settings?.enabled !== true}/><Button className="button button-primary" type="submit" disabled={busy || resendingInviteId!==null || settings?.enabled !== true}>{busy?familyCopy.parent.creating:familyCopy.parent.createLink}</Button></form>
        <p className="muted tiny">{familyCopy.parent.noEmail}</p>
        {link && <section className={`parent-share ${styles.inviteShare}`} aria-labelledby="parent-share-title"><h3 id="parent-share-title">{familyCopy.parent.invitationLink}</h3><p>{familyCopy.parent.invitationCreated} {expiry ? when(expiry) : familyCopy.parent.expiryFallback}.</p><p role="status">{deliveryText(emailStatus)} {emailStatus==='sent' && familyCopy.parent.emailSentNext} {(emailStatus==='not_sent'||emailStatus==='failed') && createdInvite?.emailError}</p><p className="muted tiny">{familyCopy.parent.shareGuidance}</p><label className="sr-only" htmlFor="parent-share-link">{familyCopy.parent.invitationLink}</label><div className={styles.shareControls}><Input id="parent-share-link" value={link} readOnly onFocus={e=>e.currentTarget.select()}/><Button className="button button-outline" disabled={busy || resendingInviteId!==null} onClick={()=>void share()}>{familyCopy.parent.shareLink}</Button><Button className="button button-primary" disabled={busy || resendingInviteId!==null} onClick={()=>void copy()}>{copied?familyCopy.parent.copied:familyCopy.parent.copyLink}</Button></div>{shareNotice && <p role="status">{shareNotice}</p>}<p className="muted tiny">{familyCopy.parent.once} {familyCopy.parent.signInInvitedEmail}</p></section>}
        {error && <p role="alert" className="open-text">{error}</p>}
      </section>
      <section className={`card parent-section ${styles.surface}`}><h2>{familyCopy.parent.accessHeading}</h2>
        {!invites || !links ? <p>{familyCopy.parent.loading}</p> : <><h3>{familyCopy.parent.invitations}</h3>{invites.length===0 ? <p className="muted">{familyCopy.parent.noneInvitations}</p> : <div className="simple-list">{invites.map(invite=>{
          const canResend = invite.status==='pending' && invite.expiresAt>now && invites.find(row=>row.parentEmail===invite.parentEmail)?._id===invite._id
          const wait = Math.max(0,invite.resendAvailableAt-now)
          return <div className="parent-record" key={invite._id}><div><strong>{invite.parentEmail}</strong><p className="muted tiny">{deliveryText(invite.emailStatus)}</p></div><span>{invite.status==='pending' && invite.expiresAt<=now?familyCopy.parent.expired:invite.status} · {when(invite.expiresAt)}</span>{canResend && <Button className="button button-outline" disabled={busy || resendingInviteId!==null || settings?.enabled!==true || wait>0} onClick={()=>void resendInvitation(invite._id)}>{resendingInviteId===invite._id?familyCopy.parent.resending:wait>0?`${familyCopy.parent.resendIn} ${resendWait(wait)}`:familyCopy.parent.resendInvitation}</Button>}</div>
        })}</div>}
          <h3>{familyCopy.parent.linkedParents}</h3>{links.filter(link=>link.active).length===0 ? <p className="muted">{familyCopy.parent.noLinked}</p> : <div className="simple-list">{links.filter(link=>link.active).map(link=><div className="parent-record" key={link._id}><strong>{link.parentName}</strong><span>{link.parentEmail}</span></div>)}</div>}</>}
      </section>
    </>}
  </>
}

export function ParentInvitationLanding({viewer}:{viewer:Viewer|undefined}) {
  const navigate = useNavigate()
  const {signIn,signOut} = useAuthActions()
  const [token] = useState(readFragmentToken)
  const previewInvite = useMutation(api.parentInvites.previewParentInvite)
  const [preview,setPreview] = useState<Awaited<ReturnType<typeof previewInvite>>|null>(null)
  const [accepted,setAccepted] = useState<{studentName:string;parentEmail:string}|null>(null)
  const accept = useMutation(api.parentInvites.acceptParentInvite)
  const [relationship,setRelationship] = useState('')
  const [attestedVersion,setAttestedVersion] = useState<string|null>(null)
  const [attestedText,setAttestedText] = useState<string|null>(null)
  const attested = !!preview?.attestationVersion && !!preview.attestationText && attestedVersion === preview.attestationVersion && attestedText === preview.attestationText
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  useEffect(()=>{if(token){if(!window.location.hash)window.history.replaceState(window.history.state,'',`${window.location.pathname}${window.location.search}#token=${encodeURIComponent(token)}`);window.sessionStorage.removeItem(oauthTokenKey)}},[token])
  useEffect(()=>{if(!token||accepted)return;let current=true;const refresh=()=>{void previewInvite({token}).then(result=>{if(current)setPreview(result)}).catch(e=>{if(current)setError(message(e))})};setPreview(null);refresh();const interval=window.setInterval(refresh,30_000);return()=>{current=false;window.clearInterval(interval)}},[token,viewer?.status,previewInvite,accepted])
  const login = async () => {if(!token)return;setBusy(true);setError('');window.sessionStorage.setItem(oauthTokenKey,token);try{await signIn('google',{redirectTo:`${window.location.origin}/invite-parent`})}catch(e){window.sessionStorage.removeItem(oauthTokenKey);setError(message(e));setBusy(false)}}
  const switchAccount = async () => {setBusy(true);setError('');window.sessionStorage.removeItem(oauthTokenKey);try{await signOut();setPreview(null)}catch(e){setError(message(e))}finally{setBusy(false)}}
  const submit = async (event:FormEvent) => {event.preventDefault();if(!token||!preview?.attestationVersion||!attested)return;setBusy(true);setError('');try{await accept({token,relationship:relationship.trim(),authorityAttested:true,attestationVersion:preview.attestationVersion});window.sessionStorage.removeItem(oauthTokenKey);window.history.replaceState(window.history.state,'',window.location.pathname);setAccepted({studentName:preview.studentName ?? '',parentEmail:preview.parentEmail ?? ''})}catch(e){setError(message(e))}finally{setBusy(false)}}
  return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt="Denham Venom"/></div><main className="signin-content"><p className="eyebrow">TEAM 8044</p><h1>{familyCopy.parent.landing}</h1><div className={`signin-card ${styles.surface}`}>
    {accepted ? <div className={styles.accepted}><h2 tabIndex={-1} ref={focusAcceptedHeading}>{familyCopy.parent.linkedHeading} {accepted.studentName}</h2><p>{familyCopy.parent.signedInAs} <strong>{accepted.parentEmail}</strong>.</p><p>{familyCopy.parent.linkedDescription}</p><p className="muted tiny">{familyCopy.parent.accessNotConsent}</p><Button className="button button-primary" onClick={()=>navigate('/',{replace:true})}>{familyCopy.parent.goToStatus}</Button></div> : !token ? <><h2>{familyCopy.parent.linkUnavailable}</h2><p>{familyCopy.parent.askNewLink}</p></> : !viewer || !preview ? <p>{familyCopy.parent.checking}</p> : preview.status==='signInRequired' || viewer.status==='signedOut' ? <><h2>{familyCopy.parent.signIn}</h2><p>{familyCopy.parent.signInDescription}</p><Button className="button button-primary" disabled={busy} onClick={()=>void login()}>{busy?familyCopy.parent.openingGoogle:familyCopy.parent.continueGoogle}</Button></> : preview.status==='valid' ? <><h2>{familyCopy.parent.acceptHeading}</h2><p>{familyCopy.parent.invitedAccount} <strong>{preview.parentEmail}</strong></p><p>{familyCopy.parent.student} <strong>{preview.studentName}</strong></p><p>{familyCopy.parent.expiresLabel} {preview.expiresAt ? when(preview.expiresAt) : familyCopy.parent.soon}</p><form onSubmit={e=>void submit(e)} className="parent-accept-form"><label htmlFor="parent-relationship">{familyCopy.parent.relationship}</label><NativeSelect id="parent-relationship" value={relationship} onChange={e=>setRelationship(e.target.value)} required><NativeSelectOption value="">{familyCopy.parent.chooseRelationship}</NativeSelectOption><NativeSelectOption value="Parent">{familyCopy.parent.parent}</NativeSelectOption><NativeSelectOption value="Legal guardian">{familyCopy.parent.guardian}</NativeSelectOption></NativeSelect><label className="checkbox-label"><Checkbox checked={attested} onCheckedChange={checked=>{setAttestedVersion(checked?preview.attestationVersion:null);setAttestedText(checked?preview.attestationText:null)}}/> {preview.attestationText}</label><p className="muted tiny">{familyCopy.parent.accessNotConsent}</p><Button className="button button-primary" type="submit" disabled={busy || !attested || !relationship}>{busy?familyCopy.parent.accepting:familyCopy.parent.accept}</Button></form></> : <><h2>{familyCopy.parent.cannotAccept}</h2><p>{preview.status==='emailMismatch'?familyCopy.parent.emailMismatch:preview.status==='accountConflict'?familyCopy.parent.accountConflict:preview.status==='coachReviewRequired'?familyCopy.parent.coachReview:familyCopy.parent.linkUnavailableDetail}</p>{preview.status==='emailMismatch'&&<Button className="button button-outline" disabled={busy} onClick={()=>void switchAccount()}>{familyCopy.parent.switchAccount}</Button>}</>}
    {error && <p role="alert" className="open-text">{error}</p>}
    {!accepted && <Link to="/" onClick={()=>window.sessionStorage.removeItem(oauthTokenKey)}>{familyCopy.parent.returnHome}</Link>}
  </div></main></div>
}

/** Design review only: synthetic display data, no token, query, or mutation. */
export function ParentInvitationReview({mode}:{mode:'student'|'coach'|'landing'}) {
  if(mode==='landing') return <><div className="page-head"><div><p className="eyebrow">Synthetic review</p><h1>Parent invitation</h1></div></div><section className="card parent-section"><h2>Accept invitation</h2><p>Invited account: <strong>parent.demo@example.test</strong></p><p>Student: <strong>Sample Student</strong></p><p>Expires: October 19, 2026</p><div className="parent-accept-form"><label htmlFor="review-relationship">Your relationship to the student</label><NativeSelect id="review-relationship" defaultValue=""><NativeSelectOption value="">Choose relationship</NativeSelectOption><NativeSelectOption value="Parent">Parent</NativeSelectOption><NativeSelectOption value="Legal guardian">Legal guardian</NativeSelectOption></NativeSelect><label className="checkbox-label"><Checkbox/> I confirm that I am this student's parent or legal guardian and have authority to act for this student.</label><p className="muted tiny">Accepting access does not sign a travel permission form or authorize medication.</p><Button className="button button-primary" disabled>Accept invitation</Button></div></section></>
  if(mode==='student') return <><div className="page-head"><div><p className="eyebrow">Synthetic review</p><h1>Parents</h1><p className="muted lead">Invite a parent or legal guardian to view your team information.</p></div></div><section className="card parent-section"><h2>Invite a parent</h2><p>Enter the Google account email your parent will use. The invitation expires in 7 days and can be used once.</p><div className="parent-invite-form"><label htmlFor="review-parent-email">Parent Google email</label><Input id="review-parent-email" type="email" placeholder="parent@example.test"/><Button className="button button-primary" disabled>Send invitation</Button></div><p className="muted tiny">We will try to email the invitation. You can also share or copy the private link after creating it.</p></section><section className="card parent-section"><h2>Invitations and access</h2><div className="parent-record"><strong>parent.demo@example.test</strong><span>Pending · October 19, 2026</span></div><div className="parent-record"><strong>Sample Parent</strong><span>parent.linked@example.test · Access active</span></div></section></>
  return <><div className="page-head"><div><p className="eyebrow">Synthetic review</p><h1>Parent invitations</h1></div></div><section className="card parent-section"><h2>Parent invitations</h2><p>Control whether students can create new parent invitations across the team. Invitations already issued remain valid until their own expiry, and linked parents keep access.</p><label className="checkbox-label"><Checkbox defaultChecked/> Allow new parent invitations</label><div className="parent-access-controls"><label htmlFor="review-parent-student">Review parent access for student</label><NativeSelect id="review-parent-student"><NativeSelectOption>Sample Student</NativeSelectOption></NativeSelect></div><h3>Invitations</h3><div className="parent-record"><div><strong>parent.demo@example.test</strong><p className="muted tiny">Pending · expires October 19, 2026</p></div><Button className="button button-outline" disabled>Revoke invitation</Button></div><h3>Parent access</h3><div className="parent-record"><div><strong>Sample Parent</strong><p className="muted tiny">parent.linked@example.test · Access active</p></div><Button className="button button-outline" disabled>Revoke access</Button></div></section></>
}
