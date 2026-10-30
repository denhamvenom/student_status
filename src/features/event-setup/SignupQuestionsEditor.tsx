import { userFacingError } from '@/lib/error-message'
import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import type { QuestionKind } from '../../../convex/lib/eventSignupExtras'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import { Textarea } from '../../components/ui/textarea'
import { ConfirmAction } from '../../ConfirmAction'
import { eventSetupCopy, questionKindLabels } from '../../copy/event-setup-copy'
import operationsStyles from '../operations/Operations.module.css'
import styles from './EventSetup.module.css'

type Draft = { questionId: Id<'eventQuestions'> | null; kind: QuestionKind; prompt: string; options: string[]; required: boolean; locked: boolean }
const blank: Draft = { questionId: null, kind: 'singleChoice', prompt: '', options: ['', ''], required: true, locked: false }
const choice = (kind: QuestionKind) => kind === 'singleChoice' || kind === 'multiChoice'
const kinds = Object.keys(questionKindLabels) as QuestionKind[]

/** Coach / Travel Lead editor for the questions students answer when they sign up. */
export function SignupQuestionsEditor({ eventId, questionCount }: { eventId: Id<'events'>; questionCount: number }) {
  const copy = eventSetupCopy.questions
  const data = useQuery(api.eventQuestions.responses, { eventId })
  const save = useMutation(api.eventQuestions.saveQuestion)
  const remove = useMutation(api.eventQuestions.removeQuestion)
  const reorder = useMutation(api.eventQuestions.reorderQuestions)
  const [draft, setDraft] = useState<Draft>(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const id = useId()

  async function act(fn: () => Promise<string | void>, message: string) {
    setBusy(true); setError(''); setSuccess('')
    try { setSuccess((await fn()) || message) } catch (e) { setError(userFacingError(e)) } finally { setBusy(false) }
  }
  const questions = data?.questions.filter(q => !q.archived) ?? []
  const answerCount = (questionId: string) => data?.rows.filter(r => r.answers.some(a => a.questionId === questionId)).length ?? 0
  const update = (change: Partial<Draft>) => setDraft(prior => ({ ...prior, ...change }))
  const setKind = (kind: QuestionKind) => update({ kind, options: choice(kind) && draft.options.length < 2 ? ['', ''] : draft.options })
  const move = (index: number, by: -1 | 1) => {
    const ids = questions.map(q => q.questionId)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    void act(async () => { await reorder({ eventId, questionIds: ids }) }, copy.reordered)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const editing = draft.questionId
    void act(async () => {
      await save({ eventId, ...(editing ? { questionId: editing } : {}), kind: draft.kind, prompt: draft.prompt, ...(choice(draft.kind) ? { options: draft.options } : {}), required: draft.required })
      setDraft(blank)
    }, editing ? copy.saved : copy.added)
  }
  const summary = copy.summary(data ? questions.length : questionCount)

  return <details id="event-questions" className={operationsStyles.disclosure}><summary><strong>{copy.title}</strong><span>{summary}</span></summary><div className={operationsStyles.disclosureBody}><Card><CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader><CardContent className={styles.stack}>
    <p className={styles.intro}>{copy.intro}</p>
    <p className={styles.hint}>{copy.healthNote}</p>
    {!data ? <p role="status">{copy.loading}</p> : questions.length === 0 ? <p className="muted">{copy.none}</p> : <ol className={`${operationsStyles.sectionRows} ${styles.list}`}>{questions.map((q, i) => {
      const answers = answerCount(q.questionId)
      return <li className={operationsStyles.sectionRow} key={q.questionId}>
        <span>{i + 1}. {q.prompt}<span className={styles.itemMeta}>{questionKindLabels[q.kind]} · {q.required ? copy.required : copy.optional}{q.options ? ` · ${q.options.join(', ')}` : ''}{answers ? ` · ${copy.answered(answers)}` : ''}</span></span>
        <span className={styles.itemActions}>
          <Button variant="outline" disabled={busy || i === 0} aria-label={copy.moveUp(q.prompt)} onClick={() => move(i, -1)}>{copy.up}</Button>
          <Button variant="outline" disabled={busy || i === questions.length - 1} aria-label={copy.moveDown(q.prompt)} onClick={() => move(i, 1)}>{copy.down}</Button>
          <Button variant="outline" disabled={busy} onClick={() => { setError(''); setSuccess(''); setDraft({ questionId: q.questionId, kind: q.kind, prompt: q.prompt, options: q.options ?? ['', ''], required: q.required, locked: answers > 0 }); document.getElementById(`${id}-prompt`)?.focus() }}>{copy.edit}</Button>
          {answers > 0
            ? <ConfirmAction disabled={busy} description={copy.removeConfirm(q.prompt)} onConfirm={async () => { await remove({ questionId: q.questionId }); if (draft.questionId === q.questionId) setDraft(blank); setError(''); setSuccess(copy.archived) }}>{copy.remove}</ConfirmAction>
            : <Button variant="outline" disabled={busy} onClick={() => void act(async () => { const result = await remove({ questionId: q.questionId }); if (draft.questionId === q.questionId) setDraft(blank); return result === 'archived' ? copy.archived : copy.deleted }, copy.deleted)}>{copy.remove}</Button>}
        </span>
      </li>
    })}</ol>}
    <form className={styles.panel} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{draft.questionId ? copy.editTitle : copy.addTitle}</h3>
      {draft.locked && <p className={styles.locked}>{copy.locked}</p>}
      <label>{copy.kind}<NativeSelect value={draft.kind} disabled={draft.locked} onChange={e => setKind(e.target.value as QuestionKind)}>{kinds.map(kind => <NativeSelectOption key={kind} value={kind}>{questionKindLabels[kind]}</NativeSelectOption>)}</NativeSelect></label>
      <label>{copy.prompt}<Textarea id={`${id}-prompt`} value={draft.prompt} maxLength={300} rows={2} placeholder={copy.promptPlaceholder} onChange={e => update({ prompt: e.target.value })} required /></label>
      {choice(draft.kind) && <fieldset className={styles.options} disabled={draft.locked} aria-describedby={`${id}-options-hint`}>
        <legend>{copy.options}</legend>
        {draft.options.map((option, i) => <div className={styles.optionRow} key={i}>
          <Input aria-label={copy.option(i + 1)} value={option} maxLength={100} onChange={e => update({ options: draft.options.map((o, j) => j === i ? e.target.value : o) })} required />
          <Button type="button" variant="outline" disabled={draft.locked || draft.options.length <= 2} aria-label={copy.removeOption(i + 1)} onClick={() => update({ options: draft.options.filter((_, j) => j !== i) })}>×</Button>
        </div>)}
        <p id={`${id}-options-hint`} className={styles.hint}>{copy.optionsHint}</p>
        <div><Button type="button" variant="outline" disabled={draft.locked || draft.options.length >= 20} onClick={() => update({ options: [...draft.options, ''] })}>{copy.addOption}</Button></div>
      </fieldset>}
      <label className={styles.check}><Checkbox checked={draft.required} onCheckedChange={checked => update({ required: checked })} />{copy.requiredToggle}</label>
      <div className={styles.formActions}><Button type="submit" disabled={busy}>{draft.questionId ? copy.save : copy.add}</Button>{draft.questionId && <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(blank)}>{copy.cancel}</Button>}</div>
    </form>
    {error && <p role="alert" className="open-text">{error}</p>}{success && <p role="status" className={`${operationsStyles.notice} ready-text`}>{success}</p>}
  </CardContent></Card></div></details>
}
