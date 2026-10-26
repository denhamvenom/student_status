import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'
import { ADMIN_CONTACT_EMAIL, type AdminContactTopic } from '../convex/lib/adminContact'
import { adminContactTopic, userFacingError } from '@/lib/error-message'
import { Button } from './components/ui/button'

type Status = 'queued' | 'notSent' | 'tooManyRequests'
const copy = {
  button: 'Contact admin',
  sending: 'Sending…',
  failed: "Your request wasn't sent. Try again.",
  queued: 'Sent. The administrator will get back to you.',
  notSent: `Email isn't set up yet. Email ${ADMIN_CONTACT_EMAIL} directly.`,
  tooManyRequests: "You've sent several requests. Wait an hour, then try again.",
} satisfies Record<Status | 'button' | 'sending' | 'failed', string>

/** Lets a Coach tell the administrator about a setup limit. Shows the result in place. */
export function ContactAdminButton({ topic }: { topic: AdminContactTopic }) {
  const request = useMutation(api.adminContact.request)
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const send = async () => {
    if (sending.current) return
    sending.current = true; setBusy(true); setError('')
    try { setStatus((await request({ topic })).status) }
    catch (cause) { setError(userFacingError(cause, copy.failed)) }
    finally { sending.current = false; setBusy(false) }
  }
  return <div className="action-row">
    {status !== 'queued' && <Button type="button" variant="outline" disabled={busy} onClick={() => void send()}>{busy ? copy.sending : copy.button}</Button>}
    {status && <p role="status" className={status === 'queued' ? 'ready-text' : 'open-text'}>{copy[status]}</p>}
    {error && <p role="alert" className="open-text">{error}</p>}
  </div>
}

/** Renders Contact admin only for errors that carry a topic. */
export function ContactAdminFor({ error }: { error: unknown }) {
  const topic = adminContactTopic(error)
  return topic ? <ContactAdminButton key={topic} topic={topic} /> : null
}
