import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { parseChicagoInput } from '@/lib/chicago-time'
import { userFacingError } from '@/lib/error-message'
import { api } from '../../../convex/_generated/api'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { audienceCopy } from './audience/audience-copy'
import { audienceSubteamOptions, toggleItem } from './audience/audience-rules'
import styles from './audience/Audience.module.css'
import { RadioChoice } from './audience/RadioChoice'
import { previewDateLabel, MAX_SERIES_MEETINGS, weekdays } from './audience/repeat'
import type { PickerIssue, Weekday } from './audience/types'
import setupStyles from './EventSetup.module.css'
import { useCreateSeries } from './series-support'
import { isPlan, seasonEndDate, teamMeetingDefaults, teamMeetingEndDateLimits, teamMeetingEndIssue, teamMeetingEventArgs, teamMeetingFirstDate, teamMeetingPlan, teamMeetingPrefill, teamMeetingRepeatOn, teamMeetingStartDate, teamMeetingSummary, type TeamMeetingDraft, teamMeetingCopy as copy } from './team-meeting'

/**
 * "+ Team meeting" on Events (Coach and Travel Lead): one sheet for a meeting at our shop. It is one meeting by default;
 * "Repeat this meeting" makes it weekly (days and end). Everything but the date, time, subteams and repeat is preset;
 * "More options" opens the full New event wizard with these answers filled in.
 */
