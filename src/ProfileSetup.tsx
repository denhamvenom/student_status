import { useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import { accountCopy } from './lib/account-copy'
import { liveCopy } from './lib/live-copy'

const copy = accountCopy.setup
type Profile = FunctionReturnType<typeof api.profileSetup.get>
export function ProfileSetup() {
  const profile = useQuery(api.profileSetup.get, {})
  if (!profile) return <p role="status">{copy.loading}</p>
  return <SetupForm key={`${profile.studentId}:${profile.revision}`} profile={profile}/>
}
function SetupForm({ profile }: { profile: Profile }) {
  const { signOut } = useAuthActions()
  const [step, setStep] = useState(0)
  const complete = useMutation(api.profileSetup.complete)
  const [preferred, setPreferred] = useState(profile.preferredName)
  const [shirt, setShirt] = useState(profile.shirtSize ?? '')
  const [category, setCategory] = useState(profile.roomCategory ?? '')
  const [guardian, setGuardian] = useState(profile.guardianName ?? '')
  const [relationship, setRelationship] = useState(profile.guardianRelationship ?? '')
  const [phone, setPhone] = useState(profile.guardianPhone ?? '')
  const [email, setEmail] = useState(profile.guardianEmail ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step < 4) { setStep(step + 1); return }
    if (category !== 'Boys' && category !== 'Girls') return
    setBusy(true); setError('')
    try { await complete({ expectedRevision: profile.revision, preferredName: preferred, shirtSize: shirt, roomCategory: category, guardianName: guardian, guardianRelationship: relationship, guardianPhone: phone, guardianEmail: email }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : copy.failed) }
    finally { setBusy(false) }
  }
  return <section className="signin-content">
    <p className="eyebrow" role="status">{copy.progress(step + 1)}</p>
    <Card><CardHeader><CardTitle>{step === 0 ? copy.welcome(profile.preferredName || profile.legalName) : copy.steps[step]}</CardTitle></CardHeader><CardContent>
      <form className="form-grid" onSubmit={event => void submit(event)}>
        {step === 0 && <>
        <dl><div className="detail"><dt>{copy.legalName}</dt><dd>{profile.legalName}</dd></div><div className="detail"><dt>{copy.email}</dt><dd>{profile.email}</dd></div><div className="detail"><dt>{copy.subteam}</dt><dd>{profile.subteam || liveCopy.profile.unknown}</dd></div></dl><p className="muted">{copy.correction}</p>
        <label>{copy.preferredName}<Input maxLength={80} value={preferred} onChange={event => setPreferred(event.target.value)}/></label>
        </>}
        {step === 1 && <div className="actions" role="group" aria-label={copy.shirt}>{Object.entries(liveCopy.profile.shirtSizeLabels).map(([value,label]) => <Button key={value} type="button" variant={shirt === value ? 'default' : 'outline'} aria-pressed={shirt === value} onClick={() => setShirt(value)}>{label}</Button>)}</div>}
        {step === 2 && <><div className="actions" role="group" aria-label={copy.category}>{(['Boys','Girls'] as const).map(value => <Button key={value} type="button" variant={category === value ? 'default' : 'outline'} disabled={profile.roomCategoryLocked} aria-pressed={category === value} onClick={() => setCategory(value)}>{value === 'Boys' ? copy.boys : copy.girls}</Button>)}</div>
        <p className="muted">{profile.roomCategoryLocked ? copy.locked : copy.lockNotice}</p>
        </>}
        {step === 3 && <><p className="muted">{copy.contactNote}</p>
        <label>{copy.guardianName}<Input value={guardian} maxLength={254} onChange={event => setGuardian(event.target.value)}/></label>
        <label>{copy.relationship}<Input value={relationship} maxLength={254} onChange={event => setRelationship(event.target.value)}/></label>
        <label>{copy.phone}<Input type="tel" value={phone} maxLength={254} onChange={event => setPhone(event.target.value)}/></label>
        <label>{copy.guardianEmail}<Input type="email" value={email} maxLength={254} onChange={event => setEmail(event.target.value)}/></label>
        <Button type="button" variant="link" onClick={() => { setGuardian(''); setRelationship(''); setPhone(''); setEmail(''); setStep(4) }}>{copy.skip}</Button></>}
        {step === 4 && <p>{copy.inviteNote}</p>}
        {error && <p role="alert" className="open-text">{error}</p>}
        <div className="actions">{step > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(step-1)}>{copy.back}</Button>}<Button type="submit" disabled={busy || step === 1 && !shirt || step === 2 && !category}>{busy ? copy.saving : step === 4 ? copy.save : copy.next}</Button></div>
      </form>
    </CardContent></Card>
    <Button variant="link" onClick={() => void signOut()}>{copy.signOut}</Button>
  </section>
}
