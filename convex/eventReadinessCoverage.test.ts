/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { createTest } from '../testUtils'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function fixture() {
  const t = createTest(schema, modules)
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert('users', { email: 'coach@example.org', name: 'Coach' })
    const coach = await ctx.db.insert('appUsers', { authUserId: auth, email: 'coach@example.org', name: 'Coach', role: 'coach', travelLead: false, financialEdit: true, active: true })
    const season = await ctx.db.insert('seasons', { name: 'Synthetic season', year: 2026, status: 'active', startsAt: 0, permissionVersion: 'DRAFT', createdBy: coach })
    const student = await ctx.db.insert('students', { seasonId: season, legalName: 'Synthetic Student', preferredName: 'Student', email: 'student@example.org', subteam: 'Mechanical', active: true, travelTeam: false, roomCategory: 'Boys', roomCategoryLocked: true, allergies: { state: 'none' }, medications: { state: 'none' } })
    const event = await ctx.db.insert('events', { seasonId: season, name: 'Regional', type: 'Competition', startsAt: 1000, endsAt: 2000, destination: 'City', travel: 'Families provide transportation', overnight: true, roomingEnabled: true, feeCents: 0, signupMode: 'open', allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false })
    return { auth, coach, student, event }
  })
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) }
}

describe('event readiness coverage', () => {
  it('marks participant sentinel overflow incomplete without reporting ready transportation', async () => {
    const f = await fixture()
    await f.t.run(async ctx => { for (let n = 0; n < 501; n++) await ctx.db.insert('participants', { eventId: f.ids.event, studentId: f.ids.student, status: 'withdrawn', createdAt: n, updatedAt: n }) })
    const result = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(result.coverage?.participantsComplete).toBe(false)
    expect(result.transportation).toBeNull()
    expect(result.overall).toBe('open')
  })

  it('marks room-group sentinel overflow incomplete and does not report ready rooming', async () => {
    const f = await fixture()
    await f.t.run(async ctx => { for (let n = 0; n < 101; n++) await ctx.db.insert('roomGroups', { eventId: f.ids.event, category: 'Boys', name: `Room ${n}`, finalized: true, adultFifthException: false, needsReview: false, createdBy: f.ids.coach }) })
    const result = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(result.coverage?.roomingComplete).toBe(false)
    expect(result.rooming?.state).toBe('open')
    expect(result.overall).toBe('open')
  })
})

const plainMeeting = { type: 'Team' as const, startsAt: 3000, endsAt: 4000, destination: 'Shop', travel: 'None', overnight: false, roomingEnabled: false, feeCents: 0, signupMode: 'open' as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false }

