import { cn } from 'cn'
import { focusRing } from '@/components/dashboard/styles'
import type { Id } from '../../../convex/_generated/dataModel'
import { signupCopy } from './copy'
import type { AnswerDraft } from './logic'
import type { SignupQuestion } from './types'

const copy = signupCopy.questions
type QuestionId = Id<'eventQuestions'>
export type Drafts = Partial<Record<QuestionId, AnswerDraft>>

const choiceCard = 'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-inset border-2 border-vs-border bg-vs-card px-3.5 py-2 text-[15px] text-vs-text has-[:checked]:border-vs-accent-text has-[:checked]:bg-vs-inset-raised has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-vs-accent-text'
const textField = cn('w-full rounded-inset border-2 border-vs-border bg-vs-card px-3 py-2.5 text-[16px] text-vs-text aria-[invalid=true]:border-vs-urgent-border', focusRing)

function Field({ question, draft, issue, onChange, idPrefix }: { question: SignupQuestion; draft: AnswerDraft; issue: string | undefined; onChange: (draft: AnswerDraft) => void; idPrefix: string }) {
  const id = `${idPrefix}-${question.questionId}`, errorId = `${id}-error`
  const invalid = issue ? { 'aria-invalid': true, 'aria-describedby': errorId } as const : {}
  const choices = (options: string[], multi: boolean) => <div className="flex flex-col gap-2">
    {options.map(option => {
      const checked = multi ? Array.isArray(draft) && draft.includes(option) : draft === option
      return <label key={option} className={choiceCard}>
        <input type={multi ? 'checkbox' : 'radio'} name={id} className="size-5 shrink-0 accent-vs-accent-text" checked={checked}
          onChange={() => onChange(multi ? (checked ? (draft as string[]).filter(x => x !== option) : [...(Array.isArray(draft) ? draft : []), option]) : option)} />
        <span>{option}</span>
      </label>
    })}
  </div>
  const body = (() => {
    switch (question.kind) {
      case 'singleChoice': return choices(question.options ?? [], false)
      case 'multiChoice': return choices(question.options ?? [], true)
      case 'yesNo': return <div className="grid grid-cols-2 gap-2">
        {([true, false] as const).map(value => <label key={String(value)} className={cn(choiceCard, 'justify-center font-bold')}>
          <input type="radio" name={id} className="sr-only" checked={draft === value} onChange={() => onChange(value)} />{value ? copy.yes : copy.no}
        </label>)}
      </div>
      case 'longText': return <textarea id={id} rows={3} className={textField} value={typeof draft === 'string' ? draft : ''} onChange={e => onChange(e.target.value)} {...invalid} />
      case 'number': return <input id={id} type="text" inputMode="decimal" className={textField} value={typeof draft === 'string' ? draft : ''} onChange={e => onChange(e.target.value)} {...invalid} />
      default: return <input id={id} type="text" className={textField} value={typeof draft === 'string' ? draft : ''} onChange={e => onChange(e.target.value)} {...invalid} />
    }
  })()
  const grouped = question.kind === 'singleChoice' || question.kind === 'multiChoice' || question.kind === 'yesNo'
  const prompt = <span className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-vs-text">
    {question.prompt}
    <span className={cn('text-[12px] font-bold uppercase tracking-[0.05em]', question.required ? 'text-vs-urgent' : 'text-vs-muted')}>{question.required ? copy.required : copy.optional}</span>
  </span>
  const error = issue && <p id={errorId} className="m-0 text-[14px] font-semibold text-vs-urgent">{issue}</p>
  return grouped
    ? <fieldset id={id} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" aria-describedby={issue ? errorId : undefined}><legend className="mb-2 p-0">{prompt}</legend>{body}{error}</fieldset>
    : <div className="flex flex-col gap-2"><label htmlFor={id}>{prompt}</label>{body}{error}</div>
}

/** The event's questions as big, phone-friendly fields. Required ones are marked; problems show under each field. */
export function QuestionFields({ questions, drafts, issues, onChange, idPrefix, title = copy.title }: {
  questions: SignupQuestion[]
  drafts: Drafts
  issues: Partial<Record<QuestionId, string>>
  onChange: (questionId: QuestionId, draft: AnswerDraft) => void
  idPrefix: string
  title?: string | null
}) {
  return <div className="flex flex-col gap-5">
    {title && <h3 className="m-0! text-[17px]! font-bold text-vs-heading">{title}</h3>}
    {questions.map(question => <Field key={question.questionId} question={question} draft={drafts[question.questionId] ?? null} issue={issues[question.questionId]}
      onChange={draft => onChange(question.questionId, draft)} idPrefix={idPrefix} />)}
  </div>
}
