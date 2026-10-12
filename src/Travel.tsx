import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'

const eventId = (id: string) => id as Id<'events'>
const driverId = (id: string) => id as Id<'drivers'>
const studentId = (id: string) => id as Id<'students'>
const issue = (error: unknown) => error instanceof Error ? error.message : String(error)

type Driver = { _id: Id<'drivers'>; name: string; email: string; phone: string; vehicleName?: string; seats: number; approved: boolean; towCapable?: boolean; active?: boolean }
const blankDriver = { name: '', email: '', phone: '', vehicleName: '', seats: '0', approved: false, towCapable: false, active: true }

export function DriversPage() {
  const drivers = useQuery(api.travel.listDrivers, {}) as Driver[] | undefined
  const save = useMutation(api.travel.saveDriver)
  const [editing, setEditing] = useState<Id<'drivers'> | null>(null)
  const [form, setForm] = useState(blankDriver)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const edit = (driver?: Driver) => {
    setEditing(driver?._id ?? null)
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
  return <><div className="page-head"><div><p className="eyebrow">Travel operations</p><h1>Drivers</h1><p className="muted lead">Passenger seats exclude the driver. Only active, approved drivers count toward event capacity.</p></div></div>
    <div className="two-col"><section className="card"><div className="card-head"><h2>Current season</h2></div>{!drivers ? <p>Loading drivers…</p> : drivers.length === 0 ? <p>No drivers entered yet.</p> : <div className="simple-list">{drivers.map(driver => <div className="split-line" key={driver._id}><span><strong>{driver.name}</strong><br/><span className="muted">{driver.vehicleName || 'Vehicle unnamed'} · {driver.seats} passenger seats · {driver.towCapable ? 'Tow capable' : 'No tow capability'} · {driver.approved && driver.active !== false ? 'Approved' : 'Unavailable'}</span></span><Button variant="outline" onClick={() => edit(driver)}>Edit</Button></div>)}</div>}</section>
    <section className="card"><div className="card-head"><h2>{editing ? 'Edit driver' : 'Add driver'}</h2></div><form className="form-grid" onSubmit={e => void submit(e)}><label>Driver name<Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={100}/></label><label>Email<Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required/></label><label>Phone<Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required/></label><label>Vehicle name<Input value={form.vehicleName} onChange={e => setForm({ ...form, vehicleName: e.target.value })} placeholder="Van or car description" maxLength={100}/></label><label>Passenger seats, excluding driver<Input type="number" min="0" max="100" step="1" value={form.seats} onChange={e => setForm({ ...form, seats: e.target.value })} required/></label><label className="checkbox-label"><Checkbox checked={form.approved} onCheckedChange={checked => setForm({ ...form, approved: checked })}/> Approved to drive</label><label className="checkbox-label"><Checkbox checked={form.towCapable} onCheckedChange={checked => setForm({ ...form, towCapable: checked })}/> Tow capable</label><label className="checkbox-label"><Checkbox checked={form.active} onCheckedChange={checked => setForm({ ...form, active: checked })}/> Active</label><div className="action-row"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save driver'}</Button>{editing && <Button type="button" variant="outline" onClick={() => edit()}>Cancel</Button>}</div>{error && <p role="alert" className="open-text">{error}</p>}</form></section></div></>
}

export function EventTransport({ id }: { id: string }) {
  const data = useQuery(api.travel.eventTransport, { eventId: eventId(id) })
  const save = useMutation(api.travel.setEventTransport)
  const assign = useMutation(api.travel.assignVehicle)
  const remove = useMutation(api.travel.removeVehicle)
  const setIndependent = useMutation(api.travel.setIndependentTravel)
  const [settings, setSettings] = useState<{ transportEnabled: boolean; busSeats: string; additionalAdults: string; trailerRequired: boolean } | null>(null)
  const [chosen, setChosen] = useState('')
  const [seats, setSeats] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!data) return <section className="card"><p>Loading transportation…</p></section>
  const current = settings ?? { transportEnabled: data.event.transportEnabled, busSeats: String(data.event.busSeats), additionalAdults: String(data.event.additionalAdults), trailerRequired: data.event.trailerRequired }
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(''); try { await action() } catch (err) { setError(issue(err)) } finally { setBusy(false) } }
  const eligible = data.drivers.filter(d => d.approved && d.active !== false && !data.assignments.some(a => a.driverId === d._id))
  const selected = data.drivers.find(d => d._id === chosen)
  return <section className="card"><div className="card-head"><h2>Transportation</h2></div><p className="muted">{data.summary.state === 'notApplicable' ? 'Not applicable' : `${data.summary.seats} passenger seats for ${data.summary.demand} riders (${data.summary.ridingStudents} students, ${data.summary.additionalAdults} additional adults).`}</p>{data.summary.open.map(reason => <p className="open-text" key={reason}>{reason}</p>)}
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void run(async () => { await save({ eventId: eventId(id), transportEnabled: current.transportEnabled, busSeats: Number(current.busSeats), additionalAdults: Number(current.additionalAdults), trailerRequired: current.trailerRequired }); setSettings(null) }) }}><label className="checkbox-label"><Checkbox checked={current.transportEnabled} onCheckedChange={checked => setSettings({ ...current, transportEnabled: checked })}/> Team transportation required</label><label>Bus passenger seats<Input type="number" min="0" max="500" step="1" value={current.busSeats} onChange={e => setSettings({ ...current, busSeats: e.target.value })} required/></label><label>Additional adult passengers<Input type="number" min="0" max="500" step="1" value={current.additionalAdults} onChange={e => setSettings({ ...current, additionalAdults: e.target.value })} required/></label><label className="checkbox-label"><Checkbox checked={current.trailerRequired} onCheckedChange={checked => setSettings({ ...current, trailerRequired: checked })}/> Trailer requires assigned tow driver</label><Button type="submit" disabled={busy || settings === null}>Save transport settings</Button></form>
    <h3>Assigned vehicles</h3>{data.assignments.length ? <div className="simple-list">{data.assignments.map(a => { const driver = data.drivers.find(d => d._id === a.driverId); return <div className="split-line" key={a._id}><span><strong>{driver?.name ?? 'Unavailable driver'}</strong> · {a.seats} passenger seats{!driver?.approved || driver.active === false ? ' · Does not count until approved and active' : ''}</span><Button variant="outline" disabled={busy} onClick={() => void run(() => remove({ eventId: eventId(id), driverId: a.driverId }))}>Remove</Button></div> })}</div> : <p>No vehicles assigned.</p>}
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void run(async () => { await assign({ eventId: eventId(id), driverId: driverId(chosen), seats: Number(seats) }); setChosen(''); setSeats('') }) }}><label>Approved driver<NativeSelect value={chosen} onChange={e => { setChosen(e.target.value); setSeats(String(data.drivers.find(d => d._id === e.target.value)?.seats ?? '')) }} required><NativeSelectOption value="">Choose driver</NativeSelectOption>{eligible.map(d => <NativeSelectOption key={d._id} value={d._id}>{d.name} · {d.vehicleName || 'Vehicle'} · {d.seats} seats</NativeSelectOption>)}</NativeSelect></label><label>Passenger seats for this event<Input type="number" min="0" max={selected?.seats ?? 100} step="1" value={seats} onChange={e => setSeats(e.target.value)} required/></label><Button type="submit" disabled={busy || !chosen}>Assign vehicle</Button></form>
    <h3>Confirmed students</h3>{data.riders.length ? <div className="simple-list">{data.riders.map(rider => <label className="split-line" key={rider.studentId}><span>{rider.name}</span><span className="checkbox-label"><Checkbox checked={rider.independentTravel} disabled={busy} onCheckedChange={checked => void run(() => setIndependent({ eventId: eventId(id), studentId: rider.studentId, independentTravel: checked }))}/> Traveling independently</span></label>)}</div> : <p>No confirmed students.</p>}
    {error && <p role="alert" className="open-text">{error}</p>}</section>
}

export function IndependentTravel({ id, student }: { id: string; student: string }) {
  const data = useQuery(api.travel.ownTravel, { eventId: eventId(id), studentId: studentId(student) })
  const set = useMutation(api.travel.setIndependentTravel)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!data || !data.transportEnabled || !data.eligible) return null
  return <section className="card"><div className="card-head"><h2>Your transportation</h2></div><p>Choose whether this student will ride with the team or travel independently. Team seat demand updates immediately.</p><label className="checkbox-label"><Checkbox checked={data.independentTravel} disabled={busy} onCheckedChange={checked => { setBusy(true); setError(''); void set({ eventId: eventId(id), studentId: studentId(student), independentTravel: checked }).catch(err => setError(issue(err))).finally(() => setBusy(false)) }}/> Traveling independently</label>{error && <p role="alert" className="open-text">{error}</p>}</section>
}
