import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, focusRing } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { userFacingError } from '@/lib/error-message'
import type { MentorMeeting } from './contract'
import { eventTags, meetingLine, myPartLabel, seriesStatus, typeLabel } from './logic'
import { LeaveSeriesButton, MentorSignupWizard, type MentorActions } from './MentorSignupWizard'
import { hasQuestions, type WizardMode } from './signup-wizard'

const copy = mentorHomeCopy

/** What the Mentor can do from Home: their own sign-ups, plus Try again for the Home query. */
export type MentorHomeHandlers = MentorActions & { retry: () => void }

export type RowAction = 'invite' | 'going' | 'join' | 'skipped' | 'created' | 'none'

/** Type, Travel / Overnight / Repeats, audience, Virtual, Canceled and the Mentor's own part (or series choice), as small badges. */
export function MeetingBadges({ meeting, showPart = true }: { meeting: MentorMeeting; showPart?: boolean }) {
  const series = showPart ? seriesStatus(meeting) : null
  const part = showPart && !series ? myPartLabel(meeting) : null
  const type = typeLabel(meeting)
  return <span className="flex flex-wrap items-center gap-1.5">
    {meeting.cancelled && <StatusBadge tone="urgent">{copy.created.canceled}</StatusBadge>}
    {type && <StatusBadge tone="calm">{type}</StatusBadge>}
    {eventTags(meeting).map(tag => <StatusBadge key={tag} tone="warning">{tag}</StatusBadge>)}
    <StatusBadge tone={meeting.audience.required ? 'warning' : 'calm'}>{meeting.audience.text}</StatusBadge>
    {meeting.virtual && <StatusBadge tone="calm">{copy.meeting.virtual}</StatusBadge>}
    {series && <StatusBadge tone={meeting.seriesSignup?.skippedThisMeeting ? 'calm' : 'success'}>{series}</StatusBadge>}
    {part && <StatusBadge tone="success">{part}</StatusBadge>}
  </span>
}

/**
 * The Mentor's own buttons for one event, shared by Home rows and the event page: answer an invitation, sign up, change
 * answers, skip or leave (one meeting, or every meeting of a series), or join a skipped meeting again. Sign up, I'll be there,
 * Change my answers and (when there are questions) Join this one again open the sign-up wizard.
 */
export function MeetingActions({ meeting, action, actions, size = 'sm', describedBy, onError }: {
  meeting: MentorMeeting
  action: RowAction
  actions: MentorActions
  size?: 'sm' | 'md'
  describedBy?: string
  onError?: (message: string) => void
}) {
  const [wizard, setWizard] = useState<WizardMode | null>(null)
  const [busy, setBusy] = useState<null | 'yes' | 'no'>(null)
  const run = async (which: 'yes' | 'no', work: () => Promise<unknown>, success: string, fallback: string) => {
    if (busy) return
    setBusy(which); onError?.('')
    try { await work(); toast.success(success) }
    catch (cause) { const message = userFacingError(cause, fallback); onError?.(message); toast.error(message) }
    finally { setBusy(null) }
  }
  const button = (tone: 'primary' | 'soft' | 'ghost', label: ReactNode, onClick: () => void, which: 'yes' | 'no' = 'yes') =>
    <button type="button" className={dashboardButtonVariants({ tone, size })} disabled={!!busy} aria-describedby={describedBy} onClick={onClick}>{busy === which ? copy.signup.saving : label}</button>
  const going = action === 'going' && meeting.canWithdraw && !meeting.isCreator && !meeting.cancelled
  const series = meeting.seriesId !== null
  let buttons: ReactNode = null
  if (action === 'invite' && !meeting.cancelled) buttons = <>
    {button('primary', copy.invite.accept, () => setWizard('accept'))}
    {button('soft', copy.invite.decline, () => void run('no', () => actions.respond(meeting, 'declined'), copy.invite.declined(meeting.title), copy.invite.failed), 'no')}
  </>
  else if (action === 'join' && meeting.canSignUp) buttons = button('primary', copy.join.signUp, () => setWizard('join'))
  else if (action === 'skipped' && meeting.canSignUp) buttons = button('primary', copy.series.joinAgain, () => hasQuestions(meeting, 'rejoin')
    ? setWizard('rejoin')
    : void run('yes', () => actions.signUp(meeting, { scope: 'one' }), copy.series.joinedAgain(meeting.title), copy.series.joinAgainFailed))
  else if (going) buttons = <>
    {hasQuestions(meeting, 'change') && button('soft', copy.answers.change, () => setWizard('change'))}
    {series
      ? <>
        {button('ghost', copy.series.skip, () => void run('no', () => actions.skip(meeting), copy.series.skippedToast(meeting.title), copy.series.skipFailed), 'no')}
        <LeaveSeriesButton meeting={meeting} actions={actions} disabled={!!busy} size={size} />
      </>
      : button('ghost', copy.join.withdraw, () => void run('no', () => actions.withdraw(meeting), copy.join.withdrew(meeting.title), copy.join.withdrawFailed), 'no')}
  </>
  if (!buttons) return null
  return <>
    {buttons}
    <MentorSignupWizard meeting={meeting} mode={wizard} actions={actions} onClose={() => setWizard(null)} />
  </>
}

/**
 * One event in a Mentor Home list: a 44px link to the event page, its badges, then the actions that fit the list.
 * Saves show a toast; a failed save keeps the row and says so.
 */
export function MentorMeetingRow({ meeting, action, handlers }: { meeting: MentorMeeting; action: RowAction; handlers: MentorHomeHandlers }) {
  const [error, setError] = useState('')
  const headingId = `mentor-meeting-${action}-${meeting.eventId}`
  return <li className="flex flex-col gap-1.5 border-b border-vs-border-subtle py-2 last:border-b-0">
    <Link to={`/events/${meeting.eventId}`} className={cn('flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1 text-vs-text! no-underline! hover:bg-vs-inset-raised', focusRing)}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={headingId} className={cn('text-[15px] font-semibold text-vs-text', meeting.cancelled && 'line-through')}>{meeting.title}</span>
        <span className="text-[13px] text-vs-text-2">{meetingLine(meeting)}</span>
      </span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-vs-muted" />
    </Link>
    <div className="flex flex-col gap-2 px-2">
      <MeetingBadges meeting={meeting} showPart={action !== 'invite' && action !== 'join'} />
      <span className="flex flex-wrap gap-2 empty:hidden" role="group" aria-labelledby={headingId}>
        <MeetingActions meeting={meeting} action={action} actions={handlers} describedBy={headingId} onError={setError} />
      </span>
    </div>
    {error && <p role="alert" className="m-0 px-2 text-[13px] text-vs-urgent">{error}</p>}
  </li>
}
