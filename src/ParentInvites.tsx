import { useEffect, useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import { Link, useNavigate } from 'react-router'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'

type Viewer = {status:'signedOut'|'pending'|'active'; user:{email:string;role:string}|null}
type RosterStudent = {_id:string;name:string}
const studentId = (value:string) => value as Id<'students'>
const when = (value:number) => new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})
const message = (error:unknown) => error instanceof Error ? error.message : String(error)
const inviteLink = (token:string) => `${window.location.origin}/invite-parent#token=${encodeURIComponent(token)}`
const oauthTokenKey = 'student-status-parent-invite-oauth'

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
    <h3>Invitations</h3>
    {!invites ? <p>Loading invitations…</p> : invites.length === 0 ? <p className="muted">No invitations yet.</p> : <div className="simple-list">{invites.map(invite => <div className="parent-record" key={invite._id}>
      <div><strong>{invite.parentEmail}</strong><p className="muted tiny">{invite.status === 'pending' && invite.expiresAt <= Date.now() ? 'Expired' : invite.status} · expires {when(invite.expiresAt)}</p></div>
      {invite.status === 'pending' && invite.expiresAt > Date.now() && <Button className="button button-outline" disabled={busy !== null} onClick={() => void run(invite._id,()=>revokeInvite({inviteId:invite._id}))}>Revoke invitation</Button>}
      {invite.status === 'revoked' && <form className="parent-restore" onSubmit={e=>{e.preventDefault();void run(invite._id,()=>allowReinvite({inviteId:invite._id,reason:reinviteReason.trim()})).then(()=>setReinviteReason(''))}}><label>Reason to allow a new invitation <Input value={reinviteReason} onChange={e=>setReinviteReason(e.target.value)} required/></label><Button className="button button-outline" type="submit" disabled={busy !== null || !reinviteReason.trim()}>Allow replacement</Button></form>}
    </div>)}</div>}
    <h3>Parent access</h3>
    {!links ? <p>Loading linked parents…</p> : links.length === 0 ? <p className="muted">No parent accounts linked.</p> : <div className="simple-list">{links.map(link => <div className="parent-record" key={link._id}>
      <div><strong>{link.parentName}</strong><p className="muted tiny">{link.parentEmail} · {link.active ? 'Access active' : 'Access revoked'}</p></div>
      {link.active ? <Button className="button button-outline" disabled={busy !== null} onClick={() => void run(link._id,()=>revokeLink({linkId:link._id}))}>Revoke access</Button> : <form className="parent-restore" onSubmit={e=>{e.preventDefault();void run(link._id,()=>restoreLink({linkId:link._id,reason:reason.trim()})).then(()=>setReason(''))}}><label>Reason for restoring access <Input value={reason} onChange={e=>setReason(e.target.value)} required minLength={8}/></label><Button className="button button-outline" type="submit" disabled={busy !== null || reason.trim().length < 8}>Restore access</Button></form>}
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
  return <section className="card parent-section" aria-labelledby="parent-settings-title">
    <h2 id="parent-settings-title">Parent invitations</h2>
    <p>Control whether students can create new parent invitations across the team. Invitations already issued remain valid until their own expiry, and linked parents keep access.</p>
    {settings ? <label className="checkbox-label"><Checkbox checked={settings.enabled} disabled={busy} onCheckedChange={checked=>void toggle(checked)}/> Allow new parent invitations</label> : <p>Loading invitation setting…</p>}
    {settings && <p role="status" className="muted">New invitations are {settings.enabled ? 'enabled' : 'paused'}.</p>}
    {error && <p role="alert" className="open-text">{error}</p>}
    <div className="parent-access-controls"><label htmlFor="parent-access-student">Review parent access for student</label><NativeSelect id="parent-access-student" value={chosen?._id ?? ''} onChange={e=>setSelected(e.target.value)} disabled={roster.length===0}>{roster.map(student=><NativeSelectOption value={student._id} key={student._id}>{student.name}</NativeSelectOption>)}</NativeSelect></div>
    {chosen ? <InviteRecords key={chosen._id} student={chosen}/> : <p className="muted">No students in the current roster.</p>}
  </section>
}

export function StudentParents({student}:{student:RosterStudent|null}) {
  const settings = useQuery(api.parentInvites.invitationSettings,{})
  const create = useMutation(api.parentInvites.createParentInvite)
  const invites = useQuery(api.parentInvites.listStudentInvites,student?{studentId:studentId(student._id)}:'skip')
  const links = useQuery(api.parentInvites.listFamilyLinks,student?{studentId:studentId(student._id)}:'skip')
  const [email,setEmail] = useState('')
  const [link,setLink] = useState('')
  const [expiry,setExpiry] = useState<number|null>(null)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [copied,setCopied] = useState(false)
  useEffect(()=>{setLink('');setExpiry(null);setCopied(false);setError('')},[student?._id])
  const submit = async (event:FormEvent) => {event.preventDefault();if(!student)return;setBusy(true);setError('');setLink('');setCopied(false);try{const result=await create({studentId:studentId(student._id),parentEmail:email.trim().toLowerCase()});setLink(inviteLink(result.token));setExpiry(result.expiresAt);setEmail('')}catch(e){setError(message(e))}finally{setBusy(false)}}
  const copy = async () => {try{await navigator.clipboard.writeText(link);setCopied(true)}catch{setError('Could not copy the link. Select and copy it from the field instead.')}}
  return <><div className="page-head"><div><p className="eyebrow">Parent access</p><h1>Parents</h1><p className="muted lead">Invite a parent or legal guardian to view your team information.</p></div></div>
    {!student ? <section className="card"><p>No student profile is available.</p></section> : <>
      <section className="card parent-section"><h2>Invite a parent</h2><p>Enter the Google account email your parent will use. The invitation expires in 7 days and can be used once.</p>
        {settings?.enabled === false && <p role="status">A Coach has paused new parent invitations. Existing links and pending invitations remain in place.</p>}
        <form className="parent-invite-form" onSubmit={e=>void submit(e)}><label htmlFor="parent-email">Parent Google email</label><Input id="parent-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy || settings?.enabled !== true}/><Button className="button button-primary" type="submit" disabled={busy || settings?.enabled !== true}>{busy?'Creating…':'Create invitation link'}</Button></form>
        <p className="muted tiny">No email is sent by this app. Copy the link and share it privately with the invited parent.</p>
        {link && <div className="parent-share" role="status"><p>Invitation created. Share this link with the invited parent by {expiry ? when(expiry) : 'its expiry'}.</p><label htmlFor="parent-share-link">Invitation link</label><Input id="parent-share-link" value={link} readOnly onFocus={e=>e.currentTarget.select()}/><Button className="button button-outline" onClick={()=>void copy()}>{copied?'Copied':'Copy link'}</Button><p className="muted tiny">This link is shown once. If you leave this page, create a new invitation to get a replacement link.</p></div>}
        {error && <p role="alert" className="open-text">{error}</p>}
      </section>
      <section className="card parent-section"><h2>Invitations and access</h2>
        {!invites || !links ? <p>Loading…</p> : <><h3>Invitations</h3>{invites.length===0 ? <p className="muted">No invitations yet.</p> : <div className="simple-list">{invites.map(invite=><div className="parent-record" key={invite._id}><strong>{invite.parentEmail}</strong><span>{invite.status==='pending' && invite.expiresAt<=Date.now()?'Expired':invite.status} · {when(invite.expiresAt)}</span></div>)}</div>}
          <h3>Linked parents</h3>{links.filter(link=>link.active).length===0 ? <p className="muted">No parent accounts linked.</p> : <div className="simple-list">{links.filter(link=>link.active).map(link=><div className="parent-record" key={link._id}><strong>{link.parentName}</strong><span>{link.parentEmail}</span></div>)}</div>}</>}
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
  const accept = useMutation(api.parentInvites.acceptParentInvite)
  const [relationship,setRelationship] = useState('')
  const [attestedVersion,setAttestedVersion] = useState<string|null>(null)
  const [attestedText,setAttestedText] = useState<string|null>(null)
  const attested = !!preview?.attestationVersion && !!preview.attestationText && attestedVersion === preview.attestationVersion && attestedText === preview.attestationText
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  useEffect(()=>{if(token){if(!window.location.hash)window.history.replaceState(window.history.state,'',`${window.location.pathname}${window.location.search}#token=${encodeURIComponent(token)}`);window.sessionStorage.removeItem(oauthTokenKey)}},[token])
  useEffect(()=>{if(!token)return;let current=true;const refresh=()=>{void previewInvite({token}).then(result=>{if(current)setPreview(result)}).catch(e=>{if(current)setError(message(e))})};setPreview(null);refresh();const interval=window.setInterval(refresh,30_000);return()=>{current=false;window.clearInterval(interval)}},[token,viewer?.status,previewInvite])
  const login = async () => {if(!token)return;setBusy(true);setError('');window.sessionStorage.setItem(oauthTokenKey,token);try{await signIn('google',{redirectTo:`${window.location.origin}/invite-parent`})}catch(e){window.sessionStorage.removeItem(oauthTokenKey);setError(message(e));setBusy(false)}}
  const switchAccount = async () => {setBusy(true);setError('');window.sessionStorage.removeItem(oauthTokenKey);try{await signOut();setPreview(null)}catch(e){setError(message(e))}finally{setBusy(false)}}
  const submit = async (event:FormEvent) => {event.preventDefault();if(!token||!preview?.attestationVersion||!attested)return;setBusy(true);setError('');try{await accept({token,relationship:relationship.trim(),authorityAttested:true,attestationVersion:preview.attestationVersion});window.sessionStorage.removeItem(oauthTokenKey);window.history.replaceState(window.history.state,'','/');navigate('/',{replace:true})}catch(e){setError(message(e))}finally{setBusy(false)}}
  return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt="Denham Venom"/></div><main className="signin-content"><p className="eyebrow">TEAM 8044</p><h1>Parent invitation</h1><div className="signin-card">
    {!token ? <><h2>Link unavailable</h2><p>Ask the student for a new invitation link.</p></> : !viewer || !preview ? <p>Checking invitation…</p> : preview.status==='signInRequired' || viewer.status==='signedOut' ? <><h2>Sign in to continue</h2><p>Use the Google account that received this invitation. Student information appears only after the invited account is verified.</p><Button className="button button-primary" disabled={busy} onClick={()=>void login()}>{busy?'Opening Google…':'Continue with Google'}</Button></> : preview.status==='valid' ? <><h2>Accept invitation</h2><p>Invited account: <strong>{preview.parentEmail}</strong></p><p>Student: <strong>{preview.studentName}</strong></p><p>Expires: {preview.expiresAt ? when(preview.expiresAt) : 'soon'}</p><form onSubmit={e=>void submit(e)} className="parent-accept-form"><label htmlFor="parent-relationship">Your relationship to the student</label><NativeSelect id="parent-relationship" value={relationship} onChange={e=>setRelationship(e.target.value)} required><NativeSelectOption value="">Choose relationship</NativeSelectOption><NativeSelectOption value="Parent">Parent</NativeSelectOption><NativeSelectOption value="Legal guardian">Legal guardian</NativeSelectOption></NativeSelect><label className="checkbox-label"><Checkbox checked={attested} onCheckedChange={checked=>{setAttestedVersion(checked?preview.attestationVersion:null);setAttestedText(checked?preview.attestationText:null)}}/> {preview.attestationText}</label><p className="muted tiny">Accepting access does not sign a travel permission form or authorize medication.</p><Button className="button button-primary" type="submit" disabled={busy || !attested || !relationship}>{busy?'Accepting…':'Accept invitation'}</Button></form></> : <><h2>Invitation cannot be accepted</h2><p>{preview.status==='emailMismatch'?'This Google account does not match the invited email. Sign in with the invited account, or ask the student for a corrected invitation.':preview.status==='accountConflict'?'This account already has a different team role. Ask a Coach to review access.':preview.status==='coachReviewRequired'?'A Coach must review this parent access before it can be restored.':'This link has expired, was used, or is no longer available. Ask the student for a new invitation or contact a Coach.'}</p>{preview.status==='emailMismatch'&&<Button className="button button-outline" disabled={busy} onClick={()=>void switchAccount()}>Switch Google account</Button>}</>}
    {error && <p role="alert" className="open-text">{error}</p>}
    <Link to="/" onClick={()=>window.sessionStorage.removeItem(oauthTokenKey)}>Return to Student Status</Link>
  </div></main></div>
}

/** Design review only: synthetic display data, no token, query, or mutation. */
export function ParentInvitationReview({mode}:{mode:'student'|'coach'|'landing'}) {
  if(mode==='landing') return <><div className="page-head"><div><p className="eyebrow">Synthetic review</p><h1>Parent invitation</h1></div></div><section className="card parent-section"><h2>Accept invitation</h2><p>Invited account: <strong>parent.demo@example.test</strong></p><p>Student: <strong>Sample Student</strong></p><p>Expires: October 19, 2026</p><div className="parent-accept-form"><label htmlFor="review-relationship">Your relationship to the student</label><NativeSelect id="review-relationship" defaultValue=""><NativeSelectOption value="">Choose relationship</NativeSelectOption><NativeSelectOption value="Parent">Parent</NativeSelectOption><NativeSelectOption value="Legal guardian">Legal guardian</NativeSelectOption></NativeSelect><label className="checkbox-label"><Checkbox/> I confirm that I am this student's parent or legal guardian and have authority to act for this student.</label><p className="muted tiny">Accepting access does not sign a travel permission form or authorize medication.</p><Button className="button button-primary" disabled>Accept invitation</Button></div></section></>
  if(mode==='student') return <><div className="page-head"><div><p className="eyebrow">Synthetic review</p><h1>Parents</h1><p className="muted lead">Invite a parent or legal guardian to view your team information.</p></div></div><section className="card parent-section"><h2>Invite a parent</h2><p>Enter the Google account email your parent will use. The invitation expires in 7 days and can be used once.</p><div className="parent-invite-form"><label htmlFor="review-parent-email">Parent Google email</label><Input id="review-parent-email" type="email" placeholder="parent@example.test"/><Button className="button button-primary" disabled>Create invitation link</Button></div><p className="muted tiny">No email is sent by this app. Copy the link and share it privately with the invited parent.</p></section><section className="card parent-section"><h2>Invitations and access</h2><div className="parent-record"><strong>parent.demo@example.test</strong><span>Pending · October 19, 2026</span></div><div className="parent-record"><strong>Sample Parent</strong><span>parent.linked@example.test · Access active</span></div></section></>
  return <><div className="page-head"><div><p className="eyebrow">Synthetic review</p><h1>Parent invitations</h1></div></div><section className="card parent-section"><h2>Parent invitations</h2><p>Control whether students can create new parent invitations across the team. Invitations already issued remain valid until their own expiry, and linked parents keep access.</p><label className="checkbox-label"><Checkbox defaultChecked/> Allow new parent invitations</label><div className="parent-access-controls"><label htmlFor="review-parent-student">Review parent access for student</label><NativeSelect id="review-parent-student"><NativeSelectOption>Sample Student</NativeSelectOption></NativeSelect></div><h3>Invitations</h3><div className="parent-record"><div><strong>parent.demo@example.test</strong><p className="muted tiny">Pending · expires October 19, 2026</p></div><Button className="button button-outline" disabled>Revoke invitation</Button></div><h3>Parent access</h3><div className="parent-record"><div><strong>Sample Parent</strong><p className="muted tiny">parent.linked@example.test · Access active</p></div><Button className="button button-outline" disabled>Revoke access</Button></div></section></>
}
