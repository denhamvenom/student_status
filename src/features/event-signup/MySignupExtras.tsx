import { useState } from 'react'
import { cn } from 'cn'
import { dashboardButtonVariants } from '@/components/dashboard/styles'
import type { Id } from '../../../convex/_generated/dataModel'
import { signupCopy } from './copy'
import { shiftDay, shiftTimes } from './format'
import { shiftBounds, unansweredRequired } from './logic'
import { SignupWizard } from './SignupWizard'
import type { AnswerValue, EventShifts, SignupQuestions } from './types'
import { useSignupExtras } from './useSignupExtras'
import { offersShifts } from './wizard'
import { useLiveSignupSource } from './wizardSource'

const copy = signupCopy
type Participation = 'pending' | 'confirmed' | 'waitlist'
type Part = 'shifts' | 'answers'

const button = (tone: 'primary' | 'soft' | 'ghost') => cn(dashboardButtonVariants({ tone, size: 'md' }), 'w-full sm:w-auto')
const heading = 'm-0! text-[17px]! font-bold'
const savedNote = 'm-0 mt-2 text-[14px] font-semibold text-vs-success'
const closedNote = 'm-0 mt-2 text-[14px] text-vs-muted'

function answerText(value: AnswerValue | undefined) {
  if (value === undefined) return copy.questions.blank
  if (typeof value === 'boolean') return value ? copy.questions.yes : copy.questions.no
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function MyShifts({ shifts, participation, closed, saved, onChange, idPrefix }: { shifts: EventShifts; participation: Participation; closed: boolean; saved: boolean; onChange: () => void; idPrefix: string }) {
  const mine = shifts.shifts.filter(s => shifts.selectedShiftIds.includes(s.shiftId))
  return <section className="card" aria-labelledby={`${idPrefix}-shifts-title`}>
    <div className="card-head"><h2 id={`${idPrefix}-shifts-title`} className={heading}>{copy.shifts.myTitle}</h2>
      {participation !== 'waitlist' && !closed && <button type="button" onClick={onChange} className={dashboardButtonVariants({ tone: 'soft', size: 'md' })}>{copy.shifts.change}</button>}
    </div>
    {participation === 'waitlist' ? <p className="m-0 text-[15px] text-vs-text-2">{copy.shifts.waitlist}</p>
      : mine.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {mine.map(s => <li key={s.shiftId} className="rounded-inset border border-vs-border-subtle bg-vs-inset px-3.5 py-2.5">
          <span className="block text-[15px] font-bold text-vs-text">{shiftDay(s.startsAt)} · {shiftTimes(s)}</span>
          {s.label && <span className="block text-[14px] text-vs-text-2">{s.label}</span>}
        </li>)}
      </ul>
        : <p className="m-0 text-[15px] text-vs-text-2">{copy.shifts.none}</p>}
    {saved && <p role="status" className={savedNote}>{copy.shifts.saved}</p>}
    {closed && <p className={closedNote}>{copy.form.closed}</p>}
  </section>
}

function MyAnswers({ data, closed, saved, onEdit, idPrefix }: { data: SignupQuestions; closed: boolean; saved: boolean; onEdit: () => void; idPrefix: string }) {
  return <section className="card" aria-labelledby={`${idPrefix}-answers-title`}>
    <div className="card-head"><h2 id={`${idPrefix}-answers-title`} className={heading}>{copy.questions.myTitle}</h2>
      {!closed && <button type="button" onClick={onEdit} className={dashboardButtonVariants({ tone: 'soft', size: 'md' })}>{copy.questions.edit}</button>}
    </div>
    <dl className="m-0 flex flex-col">
      {data.questions.map(q => {
        const value = data.answers.find(a => a.questionId === q.questionId)?.value
        return <div key={q.questionId} className="flex flex-col gap-0.5 border-b border-vs-border-subtle py-2.5 last:border-b-0">
          <dt className="text-[14px] text-vs-muted">{q.prompt}</dt>
          <dd className={cn('m-0 text-[15px] font-semibold', value === undefined && q.required ? 'text-vs-urgent' : 'text-vs-text')}>{answerText(value)}</dd>
        </div>
      })}
    </dl>
    {saved && <p role="status" className={savedNote}>{copy.questions.saved}</p>}
    {closed && <p className={closedNote}>{copy.form.closed}</p>}
  </section>
}

/**
 * The event page for a signed-up Student (including Coach-assigned events): their shifts with Change, their answers
 * with Edit, and a To do when required answers or shifts are missing. Change and Edit open the signup wizard at that
 * step; it saves with setMyShifts/saveMyAnswers. Shows nothing when the event has neither.
 */
export function MySignupExtras({ eventId, eventName, participation }: { eventId: Id<'events'>; eventName: string; participation: Participation }) {
  const extras = useSignupExtras(eventId, { questions: true, shifts: true })
  const source = useLiveSignupSource()
  const [editing, setEditing] = useState<Part | null>(null)
  // Which wizard is open stays set while it closes, so its content doesn't swap mid-animation.
  const [start, setStart] = useState<Part>('shifts')
  const [saved, setSaved] = useState<{ shifts: boolean; answers: boolean }>({ shifts: false, answers: false })
  // Queries can't read the clock, so the page decides whether signup has closed (as signUp's close check does).
  const [now] = useState(Date.now)
  if (extras === undefined) return null
  if (extras instanceof Error) return <section className="card"><p role="alert" className="m-0 text-[15px] text-vs-text-2">{copy.form.loadFailed}</p></section>
  const questions = extras.questions?.questions.length ? extras.questions : null
  const shifts = extras.shifts && offersShifts(extras) ? extras.shifts : null
  if (!questions && !shifts) return null
  const closesAt = extras.shifts?.signupClosesAt ?? null
  const closed = closesAt !== null && now > closesAt
  const unanswered = questions ? unansweredRequired(questions.questions, questions.answers) : []
  const shiftsShort = shifts && participation !== 'waitlist' ? Math.max(0, shiftBounds(shifts, shifts.shifts.length).min - shifts.selectedShiftIds.length) : 0
  const idPrefix = `my-signup-${eventId}`
  const open = (part: Part) => { setSaved({ shifts: false, answers: false }); setStart(part); setEditing(part) }
  const todo: { key: Part; text: string; action: string }[] = []
  if (shiftsShort > 0) todo.push({ key: 'shifts', text: copy.todo.pick(shiftsShort), action: copy.shifts.change })
  if (unanswered.length > 0) todo.push({ key: 'answers', text: copy.todo.answer(unanswered.length), action: copy.questions.edit })
  return <div className="flex flex-col gap-4" id="my-signup">
    {todo.length > 0 && <section className="card border-vs-urgent-border!" aria-labelledby={`${idPrefix}-todo`}>
      <div className="card-head"><h2 id={`${idPrefix}-todo`} className={heading}>{copy.todo.title}</h2></div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {todo.map(item => <li key={item.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[15px] font-semibold text-vs-urgent">{item.text}</span>
          {!closed && <button type="button" onClick={() => open(item.key)} className={button('primary')}>{item.action}</button>}
        </li>)}
      </ul>
      {closed && <p className={closedNote}>{copy.form.closed}</p>}
    </section>}
    {shifts && <MyShifts shifts={shifts} participation={participation} closed={closed} saved={saved.shifts} onChange={() => open('shifts')} idPrefix={idPrefix} />}
    {questions && <MyAnswers data={questions} closed={closed} saved={saved.answers} onEdit={() => open('answers')} idPrefix={idPrefix} />}
    <SignupWizard eventId={eventId} eventName={eventName} open={editing !== null} onOpenChange={next => { if (!next) setEditing(null) }}
      mode={{ kind: 'edit', start, waitlisted: participation === 'waitlist' }} source={source} onSaved={setSaved} />
  </div>
}
