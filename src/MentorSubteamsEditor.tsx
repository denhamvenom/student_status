import { useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { userFacingError } from '@/lib/error-message'
import { subteamOptions } from '@/lib/subteams'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { toggleItem } from './features/event-setup/audience/audience-rules'
import pickerStyles from './features/event-setup/audience/Audience.module.css'

/** Subteams a Mentor can belong to: the primary subteams plus CAD (Leadership is for students). */
export const mentorSubteamOptions: readonly string[] = [...subteamOptions, 'CAD']

const copy = {
  title: 'Mentor subteams',
  description: 'Tap a subteam to add or remove it. Changes save right away. Mentors of a subteam can be invited to that subteam’s events in one step.',
  loading: 'Loading mentors…',
  none: 'No active mentors yet.',
  noSubteams: 'No subteams',
  saving: 'Saving…',
  saved: (name: string) => `Saved ${name}’s subteams.`,
  undo: 'Undo',
  undone: (name: string) => `Restored ${name}’s earlier subteams.`,
  failed: 'Subteams were not saved. Please try again.',
} as const

type Mentor = { id: Id<'appUsers'>; name: string; subteams: string[] }

/** Coach only: which subteams each Mentor belongs to. */
export function MentorSubteamsEditor() {
  const mentors = useQuery(api.studentSubteams.listMentorsForInvite, {})
  return <Card><CardHeader><CardTitle>{copy.title}</CardTitle><CardDescription>{copy.description}</CardDescription></CardHeader><CardContent>
    {mentors === undefined ? <p role="status">{copy.loading}</p> : mentors.length === 0 ? <p className="muted">{copy.none}</p>
      : <ul className="simple-list">{mentors.map(mentor => <MentorRow key={mentor.id} mentor={mentor} />)}</ul>}
  </CardContent></Card>
}

function MentorRow({ mentor }: { mentor: Mentor }) {
  const save = useMutation(api.studentSubteams.setMentorSubteams)
  // The tapped selection shows while its save is in flight; the query result takes over once it lands.
  const [pending, setPending] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false) // the toast's Undo holds an older closure, so guard with a ref, not render state
  const busy = pending !== null
  const chosen = pending ?? mentor.subteams
  const apply = async (next: string[], previous: string[], undo: boolean) => {
    if (inFlight.current) return
    inFlight.current = true; setPending(next); setError('')
    try {
      await save({ userId: mentor.id, subteams: next })
      if (undo) toast.success(copy.undone(mentor.name))
      else toast.success(copy.saved(mentor.name), { duration: 8_000, action: { label: copy.undo, onClick: () => void apply(previous, next, true) } })
    } catch (cause) {
      const message = userFacingError(cause, copy.failed)
      setError(message)
      if (undo) toast.error(message)
    } finally { inFlight.current = false; setPending(null) }
  }
  const headingId = `mentor-subteams-${mentor.id}`
  // Legacy names (e.g. a retired subteam) stay visible so the Coach can clear them.
  const options = [...mentorSubteamOptions, ...mentor.subteams.filter(group => !mentorSubteamOptions.includes(group))]
  return <li className={pickerStyles.stack}>
    <fieldset className={pickerStyles.group} aria-labelledby={headingId} aria-busy={busy} disabled={busy}>
      <strong id={headingId}>{mentor.name}</strong>
      <div className={pickerStyles.chips}>{options.map(group => <button key={group} type="button" className={pickerStyles.chip} aria-pressed={chosen.includes(group)} onClick={() => void apply(toggleItem(chosen, group), chosen, false)}>{group}</button>)}</div>
      {chosen.length === 0 && <p className={pickerStyles.hint}>{copy.noSubteams}</p>}
    </fieldset>
    <p role="status" className="muted">{busy ? copy.saving : ''}</p>
    {error && <p role="alert" className="open-text">{error}</p>}
  </li>
}
