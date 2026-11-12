import { useRef, useState } from 'react'
import { useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { userFacingError } from '@/lib/error-message'
import { driveWizardCopy as copy, spreadsheetCopy } from './copy'
import { duplicateFolders, folderInputProblem, folderSteps, type FolderInputs, type FolderKey } from './logic'
import styles from './TeamSpreadsheets.module.css'

type Problem = { folder: FolderKey; message: string }
const TOTAL = 6
const REVIEW = 5

/** Coach-only, step by step: share the drive, then four folder links, then check access. */
export function ConnectDriveWizard({ serviceAccountEmail, onClose }: { serviceAccountEmail: string | null; onClose: () => void }) {
  const checkAccess = useAction(api.sheetExportActions.checkAccess)
  const [step, setStep] = useState(0)
  const [inputs, setInputs] = useState<FolderInputs>({ general: '', money: '', health: '', events: '' })
  const [touched, setTouched] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<Problem[]>([])
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  // Set when a person came here from the review step to fix or change one link: Continue then goes straight back to the review.
  const [fromReview, setFromReview] = useState(false)
  const heading = useRef<HTMLHeadingElement | null>(null)

  const folder: FolderKey | null = step >= 1 && step <= folderSteps.length ? folderSteps[step - 1] : null
  const duplicate = folder ? duplicateFolders(inputs).includes(folder) : false
  const invalid = folder ? folderInputProblem(inputs[folder]) : false
  const move = (next: number) => { setStep(next); setTouched(false); setError(''); requestAnimationFrame(() => heading.current?.focus()) }
  const edit = (key: FolderKey) => { setFromReview(true); move(folderSteps.indexOf(key) + 1) }
  const copyEmail = async () => {
    if (!serviceAccountEmail) return
    try { await navigator.clipboard.writeText(serviceAccountEmail); setCopied(true) } catch { setCopied(false) }
  }
  const check = async () => {
    setBusy(true); setError(''); setProblems([])
    try {
      const result = await checkAccess({ general: inputs.general, money: inputs.money, health: inputs.health, events: inputs.events })
      if (result.ok) setConnected(true)
      else setProblems(result.problems)
    } catch (caught) { setError(userFacingError(caught, copy.checkFailed)) } finally { setBusy(false) }
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (step === 0) return move(1)
    if (folder) {
      if (invalid || duplicate) return setTouched(true)
      if (fromReview) { setFromReview(false); return move(REVIEW) }
      return move(step + 1)
    }
    if (step === REVIEW) void check()
  }
  const folderCopy = folder ? copy.folders[folder] : null
  const showInvalid = touched && invalid
  const showDuplicate = touched && duplicate
  const describedBy = [folder && 'link-help', showInvalid && 'link-invalid', showDuplicate && 'link-duplicate'].filter(Boolean).join(' ') || undefined
  const primaryLabel = step === REVIEW ? (busy ? copy.checking : copy.checkAccess)
    : fromReview ? copy.backToReview : copy.continue

  return <Card aria-label={copy.title}>
    <CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader>
    <CardContent>
      <form className={styles.root} onSubmit={submit} noValidate>
        <ol className={styles.steps} aria-label={copy.progress(step + 1, TOTAL)}>{Array.from({ length: TOTAL }, (_, index) => <li key={index} data-active={index <= step} aria-current={index === step ? 'step' : undefined} />)}</ol>
        <p className={styles.muted}>{copy.progress(step + 1, TOTAL)}</p>
        {connected ? <>
          <h3 ref={heading} tabIndex={-1}>{copy.connectedTitle}</h3>
          <p role="status" className={styles.status}>{copy.connected}</p>
          <div className={styles.actions}><Button type="button" onClick={onClose}>{copy.done}</Button></div>
        </> : <>
          {step === 0 && <>
            <h3 ref={heading} tabIndex={-1}>{copy.shareTitle}</h3>
            <p>{copy.shareBody}</p>
            {serviceAccountEmail ? <>
              <code className={styles.email}>{serviceAccountEmail}</code>
              <p className={styles.muted}>{copy.addressNote}</p>
              <div className={styles.actions}><Button type="button" variant="outline" onClick={() => void copyEmail()}>{copied ? copy.copied : copy.copyEmail}</Button></div>
            </> : <p role="alert" className={styles.problem}>{copy.noEmail}</p>}
            <p className={styles.muted}>{copy.sharingLine}</p>
          </>}
          {folder && folderCopy && <>
            <h3 ref={heading} tabIndex={-1}>{folderCopy.title}</h3>
            <p>{folderCopy.body}</p>
            <label className={styles.field}>{folderCopy.label}
              <Input type="url" inputMode="url" autoComplete="off" value={inputs[folder]} aria-invalid={showInvalid || showDuplicate} aria-describedby={describedBy} onChange={event => { setInputs({ ...inputs, [folder]: event.target.value }); setTouched(false) }} />
            </label>
            <p id="link-help" className={styles.muted}>{copy.linkHelp}</p>
            {folder === 'health' && <p className={styles.muted}>{spreadsheetCopy.healthReminder}</p>}
            {showInvalid && <p id="link-invalid" role="alert" className={styles.problem}>{copy.invalid}</p>}
            {showDuplicate && <p id="link-duplicate" role="alert" className={styles.problem}>{copy.duplicate}</p>}
          </>}
          {step === REVIEW && <>
            <h3 ref={heading} tabIndex={-1}>{copy.reviewTitle}</h3>
            <p>{copy.reviewBody}</p>
            <p className={styles.muted}>{copy.archiveNote}</p>
            <dl className={styles.review}>{folderSteps.map(key => <div key={key}><dt>{copy.folders[key].title}</dt><dd>{inputs[key].trim() ? copy.linkAdded : copy.notSet}</dd><Button type="button" variant="outline" disabled={busy} onClick={() => edit(key)}>{copy.change}<span className="sr-only"> {copy.folders[key].title}</span></Button></div>)}</dl>
            {problems.length > 0 && <ul className={styles.files} role="alert">{problems.map(problem => <li key={problem.folder} className={styles.file}><strong>{copy.folders[problem.folder].title}</strong><span className={styles.problem}>{problem.message}</span><div className={styles.actions}><Button type="button" variant="outline" onClick={() => edit(problem.folder)}>{copy.fix}</Button></div></li>)}</ul>}
          </>}
          {error && <p role="alert" className={styles.problem}>{error}</p>}
          <div className={styles.nav}>
            <Button type="submit" data-nav="primary" disabled={busy || (step === 0 && !serviceAccountEmail)}>{primaryLabel}</Button>
            {step > 0 && <Button type="button" variant="outline" data-nav="back" disabled={busy} onClick={() => { if (fromReview) setFromReview(false); move(step - 1) }}>{copy.back}</Button>}
            <Button type="button" variant="outline" data-nav="cancel" disabled={busy} onClick={onClose}>{copy.cancel}</Button>
          </div>
        </>}
      </form>
    </CardContent>
  </Card>
}
