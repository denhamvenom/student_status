import { statusLabel } from '@/lib/ui-copy'
import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { eventSetupCopy } from '../../copy/event-setup-copy'
import operationsStyles from '../operations/Operations.module.css'
import styles from './EventSetup.module.css'
import { byMostOpen, openSpots, shiftName, shiftTime } from './shift-plan'
import { answerText, downloadCsv, questionHeading, responsesFilename, signupResponsesCsv } from './signup-csv'

/** Coach / Travel Lead view of signup answers and the shift roster, with a CSV download of both. */
export function SignupResponses({ eventId, eventName, usesShifts }: { eventId: Id<'events'>; eventName: string; usesShifts: boolean }) {
  const copy = eventSetupCopy.responses
  const data = useQuery(api.eventQuestions.responses, { eventId })
  const roster = useQuery(api.eventShifts.roster, usesShifts ? { eventId } : 'skip')
  const [sort, setSort] = useState<'time' | 'open'>('time')
  const loading = !data || (usesShifts && !roster)

  const shiftsByStudent = useMemo(() => {
    if (!usesShifts || !roster) return null
    const byStudent = new Map<string, string[]>()
    for (const shift of roster.shifts) for (const student of shift.students) byStudent.set(student.studentId, [...(byStudent.get(student.studentId) ?? []), shiftName(shift)])
    return byStudent
  }, [usesShifts, roster])

  const download = () => {
    if (!data) return
    downloadCsv(responsesFilename(eventName), signupResponsesCsv(data.questions, data.rows, shiftsByStudent))
  }

  return <details id="event-responses" className={operationsStyles.disclosure}><summary><strong>{copy.title}</strong><span>{data ? copy.summary(data.rows.length) : copy.loading}</span></summary><div className={operationsStyles.disclosureBody}><Card><CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader><CardContent className={styles.stack}>
    <div className={styles.formActions}><Button variant="outline" disabled={loading} onClick={download}>{copy.download}</Button></div>
    {!data ? <p role="status">{copy.loading}</p> : <>
      <h3>{copy.answersTitle}</h3>
      {data.rows.length === 0 ? <p className="muted">{copy.noStudents}</p> : data.questions.length === 0 ? <p className="muted">{copy.noQuestions}</p> : <div className="table-wrap"><table className={styles.answers}>
        <thead><tr><th scope="col">{copy.student}</th><th scope="col">{copy.status}</th>{shiftsByStudent && <th scope="col">{copy.csvShifts}</th>}{data.questions.map(q => <th scope="col" key={q.questionId}>{questionHeading(q)}</th>)}</tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.studentId}>
          <td data-label={copy.student}><strong>{row.name}</strong></td>
          <td data-label={copy.status}>{statusLabel(row.status)}</td>
          {shiftsByStudent && <td data-label={copy.csvShifts}>{shiftsByStudent.get(row.studentId)?.join('\n') || copy.blank}</td>}
          {data.questions.map(q => <td key={q.questionId} data-label={questionHeading(q)}>{answerText(row.answers.find(a => a.questionId === q.questionId)?.value) || copy.blank}</td>)}
        </tr>)}</tbody>
      </table></div>}
    </>}
    {usesShifts && <>
      <h3>{copy.rosterTitle}</h3>
      {!roster ? <p role="status">{copy.loading}</p> : <>
        {roster.shifts.length > 1 && <label className={styles.hint}>{copy.sortLabel} <NativeSelect value={sort} onChange={e => setSort(e.target.value === 'open' ? 'open' : 'time')}><NativeSelectOption value="time">{copy.sortTime}</NativeSelectOption><NativeSelectOption value="open">{copy.sortOpen}</NativeSelectOption></NativeSelect></label>}
        <div className={styles.rosterGrid}>{(sort === 'open' ? byMostOpen(roster.shifts) : roster.shifts).map(shift => <section className={styles.rosterCard} key={shift.shiftId} aria-label={shiftName(shift)}>
          <h4>{shift.label ?? shiftTime(shift.startsAt, shift.endsAt)}{shift.outsideEvent && <> <Badge variant="destructive" title={eventSetupCopy.shifts.outsideEventHint}>{eventSetupCopy.shifts.outsideEvent}</Badge></>}</h4>
          <p>{shift.label ? `${shiftTime(shift.startsAt, shift.endsAt)} · ` : ''}{eventSetupCopy.shifts.filled(shift.students.length, shift.capacity)}{(openSpots(shift) ?? 0) > 0 && <> · <Badge variant="outline">{copy.needsMore(openSpots(shift) ?? 0)}</Badge></>}</p>
          {shift.students.length ? <ul>{shift.students.map(s => <li key={s.studentId}>{s.name}</li>)}</ul> : <p>{copy.nobody}</p>}
        </section>)}</div>
        <h3>{copy.needsTitle}</h3>
        {roster.needsShifts.length === 0 ? <p className="muted">{data && data.rows.length === 0 ? copy.nobodySignedUp : copy.needsNone}</p> : <ul>{roster.needsShifts.map(s => <li key={s.studentId}>{s.name} · {copy.needsCount(s.shiftCount)}</li>)}</ul>}
      </>}
    </>}
  </CardContent></Card></div></details>
}
