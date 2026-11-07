import { useId, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useMutation, useQueries, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { TileErrorBoundary } from '@/components/dashboard/TileErrorBoundary'
import { TileSkeleton } from '@/components/dashboard/TileSkeleton'
import { dashboardButtonVariants, eyebrow, focusRing, inset } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { userFacingError } from '@/lib/error-message'
import { eventSchedule } from '@/lib/event-schedule'
import { subteamDisplay } from '@/lib/subteams'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { ConfirmAction } from '../../ConfirmAction'
import { dateTimeBounds } from '../event-setup/new-event-defaults'
import { draftFrom, eventEditValues, placeEditable, type EventDraft } from '../operations/event-edit'
import type { MentorMeeting, MentorMeetingDetail } from './contract'
import { MeetingActions, MeetingBadges, type RowAction } from './MentorMeetingRow'
import { useMentorActions } from './MentorHome'
import { useNow } from '../student-home/useNow'
import { blockHeading } from './rows'
import { editableMeeting, meetingPlace, seriesStatus, typeLabel } from './logic'

const copy = mentorHomeCopy

/**
 * /events/:id for a Mentor: the minimized meeting page (mentorMeetings.view). Title, when, where, who it's for, Mentors
 * coming and (for meetings the Mentor created or joined) students coming. The Mentor's own answer or sign-up is here
 * too; meetings they created add Edit and Cancel (this meeting only).
 */
export function MentorMeetingPage({ eventId }: { eventId: string }) {
  const navigate = useNavigate()
  // Back returns to where the Mentor came from (Home or Schedule); opened directly, it goes Home.
  const back = () => { if ((window.history.state as { idx?: number } | null)?.idx) void navigate(-1); else void navigate('/') }
  return <div className="flex min-w-0 flex-col gap-3 pb-24 font-sans text-vs-text md:mx-auto md:w-full md:max-w-[720px] lg:gap-4 lg:pb-6">
    <button type="button" onClick={back} className={cn('inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[14px] font-semibold text-vs-accent-text!', focusRing)}><ArrowLeft size={16} aria-hidden="true" />{copy.page.back}</button>
    <TileErrorBoundary title={copy.page.loading} message={copy.page.failed} retryLabel={copy.states.tryAgain}>
      <MeetingContent eventId={eventId as Id<'events'>} />
    </TileErrorBoundary>
  </div>
}

function MeetingContent({ eventId }: { eventId: Id<'events'> }) {
  const now = useNow()
  const detail = useQuery(api.mentorMeetings.view, { eventId, asOf: Math.floor(now / 60_000) * 60_000 })
  if (detail === undefined) return <TileSkeleton surface="hero" rows={3} label={copy.page.loading} />
  return <Meeting detail={detail} />
}

/** The Mentor's own answer to a sign-up question, in words. */
const answerText = (value: boolean | null, yes: string) => value === null ? copy.page.notAnswered : value ? yes : copy.signup.drive.no

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5"><dt className={cn(eyebrow, 'm-0')}>{label}</dt><dd className="m-0 text-[15px] text-vs-text">{children}</dd></div>
}

