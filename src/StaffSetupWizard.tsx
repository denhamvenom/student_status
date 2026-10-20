import { Component, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { adultProfileCopy } from './lib/adult-profile-copy'
import styles from './StaffSetupWizard.module.css'

type Basics = FunctionReturnType<typeof api.adultProfile.ownBasics>
const steps = ['Contact information', 'Shirt and emergency contact', 'Review your information']

function SignOutButton() {
  const { signOut } = useAuthActions()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return <><Button type="button" variant="ghost" disabled={busy} onClick={() => {
    setBusy(true); setFailed(false)
    void signOut().catch(() => { setFailed(true); setBusy(false) })
  }}>{busy ? 'Signing out…' : 'Sign out'}</Button>{failed && <p role="alert">Could not sign out. Please try again.</p>}</>
}

class SetupBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className={styles.page}><main className={styles.card}>
      <h1>Staff profile unavailable</h1><p role="alert">We couldn’t load your information. Please try again.</p>
      <div className={styles.actions}><Button onClick={this.props.retry}>Try again</Button><SignOutButton /></div>
    </main></div> : this.props.children
  }
}

function StaffWizard({ profile, reload, skip }: { profile: Basics; reload: () => void; skip: () => void }) {
  const save = useMutation(api.adultProfile.saveBasics)
  const dismiss = useMutation(api.adultProfile.dismissSetup)
  const [initialRevision] = useState(profile.profileRevision)
  const [name, setName] = useState(profile.name)
  const [phone, setPhone] = useState(profile.phone)
  const [shirtSize, setShirtSize] = useState(profile.shirtSize ?? '')
  const [emergencyName, setEmergencyName] = useState(profile.emergencyName)
  const [emergencyRelationship, setEmergencyRelationship] = useState(profile.emergencyRelationship)
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergencyPhone)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const stale = initialRevision !== profile.profileRevision || conflict
  function move(next: number) {
    setStep(next); setError('')
    requestAnimationFrame(() => heading.current?.focus())
  }
  async function dismissPermanently() {
    if (busy || stale) return
    setBusy(true); setError('')
    try {
      await dismiss({ expectedProfileRevision: initialRevision })
    } catch (cause) {
      if (cause instanceof Error && /revision|changed|conflict|stale/i.test(cause.message)) setConflict(true)
      else setError('Your preference could not be saved. Please try again.')
      setBusy(false)
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || stale) return
    setError('')
    if (step === 0 && (!name.trim() || !phone.trim())) {
      setError('Enter your full name and phone number.'); return
    }
    const size = adultProfileCopy.sizes.find(value => value === shirtSize)
    if (step >= 1 && (!size || !emergencyName.trim() || !emergencyRelationship.trim() || !emergencyPhone.trim())) {
      setError('Choose a shirt size and complete all emergency contact fields.'); return
    }
    if (step < 2) { move(step + 1); return }
    if (!size) return
    setBusy(true)
    try {
      await save({ expectedProfileRevision: initialRevision, name: name.trim(), phone: phone.trim(), shirtSize: size,
        emergencyName: emergencyName.trim(), emergencyRelationship: emergencyRelationship.trim(), emergencyPhone: emergencyPhone.trim() })
      // The reactive completeness query opens the requested page after the save.
    } catch (cause) {
      if (cause instanceof Error && /revision|changed|conflict|stale/i.test(cause.message)) setConflict(true)
      else setError('Your information could not be saved. Please try again.')
      setBusy(false)
    }
  }
  const review = [
    ['Full name', name], ['Phone', phone], ['Shirt size (adult)', shirtSize],
    ['Emergency contact name', emergencyName], ['Relationship', emergencyRelationship], ['Emergency contact phone', emergencyPhone],
  ]
  return <div className={styles.page}><main className={styles.shell}>
    <header className={styles.header}><p className={styles.eyebrow}>TEAM 8044</p><h1>Set up your staff profile</h1>
      <p className={styles.muted}>Please confirm your basic information. This applies to all Coaches and Mentors.</p>
      <p className={styles.muted}>Your answers are saved when you finish. You can update them later in Profile.</p>
    </header>
    <section className={styles.card}>
      <div className={styles.stepHead}><p className={styles.eyebrow}>Step {step + 1} of 3</p>
        <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
        <ol className={styles.progress} aria-label="Staff setup progress">{steps.map((label, index) =>
          <li key={label} data-active={index <= step} aria-current={index === step ? 'step' : undefined} aria-label={`${label}: ${index < step ? 'completed' : index === step ? 'current' : 'upcoming'}`} />)}</ol>
      </div>
      <form onSubmit={event => void submit(event)}>
        <fieldset className={styles.fields} disabled={busy || stale}>
          <legend className={styles.srOnly}>{steps[step]}</legend>
          {step === 0 ? <>
            <label className={styles.field}>Full name<Input required autoComplete="name" maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
            <label className={styles.field}>Phone<Input required type="tel" autoComplete="tel" maxLength={50} value={phone} onChange={event => setPhone(event.target.value)} /></label>
          </> : step === 1 ? <>
            <label className={`${styles.field} ${styles.full}`}>Shirt size (adult)
              <NativeSelect required value={shirtSize} onChange={event => setShirtSize(event.target.value)}>
                <NativeSelectOption value="">Choose a size</NativeSelectOption>
                {adultProfileCopy.sizes.map(size => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <h3 className={styles.full}>Emergency contact</h3>
            <label className={styles.field}>Emergency contact name<Input required maxLength={100} value={emergencyName} onChange={event => setEmergencyName(event.target.value)} /></label>
            <label className={styles.field}>Relationship<Input required maxLength={100} value={emergencyRelationship} onChange={event => setEmergencyRelationship(event.target.value)} /></label>
            <label className={styles.field}>Emergency contact phone<Input required type="tel" maxLength={50} value={emergencyPhone} onChange={event => setEmergencyPhone(event.target.value)} /></label>
          </> : <dl className={styles.review}>{review.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        </fieldset>
        {stale && <div className={styles.notice} role="alert"><p>Your profile changed elsewhere. Reload the saved information before continuing. Unsaved answers will be replaced.</p><Button type="button" variant="outline" onClick={reload}>Reload saved information</Button></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          {step > 0 && <Button type="button" variant="outline" disabled={busy || stale} onClick={() => move(step - 1)}>Back</Button>}
          <span className={styles.spacer} />
          <Button type="submit" disabled={busy || stale}>{busy ? 'Saving…' : step === 2 ? 'Finish setup' : 'Continue'}</Button>
        </div>
        <div className={styles.skip}>
          <p className={styles.muted}>You can skip setup and add your information later in Profile. “Don’t ask me again” turns off future setup reminders.</p>
          <div className={styles.skipActions}><Button type="button" variant="ghost" disabled={busy} onClick={skip}>Skip for now</Button>
            <Button type="button" variant="ghost" disabled={busy || stale} onClick={() => void dismissPermanently()}>Don’t ask me again</Button></div>
        </div>
      </form>
    </section>
    <div className={styles.signOut}><SignOutButton /></div>
  </main></div>
}

function SetupContent({ children, reload, skip, skipped }: { children: ReactNode; reload: () => void; skip: () => void; skipped: boolean }) {
  const profile = useQuery(api.adultProfile.ownBasics, {})
  if (profile === undefined) return <div className={styles.page}><main className={styles.card}><p role="status">Loading your staff profile…</p><SignOutButton /></main></div>
  return profile.needsSetup && !skipped ? <StaffWizard profile={profile} reload={reload} skip={skip} /> : children
}

/** Render only for accepted staff accounts, before mounting any staff routes. */
export function StaffSetupGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  const [skipped, setSkipped] = useState(false)
  const retry = () => setAttempt(value => value + 1)
  return <SetupBoundary key={attempt} retry={retry}><SetupContent reload={retry} skipped={skipped} skip={() => setSkipped(true)}>{children}</SetupContent></SetupBoundary>
}
