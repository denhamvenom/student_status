import { transportationOptions } from '../convex/lib/transportation'
import { userFacingError } from '@/lib/error-message'
import { operationsCopy, operationsText } from './lib/operations-copy'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import styles from './features/operations/Operations.module.css'

const eventId = (id: string) => id as Id<'events'>
const driverId = (id: string) => id as Id<'drivers'>
const studentId = (id: string) => id as Id<'students'>
const issue = (error: unknown) => userFacingError(error)

type Driver = { _id: Id<'drivers'>; name: string; email: string; phone: string; vehicleName?: string; seats: number; approved: boolean; towCapable?: boolean; active?: boolean }
const blankDriver = { name: '', email: '', phone: '', vehicleName: '', seats: '0', approved: false, towCapable: false, active: true }

export function DriversPage() {
  const drivers = useQuery(api.travel.listDrivers, {}) as Driver[] | undefined
  const save = useMutation(api.travel.saveDriver)
  const [editing, setEditing] = useState<Id<'drivers'> | null>(null)
  const [form, setForm] = useState(blankDriver)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const edit = (driver?: Driver) => {
    setEditing(driver?._id ?? null)
    setFormOpen(Boolean(driver))
    setForm(driver ? { name: driver.name, email: driver.email, phone: driver.phone, vehicleName: driver.vehicleName ?? '', seats: String(driver.seats), approved: driver.approved, towCapable: driver.towCapable ?? false, active: driver.active !== false } : blankDriver)
    setError('')
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      await save({ ...(editing ? { driverId: editing } : {}), name: form.name, email: form.email, phone: form.phone, vehicleName: form.vehicleName, seats: Number(form.seats), approved: form.approved, towCapable: form.towCapable, active: form.active })
      edit()
    } catch (err) { setError(issue(err)) } finally { setBusy(false) }
  }
  return <div className={styles.root}><div className="page-head"><div><p className="eyebrow">{operationsCopy.travel.travelOperations}</p><h1>{operationsCopy.travel.drivers}</h1><p className="muted lead">{operationsCopy.travel.passengerSeatsExcludeTheDriverOnlyActiveApprovedDriversCountTowardEventCapacity}</p></div><Button type="button" onClick={() => { edit(); setFormOpen(true) }}>{operationsCopy.travel.addDriver}</Button></div>
    <section className="card"><div className="card-head"><h2>{operationsCopy.travel.currentSeason}</h2></div>{!drivers ? <p>{operationsCopy.travel.loadingDrivers}</p> : drivers.length === 0 ? <p>{operationsCopy.travel.noDriversEnteredYet}</p> : <div className={styles.driverGrid}>{drivers.map(driver => <article className={styles.driverCard} key={driver._id}><div className={styles.driverTop}><div><strong>{driver.name}</strong><p className="muted">{driver.phone} · {driver.email}</p></div><span className={`${styles.status} ${driver.approved && driver.active !== false ? styles.statusReady : styles.statusOpen}`}>{driver.approved && driver.active !== false ? operationsCopy.travel.approved : operationsCopy.travel.unavailable}</span></div><dl className={styles.driverDetails}><div><dt>{operationsCopy.travel.vehicle}</dt><dd>{driver.vehicleName || operationsCopy.travel.vehicleUnnamed}</dd></div><div><dt>{operationsCopy.travel.passengerSeats}</dt><dd>{driver.seats}</dd></div><div><dt>{operationsCopy.travel.trailer}</dt><dd>{driver.towCapable ? operationsCopy.travel.canTow : operationsCopy.travel.cannotTow}</dd></div></dl><Button variant="outline" onClick={() => edit(driver)}>{operationsCopy.travel.edit}</Button></article>)}</div>}</section>
    {formOpen && <section className="card" aria-label={editing ? operationsCopy.travel.editDriver : operationsCopy.travel.addDriver}><div className="card-head"><h2>{editing ? operationsCopy.travel.editDriver : operationsCopy.travel.addDriver}</h2></div><form className="form-grid" onSubmit={e => void submit(e)}><label>{operationsCopy.travel.driverName}<Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={100}/></label><label>{operationsCopy.travel.email}<Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required/></label><label>{operationsCopy.travel.phone}<Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required/></label><label>{operationsCopy.travel.vehicleName}<Input value={form.vehicleName} onChange={e => setForm({ ...form, vehicleName: e.target.value })} placeholder={operationsCopy.travel.vanOrCarDescription} maxLength={100}/></label><label>{operationsCopy.travel.passengerSeatsExcludingDriver}<Input type="number" min="0" max="100" step="1" value={form.seats} onChange={e => setForm({ ...form, seats: e.target.value })} required/></label><label className="checkbox-label"><Checkbox checked={form.approved} onCheckedChange={checked => setForm({ ...form, approved: checked })}/> {operationsCopy.travel.approvedToDrive}</label><label className="checkbox-label"><Checkbox checked={form.towCapable} onCheckedChange={checked => setForm({ ...form, towCapable: checked })}/> {operationsCopy.travel.towCapable}</label><label className="checkbox-label"><Checkbox checked={form.active} onCheckedChange={checked => setForm({ ...form, active: checked })}/> {operationsCopy.travel.activeLabel}</label><div className="action-row"><Button type="submit" disabled={busy}>{busy ? operationsCopy.travel.saving : operationsCopy.travel.saveDriver}</Button><Button type="button" variant="outline" onClick={() => edit()}>{operationsCopy.travel.cancel}</Button></div>{error && <p role="alert" className="open-text">{error}</p>}</form></section>}</div>
}

