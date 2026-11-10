import { userFacingError } from '@/lib/error-message'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import type { ConsentProfileV2 } from '../convex/lib/consentSnapshotV2'
import { Input } from './components/ui/input'
import { GradeSelect } from './GradeSelect'
import { ContactsFields, MedicalFields, ReviewSections, WizardField, WizardFrame, contactRows, healthRows, reviewDate, shown, type HealthChosen } from './SetupWizard'
import styles from './ConsentProfileV2Form.module.css'

type Profile = FunctionReturnType<typeof api.permissionsV2.profile>
const blank = (): ConsentProfileV2 => ({ grade: '', dateOfBirth: '', guardian: { name: '', relationship: '', phone: '', email: '' }, emergency: { name: '', relationship: '', phone: '' }, allergies: { state: 'none', entries: [] }, prescriptions: { state: 'none', entries: [] }, insurance: { state: 'unavailable', provider: null, policy: null }, physician: { state: 'unavailable', name: null, phone: null } })
const steps = ['Student details', 'Contacts', 'Health information', 'Review'] as const
const REVIEW = 3

/** `studentName` is the student's preferred name when the caller already has it; the contact questions say "your student" without it. */
export function ConsentProfileV2Form({ studentId, studentName }: { studentId: Id<'students'>; studentName?: string }) {
  const profile = useQuery(api.permissionsV2.profile, { studentId })
  if (!profile) return <p role="status">Loading health and contact information…</p>
  return <ProfileEditor key={`${studentId}:${profile.revision}`} profile={profile} studentName={studentName?.trim() || 'your student'} />
}

function ProfileEditor({ profile, studentName }: { profile: Profile; studentName: string }) {
  const save = useMutation(api.permissionsV2.saveProfile)
  const [value, setValue] = useState<ConsentProfileV2>(() => profile.value ?? blank())
  const [chosen, setChosen] = useState<HealthChosen>(() => ({ allergies: !!profile.value, prescriptions: !!profile.value, insurance: !!profile.value, physician: !!profile.value }))
  const [step, setStep] = useState(profile.completed ? REVIEW : 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const goTo = (next: number) => { setStep(next); setError(''); setSaved(false) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(''); setSaved(false)
    if (step === 2 && !Object.values(chosen).every(Boolean)) { setError('Choose an answer for allergies, medications, insurance, and physician.'); return }
    if (step < REVIEW) { setStep(step + 1); return }
    setBusy(true)
    try { await save({ studentId: profile.studentId, expectedRevision: profile.revision, value }); setSaved(true) }
    catch (cause) { setError(userFacingError(cause, 'The information could not be saved. Review your answers and try again.')) }
    finally { setBusy(false) }
  }
  return <div className={styles.card}>
    <p>Fill this in before you sign the permission form. If you change anything after preparing a form, prepare a new form and check it before you sign. Forms already signed keep their old information.</p>
    {!profile.setupComplete && <p role="status" className={styles.notice}>Your student needs to finish setup (shirt size and room type) before you can review the permission form.</p>}
    {profile.completed && <p role="status" className={styles.ready}>This information is confirmed.</p>}
    <WizardFrame embedded title="Health and contact information" step={step} total={steps.length} steps={steps} intro="Your answers are kept while you move between steps. Nothing is saved until you choose Save and confirm." onBack={() => goTo(step - 1)} busy={busy} submitLabel={step === REVIEW ? 'Save and confirm' : 'Continue'} onSubmit={event => void submit(event)} error={error} saved={false} stale={false} onReload={() => undefined}>
      {step === 0 ? <div className={styles.fields}>
        <WizardField label="Grade"><GradeSelect value={value.grade} original={profile.value?.grade} onChange={grade => setValue(current => ({ ...current, grade }))}/></WizardField>
        <WizardField label="Date of birth"><Input required type="date" value={value.dateOfBirth} onChange={event => setValue(current => ({ ...current, dateOfBirth: event.target.value }))}/></WizardField>
      </div>
      : step === 1 ? <ContactsFields studentName={studentName} value={{ guardian: value.guardian, emergency: value.emergency }} setValue={next => setValue(current => ({ ...current, ...next }))}/>
      : step === 2 ? <MedicalFields value={value} setValue={next => setValue(current => ({ ...current, allergies: next.allergies, prescriptions: next.prescriptions, insurance: next.insurance, physician: next.physician }))} chosen={chosen} setChosen={setChosen}/>
      : <ReviewSections onEdit={goTo} sections={[
        { title: steps[0], step: 0, rows: [['Grade', shown(value.grade)], ['Date of birth', reviewDate(value.dateOfBirth)]] },
        { title: steps[1], step: 1, rows: contactRows({ guardian: value.guardian, emergency: value.emergency }) },
        { title: steps[2], step: 2, rows: healthRows(value) },
      ]}/>}
    </WizardFrame>
    {saved && <p role="status" className={styles.ready}>Confirmed. You can now prepare a permission form for eligible events.</p>}
  </div>
}