describe('event readiness list and columns', () => {
  it('lists only events with something to complete', async () => {
    const f = await fixture()
    const season = (await f.t.run(ctx => ctx.db.get(f.ids.student)))!.seasonId
    await f.t.run(async ctx => {
      await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: 'Plain meeting' })
      await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: 'Canceled trip', feeCents: 5000, cancelled: true })
      await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: 'Fee event', feeCents: 5000 })
      await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: 'Form event', permissionRequired: true })
      await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: 'Bus event', transportEnabled: true })
    })
    const names = async () => ((await f.coach.query(api.app.readinessEvents, { asOf: 0 })) as { name: string }[]).map(e => e.name).sort()
    // While signing is paused the page still counts an unsigned form against readiness, so a form-only event stays listed to match it.
    expect(await names()).toEqual(['Bus event', 'Fee event', 'Form event', 'Regional'])
    await f.t.run(async ctx => { await ctx.db.patch((await ctx.db.get(f.ids.student))!.seasonId, { permissionSigningPaused: false }) })
    expect(await names()).toEqual(['Bus event', 'Fee event', 'Form event', 'Regional'])
    const listed = (await f.coach.query(api.app.readinessEvents, { asOf: 5000 })) as { name: string; isPast: boolean }[]
    expect(listed.every(e => e.isPast)).toBe(true)
  })

  it('lists a free event once a student owes an event charge, matching its page', async () => {
    const f = await fixture()
    const season = (await f.t.run(ctx => ctx.db.get(f.ids.student)))!.seasonId
    const event = await f.t.run(async ctx => {
      await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: 'Free but charged', startsAt: 5000, endsAt: 6000 })
      return (await ctx.db.query('events').collect()).find(e => e.name === 'Free but charged')!._id
    })
    const names = async () => ((await f.coach.query(api.app.readinessEvents, { asOf: 0 })) as { name: string; requirements: string[] }[]).filter(e => e.name === 'Free but charged')
    expect(await names()).toEqual([])
    await f.t.run(ctx => ctx.db.insert('charges', { studentId: f.ids.student, eventId: event, label: 'Extra', amountCents: 2500, appliedCents: 0, priority: 1, createdBy: f.ids.coach, createdAt: 1 }))
    expect((await names())[0]?.requirements).toEqual(['Payment'])
    await f.t.run(async ctx => { const c = (await ctx.db.query('charges').collect())[0]; await ctx.db.patch(c._id, { appliedCents: 2500 }) })
    expect(await names()).toEqual([])
  })

  it('keeps the newest 100 events when a season has more, and returns them oldest first', async () => {
    const f = await fixture()
    const season = (await f.t.run(ctx => ctx.db.get(f.ids.student)))!.seasonId
    await f.t.run(async ctx => {
      for (let n = 0; n < 100; n++) await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: `Old ${n}`, feeCents: 100, startsAt: 10 + n, endsAt: 20 + n })
      await ctx.db.insert('events', { ...plainMeeting, seasonId: season, name: 'Newest trip', feeCents: 100, startsAt: 90_000, endsAt: 91_000 })
    })
    const listed = (await f.coach.query(api.app.readinessEvents, { asOf: 50_000 })) as { name: string; startsAt: number }[]
    expect(listed).toHaveLength(100)
    expect(listed.at(-1)?.name).toBe('Newest trip')
    expect(listed.map(e => e.startsAt)).toEqual([...listed.map(e => e.startsAt)].sort((a, b) => a - b))
  })

  it('hides the permission column while signing is closed but still counts an unsigned form as not ready', async () => {
    const f = await fixture()
    const student = (await f.t.run(ctx => ctx.db.get(f.ids.student)))!
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { permissionRequired: true, feeCents: 0 })
      await ctx.db.insert('participants', { eventId: f.ids.event, studentId: f.ids.student, status: 'confirmed', createdAt: 1, updatedAt: 1 })
    })
    const closed = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect((closed.columns as { key: string }[]).some(c => c.key === 'permission')).toBe(false)
    expect(closed.students[0].state).toBe('open')
    expect(closed.counts?.ready).toBe(0)
    expect(closed.counts?.open).toBe(1)
    expect(closed.permissionFormsClosed).toBe(true)
    expect(closed.studentsAwaitingForms).toBe(1)
    await f.t.run(ctx => ctx.db.patch(student.seasonId, { permissionSigningPaused: false }))
    const open = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(open.permissionFormsClosed).toBe(false)
    expect((open.columns as { key: string }[]).some(c => c.key === 'permission')).toBe(true)
  })

  it('omits the permission status from rows while signing is closed', async () => {
    const f = await fixture()
    const student = (await f.t.run(ctx => ctx.db.get(f.ids.student)))!
    await f.t.run(ctx => ctx.db.insert('participants', { eventId: f.ids.event, studentId: f.ids.student, status: 'confirmed', createdAt: 1, updatedAt: 1 }))
    const closed = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(closed.students[0]).not.toHaveProperty('permissionStatus')
    expect(closed.students[0]).not.toHaveProperty('hiddenPermissionOpen')
    await f.t.run(ctx => ctx.db.patch(student.seasonId, { permissionSigningPaused: false }))
    const open = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(open.students[0]).toHaveProperty('permissionStatus')
  })

  it('shows only applicable columns, says what is missing, and counts the rows shown', async () => {
    const f = await fixture()
    const season = (await f.t.run(ctx => ctx.db.get(f.ids.student)))!.seasonId
    const second = await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { overnight: false, roomingEnabled: false })
      const other = await ctx.db.insert('students', { seasonId: season, legalName: 'Second Student', preferredName: 'Second', email: 'second@example.org', subteam: 'Mechanical', active: true, travelTeam: false, roomCategory: 'Boys', roomCategoryLocked: true, allergies: { state: 'none' }, medications: { state: 'none' } })
      for (const studentId of [f.ids.student, other]) await ctx.db.insert('participants', { eventId: f.ids.event, studentId, status: 'confirmed', createdAt: 1, updatedAt: 1 })
      await ctx.db.insert('requirements', { eventId: f.ids.event, key: 'waiver', label: 'Team waiver' })
      await ctx.db.insert('requirementCompletions', { eventId: f.ids.event, studentId: other, key: 'waiver', completedBy: f.ids.coach, completedAt: 1 })
      return other
    })
    const result = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    const labels = (result.columns as { label: string }[]).map(c => c.label)
    expect(labels).toContain('FIRST registration')
    expect(labels).toContain('Team waiver')
    expect(labels).not.toContain('Room choice')
    expect(labels).not.toContain('Permission form')
    expect(labels).not.toContain('Payment')
    expect(JSON.stringify(result)).not.toContain('canceled')
    const row = (id: string) => (result.students as { student: { _id: string }; state: string; cells: { key: string; state: string; text: string }[] }[]).find(r => r.student._id === id)!
    expect(row(f.ids.student).cells.find(c => c.key === 'custom:waiver')).toMatchObject({ state: 'open', text: 'Not done' })
    expect(row(second).cells.find(c => c.key === 'custom:waiver')).toMatchObject({ state: 'done', text: 'Done' })
    expect(row(f.ids.student).cells.find(c => c.key === 'first')?.text).toBe('Not finished')
    // Every count comes from the rows shown. Both students have FIRST registration open, so neither is ready.
    const rows = result.students as { state: string; cells: { state: string }[] }[]
    expect(result.counts).toEqual({ students: rows.length, ready: 0, open: rows.length, openItems: rows.reduce((sum, r) => sum + r.cells.filter(c => c.state === 'open').length, 0) })
    expect(rows).toHaveLength(2)
  })

  // November 10 owner decision (reverses November 9): shifts below the event minimum keep a student from being ready.
  it('counts shifts below the minimum as open and shows N of M minimum', async () => {
    const f = await fixture()
    const shift = await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { type: 'Outreach', overnight: false, roomingEnabled: false, shiftsEnabled: true, minShiftsPerStudent: 1, firstRequired: false, feeCents: 0, permissionRequired: false })
      await ctx.db.insert('participants', { eventId: f.ids.event, studentId: f.ids.student, status: 'confirmed', createdAt: 1, updatedAt: 1 })
      const first = await ctx.db.insert('eventShifts', { eventId: f.ids.event, startsAt: 1000, endsAt: 1200 })
      for (const startsAt of [1200, 1400]) await ctx.db.insert('eventShifts', { eventId: f.ids.event, startsAt, endsAt: startsAt + 200 })
      return first
    })
    type Row = { cells: { key: string; state: string; text: string }[]; open: string[]; state: string }
    const shiftsCell = (result: { students: unknown }) => (result.students as Row[])[0].cells.find(c => c.key === 'shifts')
    const before = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(before.columns).toContainEqual({ key: 'shifts', label: 'Shifts' })
    expect(before.shifts).toEqual({ minimum: 1, total: 3 })
    expect(shiftsCell(before)).toEqual({ key: 'shifts', state: 'open', text: '0 of 1 minimum' })
    expect((before.students as Row[])[0].open).toContain('Shifts')
    const listed = (await f.coach.query(api.app.readinessEvents, { asOf: 0 })) as { name: string; requirements: string[] }[]
    expect(listed.find(e => e.name === 'Regional')?.requirements).toContain('Shifts')
    await f.t.run(ctx => ctx.db.insert('shiftSignups', { eventId: f.ids.event, shiftId: shift, studentId: f.ids.student, createdAt: 1 }))
    const after = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(shiftsCell(after)).toEqual({ key: 'shifts', state: 'done', text: '1 of 1 minimum' })
    expect((after.students as Row[])[0].open).not.toContain('Shifts')
  })

  it('never makes a column, open item or listed event of a Something to know requirement', async () => {
    const f = await fixture()
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { type: 'Team', overnight: false, roomingEnabled: false })
      await ctx.db.insert('participants', { eventId: f.ids.event, studentId: f.ids.student, status: 'confirmed', createdAt: 1, updatedAt: 1 })
      await ctx.db.insert('requirements', { eventId: f.ids.event, key: 'shirt', label: 'Wear team shirt', kind: 'info' })
      await ctx.db.insert('requirements', { eventId: f.ids.event, key: 'waiver', label: 'Team waiver', kind: 'checkoff' })
    })
    const result = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    const labels = (result.columns as { label: string }[]).map(c => c.label)
    expect(labels).toContain('Team waiver')
    expect(labels).not.toContain('Wear team shirt')
    expect(JSON.stringify(result.students)).not.toContain('Wear team shirt')
    expect(result.notes).toEqual([{ key: 'shirt', label: 'Wear team shirt', instructions: null, url: null }])
    // With only a note left the event has nothing to complete, so Event readiness does not list it.
    await f.t.run(async ctx => { const waiver = (await ctx.db.query('requirements').collect()).find(r => r.key === 'waiver')!; await ctx.db.delete(waiver._id) })
    expect(((await f.coach.query(api.app.readinessEvents, { asOf: 0 })) as { name: string }[]).map(e => e.name)).not.toContain('Regional')
  })

  it('says Signed · needs review when a parent signed but a Coach has not accepted, and keeps the student open', async () => {
    const f = await fixture()
    const season = (await f.t.run(ctx => ctx.db.get(f.ids.student)))!.seasonId
    await f.t.run(async ctx => {
      await ctx.db.patch(season, { permissionSigningPaused: false })
      await ctx.db.patch(f.ids.event, { permissionRequired: true, overnight: false, roomingEnabled: false })
      await ctx.db.insert('participants', { eventId: f.ids.event, studentId: f.ids.student, status: 'confirmed', createdAt: 1, updatedAt: 1 })
    })
    type Row = { cells: { key: string; state: string; text: string }[]; state: string }
    const cell = async () => ((await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })).students as Row[])[0].cells.find(c => c.key === 'permission')
    expect(await cell()).toMatchObject({ state: 'open', text: 'Not signed yet' })
    await f.t.run(ctx => ctx.db.insert('permissionCoverage', { seasonId: season, studentId: f.ids.student, eventId: f.ids.event, state: 'pending', revision: 1, updatedAt: 1, updatedBy: f.ids.coach }))
    expect(await cell()).toMatchObject({ state: 'open', text: 'Signed · needs review' })
  })
})
