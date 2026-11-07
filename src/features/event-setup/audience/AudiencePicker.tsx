import { subteamDisplay } from '@/lib/subteams'
import { useId, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Checkbox } from '../../../components/ui/checkbox'
import { Input } from '../../../components/ui/input'
import { audienceCopy } from './audience-copy'
import { audienceKinds, audienceSubteamOptions, changeAudienceKind, filterStudents, requiredApplies, requiredLocked, toggleItem } from './audience-rules'
import styles from './Audience.module.css'
import { RadioChoice } from './RadioChoice'
import type { AudienceValue, PickerIssue, StudentOption } from './types'

type Props = {
  value: AudienceValue
  onChange: (value: AudienceValue) => void
  students: readonly StudentOption[]
  /** False for a Travel Lead: only the Coach can make Everyone / Subteams events required. */
  canAutoAssign: boolean
  /** Issue from audienceIssue, shown once the user tries to continue. */
  issue?: PickerIssue | null
  /** Id prefix; focus `${id}-${issue.field}` to move to the problem. */
  id?: string
  /** The Coach's one-tap Travel Team, shown as the first choice beside Everyone. Choosing any other kind calls onChange. */
  travelTeam?: { selected: boolean; label: string; helper: string; onSelect: () => void }
  /** A Mentor's meeting is always optional: the Required question is replaced by this note. */
  optionalOnly?: string
}

/** Who an event is for, and whether that group is signed up automatically. */
export function AudiencePicker({ value, onChange, students, canAutoAssign, issue, id: givenId, travelTeam, optionalOnly }: Props) {
  const copy = audienceCopy.audience
  const autoId = useId()
  const id = givenId ?? autoId
  const [search, setSearch] = useState('')
  const locked = requiredLocked(value.kind, canAutoAssign)
  const shown = filterStudents(students, search)
  const errorId = `${id}-error`
  const invalid = (field: string) => issue?.field === field
  const set = (change: Partial<AudienceValue>) => onChange({ ...value, ...change })
  const group = !travelTeam?.selected

  return <div className={styles.stack}>
    <fieldset className={styles.group}>
      <legend>{copy.legend}</legend>
      <div className={styles.choices}>
        {travelTeam && <RadioChoice name={`${id}-kind`} value="travelTeam" checked={travelTeam.selected} label={travelTeam.label} helper={travelTeam.helper} onSelect={travelTeam.onSelect} />}
        {audienceKinds.map(kind => <RadioChoice key={kind} name={`${id}-kind`} value={kind} checked={group && value.kind === kind} label={copy.kinds[kind].label} helper={copy.kinds[kind].helper} onSelect={() => onChange(changeAudienceKind(value, kind, canAutoAssign))} />)}
      </div>
    </fieldset>

    {group && value.kind === 'subteams' && <fieldset id={`${id}-subteams`} tabIndex={-1} className={styles.sub} aria-invalid={invalid('subteams') || undefined} aria-describedby={`${id}-subteams-count${invalid('subteams') ? ` ${errorId}` : ''}`}>
      <legend>{copy.subteamsLegend}</legend>
      <div className={styles.chips}>
        {audienceSubteamOptions.map(subteam => <button key={subteam} type="button" className={styles.chip} aria-pressed={value.subteams.includes(subteam)} onClick={() => set({ subteams: toggleItem(value.subteams, subteam) })}>{subteam}</button>)}
      </div>
      <p id={`${id}-subteams-count`} className={styles.hint} aria-live="polite">{copy.subteamsChosen(value.subteams.length)}</p>
    </fieldset>}

    {group && value.kind === 'students' && <fieldset className={styles.sub} aria-invalid={invalid('students') || undefined}>
      <legend>{copy.studentsLegend}</legend>
      <label className={styles.field} htmlFor={`${id}-students`}>{copy.search}</label>
      <Input id={`${id}-students`} type="search" value={search} autoComplete="off" aria-describedby={`${id}-search-hint ${id}-students-count${invalid('students') ? ` ${errorId}` : ''}`} aria-controls={`${id}-student-list`} onChange={e => setSearch(e.target.value)} />
      <p id={`${id}-search-hint`} className={styles.hint}>{copy.searchHint}</p>
      <div className={styles.row}>
        <p id={`${id}-students-count`} className={styles.count} aria-live="polite">{copy.studentsChosen(value.studentIds.length)}</p>
        {value.studentIds.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => set({ studentIds: [] })}>{copy.clearStudents}</Button>}
      </div>
      {!students.length ? <p className={styles.hint}>{copy.noStudents}</p> : !shown.length ? <p className={styles.hint} role="status">{copy.noMatches(search.trim())}</p> : <ul id={`${id}-student-list`} className={styles.checklist}>
        {shown.map(student => <li key={student.id}><label className={styles.check}>
          <Checkbox checked={value.studentIds.includes(student.id)} onCheckedChange={() => set({ studentIds: toggleItem(value.studentIds, student.id) })} />
          <span>{student.name}</span><span className={styles.checkMeta}>{subteamDisplay(student.subteam)}</span>
        </label></li>)}
      </ul>}
    </fieldset>}

    {/* A Travel Lead can't make a group required, so the question would only show a disabled Yes: say what happens instead. */}
    {group && requiredApplies(value.kind) && optionalOnly !== undefined && <p id={`${id}-required`} tabIndex={-1} className={styles.hint}>{optionalOnly}</p>}
    {group && requiredApplies(value.kind) && optionalOnly === undefined && locked && !value.required && <p id={`${id}-required`} tabIndex={-1} className={styles.hint}>{copy.optionalOnly}</p>}
    {group && requiredApplies(value.kind) && optionalOnly === undefined && (!locked || value.required) && <fieldset id={`${id}-required`} tabIndex={-1} className={styles.group} aria-invalid={invalid('required') || undefined} aria-describedby={locked ? `${id}-locked` : undefined}>
      <legend>{copy.requiredLegend}</legend>
      <div className={`${styles.choices} ${styles.inline}`}>
        <RadioChoice name={`${id}-required`} value="yes" checked={value.required} disabled={locked} label={copy.requiredYes.label} helper={locked ? <span id={`${id}-locked`}>{copy.coachOnly}</span> : copy.requiredYes.helper} onSelect={() => set({ required: true })} />
        <RadioChoice name={`${id}-required`} value="no" checked={!value.required} label={copy.requiredNo.label} helper={copy.requiredNo.helper} onSelect={() => set({ required: false })} />
      </div>
    </fieldset>}

    {issue && <p id={errorId} role="alert" className={styles.error}>{issue.message}</p>}
  </div>
}