function Meeting({ detail }: { detail: MentorMeetingDetail }) {
  const { meeting, mentors, pendingMentors, students, studentsTruncated } = detail
  const mentorsId = useId(), studentsId = useId()
  return <>
    <DashboardTile surface="hero" tone={meeting.cancelled ? 'overdue' : 'hero'} className="gap-3 lg:px-8">
      <h1 className={cn('m-0! font-heading! text-[28px]! font-normal! text-vs-heading lg:text-[36px]!', meeting.cancelled && 'line-through')}>{meeting.title}</h1>
      <MeetingBadges meeting={meeting} />
      {meeting.cancelled && <p role="status" className="m-0 text-[14px] font-semibold text-vs-urgent">{copy.meeting.canceled}</p>}
      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        <Fact label={copy.page.when}>{eventSchedule(meeting)}</Fact>
        <Fact label={copy.page.where}>{meetingPlace(meeting)}</Fact>
        <Fact label={copy.page.who}>{meeting.audience.text}</Fact>
        {typeLabel(meeting) && <Fact label={copy.signup.review.type}>{typeLabel(meeting)}</Fact>}
        {meeting.myStatus === 'accepted' && seriesStatus(meeting) && <Fact label={copy.signup.review.which}>{seriesStatus(meeting)}</Fact>}
        {meeting.myStatus === 'accepted' && meeting.questions.askDrive && <Fact label={copy.signup.review.drive}>{answerText(meeting.myAnswers.canDriveStudents ?? null, copy.signup.drive.yes)}</Fact>}
        {meeting.myStatus === 'accepted' && meeting.questions.askHotel && <Fact label={copy.signup.review.hotel}>{answerText(meeting.myAnswers.needsHotelRoom ?? null, copy.signup.hotel.yes)}</Fact>}
      </dl>
      {meeting.seriesId && meeting.canManage && <p className="m-0 text-[13px] text-vs-text-2">{copy.page.seriesNote}</p>}
      {meeting.canManage && <ManageActions meeting={meeting} />}
    </DashboardTile>
    <YourPlans meeting={meeting} />
    <div className="grid min-w-0 gap-3 lg:grid-cols-2 lg:gap-4">
      <DashboardTile tone="quiet" aria-labelledby={mentorsId} className="gap-3">
        <TileTitle id={mentorsId}>{copy.page.mentorsComing} · {mentors.length}</TileTitle>
        {mentors.length ? <ul className={cn(inset, 'm-0 flex list-none flex-col gap-1 px-3 py-2')}>{mentors.map(mentor => <li key={mentor.userId} className="flex min-h-9 items-center text-[14px]">{mentor.name}{mentor.isCreator && <span className="ml-1 text-vs-muted"> · {copy.page.creatorTag}</span>}</li>)}</ul> : <p className="m-0 text-[14px] text-vs-muted">{copy.page.noMentors}</p>}
        {pendingMentors.length > 0 && <div className="flex flex-col gap-1">
          <p className={cn(eyebrow, 'm-0')}>{copy.page.mentorsWaiting}</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">{pendingMentors.map(mentor => <li key={mentor.userId} className="text-[14px] text-vs-text-2">{mentor.name} · {mentor.status === 'invited' ? copy.page.mentorInvited : copy.page.mentorDeclined}</li>)}</ul>
        </div>}
      </DashboardTile>
      {meeting.audience.kind !== 'mentorsOnly' && <DashboardTile tone="quiet" aria-labelledby={studentsId} className="gap-3">
        <TileTitle id={studentsId}>{copy.page.studentsComing}{students ? ` · ${students.length}` : ''}</TileTitle>
        {students === null ? <p className="m-0 text-[14px] text-vs-muted">{copy.page.studentsHidden}</p>
          : students.length ? <ul className={cn(inset, 'm-0 flex list-none flex-col gap-1 px-3 py-2')}>{students.map((student, index) => <li key={`${student.displayName}:${index}`} className="flex min-h-9 items-center justify-between gap-2 text-[14px]"><span>{student.displayName}</span><span className="text-[13px] text-vs-muted">{subteamDisplay(student.subteam)}</span></li>)}</ul>
            : <p className="m-0 text-[14px] text-vs-muted">{copy.page.noStudents}</p>}
        {studentsTruncated && <p className="m-0 text-[13px] text-vs-muted">{copy.page.studentsTruncated}</p>}
      </DashboardTile>}
    </div>
  </>
}

/** Which of the Mentor's own buttons fit this event (the ones Home and Schedule leave to the event page). */
function pageAction(meeting: MentorMeeting): RowAction {
  if (meeting.cancelled || meeting.isCreator) return 'none'
  if (meeting.myStatus === 'invited') return 'invite'
  if (meeting.canWithdraw) return 'going'
  if (meeting.canSignUp) return meeting.seriesSignup?.skippedThisMeeting ? 'skipped' : 'join'
  return 'none'
}

/**
 * Your plans: the Mentor's own buttons, one per line on a phone. Going: Change my answers, then Skip this one and Leave all
 * meetings in this series (a series) or I can't go anymore (one time). Skipped: Join this one again. Invited: I'll be there /
 * I can't go. Open to them: Sign up. Hidden for meetings they created and when nothing applies.
 */