export function EventTransport({ id, coach=false }: { id: string; coach?:boolean }) {
  const data = useQuery(api.travel.eventTransport, { eventId: eventId(id) })
  const save = useMutation(api.travel.setEventTransport)
  const assign = useMutation(api.travel.assignVehicle)
  const remove = useMutation(api.travel.removeVehicle)
  const setIndependent = useMutation(api.travel.setIndependentTravel)
  const [settings, setSettings] = useState<{ travel: string; transportEnabled: boolean; busSeats: string; additionalAdults: string; trailerRequired: boolean } | null>(null)
  const [chosen, setChosen] = useState('')
  const [seats, setSeats] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!data) return <section className="card"><p>{operationsCopy.travel.loadingTransportation}</p></section>
  const current = settings ?? { travel: data.event.travel, transportEnabled: data.event.transportEnabled, busSeats: String(data.event.busSeats), additionalAdults: String(data.event.additionalAdults), trailerRequired: data.event.trailerRequired }
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(''); try { await action() } catch (err) { setError(issue(err)) } finally { setBusy(false) } }
  const eligible = data.drivers.filter(d => d.approved && d.active !== false && !data.assignments.some(a => a.driverId === d._id))
  const selected = data.drivers.find(d => d._id === chosen)
  return <section className={`${styles.root} card`}><div className="card-head"><h2>{operationsCopy.travel.transportation}</h2></div><p className={styles.summary}>{data.summary.state === 'notApplicable' ? operationsCopy.travel.notApplicable : operationsText.travel.capacity(data.summary.seats, data.summary.demand, data.summary.ridingStudents, data.summary.additionalAdults)}</p>{data.summary.open.map(reason => <p className="open-text" key={reason}>{reason}</p>)}
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void run(async () => { await save({ eventId: eventId(id), ...(transportationOptions.includes(current.travel as typeof transportationOptions[number]) ? { travel: current.travel as typeof transportationOptions[number] } : {}), transportEnabled: current.transportEnabled, busSeats: Number(current.busSeats), additionalAdults: Number(current.additionalAdults), trailerRequired: current.trailerRequired }); setSettings(null) }) }}><label>Transportation<NativeSelect value={current.travel} onChange={e => setSettings({ ...current, travel: e.target.value, transportEnabled: e.target.value !== 'Provide your Own' })}>{!transportationOptions.includes(current.travel as typeof transportationOptions[number]) && <NativeSelectOption value={current.travel}>{current.travel} (current)</NativeSelectOption>}{transportationOptions.map(option => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}</NativeSelect></label>{current.transportEnabled && <><label>{operationsCopy.travel.busPassengerSeats}<Input type="number" min="0" max="500" step="1" value={current.busSeats} onChange={e => setSettings({ ...current, busSeats: e.target.value })} required/></label><label>{operationsCopy.travel.additionalAdultPassengers}<Input type="number" min="0" max="500" step="1" value={current.additionalAdults} onChange={e => setSettings({ ...current, additionalAdults: e.target.value })} required/></label><label className="checkbox-label"><Checkbox checked={current.trailerRequired} onCheckedChange={checked => setSettings({ ...current, trailerRequired: checked })}/> {operationsCopy.travel.trailerRequiresTow}</label></>}<Button type="submit" disabled={busy || settings === null}>{operationsCopy.travel.saveTransportSettings}</Button></form>
    {!current.transportEnabled && <p>Families arrange their own transportation. The app does not manage drivers or student rides for this event.</p>}
    {data.event.transportEnabled && current.transportEnabled && <><h3>{operationsCopy.travel.assignedVehicles}</h3>{data.assignments.length ? <div className="simple-list">{data.assignments.map(a => { const driver = data.drivers.find(d => d._id === a.driverId); return <div className="split-line" key={a._id}><span><strong>{driver?.name ?? operationsCopy.travel.unavailableDriver}</strong> · {operationsText.travel.seats(a.seats)}{!driver?.approved || driver.active === false ? operationsCopy.travel.unapprovedVehicleNotice : ''}</span><Button variant="outline" disabled={busy} onClick={() => void run(() => remove({ eventId: eventId(id), driverId: a.driverId }))}>{operationsCopy.travel.remove}</Button></div> })}</div> : <p>{operationsCopy.travel.noVehiclesAssigned}</p>}
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void run(async () => { await assign({ eventId: eventId(id), driverId: driverId(chosen), seats: Number(seats) }); setChosen(''); setSeats('') }) }}><label>{operationsCopy.travel.approvedDriver}<NativeSelect value={chosen} onChange={e => { setChosen(e.target.value); setSeats(String(data.drivers.find(d => d._id === e.target.value)?.seats ?? '')) }} required><NativeSelectOption value="">{operationsCopy.travel.chooseDriver}</NativeSelectOption>{eligible.map(d => <NativeSelectOption key={d._id} value={d._id}>{d.name} · {d.vehicleName || operationsCopy.travel.vehicleDefault} · {d.seats}{operationsCopy.travel.vehicleSeats}</NativeSelectOption>)}</NativeSelect></label><label>{operationsCopy.travel.passengerSeatsForThisEvent}<Input type="number" min="0" max={selected?.seats ?? 100} step="1" value={seats} onChange={e => setSeats(e.target.value)} required/></label><Button type="submit" disabled={busy || !chosen}>{operationsCopy.travel.assignVehicle}</Button></form>
    <h3>{operationsCopy.travel.confirmedStudents}</h3>{data.riders.length ? <div className="simple-list">{data.riders.map(rider => <div className="split-line" key={rider.studentId}><span>{rider.name}</span>{coach?<label className="checkbox-label"><Checkbox checked={rider.independentTravel} disabled={busy} onCheckedChange={checked => void run(() => setIndependent({ eventId: eventId(id), studentId: rider.studentId, independentTravel: checked }))}/> {operationsCopy.travel.travelingIndependently}</label>:<span>{rider.independentTravel?'Traveling independently':'Riding with the team'}</span>}</div>)}</div> : <p>{operationsCopy.travel.noConfirmedStudents}</p>}
    </>}{error && <p role="alert" className="open-text">{error}</p>}</section>
}

export function IndependentTravel({ id, student, ownProfile=false }: { id: string; student: string; ownProfile?:boolean }) {
  const data = useQuery(api.travel.ownTravel, { eventId: eventId(id), studentId: studentId(student) })
  const set = useMutation(api.travel.setIndependentTravel)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  if (!data || !data.transportEnabled || !data.eligible) return null
  return <section className={`${styles.root} card`}><div className="card-head"><h2>{ownProfile?'How are you getting there?':operationsCopy.travel.yourTransportation}</h2></div>{ownProfile?<p role="status">{data.independentTravel?'Traveling on your own (set by your parent or Coach).':'Your parent or Coach sets this if you will travel on your own.'}</p>:<><label className="checkbox-label"><Checkbox checked={data.independentTravel} disabled={busy} onCheckedChange={checked => { setBusy(true); setError(''); setSaved(false); void set({ eventId: eventId(id), studentId: studentId(student), independentTravel: checked }).then(()=>setSaved(true)).catch(err => setError(issue(err))).finally(() => setBusy(false)) }}/> My student will travel on their own (not with the team).</label>{saved&&<p role="status" className="ready-text">Saved</p>}</>}{error && <p role="alert" className="open-text">{error}</p>}</section>
}
