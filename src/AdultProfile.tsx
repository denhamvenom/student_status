import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { adultProfileCopy as copy } from './lib/adult-profile-copy'
import styles from './AdultProfile.module.css'

type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL'
type OwnProfile = {
  name: string; email: string; phone: string; shirtSize: string | null
  emergencyName: string; emergencyRelationship: string; emergencyPhone: string
  role: 'coach' | 'mentor'; travelLead: boolean; profileRevision: number
  driverState: 'owned' | 'none' | 'coachReviewRequired' | 'capacityReview' | 'seasonUnavailable'
  driverFingerprint: string | null; canDrive: boolean; vehicleName: string; passengerSeats: number | null; towCapable: boolean; approved: boolean
}
const sizeOptions: readonly Size[] = copy.sizes
const message = (error: unknown) => error instanceof Error ? error.message : copy.failed

function ProfileForm({ profile, saved, onSaved }: { profile: OwnProfile; saved: string; onSaved: (value: string) => void }) {
  const save = useMutation(api.adultProfile.saveOwn)
  const [name, setName] = useState(profile.name)
  const [phone, setPhone] = useState(profile.phone)
  const [shirtSize, setShirtSize] = useState<Size | null>(sizeOptions.find(size => size === profile.shirtSize) ?? null)
  const [emergencyName, setEmergencyName] = useState(profile.emergencyName)
  const [emergencyRelationship, setEmergencyRelationship] = useState(profile.emergencyRelationship)
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergencyPhone)
  const [canDrive, setCanDrive] = useState(profile.canDrive)
  const [vehicleName, setVehicleName] = useState(profile.vehicleName)
  const [passengerSeats, setPassengerSeats] = useState(profile.passengerSeats?.toString() ?? '')
  const [towCapable, setTowCapable] = useState(profile.towCapable)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const driverBlocked = profile.driverState === 'coachReviewRequired' || profile.driverState === 'capacityReview' || profile.driverState === 'seasonUnavailable'
  const driverNotice = profile.driverState === 'coachReviewRequired' ? copy.coachReview : profile.driverState === 'capacityReview' ? copy.capacityReview : profile.driverState === 'seasonUnavailable' ? copy.seasonUnavailable : null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !shirtSize) return
    setBusy(true); setError(''); onSaved('')
    try {
      const result = await save({ expectedProfileRevision: profile.profileRevision, expectedDriverFingerprint: profile.driverFingerprint, name, phone, shirtSize, emergencyName, emergencyRelationship, emergencyPhone, canDrive: !driverBlocked && canDrive, vehicleName, passengerSeats: passengerSeats.trim() ? Number(passengerSeats) : null, towCapable })
      onSaved(result.driverState === 'coachReviewRequired' ? copy.savedNeedsReview : copy.saved)
    } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  return <form className={styles.page} onSubmit={event => void submit(event)}>
    <header className={styles.heading}><h1>{copy.title}</h1><div className={styles.roles}><span className={styles.role}>{profile.role === 'coach' ? 'Coach' : copy.mentor}</span>{profile.travelLead && <span className={styles.role}>{copy.travelLead}</span>}</div></header>
    {!profile.shirtSize && <p className={styles.setup}>{copy.setup}</p>}
    <section className={styles.section} aria-labelledby="adult-about-title"><h2 id="adult-about-title">{copy.about}</h2>
      <div className={styles.fields}><label className={styles.field}>{copy.name}<Input value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy} /></label><label className={styles.field}>{copy.phone}<Input type="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={50} disabled={busy} /></label></div>
      <p className={styles.muted}>{copy.googleAccount} {profile.email}</p>
      <div><p className={styles.field}>{copy.shirt}</p><div className={styles.sizes} role="group" aria-label={copy.shirt}>{sizeOptions.map(size => <Button key={size} type="button" variant={shirtSize === size ? 'default' : 'outline'} aria-pressed={shirtSize === size} disabled={busy} onClick={() => setShirtSize(size)}>{size}</Button>)}</div></div>
    </section>
    <section className={styles.section} aria-labelledby="adult-driving-title"><h2 id="adult-driving-title">{copy.driving}</h2>
      {driverNotice && <p className={styles.notice}>{driverNotice}</p>}
      <label className={styles.check}><Checkbox checked={!driverBlocked && canDrive} onCheckedChange={setCanDrive} disabled={busy || driverBlocked} />{copy.canDrive}</label>
      {!driverBlocked && canDrive && <><div className={styles.fields}><label className={styles.field}>{copy.vehicle}<Input value={vehicleName} onChange={event => setVehicleName(event.target.value)} maxLength={100} required disabled={busy} /></label><label className={styles.field}>{copy.passengerSeats}<Input type="number" min={1} max={100} step={1} value={passengerSeats} onChange={event => setPassengerSeats(event.target.value)} required disabled={busy} /></label></div><label className={styles.check}><Checkbox checked={towCapable} onCheckedChange={setTowCapable} disabled={busy} />{copy.tow}</label><p className={styles.muted}>{copy.drivingNote}</p>{profile.driverState === 'owned' && !profile.approved && <p className={styles.notice}>{copy.awaitingApproval}</p>}</>}
    </section>
    <section className={styles.section} aria-labelledby="adult-emergency-title"><h2 id="adult-emergency-title">{copy.emergency}</h2><div className={styles.emergencyFields}><label className={styles.field}>{copy.name}<Input value={emergencyName} onChange={event => setEmergencyName(event.target.value)} maxLength={100} disabled={busy} /></label><label className={styles.field}>{copy.relationship}<Input value={emergencyRelationship} onChange={event => setEmergencyRelationship(event.target.value)} maxLength={100} disabled={busy} /></label><label className={styles.field}>{copy.phone}<Input type="tel" value={emergencyPhone} onChange={event => setEmergencyPhone(event.target.value)} maxLength={50} disabled={busy} /></label></div></section>
    <div className={styles.actions}>{error && <p role="alert">{error}</p>}{saved && <p role="status">{saved}</p>}<Button type="submit" disabled={busy || !name.trim() || !shirtSize || (!driverBlocked && canDrive && (!phone.trim() || !vehicleName.trim() || !passengerSeats.trim()))}>{busy ? copy.saving : copy.save}</Button></div>
  </form>
}

/** Own-account staff profile. Root owns route access and shell integration. */
export function AdultProfile() {
  const profile = useQuery(api.adultProfile.own, {})
  const [saved, setSaved] = useState('')
  if (profile === undefined) return <p role="status">{copy.loading}</p>
  return <ProfileForm key={`${profile.profileRevision}:${profile.driverFingerprint ?? 'none'}`} profile={profile} saved={saved} onSaved={setSaved} />
}
