import { Component, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { adultProfileCopy } from './lib/adult-profile-copy'
import { userFacingError } from './lib/error-message'
import styles from './StaffSetupWizard.module.css'
import { normalizeChangedPhone } from '../shared/contact-format'

type Basics = FunctionReturnType<typeof api.adultProfile.ownBasics>
const steps = ['Contact information', 'Shirt and emergency contact', 'Driving', 'Review your information']

function SignOutButton() {
  const { signOut } = useAuthActions()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <><Button type="button" variant="ghost" disabled={busy} onClick={() => {
    setBusy(true); setError('')
    void signOut().catch(cause => { setError(userFacingError(cause, 'Could not sign out. Please try again.')); setBusy(false) })
  }}>{busy ? 'Signing out…' : 'Sign out'}</Button>{error && <p role="alert">{error}</p>}</>
}

class SetupBoundary extends Component<{ children: ReactNode; retry: () => void }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() {
    return this.state.error !== null ? <div className={styles.page}><main className={styles.card}>
      <h1>Staff profile unavailable</h1><p role="alert">{userFacingError(this.state.error, 'We couldn’t load your information. Please try again.', false)}</p>
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
  const [initialDriver] = useState(profile)
  const [drivingEdited, setDrivingEdited] = useState(false)
  const [canDrive, setCanDrive] = useState(profile.canDrive)
  const [vehicleName, setVehicleName] = useState(profile.vehicleName)
  const [passengerSeats, setPassengerSeats] = useState(profile.passengerSeats?.toString() ?? '')
  const [towCapable, setTowCapable] = useState(profile.towCapable)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const driverBlocked = profile.driverState === 'coachReviewRequired' || profile.driverState === 'capacityReview' || profile.driverState === 'seasonUnavailable'
  const driverNotice = profile.driverState === 'coachReviewRequired' ? adultProfileCopy.coachReview : profile.driverState === 'capacityReview' ? adultProfileCopy.capacityReview : profile.driverState === 'seasonUnavailable' ? adultProfileCopy.seasonUnavailable : null
  const stale = initialRevision !== profile.profileRevision || conflict || drivingEdited && initialDriver.driverFingerprint !== profile.driverFingerprint
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
      const message = userFacingError(cause, 'Your preference could not be saved. Please try again.')
      if (/revision|changed|conflict|stale/i.test(message)) setConflict(true)
      else setError(message)
      setBusy(false)
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || stale) return
    setError('')
    try {
      if (step === 0 || step === 3) setPhone(normalizeChangedPhone(phone, profile.phone))
      if (step === 1 || step === 3) setEmergencyPhone(normalizeChangedPhone(emergencyPhone, profile.emergencyPhone, 'Emergency contact phone'))
    } catch (cause) {
      setError(userFacingError(cause, 'Check your phone number.')); return
    }
    const size = adultProfileCopy.sizes.find(value => value === shirtSize) ?? null
    if (step >= 2 && drivingEdited && !driverBlocked && canDrive && (!(phone.trim() || profile.phone.trim()) || !vehicleName.trim() || !Number.isInteger(Number(passengerSeats)) || Number(passengerSeats) < 1 || Number(passengerSeats) > 100)) {
      setError('To offer driving, add your phone, vehicle, and 1–100 passenger seats, or skip this step.'); return
    }
    if (step < 3) { move(step + 1); return }
    setBusy(true)
    try {
      await save({ expectedProfileRevision: initialRevision, name: name.trim(), phone: phone.trim(), shirtSize: size,
        emergencyName: emergencyName.trim(), emergencyRelationship: emergencyRelationship.trim(), emergencyPhone: emergencyPhone.trim(),
        ...(drivingEdited && !driverBlocked ? { driving: { expectedDriverFingerprint: initialDriver.driverFingerprint, canDrive, vehicleName: vehicleName.trim(), passengerSeats: passengerSeats.trim() ? Number(passengerSeats) : null, towCapable: canDrive && towCapable } } : {}) })
      // The reactive completeness query opens the requested page after the save.
    } catch (cause) {
      const message = userFacingError(cause, 'Your information could not be saved. Please try again.')
      if (/revision|changed|conflict|stale/i.test(message)) setConflict(true)
      else setError(message)
      setBusy(false)
    }
  }
  const review = [
    ['Full name', name], ['Phone', phone], ['Shirt size (adult)', shirtSize],
    ['Emergency contact name', emergencyName], ['Relationship', emergencyRelationship], ['Emergency contact phone', emergencyPhone],
    ['Driving', drivingEdited && !driverBlocked ? canDrive ? 'Available to drive students' : 'Not available to drive students' : 'No changes to saved driving information'],
    ...(drivingEdited && !driverBlocked && canDrive ? [['Vehicle', vehicleName], ['Passenger seats', passengerSeats], ['Can pull team trailer', towCapable ? 'Yes' : 'No']] : []),
  ]
  return <div className={styles.page}><main className={styles.shell}>
    <header className={styles.header}><p className={styles.eyebrow}>TEAM 8044</p><h1>Set up your staff profile</h1>
      <p className={styles.muted}>Please confirm your basic information. This applies to all Coaches and Mentors.</p>
      <p className={styles.muted}>Every item is optional. Leave anything blank and continue. Finishing saves your answers; skipped items keep any previously saved information. You can update details later in Profile.</p>
    </header>
    <section className={styles.card}>
      <div className={styles.stepHead}><p className={styles.eyebrow}>Step {step + 1} of {steps.length}</p>
        <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
        <ol className={styles.progress} aria-label="Staff setup progress">{steps.map((label, index) =>
          <li key={label} data-active={index <= step} aria-current={index === step ? 'step' : undefined} aria-label={`${label}: ${index < step ? 'completed' : index === step ? 'current' : 'upcoming'}`} />)}</ol>
      </div>
      <form onSubmit={event => void submit(event)}>
        <fieldset className={styles.fields} disabled={busy || stale}>
          <legend className={styles.srOnly}>{steps[step]}</legend>
          {step === 0 ? <>
            <label className={styles.field}>Full name<Input autoComplete="name" maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
            <label className={styles.field}>Phone<Input type="tel" autoComplete="tel" maxLength={50} value={phone} onChange={event => setPhone(event.target.value)} /></label>
          </> : step === 1 ? <>
            <label className={`${styles.field} ${styles.full}`}>Shirt size (adult)
              <NativeSelect value={shirtSize} onChange={event => setShirtSize(event.target.value)}>
                <NativeSelectOption value="">Skip / prefer not to answer</NativeSelectOption>
                {adultProfileCopy.sizes.map(size => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <h3 className={styles.full}>Emergency contact</h3>
            <label className={styles.field}>Emergency contact name<Input maxLength={100} value={emergencyName} onChange={event => setEmergencyName(event.target.value)} /></label>
            <label className={styles.field}>Relationship<Input maxLength={100} value={emergencyRelationship} onChange={event => setEmergencyRelationship(event.target.value)} /></label>
            <label className={styles.field}>Emergency contact phone<Input type="tel" maxLength={50} value={emergencyPhone} onChange={event => setEmergencyPhone(event.target.value)} /></label>
          </> : step === 2 ? <>
            <p className={`${styles.muted} ${styles.full}`}>Driving is optional. Continue without changes or skip this step to keep your saved driving information.</p>
            {driverNotice && <p className={`${styles.notice} ${styles.full}`}>{driverNotice}</p>}
            <label className={`${styles.check} ${styles.full}`}><Checkbox checked={!driverBlocked && canDrive} disabled={driverBlocked} onCheckedChange={value => { setCanDrive(value); setDrivingEdited(true) }} />{adultProfileCopy.canDrive}</label>
            {!driverBlocked && canDrive && <>
              {!(phone.trim() || profile.phone.trim()) && <div className={styles.full}><p className={styles.muted}>Add a phone number in Contact information so the team can reach you when driving.</p><Button type="button" variant="outline" onClick={() => move(0)}>Add contact phone</Button></div>}
              <label className={styles.field}>{adultProfileCopy.vehicle}<Input maxLength={100} value={vehicleName} onChange={event => { setVehicleName(event.target.value); setDrivingEdited(true) }} /></label>
              <label className={styles.field}>{adultProfileCopy.passengerSeats}<Input type="number" min={1} max={100} step={1} value={passengerSeats} onChange={event => { setPassengerSeats(event.target.value); setDrivingEdited(true) }} /></label>
              <label className={`${styles.check} ${styles.full}`}><Checkbox checked={towCapable} onCheckedChange={value => { setTowCapable(value); setDrivingEdited(true) }} />I can pull the team trailer</label>
            </>}
            <div className={styles.full}><Button type="button" variant="outline" onClick={() => {
              setCanDrive(initialDriver.canDrive); setVehicleName(initialDriver.vehicleName); setPassengerSeats(initialDriver.passengerSeats?.toString() ?? ''); setTowCapable(initialDriver.towCapable); setDrivingEdited(false); move(3)
            }}>Skip driving step</Button></div>
          </> : <dl className={styles.review}>{review.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.trim() || 'Skipped'}</dd></div>)}</dl>}
        </fieldset>
        {stale && <div className={styles.notice} role="alert"><p>Your profile changed elsewhere. Reload the saved information before continuing. Unsaved answers will be replaced.</p><Button type="button" variant="outline" onClick={reload}>Reload saved information</Button></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          {step > 0 && <Button type="button" variant="outline" disabled={busy || stale} onClick={() => move(step - 1)}>Back</Button>}
          <span className={styles.spacer} />
          <Button type="submit" disabled={busy || stale}>{busy ? 'Saving…' : step === 3 ? 'Finish setup' : 'Continue'}</Button>
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
