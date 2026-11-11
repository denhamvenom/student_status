import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { CoachContactTopic } from '../convex/coachContact'
import { userFacingError } from '@/lib/error-message'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Label } from './components/ui/label'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Textarea } from './components/ui/textarea'
import styles from './AskCoachButton.module.css'

// The server enforces the same limit; this only lets the Send button say so first.
const MESSAGE_MAX = 1000
const topics: Record<CoachContactTopic, string> = { eventsTravel: 'Events and travel', money: 'Money', forms: 'Permission forms', other: 'Something else' }
const coachEmail = 'coach@team8044.org'
const replyLine = (email?: string) => `A Coach will reply ${email ? `to ${email}` : 'by email'}.`
const copy = {
  button: 'Ask a Coach',
  title: 'Ask a Coach',
  intro: (email?: string) => `Your message goes to the Coaches. ${replyLine(email)}`,
  sending: 'Sending…',
  queued: (email?: string) => `Sent. ${replyLine(email)}`,
  notSent: "We couldn't send your message right now. Email the Coaches directly:",
  tooManyRequests: "You've sent several messages recently. Try again later today or tomorrow. If it's urgent, email coach@team8044.org.",
  sendHint: 'Choose a topic and write a message to send.',
  failed: "Your message wasn't sent. Try again. If it keeps happening, email the Coaches directly.",
}

/** Lets a signed-in Parent, Student or Mentor message the Coaches. `variant` styles the trigger button only. */
export function AskCoachButton({ variant = 'outline', email }: { variant?: 'default' | 'outline'; /** The sign-in email, when the caller has it; the reply goes there. */ email?: string }) {
  const send = useMutation(api.coachContact.send)
  const sending = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [topic, setTopic] = useState<CoachContactTopic | ''>('')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<'queued' | 'notSent' | 'tooManyRequests' | null>(null)
  const [error, setError] = useState('')
  const trimmed = message.trim()
  const valid = topic !== '' && trimmed.length > 0 && trimmed.length <= MESSAGE_MAX
  const missingInput = topic === '' || trimmed.length === 0
  const close = (next: boolean) => {
    if (busy) return
    setOpen(next)
    if (!next) { setError(''); if (result === 'queued') { setTopic(''); setMessage('') } setResult(null) }
  }
  const submit = async () => {
    if (!valid || sending.current) return
    sending.current = true; setBusy(true); setError(''); setResult(null)
    try { setResult((await send({ topic, message: trimmed })).status) }
    catch (cause) { setError(userFacingError(cause, copy.failed)) }
    finally { sending.current = false; setBusy(false) }
  }
  return <>
    <Button type="button" variant={variant} onClick={() => setOpen(true)}>{copy.button}</Button>
    <Dialog open={open} disablePointerDismissal onOpenChange={close}>
      <DialogContent showCloseButton={false}>
        <DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.intro(email)}</DialogDescription></DialogHeader>
        {result === 'queued'
          ? <>
            <p role="status" className={styles.done}>{copy.queued(email)}</p>
            <div className={styles.actions}><Button type="button" onClick={() => close(false)}>Close</Button></div>
          </>
          : <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}>
            <div className={styles.field}>
              <Label htmlFor="ask-coach-topic">What is it about?</Label>
              <NativeSelect id="ask-coach-topic" value={topic} disabled={busy} onChange={event => setTopic(event.target.value as CoachContactTopic | '')}>
                <NativeSelectOption value="" disabled>Choose a topic</NativeSelectOption>
                {Object.entries(topics).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className={styles.field}>
              <Label htmlFor="ask-coach-message">Your message</Label>
              <Textarea id="ask-coach-message" rows={5} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} aria-describedby="ask-coach-count" />
              <span id="ask-coach-count" className={styles.count}>{trimmed.length} of {MESSAGE_MAX}{trimmed.length > MESSAGE_MAX ? ` — shorten it by ${trimmed.length - MESSAGE_MAX}` : ''}</span>
            </div>
            {result && <p role="status" className="open-text">{copy[result]}{result === 'notSent' && <> <a href={`mailto:${coachEmail}`}>{coachEmail}</a></>}</p>}
            {error && <p role="alert" className="open-text">{error}</p>}
            {missingInput && <p id="ask-coach-hint" className={styles.count}>{copy.sendHint}</p>}
            <div className={styles.actions}>
              <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" disabled={!valid || busy} aria-describedby={missingInput ? 'ask-coach-hint' : undefined}>{busy ? copy.sending : 'Send'}</Button>
            </div>
          </form>}
      </DialogContent>
    </Dialog>
  </>
}