export function TeamMeetingButton({ isCoach }: { isCoach: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return <>
    <button type="button" className="button button-outline" onClick={() => setOpen(true)}>{copy.open}</button>
    <Dialog open={open} disablePointerDismissal onOpenChange={next => { if (!next && !busy) setOpen(false) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg">{open && <TeamMeetingForm isCoach={isCoach} busy={busy} setBusy={setBusy} onDone={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  </>
}

function TeamMeetingForm({ isCoach, busy, setBusy, onDone }: { isCoach: boolean; busy: boolean; setBusy: (busy: boolean) => void; onDone: () => void }) {
  const id = useId()
  const navigate = useNavigate()
  const createSeries = useCreateSeries()
  const createEvent = useMutation(api.admin.createEvent)
  const [now] = useState(() => Date.now())
  const [draft, setDraft] = useState<TeamMeetingDraft>(() => teamMeetingDefaults(isCoach, now))
  // The first day tapped replaces the preset day (the meeting's own weekday), so picking another day is one tap; later taps add or remove days.
  const [daysTouched, setDaysTouched] = useState(false)
  const [issue, setIssue] = useState<PickerIssue | null>(null)
  const [error, setError] = useState('')
  const set = (change: Partial<TeamMeetingDraft>) => { setDraft(prior => ({ ...prior, ...change })); setIssue(null); setError('') }
  const days = audienceCopy.weekdays
  const fieldId = (field: string) => `${id}-${field}`
  const invalid = (field: string) => issue?.field === field || undefined
  // The first meeting even while something else is unfinished, so the season end label and the date limits stay right.
  const firstDate = teamMeetingFirstDate(draft, now) ?? teamMeetingStartDate(draft, now)
  const seasonEnd = seasonEndDate(firstDate)
  const endLimits = teamMeetingEndDateLimits(firstDate)
  // A chosen last date is checked as it changes, right under its input.
  const endIssue = teamMeetingEndIssue(draft, firstDate)
  const endErrorId = fieldId('end-date-error')
  // How many meetings Create makes and their range, once the sheet is complete.
  const preview = teamMeetingPlan(draft, now)
  const summary = isPlan(preview) ? teamMeetingSummary(preview) : null
  const pickDay = (day: Weekday) => { set({ weekdays: daysTouched ? toggleItem(draft.weekdays, day).sort((a, b) => a - b) : [day] }); setDaysTouched(true) }

  const submit = async () => {
    if (busy) return
    const current = teamMeetingPlan(draft, Date.now())
    if (!isPlan(current)) { setIssue(current); requestAnimationFrame(() => document.getElementById(fieldId(current.field))?.focus()); return }
    setBusy(true); setError('')
    try {
      const args = teamMeetingEventArgs(draft, isCoach, parseChicagoInput(current.start), parseChicagoInput(current.end))
      const eventId = current.repeat.repeats ? await createSeries(args, current.repeat, current.start) : await createEvent(args)
      toast.success(current.repeat.repeats ? copy.seriesCreated : copy.created)
      onDone()
      navigate(eventId ? `/events/${eventId}` : '/events')
    } catch (cause) { setError(userFacingError(cause)) } finally { setBusy(false) }
  }
  const moreOptions = () => { onDone(); navigate('/events/new', { state: { prefill: teamMeetingPrefill(draft, isCoach, Date.now()) } }) }

  return <form className={styles.stack} onSubmit={e => { e.preventDefault(); void submit() }}>
    <DialogTitle>{copy.title}</DialogTitle>
    <DialogDescription>{copy.where} · {draft.subteams.length ? draft.subteams.join(', ') : copy.who}</DialogDescription>
    <label className={styles.field} htmlFor={fieldId('name')}>{copy.name}
      <Input id={fieldId('name')} value={draft.name} maxLength={250} disabled={busy} aria-invalid={invalid('name')} onChange={e => set({ name: e.target.value })} />
    </label>
    <label className={styles.field} htmlFor={fieldId('date')}>{draft.repeats ? copy.startDate : copy.date}
      <Input id={fieldId('date')} type="date" value={draft.date} disabled={busy} aria-invalid={invalid('date')} onChange={e => set({ date: e.target.value })} />
    </label>
    <div className={setupStyles.fields}>
      <label className={styles.field} htmlFor={fieldId('starts')}>{copy.starts}<Input id={fieldId('starts')} type="time" value={draft.startTime} disabled={busy} aria-invalid={invalid('starts')} onChange={e => set({ startTime: e.target.value })} /></label>
      <label className={styles.field} htmlFor={fieldId('ends')}>{copy.ends}<Input id={fieldId('ends')} type="time" value={draft.endTime} disabled={busy} aria-invalid={invalid('ends')} onChange={e => set({ endTime: e.target.value })} /></label>
    </div>
    <fieldset className={styles.group} disabled={busy}>
      <legend>{copy.subteams}</legend>
      <div className={styles.chips}>
        {audienceSubteamOptions.map(subteam => <button key={subteam} type="button" className={styles.chip} aria-pressed={draft.subteams.includes(subteam)} onClick={() => set({ subteams: toggleItem(draft.subteams, subteam) })}>{subteam}</button>)}
      </div>
    </fieldset>
    {isCoach ? <fieldset className={styles.group} disabled={busy}>
      <legend>{copy.required}</legend>
      <div className={`${styles.choices} ${styles.inline}`}>
        <RadioChoice name={`${id}-required`} value="yes" checked={draft.required} label={copy.requiredYes} helper={audienceCopy.audience.requiredYes.helper} onSelect={() => set({ required: true })} />
        <RadioChoice name={`${id}-required`} value="no" checked={!draft.required} label={copy.requiredNo} helper={audienceCopy.audience.requiredNo.helper} onSelect={() => set({ required: false })} />
      </div>
    </fieldset> : <><p className={styles.hint}>{copy.optionalOnly}</p><p className={styles.hint}>{copy.coachOnlyRequired}</p></>}
    <p className={styles.hint}>{copy.summary}</p>
    <label className={styles.check} htmlFor={fieldId('repeat')}>
      <Checkbox id={fieldId('repeat')} checked={draft.repeats} disabled={busy} aria-describedby={fieldId('repeat-help')} onCheckedChange={checked => { set(checked ? teamMeetingRepeatOn(draft, now) : { repeats: false }); setDaysTouched(false) }} />
      <span>{copy.repeat}</span>
    </label>
    <p id={fieldId('repeat-help')} className={styles.hint}>{copy.repeatHelp}</p>
    {draft.repeats && <>
      <fieldset id={fieldId('days')} tabIndex={-1} className={styles.group} aria-invalid={invalid('days')} disabled={busy}>
        <legend>{copy.days}</legend>
        <div className={styles.chips}>
          {weekdays.map(day => <button key={day} type="button" className={styles.chip} aria-pressed={draft.weekdays.includes(day)} aria-label={days.long[day]} onClick={() => pickDay(day)}>{days.short[day]}</button>)}
        </div>
      </fieldset>
      {draft.weekdays.length > 0 && <p className={styles.count} aria-live="polite">{copy.first(previewDateLabel(firstDate))}</p>}
      <fieldset id={fieldId('repeat-ends')} tabIndex={-1} className={styles.group} aria-invalid={invalid('repeat-ends')} disabled={busy}>
        <legend>{copy.repeatEnds}</legend>
        <div className={styles.choices}>
          <RadioChoice name={`${id}-ends`} value="seasonEnd" checked={draft.ends === 'seasonEnd'} label={copy.seasonEnd(previewDateLabel(seasonEnd))} onSelect={() => set({ ends: 'seasonEnd' })} />
          <RadioChoice name={`${id}-ends`} value="onDate" checked={draft.ends === 'onDate'} label={copy.onDate} onSelect={() => set({ ends: 'onDate', endDate: draft.endDate || seasonEnd })} />
          {draft.ends === 'onDate' && <label className={`${styles.field} ${styles.endField}`} htmlFor={fieldId('end-date')}>{copy.endDate}
            <Input id={fieldId('end-date')} type="date" value={draft.endDate} min={endLimits.min} max={endLimits.max} aria-invalid={!!endIssue || invalid('end-date')} aria-describedby={endIssue ? endErrorId : undefined} onChange={e => set({ endDate: e.target.value })} />
            {endIssue && <span id={endErrorId} role="alert" className={styles.error}>{endIssue.message}</span>}
          </label>}
          <RadioChoice name={`${id}-ends`} value="afterCount" checked={draft.ends === 'afterCount'} label={copy.afterCount} onSelect={() => set({ ends: 'afterCount' })} />
          {draft.ends === 'afterCount' && <label className={`${styles.field} ${styles.endField}`} htmlFor={fieldId('count')}>{copy.count}
            <Input id={fieldId('count')} type="number" min="1" max={MAX_SERIES_MEETINGS} step="1" inputMode="numeric" value={draft.count > 0 ? String(draft.count) : ''} aria-invalid={invalid('count')} onChange={e => set({ count: e.target.value === '' ? 0 : Number(e.target.value) })} />
          </label>}
        </div>
      </fieldset>
    </>}
    {/* A chosen-date problem already shows under the date input. */}
    {issue && !(issue.field === 'end-date' && endIssue) && <p role="alert" className={styles.error}>{issue.message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {summary && <p className={styles.count} aria-live="polite">{summary}</p>}
    <div className={styles.actions}>
      <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>{copy.cancel}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={moreOptions}>{copy.moreOptions}</Button>
      <Button type="submit" disabled={busy}>{busy ? copy.creating : copy.create}</Button>
    </div>
  </form>
}
