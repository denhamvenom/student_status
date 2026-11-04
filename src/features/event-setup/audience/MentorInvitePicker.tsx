import { subteamDisplay } from '@/lib/subteams'
import { useId } from 'react'
import { Checkbox } from '../../../components/ui/checkbox'
import { audienceCopy } from './audience-copy'
import { mentorCountText, toggleItem } from './audience-rules'
import styles from './Audience.module.css'
import type { AudienceValue, MentorInviteValue, MentorOption, PickerIssue } from './types'

type Props = {
  value: MentorInviteValue
  onChange: (value: MentorInviteValue) => void
  mentors: readonly MentorOption[]
  /** The event's audience: Mentors only makes at least one mentor required; Subteams offers subteam mentors. */
  audience: AudienceValue
  /** Issue from mentorInviteIssue, shown once the user tries to continue. */
  issue?: PickerIssue | null
  /** Id prefix; `${id}-mentors` is the group to focus for an issue. */
  id?: string
}

/** Optional mentor invites; required (at least one) for a Mentors only event. */
export function MentorInvitePicker({ value, onChange, mentors, audience, issue, id: givenId }: Props) {
  const copy = audienceCopy.mentors
  const autoId = useId()
  const id = givenId ?? autoId
  const required = audience.kind === 'mentors'
  const countText = mentorCountText(value, mentors, audience)
  const describedBy = [`${id}-hint`, `${id}-count`, issue ? `${id}-error` : ''].filter(Boolean).join(' ')

  return <fieldset id={`${id}-mentors`} tabIndex={-1} className={styles.group} aria-invalid={issue ? true : undefined} aria-required={required || undefined} aria-describedby={describedBy}>
    <legend>{required ? copy.legendRequired : copy.legendOptional}</legend>
    <p id={`${id}-hint`} className={styles.hint}>{copy.hint}</p>
    {audience.kind === 'subteams' && <label className={styles.check}>
      <Checkbox checked={value.includeSubteamMentors} onCheckedChange={checked => onChange({ ...value, includeSubteamMentors: checked })} />
      {copy.includeSubteam}
    </label>}
    {!mentors.length ? <p className={styles.hint}>{copy.noMentors}</p> : <ul className={styles.checklist}>
      {mentors.map(mentor => <li key={mentor.id}><label className={styles.check}>
        <Checkbox checked={value.mentorIds.includes(mentor.id)} onCheckedChange={() => onChange({ ...value, mentorIds: toggleItem(value.mentorIds, mentor.id) })} />
        <span>{mentor.name}</span>{mentor.subteams.length > 0 && <span className={styles.checkMeta}>{mentor.subteams.map(subteamDisplay).join(', ')}</span>}
      </label></li>)}
    </ul>}
    <p id={`${id}-count`} className={styles.count} aria-live="polite">{countText}</p>
    {issue && <p id={`${id}-error`} role="alert" className={styles.error}>{issue.message}</p>}
  </fieldset>
}
