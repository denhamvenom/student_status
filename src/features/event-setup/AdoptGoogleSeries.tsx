import { useEffect, useId, useState } from 'react'
import { useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { onsiteLocation } from '../../../convex/lib/transportation'
import { userFacingError } from '@/lib/error-message'
import { chicagoDisplayTime } from '@/lib/chicago-time'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { AudiencePicker } from './audience/AudiencePicker'
import { WherePicker } from './audience/WherePicker'
import { MentorInvitePicker } from './audience/MentorInvitePicker'
import { audienceIssue, defaultAudience, defaultMentorInvite, mentorInviteIssue, whereFields } from './audience/audience-rules'
import styles from './audience/Audience.module.css'
import type { AudienceValue, MentorInviteValue, PickerIssue, Where } from './audience/types'
import { audienceCreateArgs } from './event-audience-wiring'
import { useAdoptGoogleSeries, type AdoptSeriesArgs } from './series-support'

const copy = {
  open: 'Import from Team Calendar',
  title: 'Import from Team Calendar',
  stepCount: (step: number) => `Step ${step} of 2`,
  next: 'Continue',
  back: 'Back',
  description: 'Choose a repeating series that is already on Team Calendar. Its meetings will show in Events. Nobody is notified.',
  loading: 'Checking Team Calendar…',
  none: 'No repeating series on Team Calendar can be linked right now.',
  seriesLegend: 'Which series?',
  chooseSeries: 'Choose a series from the list.',
  name: 'Name in Venom Status',
  link: 'Link series',
  linking: 'Linking…',
  cancel: 'Cancel',
  linked: 'Linked. Its meetings will show in Events shortly.',
  failed: 'The series was not linked. Please try again.',
} as const

type Candidate = { id: string; title: string; location: string; startsAt: number; supported: boolean; reason: string | null }

export const adoptSeriesCopy = copy

/**
 * Coach only: brings an existing Team Calendar repeating series into the app as an event series, in two steps (pick the
 * series, then its details). Opened from the Events "More" menu.
 */
export function AdoptGoogleSeries({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  return <Dialog open={open} disablePointerDismissal onOpenChange={next => { if (!next && !busy) onOpenChange(false) }}>
    {/* A long form must scroll inside the viewport, or Cancel and Link series end up off screen and can't be tapped. */}
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg">{open && <AdoptForm busy={busy} setBusy={setBusy} onDone={() => onOpenChange(false)} />}</DialogContent>
  </Dialog>
}

function AdoptForm({ busy, setBusy, onDone }: { busy: boolean; setBusy: (busy: boolean) => void; onDone: () => void }) {
  const id = useId()
  const { candidates, adopt } = useAdoptGoogleSeries()
  const mentors = useQuery(api.studentSubteams.listMentorsForInvite, {}) ?? []
  const roster = useQuery(api.app.teamRoster, {}) as { _id: string; legalName?: string; preferredName: string; subteam: string; active?: boolean }[] | undefined
  const students = (roster ?? []).filter(s => s.active !== false).map(s => ({ id: s._id, name: s.legalName || s.preferredName || 'Student', subteam: s.subteam }))
  const [list, setList] = useState<{ items: Candidate[]; error: string | null } | null>(null)
  const [chosen, setChosen] = useState('')
  const [name, setName] = useState('')
  const [audience, setAudience] = useState<AudienceValue>(defaultAudience)
  const [mentorInvite, setMentorInvite] = useState<MentorInviteValue>(defaultMentorInvite)
  const [where, setWhere] = useState<Where>('shop')
  const [step, setStep] = useState<1 | 2>(1)
  const [issue, setIssue] = useState<PickerIssue | null>(null)
  const [error, setError] = useState('')
  // The form mounts each time the dialog opens, so Team Calendar is checked once per opening.
  useEffect(() => {
    let cancelled = false
    void candidates({}).then(result => { if (!cancelled) setList(result) }).catch(cause => { if (!cancelled) setList({ items: [], error: userFacingError(cause, copy.failed) }) })
    return () => { cancelled = true }
  }, [candidates])
  const choose = (item: Candidate) => { setChosen(item.id); setName(item.title); setIssue(null) }
  const submit = async () => {
    if (busy) return
    if (step === 1) { if (!chosen) { setIssue({ field: 'series', message: copy.chooseSeries }); document.getElementById(`${id}-series`)?.focus(); return } setIssue(null); setStep(2); return }
    const problem = audienceIssue(audience, true) ?? mentorInviteIssue(mentorInvite, mentors, audience)
    if (problem) { setIssue(problem); document.getElementById(problem.field === 'mentors' ? `${id}-mentors-mentors` : problem.field === 'series' ? `${id}-series` : `${id}-audience-${problem.field}`)?.focus(); return }
    const { locationType, onsite } = whereFields(where)
    const virtual = locationType === 'virtual', atShop = !virtual && onsite
    const who = audienceCreateArgs({ travelTeam: false, audience, mentors: mentorInvite }, mentors, locationType)
    const args: AdoptSeriesArgs = {
      calendarMasterId: chosen, name: name.trim() || undefined, type: 'Team', travel: atShop ? onsiteLocation : virtual ? 'None' : 'Provide your Own', overnight: false, roomingEnabled: false, feeCents: 0,
      allowWithdrawal: !who.mandatory, permissionRequired: false, firstRequired: false, ...(atShop ? { onsite: true } : {}), ...(virtual ? { destination: 'Virtual (Discord)' } : {}),
      audienceKind: who.audienceKind ?? 'everyone', audienceSubteams: who.audienceSubteams, mandatory: who.mandatory, audienceStudentIds: who.audienceStudentIds,
      mentorInviteUserIds: who.mentorInviteUserIds as Id<'appUsers'>[] | undefined, inviteSubteamMentors: who.inviteSubteamMentors, locationType,
    }
    setBusy(true); setError(''); setIssue(null)
    try { await adopt(args); toast.success(copy.linked); onDone() } catch (cause) { setError(userFacingError(cause, copy.failed)) } finally { setBusy(false) }
  }
  const items = list?.items ?? []
  return <form className={styles.stack} onSubmit={e => { e.preventDefault(); void submit() }}>
    <p className={styles.hint}>{copy.stepCount(step)}</p>
    <DialogTitle>{copy.title}</DialogTitle>
    {step === 1 && <DialogDescription>{copy.description}</DialogDescription>}
    {step === 1 && (list === null ? <p role="status">{copy.loading}</p> : list.error ? <p role="alert" className={styles.error}>{list.error}</p> : !items.length ? <p className={styles.hint}>{copy.none}</p>
      : <fieldset id={`${id}-series`} tabIndex={-1} className={styles.group} disabled={busy} aria-invalid={issue?.field === 'series' || undefined}>
        <legend>{copy.seriesLegend}</legend>
        <div className={styles.choices}>{items.map(item => <label key={item.id} className={styles.choice}>
          <input type="radio" name={`${id}-series`} value={item.id} checked={chosen === item.id} disabled={!item.supported} onChange={() => choose(item)} />
          <span className={styles.choiceText}><strong>{item.title || 'Untitled series'}</strong><span>{item.startsAt ? `Starts ${chicagoDisplayTime(item.startsAt)}` : ''}{item.location ? ` · ${item.location}` : ''}</span>{item.reason && <span>{item.reason}</span>}</span>
        </label>)}</div>
      </fieldset>)}
    {step === 2 && <>
      <label className={styles.field} htmlFor={`${id}-name`}>{copy.name}<Input id={`${id}-name`} value={name} maxLength={250} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <WherePicker id={`${id}-location`} value={where} onChange={setWhere} disabled={busy} />
      <AudiencePicker id={`${id}-audience`} value={audience} onChange={setAudience} students={students} canAutoAssign issue={issue && issue.field !== 'mentors' && issue.field !== 'series' ? issue : null} />
      <MentorInvitePicker id={`${id}-mentors`} value={mentorInvite} onChange={setMentorInvite} mentors={mentors} audience={audience} issue={issue?.field === 'mentors' ? issue : null} />
    </>}
    {issue?.field === 'series' && <p role="alert" className={styles.error}>{issue.message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}>
      <Button type="button" variant="outline" disabled={busy} onClick={onDone}>{copy.cancel}</Button>
      {step === 2 && <Button type="button" variant="outline" disabled={busy} onClick={() => { setIssue(null); setError(''); setStep(1) }}>{copy.back}</Button>}
      {step === 1 ? <Button type="submit" disabled={!items.length}>{copy.next}</Button> : <Button type="submit" disabled={busy}>{busy ? copy.linking : copy.link}</Button>}
    </div>
  </form>
}
