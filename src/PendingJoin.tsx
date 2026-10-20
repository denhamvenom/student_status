import { userFacingError } from '@/lib/error-message'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { PendingJoinView } from './PendingJoinView'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { liveCopy } from './lib/live-copy'
import { isIndividualInvitation, isValidIndividualInvitation } from './lib/invitation-code'

export function PendingJoin() {
  const request = useMutation(api.app.requestJoin)
  const redeem = useMutation(api.bulkInvites.redeem)
  const previewCode = useMutation(api.bulkInvites.previewCode)
  const { signOut } = useAuthActions()
  const [code, setCode] = useState(''), [first, setFirst] = useState(''), [last, setLast] = useState('')
  const [preview, setPreview] = useState<{ code: string; status: string } | null>(null)
  const [error, setError] = useState(''), [signOutError, setSignOutError] = useState(''), [busy, setBusy] = useState(false)
  const [sentId, setSentId] = useState<string | null>(null)
  const generation = useRef(0)
  const individual = isIndividualInvitation(code)
  const valid = isValidIndividualInvitation(code)
  const [asOf, setAsOf] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setAsOf(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const joinStatus = useQuery(api.app.joinStatus, {})
  const connections = useQuery(api.bulkInvites.myConnectionRequests, { asOf })
  const sent = sentId !== null && !connections?.some(item => item.requestId === sentId)
  const pending = connections?.some(item => item.status === 'pending') ?? false
  const latest = connections?.reduce<(NonNullable<typeof connections>)[number] | undefined>((a, b) => !a || b.createdAt > a.createdAt ? b : a, undefined)
  const submitted = sent || pending || joinStatus?.status === 'pending' || joinStatus?.status === 'approved'
  const declined = !submitted && (latest?.status === 'declined' || joinStatus?.status === 'declined')
  useEffect(() => {
    if (!valid || pending || sent) return
    const current = generation.current
    let canceled = false
    const timer = window.setTimeout(() => {
      void previewCode({ code: code.trim() }).then(result => {
        if (!canceled && current === generation.current) setPreview({ code, status: result.status })
      }).catch(cause => { if (!canceled && current === generation.current) { setPreview(null); setError(userFacingError(cause, 'The invitation could not be checked. Try entering the code again or contact a Coach.')) } })
    }, 350)
    return () => { canceled = true; window.clearTimeout(timer) }
  }, [code, valid, pending, sent, previewCode])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || pending || sent) return
    setBusy(true); setError('')
    try {
      if (individual) {
        if (!valid || preview?.code !== code || preview.status !== 'valid') return
        const result = await redeem({ code: code.trim() })
        if (!result.requestId) { setError('This invitation code cannot be used. Ask your Coach for a current code.'); return }
        setSentId(result.requestId)
      } else {
        const requestId = await request({ code: code.trim(), firstName: first.trim(), lastName: last.trim() })
        if (!requestId) { setError(liveCopy.join.invalidCode); return }
      }
      setCode(''); setPreview(null)
    } catch (cause) { setError(userFacingError(cause)) }
    finally { setBusy(false) }
  }
  async function exit() {
    setBusy(true); setSignOutError('')
    try { await signOut() } catch (cause) { setSignOutError(userFacingError(cause, liveCopy.join.signOutFailed)) } finally { setBusy(false) }
  }
  if (!joinStatus || !connections) return <section className="card"><p>Checking your join request…</p></section>
  return <PendingJoinView waitingDetail={pending || sent ? "Your request is with your Coach. Your account will connect only after Coach approval." : undefined} declined={declined} submitted={submitted} busy={busy} signOutError={signOutError} onSignOut={() => void exit()}>
    {pending || sent ? <section className="card"><h2>Account connection requested</h2><p role="status">Your Coach must approve this Google account before it connects to a student record. You do not have access to that record yet.</p></section> : <section className="card">
      {declined && <p>Your connection request was not approved or is no longer available. Ask your Coach for a new code.</p>}
      <h2>{submitted || declined ? 'Have an individual invitation?' : liveCopy.join.heading}</h2>
      <p>Enter the code your Coach gave you. A five-digit individual code requests a connection to an existing student record. A six-digit team code requests team membership. Both require Coach approval.</p>
      <form className="form-grid" onSubmit={event => void submit(event)}>
        <label>{liveCopy.join.code} <Input value={code} disabled={busy} onChange={event => { generation.current++; setCode(event.target.value); setPreview(null); setError('') }} autoComplete="off" required /></label>
        {individual ? <>{preview?.code === code && preview.status === 'valid' && <p role="status">Code accepted. Your Coach will review your account connection request.</p>}{preview?.code === code && preview.status !== 'valid' && <p className="open-text">This individual invitation is unavailable. Ask your Coach for help.</p>}</> : !submitted && !declined ? <><label>{liveCopy.join.first} <Input value={first} disabled={busy} onChange={event => setFirst(event.target.value)} required /></label><label>{liveCopy.join.last} <Input value={last} disabled={busy} onChange={event => setLast(event.target.value)} required /></label><p className="muted">{liveCopy.join.studentNote}</p></> : null}
        <Button className="button button-primary" type="submit" disabled={busy || individual && (!valid || preview?.code !== code || preview.status !== 'valid') || !individual && (submitted || declined)}>{individual ? 'Request account connection' : liveCopy.join.submit}</Button>
      </form>
      {error && <p role="alert" className="open-text">{error}</p>}
    </section>}
  </PendingJoinView>
}
