import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { ConfirmAction } from '@/ConfirmAction'
import { userFacingError } from '@/lib/error-message'
import type { MentorMeeting } from './contract'
import { eventTags, myPartLabel, seriesStatus, typeLabel } from './logic'
import { LeaveSeriesButton, MentorSignupWizard, type MentorActions } from './MentorSignupWizard'
import { hasQuestions, type WizardMode } from './signup-wizard'

const copy = mentorHomeCopy

export type RowAction = 'invite' | 'going' | 'join' | 'skipped' | 'none'

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
 * The Mentor's own buttons for one event, on Schedule › Join rows and the event page: answer an invitation, sign up, change
 * answers, skip or leave (one meeting, or every meeting of a series), or join a skipped meeting again. Sign up, I'll be there,
 * Change my answers and (when there are questions) Join this one again open the sign-up wizard.
 */
export function MeetingActions({ meeting, action, actions, size = 'sm', describedBy, label, onError }: {
  meeting: MentorMeeting
  action: RowAction
  actions: MentorActions
  size?: 'sm' | 'md'
  describedBy?: string
  /** Accessible name for the main button when its text alone is ambiguous in a list ("Sign up for Build night"). */
  label?: string
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
  const button = (tone: 'primary' | 'soft' | 'ghost' | 'urgent', text: ReactNode, onClick: () => void, which: 'yes' | 'no' = 'yes', name?: string) =>
    <button type="button" className={dashboardButtonVariants({ tone, size })} disabled={!!busy} aria-describedby={describedBy} aria-label={name} onClick={onClick}>{busy === which ? copy.signup.saving : text}</button>
  const going = action === 'going' && meeting.canWithdraw && !meeting.isCreator && !meeting.cancelled
  const series = meeting.seriesId !== null
  let buttons: ReactNode = null
  if (action === 'invite' && !meeting.cancelled) buttons = <>
    {button('primary', copy.invite.accept, () => setWizard('accept'))}
    {button('soft', copy.invite.decline, () => void run('no', () => actions.respond(meeting, 'declined'), copy.invite.declined(meeting.title), copy.invite.failed), 'no')}
  </>
  else if (action === 'join' && meeting.canSignUp) buttons = button('primary', copy.join.signUp, () => setWizard('join'), 'yes', label)
  else if (action === 'skipped' && meeting.canSignUp) buttons = button('primary', copy.series.joinAgain, () => hasQuestions(meeting, 'rejoin')
    ? setWizard('rejoin')
    : void run('yes', () => actions.signUp(meeting, { scope: 'one' }), copy.series.joinedAgain(meeting.title), copy.series.joinAgainFailed))
  else if (going) buttons = <>
    {hasQuestions(meeting, 'change') && button('soft', copy.answers.change, () => setWizard('change'))}
    {series
      ? <>
        {button('soft', copy.series.skip, () => void run('no', () => actions.skip(meeting), copy.series.skippedToast(meeting.title), copy.series.skipFailed), 'no')}
        <LeaveSeriesButton meeting={meeting} actions={actions} disabled={!!busy} size={size} />
      </>
      : <ConfirmAction title={copy.join.withdrawTitle(meeting.title)} description={copy.join.withdrawDetail(meeting.title)} confirmLabel={copy.join.withdrawConfirm} disabled={!!busy}
        onConfirm={async () => { await actions.withdraw(meeting); toast.success(copy.join.withdrew(meeting.title)) }}>{copy.join.withdraw}</ConfirmAction>}
  </>
  if (!buttons) return null
  return <>
    {buttons}
    <MentorSignupWizard meeting={meeting} mode={wizard} actions={actions} onClose={() => setWizard(null)} />
  </>
}
