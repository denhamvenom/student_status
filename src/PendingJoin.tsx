import { userFacingError } from '@/lib/error-message'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { PendingJoinView } from './PendingJoinView'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { liveCopy } from './lib/live-copy'

const joinCopy = {
  code: 'Invitation code',
  intro: 'Enter the invitation code a Coach gave you.',
  another: 'Have another invitation code?',
  continue: 'Continue',
  checking: 'Checking…',
  nameIntro: 'Code accepted. Enter your first and last name to ask to join the team.',
  differentCode: 'Use a different code',
  noMatch: 'That invitation code didn’t work. It may be mistyped, expired or revoked. Check it and try again, or ask a Coach for a new code. After 5 wrong codes, you’ll need to wait 15 minutes.',
  tooManyAttempts: 'Too many codes were tried. Wait 15 minutes, then try again.',
  codeStopped: 'That invitation code no longer works. Ask a Coach for a new code.',
  checkFailed: 'The code couldn’t be checked. Try again, or ask a Coach for help.',
  connectionTitle: 'Account connection requested',
  connectionDetail: 'A Coach must approve this Google account before it connects to your student record. You can’t see that record yet.',
  connectionWaiting: 'Your request is with your Coach. Your account will connect only after Coach approval.',
  connectionDeclined: 'Your connection request was not approved or is no longer available. Ask your Coach for a new code.',
  waitingCoach: 'Waiting for Coach approval',
  waitingCoachOrTravelLead: 'Waiting for Coach or Travel Lead approval',
} as const

export function PendingJoin() {
  const request = useMutation(api.app.requestJoin)
  const redeem = useMutation(api.bulkInvites.redeem)
  const checkCode = useMutation(api.bulkInvites.checkInvitationCode)
  const { signOut } = useAuthActions()
  const [code, setCode] = useState(''), [first, setFirst] = useState(''), [last, setLast] = useState('')
  // Set only after the server confirms a team code; the name is asked for only then.
  const [teamCode, setTeamCode] = useState<string | null>(null)
  const [error, setError] = useState(''), [signOutError, setSignOutError] = useState(''), [busy, setBusy] = useState(false)
  const [sentId, setSentId] = useState<string | null>(null)
  const [asOf, setAsOf] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setAsOf(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const joinStatus = useQuery(api.app.joinStatus, {})
  const connections = useQuery(api.bulkInvites.myConnectionRequests, { asOf })
  const sent = sentId !== null && !connections?.some(item => item.requestId === sentId)
  const pending = connections?.some(item => item.status === 'pending') ?? false
  const latest = connections?.reduce<(NonNullable<typeof connections>)[number] | undefined>((a, b) => !a || b.createdAt > a.createdAt ? b : a, undefined)
  const submitted = sent || pending || joinStatus?.status === 'pending' || joinStatus?.status === 'approved'
  const declined = !submitted && (latest?.status === 'declined' || joinStatus?.status === 'declined')

  async function submitCode(event: FormEvent) {
    event.preventDefault()
    const entered = code.trim()
    if (busy || pending || sent || !entered) return
    setBusy(true); setError('')
    try {
      const { kind } = await checkCode({ code: entered })
      if (kind === 'team') { setTeamCode(entered); return }
      if (kind === 'tooManyAttempts') { setError(joinCopy.tooManyAttempts); return }
      if (kind === 'unavailable') { setError(joinCopy.noMatch); return }
      const result = await redeem({ code: entered })
      if (!result.requestId) { setError(joinCopy.codeStopped); return }
      setSentId(result.requestId); setCode('')
    } catch (cause) { setError(userFacingError(cause, joinCopy.checkFailed)) }
    finally { setBusy(false) }
  }
  async function submitName(event: FormEvent) {
    event.preventDefault()
    if (busy || !teamCode) return
    setBusy(true); setError('')
    try {
      const requestId = await request({ code: teamCode, firstName: first.trim(), lastName: last.trim() })
      if (!requestId) { setTeamCode(null); setError(joinCopy.codeStopped); return }
      setTeamCode(null); setCode('')
    } catch (cause) { setError(userFacingError(cause)) }
    finally { setBusy(false) }
  }
  function changeCode() { setTeamCode(null); setError('') }
  async function exit() {
    setBusy(true); setSignOutError('')
    try { await signOut() } catch (cause) { setSignOutError(userFacingError(cause, liveCopy.join.signOutFailed)) } finally { setBusy(false) }
  }
  if (!joinStatus || !connections) return <section className="card"><p>Checking your join request…</p></section>
  const connectionWaiting = pending || sent
  return <PendingJoinView waitingTitle={connectionWaiting ? joinCopy.waitingCoach : joinCopy.waitingCoachOrTravelLead} waitingDetail={connectionWaiting ? joinCopy.connectionWaiting : undefined} declined={declined} submitted={submitted} busy={busy} signOutError={signOutError} onSignOut={() => void exit()}>
    {connectionWaiting ? <section className="card"><h2>{joinCopy.connectionTitle}</h2><p role="status">{joinCopy.connectionDetail}</p></section> : <section className="card">
      {declined && latest?.status === 'declined' && <p>{joinCopy.connectionDeclined}</p>}
      <h2>{submitted || declined ? joinCopy.another : liveCopy.join.heading}</h2>
      {teamCode ? <form className="form-grid" onSubmit={event => void submitName(event)}>
        <p role="status">{joinCopy.nameIntro}</p>
        <label>{liveCopy.join.first} <Input value={first} disabled={busy} onChange={event => setFirst(event.target.value)} autoComplete="given-name" required /></label>
        <label>{liveCopy.join.last} <Input value={last} disabled={busy} onChange={event => setLast(event.target.value)} autoComplete="family-name" required /></label>
        <p className="muted">{liveCopy.join.studentNote}</p>
        <Button className="button button-primary" type="submit" disabled={busy}>{liveCopy.join.submit}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={changeCode}>{joinCopy.differentCode}</Button>
      </form> : <form className="form-grid" onSubmit={event => void submitCode(event)}>
        <p>{joinCopy.intro}</p>
        <label>{joinCopy.code} <Input value={code} disabled={busy} onChange={event => { setCode(event.target.value); setError('') }} autoComplete="off" required /></label>
        <Button className="button button-primary" type="submit" disabled={busy || !code.trim()}>{busy ? joinCopy.checking : joinCopy.continue}</Button>
      </form>}
      {error && <p role="alert" className="open-text">{error}</p>}
    </section>}
  </PendingJoinView>
}
