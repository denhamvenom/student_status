import { useId } from 'react'
import { Input } from '../../../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../../components/ui/native-select'
import { audienceCopy } from './audience-copy'
import { toggleItem } from './audience-rules'
import styles from './Audience.module.css'
import { RadioChoice } from './RadioChoice'
import { intervalOptions, MAX_SERIES_MEETINGS, previewDateLabel, repeatPreview, weekdayOf, weekdays } from './repeat'
import type { PickerIssue, RepeatValue, Weekday } from './types'

type Props = {
  value: RepeatValue
  onChange: (value: RepeatValue) => void
  /** First date of the event, YYYY-MM-DD (the date part of the start input). */
  startDate: string
  /** Issue from repeatIssue, shown once the user tries to continue. */
  issue?: PickerIssue | null
  /** Id prefix; focus `${id}-${issue.field}` to move to the problem. */
  id?: string
  /** Team meetings: "One time" / "Repeat this meeting" with helper text instead of "Does not repeat" / "Repeats weekly". */
  meeting?: boolean
}

/** "Does not repeat" (or "One time") by default; otherwise every N weeks on chosen days, until a date or a number of meetings. */
export function RepeatPicker({ value, onChange, startDate, issue, id: givenId, meeting = false }: Props) {
  const copy = audienceCopy.repeat
  const choice = meeting ? copy.meeting : { legend: copy.legend, none: copy.none, noneHelp: undefined, weekly: copy.weekly, weeklyHelp: undefined }
  const days = audienceCopy.weekdays
  const autoId = useId()
  const id = givenId ?? autoId
  const set = (change: Partial<RepeatValue>) => onChange({ ...value, ...change })
  const startDay = weekdayOf(startDate)
  const preview = repeatPreview(startDate, value)
  const errorId = issue ? `${id}-error` : undefined
  const invalid = (field: string) => issue?.field === field || undefined
  const turnOn = () => set({ repeats: true, weekdays: value.weekdays.length || startDay === null ? value.weekdays : [startDay] })
  const sortedToggle = (day: Weekday) => toggleItem(value.weekdays, day).sort((a, b) => a - b)

  return <div className={styles.stack}>
    <fieldset className={styles.group}>
      <legend>{choice.legend}</legend>
      <div className={`${styles.choices} ${styles.inline}`}>
        <RadioChoice name={`${id}-repeats`} value="no" checked={!value.repeats} label={choice.none} helper={choice.noneHelp} onSelect={() => set({ repeats: false })} />
        <RadioChoice name={`${id}-repeats`} value="yes" checked={value.repeats} label={choice.weekly} helper={choice.weeklyHelp} onSelect={turnOn} />
      </div>
    </fieldset>

    {value.repeats && <>
      <label className={styles.field} htmlFor={`${id}-interval`}>{copy.every}
        <NativeSelect id={`${id}-interval`} value={String(value.intervalWeeks)} aria-invalid={invalid('interval')} aria-describedby={invalid('interval') && errorId} onChange={e => set({ intervalWeeks: Number(e.target.value) })}>
          {intervalOptions.map(weeks => <NativeSelectOption key={weeks} value={String(weeks)}>{copy.everyOption(weeks)}</NativeSelectOption>)}
        </NativeSelect>
      </label>

      <fieldset id={`${id}-days`} tabIndex={-1} className={styles.group} aria-invalid={invalid('days')} aria-describedby={invalid('days') && errorId}>
        <legend>{copy.daysLegend}</legend>
        <div className={styles.chips}>
          {weekdays.map(day => <button key={day} type="button" className={styles.chip} aria-pressed={value.weekdays.includes(day)} aria-label={days.long[day]} onClick={() => set({ weekdays: sortedToggle(day) })}>{days.short[day]}</button>)}
        </div>
        {startDay !== null && value.weekdays.length > 0 && !value.weekdays.includes(startDay) && preview.next[0] && <p className={styles.hint}>{copy.startSkipped(previewDateLabel(preview.next[0]))}</p>}
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{copy.endsLegend}</legend>
        <div className={styles.choices}>
          <RadioChoice name={`${id}-ends`} value="onDate" checked={value.ends === 'onDate'} label={copy.onDate} onSelect={() => set({ ends: 'onDate' })} />
          {value.ends === 'onDate' && <label className={`${styles.field} ${styles.endField}`} htmlFor={`${id}-end-date`}>{copy.endDate}
            <Input id={`${id}-end-date`} type="date" value={value.endDate} min={startDate || undefined} aria-invalid={invalid('end-date')} aria-describedby={invalid('end-date') && errorId} onChange={e => set({ endDate: e.target.value })} />
          </label>}
          <RadioChoice name={`${id}-ends`} value="afterCount" checked={value.ends === 'afterCount'} label={copy.afterCount} onSelect={() => set({ ends: 'afterCount' })} />
          {value.ends === 'afterCount' && <label className={`${styles.field} ${styles.endField}`} htmlFor={`${id}-count`}>{copy.count}
            <Input id={`${id}-count`} type="number" min="1" max={MAX_SERIES_MEETINGS} step="1" inputMode="numeric" value={Number.isFinite(value.count) && value.count > 0 ? String(value.count) : ''} aria-invalid={invalid('count')} aria-describedby={invalid('count') && errorId} onChange={e => set({ count: e.target.value === '' ? 0 : Number(e.target.value) })} />
          </label>}
        </div>
      </fieldset>

      <section className={styles.sub} aria-labelledby={`${id}-preview-title`}>
        <h3 id={`${id}-preview-title`} className={styles.count}>{copy.previewTitle}</h3>
        <div aria-live="polite">
          {preview.next.length ? <ol className={styles.preview}>{preview.next.map(date => <li key={date}>{previewDateLabel(date)}</li>)}</ol> : <p className={styles.hint}>{copy.previewEmpty}</p>}
          {preview.total > 0 && <p className={styles.hint}>{copy.total(preview.total, preview.capped)}</p>}
        </div>
      </section>
    </>}

    {issue && <p id={errorId} role="alert" className={styles.error}>{issue.message}</p>}
  </div>
}