export function YourPlans({ meeting }: { meeting: MentorMeeting }) {
  const id = useId()
  const actions = useMentorActions()
  const [error, setError] = useState('')
  const action = pageAction(meeting)
  if (action === 'none') return null
  return <DashboardTile aria-labelledby={id} className="gap-2.5">
    <h2 id={id} className={blockHeading}>{copy.page.plans}</h2>
    <div className="flex flex-col gap-2 empty:hidden sm:flex-row sm:flex-wrap [&>button]:w-full sm:[&>button]:w-auto" role="group" aria-labelledby={id}><MeetingActions meeting={meeting} action={action} actions={actions} size="md" onError={setError} /></div>
    {error && <p role="alert" className="m-0 text-[13px] text-vs-urgent">{error}</p>}
  </DashboardTile>
}

/**
 * Your plans on the staff event page, for a Travel Lead (a Travel Lead is a Mentor too). Reads mentorMeetings.view and shows
 * nothing while it loads or when the event isn't open to them as a Mentor.
 */
export function MentorPlans({ eventId }: { eventId: string }) {
  const now = useNow()
  const asOf = Math.floor(now / 60_000) * 60_000
  const results = useQueries(useMemo(() => ({ view: { query: api.mentorMeetings.view, args: { eventId: eventId as Id<'events'>, asOf } } }), [eventId, asOf]))
  const detail = results.view as MentorMeetingDetail | Error | undefined
  if (detail === undefined || detail instanceof Error) return null
  return <div className="mb-4 md:max-w-[720px]"><YourPlans meeting={detail.meeting} /></div>
}

/** Edit (title, time, place) and Cancel for a meeting the Mentor created; both change this meeting only. */
function ManageActions({ meeting }: { meeting: MentorMeeting }) {
  const edit = useMutation(api.mentorMeetings.editMeeting)
  const cancel = useMutation(api.mentorMeetings.cancelMeeting)
  const event = editableMeeting(meeting)
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [openedRevision, setOpenedRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = () => { setError(''); setDraft(draftFrom(event)); setOpenedRevision(meeting.calendarRevision) }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft || busy) return
    const result = eventEditValues(event, draft)
    if ('error' in result) { setError(result.error); return }
    const { name, destination, startsAt, endsAt } = result.values
    setBusy(true); setError('')
    try { await edit({ eventId: meeting.eventId, expectedRevision: openedRevision, name, destination, startsAt, endsAt }); toast.success(copy.edit.saved); setDraft(null) }
    catch (cause) { setError(userFacingError(cause, copy.edit.failed)) }
    finally { setBusy(false) }
  }
  return <>
    <div className="flex flex-wrap gap-2 border-t border-vs-border-subtle pt-3" role="group" aria-label={copy.page.edit}>
      <button type="button" className={dashboardButtonVariants({ tone: 'soft' })} onClick={open}>{copy.page.edit}</button>
      <ConfirmAction description={copy.page.cancelConfirm} onConfirm={async () => { await cancel({ eventId: meeting.eventId, expectedRevision: meeting.calendarRevision }); toast.success(copy.page.canceledToast) }}>{copy.page.cancel}</ConfirmAction>
    </div>
    <Dialog open={draft !== null} disablePointerDismissal onOpenChange={next => { if (!next && !busy) setDraft(null) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg">
        {draft && <form className="form-grid" onSubmit={e => void save(e)}>
          <DialogTitle>{copy.edit.title}</DialogTitle>
          <DialogDescription>{copy.edit.description}</DialogDescription>
          <label>{copy.edit.name}<Input value={draft.name} maxLength={250} onChange={e => setDraft({ ...draft, name: e.target.value })} required /></label>
          <label>{copy.edit.starts}<Input type="datetime-local" min={dateTimeBounds.min} max={dateTimeBounds.max} value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} required /></label>
          <label>{copy.edit.ends}<Input type="datetime-local" min={dateTimeBounds.min} max={dateTimeBounds.max} value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} required /></label>
          {placeEditable(event)
            ? <label>{copy.edit.place}<Input value={draft.destination} maxLength={500} onChange={e => setDraft({ ...draft, destination: e.target.value })} required /></label>
            : <p className="muted">{copy.edit.placeLocked}</p>}
          {error && <p role="alert" className="open-text">{error}</p>}
          <div className="action-row">
            <Button type="submit" disabled={busy}>{busy ? copy.edit.saving : copy.edit.save}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>{copy.edit.close}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </>
}
