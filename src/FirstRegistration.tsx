import { userFacingError } from '@/lib/error-message'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Checkbox } from './components/ui/checkbox'
import { Input } from './components/ui/input'

type Status = 'needsCompletion' | 'awaitingVerification' | 'verified'
type Invitation = FunctionReturnType<typeof api.firstRegistration.invitationSettings>
type StudentRegistration = FunctionReturnType<typeof api.firstRegistration.get>
const officialInstructions = 'https://www.firstinspires.org/programs/youth-registration'
const failure = (cause: unknown) => userFacingError(cause, 'The change could not be saved. Try again.')
const when = (at: number) => new Intl.DateTimeFormat('en-US', {dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago'}).format(at)

export function FirstStudentStatus({state,compact=false}:{state:Status;compact?:boolean}) {
  const text = state === 'verified' ? 'Verified for this season' : state === 'awaitingVerification' ? 'Awaiting Coach verification' : 'Needs completion'
  return <span className={`badge ${state === 'verified' ? 'badge-ready' : state === 'awaitingVerification' ? 'badge-pending' : 'badge-open'}`} aria-label={compact ? `FIRST registration and Consent & Release: ${text}` : undefined}>{text}</span>
}

function InvitationEditor({settings}:{settings:Invitation}) {
  const createUploadUrl = useMutation(api.firstRegistration.createQrUploadUrl)
  const save = useMutation(api.firstRegistration.setInvitation)
  const [baseRevision,setBaseRevision] = useState(settings.revision)
  const [baseUrl,setBaseUrl] = useState(settings.url ?? '')
  const [baseQrId,setBaseQrId] = useState<Id<'_storage'> | null>(settings.qrStorageId)
  const [url,setUrl] = useState(settings.url ?? '')
  const [qrStorageId,setQrStorageId] = useState<Id<'_storage'> | null>(settings.qrStorageId)
  const [qrFile,setQrFile] = useState<File | null>(null)
  const [qrChecked,setQrChecked] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [saved,setSaved] = useState(false)
  const stale = settings.revision > baseRevision
  const hasQr = qrFile !== null || qrStorageId !== null
  const linkChanged = url.trim() !== baseUrl
  const qrChanged = qrFile !== null || qrStorageId !== baseQrId
  const changed = linkChanged || qrChanged
  const oldQrCannotFollowNewLink = linkChanged && qrStorageId !== null && qrStorageId === baseQrId && qrFile === null
  const validUrl = (() => { try { return new URL(url.trim()).protocol === 'https:' } catch { return false } })()
  const reload = () => {setBaseRevision(settings.revision);setBaseUrl(settings.url ?? '');setBaseQrId(settings.qrStorageId);setUrl(settings.url ?? '');setQrStorageId(settings.qrStorageId);setQrFile(null);setQrChecked(false);setError('');setSaved(false)}

  async function submit(event:FormEvent) {
    event.preventDefault()
    if (busy || stale || !changed || !validUrl || oldQrCannotFollowNewLink || hasQr && !qrChecked) return
    setBusy(true);setError('');setSaved(false)
    try {
      let nextQrId = qrStorageId
      if (qrFile) {
        if (!qrFile.type.startsWith('image/')) throw new Error('Choose a QR image file.')
        if (qrFile.size > 2_000_000) throw new Error('Choose a QR image smaller than 2 MB.')
        const uploadUrl = await createUploadUrl({})
        const response = await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':qrFile.type},body:qrFile})
        if (!response.ok) throw new Error('The QR image could not be uploaded. Try again.')
        const uploaded: unknown = await response.json()
        if (!uploaded || typeof uploaded !== 'object' || !('storageId' in uploaded) || typeof uploaded.storageId !== 'string') throw new Error('The QR upload did not return an image reference.')
        nextQrId = uploaded.storageId as Id<'_storage'>
      }
      const revision = await save({expectedRevision:baseRevision,url:url.trim(),qrStorageId:nextQrId,qrMatchesInvitation:hasQr && qrChecked})
      setBaseRevision(revision);setBaseUrl(url.trim());setBaseQrId(nextQrId);setQrStorageId(nextQrId);setQrFile(null);setQrChecked(false);setSaved(true)
    } catch (cause) {setError(failure(cause))} finally {setBusy(false)}
  }

  return <Card><CardHeader><CardTitle>FIRST team invitation</CardTitle><CardDescription>Paste the team invitation link from FIRST. Families see it during setup.</CardDescription></CardHeader><CardContent className="grid gap-4">
    <form className="grid gap-4" onSubmit={event=>void submit(event)}>
      <label className="grid gap-2">FIRST team invitation link<Input type="url" inputMode="url" required value={url} disabled={busy || stale} onChange={event=>{setUrl(event.target.value);setSaved(false);setQrChecked(false)}} placeholder="https://" /></label>
      <label className="grid gap-2">FIRST-provided QR image (optional)<Input className="file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold file:text-secondary-foreground" type="file" accept="image/*" disabled={busy || stale} onChange={event=>{setQrFile(event.target.files?.[0] ?? null);setSaved(false);setQrChecked(false)}} /></label>
      {qrFile && <p className="text-sm text-muted-foreground">Selected image: {qrFile.name}. It will upload when you save.</p>}
      {!qrFile && qrStorageId && settings.qrUrl && <img className="max-h-40 max-w-40 object-contain" src={settings.qrUrl} alt="Current FIRST team invitation QR code" />}
      {qrStorageId && !qrFile && <Button type="button" variant="outline" disabled={busy || stale} onClick={()=>{setQrStorageId(null);setQrChecked(false);setSaved(false)}}>Remove QR image</Button>}
      {oldQrCannotFollowNewLink && <p role="status" className="text-sm text-muted-foreground">The saved QR points to the earlier link. Upload a new QR image or remove the old one before saving this link.</p>}
      {hasQr && <label className="flex items-start gap-2"><Checkbox checked={qrChecked} disabled={busy || stale} onCheckedChange={setQrChecked}/><span>I checked that this QR code opens the invitation link above.</span></label>}
      {stale && <p role="status">Another Coach changed the invitation settings. Reload the saved values before editing. <Button type="button" variant="outline" onClick={reload}>Reload settings</Button></p>}
      {error && <p role="alert" className="open-text">{error}</p>}{saved && <p role="status" className="ready-text">FIRST team invitation saved for this season.</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" className="disabled:opacity-35" disabled={busy || stale || !changed || !validUrl || oldQrCannotFollowNewLink || hasQr && !qrChecked}>{busy?'Saving…':'Save invitation'}</Button>{settings.url && <Button type="button" variant="outline" onClick={()=>void navigator.clipboard.writeText(settings.url!).catch(()=>setError('Could not copy the link. Select and copy it from the field instead.'))}>Copy saved link</Button>}</div>
    </form>
    {settings.url ? <a href={settings.url} target="_blank" rel="noopener noreferrer">Open saved FIRST team invitation</a> : <p role="status">Not set. Families are told to contact you.</p>}
    <a href={officialInstructions} target="_blank" rel="noopener noreferrer">Official FIRST youth registration instructions</a>
  </CardContent></Card>
}

export function FirstInvitationSettings() {
  const settings = useQuery(api.firstRegistration.invitationSettings,{})
  return settings ? <InvitationEditor settings={settings}/> : <Card><CardContent><p role="status">Loading FIRST team invitation settings…</p></CardContent></Card>
}

export function FirstStudentVerification({studentId}:{studentId:Id<'students'>}) {
  const get = useMutation(api.firstRegistration.get)
  const verify = useMutation(api.firstRegistration.verify)
  const reopen = useMutation(api.firstRegistration.reopen)
  const [registration,setRegistration] = useState<StudentRegistration | null>(null)
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [teamAccepted,setTeamAccepted] = useState(false)
  const [consentRelease,setConsentRelease] = useState(false)
  const [reason,setReason] = useState('')
  const [error,setError] = useState('')
  const [saved,setSaved] = useState('')
  async function refresh() {setLoading(true);setTeamAccepted(false);setConsentRelease(false);setReason('');try {setRegistration(await get({studentId}));setError('')} catch(cause) {setError(failure(cause))} finally {setLoading(false)}}
  useEffect(()=>{let active=true;setLoading(true);void get({studentId}).then(value=>{if(active){setRegistration(value);setError('')}}).catch(cause=>{if(active)setError(failure(cause))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[get,studentId])
  async function decide(event:FormEvent) {
    event.preventDefault()
    if (!registration || busy) return
    setBusy(true);setError('');setSaved('')
    try {
      if (registration.status === 'verified') {
        if (!reason.trim()) return
        await reopen({studentId,expectedRevision:registration.revision,reason:reason.trim()})
        setSaved('Verification reopened. Competition readiness now requires a new Coach verification.')
        setReason('')
      } else {
        if (!teamAccepted || !consentRelease) return
        await verify({studentId,expectedRevision:registration.revision,teamAccepted:true,consentRelease:true})
        setSaved('Both FIRST team acceptance and current-season Consent & Release verified.')
        setTeamAccepted(false);setConsentRelease(false)
      }
      setRegistration(await get({studentId}))
    } catch(cause) {setError(failure(cause))} finally {setBusy(false)}
  }
  return <Card><CardHeader><CardTitle>FIRST registration and Consent &amp; Release</CardTitle><CardDescription>Covers every Competition this season.</CardDescription></CardHeader><CardContent className="grid gap-4">
    {loading ? <p role="status">Loading FIRST registration status…</p> : registration ? <>
      <p><FirstStudentStatus state={registration.status}/></p>
      {registration.reportedAt && <p className="text-sm text-muted-foreground">Completion reported {when(registration.reportedAt)}.</p>}
      {registration.verifiedAt && <p className="text-sm text-muted-foreground">Coach verified {when(registration.verifiedAt)}.</p>}
      <form className="grid gap-3" onSubmit={event=>void decide(event)}>
        {registration.status === 'verified' ? <details className="grid gap-3"><summary className="cursor-pointer">More options</summary><div className="grid gap-3"><label className="grid gap-2">Reason to reopen<Input required maxLength={1000} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)}/></label><Button type="submit" variant="outline" disabled={busy || !reason.trim()}>Reopen verification</Button></div></details> : <><p className="text-sm text-muted-foreground">Look up both in FIRST. Then check both boxes and press Verify.</p><label className="flex min-h-11 items-center gap-3"><Checkbox className="size-6" checked={teamAccepted} disabled={busy} onCheckedChange={setTeamAccepted}/><span>Accepted onto FIRST Robotics Competition Team 8044</span></label><label className="flex min-h-11 items-center gap-3"><Checkbox className="size-6" checked={consentRelease} disabled={busy} onCheckedChange={setConsentRelease}/><span>Current-season FIRST Consent &amp; Release completed</span></label><Button type="submit" className="disabled:opacity-35" disabled={busy || !teamAccepted || !consentRelease}>{busy?'Saving…':'Verify both for this season'}</Button></>}
      </form>
    </> : <Button type="button" variant="outline" disabled={loading} onClick={()=>void refresh()}>Retry loading status</Button>}
    {error && <div><p role="alert" className="open-text">{error}</p><Button type="button" variant="outline" disabled={loading || busy} onClick={()=>void refresh()}>Reload current status</Button></div>}{saved && <p role="status" className="ready-text">{saved}</p>}
  </CardContent></Card>
}
